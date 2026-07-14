/**
 * Crypto helpers:
 *  - scrypt password hashing (user accounts)
 *  - AES-256-GCM encryption for environment credentials at rest
 *
 * The encryption key is generated once and stored in data/.secret.key.
 * Keep that file out of source control (data/ is gitignored).
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const KEY_FILE = path.join(DATA_DIR, ".secret.key");

let cachedKey: Buffer | null = null;

function getAppKey(): Buffer {
  if (cachedKey) return cachedKey;
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(KEY_FILE)) {
    writeFileSync(KEY_FILE, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  cachedKey = Buffer.from(readFileSync(KEY_FILE, "utf8").trim(), "hex");
  return cachedKey;
}

/* ---------------- password hashing ---------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

/* ---------------- symmetric encryption ---------------- */

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getAppKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const [v, ivHex, tagHex, dataHex] = payload.split(":");
  if (v !== "v1") throw new Error("Unknown ciphertext version");
  const decipher = createDecipheriv("aes-256-gcm", getAppKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
