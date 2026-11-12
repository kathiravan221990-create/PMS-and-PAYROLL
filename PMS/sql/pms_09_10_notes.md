pms_09_bootstrap: pms_api.bootstrap(p_from date default null) returns all lists in the shape the PMS screens use (so, skids, prod, out, scrap, slits, open, carton_items, alum_items, cled, aled, jobs, colours, shapes).
pms_10_production_carton: pms_api.production_save now stores carton_item_id / carton_qty.
Data: core.user_roles row pms/admin granted to the existing core admin user.
pms_11_todo_list: pms_api.todo_list() role-aware "To check and update" counts and first 30 rows.
pms_12_backdate_names: pms_api.backdate_list now returns by_name / reviewed_name.
pms_13_att_range: pms_api.att_range(from,to) returns Payroll attendance per designation per day (max 92 days).

## pms_14_bootstrap_vendor_variants
`pms_api.bootstrap` now also returns `vv` (vendor/variant pairs). Shape / Job Name / Job Spec dropdowns in every module come from Job Master only; Job Calculator is used for scrap calculation only.
