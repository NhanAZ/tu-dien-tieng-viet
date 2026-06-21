import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { PROCESSED_DIR, ROOT, readJson, writeJson } from "./lib/paths.js";

async function readIdsFromDir(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const ids: string[] = [];
  for (const file of (await readdir(dir)).filter((item) => item.endsWith(".json")).sort()) {
    const entries = await readJson<Array<{ id: string }>>(path.join(dir, file));
    ids.push(...entries.map((entry) => entry.id));
  }
  return ids;
}

async function readIdsFromFile(filePath: string): Promise<string[]> {
  if (!existsSync(filePath)) return [];
  return (await readJson<Array<{ id: string }>>(filePath)).map((entry) => entry.id);
}

async function fingerprint(): Promise<{ sha256: string; counts: Record<string, number> }> {
  const layers: Record<string, string[]> = {
    words: await readIdsFromDir(path.join(PROCESSED_DIR, "words")),
    lexemes: await readIdsFromDir(path.join(PROCESSED_DIR, "lexemes")),
    hanViet: await readIdsFromDir(path.join(PROCESSED_DIR, "han-viet")),
    evidence: await readIdsFromDir(path.join(PROCESSED_DIR, "evidence")),
    nom: await readIdsFromFile(path.join(PROCESSED_DIR, "nom", "entries.json")),
    semantics: await readIdsFromFile(path.join(PROCESSED_DIR, "semantics", "synsets.json")),
    variants: await readIdsFromFile(path.join(PROCESSED_DIR, "variants", "orthography.json"))
  };
  const canonical = Object.entries(layers)
    .flatMap(([layer, ids]) => ids.sort().map((id) => `${layer}:${id}`))
    .join("\n");
  return {
    sha256: crypto.createHash("sha256").update(canonical).digest("hex"),
    counts: Object.fromEntries(Object.entries(layers).map(([layer, ids]) => [layer, ids.length]))
  };
}

const before = await fingerprint();
const merge =
  process.platform === "win32"
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm.cmd", "run", "merge"], {
        cwd: ROOT,
        stdio: "inherit"
      })
    : spawnSync("npm", ["run", "merge"], { cwd: ROOT, stdio: "inherit" });
if (merge.status !== 0) throw new Error(`Second merge failed with exit code ${merge.status ?? "unknown"}`);
const after = await fingerprint();
const passed = before.sha256 === after.sha256 && JSON.stringify(before.counts) === JSON.stringify(after.counts);
const manifest =
  process.platform === "win32"
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm.cmd", "run", "manifest"], {
        cwd: ROOT,
        stdio: "inherit"
      })
    : spawnSync("npm", ["run", "manifest"], { cwd: ROOT, stdio: "inherit" });
if (manifest.status !== 0) throw new Error(`Manifest rebuild failed with exit code ${manifest.status ?? "unknown"}`);
await writeJson(path.join(ROOT, "data", "audit", "id-stability-test.json"), {
  tested_at: new Date().toISOString(),
  before,
  after,
  passed
});
console.log(`[stability] ${passed ? "PASS" : "FAIL"}: ${after.sha256}`);
if (!passed) process.exit(1);
