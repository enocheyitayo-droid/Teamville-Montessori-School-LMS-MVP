# Portal performance and landing-page motion

Measured before changes from this desktop against the live Netlify deployment on 28 October 2026. Times are full HTTP response durations, including network latency; they are not guaranteed timings for other devices.

| Request | First measured pass | Second pass |
|---|---:|---:|
| Public portal entrance | 12,535ms | Not sampled |
| New administrator demo POST | 5,294ms | Not sampled |
| Overview | 1,454ms | 517ms |
| Fee accounts | 801ms | 694ms |
| Debtors | 747ms | 714ms |
| Results | 406ms | 425ms |
| School purse | 451ms | 419ms |

The first request includes initial connection and potentially server startup costs. It is not sufficient evidence to attribute all delay to a cold start.

## Changes

- Make `/portal` a public static entrance, with demo availability resolved at build time. It contains no personal or workspace data. Protected demo routes remain dynamic and permissions remain server enforced.
- Batch demo seed inserts into one transaction rather than one network call for every pupil, charge, score and payment. Compute seeded result snapshots from the seed data instead of reading each back.
- Fee lists and overview totals use three scoped batch queries rather than three extra queries per pupil. Detailed individual statements still read current charges and payments. No cross-request private-data cache was introduced.
- Existing staff/payroll records are checked once before skipping unnecessary repeated insert attempts.
- Disable speculative private-page Link prefetching to avoid starting multiple database-heavy pages in the background.
- Add a route loading view to make clicked navigation visibly respond while current records load.

Landing page: admissions notice and badge, one-time hero entrance/photo animation, section reveals using IntersectionObserver and Web Animations, smooth anchor scroll, reading-progress indicator, back-to-top link, animated photo dialog/menu, and family enquiry cards. Pickup and after-school care hours remain unspecified as requested. Respect reduced motion and keep all content visible without animation support or JavaScript.

## Verification

- 40 tests pass with one test worker; added fee-summary equivalence, pending exclusion and guardian/teacher scope coverage. Parallel PostgreSQL test workers timed out while competing with the production build on this desktop; sequential rerun passes without increasing production timeouts.
- Production build succeeds. Browser test confirms hero animation, progress/back-to-top, gallery filter/dialog,390px layout without overflow, mobile menu/anchor behaviour, reduced-motion animation disabled, and demo creation. No browser page errors.
- The synchronous PostgreSQL bridge remains a limitation of the demo architecture. A production rollout should use asynchronous database repositories and appropriate connection pooling; this update reduces round trips without claiming to complete that migration.
- Repeat the same live HTTP timing script after deploy before claiming a measured improvement.
