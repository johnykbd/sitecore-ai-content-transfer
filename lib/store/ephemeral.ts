/**
 * In-memory store for one-time migrations.
 *
 * Nothing here is ever written to disk: migration state, logs and the
 * environment credentials (tokens) live only in server memory and are
 * dropped after a TTL or on server restart.
 */
import type { EnvironmentProfile, LogEntry, Migration } from "../types";

interface EphemeralRecord {
  migration: Migration;
  logs: LogEntry[];
  envs: { source: EnvironmentProfile; destination: EnvironmentProfile };
  createdAt: number;
}

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

declare global {
  // eslint-disable-next-line no-var
  var __ctEphemeral: Map<string, EphemeralRecord> | undefined;
}

function store(): Map<string, EphemeralRecord> {
  if (!globalThis.__ctEphemeral) globalThis.__ctEphemeral = new Map();
  return globalThis.__ctEphemeral;
}

function sweep() {
  const now = Date.now();
  for (const [id, rec] of store()) {
    if (now - rec.createdAt > TTL_MS) store().delete(id);
  }
}

export function putEphemeralMigration(
  migration: Migration,
  envs: { source: EnvironmentProfile; destination: EnvironmentProfile }
) {
  sweep();
  store().set(migration.id, { migration, logs: [], envs, createdAt: Date.now() });
}

export function getEphemeralMigration(id: string): Migration | undefined {
  return store().get(id)?.migration;
}

export function getEphemeralEnvs(id: string) {
  return store().get(id)?.envs;
}

export function getEphemeralLogs(id: string): LogEntry[] {
  return store().get(id)?.logs ?? [];
}

export function saveEphemeralMigration(migration: Migration) {
  const rec = store().get(migration.id);
  if (rec) rec.migration = migration;
}

export function appendEphemeralLog(id: string, entry: LogEntry) {
  store().get(id)?.logs.push(entry);
}
