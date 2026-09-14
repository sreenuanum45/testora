# Testora

A zero-code intelligent web/API test automation platform: record a flow by clicking through
your site, get a structured step-list, run it cross-browser, self-heal broken locators via an
LLM when the DOM changes, and export production Playwright code.

Built as a genuinely separate application (own NestJS backend, own React frontend, own
Postgres schema) — not an extension of any other project.

## What's real vs. simplified

This was built and **verified end-to-end** (registration → project/environment bootstrap →
test creation → recording → export → the full self-healing loop), but it's a working proof of
concept, not a finished commercial product. Being upfront about the boundary:

**Fully built and verified working:**
- Auth (JWT), Projects, Environments + Variables, Test Modules
- "New Test" creation UI (matches the spec's described layout) for both Web and API tests
- Recording engine: launches real Playwright Codegen, captures clicks/fills/navigation,
  parses the output into a structured JSON step-list (`{ action: 'click', selector: ... }`),
  redacts passwords automatically
- Self-healing: heuristic repair first (free), then an LLM (Groq → Gemini → OpenRouter →
  OpenAI fallback chain) diagnoses the live DOM and suggests a replacement locator — healed
  locators persist to the database so the *next* run starts from the fix, not the break
- Execution on Chromium via a BullMQ queue + worker, with trace+video captured on failing
  runs (screenshot captured on every run, for visual-diffing) — kept to one browser engine
  to keep the deployed image lightweight (~300MB vs. ~2.4GB for all three)
- "Export as Playwright Code" — turns the stored step-list into real, runnable
  `page.locator()`/`expect()` TypeScript
- Suites (group tests, batch run) and Schedulers (cron via BullMQ repeatable jobs)
- API testing: request builder with method/headers/body, executed and validated by status code
- Reports (aggregated run history + heal counts across the project)

**Present but intentionally minimal:**
- The NLP "plain English → Playwright code" step editor described in the original spec was
  **not** built — the LLM integration that exists (self-healing's locator repair) reuses the
  same provider chain and would be the natural place to add it, but it's a distinct feature
  that needs its own prompt design and step-insertion UI.
- "Components" and "Uploads" are placeholder pages (say so in the UI) — they were nav items
  in the spec with no functional detail given beyond the label.
- No file-upload support in Web tests, no visual regression / screenshot diffing.
- Single environment's variables aren't yet interpolated into test URLs/API requests
  (`{{baseUrl}}`-style templating) — the data model supports it, the substitution step doesn't
  exist yet.
- No AI test-data generation (`{{faker.email}}` etc.).

## Architecture

```
backend/    NestJS + Prisma (Postgres) + BullMQ (Redis)
  src/
    auth/            JWT register/login
    projects/        Project CRUD, ownership checks
    environments/     Environments + key/value variables
    test-modules/     "Test Module" dropdown values
    tests/            Core Test entity (Web or API)
    recording/        Spawns Playwright Codegen, parses output -> steps, materializes Locators
    execution/        BullMQ processor: generates a runnable spec from steps+locators,
                       runs it with tracing/video always on, persists heals back to Locator
      runtime/         The self-healing engine (heuristic + LLM), inlined into generated specs
    export/           Steps -> production Playwright code
    suites/           Group tests, batch-run
    schedulers/       Cron via BullMQ repeatable jobs
    api-testing/      Ad-hoc "try it out" HTTP sender
    llm/              Groq -> Gemini -> OpenRouter -> OpenAI fallback chain

frontend/   React + TypeScript + Vite + Zustand + Tailwind
  src/
    layout/           Sidebar (matches the spec's nav tree), Topbar (Project/Environment)
    pages/            NewTest, TestDetail, Suites, Schedulers, Variables, Locators, Reports,
                       ApiTesting, Settings, Dashboard, Login
```

### Why self-healing is architected the way it is

Execution runs in a **separate spawned process** (`npx playwright test`), not inside the
NestJS process. Rather than have that child process import a sibling TypeScript module by
path — fragile, since the path differs between `ts-node` dev mode and compiled `dist/`
production mode — `execution/generate-runnable-spec.ts` inlines the entire healing runtime as
source text directly into each generated spec file. Self-contained generated files, no
cross-process module resolution to get wrong.

Heal events write to a JSON file the spawned process can reach
(`tmp/execution/<runId>/heal-events.json`); the NestJS process reads it back after the child
exits and persists `HealEvent` rows + updates the `Locator` row so the improvement compounds
across runs.

## Local development (no Docker)

Requires Postgres and Redis running locally.

```bash
# 1. Database
createdb testora   # or: psql -c "CREATE DATABASE testora"

# 2. Backend
cd backend
cp .env.example .env   # fill in DATABASE_URL, REDIS_HOST/PORT, at least one LLM key
npm install
npx playwright install chromium
npx prisma migrate dev
npm run start:dev      # http://localhost:4100/api (see PORT in .env)

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev             # http://localhost:5175
```

## Docker Compose

```bash
cp .env.example .env    # fill in secrets
docker compose up --build
```

This starts Postgres, Redis, the backend (Chromium + its OS dependencies installed on a
slim Node image), and the frontend (built + served via nginx).

- Frontend: http://localhost:5175
- Backend API: http://localhost:4000/api

> If port 4000/5432/6379 are already used by something else on your machine, change the
> host-side port in `docker-compose.yml` (left side of `"host:container"`) — the services
> talk to each other over the compose network regardless of host port mappings.

## Environment variables

See `.env.example`. The only ones that matter for self-healing and the future NLP editor are
the LLM provider keys — **at least one** should be set (`GROQ_API_KEY` is checked first, then
`GEMINI_API_KEY`, then `OPENROUTER_API_KEY`, then `OPENAI_API_KEY`). With none set, self-healing
still works via the heuristic step alone; it just can't fall through to an LLM-diagnosed repair.

## API reference (selected endpoints)

All routes are prefixed `/api` and (except `/auth/*`) require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | Get a JWT |
| GET/POST | `/projects` | List / create projects |
| GET/POST | `/projects/:id/environments` | List / create environments |
| POST | `/projects/:id/environments/:envId/variables` | Upsert a variable |
| GET/POST | `/projects/:id/test-modules` | List / create test modules |
| GET/POST | `/projects/:id/tests` | List / create a test (Web or API) |
| POST | `/projects/:id/tests/:testId/recording/start` \| `/stop` | Codegen recording |
| GET | `/projects/:id/tests/:testId/export/playwright` | Export as Playwright code |
| POST | `/projects/:id/tests/:testId/runs` | Queue a run (`{ browser }`) |
| GET | `/projects/:id/tests/:testId/runs` | Run history + heal events |
| GET/POST | `/projects/:id/suites` | List / create suites |
| POST | `/projects/:id/suites/:suiteId/run` | Run every test in a suite |
| POST/DELETE | `/projects/:id/suites/:suiteId/scheduler` | Set/remove a cron schedule |
| POST | `/api-testing/send` | Ad-hoc HTTP request (try before saving) |
| GET | `/llm-status` | Which provider is active |

## Known limitations worth knowing before relying on this

- `cron-parser@4.x` is used (the pinned version is EOL upstream; v5 changed its API — this
  was a deliberate choice to keep the simpler, stable `parseExpression` API rather than
  chase a breaking major version during initial development).
- The BullMQ queues (`execution`, `scheduler`) have no dead-letter handling or retry/backoff
  policy configured beyond BullMQ's defaults — a crashed worker mid-run leaves that `Run` row
  stuck at `RUNNING` rather than being reconciled.
- No rate limiting or request throttling on any endpoint.
- Codegen recording assumes the backend process can open a real browser window — this works
  for local/dev use but would need a different approach (e.g. a headed browser in a
  VNC-accessible container) for a genuinely remote-hosted deployment.
