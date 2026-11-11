-- =====================================================================
-- pms_03_changes.sql -- changes on top of pms_01 / pms_02 after the screens were finalised.
-- FOR REVIEW: nothing here has been applied to Supabase.
-- Load order: 01_core, payroll_schema, pms_01, pms_02, pms_03, pms_04.
-- =====================================================================

-- ---------------------------------------------------------- 1. roles
insert into core.roles (code, name, sort_order) values ('quality','Quality',80) on conflict (code) do nothing;

-- permissions: manpower now comes from Payroll punches, Quality is edited by the Quality role only
delete from core.role_permissions where module='pms' and (permission in ('manpower_enter','manpower_view','quality_enter') or role_code='hr');
delete from core.permissions      where module='pms' and code in ('manpower_enter','manpower_view','quality_enter');
insert into core.permissions (module, code, description) values
  ('pms','jobmaster_edit','Edit the Job Master and Job Calculator layouts (Quality)'),
  ('pms','matrix_edit',   'Edit the Man Power Matrix'),
  ('pms','status_view',   'See the Status check (last entry per module)')
on conflict do nothing;
-- Admin and Manager: everything. Quality: Job Master. HR: only the reports (Payroll reads cans produced)
insert into core.role_permissions (module, role_code, permission)
select 'pms', r, p.code from (values ('admin'),('manager')) x(r) join core.permissions p on p.module='pms'
on conflict do nothing;
insert into core.role_permissions (module, role_code, permission) values
  ('pms','quality','jobmaster_edit'), ('pms','quality','reports_view'),
  ('pms','hr','reports_view'),
  ('pms','scm','reports_view'), ('pms','production','reports_view')
on conflict do nothing;

-- ------------------------------------------------ 2. drop draft tables
drop table if exists pms.manpower_daily;
drop table if exists pms.quality;

-- --------------------------------------------- 3. Job Master (shared)
-- One row per Shape > Job Name > Job Spec. The Quality app and PMS read and write THIS table.
-- Only the Quality role edits it (pms_api.job_master_save). Entry screens may create a DRAFT row
-- (is_draft) when someone types a new spec; Quality completes it. Nothing is loaded from the workbook.
create table if not exists pms.job_master (
  job_spec_id bigint primary key references pms.job_specs(id),
  lid_type    text check (lid_type is null or lid_type in ('SLIP','PLUG','NECK LID','INNER TYPE')),
  height      numeric(8,2),
  body_w numeric(8,2), body_h numeric(8,2), body_t numeric(5,3),      -- body blank (bw, bh, bt)
  lid_w  numeric(8,2), lid_h  numeric(8,2), lid_t  numeric(5,3),
  bot_w  numeric(8,2), bot_h  numeric(8,2), bot_t  numeric(5,3),
  wt_body numeric(10,3), wt_lid numeric(10,3), wt_bottom numeric(10,3),  -- typed weights (g), used when no base weight
  body_base_t numeric(5,3), body_base_wt numeric(10,3),                    -- bbt, bbw
  lid_base_t  numeric(5,3), lid_base_wt  numeric(10,3),                    -- lbt, lbw
  bot_base_t  numeric(5,3), bot_base_wt  numeric(10,3),                    -- tbt, tbw
  picture_name text,
  is_draft    boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz
);

-- weights exactly as the Quality sheet: body = W x H x T x 0.785 / 100 (g); lid / bottom = base weight / base thickness x thickness
create or replace function pms.jm_scale(p_base numeric, p_bt numeric, p_t numeric) returns numeric
language sql immutable as $$ select case when p_base>0 and p_bt>0 and p_t>0 then round(p_base/p_bt*p_t, 2) end $$;
create or replace function pms.jm_body(j pms.job_master) returns numeric
language sql immutable as $$
  select case when j.body_w>0 and j.body_h>0 and j.body_t>0 then round(j.body_w*j.body_h*j.body_t*0.785/100, 2) else nullif(j.wt_body,0) end $$;
create or replace function pms.jm_lid(j pms.job_master) returns numeric
language sql immutable as $$ select coalesce(pms.jm_scale(j.lid_base_wt, j.lid_base_t, j.lid_t), nullif(j.wt_lid,0)) $$;
create or replace function pms.jm_bot(j pms.job_master) returns numeric
language sql immutable as $$ select coalesce(pms.jm_scale(j.bot_base_wt, j.bot_base_t, j.bot_t), nullif(j.wt_bottom,0)) $$;

-- every new job spec gets a draft Job Master row so the Quality app can see what is missing
create or replace function pms.trg_spec_draft() returns trigger
language plpgsql security definer set search_path = pms, pg_temp as $$
begin
  insert into pms.job_master (job_spec_id, created_by) values (new.id, auth.uid()) on conflict do nothing;
  return new;
end $$;
drop trigger if exists spec_draft on pms.job_specs;
create trigger spec_draft after insert on pms.job_specs for each row execute function pms.trg_spec_draft();
insert into pms.job_master (job_spec_id) select id from pms.job_specs on conflict do nothing;

-- Job Calculator: the saved layout for a job spec (sheet L, B, W and numbers of body / lid / bottom per sheet, strip gauge)
create table if not exists pms.job_calc_layouts (
  job_spec_id bigint primary key references pms.job_specs(id),
  sheet_l numeric(10,2), sheet_b numeric(10,2), sheet_w numeric(10,3),
  nb numeric(8,2), nl numeric(8,2), nt numeric(8,2), sg numeric(8,2),
  updated_by uuid, updated_at timestamptz not null default now()
);

-- ------------------------------------ 4. Man Power Matrix by component
alter table pms.job_standards
  add column if not exists body_mp   numeric(8,2),        -- typed man power per component (null = split automatically)
  add column if not exists lid_mp    numeric(8,2),
  add column if not exists bottom_mp numeric(8,2),
  add column if not exists updated_by uuid,
  add column if not exists updated_at timestamptz;

-- man power for one component of a job (CAN = typed total or sum of typed components);
-- components not typed share what is left of the CAN man power, one by one Body > Lid > Bottom
create or replace function pms.mp_for(p_job bigint, p_comp text, p_comps text[] default array['BODY','LID','BOTTOM']) returns numeric
language plpgsql stable as $$
declare s pms.job_standards; typed numeric; n int; base int; extra int; idx int; res numeric;
begin
  select * into s from pms.job_standards where job_id = p_job;
  if s.job_id is null then return null; end if;
  typed := coalesce(s.body_mp,0)+coalesce(s.lid_mp,0)+coalesce(s.bottom_mp,0);
  -- components of this job that have no typed man power
  n := (select count(*) from unnest(p_comps) c where
          case c when 'BODY' then s.body_mp when 'LID' then s.lid_mp else s.bottom_mp end is null);
  if p_comp = 'CAN' then
    if typed = 0 then return s.man_power; end if;
    return case when n = 0 then typed else greatest(coalesce(s.man_power,0), typed) end;   -- typed parts + automatic remainder
  end if;
  if p_comp not in ('BODY','LID','BOTTOM') then return null; end if;
  res := case p_comp when 'BODY' then s.body_mp when 'LID' then s.lid_mp else s.bottom_mp end;
  if res is not null then return res; end if;
  if s.man_power is null or n = 0 or not (p_comp = any(p_comps)) then return null; end if;
  -- automatic split of what is left of the CAN man power, one by one Body > Lid > Bottom
  base := floor(greatest(s.man_power - typed, 0) / n);  extra := (greatest(s.man_power - typed, 0) - base*n)::int;
  idx := (select count(*) from unnest(array['BODY','LID','BOTTOM']) c
           where c = any(p_comps) and c <> p_comp
             and case c when 'BODY' then s.body_mp when 'LID' then s.lid_mp else s.bottom_mp end is null
             and array_position(array['BODY','LID','BOTTOM'], c) < array_position(array['BODY','LID','BOTTOM'], p_comp));
  return base + case when idx < extra then 1 else 0 end;
end $$;

-- ------------------------------------------------------ 5. Rules
insert into core.rules (module, key, value, effective_from, note)
select 'pms', k, v, date '2000-01-01', n from (values
  ('mp_entry_mode',   '"suggested"'::jsonb, 'Man power per job: suggested (system splits) or manual'),
  ('shift_hours',     '8'::jsonb,   'Shift hours used to turn man-hours into man power'),
  ('break1_from',     '8.5'::jsonb, 'Punch hours from which the first break is removed'),
  ('break1_min',      '30'::jsonb,  'First break (minutes)'),
  ('break2_from',     '12'::jsonb,  'Punch hours from which the second break is removed'),
  ('break2_min',      '60'::jsonb,  'Break at the second tier (minutes, total)'),
  ('max_punch_hours', '14'::jsonb,  'Longest punch counted in a day'),
  ('mp_gap_percent',  '10'::jsonb,  'Warn when booked man power differs from the Payroll figure by more than this percent'),
  ('mp_designations', '["HELPER","OPER","OPERATOR","PROD"]'::jsonb, 'Payroll designations counted as production man power')
) x(k, v, n)
where not exists (select 1 from core.rules r where r.module='pms' and r.key=x.k);

-- ------------------------------ 6. skid status is computed, not stored
-- Instock = no slitting yet; WIP = sheets left above the threshold; Used = otherwise. Moved / Closed are manual.
alter table pms.inward_skids add column if not exists manual_state text check (manual_state in ('Moved','Closed'));
update pms.inward_skids set manual_state = status where status in ('Moved','Closed');
alter table pms.inward_skids drop column if exists status;

create or replace function pms.skid_used(p_skid bigint) returns numeric
language sql stable as $$ select coalesce(sum(slitting_count),0) from pms.slitting where skid_id = p_skid $$;
create or replace function pms.skid_state(p_skid bigint) returns text
language plpgsql stable as $$
declare i pms.inward_skids; th numeric := coalesce((core.rule_value('pms','skid_wip_used_threshold'))::text::numeric, 50);
begin
  select * into i from pms.inward_skids where id = p_skid;
  if i.manual_state is not null then return i.manual_state; end if;
  if not exists (select 1 from pms.slitting where skid_id = p_skid) then return 'Instock'; end if;
  return case when coalesce(i.weight_in_nos,0) - pms.skid_used(p_skid) > th then 'WIP' else 'Used' end;
end $$;

-- ----------------------------- 7. workbook-format Job ID (same as the screens)
-- JOB(3)-COLOUR(3)-VARIANT initials+numbers-SHAPE(8)-VENDOR first word-SPEC without X
create or replace function pms.job_code(p_colour text, p_variant text, p_shape text, p_vendor text, p_job text, p_spec text) returns text
language plpgsql immutable as $$
declare w text[]; letters text := ''; nums text := ''; x text;
begin
  w := regexp_split_to_array(btrim(upper(coalesce(p_variant,''))), '\s+');
  foreach x in array w loop
    if x = '' or x = 'VARIANT' then continue; end if;
    if x ~ '^[0-9.]+$' then nums := nums || x; else letters := letters || left(x,1); end if;
  end loop;
  return concat_ws('-', left(upper(btrim(coalesce(p_job,''))),3), left(upper(btrim(coalesce(p_colour,''))),3), letters||nums,
                   left(replace(upper(btrim(coalesce(p_shape,''))),' ',''),8),
                   split_part(upper(btrim(coalesce(p_vendor,'')))||' ',' ',1),
                   replace(upper(btrim(coalesce(p_spec,''))),'X',''));
end $$;

-- store the workbook-format ID on every Job ID row (the old SHAPE-COLOUR-... code is replaced)
create or replace function pms.job_ref_code(p_id bigint) returns text
language sql stable as $$
  select pms.job_code(c.name, va.name, s.name, ve.name, j.name, js.spec)
    from pms.job_refs r join pms.colours c on c.id=r.colour_id join pms.vendors ve on ve.id=r.vendor_id
    join pms.variants va on va.id=r.variant_id join pms.job_specs js on js.id=r.job_spec_id
    join pms.jobs j on j.id=js.job_id join pms.shapes s on s.id=j.shape_id where r.id=p_id $$;
-- the short workbook ID can repeat across different jobs (first 3 letters), so it is a label, not the key
alter table pms.job_refs drop constraint if exists job_refs_code_key;
update pms.job_refs set code = pms.job_ref_code(id);

-- ------------------------- 8. production: man power / hours are required
alter table pms.production drop constraint if exists production_mp_hours_chk;
alter table pms.production add constraint production_mp_hours_chk
  check (man_power > 0 and hours > 0) not valid;     -- NOT VALID: applies to new / edited rows only

-- lock down the new tables
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'pms' loop
    execute format('alter table pms.%I enable row level security', t);
    execute format('alter table pms.%I force row level security', t);
  end loop; end $$;
revoke all on all tables in schema pms from public, anon, authenticated;
