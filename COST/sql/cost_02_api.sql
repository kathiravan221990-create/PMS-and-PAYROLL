-- =====================================================================
-- cost_02_api.sql -- Cost per Tin RPC layer (cost_api). FOR REVIEW, not applied to Supabase.
-- Requires cost_01_schema.sql and the shared core + payroll schemas.
-- Every function checks a permission first (core.assert_perm) and logs changes (core.log).
-- Rules built in (from your answers):
--   * RMV invoices: cost month = invoice (posting) month minus 1; others use the posting month.
--   * Labour is matched with payroll.invoice (taxable subtotal, GST shown separately).
--   * Daily labour = invoiced amount spread over days by each day's payroll wage weight.
--   * Tins: typed per month (or per day) until PMS production feeds them.
--   * Power (EB) is typed per month until the Excel 3 mapping is added.
-- =====================================================================

-- ------------------------------------------------------------ helpers
create or replace function cost.norm(p text) returns text
language sql immutable as $$ select upper(btrim(regexp_replace(coalesce(p,''), '\s+', ' ', 'g'))) $$;

create or replace function cost.fy_start(p date) returns date
language sql immutable as $$
  select make_date(case when extract(month from p) >= 4 then extract(year from p)::int else extract(year from p)::int - 1 end, 4, 1) $$;

create or replace function cost.assert_month_open(p_date date) returns void
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
begin
  if exists (select 1 from cost.month_lock where month = date_trunc('month', p_date)::date)
     and not core.has_perm('cost','edit_old') then
    raise exception 'month_locked' using errcode = '42501';
  end if;
end $$;

create or replace function cost.assert_editable(p_date date) returns void
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare d int := coalesce((core.rule_value('cost','edit_window_days'))::text::int, 7);
begin
  if p_date < current_date - d and not core.has_perm('cost','edit_old') then
    raise exception 'edit_window_closed' using errcode = '42501';
  end if;
  perform cost.assert_month_open(p_date);
end $$;

-- monthly amount per head: live lines win over the workbook history
create or replace function cost.month_cat(p_from date, p_to date)
returns table (month date, category text, amount numeric, src text)
language sql stable security definer set search_path = cost, core, pg_temp as $$
  with months as (select generate_series(p_from, p_to, interval '1 month')::date m),
  cats(c) as (values ('labour'),('power_fuel'),('consumable'),('repair'),('safety')),
  live as (select cost_month m, category c, sum(amount) a from cost.expense_lines
            where cost_month between p_from and p_to and category in ('labour','repair','safety','consumable')
            group by 1,2),
  fuel as (select cost_month m, sum(amount) a from cost.expense_lines
            where cost_month between p_from and p_to and category = 'fuel' group by 1),
  pw as (select power_monthly.month m, power_amount a from cost.power_monthly
          where power_monthly.month between p_from and p_to)
  select months.m, cats.c,
         case when cats.c = 'power_fuel'
              then case when pw.m is not null then pw.a + coalesce(fuel.a, 0) else h.amount end
              else coalesce(live.a, h.amount) end,
         case when cats.c = 'power_fuel' then case when pw.m is not null then 'live' when h.amount is not null then 'workbook' else 'missing' end
              else case when live.a is not null then 'live' when h.amount is not null then 'workbook' else 'missing' end end
    from months cross join cats
    left join live on live.m = months.m and live.c = cats.c
    left join fuel on fuel.m = months.m and cats.c = 'power_fuel'
    left join pw   on pw.m   = months.m and cats.c = 'power_fuel'
    left join cost.history_monthly h on h.month = months.m and h.category = cats.c
$$;

create or replace function cost.month_tins(p_from date, p_to date)
returns table (month date, tins bigint, src text)
language sql stable security definer set search_path = cost, core, pg_temp as $$
  select m.m,
         coalesce(nullif((select sum(t.tins) from cost.tins_daily t where date_trunc('month', t.work_date)::date = m.m), 0),
                  (select tm.tins from cost.tins_monthly tm where tm.month = m.m),
                  (select ht.tins from cost.history_tins ht where ht.month = m.m)),
         case when exists (select 1 from cost.tins_daily t where date_trunc('month', t.work_date)::date = m.m) then 'daily'
              when exists (select 1 from cost.tins_monthly tm where tm.month = m.m) then 'manual'
              when exists (select 1 from cost.history_tins ht where ht.month = m.m) then 'workbook'
              else 'missing' end
    from (select generate_series(p_from, p_to, interval '1 month')::date m) m
$$;

-- ------------------------------------------------------------ upload (preview and commit)
-- p = { file_name, rows_in_file, rows:[{pd,v,d,q,a,ac,dk,it,r,i}], ignored:[{ac,an,n,amt}] }
-- The browser sends only rows of mapped accounts; the server re-checks every account code.
create or replace function cost.upload_process(p jsonb, p_commit boolean) returns jsonb
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare
  v_from date; v_to date; v_up bigint; v_del int := 0; v_ins int := 0; v_amt numeric := 0; v_dups int := 0;
  res jsonb;
begin
  perform core.assert_perm('cost','upload');
  create temp table if not exists _cost_in (
    pd date, vendor text, d text, q numeric, a numeric, ac bigint, dk text, it text, r text, i int,
    category text, account_name text, base_name text, shift int, cost_month date, line_key text
  ) on commit drop;
  truncate _cost_in;

  insert into _cost_in (pd, vendor, d, q, a, ac, dk, it, r, i)
  select x.pd, cost.norm(x.v), x.d, x.q, x.a, x.ac, x.dk, x.it, x.r, x.i
    from jsonb_to_recordset(coalesce(p->'rows','[]'::jsonb))
         as x(pd date, v text, d text, q numeric, a numeric, ac bigint, dk text, it text, r text, i int)
   where x.pd is not null and x.a is not null;

  update _cost_in t set category = m.category, account_name = m.account_name
    from cost.account_map m where m.account_code = t.ac and m.active;
  delete from _cost_in where category is null;

  update _cost_in t set base_name = vm.base_name, shift = vm.month_shift
    from cost.vendor_map vm where vm.vendor_name = t.vendor and vm.active and t.category = 'labour';
  update _cost_in set shift = 0 where shift is null;
  update _cost_in set cost_month = (date_trunc('month', pd) + make_interval(months => shift))::date;

  update _cost_in t set line_key = md5(concat_ws('|', coalesce(t.dk,''), coalesce(t.it,''), coalesce(t.d,''), t.a::text, n.rn::text))
    from (select ctid cid, row_number() over (partition by dk, it, d, a order by i, ctid) rn from _cost_in) n
   where t.ctid = n.cid;

  select min(pd), max(pd) into v_from, v_to from _cost_in;
  select count(*), coalesce(sum(a),0) into v_ins, v_amt from _cost_in;

  if v_from is not null and exists (select 1 from cost.month_lock l
        where l.month between date_trunc('month', v_from)::date and date_trunc('month', v_to)::date)
     and not core.has_perm('cost','edit_old') then
    raise exception 'month_locked' using errcode = '42501';
  end if;

  select count(*) into v_del from cost.expense_lines
   where source = 'excel' and entry_date between coalesce(v_from, date '1900-01-01') and coalesce(v_to, date '1900-01-01');

  if p_commit then
    insert into cost.uploads (kind, file_name, posted_from, posted_to, rows_in_file, rows_kept, amount_kept, uploaded_by)
    values ('register', left(p->>'file_name', 200), v_from, v_to, coalesce((p->>'rows_in_file')::int, 0), v_ins, v_amt, auth.uid())
    returning id into v_up;

    delete from cost.expense_lines
     where source = 'excel' and entry_date between v_from and v_to;

    insert into cost.expense_lines (source, upload_id, entry_date, cost_month, category, account_code, account_name,
                                    vendor_name, base_name, doc_key, item_desc, qty, amount, remarks, line_key, created_by)
    select 'excel', v_up, pd, cost_month, category, ac, account_name, vendor, base_name, dk,
           coalesce(nullif(btrim(d),''), nullif(btrim(it),'')), q, a, left(r, 300), line_key, auth.uid()
      from _cost_in;

    -- flag manual entries that look like the register lines just loaded
    update cost.expense_lines m set possible_dup_of = e.id
      from cost.expense_lines e
     where m.source = 'manual' and e.source = 'excel' and e.upload_id = v_up
       and m.category = e.category and m.cost_month = e.cost_month and m.amount = e.amount
       and (m.vendor_name is not distinct from e.vendor_name or e.vendor_name is null or m.vendor_name is null)
       and m.possible_dup_of is null;
    get diagnostics v_dups = row_count;

    perform core.log('cost','upload_commit','upload', v_up::text,
      jsonb_build_object('rows_kept', v_ins, 'amount', v_amt, 'from', v_from, 'to', v_to, 'replaced_rows', v_del));
  else
    select count(*) into v_dups from cost.expense_lines m
     where m.source = 'manual' and exists (select 1 from _cost_in t where t.category = m.category
           and t.cost_month = m.cost_month and t.a = m.amount);
  end if;

  res := jsonb_build_object(
    'committed', p_commit, 'upload_id', v_up, 'from', v_from, 'to', v_to,
    'rows_in_file', coalesce((p->>'rows_in_file')::int, 0), 'rows_kept', v_ins, 'amount_kept', v_amt,
    'replaced_rows', v_del, 'manual_possible_duplicates', v_dups,
    'groups', coalesce((select jsonb_agg(g order by g->>'cost_month', g->>'category', g->>'base') from (
         select jsonb_build_object('cost_month', cost_month, 'category', category, 'base', coalesce(base_name,''),
                                   'rows', count(*), 'amount', sum(a), 'shift', max(shift)) g
           from _cost_in group by cost_month, category, base_name) z), '[]'::jsonb),
    'unmapped_vendors', coalesce((select jsonb_agg(distinct vendor) from _cost_in where category = 'labour' and base_name is null), '[]'::jsonb),
    'ignored', coalesce(p->'ignored', '[]'::jsonb));
  return res;
end $$;

create or replace function cost_api.upload_preview(p jsonb) returns jsonb
language plpgsql security definer set search_path = cost, core, pg_temp as $$
begin return cost.upload_process(p, false); end $$;

create or replace function cost_api.upload_commit(p jsonb) returns jsonb
language plpgsql security definer set search_path = cost, core, pg_temp as $$
begin return cost.upload_process(p, true); end $$;

-- ------------------------------------------------------------ daily (manual) entries
create or replace function cost_api.daily_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare v_id bigint := nullif(p->>'id','')::bigint; d date := (p->>'entry_date')::date;
        cat text := lower(p->>'category'); amt numeric := (p->>'amount')::numeric; old_d date;
begin
  perform core.assert_perm('cost','entry');
  if d is null then raise exception 'date_required'; end if;
  if cat not in ('labour','repair','safety','consumable','fuel') then raise exception 'category_invalid'; end if;
  if amt is null or amt = 0 then raise exception 'amount_required'; end if;
  perform cost.assert_editable(d);
  if v_id is null then
    insert into cost.expense_lines (source, entry_date, cost_month, category, vendor_name, item_desc, qty, amount, bill_no, remarks, created_by)
    values ('manual', d, date_trunc('month', d)::date, cat, nullif(cost.norm(p->>'vendor_name'),''),
            nullif(btrim(p->>'item_desc'),''), (p->>'qty')::numeric, amt, nullif(btrim(p->>'bill_no'),''), nullif(btrim(p->>'remarks'),''), auth.uid())
    returning id into v_id;
    perform core.log('cost','daily_add','expense_line', v_id::text, jsonb_build_object('date', d, 'category', cat, 'amount', amt));
  else
    select entry_date into old_d from cost.expense_lines where id = v_id and source = 'manual';
    if old_d is null then raise exception 'record_not_found' using errcode = 'P0002'; end if;
    perform cost.assert_editable(old_d);
    update cost.expense_lines set entry_date = d, cost_month = date_trunc('month', d)::date, category = cat,
           vendor_name = nullif(cost.norm(p->>'vendor_name'),''), item_desc = nullif(btrim(p->>'item_desc'),''),
           qty = (p->>'qty')::numeric, amount = amt, bill_no = nullif(btrim(p->>'bill_no'),''),
           remarks = nullif(btrim(p->>'remarks'),''), updated_by = auth.uid(), updated_at = now()
     where id = v_id;
    perform core.log('cost','daily_edit','expense_line', v_id::text, jsonb_build_object('date', d, 'category', cat, 'amount', amt));
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function cost_api.daily_delete(p_id bigint) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare d date;
begin
  perform core.assert_perm('cost','entry');
  select entry_date into d from cost.expense_lines where id = p_id and source = 'manual';
  if d is null then raise exception 'record_not_found' using errcode = 'P0002'; end if;
  perform cost.assert_editable(d);
  delete from cost.expense_lines where id = p_id;
  perform core.log('cost','daily_delete','expense_line', p_id::text, null);
end $$;

create or replace function cost_api.lines_list(p_from date, p_to date, p_category text default null, p_source text default null)
returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
begin
  perform core.assert_perm('cost','view');
  return coalesce((select jsonb_agg(to_jsonb(z) order by z.entry_date, z.id) from (
    select id, source, entry_date, cost_month, category, account_name, vendor_name, base_name, item_desc, qty, amount,
           bill_no, remarks, possible_dup_of
      from cost.expense_lines
     where entry_date between p_from and p_to
       and (p_category is null or p_category = 'all' or category = p_category)
       and (p_source is null or p_source = 'all' or source = p_source)
     order by entry_date, id limit 3000) z), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------ tins and power (typed)
create or replace function cost_api.tins_save(p_month date, p_tins bigint) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','tins_edit'); perform cost.assert_month_open(m);
  if p_tins is null or p_tins < 0 then raise exception 'tins_invalid'; end if;
  insert into cost.tins_monthly (month, tins, source, updated_by) values (m, p_tins, 'manual', auth.uid())
  on conflict (month) do update set tins = excluded.tins, source = 'manual', updated_by = auth.uid(), updated_at = now();
  perform core.log('cost','tins_month','tins', m::text, jsonb_build_object('tins', p_tins));
end $$;

create or replace function cost_api.tins_daily_save(p_date date, p_tins bigint) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
begin
  perform core.assert_perm('cost','tins_edit'); perform cost.assert_month_open(p_date);
  if p_tins is null or p_tins < 0 then raise exception 'tins_invalid'; end if;
  insert into cost.tins_daily (work_date, tins, source, updated_by) values (p_date, p_tins, 'manual', auth.uid())
  on conflict (work_date) do update set tins = excluded.tins, source = 'manual', updated_by = auth.uid(), updated_at = now();
  perform core.log('cost','tins_day','tins', p_date::text, jsonb_build_object('tins', p_tins));
end $$;

create or replace function cost_api.power_save(p_month date, p_amount numeric, p_note text default null) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','tins_edit'); perform cost.assert_month_open(m);
  if p_amount is null or p_amount < 0 then raise exception 'amount_invalid'; end if;
  insert into cost.power_monthly (month, power_amount, note, source, updated_by) values (m, p_amount, p_note, 'manual', auth.uid())
  on conflict (month) do update set power_amount = excluded.power_amount, note = excluded.note, source = 'manual',
         updated_by = auth.uid(), updated_at = now();
  perform core.log('cost','power_month','power', m::text, jsonb_build_object('amount', p_amount));
end $$;

create or replace function cost_api.month_lock(p_month date, p_lock boolean) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','month_lock');
  if p_lock then insert into cost.month_lock (month, locked_by) values (m, auth.uid()) on conflict (month) do nothing;
  else delete from cost.month_lock where month = m; end if;
  perform core.log('cost', case when p_lock then 'month_lock' else 'month_unlock' end, 'month', m::text, null);
end $$;

-- ------------------------------------------------------------ dashboard
-- p_mode: month | quarter | fy   (quarters follow the April financial year)
create or replace function cost_api.dashboard(p_month date, p_mode text default 'month') returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date; f date; t date; fy date := cost.fy_start(p_month);
        res jsonb;
begin
  perform core.assert_perm('cost','view');
  if p_mode = 'fy' then f := fy; t := (fy + interval '11 months')::date;
  elsif p_mode = 'quarter' then
    f := (fy + make_interval(months => (((extract(month from m)::int + 8) % 12) / 3) * 3))::date;
    t := (f + interval '2 months')::date;
  else f := m; t := m; end if;

  with cy as (select * from cost.month_cat(f, t)),
       py as (select month + interval '12 months' as pm, category, amount, src from cost.month_cat((f - interval '12 months')::date, (t - interval '12 months')::date)),
       cyt as (select * from cost.month_tins(f, t)),
       pyt as (select (month + interval '12 months')::date pm, tins, src from cost.month_tins((f - interval '12 months')::date, (t - interval '12 months')::date)),
       cats(c, ord) as (values ('labour',1),('power_fuel',2),('consumable',3),('repair',4),('safety',5)),
       agg as (
         select cats.c, cats.ord,
           (select coalesce(sum(amount),0) from cy where cy.category = cats.c) cy_amt,
           (select coalesce(sum(cy.amount),0) from cy join cyt on cyt.month = cy.month and cyt.tins > 0 where cy.category = cats.c) cy_amt_t,
           (select coalesce(sum(amount),0) from py where py.category = cats.c) py_amt,
           (select coalesce(sum(py.amount),0) from py join pyt on pyt.pm = py.pm::date and pyt.tins > 0 where py.category = cats.c) py_amt_t
         from cats),
       tn as (select (select coalesce(sum(tins),0) from cyt where tins > 0) cy_t, (select coalesce(sum(tins),0) from pyt where tins > 0) py_t)
  select jsonb_build_object(
    'from', f, 'to', t, 'mode', p_mode,
    'tins_cy', (select cy_t from tn), 'tins_py', (select py_t from tn),
    'rows', (select jsonb_agg(jsonb_build_object(
               'category', c, 'cy_amount', cy_amt, 'py_amount', py_amt,
               'cy_per_tin', case when (select cy_t from tn) > 0 then round(cy_amt_t / (select cy_t from tn), 2) end,
               'py_per_tin', case when (select py_t from tn) > 0 then round(py_amt_t / (select py_t from tn), 2) end) order by ord) from agg),
    'missing', jsonb_build_object(
       'power_months', (select coalesce(jsonb_agg(month order by month), '[]') from cy where category = 'power_fuel' and src <> 'live'),
       'tins_months',  (select coalesce(jsonb_agg(month order by month), '[]') from cyt where tins is null),
       'pending_vendors', (select coalesce(jsonb_agg(jsonb_build_object('month', mm.m, 'vendors', pv.v) order by mm.m), '[]')
           from (select generate_series(f, t, interval '1 month')::date m) mm
           cross join lateral (select jsonb_agg(vm.base_name order by vm.base_name) v from cost.vendor_map vm
                                where vm.active and not exists (select 1 from cost.expense_lines e
                                      where e.category = 'labour' and e.cost_month = mm.m and e.base_name = vm.base_name)) pv
          where pv.v is not null
            and exists (select 1 from cost.expense_lines e where e.category = 'labour' and e.cost_month = mm.m))),
    'trend', (select jsonb_agg(jsonb_build_object('month', k.m,
               'cy', (select case when ct.tins > 0 then round(sum(c2.amount) / ct.tins, 2) end from cost.month_cat(k.m, k.m) c2, cost.month_tins(k.m, k.m) ct group by ct.tins),
               'py', (select case when pt.tins > 0 then round(sum(p2.amount) / pt.tins, 2) end from cost.month_cat((k.m - interval '12 months')::date, (k.m - interval '12 months')::date) p2,
                             cost.month_tins((k.m - interval '12 months')::date, (k.m - interval '12 months')::date) pt group by pt.tins)) order by k.m)
              from (select generate_series(fy, (fy + interval '11 months')::date, interval '1 month')::date m) k)
  ) into res;
  return res;
end $$;

-- ------------------------------------------------------------ labour match and daily labour
create or replace function cost.payroll_ready(p_month date) returns boolean
language sql stable security definer set search_path = cost, core, pg_temp as $$
  select exists (select 1 from payroll.month_control mc where mc.month = p_month and mc.status in ('Calculated','Locked'))
     and coalesce((select sum(i.subtotal) from payroll.invoice i where i.month = p_month), 0) > 0 $$;

create or replace function cost_api.labour_match(p_month date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date; ready boolean;
begin
  perform core.assert_perm('cost','view');
  ready := cost.payroll_ready(m);
  return jsonb_build_object(
    'month', m, 'payroll_ready', ready,
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
             case when ready and inv.amt is not null then round(inv.amt - coalesce(pay.sub,0), 2) end as difference,
             case when ready and inv.amt is not null and coalesce(pay.sub,0) <> 0 then round((inv.amt - pay.sub) * 100 / pay.sub, 2) end as diff_pct,
             case when inv.amt is null then 'invoice_pending' when not ready then 'no_payroll' else 'ok' end as state
        from names n left join inv on inv.base_name = n.base_name left join pay on pay.base_name = n.base_name) z), '[]'::jsonb));
end $$;

-- daily wage weight per contractor and day, from payroll attendance and the month's daily rates
create or replace function cost.labour_weights(p_month date)
returns table (work_date date, base_name text, weight numeric, mandays numeric)
language sql stable security definer set search_path = cost, core, pg_temp as $$
  select dm.work_date, c.base_name,
         sum(dm.att * (r.basic_rate + r.hra_rate + coalesce(r.incentive_rate,0)) + coalesce(dm.ot,0) * coalesce(r.ot_rate,0)),
         sum(dm.att)
    from payroll.day_marks dm
    join payroll.register r on r.month = dm.month and r.emp_id = dm.emp_id
    join payroll.contractors c on c.id = r.contractor_id
   where dm.month = p_month
   group by dm.work_date, c.base_name $$;

create or replace function cost.labour_daily_rows(p_month date)
returns table (work_date date, base_name text, mandays numeric, amount numeric)
language sql stable security definer set search_path = cost, core, pg_temp as $$
  with w as (select * from cost.labour_weights(p_month)),
  tot as (select base_name, sum(weight) tw from w group by 1),
  inv as (select base_name, sum(amount) amt from cost.expense_lines where category = 'labour' and cost_month = p_month and base_name is not null group by 1)
  select w.work_date, w.base_name, w.mandays,
         case when inv.amt is not null and tot.tw > 0 then round(inv.amt * w.weight / tot.tw, 2) end
    from w join tot using (base_name) left join inv using (base_name) $$;

create or replace function cost_api.labour_daily(p_month date, p_base text default null) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date;
begin
  perform core.assert_perm('cost','view');
  return jsonb_build_object('month', m, 'payroll_ready', cost.payroll_ready(m),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('date', d.work_date, 'base', d.base_name, 'mandays', d.mandays, 'amount', d.amount)
                      order by d.work_date, d.base_name)
                       from cost.labour_daily_rows(m) d where p_base is null or d.base_name = p_base), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------ daily view (all heads, per day)
create or replace function cost_api.daily_view(p_month date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare m date := date_trunc('month', p_month)::date; e date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
        ready boolean; pw numeric; mt bigint;
begin
  perform core.assert_perm('cost','view');
  ready := cost.payroll_ready(m);
  select power_amount into pw from cost.power_monthly where month = m;
  select tins into mt from cost.month_tins(m, m);
  return jsonb_build_object('month', m, 'payroll_ready', ready, 'power_entered', pw is not null, 'month_tins', mt,
    'rows', coalesce((select jsonb_agg(to_jsonb(z) order by z.date) from (
      select d::date as date,
             case when ready then (select sum(mandays) from cost.labour_weights(m) w where w.work_date = d::date) end as mandays,
             case when ready then (select sum(amount) from cost.labour_daily_rows(m) r where r.work_date = d::date) end as labour,
             (select coalesce(sum(amount),0) from cost.expense_lines x where x.entry_date = d::date and x.cost_month = m and x.category = 'repair') as repair,
             (select coalesce(sum(amount),0) from cost.expense_lines x where x.entry_date = d::date and x.cost_month = m and x.category = 'safety') as safety,
             (select coalesce(sum(amount),0) from cost.expense_lines x where x.entry_date = d::date and x.cost_month = m and x.category = 'consumable') as consumable,
             (select coalesce(sum(amount),0) from cost.expense_lines x where x.entry_date = d::date and x.cost_month = m and x.category = 'fuel') as fuel,
             case when pw is not null then round(pw / extract(day from e), 2) end as power,
             (select t.tins from cost.tins_daily t where t.work_date = d::date) as tins
        from generate_series(m, e, interval '1 day') d) z), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------ masters, mapping, history
create or replace function cost_api.masters_list() returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
begin
  perform core.assert_perm('cost','view');
  return jsonb_build_object(
    'accounts', (select coalesce(jsonb_agg(to_jsonb(a) order by a.category, a.account_code), '[]') from cost.account_map a),
    'vendors',  (select coalesce(jsonb_agg(to_jsonb(v) order by v.base_name, v.vendor_name), '[]') from cost.vendor_map v),
    'edit_window_days', coalesce((core.rule_value('cost','edit_window_days'))::text::int, 7),
    'locked_months', (select coalesce(jsonb_agg(month order by month), '[]') from cost.month_lock),
    'uploads', (select coalesce(jsonb_agg(to_jsonb(u) order by u.id desc), '[]') from (select * from cost.uploads order by id desc limit 20) u));
end $$;

create or replace function cost_api.account_map_save(p_code bigint, p_name text, p_category text, p_active boolean default true) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
begin
  perform core.assert_perm('cost','map_edit');
  insert into cost.account_map (account_code, account_name, category, active)
  values (p_code, upper(btrim(p_name)), lower(p_category), coalesce(p_active, true))
  on conflict (account_code) do update set account_name = excluded.account_name, category = excluded.category, active = excluded.active;
  perform core.log('cost','account_map','account', p_code::text, jsonb_build_object('category', p_category, 'active', p_active));
end $$;

create or replace function cost_api.vendor_map_save(p_vendor text, p_base text, p_shift int default 0, p_active boolean default true) returns void
language plpgsql security definer set search_path = cost, core, pg_temp as $$
begin
  perform core.assert_perm('cost','map_edit');
  insert into cost.vendor_map (vendor_name, base_name, month_shift, active)
  values (cost.norm(p_vendor), upper(btrim(p_base)), coalesce(p_shift, 0), coalesce(p_active, true))
  on conflict (vendor_name) do update set base_name = excluded.base_name, month_shift = excluded.month_shift, active = excluded.active;
  perform core.log('cost','vendor_map','vendor', cost.norm(p_vendor), jsonb_build_object('base', p_base, 'shift', p_shift));
end $$;

-- ------------------------------------------------------------ power and fuel, month by month (financial year of p_month)
create or replace function cost_api.power_list(p_month date) returns jsonb
language plpgsql stable security definer set search_path = cost, core, pg_temp as $$
declare fy date := cost.fy_start(p_month);
begin
  perform core.assert_perm('cost','view');
  return coalesce((select jsonb_agg(to_jsonb(z) order by z.month) from (
    select k.m as month,
           pm.power_amount as power_eb,
           (select coalesce(sum(amount),0) from cost.expense_lines e where e.category = 'fuel' and e.cost_month = k.m) as fuel_diesel,
           (select h.amount from cost.history_monthly h where h.month = k.m and h.category = 'power_fuel') as workbook_total,
           (select tins from cost.month_tins(k.m, k.m)) as tins,
           exists (select 1 from cost.month_lock l where l.month = k.m) as locked
      from (select generate_series(fy, (fy + interval '11 months')::date, interval '1 month')::date m) k
      left join cost.power_monthly pm on pm.month = k.m) z), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------ grants
revoke all on all functions in schema cost from public, anon, authenticated;
revoke all on all functions in schema cost_api from public, anon;
grant usage on schema cost_api to authenticated;
grant execute on all functions in schema cost_api to authenticated;
