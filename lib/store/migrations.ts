import type { LogEntry, Migration } from "../types";
import { ensureSchema, getSql } from "../postgres";

export async function listMigrations(userId?: string): Promise<Migration[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (userId
    ? await sql`SELECT data FROM migrations WHERE user_id = ${userId} OR user_id IS NULL ORDER BY created_at DESC`
    : await sql`SELECT data FROM migrations ORDER BY created_at DESC`) as { data: Migration }[];
  return rows.map((r) => r.data);
}

export async function getMigration(id: string): Promise<Migration | undefined> {
  await ensureSchema();
  const rows = (await getSql()`SELECT data FROM migrations WHERE id = ${id}`) as {
    data: Migration;
  }[];
  return rows[0]?.data;
}

export async function saveMigration(migration: Migration) {
  await ensureSchema();
  await getSql()`
    INSERT INTO migrations (id, user_id, data, created_at)
    VALUES (${migration.id}, ${migration.userId ?? null}, ${JSON.stringify(migration)}, ${migration.createdAt})
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
  `;
}

export async function appendLog(migrationId: string, entry: LogEntry) {
  await ensureSchema();
  await getSql()`
    INSERT INTO migration_logs (migration_id, entry) VALUES (${migrationId}, ${JSON.stringify(entry)})
  `;
}

export async function readLogs(migrationId: string): Promise<LogEntry[]> {
  await ensureSchema();
  const rows = (await getSql()`
    SELECT entry FROM migration_logs WHERE migration_id = ${migrationId} ORDER BY id
  `) as { entry: LogEntry }[];
  return rows.map((r) => r.entry);
}
