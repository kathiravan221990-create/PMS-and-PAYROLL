-- Live stamp + recent activity, and yearly target per tin (applied as migration cost_05_live_target)
create table if not exists cost.targets (fy date primary key, target numeric not null check (target > 0), set_by uuid, set_at timestamptz not null default now());
alter table cost.targets enable row level security; alter table cost.targets force row level security;
revoke all on cost.targets from public, anon, authenticated;
-- functions: cost_api.live(), cost_api.target_get(p_fy), cost_api.target_set(p_fy, p_target)  (see Supabase migration)
