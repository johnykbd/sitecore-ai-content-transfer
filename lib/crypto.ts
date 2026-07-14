/**
 * Crypto helpers:
 *  - scrypt password hashing (user accounts)
 *  - AES-256-GCM encryption for environment credentials at rest
 *
 * The encryption key comes from the CT_SECRET_KEY environment variable
 * (64 hex chars = 32 bytes). Resolution order:
 *   1. process.env.CT_SECRET_KEY            (recommended for production)
 *   2. legacy data/.secret.key file          (backwards compatibility)
 *   3. auto-generated and appended to .env.local (dev convenience;
 *      .env* is gitignored so it never reaches source control)
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { appendFileSync, existsSync, readFileSync } from "fs";
import path from "path";

const LEGACY_KEY_FILE = path.join(process.cwd(), "data", ".secret.key");
const ENV_LOCAL_FILE = path.join(process.cwd(), ".env.local");
const ENV_VAR = "CT_SECRET_KEY";

let cachedKey: Buffer | null = null;

function parseKey(hex: string, source: string): Buffer {
  const key = Buffer.from(hex.trim(), "hex");
  if (key.length !== 32) {
    throw new Error(
      `${source} must be 64 hex characters (32 bytes); got ${key.length} bytes. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return key;
}

function getAppKey(): Buffer {
  if (cachedKey) return cachedKey;

  // 1. Environment variable (recommended)
  if (process.env[ENV_VAR]) {
    cachedKey = parseKey(process.env[ENV_VAR], ENV_VAR);
    return cachedKey;
  }

  // 2. Legacy key file (kept so existing encrypted data stays readable)
  if (existsSync(LEGACY_KEY_FILE)) {
    cachedKey = parseKey(readFileSync(LEGACY_KEY_FILE, "utf8"), LEGACY_KEY_FILE);
    console.warn(
      `[crypto] Using legacy key file at ${LEGACY_KEY_FILE}. ` +
        `Move its value to the ${ENV_VAR} environment variable and delete the file.`
    );
    return cachedKey;
  }

  // 3. Dev convenience: generate once into .env.local (gitignored)
  const hex = randomBytes(32).toString("hex");
  appendFileSync(ENV_LOCAL_FILE, `\n# Auto-generated encryption key for saved credentials\n${ENV_VAR}=${hex}\n`);
  process.env[ENV_VAR] = hex;
  console.warn(
    `[crypto] ${ENV_VAR} was not set — generated a new key and saved it to .env.local. ` +
      `For production, set ${ENV_VAR} yourself and keep it safe: losing it makes stored credentials unreadable.`
  );
  cachedKey = parseKey(hex, ENV_VAR);
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
