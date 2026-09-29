# Deploy FastAPI to Google Cloud Run

**State: deployment prepared, not deployed.** This environment has no authorized Google Cloud deployment integration/credentials. No cloud service was activated, no paid AI request was made and no backend URL was invented. The published static web can use deterministic on-device fallbacks until these steps are completed.

These commands are for Bash / Google Cloud Shell. Run from the repository root. Docker builds only `backend/`; it cannot package the frontend's local environment file. `.dockerignore`, `.gcloudignore` and `.gitignore` exclude environment files and local deployment configuration. Docker runs as non-root and `start.py` binds `0.0.0.0:$PORT` with one Uvicorn worker. The container is prepared but has not been built/run with Docker here.

## 1. Select your existing Google Cloud project

Requires Google Cloud CLI, login, billing, and permission to deploy Cloud Run and build/store images. The owner must approve any billing or API activation in Google Cloud. Do not use an unrelated project automatically.

```bash
gcloud auth login
export KAMPUSFLOW_PROJECT_ID='YOUR_GOOGLE_CLOUD_PROJECT_ID'
export KAMPUSFLOW_REGION='asia-southeast2'
gcloud config set project "$KAMPUSFLOW_PROJECT_ID"
```

If required APIs are disabled, review billing and enable them yourself:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

The source deploy uses Cloud Build and Artifact Registry, which can incur costs. Keep `AI_PROVIDER=disabled` for the first deployment.

## 2. Create local configuration

Create **`backend/cloudrun.env.yaml`**, which is ignored by Git and upload contexts. Replace placeholders with the same Supabase project used by the web. The legacy anon key is supported; never use the service-role key.

```yaml
SUPABASE_URL: "https://YOUR_PROJECT.supabase.co"
SUPABASE_PUBLISHABLE_KEY: "YOUR_PUBLISHABLE_OR_ANON_KEY"
CORS_ORIGINS: "https://kampusflow-ai.ferdibaru-fb.chatgpt.site"
AI_PROVIDER: "disabled"
AI_BASE_URL: "https://api.openai.com/v1"
AI_MODEL: ""
AI_TIMEOUT_SECONDS: "20"
MAX_TASKS: "200"
RATE_LIMIT_PER_MINUTE: "60"
AI_RATE_LIMIT_PER_MINUTE: "6"
```

CORS origins must match exactly, with no trailing slash. Multiple origins use a comma; omit localhost in production. Do not set `PORT` manually in Cloud Run: Cloud Run supplies it.

## 3. Deploy

```bash
gcloud run deploy kampusflow-api \
  --source ./backend \
  --region "$KAMPUSFLOW_REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 20 \
  --timeout 60 \
  --env-vars-file backend/cloudrun.env.yaml
```

`--allow-unauthenticated` allows the browser to reach the HTTP service. **Application endpoints still require and verify Supabase JWTs**; Google IAM tokens are not substituted for Supabase sessions. `/health` and OpenAPI docs are public. Use a minimally privileged runtime service account; the backend only needs public-key/JWT access to Supabase, and optional permission for a selected Secret Manager secret. Cloud Build IAM depends on project policy; resolve any denied build permission in your own project rather than weakening application auth.

Copy the real service URL from successful deployment, or retrieve it:

```bash
gcloud run services describe kampusflow-api \
  --region "$KAMPUSFLOW_REGION" --format='value(status.url)'
```

Verify `/health` returns 200 and `backend_configured: true`; a request to `/api/v1/recommendations` with no token must return 401. Health alone does not verify a database connection. An authenticated Phase 2 request is needed to confirm JWKS/Auth, RLS reads and CORS end to end.

## 4. Connect the web

Only after backend deployment succeeds, add its actual HTTPS service URL as `NEXT_PUBLIC_API_BASE_URL` in Site Settings and rebuild/redeploy the web. Keep the existing public Supabase variables unchanged. For local web development, add the same variable to `web/.env.local` and allow `http://localhost:3000` in the local backend's CORS list.

```bash
npm run build
```

Publish `out/` using the existing Sites deployment workflow. A static build embeds this URL; a Site Settings edit by itself does not change previously built browser code.

For Phase 2 live verification, use your existing account and existing tasks: open recommendations, generate a planner preview, and ask the assistant a priority/workload question. Inspect the network request to confirm it reaches the actual backend, returns 200 and uses a Bearer header. Do not paste the token into messages or logs. Sign out and confirm protected endpoints reject unauthenticated requests. No production test tasks or repeated Phase 1 CRUD acceptance cycle is needed.

## 5. Optional provider activation, after deterministic integration works

Select an OpenAI-compatible provider/model that supports JSON response mode. Review its data policy and costs; set a provider-side budget. Enable Secret Manager only if approved. Store `AI_API_KEY` in Secret Manager; do not place it in YAML, source files, command history, or any `NEXT_PUBLIC_*` variable.

Bind an existing secret version (replace these placeholders):

```bash
gcloud run services update kampusflow-api \
  --region "$KAMPUSFLOW_REGION" \
  --update-secrets 'AI_API_KEY=YOUR_SECRET_NAME:YOUR_VERSION' \
  --update-env-vars 'AI_PROVIDER=openai_compatible,AI_BASE_URL=https://YOUR_PROVIDER/v1,AI_MODEL=YOUR_MODEL'
```

Grant only that secret's accessor permission to the runtime service account. All three provider settings must be consistent; missing key/model causes startup validation failure. Providers that reject JSON mode fall back gracefully. No provider calls occur on dashboard load or planner generation.

To disable paid inference again:

```bash
gcloud run services update kampusflow-api \
  --region "$KAMPUSFLOW_REGION" --update-env-vars 'AI_PROVIDER=disabled'
```

## Operational limits

One process limits requests per user, not globally across revisions/restarts. Even max one instance can overlap during rollout. This is an MVP throttle, not abuse protection or a billing guarantee. Configure global/provider budgets and edge request limits before scaling. Cloud Run request logs may include paths/status/IPs; the application disables Uvicorn access logs and never logs authorization headers, prompts, keys or provider bodies. Task selection is bounded and the UI marks partial totals. Dependencies use compatible version ranges; pin a reviewed container digest/dependency lock in a later release process.

References: [Cloud Run source deployment](https://docs.cloud.google.com/run/docs/deploying-source-code), [container contract](https://docs.cloud.google.com/run/docs/container-contract), [environment variables](https://docs.cloud.google.com/run/docs/configuring/services/environment-variables).
