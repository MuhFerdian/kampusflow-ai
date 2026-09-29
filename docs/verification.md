# Verification record — Phase 1 acceptance and Phase 2 review

## Phase 2 — implementation review, live acceptance pending

Updated: **29 September 2026 (Asia/Jakarta)**. Revision **P2-REVIEW-20260929-R1**.

The user subsequently authorized Phase 2 through the AI Core master prompt. The earlier Phase 1 closure and its live acceptance remain valid. **Phase 2 is not yet PASSED / ACCEPTED:** a real FastAPI deployment and authenticated live integration are still required.

Implemented: JWT-protected read-only FastAPI endpoints; deterministic V2 scoring and recommendation breakdown; deterministic planner; Dashboard/Planner/Assistant integration; bounded optional study-strategy AI and safe fallback; Cloud Run deployment files. No Flutter, RAG or schema migration.

Current verification:

- **29 web tests pass**, including every existing Phase 1 test and 16 new V2/planner cases. Shared score fixtures cover completed, overdue, today, tomorrow, distant/no deadlines, low/high importance, progress and rounding. Planner tests cover breaks, ordering, partial/unscheduled workload, no overlap and timezone offsets.
- **54 FastAPI tests pass**, including the original three tests (health expectation updated for Phase 2). Coverage includes RS256 and legacy HS256 validation, malformed/expired/invalid signatures, issuer/audience/subject/role checks; protected endpoint rejection; RLS bearer/public-key propagation and owner guards; provider disabled/error/timeout/schema fallback; unknown/invented model output rejection; request size/validation, CORS and per-user throttling.
- **TypeScript checks and the Next.js production build/static export pass** (14 generated pages). The build used the existing Supabase public configuration and no backend URL. Source and deployment identifiers are recorded in the delivery report after publication.
- API tests run the FastAPI lifespan and routes through TestClient, with mocked external HTTP and no paid provider calls. One dependency warning remains: Starlette deprecates the current httpx TestClient adapter.
- Tests used local fixtures/PGlite/mocks; no production academic data was created, updated or deleted.
- Phase 1 datetime/repository/model/migration implementations remain unchanged. Existing V1 task sorting and Today Priority remain; new Phase 2 surfaces are labeled V2.

Deployment boundary: frontend uses the configured production Supabase values; `NEXT_PUBLIC_API_BASE_URL` remains empty because no authorized backend deployment is available here. Deterministic Phase 2 features operate on already-loaded Supabase task data. Cloud Run Docker/PORT/CORS/environment instructions are ready; the container itself and live backend have not been tested/deployed.

Remaining Phase 2 live checks after deployment: authenticated browser → FastAPI → Supabase read, CORS, logout/expired-token rejection, real recommendation/planner/assistant responses, then optional provider activation and failure fallback. This is **not** a request to repeat accepted Phase 1 live CRUD tests. Visual browser QA was unavailable because the required browser-control skill was not available.

## Historical Phase 1 acceptance record


## Final status — PASSED / ACCEPTED

Updated: **29 September 2026 (2026-09-29), Asia/Jakarta**.

**Documentation revision: P1-ACCEPTED-20260929-R2**

**Supabase production is connected. The live production deployment is operational and Phase 1 is closed. No further Phase 1 acceptance test is required for this closure.**

Phase 1 live acceptance testing is complete and successful, including the `due_at` fix. The user explicitly confirmed the following results after testing directly with a live Supabase account. These are user-executed live acceptance results, not a claim that the assistant performed authenticated browser testing.

| Live acceptance case | Result | Evidence source |
|---|---|---|
| Production deployment connected to Supabase | Connected — verified live | User confirmation, 2026-09-29 |
| Register, email confirmation and login | Passed | User confirmation, 2026-09-29 |
| Course create/read/update/delete | Passed | User confirmation, 2026-09-29 |
| Project create/read/update/delete | Passed | User confirmation, 2026-09-29 |
| Task CRUD: create/edit/progress/complete/delete | Passed | User confirmation, 2026-09-29 |
| Persistence after browser refresh | Passed | User confirmation, 2026-09-29 |
| `due_at` fix retest | Passed; `Invalid datetime` no longer occurs | User confirmation, 2026-09-29 |

**The reported Phase 1 acceptance scope has no outstanding blocker. At closure, Phase 2 was on hold; the later master prompt authorized the implementation documented above.** The broader checks below are not implied by this acceptance result.

## Automated verification for the accepted fix

The assistant executed these checks during the `due_at` fix, before the user's final live retest:

- **13 Node tests passed:** five priority/metrics/validation tests, seven datetime regression tests, and one PostgreSQL/PGlite integration test.
- **Three FastAPI tests passed:** health response, disabled-AI HTTP 503 response, and provider configuration validation. One existing dependency deprecation warning was observed.
- **Next.js production build, TypeScript checks and static export passed.**
- Deployment containing the fix succeeded, using Site Settings environment revision 4.
- Source commit for the accepted application fix: `c46a14f42a532dff2b80ca47afcf4f74b3633a5b`.

The PostgreSQL test executes the unchanged application migration with minimal Supabase system-schema stubs and verifies:

- signup profile trigger and per-user profile visibility;
- task CRUD and completion, course/project creation and deletion;
- status/progress constraints;
- denial of cross-user reads, updates, deletes and spoofed owner inserts;
- denial of cross-user course/project links;
- course/project deletion preserves tasks and ownership while clearing associations;
- private storage policies restrict access across owner folders;
- a real timestamptz serialized to JSON passes completion validation and persists with its exact instant and microsecond precision unchanged.

PGlite tests use PostgreSQL semantics. They complement the user-confirmed live acceptance results; they do not establish live two-account isolation by themselves.

## due_at incident — resolved and live-retested

Root cause: `z.string().datetime()` accepted UTC `Z` by default but rejected valid explicit timezone offsets. PostgreSQL/PostgREST JSON returns timestamps such as `2026-09-28T17:00:00+00:00`. Quick-complete resubmitted the loaded task through `saveTask`, causing its existing deadline to fail validation.

Implemented fix:

- Accept explicit-offset ISO timestamps and UTC `Z`; retain the original string and PostgreSQL microsecond precision.
- Reject timezone-free API timestamps, malformed offsets and invalid calendar dates.
- Convert edited `datetime-local` values using the browser's local timezone, then to UTC exactly once.
- Preserve the original timestamp when the displayed minute is unchanged, including sub-minute precision and DST overlap identity.
- Reject nonexistent local times in DST gaps; keep empty deadlines as null.

Regression coverage includes Asia/Jakarta, UTC and America/New_York; positive/negative offsets; null and invalid input; complete/reopen/progress updates; and DST transitions. The user subsequently repeated the live flow and confirmed that the `Invalid datetime` error no longer appeared.

## Earlier live connection checks — 2026-09-28

The assistant verified:

- both public Supabase variables were configured in Site Settings revision 4 and embedded into the web build; the local `.env.local` remains ignored;
- Auth settings returned HTTP 200: email login/signup enabled, email confirmation required, anonymous sign-in disabled;
- all seven application tables responded HTTP 200 to anonymous read requests with zero visible rows;
- invalid credentials returned HTTP 400 / `invalid_credentials`;
- anonymous task insertion returned HTTP 401 / PostgreSQL `42501`, rejected by RLS without creating a record.

These earlier connection checks are supplemented by the completed live acceptance checklist dated 29 September 2026. The current status is PASSED / ACCEPTED.

## Evidence boundaries — not pending Phase 1 acceptance work

- Live isolation between two distinct authenticated accounts and direct REST attempts across owners (covered locally by PostgreSQL tests, not confirmed live).
- JWT expiry, session recovery, network loss, and persistence across separate browsers/devices.
- Comprehensive responsive, accessibility and keyboard QA.
- Real AI inference, Flutter, document ingestion and RAG: intentionally outside Phase 1 and not enabled.

## Documentation-only closure

The historical Phase 1 closure update changed only `README.md` and `docs/verification.md`. At that time application code, features, database schema and configuration were unchanged and tests were not rerun. The subsequent Phase 2 work is tracked separately above.

## Closure instruction

Phase 1 acceptance is complete. The user requested no repeat Phase 1 live acceptance cycle for the documentation closure. The subsequently authorized Phase 2 work preserves those results, runs automated regression tests, and requires its own live backend acceptance.
