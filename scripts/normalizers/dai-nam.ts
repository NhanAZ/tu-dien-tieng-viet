import { load } from "cheerio";

import { cleanText, dedupeStrings, foldVietnamese, hanChars } from "../lib/text.js";
import { sourceTrace } from "../lib/provenance.js";
import type { WordEntry } from "../lib/types.js";

export interface DaiNamSnapshot {
  pages: Array<{ pageid: number; title: string; revid: number; html: string }>;
}

function historicalPos(value: string): string {
  const normalized = foldVietnamese(value).replace(/[.()]/g, "").trim();
  const mapping: Record<string, string> = {
    c: "danh từ",
    d: "động từ",
    dg: "động từ",
    n: "thán từ",
    t: "tính từ"
  };
  return mapping[normalized] ?? cleanText(value);
}

export function parseDaiNamSnapshot(
  snapshot: DaiNamSnapshot,
  source: string,
  emptyWordEntry: (word: string, source: string) => WordEntry,
  validLexeme: (word: string) => boolean
): WordEntry[] {
  const entries: WordEntry[] = [];
  for (const page of snapshot.pages) {
    const section = page.title.split("/").at(-1) ?? "";
    if (!/^[A-ZĐ](?: \(tiếp theo(?: \d+)?\))?$/.test(section)) continue;
    const $ = load(page.html);
    $("tr").each((rowIndex, row) => {
      const cells = $(row).children("td");
      if (cells.length < 2 || $(cells[0]).find("span.Hani").length === 0) return;
      const headSpan = $(cells[1]).find('span[style*="font-size: larger"]').first();
      const word = cleanText(headSpan.text()).replace(/[.：:]$/u, "");
      if (!validLexeme(word)) return;

      const posText = cleanText($(cells[1]).find("i").first().text());
      const definitionCell = $(cells[1]).clone();
      definitionCell.find('span[style*="font-size: larger"]').first().remove();
      definitionCell.find("i").first().remove();
      const meaning = cleanText(definitionCell.text()).replace(/^[.\s:]+/u, "");
      if (!meaning) return;

      const entry = emptyWordEntry(word, source);
      entry.part_of_speech = posText ? [historicalPos(posText)] : [];
      entry.han_nom_forms = hanChars($(cells[0]).text());
      entry.definitions = [
        {
          meaning,
          examples: [],
          source,
          language: "vi",
          provenance: sourceTrace(source, `${page.pageid}:row:${rowIndex}`, $.html(row), {
            sourceRevision: String(page.revid),
            confidence: 0.8
          }),
          labels: ["historical", "1895-1896"]
        }
      ];

      const entryTable = $(row).closest("table");
      let sibling = entryTable.next();
      let compoundIndex = 0;
      let previousCompoundMeaning = "";
      while (sibling.length > 0 && !sibling.is("table")) {
        if (sibling.is("div")) {
          const phraseNode = sibling.find("i").first();
          const rawPhrase = cleanText(phraseNode.text());
          const phrase = cleanText(
            rawPhrase
              .replace(/^[―—–-]+/g, `${word} `)
              .replace(/[―—–-]+$/g, ` ${word}`)
              .replace(/[―—–]+/g, word)
          ).replace(/^[.\s:]+|[.\s:]+$/g, "");
          const definitionNode = sibling.clone();
          definitionNode.find("i").first().remove();
          let compoundMeaning = cleanText(definitionNode.text()).replace(/^[|.\s:]+/u, "");
          if (/^id\.?$/i.test(compoundMeaning) && previousCompoundMeaning) {
            compoundMeaning = previousCompoundMeaning;
          }
          if (validLexeme(phrase) && phrase !== word && compoundMeaning) {
            compoundIndex += 1;
            entry.compound_words.push(phrase);
            const compound = emptyWordEntry(phrase, source);
            compound.definitions = [
              {
                meaning: compoundMeaning,
                examples: [],
                source,
                language: "vi",
                provenance: sourceTrace(
                  source,
                  `${page.pageid}:row:${rowIndex}:compound:${compoundIndex}`,
                  $.html(sibling),
                  { sourceRevision: String(page.revid), confidence: 0.7 }
                ),
                labels: ["historical", "1895-1896"]
              }
            ];
            entries.push(compound);
            previousCompoundMeaning = compoundMeaning;
          }
        }
        sibling = sibling.next();
      }
      entry.compound_words = dedupeStrings(entry.compound_words);
      entries.push(entry);
    });
  }
  return entries;
}
