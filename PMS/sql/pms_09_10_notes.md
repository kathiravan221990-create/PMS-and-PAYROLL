pms_09_bootstrap: pms_api.bootstrap(p_from date default null) returns all lists in the shape the PMS screens use (so, skids, prod, out, scrap, slits, open, carton_items, alum_items, cled, aled, jobs, colours, shapes).
pms_10_production_carton: pms_api.production_save now stores carton_item_id / carton_qty.
Data: core.user_roles row pms/admin granted to the existing core admin user.
pms_11_todo_list: pms_api.todo_list() role-aware "To check and update" counts and first 30 rows.
pms_12_backdate_names: pms_api.backdate_list now returns by_name / reviewed_name.
pms_13_att_range: pms_api.att_range(from,to) returns Payroll attendance per designation per day (max 92 days).

## pms_14_bootstrap_vendor_variants
`pms_api.bootstrap` now also returns `vv` (vendor/variant pairs). Shape / Job Name / Job Spec dropdowns in every module come from Job Master only; Job Calculator is used for scrap calculation only.

## pms_15_slitting_component_rule
`pms_api.slitting_save` now reads the components from the skid's Inward record (not from the browser) and rejects any layout / weight / jally entry for a component the skid does not carry (e.g. BODY skid: Lid and Bottom rejected; BODY,LID: Bottom rejected). A skid with no components set in Inward cannot be slit until Inward is corrected. Existing rows are not changed.

## pms_16_import_excel (+16b)
`pms_api.import_excel(p jsonb)` (Admin / Manager, permission `rules_edit`) backs the Import Excel screen. Per sheet `{table, mode, rows}`: Sale Order and Inward are upserted by SO no + variant + description / skid no; Slitting, Production, Outward and Scrap first delete rows with `created_by is null` (earlier imports) when `mode='replace'`, then insert. Rows entered by people are never touched. Blank vendors use UNKNOWN VENDOR; blank colour / variant use NOT SPECIFIED. Inward status is computed, not stored.
