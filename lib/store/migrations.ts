import path from "path";
import { promises as fs } from "fs";
import type { LogEntry, Migration } from "../types";
import { LOGS_DIR, MIGRATIONS_DIR, ensureDirs, readJson, writeJson } from "./files";

function migrationFile(id: string) {
  return path.join(MIGRATIONS_DIR, `${id}.json`);
}

export function logFile(id: string) {
  return path.join(LOGS_DIR, `migration-${id}.log.json`);
}

export async function listMigrations(userId?: string): Promise<Migration[]> {
  await ensureDirs();
  const files = await fs.readdir(MIGRATIONS_DIR).catch(() => [] as string[]);
  const migrations = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map((f) => readJson<Migration | null>(path.join(MIGRATIONS_DIR, f), null))
  );
  return migrations
    .filter((m): m is Migration => !!m)
    .filter((m) => !userId || m.userId === userId || !m.userId) // legacy records without userId stay visible
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMigration(id: string): Promise<Migration | undefined> {
  const m = await readJson<Migration | null>(migrationFile(id), null);
  return m ?? undefined;
}

export async function saveMigration(migration: Migration) {
  await writeJson(migrationFile(migration.id), migration);
}

export async function appendLog(migrationId: string, entry: LogEntry) {
  await ensureDirs();
  const file = logFile(migrationId);
  const entries = await readJson<LogEntry[]>(file, []);
  entries.push(entry);
  await writeJson(file, entries);
}

export async function readLogs(migrationId: string): Promise<LogEntry[]> {
  return readJson<LogEntry[]>(logFile(migrationId), []);
}
