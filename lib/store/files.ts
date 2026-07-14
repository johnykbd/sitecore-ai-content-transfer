import { promises as fs } from "fs";
import path from "path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const LOGS_DIR = path.join(DATA_DIR, "logs");
export const MIGRATIONS_DIR = path.join(DATA_DIR, "migrations");
export const ENVIRONMENTS_FILE = path.join(DATA_DIR, "environments.json");

export async function ensureDirs() {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(file: string, data: unknown) {
  await ensureDirs();
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}
