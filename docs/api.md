# Phase 2 API contract

FastAPI base URL is deployment-specific. There is no live backend URL configured yet. Browser setting: `NEXT_PUBLIC_API_BASE_URL`, empty until a real backend is deployed. Responses are JSON. OpenAPI is available at `/docs` when running the backend.

## Authentication and errors

Every `/api/v1/*` endpoint requires `Authorization: Bearer <Supabase access token>`. The browser obtains its current session via Supabase JS; no request supplies trusted `user_id`. Missing, malformed, expired, wrong-audience, wrong-issuer and invalid-signature tokens are rejected with 401. Anonymous Supabase sessions are excluded. Verified identity controls database queries, which also use the original JWT and public key so RLS remains enforced.

| Status | Meaning / browser behavior |
|---|---|
| 401 | Sign in again; no local fallback masking authentication failure |
| 403 | Access denied; no local fallback |
| 404 | Selected active task is not in this user's bounded overview |
| 408 | Request body receive timeout |
| 413 | Request body exceeds 32 KiB |
| 422 | Invalid fields, text length, dates or planning window |
| 429 | Per-user limit reached; `Retry-After: 60`; no automatic retry |
| 500 / 503 | Safe generic error; planner/assistant may use already-loaded local tasks |

Error shape: `{"detail":"Human-readable safe message"}`. The web uses its own friendly status mapping and does not display exception JSON. No stack traces, credentials, tokens or provider response bodies are returned. Extra body fields such as `user_id` are rejected. Browser deadline is 30 seconds; data/auth requests have a 10-second HTTP timeout and provider calls have a total configurable timeout (default 20 seconds).

## GET /health

Public, does not query Supabase or call AI. Liveness/configuration only, **not proof of upstream connectivity**.

```json
{"status":"ok","phase":2,"ai_recommendations":false,"backend_configured":true}
```

`ai_recommendations` means a provider is configured, not that a provider call has succeeded. The old `/recommendations` route remains unavailable (503); use the authenticated version below.

## GET /api/v1/recommendations

No request body or user ID. Reads active tasks only; maximum `MAX_TASKS` (default 200). When capped, the selection is deadline ascending (null last), importance descending, ID ascending, then V2 ranks the selected set. `context_truncated` means totals and ranking cover only that subset.

Response fields:

- `engine_version: "v2"`, `generated_at`: aware ISO timestamp.
- `top_tasks`: ranked active task array. Each has `task_id`, `title`, `due_at`, `importance`, `difficulty`, `estimated_minutes`, `progress`, `remaining_minutes`, `priority_score`, `rank`, `components`, `reason_codes`, `reason`.
- `components`: deadline / importance / difficulty / effort / remaining_progress contributions.
- `active_task_count`, `remaining_workload_minutes`, `context_truncated`, `ai_available`, `summary`.

No LLM call. Scores are computed, never persisted as authoritative database values.

## POST /api/v1/recommendations/explain

```json
{"task_id":"11111111-1111-4111-8111-111111111111"}
```

Returns the AI-result contract below. Task must belong to the authenticated user's selected active set; otherwise 404. Provider disabled, timeout, error, invalid output, unknown task IDs or unsupported strategy: return 200 with deterministic explanation and an unavailable notice.

## POST /api/v1/planner/generate

```json
{
  "starts_at":"2026-09-29T19:00:00+07:00",
  "ends_at":"2026-09-29T22:00:00+07:00",
  "focus_minutes":50,
  "break_minutes":10
}
```

Use current/future dates when running this example. Timezone offset required; UTC `Z` accepted. Duration 1 minute–16 hours, start no more than one minute in the past; focus 15–120 minutes (default 50), breaks 0–30 (default 10). Form values are converted from browser local time through the preserved Phase 1 datetime utility.

Response: `engine_version`, `blocks`, `scheduled_minutes`, `break_minutes`, `remaining_workload_minutes`, `unscheduled_tasks`, `available_minutes`, `unused_minutes`, `context_truncated`, `source: "backend"`.

A block has `kind` (`task`/`break`), `task_id` (null for breaks), `title`, aware `starts_at`/`ends_at`, `minutes`, `past_deadline`. Unscheduled entries have `task_id`, `title`, remaining minutes and `reason` (`PARTIALLY_SCHEDULED`/`WINDOW_FULL`). No trailing break. No overlap. Completed tasks excluded. Preview only; no database writes or calendar synchronization.

## POST /api/v1/assistant/chat

```json
{"message":"What should I work on first?"}
```

Nonblank message, maximum 1,000 characters. Each request is independent; no conversational history is sent or stored. Uses active tasks, not documents, course content, external search or RAG. Recognizes first priority / urgency / remaining workload in basic English and Indonesian. Planning questions point to Daily Planner for explicit start/end times instead of guessing what “tonight” means.

AI-result contract:

```json
{
  "mode":"deterministic",
  "message":"Grounded task guidance...",
  "task_ids":[],
  "notice":"AI explanation is currently unavailable. Deterministic task information is still available."
}
```

`mode`: `ai`, `deterministic`, or `unavailable`. An unsupported generative question with no provider returns `unavailable` gracefully. The assistant has no write tools.

## Provider contract and cost bounds

Only explicit explanation/chat submissions may invoke the provider. No inference on dashboard load, task mutation, planner generation or rerender.

OpenAI-compatible `POST <AI_BASE_URL>/chat/completions`, JSON response mode, max 500 output tokens, temperature 0.2. Sends at most 10 task summaries, title capped at 120 printable characters, prompt capped at 16,000 characters, question capped at 1,000. No descriptions, JWTs, user IDs, email addresses or other users' records. Task titles themselves may be personal data: enabling the provider authorizes transmitting this bounded context to that provider.

For this MVP the model selects **one of four study strategies** and validated existing task IDs. Free prose, invented facts, extra output fields and unknown IDs are rejected. The server composes task facts and score explanations from trusted calculations, then appends the selected predefined advice. This deliberately limits open-ended conversation while preventing silent fabrication of task facts. The model never writes a priority, deadline or schedule.

Default 60 authenticated requests/user/minute; explanation/chat share a stricter six/user/minute limit. Limits are process-local, reset on restart, and do not provide a global cost ceiling. Configure one worker/one instance initially; upstream gateway/provider budget controls are needed before broader scale.
