import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, "..", "..");
export const DATA_DIR = path.join(ROOT, "data");
export const RAW_DIR = path.join(DATA_DIR, "raw");
export const NORMALIZED_DIR = path.join(DATA_DIR, "normalized");
export const PROCESSED_DIR = path.join(DATA_DIR, "processed");
export const SCHEMA_DIR = path.join(DATA_DIR, "schema");

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function resetDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await ensureDir(dir);
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function inputStream(filePath: string) {
  return createReadStream(filePath);
}

export function outputStream(filePath: string) {
  return createWriteStream(filePath, { encoding: "utf8" });
}

export function rel(filePath: string): string {
  return path.relative(ROOT, filePath).replaceAll(path.sep, "/");
}

