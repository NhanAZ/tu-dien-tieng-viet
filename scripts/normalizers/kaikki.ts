import {
  cleanText,
  dedupeStrings,
  isSingleHanCharacter,
  titleCaseVietnamese
} from "../lib/text.js";

export interface KaikkiSense {
  glosses?: string[];
  raw_glosses?: string[];
  examples?: Array<string | { text?: string; translation?: string; english?: string }>;
  tags?: string[];
  categories?: string[];
}

export interface KaikkiEntry {
  word?: string;
  lang?: string;
  lang_code?: string;
  pos?: string;
  sounds?: Array<Record<string, unknown>>;
  senses?: KaikkiSense[];
  etymology_text?: string;
  synonyms?: unknown[];
  antonyms?: unknown[];
  related?: unknown[];
  derived?: unknown[];
  forms?: Array<Record<string, unknown>>;
  categories?: string[];
  etymology_texts?: string[];
}

interface NumberedMarker {
  index: number;
  end: number;
  number: number;
}

export function splitKaikkiNumberedGloss(gloss: string): string[] {
  const text = cleanText(gloss).replace(
    /^(?:d|dt|đt|đg|đgt|t|tt|trt|tht|lt|l|pt|pht|ph)\.\s+(?=[1-9]\d?[.)](?:\s|$))/iu,
    ""
  );
  const leading = text.match(/^([1-9]\d?)[.)](?:\s+|$)/u);
  if (!leading) return text ? [text] : [];

  const candidates: NumberedMarker[] = [];
  const markerPattern = /(?<!\S)([1-9]\d?)[.)](?=\s|$)/gu;
  for (const match of text.matchAll(markerPattern)) {
    candidates.push({
      index: match.index,
      end: match.index + match[0].length,
      number: Number(match[1])
    });
  }

  const selected: NumberedMarker[] = [];
  let expected = candidates[0]?.number ?? 1;
  for (const candidate of candidates) {
    if (candidate.number !== expected) continue;
    selected.push(candidate);
    expected += 1;
  }

  const definitions = selected
    .map((marker, index) => cleanText(text.slice(marker.end, selected[index + 1]?.index ?? text.length)))
    .filter(Boolean);
  return definitions;
}

export function senseGlosses(sense: KaikkiSense, cleanNumbering = false): string[] {
  const glosses = dedupeStrings([...(sense.glosses ?? []), ...(sense.raw_glosses ?? [])]);
  return cleanNumbering ? dedupeStrings(glosses.flatMap(splitKaikkiNumberedGloss)) : glosses;
}

export function senseExamples(sense: KaikkiSense): string[] {
  const examples = sense.examples ?? [];
  return dedupeStrings(
    examples.flatMap((example) => {
      if (typeof example === "string") return [example];
      return [example.text, example.translation, example.english].filter(Boolean) as string[];
    })
  );
}

export function isVietnameseKaikkiEntry(entry: KaikkiEntry): boolean {
  const langCode = cleanText(entry.lang_code).toLowerCase();
  const lang = cleanText(entry.lang).toLowerCase();
  return langCode === "vi" || lang === "tiếng việt" || lang === "vietnamese";
}

export function isHanKaikkiEntry(entry: KaikkiEntry, word: string): boolean {
  if (!isSingleHanCharacter(word)) return false;
  const langCode = cleanText(entry.lang_code).toLowerCase();
  const lang = cleanText(entry.lang).toLowerCase();
  const pos = cleanText(entry.pos).toLowerCase();
  return (
    ["zh", "cmn", "lzh", "vi"].includes(langCode) ||
    lang.includes("trung") ||
    lang.includes("hán") ||
    pos === "character" ||
    pos === "han character"
  );
}

export function readingsFromKaikki(entry: KaikkiEntry): string[] {
  const values: string[] = [];
  for (const sound of entry.sounds ?? []) {
    const tags = Array.isArray(sound.tags) ? sound.tags.map((tag) => cleanText(tag).toLowerCase()) : [];
    const isHanViet = tags.some(
      (tag) => tag.includes("hán") || tag.includes("han-viet") || tag.includes("sino-vietnamese")
    );
    for (const key of ["han_viet", "hanviet", ...(isHanViet ? ["roman", "reading"] : [])]) {
      const value = sound[key];
      if (typeof value === "string" && /[A-Za-zÀ-ỹ]/.test(value)) values.push(value);
    }
  }
  return dedupeStrings(values.map((value) => titleCaseVietnamese(value)).filter(Boolean));
}

export function ipaFromKaikki(entry: KaikkiEntry): string | null {
  for (const sound of entry.sounds ?? []) {
    const value = sound.ipa;
    if (typeof value === "string" && value.trim()) return cleanText(value);
  }
  return null;
}

export function relationWords(values: unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const words: string[] = [];
  for (const value of values) {
    if (typeof value === "string") {
      words.push(value);
    } else if (value && typeof value === "object" && "word" in value) {
      words.push((value as { word?: unknown }).word as string);
    }
  }
  return dedupeStrings(words);
}
