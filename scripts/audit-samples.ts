import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, readJson, writeJson } from "./lib/paths.js";
import { usedSources } from "./lib/sources.js";
import type { LexemeEntry, WordEntry } from "./lib/types.js";

async function readArrays<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const entries: T[] = [];
  for (const file of files) entries.push(...(await readJson<T[]>(path.join(dir, file))));
  return entries;
}

function rank(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const words = await readArrays<WordEntry>(path.join(PROCESSED_DIR, "words"));
const lexemes = await readArrays<LexemeEntry>(path.join(PROCESSED_DIR, "lexemes"));
const dictionarySources = usedSources()
  .map((source) => source.key)
  .filter((source) => words.some((entry) => entry.definitions.some((definition) => definition.source === source)))
  .sort();
const sampleTarget = 500;
const perSourceBase = dictionarySources.length === 0 ? 0 : Math.floor(sampleTarget / dictionarySources.length);
const perSourceRemainder = dictionarySources.length === 0 ? 0 : sampleTarget % dictionarySources.length;

const qaSample = dictionarySources.flatMap((source, sourceIndex) => {
  const sourceLimit = perSourceBase + (sourceIndex < perSourceRemainder ? 1 : 0);
  const candidates = words
    .flatMap((entry) =>
      entry.definitions
        .filter((definition) => definition.source === source)
        .map((definition) => ({
          id: `${entry.id}:${definition.provenance.raw_record_hash.slice(0, 12)}`,
          headword: entry.word,
          part_of_speech: entry.part_of_speech,
          meaning: definition.meaning,
          language: definition.language,
          labels: definition.labels,
          source,
          source_entry_id: definition.provenance.source_entry_id,
          machine_checks: {
            nonempty_headword: Boolean(entry.word),
            nonempty_meaning: Boolean(definition.meaning),
            provenance_hash_valid: /^[a-f0-9]{64}$/.test(definition.provenance.raw_record_hash)
          },
          human_review: {
            headword_valid: null,
            definition_relevant: null,
            register_region_period_correct: null,
            notes: null
          }
        }))
    )
    .sort((a, b) => rank(`${a.source}:${a.id}`).localeCompare(rank(`${b.source}:${b.id}`)));
  return candidates.slice(0, sourceLimit);
});

interface SensePair {
  id: string;
  headword: string;
  source_a: string;
  meaning_a: string;
  source_b: string;
  meaning_b: string;
  human_decision: "same-sense" | "related" | "different" | "uncertain" | null;
  notes: string | null;
  rank: string;
}

const sensePairs: SensePair[] = [];
for (const entry of words) {
  for (let left = 0; left < entry.definitions.length; left += 1) {
    for (let right = left + 1; right < entry.definitions.length; right += 1) {
      const a = entry.definitions[left];
      const b = entry.definitions[right];
      if (!a || !b || a.source === b.source) continue;
      const id = `${entry.id}:${a.provenance.raw_record_hash.slice(0, 8)}:${b.provenance.raw_record_hash.slice(0, 8)}`;
      sensePairs.push({
        id,
        headword: entry.word,
        source_a: a.source,
        meaning_a: a.meaning,
        source_b: b.source,
        meaning_b: b.meaning,
        human_decision: null,
        notes: null,
        rank: rank(id)
      });
    }
  }
}
sensePairs.sort((a, b) => a.rank.localeCompare(b.rank));
const goldTemplate = sensePairs.slice(0, 1000).map(({ rank: _rank, ...pair }) => pair);

const missingDefinitions = lexemes
  .map((entry) => ({
    id: entry.id,
    headword: entry.headword,
    syllable_count: entry.syllable_count,
    evidence_sources: [...new Set(entry.evidence.map((item) => item.source_id))].sort(),
    evidence_count: entry.evidence.length
  }))
  .sort((a, b) => b.evidence_sources.length - a.evidence_sources.length || b.evidence_count - a.evidence_count || a.headword.localeCompare(b.headword, "vi"))
  .slice(0, 5000);

const auditDir = path.join(ROOT, "data", "audit");
await writeJson(path.join(auditDir, "qa-word-sample-500.json"), qaSample);
await writeJson(path.join(auditDir, "sense-merge-gold-template-1000.json"), goldTemplate);
await writeJson(path.join(auditDir, "missing-definitions-top-5000.json"), missingDefinitions);
console.log(
  `[audit-samples] ${qaSample.length} word records, ${goldTemplate.length} sense pairs, ` +
    `${missingDefinitions.length} missing-definition candidates`
);
