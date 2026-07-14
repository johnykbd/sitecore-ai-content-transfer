/**
 * SQLite database (built-in node:sqlite, requires Node.js >= 22.5).
 * Stores user accounts, sessions and encrypted environment profiles
 * for the fully-managed mode. Lives at data/app.db.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "app.db");

declare global {
  // eslint-disable-next-line no-var
  var __ctDb: DatabaseSync | undefined;
}

export function getDb(): DatabaseSync {
  if (globalThis.__ctDb) return globalThis.__ctDb;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
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
    );
    CREATE INDEX IF NOT EXISTS idx_environments_user ON environments(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  globalThis.__ctDb = db;
  return db;
}
