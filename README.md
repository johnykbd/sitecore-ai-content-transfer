# Sitecore Content Transfer App

A Next.js application for moving Sitecore content from one environment to another using the
[Content Transfer API](https://api-docs.sitecore.com/sai/content-transfer-api) (source) and the
[Item Transfer API](https://api-docs.sitecore.com/sai/item-transfer-api) (destination).

Every action of a migration is shown live in the UI. The app offers **two modes**:

## Two modes

### 1. One-time migration (`/one-time`) — zero persistence

No account needed. You paste the source & destination base URLs plus a **ready access token**
for each. Nothing is written to disk:

- Tokens and URLs live only in server memory for the duration of the run (auto-purged after 2h).
- Logs are kept in memory only — view them live during the run; they are **not saved**.
- No database rows, no log files, no migration records survive a restart.

### 2. Fully managed (register / sign in)

Register with email & password to unlock the full experience:

- **Accounts & sessions** — passwords hashed with scrypt; httpOnly cookie sessions (7-day TTL). Stored in Postgres (see [Database](#database) below).
- **Unlimited saved environments** — per user, with **either** OAuth client ID + secret **or** a whole access token. Secrets/tokens are encrypted at rest with **AES-256-GCM** (key from the `CT_SECRET_KEY` env variable) and never sent back to the browser.
- **Full migration history** — every migration and its complete log saved in Postgres, downloadable from the UI.
- **Legacy import** — if a `data/environments.json` file exists (pre-Postgres installs), the first account registered imports those environments (encrypted into the DB) and the file is renamed to `.imported`.

## Database

Fully-managed mode persists to **Postgres** via [`@neondatabase/serverless`](https://www.npmjs.com/package/@neondatabase/serverless) — a natural fit for Vercel, which provisions Postgres as a native Neon integration (Storage tab → Create Database → Postgres). Connection string resolution: `DATABASE_URL` (pooled, set by the integration), falling back to `POSTGRES_URL` (legacy name, also set for back-compat). Schema (`users`, `sessions`, `environments`, `migrations`, `migration_logs`) is created automatically on first use — no manual migration step needed.

For local development: provision the database in the Vercel dashboard, then run `vercel env pull .env.local` to bring `DATABASE_URL` into your local `.env.local` (or copy it manually from the dashboard).

One-time mode remains fully in-memory (`lib/store/ephemeral.ts`) and never touches Postgres or disk.

## Features (both modes)

- **Live progress timeline** — the 9-step pipeline (validate → authenticate source/destination → create transfer → build package → download `.raif` → upload → consume → verify) updates in real time.
- **Item selection** — browse the source content tree (Authoring GraphQL), add items by path, optionally include descendants.
- **Options** — overwrite existing, include related items, publish after transfer, dry run.
- **Dry run mode** — walks the entire pipeline with full logging but no live Sitecore calls. Great for demoing the UI. The item picker also has a "demo tree" toggle.

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 and choose a mode from the landing page. Tip: run your first
migration with **Dry run** enabled. Fully-managed mode requires `DATABASE_URL` to be set —
see [Database](#database).

## How the transfer works

1. **Source (Content Transfer API)** — the app authenticates (OAuth client-credentials or your provided token), creates a transfer for the selected items, waits for the source to assemble the chunked `.raif` package, and downloads it.
2. **Destination (Item Transfer API)** — the package is uploaded, consumed into the destination content tree, and the consumption status is polled until complete. Transferred items are inspected for verification.

## Configuration

All Sitecore endpoint paths live in one place: `lib/sitecore/config.ts`. Because the official
docs at api-docs.sitecore.com define the exact routes for your product version, verify the
paths there and adjust if needed — each one can also be overridden with an environment variable:

| Variable | Default |
| --- | --- |
| `DATABASE_URL` | *(none — see [Database](#database))* Postgres connection string |
| `CT_SECRET_KEY` | *(none — see Security notes)* 64-hex-char AES-256 key for encrypting saved credentials |
| `SITECORE_AUTHORITY` | `https://auth.sitecorecloud.io` |
| `SITECORE_AUDIENCE` | `https://api.sitecorecloud.io` |
| `SITECORE_CT_BASE` | `/sitecore/api/content/transfer/v1` |
| `SITECORE_IT_BASE` | `/sitecore/api/item/transfer/v1` |
| `SITECORE_AUTHORING_GQL` | `/sitecore/api/authoring/graphql/v1` |
| `SITECORE_POLL_INTERVAL` | `3000` (ms) |
| `SITECORE_POLL_MAX_ATTEMPTS` | `200` |

> **Note:** using these APIs requires the Organization Admin or Organization Owner role in
> Sitecore Cloud, and credentials/tokens with access to both environments.

## Security notes

- Managed credentials are AES-256-GCM encrypted before being stored in Postgres. The key comes from the `CT_SECRET_KEY` environment variable (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). If unset in development, a key is auto-generated into `.env.local` (gitignored). A legacy `data/.secret.key` file is still honored for older installs. **Losing the key makes stored credentials unreadable.**
- All `.env*` files are gitignored — never commit them.
- API routes for environments and managed migrations require a valid session and enforce per-user ownership.
- One-time mode never persists tokens or logs; access tokens typically expire, so paste a fresh one per run.

## Project structure

```
app/                    Pages (landing/dashboard, login/register, one-time, environments,
                        wizard, history, detail) + API routes (incl. /api/auth, /api/onetime)
components/             UI components (shadcn-style) + timeline, log viewer, item tree
lib/sitecore/           API clients: auth (client-credentials or token), CT & IT APIs, browsing
lib/postgres.ts         Neon/Postgres client + lazy schema init (users, sessions, environments, migrations, migration_logs)
lib/crypto.ts           scrypt password hashing + AES-256-GCM encryption
lib/session.ts          Cookie sessions
lib/store/              environments (Postgres, encrypted), migrations/logs (Postgres), ephemeral (RAM)
lib/runner.ts           Migration pipeline orchestrator (managed + one-time, live + dry-run)
data/                   Only used for one-time legacy import of a pre-Postgres environments.json, if present
```
