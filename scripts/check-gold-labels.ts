import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ROOT } from "./lib/paths.js";

interface GoldPair {
  id?: string;
  word?: string;
  label?: string | null;
  left?: { sense_id?: string | null; source?: string; index?: number; meaning?: string };
  right?: { sense_id?: string | null; source?: string; index?: number; meaning?: string };
}

const GOLD_PATH = path.join(ROOT, "data", "audit", "academic", "gold-sense-pairs.jsonl");
const MINIMUM_PAIRS = 1000;
const ALLOWED_LABELS = new Set(["same_sense", "near_paraphrase", "different_sense", "encyclopedic_or_name", "unclear"]);

if (!existsSync(GOLD_PATH)) {
  console.error(
    `[academic:gold:check] Missing ${path.relative(ROOT, GOLD_PATH)}. ` +
      "Create it by human-labeling gold-sense-pairs.todo.jsonl or gold-sense-pairs.sense-todo.jsonl."
  );
  process.exit(1);
}

const rows = (await readFile(GOLD_PATH, "utf8"))
  .split(/\r?\n/g)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line) as GoldPair;
    } catch (error) {
      throw new Error(`Invalid JSONL at row ${index + 1}: ${(error as Error).message}`);
    }
  });

const invalid = rows
  .map((row, index) => ({ row, index }))
  .filter(({ row }) => {
    return (
      !row.id ||
      !row.word ||
      !row.label ||
      !ALLOWED_LABELS.has(row.label) ||
      !row.left?.meaning ||
      !row.right?.meaning
    );
  });

const uniqueIds = new Set(rows.map((row) => row.id).filter(Boolean));
const duplicateIds = rows.length - uniqueIds.size;

if (rows.length < MINIMUM_PAIRS || invalid.length > 0 || duplicateIds > 0) {
  console.error(
    `[academic:gold:check] FAIL: ${rows.length}/${MINIMUM_PAIRS} rows, ` +
      `${invalid.length} invalid rows, ${duplicateIds} duplicate ids.`
  );
  for (const item of invalid.slice(0, 10)) {
    console.error(JSON.stringify({ row: item.index + 1, value: item.row }, null, 2));
  }
  process.exit(1);
}

const counts: Record<string, number> = {};
for (const row of rows) counts[row.label!] = (counts[row.label!] ?? 0) + 1;

console.log(
  `[academic:gold:check] PASS: ${rows.length} labeled gold pairs; ` +
    Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => `${label}=${count}`)
      .join(", ")
);

