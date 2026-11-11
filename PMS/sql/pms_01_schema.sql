-- =====================================================================
-- pms_01_schema.sql -- PMS tables (schema "pms"). Classic Pack Pvt Ltd.
-- Requires 01_core.sql. FOR REVIEW: nothing here has been applied to Supabase.
-- Same lock-down as payroll: RLS on and forced, no policies, no grants.
-- The website reaches the data only through pms_api functions.
-- The Sale Order sheet is NOT a table: vendors and variants are plain
-- master lists that grow when a user types a new one on an entry screen.
-- =====================================================================
create schema if not exists pms;
create schema if not exists pms_api;

-- roles used by PMS departments (shared role list)
insert into core.roles (code, name, sort_order) values
  ('scm','SCM',60), ('production','Production',70)
on conflict (code) do nothing;

-- ------------------------------------------------------------ masters
create table if not exists pms.vendors (
  id           bigint generated always as identity primary key,
  name         text not null unique check (name = upper(btrim(name)) and length(name) > 0),
  code         text not null unique check (code = upper(code)),
  active       boolean not null default true,
  needs_review boolean not null default false,
  created_by   uuid, created_at timestamptz not null default now()
);
create table if not exists pms.vendor_aliases (
  alias      text primary key check (alias = upper(btrim(alias))),
  vendor_id  bigint not null references pms.vendors(id) on delete cascade
);
create table if not exists pms.variants (
  id         bigint generated always as identity primary key,
  vendor_id  bigint not null references pms.vendors(id),
  name       text not null check (name = upper(btrim(name)) and length(name) > 0),
  code       text not null,
  active     boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(),
  unique (vendor_id, name), unique (vendor_id, code)
);
create table if not exists pms.shapes (
  id bigint generated always as identity primary key,
  name text not null unique check (name = upper(btrim(name))),
  code text not null unique
);
create table if not exists pms.colours (
  id bigint generated always as identity primary key,
  name text not null unique check (name = upper(btrim(name))),
  code text not null unique
);
create table if not exists pms.jobs (
  id bigint generated always as identity primary key,
  shape_id bigint not null references pms.shapes(id),
  name text not null check (name = upper(btrim(name))),
  unique (shape_id, name)
);
create table if not exists pms.job_specs (
  id bigint generated always as identity primary key,
  job_id bigint not null references pms.jobs(id),
  spec text not null check (spec = upper(btrim(spec))),
  unique (job_id, spec)
);
create table if not exists pms.job_standards (          -- from MAN POWER MATRIX
  job_id bigint primary key references pms.jobs(id),
  target_qty_8h numeric(12,2), man_power numeric(8,2)
);
create table if not exists pms.components (
  code text primary key check (code = upper(code)),
  sort_order int not null default 100,
  fg_allowed boolean not null default true,
  sfg_allowed boolean not null default false
);
-- permanent Job ID for one Vendor + Variant + Shape + Colour + Job + Spec
create table if not exists pms.job_refs (
  id          bigint generated always as identity primary key,
  code        text not null unique,                      -- SHAPE-COLOUR-VENDORCODE-VARIANTCODE-JOB-SPEC
  colour_id   bigint not null references pms.colours(id),
  vendor_id   bigint not null references pms.vendors(id),
  variant_id  bigint not null references pms.variants(id),
  job_spec_id bigint not null references pms.job_specs(id),
  active      boolean not null default true,
  created_by  uuid, created_at timestamptz not null default now(),
  unique (colour_id, vendor_id, variant_id, job_spec_id)
);
create table if not exists pms.carton_items (
  id bigint generated always as identity primary key,
  variation text not null, name text not null, active boolean not null default true,
  unique (variation, name)
);
create table if not exists pms.alum_tape_items (
  id bigint generated always as identity primary key,
  name text not null unique, active boolean not null default true
);

-- ------------------------------------------------------- transactions
-- every row: created_by/at, updated_by/at. Edits are allowed for the edit_window_days
-- rule, after that only users with the edit_old permission.
create table if not exists pms.inward_skids (
  id bigint generated always as identity primary key,
  skid_no text not null unique,
  entry_date date not null,
  dc_no text, received_from text,
  so_no text,                                   -- optional plain text, no Sale Order table
  stock_reason text,                            -- used when there is no sale order
  job_ref_id bigint not null references pms.job_refs(id),
  components_in_skid text,
  gross_wt numeric(12,3), net_wt numeric(12,3),
  sheet_l numeric(10,2), sheet_b numeric(10,2), sheet_w numeric(10,3),
  single_sheet_wt numeric(12,6), weight_in_nos numeric(14,2),
  status text not null default 'Instock' check (status in ('Instock','WIP','Used','Moved','Closed')),
  used_date date, status_note text,
  created_by uuid, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz
);
create index if not exists inward_date_idx on pms.inward_skids (entry_date);
create table if not exists pms.slitting (
  id bigint generated always as identity primary key,
  entry_date date not null,
  skid_id bigint not null references pms.inward_skids(id),
  -- editable copies of inward details (editing never changes inward)
  components_in_skid text, gross_wt numeric(12,3), net_wt numeric(12,3),
  sheet_l numeric(10,2), sheet_b numeric(10,2), sheet_w numeric(10,3),
  single_sheet_wt numeric(12,6), weight_in_nos numeric(14,2), slitting_count numeric(12,2),
  body_layout numeric(12,2), lid_layout numeric(12,2), bottom_layout numeric(12,2),
  body_sl numeric(14,2), lid_sl numeric(14,2), bottom_sl numeric(14,2), expected_production numeric(14,2),
  strip_wt numeric(12,3), lid_jl numeric(12,3), bottom_jl numeric(12,3),
  body_wt numeric(12,4), lid_wt numeric(12,4), bottom_wt numeric(12,4), tin_wt numeric(12,4),
  bifurcated_skid numeric(12,3), raw_skid numeric(12,3), variance numeric(12,3),
  created_by uuid, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz
);
create index if not exists slitting_date_idx on pms.slitting (entry_date);
create table if not exists pms.quality (
  id bigint generated always as identity primary key,
  entry_date date, job_spec_id bigint not null references pms.job_specs(id),
  sheet_l numeric(10,2), sheet_b numeric(10,2), sheet_w numeric(10,3),
  body_l numeric(10,2), body_b numeric(10,2), body_t numeric(10,3),
  lid_l numeric(10,2), lid_b numeric(10,2), lid_t numeric(10,3),
  bottom_l numeric(10,2), bottom_b numeric(10,2), bottom_t numeric(10,3),
  wt_body_blank numeric(12,4), wt_lid_blank numeric(12,4), wt_bottom_blank numeric(12,4),
  wt_body numeric(12,4), wt_lid numeric(12,4), wt_bottom numeric(12,4), wt_can numeric(12,4), wt_strip numeric(12,4),
  jally_lid numeric(12,4), jally_bottom numeric(12,4),
  created_by uuid, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz
);
create table if not exists pms.production (
  id bigint generated always as identity primary key,
  entry_date date not null,
  job_ref_id bigint not null references pms.job_refs(id),
  component text not null references pms.components(code),
  actual_production numeric(14,2) not null default 0,
  man_power numeric(8,2), hours numeric(8,2), expected_man_power numeric(8,2),
  fg numeric(14,2), sfg numeric(14,2), scrap numeric(14,2),
  carton_item_id bigint references pms.carton_items(id), carton_qty numeric(12,2),
  created_by uuid, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz
);
create index if not exists production_date_idx on pms.production (entry_date);
create index if not exists production_job_idx on pms.production (job_ref_id, entry_date);
create table if not exists pms.outward (
  id bigint generated always as identity primary key,
  entry_date date not null, so_no text,
  job_ref_id bigint not null references pms.job_refs(id),
  boxes numeric(12,2), packing_style text, dispatch_qty numeric(14,2) not null default 0,
  invoice text, dc_no text, transport_contact text, vehicle_no text,
  created_by uuid, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz
);
create index if not exists outward_date_idx on pms.outward (entry_date);
create table if not exists pms.scrap (
  id bigint generated always as identity primary key,
  entry_date date not null,
  job_ref_id bigint not null references pms.job_refs(id),
  kg_body numeric(12,3), kg_lid numeric(12,3), kg_bottom numeric(12,3), kg_body_bottom numeric(12,3),
  wt_body numeric(12,4), wt_lid numeric(12,4), wt_bottom numeric(12,4), wt_body_bottom numeric(12,4),
  count_body numeric(12,2), count_lid numeric(12,2), count_bottom numeric(12,2),
  created_by uuid, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz
);
create index if not exists scrap_date_idx on pms.scrap (entry_date);
create table if not exists pms.carton_ledger (
  id bigint generated always as identity primary key,
  entry_date date not null, item_id bigint not null references pms.carton_items(id),
  entry_type text not null check (entry_type in ('PURCHASE','ISSUED')), qty numeric(14,2) not null,
  created_by uuid, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz
);
create table if not exists pms.alum_tape_ledger (
  id bigint generated always as identity primary key,
  entry_date date not null, item_id bigint not null references pms.alum_tape_items(id),
  entry_type text not null check (entry_type in ('PURCHASE','ISSUED')), qty numeric(14,2) not null,
  created_by uuid, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz
);
create table if not exists pms.manpower_daily (
  id bigint generated always as identity primary key,
  entry_date date not null unique,
  total_hc int, planned_absent int, unplanned_absent int,
  present_production int, present_admin int, present_housekeeping int, present_loading int, present_security int,
  ot_hours numeric(8,2), actual_production_mp numeric(8,2),
  created_by uuid, created_at timestamptz not null default now(), updated_by uuid, updated_at timestamptz
);
create table if not exists pms.opening_stock (
  id bigint generated always as identity primary key,
  job_ref_id bigint not null references pms.job_refs(id),
  component text not null references pms.components(code),
  qty numeric(14,2) not null, as_of date not null, reason text not null,
  created_by uuid, created_at timestamptz not null default now(),
  unique (job_ref_id, component, as_of)
);

-- lock down
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'pms' loop
    execute format('alter table pms.%I enable row level security', t);
    execute format('alter table pms.%I force row level security', t);
  end loop; end $$;
revoke all on all tables in schema pms from public, anon, authenticated;

-- ------------------------------------------------------- permissions
insert into core.permissions (module, code, description) values
  ('pms','masters_add',     'Add a vendor, variant, shape, job or spec from an entry screen'),
  ('pms','inward_enter',    'Enter and edit inward skids'),
  ('pms','slitting_enter',  'Enter and edit slitting'),
  ('pms','production_enter','Enter and edit production'),
  ('pms','outward_enter',   'Enter and edit outward (dispatch)'),
  ('pms','scrap_enter',     'Enter and edit scrap'),
  ('pms','quality_enter',   'Enter and edit quality'),
  ('pms','ledger_enter',    'Enter carton and alum / tape purchase and issue'),
  ('pms','manpower_enter',  'Enter the daily manpower sheet'),
  ('pms','skid_close',      'Close or move a skid'),
  ('pms','edit_old',        'Edit or delete an entry after the edit window'),
  ('pms','opening_edit',    'Enter opening stock'),
  ('pms','reports_view',    'View production, skid, stock and dispatch reports'),
  ('pms','manpower_view',   'View manpower sheet and reports'),
  ('pms','rules_edit',      'Edit PMS rules')
on conflict do nothing;

insert into core.role_permissions (module, role_code, permission)
select 'pms', r.role_code, p.code
  from (values ('admin'), ('scm'), ('production'), ('hr')) r(role_code)
  join core.permissions p on p.module = 'pms'
 where r.role_code = 'admin'
    or (r.role_code = 'scm'        and p.code in ('masters_add','inward_enter','outward_enter','scrap_enter','quality_enter','ledger_enter','skid_close','reports_view'))
    or (r.role_code = 'production' and p.code in ('masters_add','slitting_enter','production_enter','skid_close','reports_view'))
    or (r.role_code = 'hr'         and p.code in ('manpower_enter','manpower_view'))
on conflict do nothing;

-- ----------------------------------------------------------- rules
-- same shape as payroll rules (core.rules). Edited by Admin on the Rules screen.
insert into core.rules (module, key, value, effective_from, note)
select 'pms', k, v, date '2000-01-01', n from (values
  ('skid_wip_used_threshold', '50'::jsonb, 'Global WIP / USED skid threshold'),
  ('edit_window_days',        '7'::jsonb,  'Entries can be edited for this many days; after that only Admin'),
  ('non_moving_months',       '3'::jsonb,  'An Instock skid older than this is Non-Moving'),
  ('negative_stock_mode',     '"warn"'::jsonb, 'warn or block when a closing stock would go negative'),
  ('data_log_amber_days',     '2'::jsonb,  'Data log turns amber from this many days pending'),
  ('data_log_red_days',       '4'::jsonb,  'Data log turns red from this many days pending')
) x(k, v, n)
where not exists (select 1 from core.rules r where r.module = 'pms' and r.key = x.k);

-- ------------------------------------------------------- seeds
insert into pms.shapes (name, code) values
  ('RECTANGLE','RC'),('SQUARE','SQ'),('ROUND','RD'),('OVAL','OV'),('HEXAGON','HX') on conflict do nothing;
insert into pms.colours (name, code) values
  ('PRINTED','PR'),('COLOR','CL'),('GOLD','GD'),('CLEAR','CR') on conflict do nothing;
insert into pms.components (code, sort_order, fg_allowed, sfg_allowed) values
  ('CAN',1,true,true),('BODY',2,true,false),('LID',3,true,false),('BOTTOM',4,true,false),
  ('TAGGER',5,false,false) on conflict do nothing;

-- ------------------------------------------------ dropped Sale Order sheet
-- The Sale Order sheet is dropped (uploaded) by SCM/Admin. It is a read-only source for entry
-- screens: picking an SO line fills Vendor, Variant, Colour, Description and Qty.
-- Data entry then only chooses Shape, Job Name and Job Spec.
create table if not exists pms.so_lines (
  id          bigint generated always as identity primary key,
  so_no       text not null,
  so_date     date,
  vendor_id   bigint not null references pms.vendors(id),
  variant_id  bigint not null references pms.variants(id),
  colour_id   bigint references pms.colours(id),
  description text not null default '',
  qty         numeric(14,2),
  status      text,
  dropped_by  uuid, dropped_at timestamptz not null default now(),
  unique (so_no, variant_id, description)
);
alter table pms.so_lines enable row level security;
alter table pms.so_lines force row level security;
revoke all on pms.so_lines from public, anon, authenticated;
alter table pms.inward_skids add column if not exists so_line_id bigint references pms.so_lines(id);
alter table pms.outward      add column if not exists so_line_id bigint references pms.so_lines(id);
alter table pms.production   add column if not exists so_line_id bigint references pms.so_lines(id);

insert into core.permissions (module, code, description) values
  ('pms','so_drop','Drop (upload) the Sale Order sheet') on conflict do nothing;
insert into core.role_permissions (module, role_code, permission) values
  ('pms','admin','so_drop'), ('pms','scm','so_drop') on conflict do nothing;
