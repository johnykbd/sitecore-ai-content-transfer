/**
 * Environment profiles for the fully-managed mode.
 * Stored per-user in SQLite; credentials (client id/secret or token)
 * are encrypted at rest with AES-256-GCM.
 */
import { randomUUID } from "crypto";
import { existsSync, readFileSync, renameSync } from "fs";
import path from "path";
import type { EnvironmentAuthType, EnvironmentProfile } from "../types";
import { getDb } from "../db";
import { decrypt, encrypt } from "../crypto";

interface EnvRow {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  tag: string | null;
  auth_type: string;
  authority: string | null;
  audience: string | null;
  client_id: string | null;
  secret_enc: string;
  created_at: string;
  updated_at: string;
}

function rowToEnv(row: EnvRow): EnvironmentProfile {
  let secrets: { clientSecret?: string; token?: string } = {};
  try {
    secrets = JSON.parse(decrypt(row.secret_enc));
  } catch {
    // key rotated or corrupt — credentials must be re-entered
  }
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    baseUrl: row.base_url,
    tag: row.tag ?? undefined,
    authType: (row.auth_type as EnvironmentAuthType) ?? "clientCredentials",
    authority: row.authority ?? undefined,
    audience: row.audience ?? undefined,
    clientId: row.client_id ?? "",
    clientSecret: secrets.clientSecret ?? "",
    token: secrets.token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listEnvironments(userId: string): Promise<EnvironmentProfile[]> {
  const rows = getDb()
    .prepare("SELECT * FROM environments WHERE user_id = ? ORDER BY created_at")
    .all(userId) as unknown as EnvRow[];
  return rows.map(rowToEnv);
}

export async function getEnvironment(
  id: string,
  userId?: string
): Promise<EnvironmentProfile | undefined> {
  const row = getDb().prepare("SELECT * FROM environments WHERE id = ?").get(id) as
    | EnvRow
    | undefined;
  if (!row) return undefined;
  if (userId && row.user_id !== userId) return undefined;
  return rowToEnv(row);
}

export async function saveEnvironment(
  input: Omit<EnvironmentProfile, "id" | "createdAt" | "updatedAt"> & { id?: string },
  userId: string
): Promise<EnvironmentProfile> {
  const db = getDb();
  const now = new Date().toISOString();

  if (input.id) {
    const existing = await getEnvironment(input.id, userId);
    if (!existing) throw new Error(`Environment ${input.id} not found`);
    const merged = {
      ...existing,
      ...input,
      // blank secret/token on edit means "keep existing"
      clientSecret: input.clientSecret || existing.clientSecret,
      token: input.token || existing.token,
    };
    db.prepare(
      `UPDATE environments SET name=?, base_url=?, tag=?, auth_type=?, authority=?, audience=?, client_id=?, secret_enc=?, updated_at=? WHERE id=? AND user_id=?`
    ).run(
      merged.name,
      merged.baseUrl,
      merged.tag ?? null,
      merged.authType,
      merged.authority ?? null,
      merged.audience ?? null,
      merged.clientId ?? null,
      encrypt(JSON.stringify({ clientSecret: merged.clientSecret, token: merged.token })),
      now,
      input.id,
      userId
    );
    return { ...merged, id: input.id, updatedAt: now };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO environments (id, user_id, name, base_url, tag, auth_type, authority, audience, client_id, secret_enc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    input.name,
    input.baseUrl,
    input.tag ?? null,
    input.authType ?? "clientCredentials",
    input.authority ?? null,
    input.audience ?? null,
    input.clientId ?? null,
    encrypt(JSON.stringify({ clientSecret: input.clientSecret, token: input.token })),
    now,
    now
  );
  return { ...input, id, userId, createdAt: now, updatedAt: now };
}

export async function deleteEnvironment(id: string, userId: string) {
  getDb().prepare("DELETE FROM environments WHERE id = ? AND user_id = ?").run(id, userId);
}

/** Strip secrets before sending to the browser. */
export function redactEnvironment(env: EnvironmentProfile) {
  return {
    ...env,
    clientSecret: env.clientSecret ? "********" : "",
    token: env.token ? "********" : undefined,
  };
}

/**
 * One-time import of a legacy data/environments.json file (pre-SQLite versions)
 * into a user's account. The file is renamed afterwards so it only runs once.
 */
export async function importLegacyEnvironments(userId: string): Promise<number> {
  const file = path.join(process.cwd(), "data", "environments.json");
  if (!existsSync(file)) return 0;
  let imported = 0;
  try {
    const legacy = JSON.parse(readFileSync(file, "utf8")) as Partial<EnvironmentProfile>[];
    for (const env of legacy) {
      if (!env.name || !env.baseUrl) continue;
      await saveEnvironment(
        {
          name: env.name,
          baseUrl: env.baseUrl,
          authType: env.token ? "token" : "clientCredentials",
          clientId: env.clientId ?? "",
          clientSecret: env.clientSecret ?? "",
          token: env.token,
          authority: env.authority,
          audience: env.audience,
          tag: env.tag,
        },
        userId
      );
      imported++;
    }
    renameSync(file, `${file}.imported`);
  } catch {
    // ignore malformed legacy file
  }
  return imported;
}
