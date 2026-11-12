-- cost_03_completeness.sql -- cost per tin only for dates where ALL data is complete.
-- Adds: cost.no_expense (explicit "nothing to enter today" marks), per-category complete-through dates,
-- the common cut-off, and cost_api.dash2 / no_expense_save / no_expense_list.

create table if not exists cost.no_expense (
  entry_date date not null,
  category   text not null check (category in ('repair','safety','consumable','fuel')),
  marked_by  uuid,
  marked_at  timestamptz not null default now(),
  primary key (entry_date, category)
);
alter table cost.no_expense enable row level security;
alter table cost.no_expense force row level security;
revoke all on cost.no_expense from public, anon, authenticated;

-- last date for a register-type category (repair/safety/consumable/fuel) that is complete
create or replace function cost.reg_through(m date, me date, p_cat text) returns date
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare g date;
begin
  if p_cat <> 'fuel' and exists (select 1 from cost.history_monthly h where h.month = m and h.category = p_cat) then return me; end if;
  g := greatest(
    (select max(e.entry_date) from cost.expense_lines e where e.category = p_cat and e.cost_month = m),
    (select max(n.entry_date) from cost.no_expense n where n.category = p_cat and n.entry_date between m and me),
    (select max(u.posted_to) from cost.uploads u where u.posted_to between m and me));
  if g is null then return null; end if;
  return least(me, g);
end $$;

create or replace function cost.cat_through(p_month date)
returns table (cat text, through date)
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare
  m date := date_trunc('month', p_month)::date;
  me date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_lab date; v_pf date; v_tin date;
begin
  if exists (select 1 from cost.expense_lines where category = 'labour' and cost_month = m)
     or exists (select 1 from cost.history_monthly where month = m and category = 'labour') then
    v_lab := me;
  else
    select least(mc.entered_up_to, me) into v_lab from payroll.month_control mc
     where mc.month = m and mc.entered_up_to >= m;
  end if;

  if exists (select 1 from cost.history_monthly where month = m and category = 'power_fuel') then v_pf := me;
  elsif exists (select 1 from cost.power_monthly where month = m) then v_pf := cost.reg_through(m, me, 'fuel');
  else v_pf := null; end if;

  if exists (select 1 from cost.tins_monthly where month = m) or exists (select 1 from cost.history_tins where month = m) then v_tin := me;
  else select max(work_date) into v_tin from cost.tins_daily where work_date between m and me; end if;

  return query values
    ('labour'::text, v_lab),
    ('repair', cost.reg_through(m, me, 'repair')),
    ('safety', cost.reg_through(m, me, 'safety')),
    ('consumable', cost.reg_through(m, me, 'consumable')),
    ('power_fuel', v_pf),
    ('tins', v_tin);
end $$;

create or replace function cost.month_cut(p_month date) returns date
language sql stable security definer set search_path = cost, core, pg_temp as $$
  select case when count(*) filter (where through is null) > 0 then null else min(through) end from cost.cat_through(p_month) $$;

create or replace function cost.period_amounts(p_month date, p_cut date)
returns table (category text, amount numeric)
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date; me date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
        nd int := extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'));
begin
  if p_cut >= me then
    return query select c.category, c.amount from cost.month_cat(m, m) c;
    return;
  end if;
  return query
  with lab as (select coalesce(sum(coalesce(r.amount, w.weight)), 0) a
                 from cost.labour_weights(m) w
                 left join cost.labour_daily_rows(m) r on r.work_date = w.work_date and r.base_name = w.base_name
                where w.work_date <= p_cut),
  oth as (select e.category c, sum(e.amount) a from cost.expense_lines e
           where e.cost_month = m and e.entry_date <= p_cut and e.category in ('repair','safety','consumable') group by 1),
  fu  as (select coalesce(sum(amount), 0) a from cost.expense_lines where cost_month = m and entry_date <= p_cut and category = 'fuel'),
  pw  as (select coalesce((select power_amount from cost.power_monthly where month = m), 0) * extract(day from p_cut) / nd a)
  select 'labour'::text, (select a from lab)
  union all select k, coalesce((select a from oth where c = k), 0) from unnest(array['repair','safety','consumable']) k
  union all select 'power_fuel', (select a from pw) + (select a from fu);
end $$;

create or replace function cost.period_tins(p_month date, p_cut date) returns numeric
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date; me date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if p_cut >= me then return (select tins from cost.month_tins(m, m)); end if;
  return (select coalesce(sum(tins), 0) from cost.tins_daily where work_date between m and p_cut);
end $$;

create or replace function cost.dash2_core(p_month date, p_mode text default 'month') returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare
  m date := date_trunc('month', p_month)::date;
  me date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  fy date := cost.fy_start(p_month);
  f date; t date; k date; cut date; kcut date; ke date;
  has_w boolean; labour_split_missing boolean := false;
  status jsonb; waiting jsonb; trend jsonb := '[]'::jsonb; rows jsonb;
  cy_t numeric := 0; py_t numeric := 0; a numeric; b numeric; x numeric;
  cy_amt jsonb := '{}'::jsonb; py_amt jsonb := '{}'::jsonb; cat text; v numeric;
  used date[] := '{}'; cats text[] := array['labour','power_fuel','consumable','repair','safety'];
  pr record;
begin
  cut := cost.month_cut(m);
  select exists (select 1 from cost.labour_weights(m)) into has_w;
  if cut is not null and cut < me and not has_w
     and (exists (select 1 from cost.expense_lines where category = 'labour' and cost_month = m)
          or exists (select 1 from cost.history_monthly where month = m and category = 'labour')) then
    labour_split_missing := true; cut := null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('key', c.cat, 'through', c.through,
      'state', case when c.through is null then 'missing'
                    when cut is not null and cut < me and c.through = cut then 'partial'
                    when cut is null and c.through < me then 'partial'
                    else 'ok' end)
      order by array_position(array['labour','repair','safety','consumable','power_fuel','tins'], c.cat)), '[]'::jsonb)
    into status from cost.cat_through(m) c;
  select coalesce(jsonb_agg(jsonb_build_object('key', c.cat, 'through', c.through) order by c.cat), '[]'::jsonb)
    into waiting from cost.cat_through(m) c where c.through is null or c.through < me;

  if p_mode = 'fy' then f := fy; t := (fy + interval '11 months')::date;
  elsif p_mode = 'quarter' then f := (fy + make_interval(months => (((extract(month from m)::int + 8) % 12) / 3) * 3))::date; t := (f + interval '2 months')::date;
  else f := m; t := m; end if;

  for k in select generate_series(f, t, interval '1 month')::date loop
    ke := (k + interval '1 month - 1 day')::date;
    if p_mode = 'month' then
      kcut := cut;
    else
      kcut := cost.month_cut(k);
      if kcut is not null and kcut < ke then kcut := null; end if;
    end if;
    continue when kcut is null;
    for pr in select * from cost.period_amounts(k, kcut) loop
      cy_amt := jsonb_set(cy_amt, array[pr.category], to_jsonb(coalesce((cy_amt->>pr.category)::numeric, 0) + coalesce(pr.amount, 0)));
    end loop;
    cy_t := cy_t + coalesce(cost.period_tins(k, kcut), 0);
    for pr in select * from cost.month_cat((k - interval '12 months')::date, (k - interval '12 months')::date) loop
      py_amt := jsonb_set(py_amt, array[pr.category], to_jsonb(coalesce((py_amt->>pr.category)::numeric, 0) + coalesce(pr.amount, 0)));
    end loop;
    py_t := py_t + coalesce((select tins from cost.month_tins((k - interval '12 months')::date, (k - interval '12 months')::date)), 0);
  end loop;

  rows := (select jsonb_agg(jsonb_build_object('category', c,
            'cy_amount', (cy_amt->>c)::numeric, 'py_amount', (py_amt->>c)::numeric,
            'cy_per_tin', case when cy_t > 0 and cy_amt ? c then round((cy_amt->>c)::numeric / cy_t, 2) end,
            'py_per_tin', case when py_t > 0 and py_amt ? c then round((py_amt->>c)::numeric / py_t, 2) end)
          order by array_position(cats, c)) from unnest(cats) c);

  for k in select generate_series(fy, (fy + interval '11 months')::date, interval '1 month')::date loop
    ke := (k + interval '1 month - 1 day')::date;
    kcut := cost.month_cut(k);
    a := null; b := null;
    if kcut is not null and kcut >= ke then
      x := (select tins from cost.month_tins(k, k));
      if coalesce(x, 0) > 0 then a := round((select sum(amount) from cost.period_amounts(k, ke)) / x, 2); end if;
    end if;
    v := (select tins from cost.month_tins((k - interval '12 months')::date, (k - interval '12 months')::date));
    if coalesce(v, 0) > 0 then
      b := round((select sum(amount) from cost.month_cat((k - interval '12 months')::date, (k - interval '12 months')::date)) / v, 2);
    end if;
    trend := trend || jsonb_build_array(jsonb_build_object('month', k, 'cy', a, 'py', b,
              'state', case when a is not null then 'complete' when k > date_trunc('month', current_date)::date then 'future' else 'incomplete' end));
  end loop;

  return jsonb_build_object('month', m, 'mode', p_mode, 'cutoff', cut, 'month_end', me,
    'period_from', f, 'period_to', case when p_mode = 'month' then cut else t end,
    'complete_month', cut is not null and cut >= me, 'labour_split_missing', labour_split_missing,
    'status', status, 'waiting', waiting, 'tins_cy', cy_t, 'tins_py', py_t, 'rows', coalesce(rows, '[]'::jsonb), 'trend', trend);
end $$;

create or replace function cost_api.dash2(p_month date, p_mode text default 'month') returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
begin
  perform core.assert_perm('cost','view');
  return cost.dash2_core(p_month, p_mode);
end $$;

create or replace function cost_api.no_expense_save(p_date date, p_category text, p_on boolean default true) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare cat text := lower(p_category);
begin
  perform core.assert_perm('cost','entry');
  if cat not in ('repair','safety','consumable','fuel') then raise exception 'category_invalid'; end if;
  perform cost.assert_editable(p_date);
  if coalesce(p_on, true) then
    insert into cost.no_expense (entry_date, category, marked_by) values (p_date, cat, auth.uid()) on conflict do nothing;
  else
    delete from cost.no_expense where entry_date = p_date and category = cat;
  end if;
  perform core.log('cost','no_expense','day', p_date::text, jsonb_build_object('category', cat, 'on', coalesce(p_on, true)));
end $$;

create or replace function cost_api.no_expense_list(p_date date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
begin
  perform core.assert_perm('cost','view');
  return coalesce((select jsonb_agg(category order by category) from cost.no_expense where entry_date = p_date), '[]'::jsonb);
end $$;

revoke all on all functions in schema cost from public, anon, authenticated;
revoke all on all functions in schema cost_api from public, anon;
grant execute on all functions in schema cost_api to authenticated;
