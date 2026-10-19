# IdeaLoop

IdeaLoop lets creatives share projects across coding, art, music, writing, and crafts, discover work through tags and skills, and connect through learning and collaboration requests.

This repository currently contains the Express + TypeScript backend and PostgreSQL schema. Backend source lives in root `src/`; the `client/` and `server/` split in the project structure reference has not been introduced.

## Local setup

Requires Node.js 22 or later and a running PostgreSQL instance.

```sh
npm ci
cp .env.example .env
createdb idealoop_db
```

Edit `.env` with your PostgreSQL credentials, then run:

```sh
npm run db:migrate
npm run dev
```

The API listens on `PORT` (default `5000`). `DATABASE_URL` is required. `NODE_ENV` must be `development`, `test`, or `production`. JWT and S3 placeholders are reserved for future features and are not currently used.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API with automatic restart on edits |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server after building |
| `npm run typecheck` | Check types without generating output |
| `npm test` | Run backend tests without a database |
| `npm run db:migrate` | Apply pending Kysely migrations |

## Health endpoints

- `GET /api/health`: liveness; returns HTTP 200 independently of the database.
- `GET /api/health/ready`: executes a database query; returns HTTP 200 when connected or HTTP 503 when unavailable. This checks connectivity, not whether migrations have been applied.

```sh
curl http://localhost:5000/api/health
curl http://localhost:5000/api/health/ready
```

JSON request bodies are limited to 1 MB. Unknown routes and errors return `{ "error": { "message": "..." } }`. Production responses hide internal server error details. SIGINT and SIGTERM stop incoming connections and close the database pool; shutdown has a ten-second deadline.

## Backend structure

```text
src/
  app.ts                     Express app factory and health endpoints
  server.ts                  HTTP listener and graceful shutdown
  config/env.ts              Environment parsing and validation
  middleware/errorHandler.ts JSON errors and unknown-route handling
  db/
    connection.ts            PostgreSQL pool and typed Kysely connection
    types.ts                 Database types matching the migrations
    migrate.ts               Kysely migration runner
    migrations/              Four database modules
    run-sql.ts               Migration SQL execution helper
  tests/backend.test.ts      Configuration and HTTP integration tests
```

Authentication, business routes/controllers, uploads, and the React frontend remain future work. Cross-origin frontend access is not configured yet; configure the allowed frontend origin when the client is introduced.

## Database

See [database setup and ERD](db/README.md). Prefer `npm run db:migrate` for new environments. The raw SQL schema is an alternative initialization method; do not apply both to the same database because they create the same tables without shared migration tracking.

Optional sample data, from the repository root:

```sh
psql -d idealoop_db -f db/seed.sql
```

Seed data assumes a fresh database and uses placeholder password hashes; these users are not usable login accounts. Database types are maintained manually alongside migrations. `updated_at` defaults only set insertion timestamps; future update operations must set it explicitly. Learning requests use `learner_id` and `creator_id` in the actual schema.
