# Production print layouts

Apply `supabase/migrations/0105_configurable_production_print_layouts.sql`
through `0108_global_production_print_layouts.sql` before
deploying the related application changes.

Admins and Shop Owners with tenant-wide access configure layouts at
**Settings → Production Print Layout**. A layout
can apply to an entire Order Details category (Men, Chudidar, or Blouse), with
an optional override for one garment. A garment override takes precedence over
its category layout. With neither saved, printing uses the existing built-in
six-column arrangement.

Each tenant has one global source for each category or garment layout, so no
shop selector or synchronized shop copies are needed. Shop users can view the
setup, while only Admin and Shop Owner accounts with `shops.viewAll` can modify
it. An active layout applies to every shop. An inactive layout remains saved
but printing uses the active category fallback or the built-in format.

Each layout supports 4–8 columns per row. A box can span one or more columns,
use normal or tall height, normal or small text, and contain one or two field
values separated by a new line or slash. Each box can also use Normal,
Emphasis, Double border, Shaded, or Dashed styling to identify selected
measurements. The special **Order add-ons** value prints the selected item
add-ons in one box. Work Details and Order add-ons can arrange their entries in
one, two, or three items per row. For Work Details, select **Full row**, **Small**
text, and **3 items per row** for the compact job-card view. Layouts saved before
this option existed receive that compact Work Details arrangement automatically.
The field picker also exposes **Work Details - All** and each configured row as
**Work Details - 1**, **Work Details - 2**, and so on. Individual rows are independent
boxes, so each can have its own width, height, text size, and style. An individual
row with no selected work item is omitted from the printed grid while later row
numbers keep their original positions.
**Empty box** adds a visible bordered cell, while **Blank
space** reserves the selected width without printing a border. Spacer boxes
cannot be combined with a second value. The editor includes a print-shaped live
preview and can restore the built-in layout.

The effective layout is copied into a new stitching slip as
`production_layout_snapshot` for historical reference. Printing and reprinting
always resolve the current category or garment layout, so the output matches the
Settings preview after a manager rearranges it. Resetting a layout makes existing
slips use the built-in arrangement. Cutting slips do not carry a measurement-grid
layout.

Run `npm run test:production-layout` for layout validation, inheritance, and
snapshot coverage. Full database tests verify migration, tenant/shop isolation,
server-side validation, upsert behavior, and manager-only writes.
