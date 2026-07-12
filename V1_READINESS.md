# TailorSaaS V1 Readiness

Last updated: 2026-07-12

## Current Decision

Feature implementation is frozen for V1.

The app now covers the core tailoring-shop workflow:

```text
Orders -> Job Cards -> Production -> Delivery -> Payments
```

It also includes the important supporting modules needed for a serious V1.

## Implemented V1 Scope

- Dashboard for daily operational attention
- Orders with order lifecycle, filters, receipts, invoices, and payments
- Job Cards for garment-level production control
- Production board with stage movement
- Delay and rework reason capture for Delayed / Alteration moves
- Customers with order history, measurements, payment summary, and statements
- Measurements desk and garment-wise/customer-wise measurements
- Calendar for trials, deliveries, production due dates, and payment reminders
- Reminder inbox in Communications
- WhatsApp open/log/mark-sent flow
- Editable communication templates
- Payments/accounts with collections, pending dues, expenses, adjustments, and receipts
- Discounts, extra charges, refunds, and void flows
- Inventory and customer-provided fabric tracking
- Staff, work assignment, and role-based access
- Reports for sales, payments, production, staff, inventory, profit, delayed jobs, and low stock
- Settings hub for billing, catalog, measurement templates, users/roles, and communication templates

## Applied Migrations

The latest required migration has been applied in Supabase:

```text
supabase/migrations/0019_communication_templates_and_rework.sql
```

This enables:

- saving communication templates
- logging new `Delayed` and `Rework` job-card activity types

## Remaining Work Before Demo / Launch

These are not new features. They are closure tasks.

1. Full QA pass through owner/admin workflows
2. Verify login/auth credentials and reset if needed
3. Check role-based navigation for owner, manager, tailor, front desk, and accountant
4. Clean or archive test data
5. Verify production Supabase environment variables
6. Confirm all migrations are applied in the target Supabase project
7. Prepare a short demo script for a tailor-shop owner

## Known Post-V1 Features

These should not block V1 unless a real first customer demands them.

- Real WhatsApp Business API sending
- SMS provider integration
- Payroll
- Multi-branch operations
- Customer mobile app
- Loyalty and marketing campaigns
- AI features
- Deeper accounting/P&L exports

## Product Call

For V1, the app is feature-complete enough to stop building and start validating.

The next phase should be:

```text
QA -> bug fixes -> demo prep -> launch readiness
```
