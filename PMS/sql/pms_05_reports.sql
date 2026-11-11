-- =====================================================================
-- pms_05_reports.sql -- stock ledger and the Daily / Production vs Dispatch / Inventory reports,
-- built to the rules of the old PMS Elite file. FOR REVIEW: nothing here has been applied to Supabase.
-- Load after pms_04.
--   CAN stock       : Opening + Production (actual; scrap is shown separately) - Dispatch (Outward)
--   Component stock : LID, BOTTOM, TAGGER only (Body is not a component here), per Job Name + Job Spec + Component.
--                     Production of the component - what the matching CAN (same Job Name + Spec, same exact date) used:
--                     BOTTOM -> CAN actual production + scrap ; LID and TAGGER -> CAN dispatch.
--   Stock is kept per Job Name + Job Spec (not per vendor / variant), as in the old file.
-- =====================================================================

-- opening stock is per Job Name + Spec + Component, as on the stock baseline date
alter table pms.opening_stock add column if not exists job_spec_id bigint references pms.job_specs(id);
update pms.opening_stock o set job_spec_id = jr.job_spec_id from pms.job_refs jr where jr.id = o.job_ref_id and o.job_spec_id is null;
alter table pms.opening_stock drop constraint if exists opening_stock_job_ref_id_component_as_of_key;
alter table pms.opening_stock drop column if exists job_ref_id;
alter table pms.opening_stock alter column job_spec_id set not null;
alter table pms.opening_stock drop constraint if exists opening_stock_component_check;
alter table pms.opening_stock add constraint opening_stock_component_chk check (component in ('CAN','LID','BOTTOM','TAGGER'));
create unique index if not exists opening_stock_uq on pms.opening_stock (job_spec_id, component, as_of);

insert into core.rules (module, key, value, effective_from, note)
select 'pms','stock_baseline_date','"2026-06-30"'::jsonb, date '2000-01-01','Opening stock is as of this date; the stock ledger rolls forward from the next day'
 where not exists (select 1 from core.rules where module='pms' and key='stock_baseline_date');

-- ------------------------------------------------------------ ledger helpers
create or replace function pms.baseline() returns date
language sql stable as $$ select coalesce((core.rule_value('pms','stock_baseline_date') #>> '{}')::date, date '2026-06-30') $$;

-- CAN balance AFTER day d
create or replace function pms.stock_can(p_spec bigint, p_d date) returns numeric
language sql stable as $$
  select coalesce((select sum(qty) from pms.opening_stock where job_spec_id=p_spec and component='CAN' and as_of=pms.baseline()),0)
       + coalesce((select sum(p.actual_production) from pms.production p join pms.job_refs r on r.id=p.job_ref_id
                    where r.job_spec_id=p_spec and p.component='CAN' and p.entry_date>pms.baseline() and p.entry_date<=p_d),0)
       - coalesce((select sum(o.dispatch_qty) from pms.outward o join pms.job_refs r on r.id=o.job_ref_id
                    where r.job_spec_id=p_spec and o.entry_date>pms.baseline() and o.entry_date<=p_d),0) $$;

-- what a component used up between two dates (from exclusive, to inclusive)
create or replace function pms.comp_used(p_spec bigint, p_comp text, p_from date, p_to date) returns numeric
language sql stable as $$
  select case when p_comp='BOTTOM' then
    coalesce((select sum(coalesce(p.actual_production,0)+coalesce(p.scrap,0)) from pms.production p join pms.job_refs r on r.id=p.job_ref_id
               where r.job_spec_id=p_spec and p.component='CAN' and p.entry_date>p_from and p.entry_date<=p_to),0)
  else
    coalesce((select sum(o.dispatch_qty) from pms.outward o join pms.job_refs r on r.id=o.job_ref_id
               where r.job_spec_id=p_spec and o.entry_date>p_from and o.entry_date<=p_to),0) end $$;

create or replace function pms.comp_made(p_spec bigint, p_comp text, p_from date, p_to date) returns numeric
language sql stable as $$
  select coalesce((select sum(p.actual_production) from pms.production p join pms.job_refs r on r.id=p.job_ref_id
                    where r.job_spec_id=p_spec and p.component=p_comp and p.entry_date>p_from and p.entry_date<=p_to),0) $$;

-- component balance AFTER day d
create or replace function pms.stock_comp(p_spec bigint, p_comp text, p_d date) returns numeric
language sql stable as $$
  select coalesce((select sum(qty) from pms.opening_stock where job_spec_id=p_spec and component=p_comp and as_of=pms.baseline()),0)
       + pms.comp_made(p_spec,p_comp,pms.baseline(),p_d) - pms.comp_used(p_spec,p_comp,pms.baseline(),p_d) $$;

-- a job spec carries a component only if it has opening stock or any production of it
create or replace function pms.has_comp(p_spec bigint, p_comp text) returns boolean
language sql stable as $$
  select exists (select 1 from pms.opening_stock where job_spec_id=p_spec and component=p_comp)
      or exists (select 1 from pms.production p join pms.job_refs r on r.id=p.job_ref_id where r.job_spec_id=p_spec and p.component=p_comp) $$;

create or replace function pms.spec_label(p_spec bigint) returns table (job text, spec text)
language sql stable as $$ select j.name, js.spec from pms.job_specs js join pms.jobs j on j.id=js.job_id where js.id=p_spec $$;

-- ------------------------------------------------------------ Daily production report
-- p_mode 'CAN' or 'COMPONENTS'. Also returns the Non-Moving list (CAN mode).
drop function if exists pms_api.rep_daily(date);
create or replace function pms_api.rep_daily(p_date date, p_mode text default 'CAN', p_job text default null, p_comp text default null) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
declare pv date := p_date - 1; nm int := coalesce((core.rule_value('pms','non_moving_months'))::text::int, 3); rows jsonb; nmv jsonb;
begin
  perform core.assert_perm('pms','reports_view');
  if upper(p_mode) = 'CAN' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.job, x.spec),'[]') into rows from (
      select l.job, l.spec,
             pms.stock_can(s.id, pv) as opening,
             coalesce((select sum(p.actual_production) from pms.production p join pms.job_refs r on r.id=p.job_ref_id where r.job_spec_id=s.id and p.component='CAN' and p.entry_date=p_date),0) as production,
             coalesce((select sum(p.fg)  from pms.production p join pms.job_refs r on r.id=p.job_ref_id where r.job_spec_id=s.id and p.component='CAN' and p.entry_date=p_date),0) as fg,
             coalesce((select sum(p.sfg) from pms.production p join pms.job_refs r on r.id=p.job_ref_id where r.job_spec_id=s.id and p.component='CAN' and p.entry_date=p_date),0) as sfg,
             coalesce((select sum(p.scrap) from pms.production p join pms.job_refs r on r.id=p.job_ref_id where r.job_spec_id=s.id and p.component='CAN' and p.entry_date=p_date),0) as scrap,
             coalesce((select sum(o.dispatch_qty) from pms.outward o join pms.job_refs r on r.id=o.job_ref_id where r.job_spec_id=s.id and o.entry_date=p_date),0) as dispatch,
             pms.stock_can(s.id, p_date) as closing
        from pms.job_specs s cross join lateral pms.spec_label(s.id) l
       where (p_job is null or l.job = pms.norm(p_job))
         and (exists (select 1 from pms.production p join pms.job_refs r on r.id=p.job_ref_id where r.job_spec_id=s.id and p.component='CAN' and p.entry_date=p_date)
           or exists (select 1 from pms.outward o join pms.job_refs r on r.id=o.job_ref_id where r.job_spec_id=s.id and o.entry_date=p_date))) x;
    -- Non-Moving: stock still there, and no CAN production for the non-moving age (or none at all since the opening stock)
    select coalesce(jsonb_agg(to_jsonb(y) order by y.job, y.spec),'[]') into nmv from (
      select l.job, l.spec, pms.stock_can(s.id, p_date) as stock,
             (select max(p.entry_date) from pms.production p join pms.job_refs r on r.id=p.job_ref_id
               where r.job_spec_id=s.id and p.component='CAN' and p.actual_production>0 and p.entry_date<=p_date) as last_production
        from pms.job_specs s cross join lateral pms.spec_label(s.id) l
       where (p_job is null or l.job = pms.norm(p_job)) and pms.stock_can(s.id, p_date) > 0
         and coalesce((select max(p.entry_date) from pms.production p join pms.job_refs r on r.id=p.job_ref_id
                        where r.job_spec_id=s.id and p.component='CAN' and p.actual_production>0 and p.entry_date<=p_date), pms.baseline()) < p_date - nm*30) y;
  else
    select coalesce(jsonb_agg(to_jsonb(x) order by x.job, x.spec, x.component),'[]') into rows from (
      select l.job, l.spec, c.comp as component,
             pms.stock_comp(s.id, c.comp, pv) as opening,
             pms.comp_made(s.id, c.comp, pv, p_date) as production,
             pms.comp_used(s.id, c.comp, pv, p_date) as consumption,
             pms.stock_comp(s.id, c.comp, p_date) as closing,
             pms.stock_comp(s.id, c.comp, p_date) < 0 as below_zero
        from pms.job_specs s cross join lateral pms.spec_label(s.id) l cross join (values ('LID'),('BOTTOM'),('TAGGER')) c(comp)
       where (p_job is null or l.job = pms.norm(p_job)) and (p_comp is null or c.comp = upper(p_comp))
         and pms.has_comp(s.id, c.comp)
         and (pms.comp_made(s.id, c.comp, pv, p_date) <> 0 or pms.comp_used(s.id, c.comp, pv, p_date) <> 0)) x;
  end if;
  return jsonb_build_object('mode', upper(p_mode), 'date', p_date, 'rows', rows, 'non_moving', coalesce(nmv,'[]'));
end $$;

-- ------------------------------------------------------------ Production vs Dispatch (the matching report)
-- Status: Opening + Production = Dispatch -> Dispatched ; more -> Stock ; less -> Error
drop function if exists pms_api.rep_recon(date, date);
create or replace function pms_api.rep_recon(p_from date, p_to date, p_job text default null) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.job, x.spec) from (
    select l.job, l.spec, op as opening, pr as production, dp as dispatch, op + pr - dp as closing,
           case when op + pr < dp then 'Error' when op + pr = dp then 'Dispatched' else 'Stock' end as status
      from pms.job_specs s cross join lateral pms.spec_label(s.id) l
      cross join lateral (select pms.stock_can(s.id, greatest(p_from - 1, pms.baseline())) as op,
             coalesce((select sum(p.actual_production) from pms.production p join pms.job_refs r on r.id=p.job_ref_id
                        where r.job_spec_id=s.id and p.component='CAN' and p.entry_date>=p_from and p.entry_date<=p_to),0) as pr,
             coalesce((select sum(o.dispatch_qty) from pms.outward o join pms.job_refs r on r.id=o.job_ref_id
                        where r.job_spec_id=s.id and o.entry_date>=p_from and o.entry_date<=p_to),0) as dp) v
     where (p_job is null or l.job = pms.norm(p_job)) and (pr <> 0 or dp <> 0)) x), '[]');
end $$;

-- ------------------------------------------------------------ Stock summary and Inventory use the same ledger
create or replace function pms_api.stock_summary() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.job, x.spec, x.component) from (
    select l.job, l.spec, c.comp as component,
           case when c.comp='CAN' then pms.stock_can(s.id, current_date) else pms.stock_comp(s.id, c.comp, current_date) end as in_stock
      from pms.job_specs s cross join lateral pms.spec_label(s.id) l cross join (values ('CAN'),('LID'),('BOTTOM'),('TAGGER')) c(comp)
     where (c.comp='CAN' or pms.has_comp(s.id, c.comp))) x where x.in_stock <> 0), '[]');
end $$;

drop function if exists pms_api.rep_inventory();
create or replace function pms_api.rep_inventory() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
declare nm int := coalesce((core.rule_value('pms','non_moving_months'))::text::int, 3);
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(y) order by y.job, y.spec, y.component) from (
    select x.*, coalesce(x.last_production, pms.baseline()) < current_date - nm*30 as non_moving from (
      select l.job, l.spec, c.comp as component,
             case when c.comp='CAN' then pms.stock_can(s.id, current_date) else pms.stock_comp(s.id, c.comp, current_date) end as in_stock,
             (select max(p.entry_date) from pms.production p join pms.job_refs r on r.id=p.job_ref_id
               where r.job_spec_id=s.id and p.component=c.comp and p.actual_production>0) as last_production
        from pms.job_specs s cross join lateral pms.spec_label(s.id) l cross join (values ('CAN'),('LID'),('BOTTOM'),('TAGGER')) c(comp)
       where c.comp='CAN' or pms.has_comp(s.id, c.comp)) x where x.in_stock <> 0) y), '[]');
end $$;

-- opening stock entry (Admin only): p = {job:{shape,job,spec}, component, qty}
create or replace function pms_api.opening_save(p jsonb) returns void
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare sp bigint;
begin
  perform core.assert_perm('pms','opening_edit');
  if upper(p->>'component') not in ('CAN','LID','BOTTOM','TAGGER') then raise exception 'bad_component'; end if;
  if nullif(btrim(p->>'reason'),'') is null then raise exception 'reason_required'; end if;
  sp := pms.spec_ensure(pms.shape_ensure(p#>>'{job,shape}'), p#>>'{job,job}', p#>>'{job,spec}');
  insert into pms.opening_stock (job_spec_id, component, qty, as_of, reason, created_by)
  values (sp, upper(p->>'component'), (p->>'qty')::numeric, pms.baseline(), p->>'reason', auth.uid())
  on conflict (job_spec_id, component, as_of) do update set qty=excluded.qty, reason=excluded.reason, created_by=auth.uid();
  perform core.log('pms','opening_save','opening_stock', sp::text, p);
end $$;

-- ------------------------------------------------------------ grants
revoke all on all functions in schema pms from public, anon, authenticated;
revoke all on all functions in schema pms_api from public, anon;
grant usage on schema pms_api to authenticated;
grant execute on all functions in schema pms_api to authenticated;
