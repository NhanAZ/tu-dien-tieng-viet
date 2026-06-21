import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { PROCESSED_DIR, ROOT, readJson, writeJson } from "./lib/paths.js";
import { SOURCES, usedSources } from "./lib/sources.js";
import type {
  EvidenceEntry,
  HanCharacterEntry,
  LexemeEntry,
  NomEntry,
  SemanticEntry,
  VariantEntry,
  WordEntry
} from "./lib/types.js";

interface PolicyFile {
  profile: "open-only" | "documented";
  collection_frozen: boolean;
  disabled_sources: string[];
}

async function readArrays<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const entries: T[] = [];
  for (const file of files) entries.push(...(await readJson<T[]>(path.join(dir, file))));
  return entries;
}

function runNpmScript(script: string): void {
  const result =
    process.platform === "win32"
      ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm.cmd", "run", script], {
          cwd: ROOT,
          stdio: "inherit"
        })
      : spawnSync("npm", ["run", script], { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) {
    const detail = result.error instanceof Error ? `: ${result.error.message}` : "";
    throw new Error(`${script} failed with exit code ${result.status ?? "unknown"}${detail}`);
  }
}

async function layerSnapshot(sourceId: string) {
  const words = await readArrays<WordEntry>(path.join(PROCESSED_DIR, "words"));
  const lexemes = await readArrays<LexemeEntry>(path.join(PROCESSED_DIR, "lexemes"));
  const han = await readArrays<HanCharacterEntry>(path.join(PROCESSED_DIR, "han-viet"));
  const evidence = await readArrays<EvidenceEntry>(path.join(PROCESSED_DIR, "evidence"));
  const nom = existsSync(path.join(PROCESSED_DIR, "nom", "entries.json"))
    ? await readJson<NomEntry[]>(path.join(PROCESSED_DIR, "nom", "entries.json"))
    : [];
  const semantics = existsSync(path.join(PROCESSED_DIR, "semantics", "synsets.json"))
    ? await readJson<SemanticEntry[]>(path.join(PROCESSED_DIR, "semantics", "synsets.json"))
    : [];
  const variants = existsSync(path.join(PROCESSED_DIR, "variants", "orthography.json"))
    ? await readJson<VariantEntry[]>(path.join(PROCESSED_DIR, "variants", "orthography.json"))
    : [];

  const target = {
    word_entry_sources: words.filter((entry) => entry.sources.includes(sourceId)).length,
    word_definitions: words.flatMap((entry) => entry.definitions).filter((definition) => definition.source === sourceId).length,
    word_etymologies: words.flatMap((entry) => entry.etymologies).filter((etymology) => etymology.source === sourceId).length,
    lexeme_evidence: lexemes.flatMap((entry) => entry.evidence).filter((item) => item.source_id === sourceId).length,
    han_entry_sources: han.filter((entry) => entry.sources.includes(sourceId)).length,
    han_meanings: han.flatMap((entry) => entry.meanings).filter((meaning) => meaning.source === sourceId).length,
    nom_records: nom.filter((entry) => entry.provenance.source_id === sourceId).length,
    semantic_traces: semantics.flatMap((entry) => entry.provenance).filter((trace) => trace.source_id === sourceId).length,
    variant_traces: variants.flatMap((entry) => entry.provenance).filter((trace) => trace.source_id === sourceId).length,
    evidence_records: evidence.filter((entry) => entry.provenance.source_id === sourceId).length
  };
  const total = Object.values(target).reduce((sum, value) => sum + value, 0);

  return {
    layers: {
      words: words.length,
      lexemes: lexemes.length,
      han: han.length,
      evidence: evidence.length,
      nom: nom.length,
      semantics: semantics.length,
      variants: variants.length
    },
    target,
    total
  };
}

const selectedSources = usedSources();
const sourceId =
  process.argv[2] ??
  (selectedSources.some((source) => source.key === "catusf_vietviet")
    ? "catusf_vietviet"
    : selectedSources.some((source) => source.key === "omw_wiktionary_vi")
      ? "omw_wiktionary_vi"
      : selectedSources[0]?.key);
if (!sourceId) {
  console.error("[removal] No selected source is available for removal testing.");
  process.exit(1);
}
if (!SOURCES.some((source) => source.key === sourceId)) {
  console.error(`[removal] Unknown source: ${sourceId}`);
  process.exit(1);
}
if (!selectedSources.some((source) => source.key === sourceId)) {
  console.error(`[removal] Source is not selected in current profile: ${sourceId}`);
  process.exit(1);
}

const policyPath = path.join(ROOT, "data", "source-policy.json");
const originalPolicy = JSON.parse(await readFile(policyPath, "utf8")) as PolicyFile;
const before = await layerSnapshot(sourceId);
if (before.total === 0) {
  console.error(`[removal] No contributions from ${sourceId} in current processed data.`);
  process.exit(1);
}

let disabled = before;
let restored = before;
let restoreError: unknown = null;

try {
  await writeJson(policyPath, {
    ...originalPolicy,
    disabled_sources: [...new Set([...(originalPolicy.disabled_sources ?? []), sourceId])].sort()
  });
  runNpmScript("merge");
  runNpmScript("manifest");
  disabled = await layerSnapshot(sourceId);
} finally {
  try {
    await writeJson(policyPath, originalPolicy);
    runNpmScript("merge");
    runNpmScript("manifest");
    restored = await layerSnapshot(sourceId);
  } catch (error) {
    restoreError = error;
  }
}

if (restoreError) throw restoreError;

const restoredCountsMatch = JSON.stringify(before.layers) === JSON.stringify(restored.layers);
const restoredTargetMatch = JSON.stringify(before.target) === JSON.stringify(restored.target);
const passed = before.total > 0 && disabled.total === 0 && restoredCountsMatch && restoredTargetMatch;

await writeJson(path.join(ROOT, "data", "audit", "source-removal-test.json"), {
  tested_at: new Date().toISOString(),
  source_id: sourceId,
  profile: originalPolicy.profile,
  before,
  disabled,
  restored,
  restored_counts_match: restoredCountsMatch,
  restored_target_match: restoredTargetMatch,
  passed,
  note:
    "Nguon duoc tat bang source policy, rebuild merge/manifest, sau do khoi phuc lai; khong sua parser hay raw data."
});

console.log(`[removal] ${passed ? "PASS" : "FAIL"} for ${sourceId}`);
if (!passed) process.exit(1);
