-- cost_10_mode: Auto / Manual view mode.
--   Auto   = live data only (Excel uploads, PMS tins, payroll mandays, loaded workbook history). Typed figures are ignored.
--   Manual = a typed figure wins for its month; where nothing is typed the live figure shows.
-- Typed figures are stored for everyone (Administrator, Manager, HR & Admin all see the same ones).
-- The mode itself is each person's own choice, stored per user.

create table if not exists cost.user_mode (user_id uuid primary key, mode text not null check (mode in ('auto','manual')), updated_at timestamptz not null default now());
alter table cost.user_mode enable row level security;

alter table cost.power_monthly add column if not exists diesel_manual numeric;
update cost.power_monthly set diesel_manual = diesel_amount, diesel_amount = null, diesel_source = null
 where diesel_source = 'manual' and diesel_amount is not null and month is not null;

create or replace function cost.cur_mode() returns text language sql stable security definer set search_path = cost, pg_temp as $$
  select coalesce((select mode from cost.user_mode where user_id = auth.uid()), 'auto') $$;
create or replace function cost.is_man() returns boolean language sql stable security definer set search_path = cost, pg_temp as $$
  select cost.cur_mode() = 'manual' $$;

-- ---- live and typed figures
create or replace function cost.power_live(m date) returns numeric language sql stable security definer set search_path = cost, pg_temp as $$
  select nullif(power_amount,0) from cost.power_monthly where month = m $$;
create or replace function cost.power_typed(m date) returns numeric language sql stable security definer set search_path = cost, pg_temp as $$
  select nullif(power_manual,0) from cost.power_monthly where month = m $$;
create or replace function cost.diesel_live(m date) returns numeric language sql stable security definer set search_path = cost, pg_temp as $$
  select coalesce(cost.reg_fuel(m), (select nullif(diesel_amount,0) from cost.power_monthly where month = m)) $$;
create or replace function cost.diesel_typed(m date) returns numeric language sql stable security definer set search_path = cost, pg_temp as $$
  select nullif(diesel_manual,0) from cost.power_monthly where month = m $$;
create or replace function cost.tins_live(m date) returns bigint language sql stable security definer set search_path = cost, pg_temp as $$
  select coalesce(cost.pms_tins(m)::bigint, (select ht.tins from cost.history_tins ht where ht.month = m)) $$;
create or replace function cost.tins_typed(m date) returns bigint language sql stable security definer set search_path = cost, pg_temp as $$
  select coalesce((select o.value::bigint from cost.master_override o where o.month = m and o.field = 'tins'),
                  nullif((select tm.tins from cost.tins_monthly tm where tm.month = m), 0),
                  nullif((select sum(t.tins) from cost.tins_daily t where date_trunc('month', t.work_date)::date = m), 0)) $$;
create or replace function cost.mandays_live(m date) returns numeric language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare v numeric;
begin
  if cost.payroll_ready(m) then select sum(w.mandays) into v from cost.labour_weights(m) w; end if;
  return v;
end $$;
create or replace function cost.mandays_typed(m date) returns numeric language sql stable security definer set search_path = cost, pg_temp as $$
  select mandays from cost.mandays_manual where month = m $$;

-- ---- effective figure for the current person's mode
create or replace function cost.eff_power(m date) returns numeric language sql stable security definer set search_path = cost, pg_temp as $$
  select case when cost.is_man() then coalesce(cost.power_typed(m), cost.power_live(m)) else cost.power_live(m) end $$;
create or replace function cost.power_src(m date) returns text language sql stable security definer set search_path = cost, pg_temp as $$
  select case when cost.is_man() and cost.power_typed(m) is not null then 'manual' when cost.power_live(m) is not null then 'excel' end $$;
create or replace function cost.eff_diesel(m date) returns numeric language sql stable security definer set search_path = cost, pg_temp as $$
  select case when cost.is_man() then coalesce(cost.diesel_typed(m), cost.diesel_live(m)) else cost.diesel_live(m) end $$;
create or replace function cost.diesel_src(m date) returns text language sql stable security definer set search_path = cost, pg_temp as $$
  select case when cost.is_man() and cost.diesel_typed(m) is not null then 'manual'
              when cost.reg_fuel(m) is not null then 'register'
              when cost.diesel_live(m) is not null then 'workbook' end $$;

create or replace function cost.month_mandays(p_month date) returns table (mandays numeric, src text)
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date; t numeric := cost.mandays_typed(m); l numeric := cost.mandays_live(m);
begin
  if cost.is_man() and t is not null then return query select t, 'manual'::text; return; end if;
  if l is not null then return query select l, 'payroll'::text; return; end if;
  return query select null::numeric, 'missing'::text;
end $$;

create or replace function cost.month_cat(p_from date, p_to date)
returns table (month date, category text, amount numeric, src text)
language sql stable security definer set search_path = cost, core, pg_temp as $$
  with md(man) as (select cost.is_man()),
  months as (select generate_series(p_from, p_to, interval '1 month')::date m),
  cats(c) as (values ('labour'),('power_fuel'),('consumable'),('repair'),('safety')),
  live as (select cost_month m, category c, sum(amount) a from cost.expense_lines
            where cost_month between p_from and p_to and category in ('labour','repair','safety','consumable')
            group by 1,2),
  ovr as (select o.month m, o.field c, o.value a from cost.master_override o, md
           where md.man and o.month between p_from and p_to and o.field <> 'tins')
  select months.m, cats.c,
         case when cats.c = 'power_fuel'
              then case when cost.eff_power(months.m) is not null then cost.eff_power(months.m) + coalesce(cost.eff_diesel(months.m), 0) else h.amount end
              when cats.c = 'labour' then coalesce(ovr.a, lt.v, live.a, h.amount)
              else coalesce(ovr.a, live.a, h.amount) end,
         case when cats.c = 'power_fuel'
              then case when cost.power_src(months.m) = 'manual' then 'manual' when cost.power_src(months.m) = 'excel' then 'live'
                        when h.amount is not null then 'workbook' else 'missing' end
              else case when ovr.a is not null then 'manual'
                        when cats.c = 'labour' and lt.v is not null then (case when live.a is not null then 'live' else 'payroll' end)
                        when live.a is not null then 'live'
                        when h.amount is not null then 'workbook' else 'missing' end end
    from months cross join cats
    left join lateral (select case when cats.c = 'labour' then cost.labour_month_total(months.m) end v) lt on true
    left join live on live.m = months.m and live.c = cats.c
    left join ovr  on ovr.m  = months.m and ovr.c  = cats.c
    left join cost.history_monthly h on h.month = months.m and h.category = cats.c
$$;

create or replace function cost.month_tins(p_from date, p_to date)
returns table (month date, tins bigint, src text)
language sql stable security definer set search_path = cost, core, pg_temp as $$
  select m.m,
         case when cost.is_man() then coalesce(cost.tins_typed(m.m), cost.tins_live(m.m)) else cost.tins_live(m.m) end,
         case when cost.is_man() and cost.tins_typed(m.m) is not null then 'manual'
              when cost.pms_tins(m.m) is not null then 'pms'
              when exists (select 1 from cost.history_tins ht where ht.month = m.m) then 'workbook'
              else 'missing' end
    from (select generate_series(p_from, p_to, interval '1 month')::date m) m
$$;

create or replace function cost.period_tins(p_month date, p_cut date) returns numeric
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date; me date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if p_cut >= me then return (select tins from cost.month_tins(m, m)); end if;
  if cost.is_man() and cost.tins_typed(m) is not null and cost.pms_tins(m, p_cut) is null then
    return coalesce((select sum(tins) from cost.tins_daily where work_date between m and p_cut), 0);
  end if;
  return coalesce(cost.pms_tins(m, p_cut), 0);
end $$;

create or replace function cost.reg_through(m date, me date, p_cat text) returns date
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare g date;
begin
  if p_cat <> 'fuel' and (exists (select 1 from cost.history_monthly h where h.month = m and h.category = p_cat)
                          or (cost.is_man() and exists (select 1 from cost.master_override o where o.month = m and o.field = p_cat))) then return me; end if;
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
  v_lab date; v_pf date; v_tin date; pmx date; man boolean := cost.is_man();
begin
  if exists (select 1 from cost.history_monthly where month = m and category = 'labour')
     or (man and exists (select 1 from cost.master_override where month = m and field = 'labour')) then
    v_lab := me;
  elsif exists (select 1 from cost.expense_lines where category = 'labour' and cost_month = m)
        and not exists (select 1 from cost.labour_weights(m) w
                         where not exists (select 1 from cost.expense_lines e
                                            where e.category = 'labour' and e.cost_month = m and e.base_name = w.base_name)) then
    v_lab := me;
  else
    select least(mc.entered_up_to, me) into v_lab from payroll.month_control mc
     where mc.month = m and mc.entered_up_to >= m;
  end if;

  if cost.eff_power(m) is not null and cost.eff_diesel(m) is not null then v_pf := me;
  elsif cost.eff_power(m) is not null then v_pf := cost.reg_through(m, me, 'fuel');
  elsif exists (select 1 from cost.history_monthly where month = m and category = 'power_fuel') then v_pf := me;
  else v_pf := null; end if;

  select max(entry_date) into pmx from pms.production where component = 'CAN' and entry_date between m and me;
  if man and cost.tins_typed(m) is not null then v_tin := me;
  elsif pmx is not null then v_tin := case when m < date_trunc('month', current_date)::date then me else least(pmx, me) end;
  elsif exists (select 1 from cost.history_tins where month = m) then v_tin := me;
  else v_tin := null; end if;

  return query values
    ('labour'::text, v_lab),
    ('repair', cost.reg_through(m, me, 'repair')),
    ('safety', cost.reg_through(m, me, 'safety')),
    ('consumable', cost.reg_through(m, me, 'consumable')),
    ('power_fuel', v_pf),
    ('tins', v_tin);
end $$;

-- ---- typed figures: save and clear (no month is touched by the other mode)
create or replace function cost_api.diesel_save(p_month date, p_amount numeric) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','tins_edit'); perform cost.assert_month_open(m);
  if p_amount is null or p_amount < 0 then raise exception 'amount_invalid'; end if;
  insert into cost.power_monthly (month, diesel_manual, source, updated_by) values (m, p_amount, 'manual', auth.uid())
  on conflict (month) do update set diesel_manual = excluded.diesel_manual, updated_by = auth.uid(), updated_at = now();
  perform core.log('cost','diesel_month','power', m::text, jsonb_build_object('amount', p_amount));
end $$;

create or replace function cost_api.manual_clear(p_month date, p_field text) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','tins_edit'); perform cost.assert_month_open(m);
  if p_field = 'power' then update cost.power_monthly set power_manual = null, updated_at = now() where month = m;
  elsif p_field = 'diesel' then update cost.power_monthly set diesel_manual = null, updated_at = now() where month = m;
  elsif p_field = 'tins' then delete from cost.tins_monthly where month = m; delete from cost.master_override where month = m and field = 'tins';
  elsif p_field = 'mandays' then delete from cost.mandays_manual where month = m;
  else raise exception 'field_invalid'; end if;
  perform core.log('cost','manual_clear','master', m::text, jsonb_build_object('field', p_field));
end $$;

create or replace function cost_api.mode_get() returns text language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
begin perform core.assert_perm('cost','view'); return cost.cur_mode(); end $$;
create or replace function cost_api.mode_set(p_mode text) returns text language plpgsql security definer set search_path = cost, core, pg_temp as $$
begin
  perform core.assert_perm('cost','view');
  if p_mode not in ('auto','manual') then raise exception 'mode_invalid'; end if;
  insert into cost.user_mode (user_id, mode) values (auth.uid(), p_mode)
  on conflict (user_id) do update set mode = excluded.mode, updated_at = now();
  return p_mode;
end $$;

create or replace function cost_api.power_list(p_month date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare fy date := cost.fy_start(p_month);
begin
  perform core.assert_perm('cost','view');
  return coalesce((select jsonb_agg(to_jsonb(z) order by z.month) from (
    select k.m as month,
           cost.eff_power(k.m) as power_eb, cost.power_src(k.m) as power_src, cost.power_live(k.m) as power_live, cost.power_typed(k.m) as power_typed,
           cost.eff_diesel(k.m) as fuel_diesel, cost.diesel_src(k.m) as fuel_src, cost.diesel_live(k.m) as diesel_live, cost.diesel_typed(k.m) as diesel_typed,
           (select h.amount from cost.history_monthly h where h.month = k.m and h.category = 'power_fuel') as workbook_total,
           (select tins from cost.month_tins(k.m, k.m)) as tins, (select src from cost.month_tins(k.m, k.m)) as tins_src,
           cost.tins_live(k.m) as tins_live, cost.tins_typed(k.m) as tins_typed,
           (select mandays from cost.month_mandays(k.m)) as mandays, (select src from cost.month_mandays(k.m)) as mandays_src,
           cost.mandays_live(k.m) as mandays_live, cost.mandays_typed(k.m) as mandays_typed, cost.cur_mode() as mode,
           exists (select 1 from cost.month_lock l where l.month = k.m) as locked
      from (select generate_series(fy, (fy + interval '11 months')::date, interval '1 month')::date m) k) z), '[]'::jsonb);
end $$;

-- masters: same figures as the screen mode; typing is for Manual mode
create or replace function cost_api.master_get(p_fy date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare a date := cost.fy_start(p_fy); b date := (cost.fy_start(p_fy) - interval '1 year')::date;
        e date := (cost.fy_start(p_fy) + interval '11 months')::date;
begin
  perform core.assert_perm('cost','view');
  return jsonb_build_object('fy', a, 'prev', b, 'mode', cost.cur_mode(), 'can_edit', core.has_perm('cost','master_edit') and cost.is_man(),
    'rows', coalesce((
      with mm as (select generate_series(b, e, interval '1 month')::date m),
      c  as (select * from cost.month_cat(b, e)),
      t  as (select * from cost.month_tins(b, e))
      select jsonb_agg(to_jsonb(z) order by z.month) from (
        select mm.m as month,
          (select amount from c where c.month = mm.m and c.category = 'labour')     as labour,
          (select amount from c where c.month = mm.m and c.category = 'consumable') as consumable,
          (select amount from c where c.month = mm.m and c.category = 'repair')     as repair,
          (select amount from c where c.month = mm.m and c.category = 'safety')     as safety,
          coalesce(cost.eff_power(mm.m), (select h.amount from cost.history_monthly h where h.month = mm.m and h.category = 'power_fuel')) as power,
          cost.eff_diesel(mm.m) as diesel,
          coalesce((select cost.eff_power(pv.month) from cost.power_monthly pv where pv.month = (mm.m - interval '1 month')::date),
                   case when not exists (select 1 from cost.power_monthly pv where pv.month = (mm.m - interval '1 month')::date)
                        then (select bk.amount from cost.backup_history_pf_20261114 bk where bk.month = mm.m) end) as power_billed,
          (select tins from t where t.month = mm.m) as tins,
          jsonb_build_object(
            'labour', (select src from c where c.month = mm.m and c.category = 'labour'),
            'consumable', (select src from c where c.month = mm.m and c.category = 'consumable'),
            'repair', (select src from c where c.month = mm.m and c.category = 'repair'),
            'safety', (select src from c where c.month = mm.m and c.category = 'safety'),
            'power', coalesce(cost.power_src(mm.m), 'missing'),
            'diesel', coalesce(cost.diesel_src(mm.m), 'missing'),
            'tins', (select src from t where t.month = mm.m)) as src,
          (select jsonb_object_agg(x.cat, x.through) from cost.cat_through(mm.m) x) as through,
          exists (select 1 from cost.month_lock l where l.month = mm.m) as locked
        from mm) z), '[]'::jsonb));
end $$;

create or replace function cost_api.master_save(p_month date, p_field text, p_value numeric, p_note text default null) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','master_edit'); perform cost.assert_month_open(m);
  if p_value is null or p_value < 0 then raise exception 'amount_invalid'; end if;
  if p_field in ('labour','repair','consumable','safety','tins') then
    insert into cost.master_override (month, field, value, note, updated_by) values (m, p_field, p_value, p_note, auth.uid())
    on conflict (month, field) do update set value = excluded.value, note = excluded.note, updated_by = auth.uid(), updated_at = now();
  elsif p_field = 'power' then
    insert into cost.power_monthly (month, power_manual, note, source, updated_by) values (m, p_value, p_note, 'manual', auth.uid())
    on conflict (month) do update set power_manual = excluded.power_manual, note = coalesce(excluded.note, cost.power_monthly.note),
           updated_by = auth.uid(), updated_at = now();
  elsif p_field = 'diesel' then
    insert into cost.power_monthly (month, diesel_manual, source, updated_by) values (m, p_value, 'manual', auth.uid())
    on conflict (month) do update set diesel_manual = excluded.diesel_manual, updated_by = auth.uid(), updated_at = now();
  else raise exception 'field_invalid'; end if;
  perform core.log('cost','master_save','master', m::text, jsonb_build_object('field', p_field, 'value', p_value, 'note', p_note));
end $$;

create or replace function cost_api.master_clear(p_month date, p_field text) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','master_edit'); perform cost.assert_month_open(m);
  if p_field in ('labour','repair','consumable','safety','tins') then
    delete from cost.master_override where month = m and field = p_field;
  elsif p_field = 'power' then
    update cost.power_monthly set power_manual = null, updated_by = auth.uid(), updated_at = now() where month = m;
  elsif p_field = 'diesel' then
    update cost.power_monthly set diesel_manual = null, updated_by = auth.uid(), updated_at = now() where month = m;
  else raise exception 'field_invalid'; end if;
  perform core.log('cost','master_clear','master', m::text, jsonb_build_object('field', p_field));
end $$;

revoke all on all functions in schema cost from public, anon, authenticated;
revoke all on all functions in schema cost_api from public, anon;
grant execute on all functions in schema cost_api to authenticated;
