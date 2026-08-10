# IELTSly API — Database & Implementation Document

This document is the complete implementation spec for the IELTSly backend (`IELTSly-API`). It describes the database schema, API routes, AI evaluation flow, question scraper, and analytics — everything needed to build the application data layer. Follow it exactly; where a decision is noted as "(decision needed)", pick the recommended option unless told otherwise.

---

## 1. Project Context

IELTSly is an IELTS **writing** practice app. Users write essays (Task 1 or Task 2), submit them, and receive an AI evaluation with an IELTS band score across the four official criteria:

- **TA** — Task Achievement
- **CC** — Coherence & Cohesion
- **LR** — Lexical Resource
- **GRA** — Grammatical Range & Accuracy

Two repositories:

| Repo | Stack | Port | Role |
|---|---|---|---|
| `IELTSly` | Next.js 16, React 19, framer-motion, better-auth client | 3000 | Frontend (UI only, all data currently mocked) |
| `IELTSly-API` | Express 5, TypeScript (tsx), Mongoose 9, MongoDB, better-auth (mongodbAdapter), `@ai-sdk/openai`, `llm-scraper` + `playwright` | 5000 | Backend API + database |

### Current backend state (what already exists)

- `src/server.ts` — Express app. Better-auth mounted at `/api/auth/*splat` BEFORE `express.json()`. Health check at `/health`. Error handler exists.
- `src/configs/auth.ts` — better-auth configured with `mongodbAdapter`, email+password, Google OAuth, cookie cache. **Do not modify auth behavior.**
- `src/configs/db.ts` — Mongoose connect to `MONGO_URI` (default `mongodb://localhost:27017/ieltsly`).
- `src/middleware/auth.middleware.ts` — `authenticate` middleware. Validates the better-auth session via `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`, attaches `req.user` / `req.session` (typed via `AuthRequest` in `src/types/express.types.ts`), returns `401` otherwise.
- `src/routes/` and `src/controllers/` — **empty. All new code goes here.**
- Conventions: ESM (`"type": "module"`), relative imports use explicit `.js` extension (e.g. `import { auth } from "../configs/auth.js"`), `tsx watch` for dev.

Better-auth creates these collections automatically on first run: `user`, `session`, `account`, `verification`. The `user` document id is a string (better-auth uses string `_id`).

---

## 2. Architecture Decisions (LOCKED — do not deviate)

1. **One document per attempt.** Every practice run or exam attempt is a separate `essay` document. Taking the same question 10 times = 10 independent documents.
2. **Evaluation is embedded** inside the essay document. One attempt = one evaluation. Never stored separately.
3. **Rework = a new essay document.** When a user reworks an already-evaluated essay, the API creates a NEW essay doc with a `reworkOf` field pointing to the original. The original is never mutated after evaluation.
4. **Hybrid question reference.** Each essay stores BOTH a `questionId` (reference to the `question` collection) AND an embedded `question` snapshot (text/category/imageUrl copied at attempt time). The snapshot keeps history immutable and reads join-free; the reference enables aggregation against the question bank.
5. **No daily-comments storage.** The "tutor comment of the day" is generated on demand by the analytics endpoint, produced by an AI call from the user's recent performance stats. Nothing is persisted.
6. **Draft saving is supported.** A half-written essay can be saved with status `in_progress` and resumed later. Saving a draft never triggers evaluation.
7. **TypeScript only, no zod.** Define schemas with Mongoose and derive types with `InferSchemaType`. Zod is intentionally deferred to a later phase.

---

## 3. Data Models

### 3.1 `essay` collection

File: `src/models/essay.model.ts` — collection name `essay` (singular, matching better-auth's singular collection naming).

```ts
enum EssayType { Task1 = "task1", Task2 = "task2" }
enum EssayMode { Practice = "practice", Exam = "exam" }
enum EssayStatus { InProgress = "in_progress", Submitted = "submitted", Evaluated = "evaluated" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `user` | ObjectId (ref `user`) | yes | The author. Indexed. |
| `type` | `"task1" \| "task2"` | yes | |
| `mode` | `"practice" \| "exam"` | yes | |
| `questionId` | ObjectId (ref `question`) | no | Nullable — user may paste their own prompt not in the bank. |
| `question.text` | string | yes | Snapshot copied from the bank at attempt time. |
| `question.category` | string | no | Snapshot, e.g. `"climate"`. |
| `question.imageUrl` | string | no | Snapshot — Task 1 chart/graph URL. |
| `response` | string | yes | Essay body. |
| `wordCount` | number | yes | Computed server-side from `response` at submit time. |
| `durationSec` | number | yes | Seconds spent writing. |
| `status` | `"in_progress" \| "submitted" \| "evaluated"` | yes | Default `in_progress`. |
| `reworkOf` | ObjectId (ref `essay`) | no | Set when this essay is a rework of a previous essay. |
| `evaluation.overallBand` | number | no | 0–9, e.g. 7.5. Present when `status === "evaluated"`. |
| `evaluation.criteria.ta` | number | no | |
| `evaluation.criteria.cc` | number | no | |
| `evaluation.criteria.lr` | number | no | |
| `evaluation.criteria.gra` | number | no | |
| `evaluation.feedback` | string | no | Free-form AI feedback paragraph. |
| `evaluation.tips` | string[] | no | 2–4 actionable improvement tips. |
| `evaluation.evaluatedAt` | Date | no | |
| `timestamps` | Date | — | Mongoose `timestamps: true` → `createdAt`, `updatedAt`. |

**Indexes (create explicitly in the model):**

```ts
schema.index({ user: 1, createdAt: -1 });         // history, analytics trend
schema.index({ user: 1, status: 1 });              // dashboard counts
schema.index({ user: 1, type: 1, createdAt: -1 }); // per-task stats
```

### 3.2 `question` collection (scraped question bank)

File: `src/models/question.model.ts` — collection name `question`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `taskType` | `"task1" \| "task2"` | yes | |
| `category` | string | no | Topic bucket, e.g. `"climate"`, `"technology"`. |
| `text` | string | yes | The question/prompt text. |
| `imageUrl` | string | no | Task 1 charts/graphs. |
| `source` | `"official" \| "scraped"` | yes | Where the question came from. |
| `sourceUrl` | string | no | Original page URL when scraped. |
| `timesUsed` | number | yes | Default 0. Increment by 1 whenever an essay references this question. |
| `timestamps` | Date | — | `timestamps: true`. |

**Dedup:** store a unique hash of normalized `text` in a `textHash` field with a **unique index**. On insert/upsert, compute `sha1(text.trim().toLowerCase())`; a duplicate insert must be caught and converted to `{ timesUsed: +1 }` on the existing doc instead.

```ts
schema.index({ textHash: 1 }, { unique: true });
schema.index({ taskType: 1 });
schema.index({ category: 1 });
```

### 3.3 `user` collection

Managed entirely by better-auth. **Do not create a Mongoose model for it.** If the app later needs per-user IELTS fields (e.g. `targetBand`, `targetExamDate`), add them to the better-auth user as custom fields via `user.additionalFields` in `src/configs/auth.ts` — NOT a new model. (Not required for this phase.)

---

## 4. API Routes

All routes live under `src/routes/`, protected by the existing `authenticate` middleware from `src/middleware/auth.middleware.ts`. Mount them in `src/server.ts` after `express.json()`, under the `/api` prefix.

Convention: controllers in `src/controllers/`, thin route files in `src/routes/`. Use async handlers with try/catch; pass errors to the Express error middleware (`next(err)`).

### 4.1 Essays — `src/routes/essay.routes.ts`

| Method | Path | Auth | Body / Query | Behavior |
|---|---|---|---|---|
| POST | `/api/essays` | yes | `{ type, mode, questionId?, question?, response, durationSec }` | Creates an essay. `status` defaults to `in_progress`. If `questionId` provided: validate it exists, copy snapshot, increment its `timesUsed`. `wordCount` computed from `response`. Returns `201` + full doc. |
| GET | `/api/essays` | yes | query: `type?`, `status?`, `mode?`, `page?` (default 1), `limit?` (default 10, max 50) | Lists the **current user's** essays, newest first. Returns `{ essays, page, limit, total }`. Every essay includes its embedded `evaluation` when present (no join needed). |
| GET | `/api/essays/:id` | yes | — | Single essay. **404 if the essay belongs to another user** (never leak). |
| PUT | `/api/essays/:id` | yes | partial: `{ response?, durationSec? }` | Updates a draft only. **Blocked with `409` if `status === "evaluated"`** — evaluated essays are immutable; a rework must be a NEW essay (see below). Recompute `wordCount`. |
| POST | `/api/essays/:id/evaluate` | yes | headers: `x-api-key`, `x-ai-provider` (`gemini` \| `openai`), optional `x-ai-model` | Runs AI evaluation (Section 5). Requires the user's own API key. `400` if key/provider missing or invalid. Sets `status: "evaluated"`, fills `evaluation`. Returns `200` + updated doc with evaluation. `502` if the AI call fails (essay status unchanged). |
| POST | `/api/essays/:id/rework` | yes | `{ response, durationSec }` | Creates a NEW essay doc: same `type`, `mode`, `questionId`, `question` snapshot as the source; `reworkOf: <source id>`; new `response`/`wordCount`/`durationSec`; `status: "in_progress"`. Returns `201` + the new doc. Increments the question's `timesUsed` again. |

Ownership rule everywhere: `Essay.find({ _id, user: req.user.id })` — derive the user id from `req.user` (the better-auth session user). Never trust ids from the request body for ownership.

### 4.2 Questions — `src/routes/question.routes.ts`

| Method | Path | Auth | Query | Behavior |
|---|---|---|---|---|
| GET | `/api/questions` | yes | `taskType?`, `category?`, `page?`, `limit?` | Lists question bank, `{ questions, page, limit, total }`. |
| GET | `/api/questions/:id` | yes | — | Single question. |
| POST | `/api/questions` | yes | body: `{ taskType, category?, text, imageUrl?, source }` | Insert with dedup (Section 3.2). `201` on new, `200` + existing doc when duplicate (timesUsed NOT incremented by manual insert — only by essay creation). |

### 4.3 Analytics — `src/routes/analytics.routes.ts`

| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/api/analytics` | yes | Computes and returns the user's aggregated stats + generated daily comment (Section 6). |

### 4.4 Scraping — `src/routes/scrape.routes.ts`

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/api/scrape/questions` | yes | Triggers a one-shot scrape of the configured source pages, upserts questions with dedup (Section 7). Returns `{ added, duplicates, failed }` counts. (Run manually; cron scheduling is out of scope.) |

## 5. AI Evaluation Flow

Triggered by `POST /api/essays/:id/evaluate`.

### Inputs
- The essay: `response`, `wordCount`, `type`, `mode`.
- The question: embedded `question.text`, `question.category`.

### Provider

The backend depends on `@ai-sdk/openai` and `@ai-sdk/google` (AI SDK v3). Use `generateObject` (structured output) for reliability.

**Bring-your-own-key (LOCKED):** Users always supply their own AI key — Gemini or OpenAI. The frontend stores the key locally (localStorage) and sends it with every AI request:

- `x-api-key` — the user's key (required).
- `x-ai-provider` — `"gemini"` or `"openai"` (required).
- `x-ai-model` — optional override; defaults `gemini-3.5-flash` / `gpt-4o-mini`.

**There is NO server-side key and NO fallback.** If the headers are missing or the provider is unknown, return `400`. Do NOT persist the key in the database. The same headers apply to the analytics daily-comment call; when absent, analytics falls back to a static template.

### Prompt contract

System prompt: an expert IELTS examiner. Ask the model to evaluate strictly against the official band descriptors for the four criteria:

1. **TA** — did they fully address all parts of the prompt, with a clear position?
2. **CC** — paragraphing, logical progression, cohesive devices without overuse.
3. **LR** — range and precision of vocabulary, natural collocation, no over-repetition.
4. **GRA** — range and accuracy of sentence structures, punctuation.

Scoring rules: each criterion 0–9, half-bands allowed (e.g. 6.5). `overallBand` = rounded average of the four criteria to the nearest half-band. For `exam` mode, enforce exam conditions in the prompt (stricter adherence). For `task1`, emphasize accurate data description and overview.

### Output schema (strict JSON via `generateObject`)

```ts
{
  overallBand: number,          // 0-9, half-band
  criteria: { ta: number, cc: number, lr: number, gra: number },
  feedback: string,             // 2-4 sentences, encouraging + specific
  tips: string[]                // 2-4 concrete, actionable tips tied to criteria
}
```

On success: set `status: "evaluated"`, fill `evaluation` (including `evaluatedAt: new Date()`), save. On AI failure: return `502` with `{ message: "Evaluation failed, please retry" }` — the essay stays `submitted` and can be re-attempted.

---

## 6. Analytics & Daily Comment

`GET /api/analytics` — compute over the current user's essays where `status === "evaluated"`, then generate a fresh daily comment. **Nothing is persisted; the comment is regenerated on every request.**

### Aggregations to return

```ts
{
  stats: {
    totalAttempts: number,
    evaluatedCount: number,
    averageBand: number,           // mean overallBand, rounded to 1dp
    task1Average: number,          // mean overallBand where type === "task1"
    task2Average: number,
    bestBand: number,
    inProgressCount: number,       // drafts
  },
  criteriaAverages: { ta: number, cc: number, lr: number, gra: number },  // 1dp each
  trend: [                         // last 10 evaluated essays, oldest->newest
    { id, date, band, type }
  ],
  improvements: [                  // rework chains showing progress
    { originalId, reworkId, fromBand, toBand, delta, date }
  ],
  dailyComment: {
    text: string,                  // e.g. "Congratulations! You achieved a score of 6.5. ..."
    tone: "positive" | "neutral" | "push",
  }
}
```

### Daily comment generation

Build a compact summary of the stats above (numbers only, no essay text) and call the same AI provider as Section 5 (user's key via `x-api-key` / `x-ai-provider` headers) with a prompt like: *"Act as an IELTS tutor. Based on this student's recent stats, write ONE encouraging paragraph (2–3 sentences) with one concrete focus area for today. Match the tone to whether they're improving (positive), steady (neutral), or declining (push)."* Return `text` and `tone`. If the user sent no key, or the AI call fails, fall back to a static template built from the stats (no hard failure).

---

## 7. Question Scraper

Uses `llm-scraper` + `playwright` (both already installed). Targeted at publicly available IELTS writing question collections (e.g. official sample pages, widely-mirrored question archives).

### Pipeline

1. Launch headless browser (playwright chromium).
2. Load each configured source page (configurable via a `SCRAPE_SOURCES` env var, comma-separated URLs; sensible default list baked into the scraper module).
3. Use `llm-scraper` to extract structured questions: `{ taskType, category?, text, imageUrl? }` per item.
4. For each extracted question: compute `textHash` (sha1 of trimmed lowercase text).
5. Upsert: if hash exists → skip (count as duplicate); else insert with `source: "scraped"`, `sourceUrl`.
6. Return `{ added, duplicates, failed }`.

### Robustness requirements

- Timeouts per page (e.g. 30s); a failing page is counted in `failed` and does not abort the batch.
- Guard against scraping junk: drop items with `text` shorter than 30 characters or missing `taskType`.
- Deterministic ordering: dedup within a single batch run so the same question appearing on two pages is inserted once and counted once.
- Never overwrite existing questions (upsert only adds new ones).

---

## 8. Implementation Order

Build in this order; each step is independently verifiable:

1. **Models** — `essay.model.ts`, `question.model.ts` (Section 3). Verify: `npm run dev` boots, collections + indexes created in MongoDB.
2. **Essay routes** — CRUD + evaluate + rework (Section 4.1). Verify with curl using a real session cookie (sign in first).
3. **Question routes** — list + create with dedup (Section 4.2).
4. **Analytics route** — aggregations with static daily-comment fallback first (Section 6), AI generation wired in after the evaluation flow works.
5. **Evaluation service** — AI evaluation (Section 5). Verify: submit essay → evaluate → doc has `status: "evaluated"` + full evaluation.
6. **Scraper** — scrape module + route (Section 7). Verify: run once against one source page, expect `added > 0`, run again, expect `duplicates > 0` and `added === 0`.
7. **Frontend wiring** (separate repo, after backend is stable) — replace mock data in `app/dashboard/*` with calls to these endpoints.

### Verification checklist (run before declaring done)

- [ ] `npm run build` passes with zero TypeScript errors.
- [ ] `authenticate` middleware guards every route; unauthenticated requests get `401`.
- [ ] Cross-user access attempts return `404` (not the essay).
- [ ] Evaluating an already-evaluated essay does not corrupt the doc (idempotent or 409 — pick 409: rework instead).
- [ ] Duplicate question insert increments `timesUsed` on the existing doc instead of creating a second doc.
- [ ] Rework creates a new doc with correct `reworkOf` and leaves the original untouched.
- [ ] Analytics returns all fields from Section 6; daily comment generated (or static fallback) every request.

---

## 9. Environment Variables (add to `.env` / document in `.env.example`)

| Var | Purpose |
|---|---|
| `SCRAPE_SOURCES` | Comma-separated URLs for the question scraper. |
| `FRONTEND_URL` | Already used for CORS / trustedOrigins. |
| `BETTER_AUTH_URL` | Already used. |
| `MONGO_URI` | Already used. |

Note: there is intentionally NO `OPENAI_API_KEY` / `GEMINI_API_KEY` — AI calls use the user's own key, sent per request.

---

## 10. Open Decisions (for the product owner)

1. **Scrape source list** — which question archive sites to target; must be public / legally fine to mirror.
2. **Rate limits** — recommend a simple per-user limit on `/evaluate` (e.g. 10/day) to protect users' own key budgets; not implemented in this phase unless requested.
