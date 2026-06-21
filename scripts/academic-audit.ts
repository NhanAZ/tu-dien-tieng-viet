import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PROCESSED_DIR, ROOT, ensureDir, readJson, writeJson } from "./lib/paths.js";
import { usedSources } from "./lib/sources.js";
import { cleanText, foldVietnamese, shortHash } from "./lib/text.js";
import type { Definition, WordEntry } from "./lib/types.js";

interface QualitySummaryLike {
  release?: {
    buildId?: string;
    datasetVersion?: string;
    profile?: string;
    selectedSources?: number;
  };
}

interface DefinitionRecord {
  entryId: string;
  word: string;
  definitionIndex: number;
  meaning: string;
  source: string;
  sourceRights: string;
  sourceQuality: string;
  language: string;
  labels: string[];
  examplesCount: number;
  confidence: number;
  reviewStatus: string;
  partOfSpeech: string[];
  entrySources: string[];
  normalizedKey: string;
  tokens: string[];
  flags: string[];
  priority: number;
  hasSenseId: boolean;
}

interface SourceStatsWorking {
  source: string;
  rightsStatus: string;
  quality: string;
  headwords: Set<string>;
  definitions: number;
  viDefinitions: number;
  enDefinitions: number;
  withExamples: number;
  withLabels: number;
  lowConfidence: number;
  humanReviewed: number;
  machineChecked: number;
  unreviewed: number;
  priorityFlags: number;
  confidenceTotal: number;
}

interface SourceStatsOutput {
  source: string;
  rightsStatus: string;
  quality: string;
  headwords: number;
  definitions: number;
  viDefinitions: number;
  enDefinitions: number;
  withExamples: number;
  withLabels: number;
  lowConfidence: number;
  humanReviewed: number;
  machineChecked: number;
  unreviewed: number;
  priorityFlags: number;
  averageConfidence: number;
}

const AUDIT_DIR = path.join(ROOT, "data", "audit", "academic");
const REVIEW_QUEUE_LIMIT = Number.parseInt(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "5000", 10);

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "bi",
  "boi",
  "cac",
  "cho",
  "co",
  "con",
  "cua",
  "duoc",
  "de",
  "la",
  "lam",
  "mot",
  "nhieu",
  "nhung",
  "nguoi",
  "nhu",
  "o",
  "su",
  "the",
  "thu",
  "trong",
  "va",
  "voi"
]);

const FLAG_WEIGHTS: Record<string, number> = {
  "documented-unclear-source": 14,
  "low-confidence": 10,
  "proper-name-candidate": 9,
  "place-name-candidate": 9,
  "domain-or-encyclopedic-candidate": 8,
  "punctuation-headword-candidate": 8,
  "missing-pos": 7,
  "raw-pos-code": 6,
  "non-vi-definition": 5,
  "too-long": 5,
  "too-short": 4,
  "leading-sense-marker": 4,
  "not-human-reviewed": 4,
  "missing-labels": 2,
  "no-example": 2
};

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

function percent(value: number, total: number): number {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2));
}

function count(values: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi")));
}

function normalizeDefinitionKey(value: string): string {
  return foldVietnamese(cleanText(value))
    .replace(/^\s*\d+[\).]?\s*/g, "")
    .replace(/^(d|dt|tt|t|dong tu|danh tu|tinh tu|ph|pht|trt|l|c|id)\.\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensFor(value: string): string[] {
  return normalizeDefinitionKey(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function jaccard(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function snippet(value: string, length = 180): string {
  const text = cleanText(value);
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

function hasSenseId(definition: Definition): boolean {
  return Object.prototype.hasOwnProperty.call(definition as unknown as Record<string, unknown>, "sense_id");
}

function flagsFor(entry: WordEntry, definition: Definition, sourceRights: string): string[] {
  const flags: string[] = [];
  const meaning = cleanText(definition.meaning);
  const normalized = normalizeDefinitionKey(meaning);
  const rawPos = entry.part_of_speech.some((pos) => /^[A-Z]$/.test(pos));

  if (sourceRights === "documented-unclear" || definition.labels.includes("documented-unclear")) {
    flags.push("documented-unclear-source");
  }
  if (definition.provenance.confidence < 0.75) flags.push("low-confidence");
  if (definition.provenance.review_status !== "human-reviewed") flags.push("not-human-reviewed");
  if (entry.part_of_speech.length === 0) flags.push("missing-pos");
  if (rawPos) flags.push("raw-pos-code");
  if (definition.labels.length === 0) flags.push("missing-labels");
  if (definition.examples.length === 0) flags.push("no-example");
  if (definition.language !== "vi") flags.push("non-vi-definition");
  if (meaning.length < 12 || normalized.split(" ").filter(Boolean).length < 2) flags.push("too-short");
  if (meaning.length > 500) flags.push("too-long");
  if (/^\s*\d+[\).]?\s*(?:[A-Za-zĐđ]{1,6}\.)?\s*/u.test(meaning)) flags.push("leading-sense-marker");
  for (const label of definition.labels) {
    if (
      label === "proper-name-candidate" ||
      label === "place-name-candidate" ||
      label === "domain-or-encyclopedic-candidate" ||
      label === "punctuation-headword-candidate"
    ) {
      flags.push(label);
    }
  }
  return [...new Set(flags)];
}

function priorityFor(flags: string[]): number {
  return flags.reduce((total, flag) => total + (FLAG_WEIGHTS[flag] ?? 1), 0);
}

async function countJsonl(filePath: string): Promise<number> {
  if (!existsSync(filePath)) return 0;
  const text = await readFile(filePath, "utf8");
  return text.split(/\r?\n/g).filter((line) => line.trim()).length;
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

const sourceMap = new Map(usedSources().map((source) => [source.key, source]));
const words = await readArrays<WordEntry>(path.join(PROCESSED_DIR, "words"));
const quality = existsSync(path.join(PROCESSED_DIR, "quality-summary.json"))
  ? await readJson<QualitySummaryLike>(path.join(PROCESSED_DIR, "quality-summary.json"))
  : {};

const records: DefinitionRecord[] = [];
const sourceStats = new Map<string, SourceStatsWorking>();
const exactDuplicateCandidates: Array<{
  word: string;
  key: string;
  count: number;
  sources: string[];
  definitions: Array<{ source: string; index: number; meaning: string }>;
}> = [];
const nearDuplicateCandidates: Array<{
  word: string;
  score: number;
  left: { source: string; index: number; meaning: string };
  right: { source: string; index: number; meaning: string };
}> = [];
const distantSenseCandidates: Array<{
  word: string;
  score: number;
  left: { source: string; index: number; meaning: string };
  right: { source: string; index: number; meaning: string };
}> = [];
const highDefinitionHeadwords: Array<{
  word: string;
  definitions: number;
  sources: string[];
  pos: string[];
  labels: string[];
}> = [];

function getSourceStats(source: string): SourceStatsWorking {
  const info = sourceMap.get(source);
  const existing = sourceStats.get(source);
  if (existing) return existing;
  const created: SourceStatsWorking = {
    source,
    rightsStatus: info?.rightsStatus ?? "unknown",
    quality: info?.quality ?? "unknown",
    headwords: new Set<string>(),
    definitions: 0,
    viDefinitions: 0,
    enDefinitions: 0,
    withExamples: 0,
    withLabels: 0,
    lowConfidence: 0,
    humanReviewed: 0,
    machineChecked: 0,
    unreviewed: 0,
    priorityFlags: 0,
    confidenceTotal: 0
  };
  sourceStats.set(source, created);
  return created;
}

for (const entry of words) {
  const entryRecords: DefinitionRecord[] = [];
  for (const [definitionIndex, definition] of entry.definitions.entries()) {
    const sourceInfo = sourceMap.get(definition.source);
    const sourceRights = sourceInfo?.rightsStatus ?? "unknown";
    const flags = flagsFor(entry, definition, sourceRights);
    const record: DefinitionRecord = {
      entryId: entry.id,
      word: entry.word,
      definitionIndex,
      meaning: definition.meaning,
      source: definition.source,
      sourceRights,
      sourceQuality: sourceInfo?.quality ?? "unknown",
      language: definition.language,
      labels: definition.labels,
      examplesCount: definition.examples.length,
      confidence: definition.provenance.confidence,
      reviewStatus: definition.provenance.review_status,
      partOfSpeech: entry.part_of_speech,
      entrySources: entry.sources,
      normalizedKey: normalizeDefinitionKey(definition.meaning),
      tokens: tokensFor(definition.meaning),
      flags,
      priority: priorityFor(flags),
      hasSenseId: hasSenseId(definition)
    };
    records.push(record);
    entryRecords.push(record);

    const stats = getSourceStats(record.source);
    stats.headwords.add(entry.word);
    stats.definitions += 1;
    if (definition.language === "vi") stats.viDefinitions += 1;
    if (definition.language === "en") stats.enDefinitions += 1;
    if (definition.examples.length > 0) stats.withExamples += 1;
    if (definition.labels.length > 0) stats.withLabels += 1;
    if (definition.provenance.confidence < 0.75) stats.lowConfidence += 1;
    if (definition.provenance.review_status === "human-reviewed") stats.humanReviewed += 1;
    if (definition.provenance.review_status === "machine-checked") stats.machineChecked += 1;
    if (definition.provenance.review_status === "unreviewed") stats.unreviewed += 1;
    stats.priorityFlags += flags.length;
    stats.confidenceTotal += definition.provenance.confidence;
  }

  const exactByKey = new Map<string, DefinitionRecord[]>();
  for (const record of entryRecords) {
    const group = exactByKey.get(record.normalizedKey) ?? [];
    group.push(record);
    exactByKey.set(record.normalizedKey, group);
  }
  for (const [key, group] of exactByKey.entries()) {
    const sources = [...new Set(group.map((record) => record.source))].sort();
    if (key && group.length > 1 && sources.length > 1) {
      exactDuplicateCandidates.push({
        word: entry.word,
        key,
        count: group.length,
        sources,
        definitions: group.map((record) => ({
          source: record.source,
          index: record.definitionIndex,
          meaning: snippet(record.meaning)
        }))
      });
    }
  }

  for (let i = 0; i < entryRecords.length; i += 1) {
    for (let j = i + 1; j < entryRecords.length; j += 1) {
      const left = entryRecords[i]!;
      const right = entryRecords[j]!;
      if (left.normalizedKey === right.normalizedKey) continue;
      if (left.tokens.length < 4 || right.tokens.length < 4) continue;
      const score = jaccard(left.tokens, right.tokens);
      if (score >= 0.82) {
        nearDuplicateCandidates.push({
          word: entry.word,
          score: Number(score.toFixed(4)),
          left: { source: left.source, index: left.definitionIndex, meaning: snippet(left.meaning) },
          right: { source: right.source, index: right.definitionIndex, meaning: snippet(right.meaning) }
        });
      } else if (distantSenseCandidates.length < 5000 && score <= 0.2) {
        distantSenseCandidates.push({
          word: entry.word,
          score: Number(score.toFixed(4)),
          left: { source: left.source, index: left.definitionIndex, meaning: snippet(left.meaning) },
          right: { source: right.source, index: right.definitionIndex, meaning: snippet(right.meaning) }
        });
      }
    }
  }

  if (entry.definitions.length >= 12 || (entry.sources.length >= 3 && entry.definitions.length >= 8)) {
    highDefinitionHeadwords.push({
      word: entry.word,
      definitions: entry.definitions.length,
      sources: entry.sources,
      pos: entry.part_of_speech,
      labels: [...new Set(entry.definitions.flatMap((definition) => definition.labels))].sort()
    });
  }
}

const reviewQueue = records
  .filter((record) => record.priority > 0)
  .sort(
    (a, b) =>
      b.priority - a.priority ||
      b.flags.length - a.flags.length ||
      a.word.localeCompare(b.word, "vi") ||
      a.definitionIndex - b.definitionIndex
  );

const sourceStatsOutput: SourceStatsOutput[] = [...sourceStats.values()]
  .map((stats) => ({
    source: stats.source,
    rightsStatus: stats.rightsStatus,
    quality: stats.quality,
    headwords: stats.headwords.size,
    definitions: stats.definitions,
    viDefinitions: stats.viDefinitions,
    enDefinitions: stats.enDefinitions,
    withExamples: stats.withExamples,
    withLabels: stats.withLabels,
    lowConfidence: stats.lowConfidence,
    humanReviewed: stats.humanReviewed,
    machineChecked: stats.machineChecked,
    unreviewed: stats.unreviewed,
    priorityFlags: stats.priorityFlags,
    averageConfidence: stats.definitions === 0 ? 0 : Number((stats.confidenceTotal / stats.definitions).toFixed(4))
  }))
  .sort((a, b) => b.definitions - a.definitions || a.source.localeCompare(b.source));

const flagCounts = count(records.flatMap((record) => record.flags));
const languageCounts = count(records.map((record) => record.language));
const reviewStatusCounts = count(records.map((record) => record.reviewStatus));
const labelCounts = count(records.flatMap((record) => record.labels));
const goldPairs = await countJsonl(path.join(AUDIT_DIR, "gold-sense-pairs.jsonl"));
const humanReviewedDefinitions = records.filter((record) => record.reviewStatus === "human-reviewed").length;
const senseIdDefinitions = records.filter((record) => record.hasSenseId).length;
const totalDefinitions = records.length;
const reviewQueueSample = reviewQueue.slice(0, REVIEW_QUEUE_LIMIT).map((record) => ({
  priority: record.priority,
  flags: record.flags,
  word: record.word,
  entry_id: record.entryId,
  definition_index: record.definitionIndex,
  source: record.source,
  language: record.language,
  confidence: record.confidence,
  review_status: record.reviewStatus,
  meaning: record.meaning
}));
exactDuplicateCandidates.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "vi"));
nearDuplicateCandidates.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, "vi"));
distantSenseCandidates.sort((a, b) => a.score - b.score || a.word.localeCompare(b.word, "vi"));
highDefinitionHeadwords.sort((a, b) => b.definitions - a.definitions || a.word.localeCompare(b.word, "vi"));
const goldSensePairsTodo: Array<{
  id: string;
  category: "exact_cross_source_duplicate" | "near_duplicate" | "distant_same_headword";
  word: string;
  score: number | null;
  left: { source: string; index: number; meaning: string };
  right: { source: string; index: number; meaning: string };
  label: null;
  label_options: string[];
  reviewer_notes: string;
}> = [];
const todoIds = new Set<string>();
const labelOptions = ["same_sense", "near_paraphrase", "different_sense", "encyclopedic_or_name", "unclear"];
function addGoldTodo(
  category: "exact_cross_source_duplicate" | "near_duplicate" | "distant_same_headword",
  word: string,
  score: number | null,
  left: { source: string; index: number; meaning: string },
  right: { source: string; index: number; meaning: string }
): boolean {
  if (goldSensePairsTodo.length >= 1000) return false;
  const id = `gold-todo-${shortHash(`${category}:${word}:${left.source}:${left.index}:${right.source}:${right.index}:${score ?? ""}`)}`;
  if (todoIds.has(id)) return false;
  todoIds.add(id);
  goldSensePairsTodo.push({
    id,
    category,
    word,
    score,
    left,
    right,
    label: null,
    label_options: labelOptions,
    reviewer_notes: ""
  });
  return true;
}

let exactTodoCount = 0;
for (const group of exactDuplicateCandidates) {
  if (exactTodoCount >= 334) break;
  const left = group.definitions[0];
  const right = group.definitions.find((definition) => definition.source !== left?.source) ?? group.definitions[1];
  if (!left || !right) continue;
  if (addGoldTodo("exact_cross_source_duplicate", group.word, null, left, right)) exactTodoCount += 1;
}
let nearTodoCount = 0;
for (const pair of nearDuplicateCandidates) {
  if (nearTodoCount >= 333) break;
  if (addGoldTodo("near_duplicate", pair.word, pair.score, pair.left, pair.right)) nearTodoCount += 1;
}
let distantTodoCount = 0;
for (const pair of distantSenseCandidates) {
  if (distantTodoCount >= 333) break;
  if (addGoldTodo("distant_same_headword", pair.word, pair.score, pair.left, pair.right)) distantTodoCount += 1;
}

const academicGates = {
  phase5Status:
    senseIdDefinitions === totalDefinitions &&
    goldPairs >= 1000 &&
    humanReviewedDefinitions >= 500 &&
    exactDuplicateCandidates.length === 0
      ? "READY_FOR_PHA5_RELEASE"
      : "NOT_READY_FOR_ACADEMIC_RELEASE",
  senseIdCoverage: {
    definitionsWithSenseId: senseIdDefinitions,
    totalDefinitions,
    percent: percent(senseIdDefinitions, totalDefinitions),
    passed: senseIdDefinitions === totalDefinitions
  },
  goldSamplePairs: {
    current: goldPairs,
    required: 1000,
    passed: goldPairs >= 1000
  },
  humanReviewedDefinitions: {
    current: humanReviewedDefinitions,
    requiredMinimum: 500,
    percent: percent(humanReviewedDefinitions, totalDefinitions),
    passed: humanReviewedDefinitions >= 500
  },
  duplicateCandidateReport: {
    exactCrossSourceGroups: exactDuplicateCandidates.length,
    nearDuplicatePairs: nearDuplicateCandidates.length,
    generated: true
  },
  reviewQueue: {
    definitionsNeedingReview: reviewQueue.length,
    sampledDefinitions: reviewQueueSample.length,
    percent: percent(reviewQueue.length, totalDefinitions)
  },
  goldSampleTodo: {
    pairs: goldSensePairsTodo.length,
    generated: goldSensePairsTodo.length >= 1000
  }
};

const summary = {
  generatedAt: new Date().toISOString(),
  release: {
    buildId: quality.release?.buildId ?? "unknown",
    datasetVersion: quality.release?.datasetVersion ?? "unknown",
    profile: quality.release?.profile ?? "unknown",
    selectedSources: quality.release?.selectedSources ?? usedSources().length
  },
  layers: {
    headwords: words.length,
    definitions: totalDefinitions
  },
  academicGates,
  coverage: {
    definitionsByLanguage: languageCounts,
    definitionsByReviewStatus: reviewStatusCounts,
    topLabels: Object.fromEntries(Object.entries(labelCounts).slice(0, 30)),
    topFlags: Object.fromEntries(Object.entries(flagCounts).slice(0, 30)),
    humanReviewedPercent: percent(humanReviewedDefinitions, totalDefinitions),
    lowConfidenceDefinitions: records.filter((record) => record.flags.includes("low-confidence")).length,
    unclearRightsDefinitions: records.filter((record) => record.flags.includes("documented-unclear-source")).length,
    definitionsWithExamples: records.filter((record) => record.examplesCount > 0).length,
    definitionsWithLabels: records.filter((record) => record.labels.length > 0).length,
    definitionsWithSenseId: senseIdDefinitions
  }
};

const duplicateReport = {
  exactCrossSourceGroups: exactDuplicateCandidates.slice(0, 1000),
  nearDuplicatePairs: nearDuplicateCandidates.slice(0, 1000),
  distantSameHeadwordPairs: distantSenseCandidates.slice(0, 1000),
  highDefinitionHeadwords: highDefinitionHeadwords.slice(0, 500)
};

await ensureDir(AUDIT_DIR);
await writeJson(path.join(AUDIT_DIR, "summary.json"), summary);
await writeJson(path.join(AUDIT_DIR, "source-academic-stats.json"), sourceStatsOutput);
await writeJson(path.join(AUDIT_DIR, "duplicate-candidates.json"), duplicateReport);
await writeJsonl(path.join(AUDIT_DIR, "review-queue.sample.jsonl"), reviewQueueSample);
await writeJsonl(path.join(AUDIT_DIR, "gold-sense-pairs.todo.jsonl"), goldSensePairsTodo);

console.log(
  `[academic:audit] ${academicGates.phase5Status}: ${number(words.length)} words, ${number(totalDefinitions)} definitions, ` +
    `${number(reviewQueue.length)} review candidates, ${number(exactDuplicateCandidates.length)} exact duplicate groups, ` +
    `${number(nearDuplicateCandidates.length)} near-duplicate pairs, ${number(goldSensePairsTodo.length)} gold todo pairs`
);
