# Loading and app verification — 11 September 2026

The loading changes are implemented locally. This is a partial application review, not a claim that every authenticated workflow has been tested. No production records were created, changed, or deleted, and no password-reset emails were sent.

## Changes

- Added a shared visual loading mask for browser Server Actions, same-origin API calls, Next.js data navigation, and Supabase requests. It counts overlapping requests and observes streamed response completion, clearing on success, rejection, and abort. Requests shorter than 150 ms avoid flashing; requests longer than ten seconds show a continued-wait message. Prefetches and static assets are excluded.
- The mask preserves typing and keyboard focus. Existing action-specific disabled buttons remain responsible for preventing repeat submissions. The mask is hidden when printing.
- Added a shared route loading fallback. Order and customer tables now replace stale rows during filter/pagination refreshes.
- All seven report tabs show an initial loading state and request errors with Retry instead of silently showing zero totals. Optional filter failures are caught; the payment report no longer assumes zero expenses while expenses are loading.
- Catalog, customer, measurement-history, and new-order bootstrap failures have visible recovery paths. Measurement-history failures no longer leave the spinner running forever.
- Login and password forms release their saving state after request failures. New-order saving preserves a confirmed order if later measurement/attachment processing fails, and warns the user to check the order list if the save outcome could not be confirmed.
- Corrected two missing measurement-editor hook dependencies and updated an outdated catalog test to follow the existing combined bootstrap action.

## Performance changes and evidence

| Area | Before | After |
| --- | --- | --- |
| Root appearance | Two auth calls and two profile queries for theme/text size | One auth call and one combined profile query |
| Dashboard summaries | Two overlapping order reads, plus a sequential stage-slip read | One shared order read in parallel with stage slips |
| Workspace startup | Up to six speculative new-order reference actions on a cold cache | Removed startup warming; new-order entry retains its existing bootstrap and browser cache |

Removing startup warming avoids background work competing with the page the user is opening. The first new-order visit now depends on its bootstrap when the cache is empty; no claim is made that every first-order visit is faster.

Three signed-out login navigations against the local production build measured TTFB of 57, 25, and 59 ms and DOMContentLoaded at 236, 74, and 119 ms. These are small local samples, not a before/after benchmark or evidence about authenticated database-query latency. A cold development compilation took about 41 seconds; that compilation cost should not be treated as a production API measurement.

## Verification results

| Check | Result |
| --- | --- |
| Production build, including route compilation and TypeScript | Passed |
| ESLint across app, components, lib, hooks, and tests | Passed, no errors or warnings after fixes |
| Garment/runtime tests | 9 passed |
| Request tracking tests | 6 passed: overlapping requests, request classification, streaming, failures/abort, empty responses, prefetch |
| Isolated PostgreSQL order-deletion tests | 9 passed |
| Signed-out access tests | All 35 shell routes redirect to login |
| Browser interaction tests | 7 passed: overlapping requests, failure cleanup, prefetch exclusion, mobile layout/navigation, rejected login, recovery failure, password validation |
| Diff whitespace check | Passed |

The final production browser run passed 41 tests initially. One test selector also matched Next.js's route announcer; narrowing it to the form fixed the test and its targeted rerun passed. All 42 browser checks therefore passed across the final run and rerun. A loading-mask screenshot was captured and visually inspected at `test-results/loading-mask.png` (generated, gitignored).

Database tests execute migrations 0066's real number generator and 0102's deletion function in disposable PGlite/PostgreSQL tables. They cover latest-number reuse, older gaps, later issued numbers, financial/work guards, production guards, shop access, rollback, and repeated deletion. Auth helpers are test stubs; production RLS and multi-session concurrency are not covered by this fixture. Migration 0102 has not been applied to the live database.

## Remaining work

- An authenticated staging account and representative data are required to verify order creation/editing, payment/voiding, job-card production, staff earnings/payroll, delivery, attachments/printing, reports, settings, and role/shop access end to end. Signed-out redirects do not validate those workflows.
- Measure authenticated request timings, payload sizes, and query plans using the existing `PERFORMANCE_DIAGNOSTICS=true` instrumentation before claiming all slow data loads are resolved. Large-data performance and production network conditions remain unmeasured.
- Test concurrent order creation/deletion from separate database sessions in staging before deploying migration 0102.
- `npm audit` reports eight vulnerable dependency entries: one critical (`next`) and seven high (`@next/eslint-plugin-next`, `brace-expansion`, `eslint-config-next`, `glob`, `js-yaml`, `nanoid`, `postcss`). The audit proposes a major Next.js/tooling upgrade for several findings. No framework upgrade was attempted in this loading change; advisory applicability has not been individually assessed.
- The Supabase dependency emitted an Edge-runtime compatibility warning during a cold build; middleware redirect tests passed, but this is not coverage of every auth path.

## Running the checks

```sh
npm test
npm run test:e2e
```

The browser configuration uses installed Microsoft Edge and starts an isolated development server on port 3101 when one is not supplied. Set `PLAYWRIGHT_BASE_URL` to an already running test server to test a production build. `NEXT_DIST_DIR=.next-verification` keeps verification output separate from normal `.next` development output. Browser sign-in and recovery submissions use intercepted responses and do not authenticate to a real account or send mail.
# Follow-up testing

The authenticated and full-schema continuation is documented in [full-testing-report.md](full-testing-report.md). It supersedes the earlier access limitations and test totals above, and records unresolved security, finance and redirect defects.
