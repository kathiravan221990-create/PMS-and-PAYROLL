-- cost_08_labour: labour comes from payroll (with GST) until the contractor's Excel row is uploaded.
--  * payroll counts while the month is still Draft, as long as attendance and an invoice exist
--  * per contractor and month: Excel amount if uploaded, else payroll grand total (with GST); both spread over the days by wage weight
--  * labour match compares Excel with payroll WITH GST; labour_match_period returns several months for the year / quarter view

create or replace function cost.payroll_ready(p_month date) returns boolean
language sql stable security definer set search_path = cost, core, pg_temp as $$
  select exists (select 1 from payroll.day_marks dm where dm.month = p_month)
     and coalesce((select sum(i.grand_total) from payroll.invoice i where i.month = p_month), 0) > 0 $$;

create or replace function cost.labour_daily_rows(p_month date)
returns table (work_date date, base_name text, mandays numeric, amount numeric)
language sql stable security definer set search_path = cost, core, pg_temp as $$
  with w as (select * from cost.labour_weights(p_month)),
  tot as (select base_name, sum(weight) tw from w group by 1),
  inv as (select base_name, sum(amount) amt from cost.expense_lines where category = 'labour' and cost_month = p_month and base_name is not null group by 1),
  pay as (select c.base_name, sum(i.grand_total) amt from payroll.invoice i join payroll.contractors c on c.id = i.contractor_id where i.month = p_month group by 1)
  select w.work_date, w.base_name, w.mandays,
         case when tot.tw > 0 then round(coalesce(inv.amt, nullif(pay.amt, 0)) * w.weight / tot.tw, 2) end
    from w join tot on tot.base_name = w.base_name
         left join inv on inv.base_name = w.base_name
         left join pay on pay.base_name = w.base_name $$;

-- month labour = per contractor (Excel if uploaded, else payroll with GST) + Excel lines of vendors that have no payroll attendance
create or replace function cost.labour_month_total(p_month date) returns numeric
language sql stable security definer set search_path = cost, core, pg_temp as $$
  select case when exists (select 1 from cost.labour_weights(p_month)) then
           coalesce((select sum(r.amount) from cost.labour_daily_rows(p_month) r), 0)
         + coalesce((select sum(e.amount) from cost.expense_lines e
                      where e.category = 'labour' and e.cost_month = p_month
                        and (e.base_name is null
                             or not exists (select 1 from cost.labour_weights(p_month) w where w.base_name = e.base_name))), 0)
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
           where o.month between p_from and p_to and o.field <> 'tins'),
  fuel as (select cost_month m, sum(amount) a from cost.expense_lines
            where cost_month between p_from and p_to and category = 'fuel' group by 1),
  pw as (select pm.month m, pm.power_amount p, pm.diesel_amount d from cost.power_monthly pm
          where pm.month between p_from and p_to and (pm.power_amount is not null or pm.diesel_amount is not null))
  select months.m, cats.c,
         case when cats.c = 'power_fuel'
              then case when pw.m is not null then coalesce(pw.p, 0) + coalesce(pw.d, fuel.a, 0) else h.amount end
              when cats.c = 'labour' then coalesce(ovr.a, lt.v, live.a, h.amount)
              else coalesce(ovr.a, live.a, h.amount) end,
         case when cats.c = 'power_fuel'
              then case when pw.m is not null then 'live' when h.amount is not null then 'workbook' else 'missing' end
              else case when ovr.a is not null then 'manual'
                        when cats.c = 'labour' and lt.v is not null then (case when live.a is not null then 'live' else 'payroll' end)
                        when live.a is not null then 'live'
                        when h.amount is not null then 'workbook' else 'missing' end end
    from months cross join cats
    left join lateral (select case when cats.c = 'labour' then cost.labour_month_total(months.m) end v) lt on true
    left join live on live.m = months.m and live.c = cats.c
    left join ovr  on ovr.m  = months.m and ovr.c  = cats.c
    left join fuel on fuel.m = months.m and cats.c = 'power_fuel'
    left join pw   on pw.m   = months.m and cats.c = 'power_fuel'
    left join cost.history_monthly h on h.month = months.m and h.category = cats.c
$$;

-- labour is complete to month end when it is typed, from the workbook, or every payroll contractor has an Excel row; otherwise it runs as far as payroll is entered
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

create or replace function cost_api.labour_match(p_month date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date; ready boolean;
begin
  perform core.assert_perm('cost','view');
  ready := cost.payroll_ready(m);
  return jsonb_build_object(
    'month', m, 'payroll_ready', ready,
    'payroll_status', (select mc.status from payroll.month_control mc where mc.month = m),
    'unmapped_invoiced', (select coalesce(sum(amount),0) from cost.expense_lines where category = 'labour' and cost_month = m and base_name is null),
    'rows', coalesce((select jsonb_agg(to_jsonb(z) order by z.base_name) from (
      with names as (select base_name from cost.vendor_map where active
                     union select base_name from cost.expense_lines where category = 'labour' and cost_month = m and base_name is not null
                     union select c.base_name from payroll.invoice i join payroll.contractors c on c.id = i.contractor_id where i.month = m),
      inv as (select base_name, sum(amount) amt, count(*) n from cost.expense_lines where category = 'labour' and cost_month = m group by 1),
      pay as (select c.base_name, sum(i.subtotal) sub, sum(i.grand_total) gt, sum(i.man_days) md
                from payroll.invoice i join payroll.contractors c on c.id = i.contractor_id where i.month = m group by 1)
      select n.base_name,
             inv.amt as invoiced, inv.n as invoice_lines,
             case when ready then pay.sub end as payroll_subtotal,
             case when ready then pay.gt end as payroll_with_gst,
             case when ready then pay.md end as man_days,
             case when ready and inv.amt is not null then round(inv.amt - coalesce(pay.gt,0), 2) end as difference,
             case when ready and inv.amt is not null and coalesce(pay.gt,0) <> 0 then round((inv.amt - pay.gt) * 100 / pay.gt, 2) end as diff_pct,
             case when inv.amt is not null then 'excel' when ready and coalesce(pay.gt,0) > 0 then 'payroll' end as source,
             case when inv.amt is null and not ready then 'no_data' when inv.amt is null then 'invoice_pending' when not ready then 'no_payroll' else 'ok' end as state
        from names n left join inv on inv.base_name = n.base_name left join pay on pay.base_name = n.base_name) z), '[]'::jsonb));
end $$;

-- several months at once: year, quarter or one month
create or replace function cost_api.labour_match_period(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
begin
  perform core.assert_perm('cost','view');
  return jsonb_build_object('months', coalesce((
    select jsonb_agg(cost_api.labour_match(k::date) order by k)
      from generate_series(date_trunc('month', p_from), least(date_trunc('month', p_to), date_trunc('month', p_from) + interval '11 months'), interval '1 month') k), '[]'::jsonb));
end $$;

revoke all on all functions in schema cost from public, anon, authenticated;
revoke all on all functions in schema cost_api from public, anon;
grant execute on all functions in schema cost_api to authenticated;
