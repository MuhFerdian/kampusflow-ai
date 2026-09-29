# Architecture decisions

## Foundation boundaries
The static Next.js UI directly uses Supabase Auth and the Supabase REST API. RLS in PostgreSQL is the final authority, regardless of browser checks. The `repository.ts` module owns data reads and mutations, `model.ts` owns task types, input validation and deterministic priority logic. Mutations wait for database success before closing forms, preserve input on failure, and reload authoritative data afterward. Delete confirmations use native modal dialogs with keyboard focus trapping.

No server service-role key is needed by the web app. The FastAPI service is deliberately independent of CRUD in Phase 1. No mobile implementation or document processing is included. Phase 2 server endpoints are read-only; optional inference is isolated behind the provider boundary.

## Data model
| Table | Main relationships and purpose |
|---|---|
| profiles | One row per auth user, created by signup trigger |
| courses | User-owned subjects; optional course code |
| projects | User-owned projects with todo/in_progress/completed status |
| tasks | User-owned records, optional same-owner course/project, deadlines and priority inputs |
| study_plans | User-owned time blocks with optional same-owner task |
| documents | User-owned metadata; optional same-owner course/project; private storage path |
| document_chunks | Same-owner document chunks; vector and embedding model metadata |

Task status and progress are consistent: `completed` requires 100, non-completed requires less than 100. Moving the form to completed sets 100%; entering 100% marks completed. Reopening sets 0%. Changing a completed task to in-progress starts at 0%, then allows adjustment.

Course/project deletion clears just the related foreign-key column, never user ownership. Profiles reference auth.users, and all owner columns reference auth.users. Document chunks cascade with their parent document. The signup trigger uses a fixed empty search path.

## Priority v1
Score = round(100 × (0.45U + 0.25I + 0.10D + 0.10E + 0.10R)).

- U: overdue=1, ≤24h=.9, ≤72h=.7, ≤7 days=.45, ≤14 days=.2, otherwise/no date=0.
- I: importance / 5.
- D: difficulty / 5.
- E: min(estimated_minutes / 240, 1).
- R: 1 − progress/100.
- Completed tasks: 0.

This is an explicit initial heuristic, not a scientifically validated recommendation model. Inputs and `now` are injectable for deterministic tests. Rank at read/render time because deadlines change. Persisted priority_score is reserved for a later versioned cache/job. AI explanations will consume this output and user preferences, not replace core scoring.

## Phase 2 data flow

The browser keeps Phase 1 CRUD directly against Supabase. For Phase 2 it obtains the current Supabase access token and sends it to FastAPI. `auth.py` verifies identity; `repository.py` queries Supabase REST with the **same user token plus public key**, and RLS still authorizes every row. A defensive owner check rejects a response containing foreign rows. Request body identity fields are forbidden.

Asymmetric RS256/ES256 tokens verify using cached project JWKS (five-minute cache, unknown-key refresh cooldown ten seconds). Audience must be `authenticated`, issuer must be the configured project's `/auth/v1`, and expiry/issued-at/subject are required. Legacy HS256 is accepted only after the project Auth `/user` endpoint accepts the original token and returns the matching subject. No local unverified token identity is trusted. Anonymous sessions are rejected. Asymmetric verification does not check immediate session revocation; a correctly signed token can remain valid until expiry, subject to Supabase RLS/API behavior.

Reference: [Supabase JWTs](https://supabase.com/docs/guides/auth/jwts) and [signing keys](https://supabase.com/docs/guides/auth/signing-keys).

## Priority Engine V2

`backend/app/priority.py` and `web/src/lib/priority-v2.ts` calculate the same versioned heuristic. `tests/fixtures/priority-v2.json` is consumed by both suites. Existing V1 task sorting and Today Priority remain unchanged; V2 is explicitly used by the new recommendation card, planner and assistant.

For each incomplete task, let `h` be hours until deadline and `remaining` be `max(1, ceil(estimated_minutes × (100-progress)/100))`:

| Component | Contribution |
|---|---|
| Deadline | `45 × clamp(1 − h/336, 0, 1)`; zero without a deadline |
| Importance | `importance × 5` |
| Difficulty | `difficulty × 2` |
| Effort | `10 × min(remaining/240, 1)` |
| Remaining progress | `(100-progress)/10` |

Contributions round half-up to two decimal places, sum rounds half-up to an integer capped at 100. Completed tasks have score/workload zero and are excluded from active ranking. Overdue tasks receive maximum urgency; high-importance near-deadline work may outrank low-importance overdue work because the other components still matter. Urgency is continuous rather than jumping at day boundaries. Ties: deadline ascending, creation time ascending, ID ascending. Clock is injected in tests. Scores are never stored as authoritative values.

Reason codes expose due-within-24h, due-within-72h, overdue, no deadline, high importance, challenging work, substantial remaining work, near completion and completed. This is an explainable heuristic, not a validated prediction of academic outcomes.

The backend selects at most 200 active tasks by default (configurable up to 500), fetching one extra row to detect truncation. Selection is due ascending/null-last, importance descending, ID ascending; scoring/ranking happens after selection. Partial flags/totals are explicit. Browser fallback uses at most 200 tasks already loaded by Phase 1; very large Supabase result sets may also be limited by the existing workspace fetch. This MVP does not claim exhaustive ranking for arbitrarily large accounts.

## Deterministic planner

`planner.py` and `web/src/lib/planner.ts` consume V2 ordering and remaining minutes. Fill the supplied window in rank order; split tasks into focus intervals, carry the focus counter across task boundaries, and insert configured breaks when another work minute fits. Never insert a final break. Report partially scheduled and entirely unscheduled work, unused minutes and blocks that end after task deadlines. This is a priority-first scheduler, not a global deadline-optimization solver.

Both timestamps require explicit timezone semantics. The UI reuses the unchanged Phase 1 local-datetime conversion and displays dates/times in the browser's timezone (including windows across midnight). Valid windows are 1 minute–16 hours, with starts at most one minute in the past. Planning is preview-only: no writes to `study_plans`, no automatic progress changes, no calendar sync. Existing schema needs no migration.

## Optional AI boundary

Only an explanation click or Assistant submit may call the provider. Recommendations and scheduling never do. The model receives at most ten sanitized task summaries, a bounded question and deterministic facts. It receives no JWT, email, owner ID or description. Titles are still potentially personal information, so enabling AI entails sending that limited context to the chosen provider.

To prevent the LLM from silently inventing task facts, the response schema permits **only an existing-task ID list and one of four strategy enums**. The server rejects extra fields, unknown IDs and invalid strategies. It renders the factual answer itself and appends a predefined study tip selected by the model. This provides limited personalization rather than unrestricted generative chat. The model cannot change a score, deadline, task, plan or database record. Task titles and questions are untrusted prompt data; system instructions and structured output add defense in depth.

Disabled provider, timeout, HTTP error, oversized/invalid output or malformed JSON returns the deterministic answer with an unavailable notice. Unsupported open-ended questions without AI have an explicit unavailable state. Each chat submission is independent; web message history is capped at 20 messages and exists only in page state. No server chat storage, tools or RAG.

## Security and deployment assumptions

- Explicit CORS origins; no wildcard, browser requests use Bearer tokens, not backend cookies.
- Body cap 32 KiB including streamed bodies, ten-second body timeout, 1,000-character question, 16,000-character prompt, 64 KiB provider response cap, 500 output tokens.
- Default per-user limits 60/minute for the API and six/minute shared by explanation/chat. In-memory state is capped and resets on restart. One worker/instance is the initial deployment shape; process-local throttling is not a global anti-abuse or billing control.
- Error responses omit stack traces and sensitive values. Application logs do not include JWTs, passwords, keys, prompts, authorization headers or provider bodies. Hosting-provider request logging is separate.
- The web API helper sends the session token, never trusted user identity. No backend request when signed out or no backend URL is configured. It handles auth, permission, validation, rate-limit and service errors. It uses deterministic local fallback for unconfigured/offline services; no mutations depend on that fallback.
- Cloud Run files and precise deployment commands are provided. Backend has not been deployed here. Current frontend configuration keeps the backend URL empty; no false live backend URL is used.
- Web visual/browser testing and authenticated live backend testing remain explicit review gates. No Phase 1 production data is changed by automated tests.

## Deferred extensions

Flutter, ingestion, embeddings, retrieval, calendar integrations and assistant writes are excluded from Phase 2. The unused Phase 1 vector column remains unchanged. Any future embedding dimension/index or ownership-scoped retrieval must use a new migration and a separately reviewed phase.
