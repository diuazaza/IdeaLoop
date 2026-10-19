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

Edit `.env` with your PostgreSQL credentials and set `JWT_SECRET` to a random secret of at least 32 characters. Generate one locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Then run:

```sh
npm run db:migrate
npm run dev
```

The API listens on `PORT` (default `5000`). `DATABASE_URL` is required. `NODE_ENV` must be `development`, `test`, or `production`. The API requires `JWT_SECRET`; migrations do not require it. S3 placeholders are reserved for future uploads.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API with automatic restart on edits |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server after building |
| `npm run typecheck` | Check types without generating output |
| `npm test` | Run HTTP and embedded PostgreSQL tests |
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
    migrations/              Schema and account-identity migrations
    run-sql.ts               Migration SQL execution helper
  controllers/               User CRUD, login, and input validation
  routes/                    User and authentication routes
  security/                  Password hashing and JWT helpers
  tests/                     Configuration, HTTP, and database integration tests
```

User CRUD and basic registration/login are implemented. Project/comment/request endpoints, uploads, password recovery, email verification, and the React frontend remain future work. Cross-origin frontend access is not configured yet; configure the allowed frontend origin when the client is introduced.

## Database

See [database setup and ERD](db/README.md). Prefer `npm run db:migrate` for new environments. The raw SQL schema is an alternative initialization method; do not apply both to the same database because they create the same tables without shared migration tracking.

Optional sample data, from the repository root:

```sh
psql -d idealoop_db -f db/seed.sql
```

Seed data assumes a fresh database and uses placeholder password hashes; these users are not usable login accounts. Database types are maintained manually alongside migrations. `updated_at` defaults only set insertion timestamps; future update operations must set it explicitly. Learning requests use `learner_id` and `creator_id` in the actual schema.


## User API

| Method | Endpoint | Access / result |
| --- | --- | --- |
| POST | `/api/users` | Register a user; returns 201 with `{ user, token }` |
| POST | `/api/auth/register` | Alias for user registration |
| POST | `/api/auth/login` | Email/password login; returns `{ user, token }` |
| GET | `/api/users?limit=20&offset=0` | Public profiles, ordered by ID; maximum limit 100 |
| GET | `/api/users/:id` | Public profile |
| GET | `/api/users/me` | Own profile including email; Bearer token required |
| PATCH | `/api/users/:id` | Partial update; account owner only |
| DELETE | `/api/users/:id` | Delete account; account owner only; returns 204 |

Registration accepts `username`, `email`, `password`, and optional `bio` and `avatar_url`. Usernames allow 3–50 letters, digits, or underscores. Passwords require 12–128 characters. Emails are trimmed and lowercased; uniqueness for emails and usernames is case-insensitive. Bio is limited to 2000 characters; avatar URLs must use HTTP(S), contain no credentials, and fit within 512 characters. Nullable profile fields can be cleared with `null`. Unsupported fields are rejected.

Example registration:

```sh
curl -i -X POST http://localhost:5000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"username":"maya_creates","email":"maya@example.com","password":"a-long-demo-password","bio":"Artist and maker"}'
```

Use the returned token for protected requests:

```sh
curl http://localhost:5000/api/users/me \
  -H "Authorization: Bearer YOUR_TOKEN"

curl -X PATCH http://localhost:5000/api/users/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"bio":"Building games and digital art"}'
```

Use the ID returned by registration in place of `1`. PATCH accepts `username`, `email`, `password`, `bio`, and `avatar_url`. Changing email or password also requires `current_password`. Password changes return a replacement token and invalidate all tokens signed for the previous password hash. Tokens expire after one hour; login again to obtain another token. Deleting an account invalidates its tokens and cascades deletion of its related projects, comments, skills, and requests through the existing foreign keys.

Passwords use salted scrypt hashes and are never returned. Public profile responses omit email; authenticated registration/login, `/me`, and update responses include only the owner's email. Validation errors return 400, invalid/missing credentials 401, ownership violations 403, unknown users 404, and duplicate identities 409.

Registration and login share an in-memory limit of 20 requests per IP per 15 minutes. Updates/deletions share a limit of 60 per IP per 15 minutes. Limits reset on restart; multi-instance deployments need a shared limiter store. When deploying behind a reverse proxy, configure Express trust settings for the actual trusted proxy before relying on per-client IP limits. Use HTTPS in deployment and keep JWT secrets out of source control.

Migration `005_user_identity` adds case-insensitive unique indexes without rewriting existing migrations. Existing databases with case-only duplicate usernames or emails must resolve those duplicates before applying it. The raw SQL alternative includes equivalent indexes in `db/modules/05_user_identity.sql`.

Tests run the real migrations and Kysely queries against in-memory PostgreSQL using PGlite. Coverage includes user CRUD, input validation, privacy, authentication, owner-only mutations, password-change token invalidation, duplicate/racing registrations, rate limits, cascading deletes, and the new migration's rollback. No external database is required for tests.
