-- =====================================================================
-- pms_02_api.sql -- PMS RPC layer (pms_api). FOR REVIEW, not applied to Supabase.
-- Vendor / Variant (and Shape, Job, Spec) are "pick or type": if the name is
-- not in the list the entry screen sends it as typed text, the *_ensure
-- function normalises it (UPPER, trimmed, single spaces), reuses an existing
-- match (or alias) and otherwise adds it to the dropdown list automatically.
-- =====================================================================

create or replace function pms.norm(p text) returns text
language sql immutable as $$ select upper(btrim(regexp_replace(coalesce(p,''), '\s+', ' ', 'g'))) $$;

create or replace function pms.mkcode(p text) returns text
language sql immutable as $$
  select left(regexp_replace(pms.norm(p), '[^A-Z0-9]', '', 'g'), 4) $$;

-- edit window: owner roles edit within N days of the entry date, later only edit_old
create or replace function pms.assert_editable(p_entry_date date) returns void
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
declare d int := coalesce((core.rule_value('pms','edit_window_days'))::text::int, 7);
begin
  if p_entry_date < current_date - d and not core.has_perm('pms','edit_old') then
    raise exception 'edit_window_closed' using errcode = '42501';
  end if;
end $$;


-- editing an existing row: it must exist, and its ORIGINAL date must still be inside the edit window
-- (otherwise an old row could be moved to today's date to get around the window)
create or replace function pms.assert_row_editable(p_table text, p_id bigint) returns void
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
declare d date;
begin
  execute format('select entry_date from pms.%I where id = $1', p_table) into d using p_id;
  if d is null then raise exception 'record_not_found' using errcode = 'P0002'; end if;
  perform pms.assert_editable(d);
end $$;

-- ------------------------------------------------ pick-or-type masters
create or replace function pms.vendor_ensure(p_name text) returns bigint
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare n text := pms.norm(p_name); v bigint; c text; i int := 0;
begin
  if n = '' then raise exception 'vendor_required'; end if;
  select vendor_id into v from pms.vendor_aliases where alias = n;
  if v is not null then return v; end if;
  select id into v from pms.vendors where name = n;
  if v is not null then return v; end if;
  perform core.assert_perm('pms','masters_add');
  c := pms.mkcode(n); if c = '' then c := 'V'; end if;
  while exists (select 1 from pms.vendors where code = c) loop
    i := i + 1; c := left(pms.mkcode(n), 3) || i::text;
  end loop;
  insert into pms.vendors (name, code, created_by) values (n, c, auth.uid()) returning id into v;
  perform core.log('pms','vendor_add','vendor', v::text, jsonb_build_object('name', n));
  return v;
end $$;

create or replace function pms.variant_ensure(p_vendor bigint, p_name text) returns bigint
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare n text := pms.norm(p_name); v bigint; c text; i int := 0;
begin
  if n = '' then raise exception 'variant_required'; end if;
  select id into v from pms.variants where vendor_id = p_vendor and name = n;
  if v is not null then return v; end if;
  perform core.assert_perm('pms','masters_add');
  c := pms.mkcode(n); if c = '' then c := 'X'; end if;
  while exists (select 1 from pms.variants where vendor_id = p_vendor and code = c) loop
    i := i + 1; c := left(pms.mkcode(n), 3) || i::text;
  end loop;
  insert into pms.variants (vendor_id, name, code, created_by) values (p_vendor, n, c, auth.uid()) returning id into v;
  perform core.log('pms','variant_add','variant', v::text, jsonb_build_object('vendor_id', p_vendor, 'name', n));
  return v;
end $$;

create or replace function pms.shape_ensure(p_name text) returns bigint
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare n text := pms.norm(p_name); v bigint; c text; i int := 0;
begin
  if n = '' then raise exception 'shape_required'; end if;
  select id into v from pms.shapes where name = n; if v is not null then return v; end if;
  perform core.assert_perm('pms','masters_add');
  c := left(pms.mkcode(n),2); while exists (select 1 from pms.shapes where code = c) loop i := i+1; c := left(pms.mkcode(n),2)||i; end loop;
  insert into pms.shapes (name, code) values (n, c) returning id into v;
  perform core.log('pms','shape_add','shape', v::text, jsonb_build_object('name', n)); return v;
end $$;

create or replace function pms.colour_ensure(p_name text) returns bigint
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare n text := pms.norm(p_name); v bigint; c text; i int := 0;
begin
  if n = '' then raise exception 'colour_required'; end if;
  select id into v from pms.colours where name = n; if v is not null then return v; end if;
  perform core.assert_perm('pms','masters_add');
  c := left(pms.mkcode(n),2); while exists (select 1 from pms.colours where code = c) loop i := i+1; c := left(pms.mkcode(n),2)||i; end loop;
  insert into pms.colours (name, code) values (n, c) returning id into v;
  perform core.log('pms','colour_add','colour', v::text, jsonb_build_object('name', n)); return v;
end $$;

create or replace function pms.spec_ensure(p_shape bigint, p_job text, p_spec text) returns bigint
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare j bigint; s bigint; jn text := pms.norm(p_job); sn text := pms.norm(p_spec);
begin
  if jn = '' or sn = '' then raise exception 'job_and_spec_required'; end if;
  select id into j from pms.jobs where shape_id = p_shape and name = jn;
  if j is null then perform core.assert_perm('pms','masters_add');
    insert into pms.jobs (shape_id, name) values (p_shape, jn) returning id into j;
    perform core.log('pms','job_add','job', j::text, jsonb_build_object('name', jn)); end if;
  select id into s from pms.job_specs where job_id = j and spec = sn;
  if s is null then perform core.assert_perm('pms','masters_add');
    insert into pms.job_specs (job_id, spec) values (j, sn) returning id into s;
    perform core.log('pms','spec_add','job_spec', s::text, jsonb_build_object('spec', sn)); end if;
  return s;
end $$;

-- p: {vendor, variant, shape, colour, job, spec}  all plain text (picked or typed)
create or replace function pms.job_ref_ensure(p jsonb) returns bigint
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare v bigint; vr bigint; sh bigint; co bigint; sp bigint; r bigint; code text; sl pms.so_lines;
begin
  if nullif(p->>'so_line_id','') is not null then
    select * into sl from pms.so_lines where id = (p->>'so_line_id')::bigint;
    if sl.id is null then raise exception 'so_line_not_found'; end if;
    v := sl.vendor_id; vr := sl.variant_id;
    co := coalesce(sl.colour_id, pms.colour_ensure(p->>'colour'));
  else   -- no Sale Order (stock): vendor / variant picked or typed
    v  := pms.vendor_ensure(p->>'vendor');
    vr := pms.variant_ensure(v, p->>'variant');
    co := pms.colour_ensure(p->>'colour');
  end if;
  sh := pms.shape_ensure(p->>'shape');
  sp := pms.spec_ensure(sh, p->>'job', p->>'spec');
  select id into r from pms.job_refs where colour_id=co and vendor_id=v and variant_id=vr and job_spec_id=sp;
  if r is not null then return r; end if;
  perform core.assert_perm('pms','masters_add');
  select concat_ws('-', s.code, c.code, ve.code, va.code, regexp_replace(j.name,'[^A-Z0-9]','','g'), regexp_replace(js.spec,'[^A-Z0-9]','','g'))
    into code
    from pms.job_specs js join pms.jobs j on j.id=js.job_id join pms.shapes s on s.id=j.shape_id,
         pms.colours c, pms.vendors ve, pms.variants va
   where js.id=sp and c.id=co and ve.id=v and va.id=vr;
  insert into pms.job_refs (code, colour_id, vendor_id, variant_id, job_spec_id, created_by)
  values (code, co, v, vr, sp, auth.uid()) returning id into r;
  perform core.log('pms','job_ref_add','job_ref', r::text, jsonb_build_object('code', code));
  return r;
end $$;

-- ---------------------------------------------------- dropdown lists
create or replace function pms_api.masters_list() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return jsonb_build_object(
    'vendors',  coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code) order by name) from pms.vendors where active), '[]'),
    'variants', coalesce((select jsonb_agg(jsonb_build_object('id',id,'vendor_id',vendor_id,'name',name,'code',code) order by name) from pms.variants where active), '[]'),
    'shapes',   coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from pms.shapes), '[]'),
    'colours',  coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from pms.colours), '[]'),
    'jobs',     coalesce((select jsonb_agg(jsonb_build_object('id',id,'shape_id',shape_id,'name',name) order by name) from pms.jobs), '[]'),
    'specs',    coalesce((select jsonb_agg(jsonb_build_object('id',id,'job_id',job_id,'spec',spec) order by spec) from pms.job_specs), '[]'),
    'components', coalesce((select jsonb_agg(jsonb_build_object('code',code,'fg',fg_allowed,'sfg',sfg_allowed) order by sort_order) from pms.components), '[]'),
    'job_refs', coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'vendor_id',vendor_id,'variant_id',variant_id,'colour_id',colour_id,'job_spec_id',job_spec_id) order by code) from pms.job_refs where active), '[]'));
end $$;

-- the "enter manually" button on any entry screen calls this: returns the Job ID row
create or replace function pms_api.job_ref_ensure(p jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare r bigint;
begin
  perform core.assert_perm('pms','reports_view');
  r := pms.job_ref_ensure(p);
  return (select jsonb_build_object('id',id,'code',code) from pms.job_refs where id=r);
end $$;

create or replace function pms_api.vendor_add(p_name text) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare v bigint;
begin
  perform core.assert_perm('pms','masters_add');
  v := pms.vendor_ensure(p_name);
  return (select jsonb_build_object('id',id,'name',name,'code',code) from pms.vendors where id=v);
end $$;

create or replace function pms_api.variant_add(p_vendor bigint, p_name text) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare v bigint;
begin
  perform core.assert_perm('pms','masters_add');
  v := pms.variant_ensure(p_vendor, p_name);
  return (select jsonb_build_object('id',id,'vendor_id',vendor_id,'name',name,'code',code) from pms.variants where id=v);
end $$;

-- ------------------------------------------------ Sale Order sheet drop
-- rows: [{so_no, so_date, vendor, variant, colour, description, qty, status}]  (sheet columns)
-- Re-dropping the same sheet updates qty / status; vendors and variants not yet listed are added.
create or replace function pms_api.so_drop(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare r jsonb; v bigint; vr bigint; co bigint; ins int := 0; upd int := 0; n int;
begin
  perform core.assert_perm('pms','so_drop');
  for r in select * from jsonb_array_elements(p_rows) loop
    continue when btrim(coalesce(r->>'so_no','')) = '';
    v  := pms.vendor_ensure(r->>'vendor');
    vr := pms.variant_ensure(v, coalesce(nullif(btrim(r->>'variant'),''), r->>'description'));
    co := case when btrim(coalesce(r->>'colour','')) <> '' then pms.colour_ensure(r->>'colour') end;
    update pms.so_lines set so_date=(r->>'so_date')::date, colour_id=co, qty=(r->>'qty')::numeric, status=r->>'status', dropped_by=auth.uid(), dropped_at=now()
     where so_no=btrim(r->>'so_no') and variant_id=vr and description=pms.norm(r->>'description');
    get diagnostics n = row_count;
    if n = 0 then
      insert into pms.so_lines (so_no, so_date, vendor_id, variant_id, colour_id, description, qty, status, dropped_by)
      values (btrim(r->>'so_no'), (r->>'so_date')::date, v, vr, co, pms.norm(r->>'description'), (r->>'qty')::numeric, r->>'status', auth.uid());
      ins := ins + 1;
    else upd := upd + n; end if;
  end loop;
  perform core.log('pms','so_drop','so_lines', null, jsonb_build_object('added', ins, 'updated', upd));
  return jsonb_build_object('added', ins, 'updated', upd);
end $$;

create or replace function pms_api.so_lines_list(p_open_only boolean default true) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.so_date desc nulls last, x.so_no desc) from (
    select l.id, l.so_no, l.so_date, v.name as vendor, va.name as variant, c.name as colour, l.description, l.qty, l.status
      from pms.so_lines l join pms.vendors v on v.id=l.vendor_id join pms.variants va on va.id=l.variant_id
      left join pms.colours c on c.id=l.colour_id
     where not p_open_only or coalesce(upper(l.status),'') not in ('CLOSED','COMPLETED','CANCELLED')) x), '[]');
end $$;

-- ------------------------------------------------------------ inward
-- p: {id?, skid_no, entry_date, dc_no, received_from, so_no, stock_reason, job:{vendor,variant,shape,colour,job,spec},
--     components_in_skid, gross_wt, net_wt, sheet_l, sheet_b, sheet_w, single_sheet_wt, weight_in_nos}
create or replace function pms_api.inward_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare r bigint; v_id bigint := nullif(p->>'id','')::bigint; d date := (p->>'entry_date')::date;
begin
  perform core.assert_perm('pms','inward_enter');
  perform pms.assert_editable(d);
  if v_id is not null then perform pms.assert_row_editable('inward_skids', v_id); end if;
  r := pms.job_ref_ensure(p->'job');
  if exists (select 1 from pms.inward_skids k where k.skid_no = btrim(p->>'skid_no') and k.id is distinct from v_id) then raise exception 'skid_no_exists'; end if;
  if v_id is null then
    insert into pms.inward_skids (skid_no, entry_date, dc_no, received_from, so_no, so_line_id, stock_reason, job_ref_id,
        components_in_skid, gross_wt, net_wt, sheet_l, sheet_b, sheet_w, single_sheet_wt, weight_in_nos, created_by)
    values (btrim(p->>'skid_no'), d, p->>'dc_no', p->>'received_from', coalesce((select sl.so_no from pms.so_lines sl where sl.id=nullif(p->>'so_line_id','')::bigint), nullif(btrim(p->>'so_no'),'')), nullif(p->>'so_line_id','')::bigint, p->>'stock_reason', r,
        p->>'components_in_skid', (p->>'gross_wt')::numeric, (p->>'net_wt')::numeric, (p->>'sheet_l')::numeric,
        (p->>'sheet_b')::numeric, (p->>'sheet_w')::numeric, (p->>'single_sheet_wt')::numeric, (p->>'weight_in_nos')::numeric, auth.uid())
    returning inward_skids.id into v_id;
    perform core.log('pms','inward_add','inward_skid', v_id::text, jsonb_build_object('skid_no', p->>'skid_no'));
  else
    update pms.inward_skids set entry_date=d, dc_no=p->>'dc_no', received_from=p->>'received_from',
        so_no=coalesce((select sl.so_no from pms.so_lines sl where sl.id=nullif(p->>'so_line_id','')::bigint), nullif(btrim(p->>'so_no'),'')), so_line_id=nullif(p->>'so_line_id','')::bigint, stock_reason=p->>'stock_reason', job_ref_id=r,
        components_in_skid=p->>'components_in_skid', gross_wt=(p->>'gross_wt')::numeric, net_wt=(p->>'net_wt')::numeric,
        sheet_l=(p->>'sheet_l')::numeric, sheet_b=(p->>'sheet_b')::numeric, sheet_w=(p->>'sheet_w')::numeric,
        single_sheet_wt=(p->>'single_sheet_wt')::numeric, weight_in_nos=(p->>'weight_in_nos')::numeric,
        updated_by=auth.uid(), updated_at=now()
     where inward_skids.id = v_id;
    perform core.log('pms','inward_edit','inward_skid', v_id::text, null);
  end if;
  return jsonb_build_object('id', v_id, 'job_ref_id', r);
end $$;

create or replace function pms_api.inward_list(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.entry_date desc, x.id desc) from (
    select i.id, i.skid_no, i.entry_date, i.dc_no, i.received_from, i.so_no, i.stock_reason, i.status, i.net_wt, i.weight_in_nos,
           jr.code as job_id, v.name as vendor, va.name as variant
      from pms.inward_skids i join pms.job_refs jr on jr.id=i.job_ref_id
      join pms.vendors v on v.id=jr.vendor_id join pms.variants va on va.id=jr.variant_id
     where i.entry_date between p_from and p_to) x), '[]');
end $$;

create or replace function pms_api.skid_status(p_id bigint, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','skid_close');
  if p_status not in ('Instock','WIP','Used','Moved','Closed') then raise exception 'bad_status'; end if;
  update pms.inward_skids set status=p_status, status_note=p_note, used_date = case when p_status in ('Used','Closed') then current_date end,
         updated_by=auth.uid(), updated_at=now() where id=p_id;
  perform core.log('pms','skid_status','inward_skid', p_id::text, jsonb_build_object('status', p_status));
end $$;

-- ---------------------------------------------------------- production
-- p: {id?, entry_date, job:{...}, component, actual_production, man_power, hours, fg, sfg, scrap}
create or replace function pms_api.production_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare r bigint; v_id bigint := nullif(p->>'id','')::bigint; d date := (p->>'entry_date')::date;
begin
  perform core.assert_perm('pms','production_enter');
  perform pms.assert_editable(d);
  if v_id is not null then perform pms.assert_row_editable('production', v_id); end if;
  r := pms.job_ref_ensure(p->'job');
  if v_id is null then
    insert into pms.production (entry_date, job_ref_id, component, actual_production, man_power, hours, fg, sfg, scrap, created_by)
    values (d, r, upper(p->>'component'), coalesce((p->>'actual_production')::numeric,0), (p->>'man_power')::numeric,
            (p->>'hours')::numeric, (p->>'fg')::numeric, (p->>'sfg')::numeric, (p->>'scrap')::numeric, auth.uid())
    returning production.id into v_id;
    perform core.log('pms','production_add','production', v_id::text, null);
  else
    update pms.production set entry_date=d, job_ref_id=r, component=upper(p->>'component'),
        actual_production=coalesce((p->>'actual_production')::numeric,0), man_power=(p->>'man_power')::numeric,
        hours=(p->>'hours')::numeric, fg=(p->>'fg')::numeric, sfg=(p->>'sfg')::numeric, scrap=(p->>'scrap')::numeric,
        updated_by=auth.uid(), updated_at=now() where production.id = v_id;
    perform core.log('pms','production_edit','production', v_id::text, null);
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function pms_api.production_day(p_date date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select pr.id, pr.component, pr.actual_production, pr.man_power, pr.hours, pr.fg, pr.sfg, pr.scrap, jr.code as job_id
        from pms.production pr join pms.job_refs jr on jr.id=pr.job_ref_id where pr.entry_date=p_date) x), '[]'),
    'cans', coalesce((select sum(actual_production) from pms.production where entry_date=p_date and component='CAN'),0));
end $$;

-- the figure the Payroll Dashboard "Tins produced" box will read later
create or replace function pms_api.tins_produced(p_date date) returns numeric
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select sum(actual_production) from pms.production where entry_date=p_date and component='CAN'),0);
end $$;

-- ------------------------------------------------------------ outward
create or replace function pms_api.outward_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare r bigint; v_id bigint := nullif(p->>'id','')::bigint; d date := (p->>'entry_date')::date;
begin
  perform core.assert_perm('pms','outward_enter');
  perform pms.assert_editable(d);
  if v_id is not null then perform pms.assert_row_editable('outward', v_id); end if;
  r := pms.job_ref_ensure(p->'job');
  if v_id is null then
    insert into pms.outward (entry_date, so_no, so_line_id, job_ref_id, boxes, packing_style, dispatch_qty, invoice, dc_no, transport_contact, vehicle_no, created_by)
    values (d, coalesce((select sl.so_no from pms.so_lines sl where sl.id=nullif(p->>'so_line_id','')::bigint), nullif(btrim(p->>'so_no'),'')), nullif(p->>'so_line_id','')::bigint, r, (p->>'boxes')::numeric, p->>'packing_style', coalesce((p->>'dispatch_qty')::numeric,0),
            p->>'invoice', p->>'dc_no', p->>'transport_contact', p->>'vehicle_no', auth.uid())
    returning outward.id into v_id;
    perform core.log('pms','outward_add','outward', v_id::text, null);
  else
    update pms.outward set entry_date=d, so_no=coalesce((select sl.so_no from pms.so_lines sl where sl.id=nullif(p->>'so_line_id','')::bigint), nullif(btrim(p->>'so_no'),'')), so_line_id=nullif(p->>'so_line_id','')::bigint, job_ref_id=r, boxes=(p->>'boxes')::numeric,
        packing_style=p->>'packing_style', dispatch_qty=coalesce((p->>'dispatch_qty')::numeric,0), invoice=p->>'invoice',
        dc_no=p->>'dc_no', transport_contact=p->>'transport_contact', vehicle_no=p->>'vehicle_no',
        updated_by=auth.uid(), updated_at=now() where outward.id = v_id;
    perform core.log('pms','outward_edit','outward', v_id::text, null);
  end if;
  return jsonb_build_object('id', v_id);
end $$;

-- ------------------------------------------------------------ stock
-- FG stock per Job ID and component = opening + production FG - dispatched (CAN only for dispatch)
create or replace function pms_api.stock_summary() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.job_id, x.component) from (
    select jr.code as job_id, c.code as component,
           coalesce((select sum(qty) from pms.opening_stock o where o.job_ref_id=jr.id and o.component=c.code),0)
         + coalesce((select sum(coalesce(fg,actual_production)) from pms.production p where p.job_ref_id=jr.id and p.component=c.code),0)
         - case when c.code='CAN' then coalesce((select sum(dispatch_qty) from pms.outward w where w.job_ref_id=jr.id),0) else 0 end as in_stock
      from pms.job_refs jr cross join pms.components c where c.fg_allowed) x
    where x.in_stock <> 0), '[]');
end $$;

-- skid ageing / status counts using the global WIP/USED threshold
create or replace function pms_api.skid_board() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
declare th int := coalesce((core.rule_value('pms','skid_wip_used_threshold'))::text::int, 50);
        nm int := coalesce((core.rule_value('pms','non_moving_months'))::text::int, 3);
begin
  perform core.assert_perm('pms','reports_view');
  return jsonb_build_object(
    'threshold', th,
    'counts', (select coalesce(jsonb_object_agg(status, n),'{}') from (select status, count(*) n from pms.inward_skids group by status) s),
    'non_moving', (select count(*) from pms.inward_skids where status='Instock' and entry_date < current_date - (nm*30)),
    'wip_used_over_threshold', (select count(*) > th from pms.inward_skids where status in ('WIP','Used')));
end $$;

-- ------------------------------------------------------------ grants
revoke all on all functions in schema pms from public, anon, authenticated;
revoke all on all functions in schema pms_api from public, anon;
grant usage on schema pms_api to authenticated;
grant execute on all functions in schema pms_api to authenticated;
