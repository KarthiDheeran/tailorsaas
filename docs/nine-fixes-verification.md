# Nine-failure fix and verification report

11 September 2026. This follow-up supersedes the unresolved status in `full-testing-report.md` for the nine named failures.

## Outcome and deployment status

All nine fixes are implemented locally. The seven original database/report regressions pass. Both redirect regressions pass against the rebuilt production app with the supplied admin account. Mens and Womens browser and workflow results are recorded below.

**No application deployment or live database migration was performed.** Migration `0103_enforce_order_rpc_scope.sql` contains the four database-function fixes; it must be applied to the deployed database before those protections are live. Migration `0102_reclaim_latest_deleted_order_number.sql` also remains pending deployment. The live shop workflow checks exercise the currently deployed database through normal authenticated clients; they do not prove that the new migration has been deployed.

## Fixes and evidence

| Original failure | Correction | Verification |
| --- | --- | --- |
| SEC-01: unrestricted report client | Report actions use the caller's cookie-authenticated client, retaining existing RLS instead of bypassing it with the service role. | Original source-boundary regression passes; admin Reports page loads after rebuild. |
| SEC-02: cross-tenant financial adjustment | `record_order_financial_adjustment` checks `auth_can_access_order` before processing the adjustment. | Real migrated database rejects cross-tenant and cross-shop calls; normal adjustments still reconcile totals. |
| SEC-03: cross-tenant adjustment void | `void_order_financial_adjustment` checks the adjustment's parent order scope before mutation. | Cross-tenant/shop rejection and authorized same-shop void pass. |
| SEC-04: foreign customer during creation | `create_order_with_items` checks `auth_can_access_customer` before generating numbers or inserting records. | Foreign-tenant customer rejected; another shop's customer within the same tenant remains usable. |
| SEC-05: cross-tenant job-card sync | `sync_job_cards_for_order` checks order scope before synchronization. | Cross-tenant/shop calls rejected; authorized creation and synchronization still pass. |
| SEC-06: missing financial-report permission | Sales, Payments and expense-total actions enforce `orders.viewPayments` as well as `reports.view`. | Report-only roles are denied before financial selectors run. |
| FIN-01: wrong collection date | Sales collection totals use dated payment ledger entries, excluding voids. Daily/monthly rows use the same receipts. | Older-order payment of 300 appears on its receipt date; void exclusion, date/mode forwarding and daily/monthly reconciliation pass. |
| UI-01: Accounts redirect crash | Authenticated middleware resolves `/accounts` to `/payments` before rendering the client shell, preserving refreshed cookies and query parameters. | Admin browser reaches Payments without the previous application error. |
| UI-02: Calendar redirect crash | The same middleware handles `/calendar` to `/orders`. | Admin and both shop browsers reach Orders without the previous application error. |

Reports now respect underlying data-read permissions. A custom role with only `reports.view` no longer gains unrestricted table reads through the report actions. Sales collections represent non-voided receipts; refund-adjusted net collections remain in the Payments report.

## Automated checks

Final automated totals: **139 passed, 0 failed, 24 role-based skips**. Diagnostic/interrupted runs and live script assertions are not added to this total.

| Final suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Local database/runtime/report regressions | 55 | 0 | 0 |
| Signed-out routes and loading behavior | 52 | 0 | 0 |
| Admin Accounts, Calendar, Orders and Reports | 4 | 0 | 0 |
| Mens authenticated pages | 14 | 0 | 12 |
| Womens authenticated pages | 14 | 0 | 12 |

- The production build passed, including lint and TypeScript validation.
- All 111 migration files apply unchanged to the disposable database. Application RLS and permission functions are real; Supabase-managed auth infrastructure is supplied by the fixture.
- Both shop reruns completed without JavaScript errors or HTTP 5xx failures in tested accessible routes.
- Original failing assertions were retained; fixes were not obtained by changing their expected outcomes or skipping them.
- Browser skips reflect the shop accounts' role restrictions. Accounts redirects successfully, but its Payments destination is not available to those shop roles. The admin account verifies that destination fully.

Artifacts: `test-results/full-review/index.html`, `test-results/full-review/results.json`, `test-results/admin-fix-report/index.html`, `test-results/mens-report/index.html`, `test-results/womens-report/index.html`, and the corresponding browser JSON files.

## Live Mens and Womens workflows

Normal shop credentials were used; no service-role writes or profile/permission changes were made.

| Check | Mens | Womens |
| --- | --- | --- |
| Login and assigned shop | Passed | Passed |
| Create/read labelled QA order in assigned shop | Passed | Passed |
| Synchronize one QA job card | Passed | Passed |
| Delete untouched QA order | Passed | Passed |
| Record 1-unit QA payment and verify zero balance | Passed | Passed |
| Void payment | Shop role correctly denied; supplied admin voided it | Passed |
| Record/void 0.1-unit discount and reconcile total | Not attempted after role restriction | Passed |
| Read own QA order but not other shop's QA order | Passed | Passed |
| Final payment void and cancelled-order status | Verified | Verified |

The first concurrent browser run was disturbed by the QA helper's default global sign-out, which revoked other sessions for the same account. The helpers now use local-session sign-out, and browser tests were rerun after cleanup. The interrupted run is not counted as an application regression.

## Cleanup and retained audit records

No pre-existing customer/order/payment was edited. No messages were sent and no inventory was consumed.

| Shop | Deleted untouched order | Retained cancelled QA order | Retained QA customer |
| --- | --- | --- | --- |
| Mens | `cc8fc17f-afbd-45dd-aa1c-01eaa6d789aa` (number 3) | `d4713736-2ec8-4128-a203-0c425c9f3f95` (number 4) | `4353aa37-8162-4590-a4c1-05cf98b17173` |
| Womens | `4cba6b11-e5b4-4279-aa22-9fd996728a0f` (number 12) | `4231b137-2c01-4b39-9577-c3a07310145a` (number 13) | `26454fe1-9911-40ce-8d60-5a79c37197cf` |

Both QA payments are confirmed voided. The Womens discount is voided. Audit-bearing orders remain cancelled because the app correctly prohibits hard deletion after financial activity. Cancelled orders are excluded from receivables. Customer names include the timestamped QA marker. The deployed counter advanced after untouched deletion, consistent with migration 0102 still being pending; no live counter was manually reset.

Observed page-test durations with both shop suites running were roughly 3–10 seconds. These include navigation and readiness checks against the configured backend and are not production latency percentiles. The nine fixes do not establish that all performance concerns are resolved.

Detailed journals: `test-results/shop-workflows.json` and `test-results/shop-isolation.json`. Historical denied-cleanup attempts remain in the journal alongside the successful admin cleanup for transparency.

## Remaining scope

Deploy the application changes and migrations, then perform a post-deployment smoke check. These results close the nine local regressions; they are not a complete sign-off for every app feature, dependency vulnerability, mobile workflow, concurrent database operation, attachment or payroll path. Those broader review items remain in the original report.
