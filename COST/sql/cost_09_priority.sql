-- cost_09_priority: one rule for every figure
--   Expenses, Power, Fuel : Excel upload first, typed figure only when there is no Excel figure
--   Tins                  : PMS live first, typed month figure second
--   Mandays               : payroll live first, typed month figure second
-- A stored 0 counts as "not typed".

alter table cost.power_monthly add column if not exists power_manual numeric;
-- earlier typed power moves to the manual column; Excel stays in power_amount
update cost.power_monthly set power_manual = power_amount, power_amount = null, source = 'manual'
 where source = 'manual' and power_amount is not null and power_manual is null and month is not null;
update cost.power_monthly set power_amount = null where power_amount = 0;
update cost.power_monthly set diesel_amount = null, diesel_source = null where diesel_amount = 0;

create table if not exists cost.mandays_manual (
  month date primary key, mandays numeric not null check (mandays >= 0),
  updated_by uuid, updated_at timestamptz not null default now());
alter table cost.mandays_manual enable row level security;

create or replace function cost.eff_power(m date) returns numeric language sql stable security definer set search_path = cost, pg_temp as $$
  select coalesce(nullif(power_amount,0), nullif(power_manual,0)) from cost.power_monthly where month = m $$;
create or replace function cost.power_src(m date) returns text language sql stable security definer set search_path = cost, pg_temp as $$
  select case when nullif(power_amount,0) is not null then 'excel' when nullif(power_manual,0) is not null then 'manual' end
    from cost.power_monthly where month = m $$;
create or replace function cost.reg_fuel(m date) returns numeric language sql stable security definer set search_path = cost, pg_temp as $$
  select nullif(sum(amount),0) from cost.expense_lines where category = 'fuel' and cost_month = m $$;
create or replace function cost.eff_diesel(m date) returns numeric language sql stable security definer set search_path = cost, pg_temp as $$
  select coalesce(cost.reg_fuel(m), (select nullif(diesel_amount,0) from cost.power_monthly where month = m)) $$;

create or replace function cost.month_mandays(p_month date) returns table (mandays numeric, src text)
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date; v numeric;
begin
  if cost.payroll_ready(m) then
    select sum(w.mandays) into v from cost.labour_weights(m) w;
    if v is not null then return query select v, 'payroll'::text; return; end if;
  end if;
  select mm.mandays into v from cost.mandays_manual mm where mm.month = m;
  if v is not null then return query select v, 'manual'::text; return; end if;
  return query select null::numeric, 'missing'::text;
end $$;

create or replace function cost.month_cat(p_from date, p_to date)
returns table (month date, category text, amount numeric, src text)
language sql stable security definer set search_path = cost, core, pg_temp as $$
  with months as (select generate_series(p_from, p_to, interval '1 month')::date m),
  cats(c) as (values ('labour'),('power_fuel'),('consumable'),('repair'),('safety')),
  live as (select cost_month m, category c, sum(amount) a from cost.expense_lines
            where cost_month between p_from and p_to and category in ('labour','repair','safety','consumable')
            group by 1,2),
  ovr as (select o.month m, o.field c, o.value a from cost.master_override o
           where o.month between p_from and p_to and o.field <> 'tins')
  select months.m, cats.c,
         case when cats.c = 'power_fuel'
              then case when cost.eff_power(months.m) is not null then cost.eff_power(months.m) + coalesce(cost.eff_diesel(months.m), 0) else h.amount end
              when cats.c = 'labour' then coalesce(lt.v, live.a, ovr.a, h.amount)
              else coalesce(live.a, ovr.a, h.amount) end,
         case when cats.c = 'power_fuel'
              then case when cost.power_src(months.m) = 'excel' then 'live' when cost.power_src(months.m) = 'manual' then 'manual'
                        when h.amount is not null then 'workbook' else 'missing' end
              else case when cats.c = 'labour' and lt.v is not null then (case when live.a is not null then 'live' else 'payroll' end)
                        when live.a is not null then 'live'
                        when ovr.a is not null then 'manual'
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
         coalesce(cost.pms_tins(m.m)::bigint,
                  (select o.value::bigint from cost.master_override o where o.month = m.m and o.field = 'tins'),
                  nullif((select tm.tins from cost.tins_monthly tm where tm.month = m.m), 0),
                  nullif((select sum(t.tins) from cost.tins_daily t where date_trunc('month', t.work_date)::date = m.m), 0),
                  (select ht.tins from cost.history_tins ht where ht.month = m.m)),
         case when cost.pms_tins(m.m) is not null then 'pms'
              when exists (select 1 from cost.master_override o where o.month = m.m and o.field = 'tins') then 'manual'
              when coalesce((select tm.tins from cost.tins_monthly tm where tm.month = m.m), 0) > 0 then 'manual'
              when exists (select 1 from cost.tins_daily t where date_trunc('month', t.work_date)::date = m.m) then 'daily'
              when exists (select 1 from cost.history_tins ht where ht.month = m.m) then 'workbook'
              else 'missing' end
    from (select generate_series(p_from, p_to, interval '1 month')::date m) m
$$;

create or replace function cost.cat_through(p_month date)
returns table (cat text, through date)
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare
  m date := date_trunc('month', p_month)::date;
  me date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_lab date; v_pf date; v_tin date; pmx date;
begin
  if exists (select 1 from cost.history_monthly where month = m and category = 'labour')
     or exists (select 1 from cost.master_override where month = m and field = 'labour') then
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
  if pmx is not null then v_tin := case when m < date_trunc('month', current_date)::date then me else least(pmx, me) end;
  elsif exists (select 1 from cost.master_override where month = m and field = 'tins') then v_tin := me;
  elsif exists (select 1 from cost.tins_monthly where month = m and tins > 0) then v_tin := me;
  elsif exists (select 1 from cost.tins_daily where work_date between m and me) then
    select max(work_date) into v_tin from cost.tins_daily where work_date between m and me;
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

-- electricity Excel always wins; typed power is kept in power_manual and used only while there is no Excel figure
create or replace function cost_api.power_upload_commit(p jsonb) returns jsonb
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare x jsonb; m date; saved int := 0; skipped int := 0; tot numeric := 0; rws int := 0; uid bigint;
begin
  perform core.assert_perm('cost','upload');
  for x in select * from jsonb_array_elements(p->'months') loop
    m := date_trunc('month', (x->>'m')::date)::date;
    if exists (select 1 from cost.month_lock l where l.month = m) and not core.has_perm('cost','edit_old') then
      skipped := skipped + 1; continue;
    end if;
    insert into cost.power_monthly (month, power_amount, note, source, updated_by)
      values (m, greatest((x->>'a')::numeric, 0), left(coalesce(p->>'file_name',''), 120), 'excel', auth.uid())
      on conflict (month) do update set power_amount = excluded.power_amount, note = excluded.note, source = 'excel',
             updated_by = auth.uid(), updated_at = now();
    saved := saved + 1; tot := tot + (x->>'a')::numeric; rws := rws + coalesce((x->>'n')::int, 0);
  end loop;
  insert into cost.uploads (kind, file_name, posted_from, posted_to, rows_in_file, rows_kept, amount_kept, uploaded_by)
    values ('power', left(coalesce(p->>'file_name','electrical.xlsx'), 200), null, null, coalesce((p->>'rows_in_file')::int, 0), rws, tot, auth.uid())
    returning id into uid;
  perform core.log('cost','upload_power','upload', uid::text,
    jsonb_build_object('months', saved, 'skipped_locked', skipped, 'amount', tot));
  return jsonb_build_object('months_saved', saved, 'months_locked', skipped, 'months_manual', 0, 'amount', tot);
end $$;

create or replace function cost_api.power_save(p_month date, p_amount numeric, p_note text default null) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','tins_edit'); perform cost.assert_month_open(m);
  if p_amount is null or p_amount < 0 then raise exception 'amount_invalid'; end if;
  insert into cost.power_monthly (month, power_manual, note, source, updated_by) values (m, p_amount, p_note, 'manual', auth.uid())
  on conflict (month) do update set power_manual = excluded.power_manual, note = coalesce(excluded.note, cost.power_monthly.note),
         updated_by = auth.uid(), updated_at = now();
  perform core.log('cost','power_month','power', m::text, jsonb_build_object('amount', p_amount));
end $$;

create or replace function cost_api.diesel_save(p_month date, p_amount numeric) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','tins_edit'); perform cost.assert_month_open(m);
  if p_amount is null or p_amount < 0 then raise exception 'amount_invalid'; end if;
  insert into cost.power_monthly (month, diesel_amount, diesel_source, source, updated_by) values (m, p_amount, 'manual', 'manual', auth.uid())
  on conflict (month) do update set diesel_amount = excluded.diesel_amount, diesel_source = 'manual', updated_by = auth.uid(), updated_at = now();
  perform core.log('cost','diesel_month','power', m::text, jsonb_build_object('amount', p_amount));
end $$;

create or replace function cost_api.mandays_save(p_month date, p_mandays numeric) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','tins_edit'); perform cost.assert_month_open(m);
  if p_mandays is null or p_mandays < 0 then raise exception 'amount_invalid'; end if;
  insert into cost.mandays_manual (month, mandays, updated_by) values (m, p_mandays, auth.uid())
  on conflict (month) do update set mandays = excluded.mandays, updated_by = auth.uid(), updated_at = now();
  perform core.log('cost','mandays_month','mandays', m::text, jsonb_build_object('mandays', p_mandays));
end $$;

-- take a typed figure away again: field = power | diesel | tins | mandays
create or replace function cost_api.manual_clear(p_month date, p_field text) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','tins_edit'); perform cost.assert_month_open(m);
  if p_field = 'power' then update cost.power_monthly set power_manual = null, updated_at = now() where month = m;
  elsif p_field = 'diesel' then update cost.power_monthly set diesel_amount = null, diesel_source = null, updated_at = now() where month = m;
  elsif p_field = 'tins' then delete from cost.tins_monthly where month = m; delete from cost.master_override where month = m and field = 'tins';
  elsif p_field = 'mandays' then delete from cost.mandays_manual where month = m;
  else raise exception 'field_invalid'; end if;
  perform core.log('cost','manual_clear','master', m::text, jsonb_build_object('field', p_field));
end $$;

create or replace function cost_api.power_list(p_month date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare fy date := cost.fy_start(p_month);
begin
  perform core.assert_perm('cost','view');
  return coalesce((select jsonb_agg(to_jsonb(z) order by z.month) from (
    select k.m as month,
           cost.eff_power(k.m) as power_eb, cost.power_src(k.m) as power_src,
           cost.eff_diesel(k.m) as fuel_diesel,
           case when cost.reg_fuel(k.m) is not null then 'excel' when cost.eff_diesel(k.m) is not null then 'manual' end as fuel_src,
           (select h.amount from cost.history_monthly h where h.month = k.m and h.category = 'power_fuel') as workbook_total,
           (select tins from cost.month_tins(k.m, k.m)) as tins,
           (select src from cost.month_tins(k.m, k.m)) as tins_src,
           (select mandays from cost.month_mandays(k.m)) as mandays,
           (select src from cost.month_mandays(k.m)) as mandays_src,
           exists (select 1 from cost.month_lock l where l.month = k.m) as locked
      from (select generate_series(fy, (fy + interval '11 months')::date, interval '1 month')::date m) k) z), '[]'::jsonb);
end $$;

-- master_get / master_save / master_clear follow the same rules
create or replace function cost_api.master_get(p_fy date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare a date := cost.fy_start(p_fy); b date := (cost.fy_start(p_fy) - interval '1 year')::date;
        e date := (cost.fy_start(p_fy) + interval '11 months')::date;
begin
  perform core.assert_perm('cost','view');
  return jsonb_build_object('fy', a, 'prev', b, 'can_edit', core.has_perm('cost','master_edit'),
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
          coalesce(cost.eff_power(mm.m), case when cost.eff_power(mm.m) is null then (select h.amount from cost.history_monthly h where h.month = mm.m and h.category = 'power_fuel') end) as power,
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
            'diesel', case when cost.reg_fuel(mm.m) is not null then 'register'
                           when cost.eff_diesel(mm.m) is not null then 'manual' else 'missing' end,
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
    insert into cost.power_monthly (month, diesel_amount, diesel_source, source, updated_by) values (m, p_value, 'manual', 'manual', auth.uid())
    on conflict (month) do update set diesel_amount = excluded.diesel_amount, diesel_source = 'manual', updated_by = auth.uid(), updated_at = now();
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
    update cost.power_monthly set diesel_amount = null, diesel_source = null, updated_by = auth.uid(), updated_at = now() where month = m;
  else raise exception 'field_invalid'; end if;
  perform core.log('cost','master_clear','master', m::text, jsonb_build_object('field', p_field));
end $$;

revoke all on all functions in schema cost from public, anon, authenticated;
revoke all on all functions in schema cost_api from public, anon;
grant execute on all functions in schema cost_api to authenticated;
