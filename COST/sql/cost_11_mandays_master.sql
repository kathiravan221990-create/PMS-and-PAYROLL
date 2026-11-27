-- cost_11_mandays_master: mandays month wise on the Power & fuel master (payroll live, typed figure in Manual mode)
create or replace function cost_api.mandays_master(p_fy date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare a date := cost.fy_start(p_fy); b date := (cost.fy_start(p_fy) - interval '1 year')::date; e date := (cost.fy_start(p_fy) + interval '11 months')::date;
begin
  perform core.assert_perm('cost','view');
  return coalesce((select jsonb_agg(to_jsonb(z) order by z.month) from (
    select m.m as month, (select mandays from cost.month_mandays(m.m)) as mandays, (select src from cost.month_mandays(m.m)) as src,
           exists (select 1 from cost.month_lock l where l.month = m.m) as locked
      from (select generate_series(b, e, interval '1 month')::date m) m) z), '[]'::jsonb);
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
  elsif p_field = 'mandays' then
    insert into cost.mandays_manual (month, mandays, updated_by) values (m, p_value, auth.uid())
    on conflict (month) do update set mandays = excluded.mandays, updated_by = auth.uid(), updated_at = now();
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
    if p_field = 'tins' then delete from cost.tins_monthly where month = m; end if;
  elsif p_field = 'power' then
    update cost.power_monthly set power_manual = null, updated_by = auth.uid(), updated_at = now() where month = m;
  elsif p_field = 'diesel' then
    update cost.power_monthly set diesel_manual = null, updated_by = auth.uid(), updated_at = now() where month = m;
  elsif p_field = 'mandays' then
    delete from cost.mandays_manual where month = m;
  else raise exception 'field_invalid'; end if;
  perform core.log('cost','master_clear','master', m::text, jsonb_build_object('field', p_field));
end $$;

revoke all on all functions in schema cost_api from public, anon;
grant execute on all functions in schema cost_api to authenticated;
