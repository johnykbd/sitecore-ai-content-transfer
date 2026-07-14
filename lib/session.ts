/** Cookie-based sessions backed by the SQLite sessions table. */
import { randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { hashPassword, verifyPassword } from "./crypto";

export const SESSION_COOKIE = "ct_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionUser {
  id: string;
  email: string;
}

export function registerUser(email: string, password: string): SessionUser {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Invalid email address");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalized);
  if (existing) throw new Error("An account with this email already exists");
  const id = randomUUID();
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    normalized,
    hashPassword(password),
    new Date().toISOString()
  );
  return { id, email: normalized };
}

export function authenticateUser(email: string, password: string): SessionUser {
  const db = getDb();
  const row = db
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as
    | { id: string; email: string; password_hash: string }
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new Error("Invalid email or password");
  }
  return { id: row.id, email: row.email };
}

export async function createSession(userId: string) {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expiresAt
  );
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
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.email, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    )
    .get(token) as { id: string; email: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return { id: row.id, email: row.email };
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  store.delete(SESSION_COOKIE);
}
