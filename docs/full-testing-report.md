# TailorSaaS full testing review — 11 September 2026

**Follow-up:** the nine issues below have since been fixed locally and retested. See [nine-fixes-verification.md](nine-fixes-verification.md) for current results, deployment status and live QA cleanup. The remainder of this document preserves the original findings.

**Status: not ready for release sign-off.** Testing found seven reproducible local-suite failures and two authenticated redirect crashes. Broad static-page coverage was attempted for the supplied account, but successful page rendering is not equivalent to completing every business workflow.

## Environment and evidence

- Local production Next.js build on port 3101, connected to the configured Supabase backend. Browser: installed Microsoft Edge, one worker.
- Signed in with the supplied NewLook account. Credentials are held in gitignored `.env.test.local`; reports contain no password or session tokens.
- Database integration tests use disposable PGlite PostgreSQL with all 110 repository migration SQL files applied unchanged. Only Supabase-managed auth/storage infrastructure is stubbed; real application RLS, roles and RPC permission functions are exercised as authenticated identities.
- Report action tests execute the actual TypeScript with mocked client/data boundaries. These demonstrate implementation defects, not a live cross-tenant exploitation attempt.
- Machine-readable results: `test-results/full-review/results.json`; standalone case report: `test-results/full-review/index.html`; authenticated browser report: `playwright-report/index.html` and `test-results/browser-results.json`.

## Results

Unique checks across these suites: **119 passed, 9 failed, 2 skipped**. The two redirect failures reproduced in a separate diagnostic rerun, which is not counted again.

| Suite | Result | What it establishes |
| --- | --- | --- |
| Full local database/runtime/report suite | 45 passed, 7 failed | Financial arithmetic, transactions, inventory, permissions, order numbering, garment metadata and loading behavior |
| Signed-out route checks | 43 passed | Protected page routes, including print and dynamic routes, redirect to login |
| Browser loading/authentication behavior | 9 passed | Overlapping requests, failure, abort, prefetch, mobile layout, duplicate-submit prevention, recovery error handling and print masking |
| First authenticated page pass | 21 passed, 2 skipped | Pages render without observed JavaScript errors or HTTP 5xx responses and loading indicators clear |
| Additional authenticated pages | 1 passed, 2 failed | Quick Advance passed; Accounts and Calendar displayed client-side application errors |
| Build, TypeScript and lint | Passed in preceding implementation validation | Production compilation and static checks; no application code changed during this continuation |

The first signed-in pass covered dashboard, orders, new order, customers, new customer, job cards, tally, work assignment, production print, delivery, payments, inventory, staff, new staff, reports, catalog, settings, shops, billing, order preferences and communication templates. Communications and Users Access were skipped because this role could not access them.

## Defects requiring correction

| ID | Priority | Finding and reproduction | Evidence |
| --- | --- | --- | --- |
| SEC-01 | Critical | Report actions authorize `reports.view` and then use an unrestricted service-role client. A caller's tenant boundary is lost before report queries execute. Replace this with scoped data access and test with two tenants. | `tests/report-audit.test.mjs`; `app/(shell)/reports/actions.ts`, `lib/supabase/admin.ts` |
| SEC-02 | High | An authorized user in tenant A can call `record_order_financial_adjustment` with tenant B's order ID. The real migrated database accepts the adjustment instead of rejecting it. | `tests/database-workflows.test.mjs`; migration 0018 |
| SEC-03 | High | Tenant A can void an adjustment belonging to tenant B through `void_order_financial_adjustment`. Permission checks do not establish ownership scope. | Same integration suite; migration 0018 |
| SEC-04 | High | `create_order_with_items` accepts another tenant's customer ID, allowing an invalid customer/order association. | Same integration suite; migration 0066 |
| SEC-05 | High | `sync_job_cards_for_order` accepts another tenant's order ID. Add an explicit order-scope check before any synchronization work. | Same integration suite; migration 0025 |
| SEC-06 | High | Financial report actions do not enforce `orders.viewPayments`; hiding tabs in the UI does not prevent direct action calls. | `tests/report-audit.test.mjs` |
| FIN-01 | High | Sales “revenue collected” uses order placement/promised delivery dates and order balances rather than payment ledger dates. An older, undelivered order with a payment of 300 today reports 0 collected today in the reproduction. | `tests/report-audit.test.mjs`; `lib/reports.ts` |
| UI-01 | Medium | Signed-in navigation to `/accounts` crashes instead of redirecting to `/payments`. | Authenticated browser check; `test-results/extra-browser` error context |
| UI-02 | Medium | Signed-in navigation to `/calendar` crashes instead of redirecting to `/orders`. | Authenticated browser check; `test-results/extra-browser` error context |

These seven tests intentionally remain failing. Fixes have not been deployed or silently folded into this testing report. Validate the security corrections with both cross-tenant and cross-shop identities before release. The earlier dependency audit also reported one critical and seven high dependency entries; advisory applicability and upgrades remain outstanding (details in `loading-performance-review.md`).

## Loading and performance

First-pass signed-in page tests took approximately 2.6–7.0 seconds each, including browser navigation and readiness assertions. New Order was about 7.0 seconds, production print 6.8 seconds, payments 5.8 seconds and orders 5.7 seconds. These are single local observations against the configured backend, not API-only latency, production percentiles or load-test results.

The implemented loading layer tracks foreground fetch calls for server actions, same-origin APIs, navigation and Supabase. It handles overlapping calls, streamed bodies, errors and aborts; speculative prefetch does not display a mask. A delayed translucent overlay, progress line and slow-request message provide feedback. The overlay does not block all pointer interaction; forms use their own submission guards. Print output excludes the mask.

The implementation also removes speculative reference warming, shares dashboard queries, combines preference/auth reads, and adds visible loading/error/retry states to major lists, reports and new-order setup. The measured waits mean further backend/request profiling is still warranted. No claim is made that every transport, upload path, background task or every user action is covered by a full-screen mask.

## Order deletion and sequence behavior

The proposed migration 0102 passes both focused deletion tests and real-schema integration tests. Deleting the latest untouched order can reclaim only that last shop number. Deleting an older order preserves the gap. Financial or production activity blocks hard deletion; even a voided payment retains its audit history and blocks deletion. Rollback restores both the order and counter; repeated deletion cannot decrement twice.

Migration 0102 has **not** been applied to the configured live database. Multi-session concurrent create/delete stress testing remains outstanding. Existing orders are not renumbered.

## Access and cleanup log

The supplied account is assigned to **NewLook Admin**. Normal authenticated reads show Main Shop, NewLook Admin, NewLook Mens and NewLook Womens within its tenant. Order creation derives the shop from the account profile; no shop switch was found. The user named Mens and Womens for mutations, so shop-specific credentials or confirmation to use NewLook Admin were requested.

**No live customers, orders, payments, inventory entries or profile assignments were created, changed or deleted during this continuation.** No customer messages or recovery emails were sent. Disposable database fixtures are destroyed after testing. `test-results/live-access-review.json` records the access check and an empty mutation log.

## Remaining acceptance work

- Create/edit/delete a labelled order through the UI in each authorized shop; verify the deployed counter behavior after migration rollout.
- Exercise live payment, void, refund, production, partial delivery and inventory workflows using agreed QA records, with a retained-audit cleanup plan for financial entries. These passed normal-path isolated database checks but are not signed off end to end.
- Check attachments, measurement persistence/history, individual print documents, payroll, billing changes and settings persistence; current page smoke checks do not validate these writes.
- Exercise restricted roles, Communications and Users Access using suitable accounts; test recovery delivery without messaging real customers.
- Test mobile operational workflows, keyboard/accessibility, adverse networks, larger data volumes and concurrent users. The browser suite currently includes mobile login, not a complete mobile business-flow audit.

## Reproduction

Run `npm run test:full` for the 52 local cases (expected nonzero exit while the seven defects remain). Run `npm run test:e2e` for browser coverage; credentials are read from `.env.test.local`. The browser config accepts `E2E_BASE_URL` or `PLAYWRIGHT_BASE_URL`. Use the isolated production build for comparable timings. Never commit the credential file or authenticated browser state.
