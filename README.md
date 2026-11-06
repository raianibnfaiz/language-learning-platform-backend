# lingbloomtalk-api

REST API for **LingBloomTalk** (web + Flutter): accounts, the learner's progress as the source of truth,
offline-first sync, and the learning content (54 languages, 7 situations, 773 phrases, 5 career languages).

Node.js 22 · Express 5 · TypeScript (strict) · MongoDB 7 (replica set) · Mongoose 8 · Zod · Vitest

## Quick start

```bash
cp .env.example .env              # then set JWT_ACCESS_SECRET (≥ 32 bytes)
docker compose up -d mongo        # MongoDB 7 single-node replica set
npm ci && npm run migrate:up      # collections + indexes
npm run seed                      # 54 languages, 7 situations, 773 phrases, 5 career languages, 30 lessons
npm run dev                       # http://localhost:4000/api/v1, docs at http://localhost:4000/api/docs
```

Or everything in containers: `docker compose up --build` (API, MongoDB, migrations + seed).
Add `--profile dev` for mongo-express on :8081. `npm run seed:dev-user` creates
`demo@lingbloomtalk.local` / `lingbloom-demo-pass` with some progress.

| Script                                |                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `dev` / `build` / `start`             | watch mode / compile to `dist/` / run compiled                            |
| `test`, `test:watch`, `test:coverage` | Vitest + Supertest against an in-memory MongoDB replica set               |
| `lint`, `typecheck`, `format`         | ESLint, `tsc --noEmit`, Prettier                                          |
| `seed`, `seed:dev-user`               | import `source-data/` (add `-- --dry-run` for a diff only) / demo learner |
| `migrate:up`, `migrate:down`          | apply / revert migrations in `src/db/migrations`                          |
| `openapi`                             | write `openapi.json` (CI fails if it's out of date)                       |
| `start:migrate`, `start:seed`         | the same, from `dist/` (used by the Docker image)                         |

## Architecture

```
               web (React)                    Flutter (iOS / Android)
         access token in memory           tokens in flutter_secure_storage
       refresh token: httpOnly cookie        refresh token: JSON body
                     │  local store + outbox of ops (IndexedDB / Hive) │
                     └──────────────► HTTPS /api/v1 ◄──────────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│ Express 5  requestId → pino-http → helmet → CORS → cookies → body limits   │
│            → clientInfo (X-Client / X-App-Version → 426) → rate limit       │
│ modules/   auth  users  content  progress  phrasebook  sync  admin  health  │
│            translation (phase 2 stub)  help (phase 2 stub)                  │
│            routes (defineRoute: Zod validation + OpenAPI) → service → model │
│ core/rules PURE game rules: levelFor, starsFor, streak, Leitner, XP table  │
│ content.store  in-memory snapshot of the content, reloaded on version bump │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ Mongoose (sanitizeFilter, transactions)
┌───────────────────────────────▼─────────────────────────────────────────────┐
│ MongoDB 7 replica set                                                       │
│ content: languages situations phrases careerLanguages contentMeta           │
│ learner: learnerStates dailyActivity phraseStates testScores favoriteWords  │
│          stateTombstones devices                                            │
│ ops:     users sessions emailTokens auditLogs syncOps stateImports          │
│          rateLimits translations translationUsage                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

Every learner write (direct endpoint, sync batch, import, reset) goes through **one path**: a MongoDB
transaction that first increments `learnerStates.stateVersion`. That write serialises concurrent batches
for the same user (the second one conflicts and is retried by the driver), so XP can never be lost or
double-counted, and every changed document is stamped with the new version for delta sync.

## Auth flow

|                  | Web (`X-Client: web`, default)                                                                                         | Mobile (`X-Client: ios` / `android`)  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| login / register | `{ user, accessToken }` + `Set-Cookie: lbt_rt=…; HttpOnly; SameSite=Strict; Path=/api/v1/auth`                         | `{ user, accessToken, refreshToken }` |
| refresh          | `POST /auth/refresh` with the cookie **and** `X-Requested-With: lingbloomtalk` (Origin checked against `CORS_ORIGINS`) | `POST /auth/refresh { refreshToken }` |
| storage          | access token in memory only                                                                                            | `flutter_secure_storage`              |

- Access token: JWT, 15 min, HS256 (or RS256/EdDSA with `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`), claims `sub, role, tv, sid, iss, aud`.
- Refresh token: 256-bit opaque, 30 days, stored only as SHA-256, **rotated on every use**. Presenting an
  already-rotated token revokes the whole family and logs `refresh_reuse_detected`.
- `POST /auth/logout-all` and password changes bump `tokenVersion` → every access token gets `401 TOKEN_REVOKED`.
- Passwords: argon2id (19 MiB, t=2, p=1), 8–128 chars, common-password list, 5 failures → 15 min lock.
- Email verification (24 h) is optional for learning; password reset (30 min, single use) needs a verified
  email (unverified accounts get a verification link instead). Forgot-password always answers 202.
- Guests: the apps work without an account. On first sign-in they call `POST /sync/import` once.

## Sync protocol

Clients write locally first and push an outbox. Toggles are always sent as absolute values.

```http
POST /api/v1/sync
Authorization: Bearer …
X-Client: ios
X-Timezone: Asia/Dhaka

{ "deviceId": "6f1c…", "timezone": "Asia/Dhaka", "sinceVersion": 812,
  "ops": [
    { "opId": "0195f2c3-…", "type": "phrase.heard", "occurredAt": "2026-11-06T08:10:00.000Z",
      "localDay": "2026-11-06", "payload": { "key": "spanish:hello" } },
    { "opId": "0195f2c3-…", "type": "test.recorded", "occurredAt": "2026-11-06T08:14:00.000Z",
      "localDay": "2026-11-06", "payload": { "langId": "spanish", "situationId": "first-words", "test": 1,
      "correct": 5, "total": 6, "missed": ["spanish:please"], "comboBonuses": 1 } },
    { "opId": "0195f2c3-…", "type": "phrase.favorite", "occurredAt": "2026-11-06T08:15:00.000Z",
      "localDay": "2026-11-06", "payload": { "key": "spanish:hello", "value": true } }
  ] }
```

```jsonc
{ "data": {
    "results": [
      { "opId": "…", "status": "applied", "xpDelta": 2, "result": { "firstTime": true, "xpAwarded": 2 } },
      { "opId": "…", "status": "applied", "xpDelta": 30, "result": { "stars": 2, "bestStars": 2, "nextTestUnlocked": true } },
      { "opId": "…", "status": "applied", "xpDelta": 0, "result": { "favorite": true } } ],
    "stateVersion": 813,
    "changes": { "full": false, "since": 812, "progress": { … }, "phrasebook": { "phrases": { "spanish:hello": { "heard": true, "favorite": true, "note": "", "review": null } }, … } },
    "derived": { "xp": 1290, "level": 6, "streak": 4, "todayXp": 37, "dueCount": 9 } } }
```

| type                                  | payload                                                                         | merge rule                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `phrase.heard`                        | `{ key }`                                                                       | set union, +2 XP only if new on the server                                                         |
| `phrase.speak`                        | `{ key, score }`                                                                | +5 if score ≥ 0.7                                                                                  |
| `phrase.note`                         | `{ key, note }`                                                                 | last writer wins by `occurredAt` (empty deletes)                                                   |
| `phrase.favorite` / `word.favorite`   | `{ key, value }` / `{ langId, word, value }`                                    | LWW                                                                                                |
| `test.recorded`                       | `{ langId, situationId, test, correct, total, answers?, missed, comboBonuses }` | unlock checked, stars = max, missed → review box 0, XP = `correct × XP.TEST[n] + comboBonuses × 5` |
| `review.add` / `review.answer`        | `{ keys }` / `{ key, knewIt }`                                                  | box 0 due `localDay` / Leitner on the server's card, stale answers ignored                         |
| `lesson.complete` / `lesson.bookmark` | `{ lessonId, value }`                                                           | LWW, ±50 XP only on a real change                                                                  |
| `practice.answered`                   | `{ correct, total }`                                                            | +10 per correct, total ≤ 20                                                                        |
| `language.visit`                      | `{ langId }`                                                                    | merged into `recent` by `occurredAt`, max 6                                                        |
| `prefs.update`                        | `{ theme?, haptics? }`                                                          | LWW                                                                                                |

- **Idempotent**: `(userId, opId)` is unique; replays return `duplicate` with the original result.
- **Atomic**: one transaction and one `stateVersion` bump per batch; a batch where nothing applied gives the bump back.
- **Rejected ops never block the rest**: drop them from the outbox and refresh from `changes`.
- **Days** are the learner's local day: `localDay` must be within today ±1 in the timezone; ops created
  offline (`occurredAt` > 1 h ago) may be up to 30 days old. Daily XP above `MAX_DAILY_XP` is flagged in `auditLogs`, not blocked.
- `GET /me/state/changes?since=` returns `{ full: true, … }` (a full snapshot) after a reset / replace import, or when `since` predates compacted tombstones.
- `POST /sync/import` (guest → account): `merge` (default) or `replace-server`; untouched demo seed data is
  ignored; invalid keys are dropped and listed in `meta.dropped`; idempotent per device.

## Error codes

Errors are `{ "error": { "code", "message", "details"?, "requestId" } }`. Clients switch on `code`.

| code                                | HTTP            | when                                                                                   |
| ----------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`                  | 400 / 413 / 422 | bad shape (400), body too large (413), impossible numbers like `correct > total` (422) |
| `UNAUTHENTICATED`                   | 401             | missing / invalid token, unknown refresh token                                         |
| `TOKEN_EXPIRED`                     | 401             | access token expired → refresh once and retry                                          |
| `TOKEN_REVOKED`                     | 401             | logout-all, password change, device removed, refresh reuse                             |
| `INVALID_CREDENTIALS`               | 401             | wrong email/password (same answer for unknown emails)                                  |
| `FORBIDDEN`                         | 403             | not an admin, missing CSRF header / bad Origin                                         |
| `ACCOUNT_LOCKED`                    | 403             | 5 failed logins, `details.retryAfterSeconds`                                           |
| `NOT_FOUND`                         | 404             | unknown route, language, session…                                                      |
| `SITUATION_UNAVAILABLE`             | 404 / 422       | "coming soon" situation (404 on content reads, 422 on writes)                          |
| `CONFLICT` / `EMAIL_TAKEN`          | 409             | duplicate value / second import without `strategy`                                     |
| `TEST_LOCKED`                       | 422             | test n needs ≥ 1 star on test n-1                                                      |
| `UNKNOWN_PHRASE` / `UNKNOWN_LESSON` | 422             | key or lesson id not in the content                                                    |
| `DAY_OUT_OF_RANGE`                  | 422             | `localDay` outside the accepted window                                                 |
| `UPGRADE_REQUIRED`                  | 426             | `X-App-Version` below `MIN_APP_VERSION_<client>`                                       |
| `RATE_LIMITED`                      | 429             | rate limit or translation quota                                                        |
| `NOT_ENABLED`                       | 501             | translation / server-side help bot (phase 2)                                           |
| `INTERNAL`                          | 500             | anything else (details only in logs)                                                   |

## Content and caching

Content endpoints are public and send `ETag: "c<version>-<hash>"` + `Cache-Control: public, max-age=300,
stale-while-revalidate=86400`; send `If-None-Match` to get a 304. Clients keep their bundled content as
the offline fallback and refresh from `GET /content/bundle` when `GET /content/version` changes.
Learner endpoints are always `Cache-Control: no-store`.

### How to add a new language or situation

1. Edit the client content files and copy them, unchanged, into `source-data/` (`catalog.ts` for a
   language, `phrases.ts` for texts and situations, `languages.ts` for career languages/lessons).
2. Update `EXPECTED_COUNTS` in `src/db/seed/seed.ts` if the totals change.
3. `npm run seed -- --dry-run` to see the diff, then `npm run seed` (or `POST /admin/content/reseed`
   with `{ "dryRun": false }`). Docs are upserted by id, stale docs removed, and `contentMeta.version`
   bumps only if the content hash changed.
4. Running instances reload the content within a minute; clients see the new `/content/version`,
   download `/content/bundle` and keep working offline with it.

## Operations

- `GET /health` (liveness, no DB) and `GET /ready` (pings Mongo). SIGTERM stops accepting connections,
  finishes in-flight requests, then closes Mongo (forced exit after 15 s).
- Structured JSON logs (pino) with `requestId`, `userId`, `client`, `appVersion`, route and latency; secrets,
  cookies, tokens, passwords and note contents are redacted.
- Scheduled jobs (`JOBS_ENABLED`): purge accounts 7 days after deletion (daily), compact tombstones older
  than 90 days (weekly), reload content when its version changes (every minute). `syncOps` expire after 90 days, `auditLogs` after 180.
- Production: `autoIndex` is off; run `npm run start:migrate` (the compose `migrate` service does it).
- Rate limits (Mongo store, shared between instances): auth 10/min per IP and 5/min per email,
  refresh 30/min, sync 30/min per user, everything else 300/min per user.

## Notes and assumptions

- Game rules live in `src/core/rules` and are covered 100% by unit tests. Numbers match §4 of the spec.
- Phrase-key/lesson existence is checked in the services (not in Zod) so the error is `UNKNOWN_PHRASE` /
  `UNKNOWN_LESSON` rather than a generic validation error.
- `source-data/` holds the web app's content files unchanged. The seed calls the web's own `phrasesFor()`
  so phrase expansion is identical, and `wordPieces` / search `normalize` mirror the web's `words()` /
  `normalize()` in `src/lib/text.ts`.
- `needsPractice` in `/me/progress/languages` is "has review cards due"; `nextSituation` is the first
  available situation with unheard phrases, then the first without all 12 stars.
- See `CLIENT_INTEGRATION.md` for the web fetch wrapper and the Flutter dio interceptor.
