import { existsSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { PROCESSED_DIR, ROOT, ensureDir, readJson, writeJson } from "./lib/paths.js";
import { cleanText, foldVietnamese, shortHash, slugifyWord } from "./lib/text.js";
import type { Definition, WordEntry } from "./lib/types.js";

interface DefinitionSenseRecord {
  sense_id: string;
  definition_uid: string;
  entry_id: string;
  word: string;
  definition_index: number;
  source: string;
  source_entry_id: string | null;
  raw_record_hash: string;
  language: string;
  review_status: string;
  confidence: number;
  exact_cluster_id: string;
  normalized_definition_key: string;
  meaning_hash: string;
}

interface DuplicateCandidates {
  exactCrossSourceGroups?: Array<{
    word: string;
    key: string;
    count: number;
    sources: string[];
    definitions: Array<{ source: string; index: number; meaning: string }>;
  }>;
  nearDuplicatePairs?: Array<{
    word: string;
    score: number;
    left: { source: string; index: number; meaning: string };
    right: { source: string; index: number; meaning: string };
  }>;
  distantSameHeadwordPairs?: Array<{
    word: string;
    score: number;
    left: { source: string; index: number; meaning: string };
    right: { source: string; index: number; meaning: string };
  }>;
}

interface GoldTodo {
  id: string;
  category: string;
  word: string;
  score: number | null;
  left: { source: string; index: number; meaning: string };
  right: { source: string; index: number; meaning: string };
  label: string | null;
  label_options: string[];
  reviewer_notes: string;
}

const AUDIT_DIR = path.join(ROOT, "data", "audit", "academic");
const SENSE_SCHEMA_PATH = path.join(AUDIT_DIR, "sense-entry.draft.schema.json");
const LEGACY_SENSE_INVENTORY_PATH = path.join(AUDIT_DIR, "sense-inventory.jsonl");
const SENSE_INVENTORY_PATH = path.join(AUDIT_DIR, "sense-inventory.jsonl.gz");
const SENSE_INVENTORY_SAMPLE_PATH = path.join(AUDIT_DIR, "sense-inventory.sample.jsonl");
const SENSE_SUMMARY_PATH = path.join(AUDIT_DIR, "sense-model-summary.json");
const CLUSTER_CANDIDATES_PATH = path.join(AUDIT_DIR, "sense-cluster-candidates.json");
const GOLD_TODO_PATH = path.join(AUDIT_DIR, "gold-sense-pairs.todo.jsonl");
const GOLD_TODO_WITH_SENSE_PATH = path.join(AUDIT_DIR, "gold-sense-pairs.sense-todo.jsonl");
const DUPLICATE_CANDIDATES_PATH = path.join(AUDIT_DIR, "duplicate-candidates.json");

async function readArrays<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const entries: T[] = [];
  for (const file of files) entries.push(...(await readJson<T[]>(path.join(dir, file))));
  return entries;
}

function number(value: number): string {
  return value.toLocaleString("vi-VN");
}

function normalizeDefinitionKey(value: string): string {
  return foldVietnamese(cleanText(value))
    .replace(/^\s*\d+[\).]?\s*/g, "")
    .replace(/^(d|dt|tt|t|dong tu|danh tu|tinh tu|ph|pht|trt|l|c|id)\.\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function senseIdFor(entry: WordEntry, definition: Definition, index: number): string {
  const raw =
    `${entry.headword_normalized}:${definition.source}:${definition.provenance.source_entry_id ?? ""}:` +
    `${definition.provenance.raw_record_hash}:${index}:${normalizeDefinitionKey(definition.meaning)}`;
  return `sense-${slugifyWord(entry.word)}-${shortHash(raw)}`;
}

function definitionUidFor(entry: WordEntry, definition: Definition, index: number): string {
  return `def-${shortHash(`${entry.id}:${index}:${definition.source}:${definition.provenance.raw_record_hash}`)}`;
}

function exactClusterIdFor(word: string, key: string): string {
  return `cluster-exact-${slugifyWord(word)}-${shortHash(`${word}:${key}`)}`;
}

function keyFor(word: string, source: string, index: number): string {
  return `${word}\u0000${source}\u0000${index}`;
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  if (!existsSync(filePath)) return [];
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function writeGzipJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const text = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  await writeFile(filePath, gzipSync(text));
}

const senseDraftSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://local.tu-dien-tieng-viet/schema/sense-entry.draft.schema.json",
  title: "DraftSenseEntry",
  type: "object",
  additionalProperties: false,
  required: [
    "sense_id",
    "definition_uid",
    "entry_id",
    "word",
    "definition_index",
    "source",
    "raw_record_hash",
    "language",
    "review_status",
    "confidence",
    "exact_cluster_id",
    "normalized_definition_key",
    "meaning_hash"
  ],
  properties: {
    sense_id: { type: "string", pattern: "^sense-" },
    definition_uid: { type: "string", pattern: "^def-" },
    entry_id: { type: "string", minLength: 1 },
    word: { type: "string", minLength: 1 },
    definition_index: { type: "integer", minimum: 0 },
    source: { type: "string", minLength: 1 },
    source_entry_id: { type: ["string", "null"] },
    raw_record_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
    language: { type: "string" },
    review_status: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    exact_cluster_id: { type: "string", pattern: "^cluster-exact-" },
    normalized_definition_key: { type: "string" },
    meaning_hash: { type: "string", pattern: "^[0-9a-f]{8}$" }
  }
};

const words = await readArrays<WordEntry>(path.join(PROCESSED_DIR, "words"));
const duplicateCandidates = existsSync(DUPLICATE_CANDIDATES_PATH)
  ? await readJson<DuplicateCandidates>(DUPLICATE_CANDIDATES_PATH)
  : {};
const goldTodo = await readJsonl<GoldTodo>(GOLD_TODO_PATH);

const records: DefinitionSenseRecord[] = [];
const byWordSourceIndex = new Map<string, DefinitionSenseRecord>();
const exactClusterMembers = new Map<string, DefinitionSenseRecord[]>();

for (const entry of words) {
  for (const [index, definition] of entry.definitions.entries()) {
    const normalizedKey = normalizeDefinitionKey(definition.meaning);
    const record: DefinitionSenseRecord = {
      sense_id: senseIdFor(entry, definition, index),
      definition_uid: definitionUidFor(entry, definition, index),
      entry_id: entry.id,
      word: entry.word,
      definition_index: index,
      source: definition.source,
      source_entry_id: definition.provenance.source_entry_id,
      raw_record_hash: definition.provenance.raw_record_hash,
      language: definition.language,
      review_status: definition.provenance.review_status,
      confidence: definition.provenance.confidence,
      exact_cluster_id: exactClusterIdFor(entry.word, normalizedKey),
      normalized_definition_key: normalizedKey,
      meaning_hash: shortHash(cleanText(definition.meaning))
    };
    records.push(record);
    byWordSourceIndex.set(keyFor(entry.word, definition.source, index), record);
    const members = exactClusterMembers.get(record.exact_cluster_id) ?? [];
    members.push(record);
    exactClusterMembers.set(record.exact_cluster_id, members);
  }
}

const exactClusters = [...exactClusterMembers.values()]
  .filter((members) => members.length > 1 && new Set(members.map((member) => member.source)).size > 1)
  .map((members) => ({
    cluster_id: members[0]!.exact_cluster_id,
    type: "exact_normalized_definition",
    word: members[0]!.word,
    normalized_definition_key: members[0]!.normalized_definition_key,
    member_count: members.length,
    source_count: new Set(members.map((member) => member.source)).size,
    member_sense_ids: members.map((member) => member.sense_id)
  }))
  .sort((a, b) => b.member_count - a.member_count || a.word.localeCompare(b.word, "vi"));

function pairWithSenseIds(pair: {
  word: string;
  score?: number | null;
  left: { source: string; index: number; meaning: string };
  right: { source: string; index: number; meaning: string };
}) {
  const leftRecord = byWordSourceIndex.get(keyFor(pair.word, pair.left.source, pair.left.index));
  const rightRecord = byWordSourceIndex.get(keyFor(pair.word, pair.right.source, pair.right.index));
  return {
    word: pair.word,
    score: pair.score ?? null,
    left: { ...pair.left, sense_id: leftRecord?.sense_id ?? null },
    right: { ...pair.right, sense_id: rightRecord?.sense_id ?? null },
    resolvable: Boolean(leftRecord && rightRecord)
  };
}

const nearPairs = (duplicateCandidates.nearDuplicatePairs ?? []).map(pairWithSenseIds);
const distantPairs = (duplicateCandidates.distantSameHeadwordPairs ?? []).map(pairWithSenseIds);
const exactCandidateGroups = (duplicateCandidates.exactCrossSourceGroups ?? []).map((group) => ({
  ...group,
  cluster_id: exactClusterIdFor(group.word, group.key),
  member_sense_ids: group.definitions
    .map((definition) => byWordSourceIndex.get(keyFor(group.word, definition.source, definition.index))?.sense_id)
    .filter((value): value is string => Boolean(value))
}));
const goldTodoWithSense = goldTodo.map((todo) => ({
  ...todo,
  left: {
    ...todo.left,
    sense_id: byWordSourceIndex.get(keyFor(todo.word, todo.left.source, todo.left.index))?.sense_id ?? null
  },
  right: {
    ...todo.right,
    sense_id: byWordSourceIndex.get(keyFor(todo.word, todo.right.source, todo.right.index))?.sense_id ?? null
  },
  resolvable: Boolean(
    byWordSourceIndex.get(keyFor(todo.word, todo.left.source, todo.left.index)) &&
      byWordSourceIndex.get(keyFor(todo.word, todo.right.source, todo.right.index))
  )
}));

const summary = {
  generatedAt: new Date().toISOString(),
  status: "DRAFT_REVIEW_ONLY",
  headwords: words.length,
  definitions: records.length,
  uniqueSenseIds: new Set(records.map((record) => record.sense_id)).size,
  duplicateSenseIds: records.length - new Set(records.map((record) => record.sense_id)).size,
  exactClusters: exactClusters.length,
  exactClusterMembers: exactClusters.reduce((total, cluster) => total + cluster.member_count, 0),
  exactCandidateGroups: exactCandidateGroups.length,
  nearDuplicatePairs: nearPairs.length,
  nearDuplicatePairsResolvable: nearPairs.filter((pair) => pair.resolvable).length,
  distantSameHeadwordPairs: distantPairs.length,
  distantSameHeadwordPairsResolvable: distantPairs.filter((pair) => pair.resolvable).length,
  goldTodoPairs: goldTodoWithSense.length,
  goldTodoPairsResolvable: goldTodoWithSense.filter((pair) => pair.resolvable).length,
  note:
    "Sense IDs are deterministic draft IDs for review. They do not mean that definitions have been merged or human-approved."
};

await ensureDir(AUDIT_DIR);
if (existsSync(LEGACY_SENSE_INVENTORY_PATH)) await rm(LEGACY_SENSE_INVENTORY_PATH, { force: true });
await writeJson(SENSE_SCHEMA_PATH, senseDraftSchema);
await writeGzipJsonl(SENSE_INVENTORY_PATH, records);
await writeJsonl(SENSE_INVENTORY_SAMPLE_PATH, records.slice(0, 5000));
await writeJson(SENSE_SUMMARY_PATH, summary);
await writeJson(CLUSTER_CANDIDATES_PATH, {
  exactClusters: exactClusters.slice(0, 5000),
  exactCandidateGroups: exactCandidateGroups.slice(0, 5000),
  nearDuplicatePairs: nearPairs.slice(0, 5000),
  distantSameHeadwordPairs: distantPairs.slice(0, 5000)
});
await writeJsonl(GOLD_TODO_WITH_SENSE_PATH, goldTodoWithSense);

console.log(
  `[academic:sense-draft] DRAFT_REVIEW_ONLY: ${number(records.length)} draft senses, ` +
    `${number(exactClusters.length)} exact clusters, ${number(nearPairs.length)} near pairs, ` +
    `${number(goldTodoWithSense.length)} gold todo pairs`
);
