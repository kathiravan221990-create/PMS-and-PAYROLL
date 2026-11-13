-- Available financial years and a single-day view
create or replace function cost_api.cost_years() returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare lo date; f date;
begin
  perform core.assert_perm('cost','view');
  lo := least(coalesce((select min(month) from cost.history_monthly), current_date),
              coalesce((select min(cost_month) from cost.expense_lines), current_date),
              coalesce((select min(month) from cost.history_tins), current_date));
  return (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
          from generate_series(cost.fy_start(lo), cost.fy_start(current_date), interval '12 months') g(x));
end $$;

create or replace function cost_api.dash_day(p_date date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_date)::date;
        me date := (date_trunc('month', p_date) + interval '1 month - 1 day')::date;
        nd int := extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'));
        tins numeric; st jsonb; rows jsonb; ok boolean; hist boolean;
begin
  perform core.assert_perm('cost','view');
  hist := exists (select 1 from cost.history_monthly where month = m);
  if hist then
    return jsonb_build_object('date', p_date, 'monthly_only', true, 'rows', '[]'::jsonb, 'tins', null, 'complete', false);
  end if;
  select coalesce(sum(t.tins),0) into tins from cost.tins_daily t where t.work_date = p_date;
  select coalesce(jsonb_agg(jsonb_build_object('key', c.cat, 'through', c.through,
         'ok', c.through is not null and c.through >= p_date) order by c.cat), '[]'::jsonb)
    into st from cost.cat_through(m) c;
  ok := not exists (select 1 from jsonb_array_elements(st) e where not (e->>'ok')::boolean);
  rows := (select jsonb_agg(jsonb_build_object('category', a.category, 'amount', a.amount)) from (
     select 'labour'::text category, coalesce(sum(coalesce(r.amount, w.weight)),0) amount
       from cost.labour_weights(m) w left join cost.labour_daily_rows(m) r on r.work_date = w.work_date and r.base_name = w.base_name
      where w.work_date = p_date
     union all select 'power_fuel', coalesce((select power_amount from cost.power_monthly where month = m),0)/nd
         + coalesce((select sum(amount) from cost.expense_lines where entry_date = p_date and category='fuel'),0)
     union all select k, coalesce((select sum(amount) from cost.expense_lines where entry_date = p_date and category = k),0)
         from unnest(array['consumable','repair','safety']) k) a);
  return jsonb_build_object('date', p_date, 'monthly_only', false, 'rows', rows, 'tins', tins, 'status', st, 'complete', ok);
end $$;

revoke all on all functions in schema cost from public, anon, authenticated;
revoke all on all functions in schema cost_api from public, anon;
grant execute on all functions in schema cost_api to authenticated;
