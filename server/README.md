# MongoLingo Server

A tiny [Vercel](https://vercel.com) serverless backend that registers learners and
orchestrates the MongoLingo leaderboard, backed by **MongoDB Atlas**.

The MongoLingo frontend is a static site hosted on GitHub Pages. This backend is a
**separate origin**, so all endpoints emit CORS headers and answer preflight requests.
The frontend calls it only if you point it at this server's URL — otherwise the app
works exactly as before with its built-in stub leaderboard.

## Endpoints

| Method | Path                | Body / Query                                  | Description |
|--------|---------------------|-----------------------------------------------|-------------|
| GET    | `/api/health`       | —                                             | Health + DB ping |
| POST   | `/api/register`     | `{ userId, name, company?, pack?, eventId? }` | Upsert a player (and join an event) |
| POST   | `/api/leaderboard`  | `{ userId, xp, leaves?, streak?, pack?, eventId? }` | Update score, returns rank (+ event rank) |
| GET    | `/api/leaderboard`  | `?pack=general&limit=10`                      | Top players (latest XP wins) |
| GET    | `/api/leaderboard`  | `?event=<eventId>&limit=10`                   | Event leaderboard |
| GET    | `/api/events`       | `?id=<eventId>`                               | Resolve an invite link (public) |
| GET    | `/api/events`       | — (admin)                                     | List events |
| POST   | `/api/events`       | `{ name, eventId?, pack?, startsAt?, endsAt? }` (admin) | Create an event |

Admin endpoints require `Authorization: Bearer <ADMIN_KEY>`. If `ADMIN_KEY` isn't set,
event creation is disabled (503).

### Event leaderboards & invite links

Each event has **exactly one invite URL**, keyed by its unique `eventId` slug:

```
https://mongodb-developer.github.io/MongoLingo/?event=<eventId>
```

- **Create** an event from the in-app admin page (`<app url>?admin`, enter the
  `ADMIN_KEY`) or via curl (below). The slug is auto-generated from the name unless
  you pass `eventId`; duplicates are rejected (409).
- **Join:** anyone opening the link is prompted to join (new learners see it on the
  landing screen). A player belongs to one event at a time; joining another replaces it.
- **Scoring:** event XP = XP earned *after joining* (a baseline is snapshotted on join),
  so veterans don't start ahead. Event scores never decrease, and only count while the
  event is live (`startsAt` ≤ now ≤ `endsAt`, both optional).
- **`pack` (optional)** locks everyone to one assignment so scores are comparable.

### Data model

```js
// players — global record, one per browser
{ userId, name, company, pack, xp, leaves, streak, createdAt, updatedAt }
// events — admin-created
{ eventId, name, pack, startsAt, endsAt, createdAt }
// event_scores — one per (eventId, userId)
{ eventId, userId, name, company, xp, leaves, streak, totalXp,
  baselineXp, baselineLeaves, joinedAt, updatedAt }
```

Indexes: `players` unique `{ userId: 1 }` + `{ pack: 1, xp: -1 }`; `events` unique
`{ eventId: 1 }`; `event_scores` unique `{ eventId: 1, userId: 1 }` + `{ eventId: 1, xp: -1, updatedAt: 1 }`.

## Local development

```bash
cd server
npm install

# create .env from the template and fill in your Atlas URI
cp .env.example .env
# edit .env -> MONGODB_URI=...

# one-time: authenticate and link the folder to a Vercel project
npx vercel login
npx vercel link --yes

# run the Vercel dev server (serves /api/* on http://localhost:3000)
npm start            # == vercel dev
```

Then test:

```bash
curl http://localhost:3000/api/health

curl -X POST http://localhost:3000/api/register \
  -H 'Content-Type: application/json' \
  -d '{"userId":"u1","name":"Ada Lovelace","company":"Acme","pack":"general"}'

curl -X POST http://localhost:3000/api/leaderboard \
  -H 'Content-Type: application/json' \
  -d '{"userId":"u1","xp":1240,"leaves":8,"streak":5}'

curl "http://localhost:3000/api/leaderboard?pack=general&limit=10"

# create an event (admin) and use its invite link: <app url>?event=mdb-local-nyc
curl -X POST http://localhost:3000/api/events \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer YOUR_ADMIN_KEY' \
  -d '{"name":"MongoDB.local NYC","eventId":"mdb-local-nyc","endsAt":"2026-12-31T23:59:00Z"}'

curl "http://localhost:3000/api/leaderboard?event=mdb-local-nyc"
```

> `vercel dev` reads `.env` automatically and serves the functions on port 3000,
> closely matching the production runtime (including the CORS preflight handling).
> Linking the folder to a Vercel project (`vercel link`) is required before `vercel dev`
> will start.

## Deploy

```bash
cd server
vercel            # first deploy / preview
vercel --prod     # production
```

Set environment variables in the Vercel dashboard (Project → Settings → Environment Variables):

- `MONGODB_URI` — your Atlas SRV connection string
- `MONGODB_DB` — `mongolingo` (optional)
- `ALLOWED_ORIGIN` — `https://mongodb-developer.github.io` (lock CORS in production)
- `ADMIN_KEY` — long random secret that allows creating events (e.g. `openssl rand -hex 24`)

## Deployed instance

Production: **https://mongolingo-backend.vercel.app** (env vars set in the Vercel
dashboard, `ALLOWED_ORIGIN` locked to `https://mongodb-developer.github.io`).

## Wiring the frontend

The frontend points at this server via `window.MONGOLINGO_API_BASE` in `index.html`:

```html
<script>window.MONGOLINGO_API_BASE = 'https://mongolingo-backend.vercel.app/api';</script>
```

The leaderboard screen falls back to its stub data if the API is unset or unreachable,
so GitHub Pages keeps working regardless.
