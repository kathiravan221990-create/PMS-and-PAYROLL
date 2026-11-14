-- cost_07_master: Expenses Master and Power & Fuel Master tabs
--  * Option A: Power and fuel for every month = electricity from the ledger (month named in Details)
--    + diesel from the CP expense register for the same month. Old workbook figures are kept in
--    cost.backup_history_pf_20261114.
--  * power_monthly gets a diesel column (diesel from Apr 2026 is entered by hand).
--  * cost.master_override holds manual monthly figures (labour, repair, consumable, safety, tins).
--  * Tins come from PMS (component CAN) unless a manual figure exists.
--  * New permission cost / master_edit for Administrator and Manager.

-- ---------------------------------------------------------------- backup of the old figures
create table if not exists cost.backup_history_pf_20261114 as
  select * from cost.history_monthly where category = 'power_fuel';
alter table cost.backup_history_pf_20261114 enable row level security;
revoke all on cost.backup_history_pf_20261114 from public, anon, authenticated;

-- ---------------------------------------------------------------- columns and tables
alter table cost.power_monthly alter column power_amount drop not null;
alter table cost.power_monthly add column if not exists diesel_amount numeric(16,2) check (diesel_amount is null or diesel_amount >= 0);
alter table cost.power_monthly add column if not exists diesel_source text;

create table if not exists cost.master_override (
  month date not null check (month = date_trunc('month', month)::date),
  field text not null check (field in ('labour','repair','consumable','safety','tins')),
  value numeric(16,2) not null check (value >= 0),
  note text,
  updated_by uuid, updated_at timestamptz not null default now(),
  primary key (month, field)
);
alter table cost.master_override enable row level security;
revoke all on cost.master_override from public, anon, authenticated;

-- ---------------------------------------------------------------- permission
insert into core.permissions (module, code, description) values
  ('cost','master_edit','Manually edit the Expenses Master and Power & Fuel Master figures')
on conflict do nothing;
insert into core.role_permissions (module, role_code, permission) values
  ('cost','admin','master_edit'), ('cost','manager','master_edit')
on conflict do nothing;

-- ---------------------------------------------------------------- Option A seed (Apr 2025 to Jun 2026)
-- electricity from the ledger (payments left out); diesel from the register, known for Apr 2025 to Mar 2026 only
insert into cost.power_monthly (month, power_amount, diesel_amount, diesel_source, note, source)
select m::date, p, d, case when d is not null then 'register' end, 'Option A: ledger month + register diesel', 'excel'
from (values
  ('2025-04-01',148150,0),('2025-05-01',179720,17294),('2025-06-01',210443,17294),('2025-07-01',217604,17294),
  ('2025-08-01',210597,34786),('2025-09-01',170018,17294),('2025-10-01',185880,17294),('2025-11-01',218263,17294),
  ('2025-12-01',222364,0),('2026-01-01',211395,34588),('2026-02-01',179329,0),('2026-03-01',202410,34588),
  ('2026-04-01',211638,null),('2026-05-01',179541,null),('2026-06-01',181393,null)
) v(m, p, d)
on conflict (month) do update set power_amount = excluded.power_amount, diesel_amount = excluded.diesel_amount,
  diesel_source = excluded.diesel_source, note = excluded.note, source = 'excel', updated_at = now();

delete from cost.history_monthly where category = 'power_fuel';

-- ---------------------------------------------------------------- PMS tins (finished tins = component CAN)
create or replace function cost.pms_tins(p_month date, p_upto date default null) returns numeric
language sql stable security definer set search_path = cost, core, pms, pg_temp as $$
  select sum(actual_production) from pms.production
   where component = 'CAN'
     and entry_date >= date_trunc('month', p_month)::date
     and entry_date <= coalesce(p_upto, (date_trunc('month', p_month) + interval '1 month - 1 day')::date) $$;

-- ---------------------------------------------------------------- amounts per month (manual > upload > workbook)
create or replace function cost.month_cat(p_from date, p_to date)
returns table (month date, category text, amount numeric, src text)
language sql stable security definer set search_path = cost, core, pg_temp as $$
  with months as (select generate_series(p_from, p_to, interval '1 month')::date m),
  cats(c) as (values ('labour'),('power_fuel'),('consumable'),('repair'),('safety')),
  live as (select cost_month m, category c, sum(amount) a from cost.expense_lines
            where cost_month between p_from and p_to and category in ('labour','repair','safety','consumable')
            group by 1,2),
  ovr as (select o.month m, o.field c, o.value a from cost.master_override o
           where o.month between p_from and p_to and o.field <> 'tins'),
  fuel as (select cost_month m, sum(amount) a from cost.expense_lines
            where cost_month between p_from and p_to and category = 'fuel' group by 1),
  pw as (select pm.month m, pm.power_amount p, pm.diesel_amount d from cost.power_monthly pm
          where pm.month between p_from and p_to and (pm.power_amount is not null or pm.diesel_amount is not null))
  select months.m, cats.c,
         case when cats.c = 'power_fuel'
              then case when pw.m is not null then coalesce(pw.p, 0) + coalesce(pw.d, fuel.a, 0) else h.amount end
              else coalesce(ovr.a, live.a, h.amount) end,
         case when cats.c = 'power_fuel'
              then case when pw.m is not null then 'live' when h.amount is not null then 'workbook' else 'missing' end
              else case when ovr.a is not null then 'manual' when live.a is not null then 'live'
                        when h.amount is not null then 'workbook' else 'missing' end end
    from months cross join cats
    left join live on live.m = months.m and live.c = cats.c
    left join ovr  on ovr.m  = months.m and ovr.c  = cats.c
    left join fuel on fuel.m = months.m and cats.c = 'power_fuel'
    left join pw   on pw.m   = months.m and cats.c = 'power_fuel'
    left join cost.history_monthly h on h.month = months.m and h.category = cats.c
$$;

-- tins: manual > PMS > daily > monthly entry (0 counts as not entered) > workbook
create or replace function cost.month_tins(p_from date, p_to date)
returns table (month date, tins bigint, src text)
language sql stable security definer set search_path = cost, core, pg_temp as $$
  select m.m,
         coalesce((select o.value::bigint from cost.master_override o where o.month = m.m and o.field = 'tins'),
                  cost.pms_tins(m.m)::bigint,
                  nullif((select sum(t.tins) from cost.tins_daily t where date_trunc('month', t.work_date)::date = m.m), 0),
                  nullif((select tm.tins from cost.tins_monthly tm where tm.month = m.m), 0),
                  (select ht.tins from cost.history_tins ht where ht.month = m.m)),
         case when exists (select 1 from cost.master_override o where o.month = m.m and o.field = 'tins') then 'manual'
              when cost.pms_tins(m.m) is not null then 'pms'
              when exists (select 1 from cost.tins_daily t where date_trunc('month', t.work_date)::date = m.m) then 'daily'
              when coalesce((select tm.tins from cost.tins_monthly tm where tm.month = m.m), 0) > 0 then 'entered'
              when exists (select 1 from cost.history_tins ht where ht.month = m.m) then 'workbook'
              else 'missing' end
    from (select generate_series(p_from, p_to, interval '1 month')::date m) m
$$;

create or replace function cost.period_tins(p_month date, p_cut date) returns numeric
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date; me date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if p_cut >= me then return (select tins from cost.month_tins(m, m)); end if;
  return coalesce(cost.pms_tins(m, p_cut), (select sum(tins) from cost.tins_daily where work_date between m and p_cut), 0);
end $$;

-- ---------------------------------------------------------------- completeness (manual figures count as complete)
create or replace function cost.reg_through(m date, me date, p_cat text) returns date
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare g date;
begin
  if p_cat <> 'fuel' and (exists (select 1 from cost.history_monthly h where h.month = m and h.category = p_cat)
                          or exists (select 1 from cost.master_override o where o.month = m and o.field = p_cat)) then return me; end if;
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
  v_lab date; v_pf date; v_tin date; pmx date;
begin
  if exists (select 1 from cost.expense_lines where category = 'labour' and cost_month = m)
     or exists (select 1 from cost.history_monthly where month = m and category = 'labour')
     or exists (select 1 from cost.master_override where month = m and field = 'labour') then
    v_lab := me;
  else
    select least(mc.entered_up_to, me) into v_lab from payroll.month_control mc
     where mc.month = m and mc.entered_up_to >= m;
  end if;

  if exists (select 1 from cost.power_monthly where month = m and power_amount is not null and diesel_amount is not null) then v_pf := me;
  elsif exists (select 1 from cost.power_monthly where month = m and power_amount is not null) then v_pf := cost.reg_through(m, me, 'fuel');
  elsif exists (select 1 from cost.history_monthly where month = m and category = 'power_fuel') then v_pf := me;
  else v_pf := null; end if;

  select max(entry_date) into pmx from pms.production where component = 'CAN' and entry_date between m and me;
  if exists (select 1 from cost.master_override where month = m and field = 'tins') then v_tin := me;
  elsif pmx is not null then v_tin := case when m < date_trunc('month', current_date)::date then me else least(pmx, me) end;
  elsif exists (select 1 from cost.tins_daily where work_date between m and me) then
    select max(work_date) into v_tin from cost.tins_daily where work_date between m and me;
  elsif exists (select 1 from cost.tins_monthly where month = m and tins > 0) or exists (select 1 from cost.history_tins where month = m) then v_tin := me;
  else v_tin := null; end if;

  return query values
    ('labour'::text, v_lab),
    ('repair', cost.reg_through(m, me, 'repair')),
    ('safety', cost.reg_through(m, me, 'safety')),
    ('consumable', cost.reg_through(m, me, 'consumable')),
    ('power_fuel', v_pf),
    ('tins', v_tin);
end $$;

-- ---------------------------------------------------------------- electricity upload: do not overwrite a hand-entered month
create or replace function cost_api.power_upload_commit(p jsonb) returns jsonb
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare x jsonb; m date; saved int := 0; skipped int := 0; kept_manual int := 0; tot numeric := 0; rws int := 0; uid bigint; n int;
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
             updated_by = auth.uid(), updated_at = now()
      where cost.power_monthly.source <> 'manual' or cost.power_monthly.power_amount is null;
    get diagnostics n = row_count;
    if n = 0 then kept_manual := kept_manual + 1; continue; end if;
    saved := saved + 1; tot := tot + (x->>'a')::numeric; rws := rws + coalesce((x->>'n')::int, 0);
  end loop;
  insert into cost.uploads (kind, file_name, posted_from, posted_to, rows_in_file, rows_kept, amount_kept, uploaded_by)
    values ('power', left(coalesce(p->>'file_name','electrical.xlsx'), 200), null, null, coalesce((p->>'rows_in_file')::int, 0), rws, tot, auth.uid())
    returning id into uid;
  perform core.log('cost','upload_power','upload', uid::text,
    jsonb_build_object('months', saved, 'skipped_locked', skipped, 'kept_manual', kept_manual, 'amount', tot));
  return jsonb_build_object('months_saved', saved, 'months_locked', skipped, 'months_manual', kept_manual, 'amount', tot);
end $$;

-- ---------------------------------------------------------------- master data for the two tabs
-- one call returns 24 months (the chosen financial year and the one before it)
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
          coalesce(pm.power_amount, case when pm.month is null then (select h.amount from cost.history_monthly h where h.month = mm.m and h.category = 'power_fuel') end) as power,
          coalesce(pm.diesel_amount, (select sum(l.amount) from cost.expense_lines l where l.category = 'fuel' and l.cost_month = mm.m)) as diesel,
          coalesce((select pv.power_amount from cost.power_monthly pv where pv.month = (mm.m - interval '1 month')::date),
                   case when not exists (select 1 from cost.power_monthly pv where pv.month = (mm.m - interval '1 month')::date)
                        then (select bk.amount from cost.backup_history_pf_20261114 bk where bk.month = mm.m) end) as power_billed,
          (select tins from t where t.month = mm.m) as tins,
          jsonb_build_object(
            'labour', (select src from c where c.month = mm.m and c.category = 'labour'),
            'consumable', (select src from c where c.month = mm.m and c.category = 'consumable'),
            'repair', (select src from c where c.month = mm.m and c.category = 'repair'),
            'safety', (select src from c where c.month = mm.m and c.category = 'safety'),
            'power', case when pm.power_amount is null then 'missing' else pm.source end,
            'diesel', case when pm.diesel_amount is not null then coalesce(pm.diesel_source, 'manual')
                           when exists (select 1 from cost.expense_lines l where l.category = 'fuel' and l.cost_month = mm.m) then 'register'
                           else 'missing' end,
            'tins', (select src from t where t.month = mm.m)) as src,
          (select jsonb_object_agg(x.cat, x.through) from cost.cat_through(mm.m) x) as through,
          exists (select 1 from cost.month_lock l where l.month = mm.m) as locked
        from mm left join cost.power_monthly pm on pm.month = mm.m) z), '[]'::jsonb));
end $$;

-- manual figure (Administrator and Manager)
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
    insert into cost.power_monthly (month, power_amount, note, source, updated_by) values (m, p_value, p_note, 'manual', auth.uid())
    on conflict (month) do update set power_amount = excluded.power_amount, note = coalesce(excluded.note, cost.power_monthly.note),
           source = 'manual', updated_by = auth.uid(), updated_at = now();
  elsif p_field = 'diesel' then
    insert into cost.power_monthly (month, diesel_amount, diesel_source, source, updated_by) values (m, p_value, 'manual', 'manual', auth.uid())
    on conflict (month) do update set diesel_amount = excluded.diesel_amount, diesel_source = 'manual', updated_by = auth.uid(), updated_at = now();
  else raise exception 'field_invalid'; end if;
  perform core.log('cost','master_save','master', m::text, jsonb_build_object('field', p_field, 'value', p_value, 'note', p_note));
end $$;

-- take a manual figure away again (labour, repair, consumable, safety, tins go back to upload / PMS)
create or replace function cost_api.master_clear(p_month date, p_field text) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','master_edit'); perform cost.assert_month_open(m);
  if p_field in ('labour','repair','consumable','safety','tins') then
    delete from cost.master_override where month = m and field = p_field;
  elsif p_field = 'power' then
    update cost.power_monthly set power_amount = null, updated_by = auth.uid(), updated_at = now() where month = m;
  elsif p_field = 'diesel' then
    update cost.power_monthly set diesel_amount = null, diesel_source = null, updated_by = auth.uid(), updated_at = now() where month = m;
  else raise exception 'field_invalid'; end if;
  perform core.log('cost','master_clear','master', m::text, jsonb_build_object('field', p_field));
end $$;

revoke all on function cost_api.master_get(date), cost_api.master_save(date,text,numeric,text), cost_api.master_clear(date,text) from public, anon;
grant execute on function cost_api.master_get(date), cost_api.master_save(date,text,numeric,text), cost_api.master_clear(date,text) to authenticated;
revoke all on function cost.pms_tins(date,date) from public, anon, authenticated;
