-- =====================================================================
-- cost_01_schema.sql -- Cost per Tin tables (schema "cost"). Classic Pack Pvt Ltd.
-- APPLIED to Supabase on 2026-11-12 (migration cost_01_schema).
-- Also widens core.modules check to allow 'cost' (statement below).
-- Requires the shared core schema (core.modules / permissions / role_permissions /
-- user_roles / rules / log / assert_perm / has_perm) that Payroll and PMS already use.
-- Same lock-down as payroll and PMS: RLS on and forced, no policies, no grants.
-- The website reaches the data only through cost_api functions (cost_02_api.sql).
-- The uploaded Excel files are never stored: the browser reads them and sends
-- only the rows for the mapped accounts; upload history keeps counts, not files.
-- =====================================================================
create schema if not exists cost;
create schema if not exists cost_api;

alter table core.modules drop constraint if exists modules_code_check;
alter table core.modules add constraint modules_code_check check (code = any (array['core'::text,'payroll'::text,'pms'::text,'cost'::text]));

-- ------------------------------------------------ module, permissions, roles
insert into core.modules (code, name) values ('cost','Cost per Tin') on conflict (code) do nothing;

insert into core.permissions (module, code, description) values
  ('cost','view','See the Cost per Tin screens and reports'),
  ('cost','upload','Upload the monthly expense Excel'),
  ('cost','entry','Add daily expense entries'),
  ('cost','tins_edit','Enter tins produced and power (EB) amounts'),
  ('cost','month_lock','Lock or unlock a month'),
  ('cost','edit_old','Edit or delete entries older than the edit window, or in a locked month'),
  ('cost','map_edit','Edit account and contractor mapping')
on conflict do nothing;

insert into core.role_permissions (module, role_code, permission)
select 'cost', r.role_code, p.code
from (values ('admin'),('manager'),('accounts')) r(role_code)
join core.permissions p on p.module = 'cost'
where r.role_code = 'admin'
   or (r.role_code = 'manager'  and p.code in ('view','upload','entry','tins_edit','month_lock','edit_old'))
   or (r.role_code = 'accounts' and p.code in ('view','upload','entry','tins_edit'))
on conflict do nothing;

-- give existing Admin / Manager / Accounts payroll users the same role in Cost
insert into core.user_roles (user_id, module, role_code, active)
select user_id, 'cost', role_code, active from core.user_roles
where module = 'payroll' and role_code in ('admin','manager','accounts')
on conflict do nothing;

insert into core.rules (module, key, value, effective_from, note)
select 'cost','edit_window_days','7'::jsonb, date '2026-01-01',
       'Days an entry can be edited or deleted by its owner roles; older needs the edit_old permission'
where not exists (select 1 from core.rules where module='cost' and key='edit_window_days');

-- ------------------------------------------------ mapping tables
-- Which expense-register accounts feed which cost head. Annual maintenance
-- charges (5010107003) and vehicle fuel are deliberately NOT mapped (same as the workbook).
create table if not exists cost.account_map (
  account_code bigint primary key,
  account_name text not null,
  category     text not null check (category in ('labour','repair','safety','consumable','fuel')),
  active       boolean not null default true
);
insert into cost.account_map (account_code, account_name, category) values
  (5010106006,'DIRECT MANUFACTURING LABOUR CHARGES','labour'),
  (5010107001,'REPAIRS/CIVIL WORK-BUILDING','repair'),
  (5010107006,'REPAIRS & MAINTENANCE OF MACHINERY','repair'),
  (5010107007,'REPAIRS & MAINTENANCE OFFICE - UTILITY','repair'),
  (5010107008,'REPAIRS & MAINTENANCE ELECTRICAL INSTALLATION','repair'),
  (5010107009,'REPAIRS & MAINTENANCE OF FURNITURE & FITTING','repair'),
  (5010107010,'REPAIRS & MAINTENANCE OF TOOLS','repair'),
  (5040103001,'REPAIRS & MAINTENANCE OF COMPUTER','repair'),
  (5010107005,'SAFETY EXPENSES','safety'),
  (5010107012,'CONSUMABLES - OTHERS','consumable'),
  (5010106007,'POWER/FUEL/GENERATOR DIESEL','fuel')
on conflict (account_code) do nothing;

-- Labour vendors -> payroll contractor (payroll.contractors.base_name).
-- month_shift = -1 for RMV: its invoice dated in July is for June.
create table if not exists cost.vendor_map (
  vendor_name text primary key check (vendor_name = upper(btrim(vendor_name))),
  base_name   text not null,
  month_shift int  not null default 0 check (month_shift between -2 and 0),
  active      boolean not null default true
);
insert into cost.vendor_map (vendor_name, base_name, month_shift) values
  ('RMV MANPOVER SERVICES','RMV',-1),
  ('VETRI ENTERPRISES','VETRI',0),
  ('SASI ENTERPRISES','SASI',0),
  ('PAVITHRA ENTERPRISES','PAVITHRA',0),
  ('SUBO DEEP ENTERPRISES','SUBO',0),
  ('VINAYAK ASSOCIATES','VINAYAK',0)
on conflict (vendor_name) do nothing;

-- ------------------------------------------------ transactions
create table if not exists cost.uploads (
  id           bigint generated always as identity primary key,
  kind         text not null default 'register' check (kind in ('register','power')),
  file_name    text,
  posted_from  date, posted_to date,
  rows_in_file int not null default 0,
  rows_kept    int not null default 0,
  amount_kept  numeric(16,2) not null default 0,
  uploaded_by  uuid, uploaded_at timestamptz not null default now()
);

create table if not exists cost.expense_lines (
  id            bigint generated always as identity primary key,
  source        text not null check (source in ('excel','manual')),
  upload_id     bigint references cost.uploads(id) on delete set null,
  entry_date    date not null,                       -- posting date (excel) / entry date (manual)
  cost_month    date not null check (cost_month = date_trunc('month', cost_month)::date),
  category      text not null check (category in ('labour','repair','safety','consumable','fuel')),
  account_code  bigint,
  account_name  text,
  vendor_name   text,
  base_name     text,                                -- labour only: payroll contractor
  doc_key       text,
  item_desc     text,
  qty           numeric(14,3),
  amount        numeric(16,2) not null,
  bill_no       text,
  remarks       text,
  line_key      text,                                -- excel only: stable key against duplicates
  possible_dup_of bigint,                            -- manual line that matches an excel line
  created_by    uuid, created_at timestamptz not null default now(),
  updated_by    uuid, updated_at timestamptz
);
create unique index if not exists expense_lines_line_key_uq on cost.expense_lines (line_key) where line_key is not null;
create index if not exists expense_lines_month_cat on cost.expense_lines (cost_month, category);
create index if not exists expense_lines_date on cost.expense_lines (entry_date);

create table if not exists cost.power_monthly (
  month        date primary key check (month = date_trunc('month', month)::date),
  power_amount numeric(16,2) not null,
  note         text,
  source       text not null default 'manual',
  updated_by   uuid, updated_at timestamptz not null default now()
);

create table if not exists cost.tins_monthly (
  month  date primary key check (month = date_trunc('month', month)::date),
  tins   bigint not null check (tins >= 0),
  source text not null default 'manual' check (source in ('manual','pms')),
  updated_by uuid, updated_at timestamptz not null default now()
);
create table if not exists cost.tins_daily (
  work_date date primary key,
  tins   bigint not null check (tins >= 0),
  source text not null default 'manual' check (source in ('manual','pms')),
  updated_by uuid, updated_at timestamptz not null default now()
);

create table if not exists cost.month_lock (
  month date primary key, locked_at timestamptz not null default now(), locked_by uuid
);

-- previous-year and Apr-Jun 2026 figures copied from the Review workbook (EXPENSES sheet)
create table if not exists cost.history_monthly (
  month    date not null,
  category text not null check (category in ('labour','power_fuel','consumable','repair','safety')),
  amount   numeric(16,2) not null,
  primary key (month, category)
);
create table if not exists cost.history_tins (
  month date primary key, tins bigint not null
);

insert into cost.history_monthly (month, category, amount) values
  ('2025-04-01','consumable',9171.0),
  ('2025-04-01','labour',1672770.0),
  ('2025-04-01','power_fuel',140695.0),
  ('2025-04-01','repair',303127.0),
  ('2025-04-01','safety',0.0),
  ('2025-05-01','consumable',52493.0),
  ('2025-05-01','labour',1426475.0),
  ('2025-05-01','power_fuel',145580.0),
  ('2025-05-01','repair',447329.0),
  ('2025-05-01','safety',130.0),
  ('2025-06-01','consumable',70895.0),
  ('2025-06-01','labour',1956675.0),
  ('2025-06-01','power_fuel',179720.0),
  ('2025-06-01','repair',428698.0),
  ('2025-06-01','safety',0.0),
  ('2025-07-01','consumable',62958.0),
  ('2025-07-01','labour',2117817.0),
  ('2025-07-01','power_fuel',227737.0),
  ('2025-07-01','repair',649749.0),
  ('2025-07-01','safety',0.0),
  ('2025-08-01','consumable',71038.0),
  ('2025-08-01','labour',2611740.0),
  ('2025-08-01','power_fuel',254390.0),
  ('2025-08-01','repair',711058.0),
  ('2025-08-01','safety',9000.0),
  ('2025-09-01','consumable',58208.0),
  ('2025-09-01','labour',2886998.0),
  ('2025-09-01','power_fuel',227891.0),
  ('2025-09-01','repair',601694.0),
  ('2025-09-01','safety',2500.0),
  ('2025-10-01','consumable',23282.0),
  ('2025-10-01','labour',2947650.0),
  ('2025-10-01','power_fuel',187312.0),
  ('2025-10-01','repair',435749.0),
  ('2025-10-01','safety',0.0),
  ('2025-11-01','consumable',86584.0),
  ('2025-11-01','labour',2759361.0),
  ('2025-11-01','power_fuel',235557.0),
  ('2025-11-01','repair',408927.0),
  ('2025-11-01','safety',17200.0),
  ('2025-12-01','consumable',20260.0),
  ('2025-12-01','labour',2509301.0),
  ('2025-12-01','power_fuel',222364.0),
  ('2025-12-01','repair',402321.0),
  ('2025-12-01','safety',68000.0),
  ('2026-01-01','consumable',47650.0),
  ('2026-01-01','labour',2264890.0),
  ('2026-01-01','power_fuel',228689.0),
  ('2026-01-01','repair',345195.0),
  ('2026-01-01','safety',3485.0),
  ('2026-02-01','consumable',48073.0),
  ('2026-02-01','labour',2279685.0),
  ('2026-02-01','power_fuel',179329.0),
  ('2026-02-01','repair',387667.0),
  ('2026-02-01','safety',3800.0),
  ('2026-03-01','consumable',22579.0),
  ('2026-03-01','labour',2253133.0),
  ('2026-03-01','power_fuel',209588.0),
  ('2026-03-01','repair',452813.0),
  ('2026-03-01','safety',9937.0),
  ('2026-04-01','consumable',20928.0),
  ('2026-04-01','labour',2243942.0),
  ('2026-04-01','power_fuel',202410.0),
  ('2026-04-01','repair',130093.0),
  ('2026-04-01','safety',2644.0),
  ('2026-05-01','consumable',31754.0),
  ('2026-05-01','labour',2600771.0),
  ('2026-05-01','power_fuel',229516.0),
  ('2026-05-01','repair',446121.0),
  ('2026-05-01','safety',0.0),
  ('2026-06-01','consumable',51815.0),
  ('2026-06-01','labour',2421761.0),
  ('2026-06-01','power_fuel',216889.0),
  ('2026-06-01','repair',484540.0),
  ('2026-06-01','safety',0.0),
  ('2026-07-01','consumable',116543.0),
  ('2026-07-01','labour',2839047.0),
  ('2026-07-01','repair',581397.0),
  ('2026-08-01','consumable',63179.0),
  ('2026-08-01','labour',3122286.0),
  ('2026-08-01','repair',439007.0),
  ('2026-09-01','consumable',26294.0),
  ('2026-09-01','labour',3218083.0),
  ('2026-09-01','repair',212248.0)
on conflict (month, category) do nothing;

insert into cost.history_tins (month, tins) values
  ('2025-04-01',1653419),
  ('2025-05-01',1653865),
  ('2025-06-01',2521270),
  ('2025-07-01',2908309),
  ('2025-08-01',2663172),
  ('2025-09-01',2447987),
  ('2025-10-01',2470572),
  ('2025-11-01',3146692),
  ('2025-12-01',3216600),
  ('2026-01-01',2678306),
  ('2026-02-01',2711102),
  ('2026-03-01',2803048),
  ('2026-04-01',2786938),
  ('2026-05-01',2886548),
  ('2026-06-01',2585282)
on conflict (month) do nothing;

-- ------------------------------------------------ lock-down (same as payroll / PMS)
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'cost' loop
    execute format('alter table cost.%I enable row level security', t);
    execute format('alter table cost.%I force row level security', t);
  end loop;
end $$;
revoke all on all tables in schema cost from public, anon, authenticated;
revoke all on all sequences in schema cost from public, anon, authenticated;
