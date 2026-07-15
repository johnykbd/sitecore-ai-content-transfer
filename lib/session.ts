/** Cookie-based sessions backed by the Postgres sessions table. */
import { randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { ensureSchema, getSql } from "./postgres";
import { hashPassword, verifyPassword } from "./crypto";

export const SESSION_COOKIE = "ct_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionUser {
  id: string;
  email: string;
}

export async function registerUser(email: string, password: string): Promise<SessionUser> {
  await ensureSchema();
  const sql = getSql();
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Invalid email address");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const existing = await sql`SELECT id FROM users WHERE email = ${normalized}`;
  if (existing.length > 0) throw new Error("An account with this email already exists");
  const id = randomUUID();
  await sql`
    INSERT INTO users (id, email, password_hash, created_at)
    VALUES (${id}, ${normalized}, ${hashPassword(password)}, ${new Date().toISOString()})
  `;
  return { id, email: normalized };
}

export async function authenticateUser(email: string, password: string): Promise<SessionUser> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, email, password_hash FROM users WHERE email = ${email.trim().toLowerCase()}
  `) as { id: string; email: string; password_hash: string }[];
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new Error("Invalid email or password");
  }
  return { id: row.id, email: row.email };
}

export async function createSession(userId: string) {
  await ensureSchema();
  const sql = getSql();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await sql`
    INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expiresAt})
  `;
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT u.id, u.email, s.expires_at FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token = ${token}
  `) as { id: string; email: string; expires_at: string }[];
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sql`DELETE FROM sessions WHERE token = ${token}`;
    return null;
  }
  return { id: row.id, email: row.email };
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await ensureSchema();
    await getSql()`DELETE FROM sessions WHERE token = ${token}`;
  }
  store.delete(SESSION_COOKIE);
}
