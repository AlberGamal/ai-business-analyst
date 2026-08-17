# Local development on Windows and VS Code

Open the repository folder in VS Code and use its integrated PowerShell terminal. Install Node.js 22 LTS, Docker Desktop, and Git. Run `npm install --global corepack@latest`, then `corepack enable` and `corepack install`; this activates the version of pnpm pinned by this repository.

## Native workflow

Copy `local.env.template` to `.env`, configure the values, run `pnpm install --frozen-lockfile`, start `docker compose up -d db`, then run `pnpm db:migrate` and `pnpm dev`. The Express server hosts both the API and Vite-powered React application at `http://localhost:3000`.

## All-container workflow

Run `docker compose up --build`. The `db` service uses MySQL 8.4 and stores data in the `mysql_data` volume. The `app` service uses the same source, runs committed migrations, and stores uploaded datasets in `uploads_data`. Stop without deleting data with `docker compose down`.

## Local authentication

The sign-in form is intentionally local-development-only and uses `LOCAL_AUTH_EMAIL` plus `LOCAL_AUTH_PASSWORD`. It creates a signed httpOnly cookie with `JWT_SECRET`. No demo password is committed. This preserves authenticated user scoping locally but is not a production identity provider.

## Optional external OAuth migration

To use an external identity provider, add an authorization-code callback route (for example, at `/api/oauth/callback`), validate state/PKCE according to that provider’s documentation, upsert the user with a stable provider subject, then call `createSessionToken(openId, { name })` from the local session module and set `COOKIE_NAME` using `getSessionCookieOptions`. Register the route with the provider for local testing. The old managed provider is deliberately not bundled because it cannot run independently.

## Troubleshooting

If MySQL is unavailable, inspect `docker compose logs db` and verify your native `.env` `DATABASE_URL` password matches the local database. Docker Compose supplies its own internal URL to the application container. If a model call fails, verify `LLM_*`; the planner will record a bounded fallback and supported deterministic questions still execute against DuckDB. Leaving `LLM_API_KEY` blank intentionally selects that fallback behavior. Delete `data/uploads` only if you intentionally want to remove uploaded files.
