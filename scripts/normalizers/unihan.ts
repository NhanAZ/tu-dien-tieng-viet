import AdmZip from "adm-zip";

import { dedupeStrings } from "../lib/text.js";

export interface UnihanRecord {
  kVietnamese?: string;
  kDefinition?: string;
  kRSUnicode?: string;
  kTotalStrokes?: string;
  variants: string[];
}

export function parseUnihanData(zipPath: string): Map<string, UnihanRecord> {
  const zip = new AdmZip(zipPath);
  const records = new Map<string, UnihanRecord>();
  const interestingFiles = new Set([
    "Unihan_Readings.txt",
    "Unihan_IRGSources.txt",
    "Unihan_RadicalStrokeCounts.txt",
    "Unihan_Variants.txt"
  ]);

  for (const entry of zip.getEntries()) {
    if (!interestingFiles.has(entry.entryName)) continue;
    const lines = entry.getData().toString("utf8").split(/\r?\n/g);
    for (const line of lines) {
      if (!line || line.startsWith("#")) continue;
      const [code, field, value] = line.split("\t");
      if (!code || !field || !value) continue;
      const hex = code.replace(/^U\+/, "");
      const character = String.fromCodePoint(Number.parseInt(hex, 16));
      const record = records.get(character) ?? { variants: [] };
      if (field === "kVietnamese") record.kVietnamese = value;
      if (field === "kDefinition") record.kDefinition = value;
      if (field === "kRSUnicode") record.kRSUnicode = value;
      if (field === "kTotalStrokes") record.kTotalStrokes = value;
      if (field.endsWith("Variant")) {
        record.variants.push(...value.split(/\s+/g).map((item) => item.replace(/^U\+/, "")));
      }
      records.set(character, record);
    }
  }

  return records;
}

export function parseTotalStrokes(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function parseRadicalStroke(value: string | undefined, totalStrokes: number | null) {
  if (!value) return { radicalNumber: null, residualStrokes: null };
  const match = value.match(/(\d+)'?\.(\d+)/);
  if (!match) return { radicalNumber: null, residualStrokes: null };
  const radicalNumber = Number.parseInt(match[1] ?? "", 10);
  const residualStrokes = Number.parseInt(match[2] ?? "", 10);
  return {
    radicalNumber: Number.isFinite(radicalNumber) ? radicalNumber : null,
    residualStrokes: Number.isFinite(residualStrokes) && totalStrokes ? residualStrokes : null
  };
}

export function variantCharacters(hexValues: string[]): string[] {
  return dedupeStrings(
    hexValues
      .map((hex) => Number.parseInt(hex, 16))
      .filter((codePoint) => Number.isFinite(codePoint))
      .map((codePoint) => String.fromCodePoint(codePoint))
  );
}
