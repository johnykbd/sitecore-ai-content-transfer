/**
 * Environment profiles for the fully-managed mode.
 * Stored per-user in Postgres; credentials (client id/secret or token)
 * are encrypted at rest with AES-256-GCM.
 */
import { randomUUID } from "crypto";
import { existsSync, readFileSync, renameSync } from "fs";
import path from "path";
import type { EnvironmentAuthType, EnvironmentProfile } from "../types";
import { ensureSchema, getSql } from "../postgres";
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
  await ensureSchema();
  const rows = (await getSql()`
    SELECT * FROM environments WHERE user_id = ${userId} ORDER BY created_at
  `) as unknown as EnvRow[];
  return rows.map(rowToEnv);
}

export async function getEnvironment(
  id: string,
  userId?: string
): Promise<EnvironmentProfile | undefined> {
  await ensureSchema();
  const rows = (await getSql()`SELECT * FROM environments WHERE id = ${id}`) as unknown as EnvRow[];
  const row = rows[0];
  if (!row) return undefined;
  if (userId && row.user_id !== userId) return undefined;
  return rowToEnv(row);
}

export async function saveEnvironment(
  input: Omit<EnvironmentProfile, "id" | "createdAt" | "updatedAt"> & { id?: string },
  userId: string
): Promise<EnvironmentProfile> {
  await ensureSchema();
  const sql = getSql();
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
    await sql`
      UPDATE environments
      SET name=${merged.name}, base_url=${merged.baseUrl}, tag=${merged.tag ?? null},
          auth_type=${merged.authType}, authority=${merged.authority ?? null},
          audience=${merged.audience ?? null}, client_id=${merged.clientId ?? null},
          secret_enc=${encrypt(JSON.stringify({ clientSecret: merged.clientSecret, token: merged.token }))},
          updated_at=${now}
      WHERE id=${input.id} AND user_id=${userId}
    `;
    return { ...merged, id: input.id, updatedAt: now };
  }

  const id = randomUUID();
  await sql`
    INSERT INTO environments (id, user_id, name, base_url, tag, auth_type, authority, audience, client_id, secret_enc, created_at, updated_at)
    VALUES (
      ${id}, ${userId}, ${input.name}, ${input.baseUrl}, ${input.tag ?? null},
      ${input.authType ?? "clientCredentials"}, ${input.authority ?? null}, ${input.audience ?? null},
      ${input.clientId ?? null},
      ${encrypt(JSON.stringify({ clientSecret: input.clientSecret, token: input.token }))},
      ${now}, ${now}
    )
  `;
  return { ...input, id, userId, createdAt: now, updatedAt: now };
}

export async function deleteEnvironment(id: string, userId: string) {
  await ensureSchema();
  await getSql()`DELETE FROM environments WHERE id = ${id} AND user_id = ${userId}`;
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
  const file = path.join(
    process.env.CT_DATA_DIR ?? path.join(process.cwd(), "data"),
    "environments.json"
  );
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
