/**
 * Postgres client (Neon serverless driver, via Vercel's native Neon
 * integration). Replaces the old node:sqlite store — see lib/store/*.ts.
 *
 * Connection string resolution: DATABASE_URL (pooled, set by the Vercel
 * integration) falling back to POSTGRES_URL (legacy/back-compat name).
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

declare global {
  var __ctSql: NeonQueryFunction<false, false> | undefined;
  var __ctSchemaReady: Promise<void> | undefined;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "No Postgres connection string found (DATABASE_URL or POSTGRES_URL). " +
        "Provision a Postgres database for this project in the Vercel dashboard " +
        "(Storage tab -> Create Database -> Postgres), then run " +
        "`vercel env pull .env.local` to bring the connection string into local dev."
    );
  }
  return url;
}

/**
 * Lazily creates the Neon client on first real use (not at module load) so
 * that `next build`'s page-data collection doesn't require a live
 * DATABASE_URL to be set. Cached on globalThis, same pattern the old
 * node:sqlite getDb() used.
 */
export function getSql(): NeonQueryFunction<false, false> {
  if (!globalThis.__ctSql) {
    globalThis.__ctSql = neon(connectionString());
  }
  return globalThis.__ctSql;
}

async function createSchema() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      tag TEXT,
      auth_type TEXT NOT NULL DEFAULT 'clientCredentials',
      authority TEXT,
      audience TEXT,
      client_id TEXT,
      secret_enc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_environments_user ON environments(user_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_migrations_user ON migrations(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_migrations_created ON migrations(created_at DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS migration_logs (
      id BIGSERIAL PRIMARY KEY,
      migration_id TEXT NOT NULL REFERENCES migrations(id) ON DELETE CASCADE,
      entry JSONB NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_migration_logs_migration ON migration_logs(migration_id, id)`;
}

/** Runs the schema DDL once per process (cached on globalThis, same pattern the old getDb() used). */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__ctSchemaReady) {
    globalThis.__ctSchemaReady = createSchema();
  }
  return globalThis.__ctSchemaReady;
}
