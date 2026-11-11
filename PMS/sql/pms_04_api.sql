-- =====================================================================
-- pms_04_api.sql -- PMS functions added after the screens were finalised.
-- FOR REVIEW: nothing here has been applied to Supabase. Load after pms_03.
-- Every function is SECURITY DEFINER, checks a permission first, and is the ONLY way in.
-- =====================================================================

-- allowed delay per module for the Status check (days); editable on the Rules screen
insert into core.rules (module, key, value, effective_from, note)
select 'pms','status_allowed_delay','{"production":0,"slitting":0,"inward":0,"outward":0,"scrap":0,"carton":2,"alum":2,"payroll":0}'::jsonb,
       date '2000-01-01','Days a module may stay without an entry before it counts as late'
 where not exists (select 1 from core.rules where module='pms' and key='status_allowed_delay');

-- ---------------------------------------------------- Job ID (workbook format)
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
  insert into pms.job_refs (code, colour_id, vendor_id, variant_id, job_spec_id, created_by)
  values ('', co, v, vr, sp, auth.uid()) returning id into r;
  update pms.job_refs set code = pms.job_ref_code(r) where id = r;
  perform core.log('pms','job_ref_add','job_ref', r::text, jsonb_build_object('code', pms.job_ref_code(r)));
  return r;
end $$;


-- ======================================================= saves not in pms_02
-- slitting: p = {id?, entry_date, skid_id, <editable copies and layout fields>}
create or replace function pms_api.slitting_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare v_id bigint := nullif(p->>'id','')::bigint; d date := (p->>'entry_date')::date; comps text;
begin
  perform core.assert_perm('pms','slitting_enter');
  perform pms.assert_editable(d);
  if v_id is not null then perform pms.assert_row_editable('slitting', v_id); end if;
  if not exists (select 1 from pms.inward_skids k where k.id=(p->>'skid_id')::bigint) then raise exception 'skid_not_found'; end if;
  -- VBA rule: components in the skid decide which layout / SL fields may carry a number (others stay 0)
  comps := upper(coalesce(p->>'components_in_skid',''));
  p := p || jsonb_build_object(
    'body_layout',   case when comps like '%BODY%'   then p->'body_layout'   else '0' end::jsonb,
    'body_sl',       case when comps like '%BODY%'   then p->'body_sl'       else '0' end::jsonb,
    'lid_layout',    case when comps like '%LID%'    then p->'lid_layout'    else '0' end::jsonb,
    'lid_sl',        case when comps like '%LID%'    then p->'lid_sl'        else '0' end::jsonb,
    'bottom_layout', case when comps like '%BOTTOM%' then p->'bottom_layout' else '0' end::jsonb,
    'bottom_sl',     case when comps like '%BOTTOM%' then p->'bottom_sl'     else '0' end::jsonb);
  if v_id is null then
    insert into pms.slitting (entry_date, skid_id, created_by) values (d, (p->>'skid_id')::bigint, auth.uid()) returning slitting.id into v_id;
    perform core.log('pms','slitting_add','slitting', v_id::text, null);
  else
    perform core.log('pms','slitting_edit','slitting', v_id::text, null);
  end if;
  update pms.slitting set entry_date=d, skid_id=(p->>'skid_id')::bigint,
    components_in_skid=p->>'components_in_skid', gross_wt=(p->>'gross_wt')::numeric, net_wt=(p->>'net_wt')::numeric,
    sheet_l=(p->>'sheet_l')::numeric, sheet_b=(p->>'sheet_b')::numeric, sheet_w=(p->>'sheet_w')::numeric,
    single_sheet_wt=(p->>'single_sheet_wt')::numeric, weight_in_nos=(p->>'weight_in_nos')::numeric, slitting_count=(p->>'slitting_count')::numeric,
    body_layout=(p->>'body_layout')::numeric, lid_layout=(p->>'lid_layout')::numeric, bottom_layout=(p->>'bottom_layout')::numeric,
    body_sl=(p->>'body_sl')::numeric, lid_sl=(p->>'lid_sl')::numeric, bottom_sl=(p->>'bottom_sl')::numeric,
    expected_production=(p->>'expected_production')::numeric, strip_wt=(p->>'strip_wt')::numeric,
    lid_jl=(p->>'lid_jl')::numeric, bottom_jl=(p->>'bottom_jl')::numeric,
    body_wt=(p->>'body_wt')::numeric, lid_wt=(p->>'lid_wt')::numeric, bottom_wt=(p->>'bottom_wt')::numeric, tin_wt=(p->>'tin_wt')::numeric,
    bifurcated_skid=(p->>'bifurcated_skid')::numeric, raw_skid=(p->>'raw_skid')::numeric, variance=(p->>'variance')::numeric,
    updated_by=auth.uid(), updated_at=now()
   where slitting.id = v_id;
  return jsonb_build_object('id', v_id, 'skid_state', pms.skid_state((p->>'skid_id')::bigint));
end $$;

-- scrap: kg in, counts out. Counts use the Job Master weights (grams): count = kg x 1000 / weight
create or replace function pms_api.scrap_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare r bigint; v_id bigint := nullif(p->>'id','')::bigint; d date := (p->>'entry_date')::date; j pms.job_master; sp bigint;
        wb numeric; wl numeric; wt numeric; kb numeric := (p->>'kg_body')::numeric; kl numeric := (p->>'kg_lid')::numeric; kt numeric := (p->>'kg_bottom')::numeric;
        kbb numeric := (p->>'kg_body_bottom')::numeric;
begin
  perform core.assert_perm('pms','scrap_enter');
  perform pms.assert_editable(d);
  if v_id is not null then perform pms.assert_row_editable('scrap', v_id); end if;
  r := pms.job_ref_ensure(p->'job');
  select jr.job_spec_id into sp from pms.job_refs jr where jr.id=r;
  select * into j from pms.job_master where job_spec_id=sp;
  wb := pms.jm_body(j); wl := pms.jm_lid(j); wt := pms.jm_bot(j);
  if v_id is null then
    insert into pms.scrap (entry_date, job_ref_id, created_by) values (d, r, auth.uid()) returning scrap.id into v_id;
    perform core.log('pms','scrap_add','scrap', v_id::text, null);
  else perform core.log('pms','scrap_edit','scrap', v_id::text, null); end if;
  update pms.scrap set entry_date=d, job_ref_id=r, kg_body=kb, kg_lid=kl, kg_bottom=kt, kg_body_bottom=kbb,
    wt_body=wb, wt_lid=wl, wt_bottom=wt, wt_body_bottom=case when wb is not null and wt is not null then wb+wt end,
    count_body   = case when wb>0 then round(kb*1000/wb) end,
    count_lid    = case when wl>0 then round(kl*1000/wl) end,
    count_bottom = case when wt>0 then round(kt*1000/wt) end,
    updated_by=auth.uid(), updated_at=now() where scrap.id = v_id;
  return jsonb_build_object('id', v_id, 'job_master_complete', (wb is not null and wl is not null and wt is not null));
end $$;

-- carton / alum & tape: purchase or issue. p = {id?, kind:'carton'|'alum', entry_date, item_id, entry_type, qty}
create or replace function pms_api.ledger_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare v_id bigint := nullif(p->>'id','')::bigint; d date := (p->>'entry_date')::date; kind text := p->>'kind';
begin
  perform core.assert_perm('pms','ledger_enter');
  perform pms.assert_editable(d);
  if v_id is not null then perform pms.assert_row_editable(case kind when 'carton' then 'carton_ledger' else 'alum_tape_ledger' end, v_id); end if;
  if upper(p->>'entry_type') not in ('PURCHASE','ISSUED') then raise exception 'bad_entry_type'; end if;
  if kind = 'carton' then
    if v_id is null then
      insert into pms.carton_ledger (entry_date,item_id,entry_type,qty,created_by) values (d,(p->>'item_id')::bigint,upper(p->>'entry_type'),(p->>'qty')::numeric,auth.uid()) returning carton_ledger.id into v_id;
    else update pms.carton_ledger set entry_date=d,item_id=(p->>'item_id')::bigint,entry_type=upper(p->>'entry_type'),qty=(p->>'qty')::numeric,updated_by=auth.uid(),updated_at=now() where carton_ledger.id=v_id; end if;
  elsif kind = 'alum' then
    if v_id is null then
      insert into pms.alum_tape_ledger (entry_date,item_id,entry_type,qty,created_by) values (d,(p->>'item_id')::bigint,upper(p->>'entry_type'),(p->>'qty')::numeric,auth.uid()) returning alum_tape_ledger.id into v_id;
    else update pms.alum_tape_ledger set entry_date=d,item_id=(p->>'item_id')::bigint,entry_type=upper(p->>'entry_type'),qty=(p->>'qty')::numeric,updated_by=auth.uid(),updated_at=now() where alum_tape_ledger.id=v_id; end if;
  else raise exception 'bad_kind'; end if;
  perform core.log('pms','ledger_'||kind,kind||'_ledger', v_id::text, null);
  return jsonb_build_object('id', v_id);
end $$;

-- production: replaces the pms_02 version. Rules: hours and man power are required;
-- BODY / LID / BOTTOM -> FG only (SFG = 0); CAN -> FG and SFG; TAGGER -> both 0.
create or replace function pms_api.production_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare r bigint; v_id bigint := nullif(p->>'id','')::bigint; d date := (p->>'entry_date')::date; comp text := upper(p->>'component');
        v_fg numeric := (p->>'fg')::numeric; v_sfg numeric := (p->>'sfg')::numeric; mp numeric := (p->>'man_power')::numeric; hrs numeric := (p->>'hours')::numeric;
        act numeric := coalesce((p->>'actual_production')::numeric,0); expmp numeric; jb bigint;
begin
  perform core.assert_perm('pms','production_enter');
  perform pms.assert_editable(d);
  if v_id is not null then perform pms.assert_row_editable('production', v_id); end if;
  if coalesce(mp,0) <= 0 then raise exception 'man_power_required'; end if;
  if coalesce(hrs,0) <= 0 then raise exception 'hours_required'; end if;
  if comp in ('BODY','LID','BOTTOM') then v_sfg := 0; elsif comp = 'TAGGER' then v_fg := 0; v_sfg := 0; end if;
  r := pms.job_ref_ensure(p->'job');
  select js.job_id into jb from pms.job_refs jr join pms.job_specs js on js.id=jr.job_spec_id where jr.id=r;
  -- expected man power = matrix man power / matrix target (per 8 h) x actual x (8 / hours)
  select case when s.target_qty_8h>0 and pms.mp_for(jb,comp) > 0 then round(pms.mp_for(jb,comp)/s.target_qty_8h*act*(8/hrs)) end
    into expmp from pms.job_standards s where s.job_id=jb;
  if v_id is null then
    insert into pms.production (entry_date, job_ref_id, component, actual_production, man_power, hours, expected_man_power, fg, sfg, scrap, created_by)
    values (d, r, comp, act, mp, hrs, expmp, v_fg, v_sfg, (p->>'scrap')::numeric, auth.uid()) returning production.id into v_id;
    perform core.log('pms','production_add','production', v_id::text, null);
  else
    update pms.production set entry_date=d, job_ref_id=r, component=comp, actual_production=act, man_power=mp, hours=hrs, expected_man_power=expmp,
        fg=v_fg, sfg=v_sfg, scrap=(p->>'scrap')::numeric, updated_by=auth.uid(), updated_at=now() where production.id = v_id;
    perform core.log('pms','production_edit','production', v_id::text, null);
  end if;
  return jsonb_build_object('id', v_id, 'expected_man_power', expmp);
end $$;

-- ================================================== skids (computed status)
create or replace function pms_api.inward_list(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.entry_date desc, x.id desc) from (
    select i.id, i.skid_no, i.entry_date, i.dc_no, i.received_from, i.so_no, i.stock_reason, pms.skid_state(i.id) as status,
           i.net_wt, i.weight_in_nos, i.weight_in_nos - pms.skid_used(i.id) as sheets_left, jr.code as job_id, v.name as vendor, va.name as variant
      from pms.inward_skids i join pms.job_refs jr on jr.id=i.job_ref_id
      join pms.vendors v on v.id=jr.vendor_id join pms.variants va on va.id=jr.variant_id
     where i.entry_date between p_from and p_to) x), '[]');
end $$;

-- only Moved / Closed are set by hand; null clears it so the skid goes back to its computed state
drop function if exists pms_api.skid_status(bigint, text, text);
create or replace function pms_api.skid_status(p_id bigint, p_state text, p_note text default null) returns text
language plpgsql security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','skid_close');
  if p_state is not null and p_state not in ('Moved','Closed') then raise exception 'bad_state'; end if;
  update pms.inward_skids set manual_state=p_state, status_note=p_note, used_date=case when p_state='Closed' then current_date end,
         updated_by=auth.uid(), updated_at=now() where id=p_id;
  perform core.log('pms','skid_state','inward_skid', p_id::text, jsonb_build_object('state', p_state));
  return pms.skid_state(p_id);
end $$;

create or replace function pms_api.skid_board() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
declare th int := coalesce((core.rule_value('pms','skid_wip_used_threshold'))::text::int, 50);
        nm int := coalesce((core.rule_value('pms','non_moving_months'))::text::int, 3);
begin
  perform core.assert_perm('pms','reports_view');
  return jsonb_build_object('threshold', th,
    'counts', (select coalesce(jsonb_object_agg(st, n),'{}') from (select pms.skid_state(id) st, count(*) n from pms.inward_skids group by 1) s),
    'non_moving', (select count(*) from pms.inward_skids where pms.skid_state(id)='Instock' and entry_date < current_date - (nm*30)));
end $$;

-- =========================================== man power from Payroll punches
-- Break rules (all values from the Rules screen): punch <= shift hours -> as it is;
-- >= break1_from -> minus break1_min; >= break2_from -> minus break2_min (total); in between
-- 8 and break1_from only the excess over shift hours is removed. A punch is capped at max_punch_hours.
-- OT = worked hours above shift_hours per person. Equivalent man power = worked hours / shift_hours.
create or replace function pms.worked_hours(p_punch numeric) returns numeric
language plpgsql stable as $$
declare sh numeric := coalesce((core.rule_value('pms','shift_hours'))::text::numeric, 8);
        b1f numeric := coalesce((core.rule_value('pms','break1_from'))::text::numeric, 8.5);
        b1m numeric := coalesce((core.rule_value('pms','break1_min'))::text::numeric, 30);
        b2f numeric := coalesce((core.rule_value('pms','break2_from'))::text::numeric, 12);
        b2m numeric := coalesce((core.rule_value('pms','break2_min'))::text::numeric, 60);
        mx  numeric := coalesce((core.rule_value('pms','max_punch_hours'))::text::numeric, 14);
        h numeric := least(coalesce(p_punch,0), mx);
begin
  if h <= sh then return h; end if;
  if h >= b2f then return h - b2m/60; end if;
  if h >= b1f then return h - b1m/60; end if;
  return sh;
end $$;

-- one day, by designation. Present = has both an in and an out punch.
create or replace function pms.mp_day(p_date date) returns table (des text, people int, punch_h numeric, worked_h numeric, ot_h numeric, counted boolean)
language plpgsql stable security definer set search_path = pms, payroll, core, pg_temp as $$
declare sh numeric := coalesce((core.rule_value('pms','shift_hours'))::text::numeric, 8);
        dl jsonb := coalesce(core.rule_value('pms','mp_designations'), '["HELPER","OPER","OPERATOR","PROD"]'::jsonb);
begin
  return query
  with p as (
    select upper(btrim(e.designation)) as d,
           round(extract(epoch from (case when a.out_time >= a.in_time then a.out_time - a.in_time else a.out_time - a.in_time + interval '24 hours' end))/3600.0, 2) as punch
      from payroll.attendance a join payroll.employees e on e.emp_id = a.emp_id
     where a.work_date = p_date and a.in_time is not null and a.out_time is not null),
  w as (select d, punch, pms.worked_hours(punch) as worked from p where punch > 0)
  select w.d, count(*)::int, round(sum(w.punch),2), round(sum(w.worked),2), round(sum(greatest(w.worked - sh, 0)),2), (dl ? w.d)
    from w group by w.d order by w.d;
end $$;

create or replace function pms_api.manpower_day(p_date date) returns jsonb
language plpgsql stable security definer set search_path = pms, payroll, core, pg_temp as $$
declare sh numeric := coalesce((core.rule_value('pms','shift_hours'))::text::numeric, 8);
begin
  perform core.assert_perm('pms','reports_view');
  return jsonb_build_object('date', p_date, 'shift_hours', sh,
    'designations', coalesce((select jsonb_agg(to_jsonb(m)) from pms.mp_day(p_date) m), '[]'),
    'people',   coalesce((select sum(people) from pms.mp_day(p_date) where counted),0),
    'worked_h', coalesce((select sum(worked_h) from pms.mp_day(p_date) where counted),0),
    'ot_h',     coalesce((select sum(ot_h) from pms.mp_day(p_date) where counted),0),
    'equivalent_mp', round(coalesce((select sum(worked_h) from pms.mp_day(p_date) where counted),0)/sh, 1));
end $$;

-- Suggested man power / hours for the production rows of a day (mode "suggested").
-- Job man-hours = the day's worked man-hours x (this job's expected man-hours / all jobs' expected man-hours).
-- Expected man-hours = matrix man power / matrix target (per 8 h) x actual x 8. p_extra = a row not saved yet.
create or replace function pms_api.mp_suggest(p_date date, p_extra jsonb default null) returns jsonb
language plpgsql stable security definer set search_path = pms, payroll, core, pg_temp as $$
declare sh numeric := coalesce((core.rule_value('pms','shift_hours'))::text::numeric, 8);
        pres int; mh numeric; tot numeric; res jsonb; xr bigint; xjob bigint; xe numeric := 0;
begin
  perform core.assert_perm('pms','reports_view');
  select coalesce(sum(people),0), coalesce(sum(worked_h),0) into pres, mh from pms.mp_day(p_date) where counted;
  if p_extra is not null then
    xr := pms.job_ref_ensure_ro(p_extra->'job');
    select js.job_id into xjob from pms.job_refs jr join pms.job_specs js on js.id=jr.job_spec_id where jr.id=xr;
    select case when s.target_qty_8h>0 and pms.mp_for(xjob, upper(p_extra->>'component'))>0
                then pms.mp_for(xjob, upper(p_extra->>'component'))/s.target_qty_8h*coalesce((p_extra->>'actual_production')::numeric,0)*8 else 0 end
      into xe from pms.job_standards s where s.job_id = xjob;
    xe := coalesce(xe, 0);
  end if;
  with r as (
    select pr.id::text as key,
           case when s.target_qty_8h>0 and pms.mp_for(js.job_id, pr.component)>0
                then pms.mp_for(js.job_id, pr.component)/s.target_qty_8h*pr.actual_production*8 else 0 end as e
      from pms.production pr join pms.job_refs jr on jr.id=pr.job_ref_id join pms.job_specs js on js.id=jr.job_spec_id
      left join pms.job_standards s on s.job_id=js.job_id
     where pr.entry_date=p_date and pr.id is distinct from nullif(p_extra->>'id','')::bigint
    union all select 'new', xe where p_extra is not null)
  select coalesce(sum(e),0), coalesce(jsonb_agg(jsonb_build_object('key', key, 'expected_man_hours', round(e,2)) order by key), '[]')
    into tot, res from r;
  -- per-row suggestion
  res := coalesce((select jsonb_agg(
            (x - 'expected_man_hours') || jsonb_build_object('expected_man_hours', x->'expected_man_hours',
              'job_man_hours', round(case when tot>0 then mh*(x->>'expected_man_hours')::numeric/tot else 0 end,2),
              'man_power', case when (x->>'expected_man_hours')::numeric>0 then
                   greatest(1, least(pres, round(mh*(x->>'expected_man_hours')::numeric/tot/sh)))::int end,
              'hours', case when (x->>'expected_man_hours')::numeric>0 then
                   round((mh*(x->>'expected_man_hours')::numeric/tot) / greatest(1, least(pres, round(mh*(x->>'expected_man_hours')::numeric/tot/sh))), 1) end))
          from jsonb_array_elements(res) x), '[]');
  return jsonb_build_object('present', pres, 'day_man_hours', mh, 'booked_expected_man_hours', round(tot,2), 'rows', res);
end $$;

-- same as job_ref_ensure but never creates anything (used for preview before saving)
create or replace function pms.job_ref_ensure_ro(p jsonb) returns bigint
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
declare v bigint; vr bigint; co bigint; sp bigint; sl pms.so_lines;
begin
  if nullif(p->>'so_line_id','') is not null then
    select * into sl from pms.so_lines where id=(p->>'so_line_id')::bigint; v:=sl.vendor_id; vr:=sl.variant_id; co:=sl.colour_id;
  else
    select id into v from pms.vendors where name=pms.norm(p->>'vendor');
    select id into vr from pms.variants where vendor_id=v and name=pms.norm(p->>'variant');
    select id into co from pms.colours where name=pms.norm(p->>'colour');
  end if;
  select js.id into sp from pms.job_specs js join pms.jobs j on j.id=js.job_id join pms.shapes s on s.id=j.shape_id
   where s.name=pms.norm(p->>'shape') and j.name=pms.norm(p->>'job') and js.spec=pms.norm(p->>'spec');
  return (select id from pms.job_refs where colour_id=co and vendor_id=v and variant_id=vr and job_spec_id=sp);
end $$;

-- ======================================================= Man Power Matrix
create or replace function pms_api.matrix_list() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.job) from (
    select j.id as job_id, sh.name as shape, j.name as job, s.target_qty_8h as target, s.man_power as can_mp,
           s.body_mp, s.lid_mp, s.bottom_mp,
           pms.mp_for(j.id,'CAN') as can_total, pms.mp_for(j.id,'BODY') as body_eff, pms.mp_for(j.id,'LID') as lid_eff, pms.mp_for(j.id,'BOTTOM') as bottom_eff
      from pms.jobs j join pms.shapes sh on sh.id=j.shape_id left join pms.job_standards s on s.job_id=j.id) x), '[]');
end $$;

-- p = {job_id, target, can_mp, body_mp, lid_mp, bottom_mp}  (blank component = split automatically)
create or replace function pms_api.matrix_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','matrix_edit');
  insert into pms.job_standards (job_id, target_qty_8h, man_power, body_mp, lid_mp, bottom_mp, updated_by, updated_at)
  values ((p->>'job_id')::bigint, (p->>'target')::numeric, (p->>'can_mp')::numeric, nullif(p->>'body_mp','')::numeric,
          nullif(p->>'lid_mp','')::numeric, nullif(p->>'bottom_mp','')::numeric, auth.uid(), now())
  on conflict (job_id) do update set target_qty_8h=excluded.target_qty_8h, man_power=excluded.man_power, body_mp=excluded.body_mp,
     lid_mp=excluded.lid_mp, bottom_mp=excluded.bottom_mp, updated_by=auth.uid(), updated_at=now();
  perform core.log('pms','matrix_save','job_standard', p->>'job_id', p);
  return jsonb_build_object('can_total', pms.mp_for((p->>'job_id')::bigint,'CAN'));
end $$;

-- ================================================ Job Master (Quality edits)
create or replace function pms_api.job_master_list() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.shape, x.job, x.spec) from (
    select sh.name as shape, j.name as job, js.spec, m.*, pms.jm_body(m) as w_body, pms.jm_lid(m) as w_lid, pms.jm_bot(m) as w_bottom,
           (pms.jm_body(m) is not null and pms.jm_lid(m) is not null and pms.jm_bot(m) is not null) as complete
      from pms.job_master m join pms.job_specs js on js.id=m.job_spec_id join pms.jobs j on j.id=js.job_id join pms.shapes sh on sh.id=j.shape_id) x), '[]');
end $$;

-- the only way to change the Job Master. Quality role (and Admin / Manager).
create or replace function pms_api.job_master_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare sp bigint := nullif(p->>'job_spec_id','')::bigint; sh bigint; m pms.job_master;
begin
  perform core.assert_perm('pms','jobmaster_edit');
  if sp is null then   -- new Shape / Job / Spec typed in the Quality app
    sh := pms.shape_ensure(p->>'shape'); sp := pms.spec_ensure(sh, p->>'job', p->>'spec');
  end if;
  insert into pms.job_master (job_spec_id) values (sp) on conflict do nothing;
  update pms.job_master set
    lid_type=p->>'lid_type', height=nullif(p->>'height','')::numeric,
    body_w=nullif(p->>'body_w','')::numeric, body_h=nullif(p->>'body_h','')::numeric, body_t=nullif(p->>'body_t','')::numeric,
    lid_w=nullif(p->>'lid_w','')::numeric, lid_h=nullif(p->>'lid_h','')::numeric, lid_t=nullif(p->>'lid_t','')::numeric,
    bot_w=nullif(p->>'bot_w','')::numeric, bot_h=nullif(p->>'bot_h','')::numeric, bot_t=nullif(p->>'bot_t','')::numeric,
    wt_body=nullif(p->>'wt_body','')::numeric, wt_lid=nullif(p->>'wt_lid','')::numeric, wt_bottom=nullif(p->>'wt_bottom','')::numeric,
    body_base_t=nullif(p->>'body_base_t','')::numeric, body_base_wt=nullif(p->>'body_base_wt','')::numeric,
    lid_base_t=nullif(p->>'lid_base_t','')::numeric,   lid_base_wt=nullif(p->>'lid_base_wt','')::numeric,
    bot_base_t=nullif(p->>'bot_base_t','')::numeric,   bot_base_wt=nullif(p->>'bot_base_wt','')::numeric,
    picture_name=nullif(btrim(p->>'picture_name'),''), updated_by=auth.uid(), updated_at=now()
   where job_spec_id=sp returning * into m;
  update pms.job_master set is_draft = not (pms.jm_body(m) is not null and pms.jm_lid(m) is not null and pms.jm_bot(m) is not null)
   where job_spec_id=sp returning is_draft into m.is_draft;
  perform core.log('pms','jobmaster_save','job_master', sp::text, null);
  return jsonb_build_object('job_spec_id', sp, 'is_draft', m.is_draft, 'w_body', pms.jm_body(m), 'w_lid', pms.jm_lid(m), 'w_bottom', pms.jm_bot(m));
end $$;

create or replace function pms_api.job_calc_save(p jsonb) returns void
language plpgsql security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','jobmaster_edit');
  insert into pms.job_calc_layouts (job_spec_id, sheet_l, sheet_b, sheet_w, nb, nl, nt, sg, updated_by)
  values ((p->>'job_spec_id')::bigint, (p->>'L')::numeric, (p->>'B')::numeric, (p->>'W')::numeric, (p->>'nb')::numeric, (p->>'nl')::numeric, (p->>'nt')::numeric, (p->>'sg')::numeric, auth.uid())
  on conflict (job_spec_id) do update set sheet_l=excluded.sheet_l, sheet_b=excluded.sheet_b, sheet_w=excluded.sheet_w, nb=excluded.nb, nl=excluded.nl, nt=excluded.nt, sg=excluded.sg, updated_by=auth.uid(), updated_at=now();
end $$;

create or replace function pms_api.job_calc_list() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(jsonb_build_object('job_spec_id',job_spec_id,'L',sheet_l,'B',sheet_b,'W',sheet_w,'nb',nb,'nl',nl,'nt',nt,'sg',sg)) from pms.job_calc_layouts), '[]');
end $$;

-- ============================================================= Rules screen
create or replace function pms_api.rules_list() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return jsonb_build_object(
    'current', coalesce((select jsonb_agg(jsonb_build_object('key',k,'value',core.rule_value('pms',k),'note',(select note from core.rules r where r.module='pms' and r.key=k order by effective_from desc limit 1)) order by k)
                         from (select distinct key k from core.rules where module='pms') z), '[]'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('key',key,'value',value,'from',effective_from,'why',note,'by',created_by,'at',created_at) order by created_at desc)
                         from core.rules where module='pms' and created_at > now() - interval '2 years'), '[]'));
end $$;

-- every change is a new dated row (history kept) with the reason; amber days must stay below red days
create or replace function pms_api.rule_set(p_key text, p_value jsonb, p_from date, p_reason text) returns void
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare amber numeric; red numeric;
begin
  perform core.assert_perm('pms','rules_edit');
  if not exists (select 1 from core.rules where module='pms' and key=p_key) then raise exception 'unknown_rule'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'reason_required'; end if;
  if p_key in ('data_log_amber_days','data_log_red_days') then
    amber := case when p_key='data_log_amber_days' then (p_value #>> '{}')::numeric else (core.rule_value('pms','data_log_amber_days'))::text::numeric end;
    red   := case when p_key='data_log_red_days'   then (p_value #>> '{}')::numeric else (core.rule_value('pms','data_log_red_days'))::text::numeric end;
    if amber >= red then raise exception 'amber_must_be_below_red'; end if;
  end if;
  insert into core.rules (module, key, value, effective_from, note, created_by)
  values ('pms', p_key, p_value, coalesce(p_from, current_date), p_reason, auth.uid())
  on conflict (module, key, effective_from) do update set value=excluded.value, note=excluded.note, created_by=auth.uid(), created_at=now();
  perform core.log('pms','rule_set','rule', p_key, jsonb_build_object('value', p_value, 'from', p_from, 'why', p_reason));
end $$;

-- ================================================================ Status check
create or replace function pms_api.status_check() returns jsonb
language plpgsql stable security definer set search_path = pms, payroll, core, pg_temp as $$
declare amber int := coalesce((core.rule_value('pms','data_log_amber_days'))::text::int, 2);
        red   int := coalesce((core.rule_value('pms','data_log_red_days'))::text::int, 4);
        al jsonb := coalesce(core.rule_value('pms','status_allowed_delay'), '{}');
begin
  perform core.assert_perm('pms','status_view');
  return jsonb_build_object('today', current_date, 'amber', amber, 'red', red,
   'modules', (select jsonb_agg(x || jsonb_build_object(
        'allowed', coalesce((al->>(x->>'key'))::int, 0),
        'days_since', case when x->>'last' is null then null else current_date - (x->>'last')::date end,
        'days_due', case when x->>'last' is null then null else current_date - (x->>'last')::date - coalesce((al->>(x->>'key'))::int, 0) end,
        'status', case when x->>'last' is null then 'No data'
                       when current_date - (x->>'last')::date - coalesce((al->>(x->>'key'))::int,0) < amber then 'Updated'
                       when current_date - (x->>'last')::date - coalesce((al->>(x->>'key'))::int,0) < red then 'Pending-amber' else 'Pending-red' end))
      from (values
        (jsonb_build_object('key','production','label','Production','last',(select max(entry_date) from pms.production))),
        (jsonb_build_object('key','slitting','label','Slitting','last',(select max(entry_date) from pms.slitting))),
        (jsonb_build_object('key','inward','label','Inward','last',(select max(entry_date) from pms.inward_skids))),
        (jsonb_build_object('key','outward','label','Outward','last',(select max(entry_date) from pms.outward))),
        (jsonb_build_object('key','scrap','label','Scrap','last',(select max(entry_date) from pms.scrap))),
        (jsonb_build_object('key','carton','label','Carton','last',(select max(entry_date) from pms.carton_ledger))),
        (jsonb_build_object('key','alum','label','Alum & Tape','last',(select max(entry_date) from pms.alum_tape_ledger))),
        (jsonb_build_object('key','payroll','label','Attendance (from Payroll)','last',(select max(work_date) from payroll.attendance where in_time is not null)))
      ) v(x)),
   'skids', (select coalesce(jsonb_object_agg(st, n),'{}') from (select pms.skid_state(id) st, count(*) n from pms.inward_skids group by 1) s));
end $$;

-- ================================================================== reports
-- First version of each report; column names follow the screens. All need reports_view.
create or replace function pms_api.rep_skids(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.entry_date, x.skid_no) from (
    select i.skid_no, i.entry_date, jr.code as job_id, pms.skid_state(i.id) as status, i.net_wt, i.weight_in_nos as sheets_in,
           pms.skid_used(i.id) as sheets_used, i.weight_in_nos - pms.skid_used(i.id) as sheets_left, current_date - i.entry_date as age_days
      from pms.inward_skids i join pms.job_refs jr on jr.id=i.job_ref_id where i.entry_date between p_from and p_to) x), '[]');
end $$;

create or replace function pms_api.rep_slitting(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.entry_date, x.skid_no) from (
    select t.entry_date, i.skid_no, jr.code as job_id, t.slitting_count, t.body_layout, t.lid_layout, t.bottom_layout,
           t.body_sl, t.lid_sl, t.bottom_sl, t.expected_production, t.variance
      from pms.slitting t join pms.inward_skids i on i.id=t.skid_id join pms.job_refs jr on jr.id=i.job_ref_id
     where t.entry_date between p_from and p_to) x), '[]');
end $$;

create or replace function pms_api.rep_production(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.entry_date, x.job_id, x.component) from (
    select p.entry_date, jr.code as job_id, p.component, p.actual_production, p.fg, p.sfg, p.scrap, p.man_power, p.hours, p.expected_man_power,
           case when p.man_power>0 and p.expected_man_power is not null then round(p.expected_man_power/p.man_power*100,1) end as efficiency_pct
      from pms.production p join pms.job_refs jr on jr.id=p.job_ref_id where p.entry_date between p_from and p_to) x), '[]');
end $$;

-- per date: Payroll man power against what production booked
create or replace function pms_api.rep_manpower(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.entry_date) from (
    select d::date as entry_date,
           (select coalesce(sum(people),0) from pms.mp_day(d::date) where counted) as people_present,
           (select coalesce(sum(worked_h),0) from pms.mp_day(d::date) where counted) as man_hours,
           (select coalesce(sum(ot_h),0) from pms.mp_day(d::date) where counted) as ot_hours,
           round((select coalesce(sum(worked_h),0) from pms.mp_day(d::date) where counted)/coalesce((core.rule_value('pms','shift_hours'))::text::numeric,8),1) as equivalent_mp,
           (select coalesce(sum(expected_man_power),0) from pms.production where entry_date=d::date) as expected_mp,
           (select coalesce(sum(man_power*hours/coalesce((core.rule_value('pms','shift_hours'))::text::numeric,8)),0) from pms.production where entry_date=d::date) as used_mp
      from generate_series(p_from, p_to, interval '1 day') d
     where exists (select 1 from pms.production where entry_date=d::date)) x), '[]');
end $$;

create or replace function pms_api.rep_scrap(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.entry_date) from (
    select s.entry_date, jr.code as job_id, s.kg_body, s.kg_lid, s.kg_bottom, s.kg_body_bottom, s.count_body, s.count_lid, s.count_bottom
      from pms.scrap s join pms.job_refs jr on jr.id=s.job_ref_id where s.entry_date between p_from and p_to) x), '[]');
end $$;

-- stock by job and component, with the last movement date; Non-Moving when nothing moved for non_moving_months
create or replace function pms_api.rep_inventory() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
declare nm int := coalesce((core.rule_value('pms','non_moving_months'))::text::int, 3);
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(y) order by y.job_id, y.component) from (
    select x.*, (x.last_move is null or x.last_move < current_date - nm*30) as non_moving from (
      select jr.code as job_id, c.code as component,
             coalesce((select sum(qty) from pms.opening_stock o where o.job_ref_id=jr.id and o.component=c.code),0)
           + coalesce((select sum(coalesce(fg,actual_production)) from pms.production p where p.job_ref_id=jr.id and p.component=c.code),0)
           - case when c.code='CAN' then coalesce((select sum(dispatch_qty) from pms.outward w where w.job_ref_id=jr.id),0) else 0 end as in_stock,
             greatest((select max(entry_date) from pms.production p where p.job_ref_id=jr.id and p.component=c.code),
                      case when c.code='CAN' then (select max(entry_date) from pms.outward w where w.job_ref_id=jr.id) end) as last_move
        from pms.job_refs jr cross join pms.components c where c.fg_allowed) x where x.in_stock <> 0) y), '[]');
end $$;

-- one day at a glance
create or replace function pms_api.rep_daily(p_date date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return jsonb_build_object('date', p_date,
    'cans_produced', coalesce((select sum(actual_production) from pms.production where entry_date=p_date and component='CAN'),0),
    'dispatched',    coalesce((select sum(dispatch_qty) from pms.outward where entry_date=p_date),0),
    'inward_skids',  (select count(*) from pms.inward_skids where entry_date=p_date),
    'slitting_sheets', coalesce((select sum(slitting_count) from pms.slitting where entry_date=p_date),0),
    'scrap_kg',      coalesce((select sum(coalesce(kg_body,0)+coalesce(kg_lid,0)+coalesce(kg_bottom,0)+coalesce(kg_body_bottom,0)) from pms.scrap where entry_date=p_date),0));
end $$;

-- skid reconciliation: weight in against slitting output
create or replace function pms_api.rep_recon(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.skid_no) from (
    select i.skid_no, jr.code as job_id, i.net_wt, coalesce(sum(t.bifurcated_skid),0) as bifurcated, coalesce(sum(t.raw_skid),0) as raw, coalesce(sum(t.variance),0) as variance
      from pms.inward_skids i join pms.job_refs jr on jr.id=i.job_ref_id left join pms.slitting t on t.skid_id=i.id
     where i.entry_date between p_from and p_to group by i.id, jr.code) x), '[]');
end $$;

create or replace function pms_api.rep_boxreg(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.entry_date, x.id) from (
    select o.id, o.entry_date, o.so_no, jr.code as job_id, o.boxes, o.packing_style, o.dispatch_qty, o.invoice, o.dc_no, o.vehicle_no, o.transport_contact
      from pms.outward o join pms.job_refs jr on jr.id=o.job_ref_id where o.entry_date between p_from and p_to) x), '[]');
end $$;

create or replace function pms_api.rep_cstock() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.variation, x.name) from (
    select i.variation, i.name, coalesce(sum(case when l.entry_type='PURCHASE' then l.qty end),0) as purchased,
           coalesce(sum(case when l.entry_type='ISSUED' then l.qty end),0) as issued,
           coalesce(sum(case when l.entry_type='PURCHASE' then l.qty else -l.qty end),0) as balance
      from pms.carton_items i left join pms.carton_ledger l on l.item_id=i.id where i.active group by i.id) x), '[]');
end $$;

create or replace function pms_api.rep_astock() returns jsonb
language plpgsql stable security definer set search_path = pms, core, pg_temp as $$
begin
  perform core.assert_perm('pms','reports_view');
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (
    select i.name, coalesce(sum(case when l.entry_type='PURCHASE' then l.qty end),0) as purchased,
           coalesce(sum(case when l.entry_type='ISSUED' then l.qty end),0) as issued,
           coalesce(sum(case when l.entry_type='PURCHASE' then l.qty else -l.qty end),0) as balance
      from pms.alum_tape_items i left join pms.alum_tape_ledger l on l.item_id=i.id where i.active group by i.id) x), '[]');
end $$;


-- ================================================================ delete an entry
-- Same permission as entering that kind of record, same edit window (Admin / old-edit holders can go beyond it).
-- The whole deleted row is written to the audit log so it can be restored by hand if it was a mistake.
-- A skid that already has slitting cannot be deleted; delete the slitting first.
create or replace function pms_api.entry_delete(p_kind text, p_id bigint) returns void
language plpgsql security definer set search_path = pms, core, pg_temp as $$
declare tbl text; perm text; snap jsonb;
begin
  select t, pm into tbl, perm from (values
    ('inward','inward_skids','inward_enter'), ('slitting','slitting','slitting_enter'), ('production','production','production_enter'),
    ('outward','outward','outward_enter'), ('scrap','scrap','scrap_enter'),
    ('carton','carton_ledger','ledger_enter'), ('alum','alum_tape_ledger','ledger_enter')) v(k,t,pm) where k = p_kind;
  if tbl is null then raise exception 'bad_kind'; end if;
  perform core.assert_perm('pms', perm);
  perform pms.assert_row_editable(tbl, p_id);
  if tbl = 'inward_skids' and exists (select 1 from pms.slitting where skid_id = p_id) then raise exception 'skid_has_slitting'; end if;
  execute format('select to_jsonb(t) from pms.%I t where id = $1', tbl) into snap using p_id;
  execute format('delete from pms.%I where id = $1', tbl) using p_id;
  perform core.log('pms', 'delete_'||p_kind, tbl, p_id::text, snap);
end $$;

-- ------------------------------------------------------------ grants
revoke all on all functions in schema pms from public, anon, authenticated;
revoke all on all functions in schema pms_api from public, anon;
grant usage on schema pms_api to authenticated;
grant execute on all functions in schema pms_api to authenticated;
