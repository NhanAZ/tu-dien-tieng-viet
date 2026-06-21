import crypto from "node:crypto";

import type { WordOrigin } from "./types.js";

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const VIETNAMESE_TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/g;

export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

export function dedupeStrings(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

export function foldVietnamese(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFC")
    .toLowerCase();
}

export function stripToneMarks(value: string): string {
  return value.normalize("NFD").replace(VIETNAMESE_TONE_MARKS, "").normalize("NFC").toLowerCase();
}

export function slugifyWord(word: string): string {
  const folded = foldVietnamese(word)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return folded || `word-${shortHash(word)}`;
}

export function shortHash(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 8);
}

export function wordBucket(word: string): string {
  const folded = foldVietnamese(word);
  const first = folded.match(/[a-z]/)?.[0];
  return first ?? "other";
}

export function wordMergeKey(word: string): string {
  return cleanText(word).toLocaleLowerCase("vi-VN");
}

export function normalizeHeadword(word: string): string {
  return wordMergeKey(word);
}

export function countSyllables(word: string): number {
  return Math.max(1, cleanText(word).split(/[\s-]+/g).filter(Boolean).length);
}

export function toneSignature(value: string): string {
  return [...value.normalize("NFD")]
    .filter((char) => ["\u0300", "\u0301", "\u0303", "\u0309", "\u0323"].includes(char))
    .map((char) => char.codePointAt(0)!.toString(16))
    .join("-");
}

export function splitExamples(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupeStrings(value.flatMap((item) => splitExamples(item)));
  }
  const text = cleanText(value);
  if (!text) return [];
  return dedupeStrings(text.split(/\s+~\s+|\s+\|\s+/g));
}

export function mapPartOfSpeech(pos: unknown): string {
  const text = cleanText(pos);
  if (!text) return "";
  const normalized = text.toLocaleLowerCase("vi-VN");
  const aliases: Record<string, string> = {
    "danh từ": "danh từ",
    "động từ": "động từ",
    "tính từ": "tính từ",
    "phó từ": "phó từ",
    "trạng từ": "trạng từ",
    "đại từ": "đại từ",
    "định từ": "định từ",
    "liên từ": "liên từ",
    "thán từ": "thán từ",
    "số từ": "số từ",
    "noun": "danh từ",
    "proper noun": "danh từ",
    "verb": "động từ",
    "adjective": "tính từ",
    "adj": "tính từ",
    "adverb": "phó từ",
    "pronoun": "đại từ",
    "determiner": "định từ",
    "conjunction": "liên từ",
    "interjection": "thán từ",
    "numeral": "số từ",
    "number": "số từ",
    "particle": "phụ từ",
    "prefix": "phụ tố",
    "suffix": "hậu tố",
    "circumfix": "phụ tố",
    "character": "khác",
    "letter": "khác",
    "symbol": "khác",
    "other": "khác"
  };
  if (aliases[normalized]) return aliases[normalized];
  const code = text.toUpperCase();
  const mapping: Record<string, string> = {
    A: "tính từ",
    C: "liên từ",
    D: "định từ",
    I: "thán từ",
    M: "số từ",
    N: "danh từ",
    P: "đại từ",
    R: "phó từ",
    V: "động từ",
    X: "khác"
  };
  if (/^[A-Z]$/.test(code)) return mapping[code] ?? "khác";
  return text;
}

export function inferOrigin(texts: string[], fallback: WordOrigin = "không rõ"): WordOrigin {
  const haystack = foldVietnamese(texts.join(" "));
  if (haystack.includes("han viet") || haystack.includes("sino-vietnamese") || haystack.includes("goc han")) {
    return "Hán Việt";
  }
  if (haystack.includes("muon") || haystack.includes("vay muon") || haystack.includes("loanword")) {
    return "vay mượn khác";
  }
  return fallback;
}

export function isHanCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0x20000 && codePoint <= 0x2a6df) ||
    (codePoint >= 0x2a700 && codePoint <= 0x2b73f) ||
    (codePoint >= 0x2b740 && codePoint <= 0x2b81f) ||
    (codePoint >= 0x2b820 && codePoint <= 0x2ceaf) ||
    (codePoint >= 0x2ceb0 && codePoint <= 0x2ebef) ||
    (codePoint >= 0x30000 && codePoint <= 0x3134f) ||
    (codePoint >= 0x31350 && codePoint <= 0x323af) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff)
  );
}

export function hanChars(value: string): string[] {
  const chars: string[] = [];
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint && isHanCodePoint(codePoint)) chars.push(char);
  }
  return dedupeStrings(chars);
}

export function isSingleHanCharacter(value: string): boolean {
  const chars = [...value];
  if (chars.length !== 1) return false;
  const codePoint = chars[0]?.codePointAt(0);
  return Boolean(codePoint && isHanCodePoint(codePoint));
}

export function codePointId(character: string): string {
  const codePoint = character.codePointAt(0);
  if (!codePoint) throw new Error(`Invalid Han character: ${character}`);
  return `u+${codePoint.toString(16).toUpperCase()}`;
}

export function titleCaseVietnamese(value: string): string {
  const text = cleanText(value).toLowerCase();
  if (!text) return "";
  return text
    .split(/\s+/g)
    .map((part) => `${part.slice(0, 1).toLocaleUpperCase("vi-VN")}${part.slice(1)}`)
    .join(" ");
}

export function uniqueByMeaning<T extends { meaning: string; source?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = foldVietnamese(item.meaning).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const source = item.source ?? "";
    const scoped = `${source}:${key}`;
    if (!key || seen.has(scoped)) continue;
    seen.add(scoped);
    out.push(item);
  }
  return out;
}
