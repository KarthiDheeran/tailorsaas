# Order Details numbering and yearly reset

Orders use separate number sequences for Men, Chudidar, and Blouse in each shop.
The unique reference is the shop, Order Details category, numbering year, and
number. The visible number remains numeric. Lists and receipts show the category
and numbering year alongside it.

## Activate the change

Apply `supabase/migrations/0104_section_year_order_numbers.sql`, followed by
`0106_reconcile_section_order_number_counters.sql`, to the application database
before deploying the accompanying application changes. Run each entire file
once using the project's migration process or the Supabase SQL Editor. The
migrations use transactions, preserve existing order numbers, invoice numbers,
and scan tokens, and move each category counter forward to its highest existing
sequence. Existing orders are assigned the migration's current calendar year as
their initial numbering year; this does not change their order dates.

For example, if existing Chudidar numbers are 1, 2, 5, 14 and existing Blouse
numbers are 6, 7, 11, the first new Chudidar is 15 and the first new Blouse is 12.
Existing gaps are preserved because printed references must remain valid.

## Start a new year

Open Settings → Order Preferences → Order numbering. A user with
`settings.manageShop` can select **Start new year** beside an accessible category,
enter a later numbering year, confirm the category, and submit. Its next order
will be 1. Other categories, other shops, and existing orders are unchanged.
There is no automatic January reset and no reuse of a previous numbering year.
Reset actions are recorded in `order_number_resets` with the user, timestamp,
old year, last issued sequence, and new year.

Order allocation and reset lock the same category counter. Stale or duplicate
reset requests fail instead of resetting a sequence again. Deleting an untouched
order only reclaims its number if it is the latest number in that category's
currently active numbering year.

## Receipt lookup

New numeric receipts encode a reference such as `C-2027-1`, `B-2027-1`, or
`M-2027-1`, so scanning distinguishes category and year. Existing scan-token
receipts continue to work. A legacy number-only receipt can be resolved only
when the number has a single accessible match. Ambiguous matches show an error;
staff must open the correct order from the Orders list using category, year,
and customer details, then reprint its receipt if needed.

## Validation

`npm run test:order-numbering` covers migration upgrades, independent counters,
reset isolation and permissions, preservation of old orders, deletion reclamation,
and receipt lookup ambiguity, using disposable databases and synthetic data.
No test changes customer data.
