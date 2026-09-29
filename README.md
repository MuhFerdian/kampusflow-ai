# KampusFlow AI

Personal Academic & Project Copilot — Phase 1 accepted; Phase 2 AI Core implemented for review.

**Documentation revision: P2-REVIEW-20260929-R1**

**Phase 2 status: implementation and local tests ready; backend deployment and authenticated Phase 2 live acceptance pending.** The web includes V2 recommendations, Daily Planner and a read-only Assistant. Until a real FastAPI URL is configured, these features use deterministic on-device calculations from the signed-in user's loaded Supabase tasks. No live AI provider is enabled. See [API](docs/api.md), [architecture](docs/architecture.md), [verification](docs/verification.md) and [Cloud Run deployment](docs/deployment-cloud-run.md).

## Current production status — 29 September 2026

**Phase 1: PASSED / ACCEPTED. Supabase production is connected.**

| Accepted live result | Status |
|---|---|
| Production deployment connected to Supabase | CONNECTED |
| Register / email confirmation / login | VERIFIED LIVE — PASSED |
| Course CRUD | VERIFIED LIVE — PASSED |
| Project CRUD | VERIFIED LIVE — PASSED |
| Task CRUD, including create / edit / progress / complete / delete | VERIFIED LIVE — PASSED |
| Data persistence after browser refresh | VERIFIED LIVE — PASSED |
| `due_at` regression fix | LIVE RETEST PASSED — no `Invalid datetime` error |

Live acceptance was performed and confirmed by the user on **29 September 2026 (Asia/Jakarta)**. Phase 1 is closed; **no further Phase 1 acceptance test is required for this closure**. Phase 2 was subsequently authorized by the user's AI Core master prompt.

**Implemented:** Next.js web client with Supabase email/password registration and sign-in, course/project CRUD, task CRUD, completion, progress, filtering/sorting, and a dashboard derived from database records. The app has no demo data or local-storage database.

**Phase 1 status — PASSED / ACCEPTED (2026-09-29, Asia/Jakarta):** The user confirmed successful live Supabase registration/email confirmation/login, course CRUD, project CRUD, task create/edit/progress/complete/delete, persistence after browser refresh, and retesting of the `due_at` fix with no further `Invalid datetime` error. The fix previously passed 13 Node tests, three FastAPI tests, and the production build/TypeScript checks. Live acceptance was performed by the user; see `docs/verification.md` for evidence and scope. **That Phase 1 closure remains accepted; Phase 2 is now authorized and tracked separately.** For fresh installations, follow the setup instructions below.

## Architecture and stack

- `web/`: Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase JS, Zod, Lucide icons.
- Browser → Supabase Auth → PostgreSQL via Supabase REST with the user's JWT. RLS is the authorization boundary; UI gating is not a security control.
- `backend/`: Python/FastAPI protected read-only recommendations, planner and optional AI guidance. JWT verification and user-context Supabase reads preserve RLS. Phase 1 CRUD remains independent of this service.
- `supabase/`: reproducible PostgreSQL schema, RLS, pgvector column, private Storage bucket.
- `mobile/`: Flutter implementation intentionally deferred; instructions only.
- `docs/`: architecture and verification notes.

```text
kampusflow-ai/
  web/
    src/app/              # pages, layout and theme
    src/components/       # workspace, auth and accessible forms
    src/lib/              # types, validation, repository, priority logic
    tests/                # priority/validation and PostgreSQL RLS tests
  backend/
    app/                  # auth, repository, V2 priority, planner, provider, API
    tests/
    Dockerfile
    start.py              # Cloud Run PORT entrypoint
  tests/fixtures/         # shared Python / TypeScript V2 contract
  mobile/README.md
  supabase/migrations/
  docs/
  scripts/
  .env.example
  .gitignore
  README.md
```

## Requirements

Node.js 22+ and npm; Python 3.11+ (3.12 in the container) for the backend; a Supabase project. Flutter is not required in this phase. Use a current PostgreSQL version supplied by Supabase (the migration uses column-specific SET NULL actions).

## Setup reference for a new installation

The current production deployment is already connected and accepted. The following setup and command examples are reference instructions for a new/local installation, not outstanding work or a request to repeat Phase 1 testing.

## 1. Supabase setup

1. Create a Supabase project. Keep its database password and service-role/secret keys private.
2. Open SQL Editor and execute `supabase/migrations/202609270001_foundation.sql` **once**, or use Supabase CLI migrations (`supabase link --project-ref YOUR_REF`, then `supabase db push`). The migration is transactional; do not reapply it to an already-migrated database.
3. In Authentication, enable email/password sign-in. Keep email confirmation enabled and configure email delivery for production. Set Site URL to `http://localhost:3000` for local development.
4. Add `http://localhost:3000/dashboard/` to the allowed redirect URLs. When hosting, set your actual HTTPS Site URL and allow its `/dashboard/` redirect as well.
5. Copy the project URL and **publishable key or legacy anon key** from the project API settings. Do not copy a service-role or secret key into the web app.
6. The migration creates a private `academic-documents` bucket. Upload UI and document processing are not enabled yet.

The schema has `profiles`, `courses`, `projects`, `tasks`, `study_plans`, `documents`, and `document_chunks`. Every table has RLS. Cross-owner foreign keys prohibit attaching tasks/documents/plans to another student's records. Deleting a course or project keeps its tasks and clears the associated ID. Deleting an auth user cascades their database records; storage object cleanup must be implemented before account deletion is exposed.

## 2. Web environment and running

From the repository root:

```bash
npm --prefix web ci
```

Copy `web/.env.example` to `web/.env.local` and replace both placeholders:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
NEXT_PUBLIC_API_BASE_URL=
```

On Windows PowerShell use `Copy-Item web/.env.example web/.env.local`; on Linux/macOS use `cp web/.env.example web/.env.local`.

```bash
npm run dev
# Open http://localhost:3000
```

Registration without an immediate session displays an email-confirmation notice. Confirm the email and sign in. Create a course and project, then create and manage tasks. Dates entered in forms use your browser's local timezone and are saved as UTC timestamps.

```bash
npm run build                    # production static export in out/
npm --prefix web run typecheck
npm test
```

This app intentionally uses a Next.js static export with direct Supabase access. Host `out/` on a static host that supports folder `index.html` files. **Do not use `next start` with this export.** Public environment values are embedded at build time: rebuild and redeploy after changing them. No private API credentials belong in `NEXT_PUBLIC_*` variables. The repository's Sites manifest points to `out/`.

## 3. Backend setup (required for server-backed Phase 2)

```bash
cd backend
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# Copy .env.example to .env
python -m uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/health` and `http://localhost:8000/docs`.

```bash
python -m pytest -q
```

Backend configuration belongs in `backend/.env`; use placeholders from `backend/.env.example`. Start with AI disabled. Configure the same Supabase project as the web.

| Variable | Purpose / default |
|---|---|
| `SUPABASE_URL` | Your HTTPS Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Public publishable/anon key; no service role |
| `CORS_ORIGINS` | Exact comma-separated origins; localhost only for development |
| `AI_PROVIDER` | `disabled` (default) or `openai_compatible` |
| `AI_API_KEY` | Backend-only credential; empty when disabled |
| `AI_BASE_URL` | HTTPS OpenAI-compatible API root; default `https://api.openai.com/v1` |
| `AI_MODEL` | Provider model; required only when enabled |
| `AI_TIMEOUT_SECONDS` | Total inference deadline; default 20 |
| `MAX_TASKS` | Bounded active task overview; default 200, maximum 500 |
| `RATE_LIMIT_PER_MINUTE` | Per-user API limit; default 60 |
| `AI_RATE_LIMIT_PER_MINUTE` | Shared per-user explanation/chat limit; default 6 |
| `PORT` | Container listener; default 8080, supplied by Cloud Run |

The browser's `NEXT_PUBLIC_API_BASE_URL` must remain empty until a real backend exists. Browser requests obtain the Supabase session token and send `Authorization: Bearer ...`. Auth identity never comes from JSON. Phase 2 endpoints are documented in [docs/api.md](docs/api.md); Cloud Run commands and environment setup are in [docs/deployment-cloud-run.md](docs/deployment-cloud-run.md).

`AI_PROVIDER=disabled` keeps ranking, scheduling and task-based assistant answers operational. Optional AI selects a bounded study strategy; factual explanations are rendered from deterministic data. Provider errors/invalid output/timeouts fall back safely. No inference runs automatically on dashboard load. The old unprotected `/recommendations` route remains disabled (503).

## 4. Mobile

See `mobile/README.md`. No Flutter application has been generated or tested yet. This is intentional incremental development.

## Pages

- Dashboard: task metrics, computed priorities, deadline list, recent projects and progress.
- Tasks: create/edit/delete, complete/reopen, progress 0–100, course/project links, deadlines, importance, difficulty, duration, search, status/course filters, priority/deadline/newest/progress sorts.
- Courses and Projects: create, view, edit, delete, related-task counts and progress.
- Login/Register: Supabase email/password authentication and confirmation messaging.
- Settings: connection/account information and priority formula.
- Planner: deterministic time blocks, breaks, partial work and unscheduled workload; preview only.
- AI Assistant: read-only priority/urgency/workload answers, with optional constrained AI study guidance.
- Materials: remains a future-feature state; no ingestion or RAG.

## Hybrid priority foundation

`web/src/lib/model.ts` implements `priorityScore(task, now)`, version 1. Deadline urgency weighs 45%, importance 25%, difficulty 10%, estimated effort 10%, and remaining progress 10%. Completed tasks score zero. Scores are computed at display time and not written into `priority_score` yet, avoiding a stale authoritative cache. There is no LLM dependency. Future AI should explain a trusted deterministic ranking rather than own it. V1 remains in existing task sorting and Today Priority to preserve Phase 1 behavior. The new recommendation card, planner and assistant use V2: continuous deadline urgency plus importance, difficulty, remaining effort and remaining progress. Separate version labels make this transition explicit. Shared fixtures check the browser and backend implementations. See `docs/architecture.md` for details.

## Security

- RLS applies to all application tables; the browser only uses a public key and authenticated JWT.
- Composite `(record_id,user_id)` foreign keys prevent cross-user associations.
- A private Storage bucket restricts object paths to `<auth.uid()>/...`.
- No credentials or `.env` files are committed. `.env.example` contains placeholders only.
- React escapes rendered text; forms validate values and PostgreSQL enforces core constraints.
- The app uses Supabase JS browser session persistence. Protect against XSS; do not introduce unsafe HTML rendering.
- No privileged admin operations, account deletion, or assistant write tools. Protected AI inference is optional and backend-only.
- JWTs verify issuer/audience/expiry/signature through Supabase JWKS; legacy HS256 uses the trusted Supabase Auth server. Database reads retain the original JWT and RLS.
- 32 KiB body limit, strict CORS, bounded context, timeouts and per-user local throttles. Local limits reset on restart and do not substitute for global/provider budgets.

## Testing and deployment state

[docs/verification.md](docs/verification.md) distinguishes the accepted Phase 1 live results from current Phase 2 evidence. All 13 Phase 1 web tests remain; 16 Phase 2 cases bring the web suite to **29 passing tests**. The backend suite has **54 passing tests**, including the three preserved Phase 1 tests (health expectation updated to Phase 2). TypeScript checks and the Next.js production build/static export pass (14 pages). Publication identifiers are recorded in the delivery report.

No production academic data was modified by testing. Backend external calls and AI calls are mocked in tests. Authenticated live web → FastAPI → Supabase verification and optional real-provider verification remain pending deployment; no claim of full Phase 2 acceptance is made. Browser visual QA was unavailable in this environment. No repeat Phase 1 live CRUD acceptance is requested.

## Next review gates and future roadmap

1. Deploy FastAPI using the Cloud Run guide, leave AI disabled, then connect the real URL in Site Settings and rebuild the web.
2. Verify Phase 2 recommendations, planner and read-only assistant with the existing authenticated account. Confirm authorization/CORS/error handling, without mutating production records for tests.
3. Optionally configure a provider secret and budget, then test explicit AI guidance and fallback.
4. Review and accept Phase 2 before any additional phase.

Flutter, document ingestion, RAG, calendar synchronization, notifications and write-capable assistant tools have not been started. The existing seven-table schema and accepted Phase 1 migration are unchanged. The existing vector column remains unused.
