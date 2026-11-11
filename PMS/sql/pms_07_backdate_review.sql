-- PMS 07: back-dated entries beyond the edit window, with mandatory reason and admin review
insert into core.permissions(module,code,description) values
 ('pms','backdate','Enter or edit entries older than the edit window, with a mandatory reason'),
 ('pms','backdate_review','Review back-dated entries made with a reason')
on conflict do nothing;
insert into core.role_permissions(module,role_code,permission) values
 ('pms','production','backdate'),('pms','scm','backdate'),
 ('pms','admin','backdate_review'),('pms','manager','backdate_review')
on conflict do nothing;
create table if not exists pms.backdate_log(
  id bigint generated always as identity primary key,
  entry_date date not null, reason text not null, entered_by uuid,
  entered_at timestamptz not null default now(), xid bigint not null default txid_current(),
  status text not null default 'Pending' check (status in ('Pending','Reviewed')),
  reviewed_by uuid, reviewed_at timestamptz, review_note text);
alter table pms.backdate_log enable row level security;
alter table pms.backdate_log force row level security;
revoke all on pms.backdate_log from public, anon, authenticated;
-- pms.assert_editable now allows 'backdate' holders beyond the window when p->>'backdate_reason' (>=5 chars) is sent;
-- inward/outward/production/scrap/slitting/ledger _save set it via set_config('pms.backdate_reason', ...).
-- pms_api.backdate_list(p_status) and pms_api.backdate_review(p_id, p_note) serve the Admin review queue.
-- (Applied live; full function bodies are in the Supabase migration pms_07_backdate_review.)
