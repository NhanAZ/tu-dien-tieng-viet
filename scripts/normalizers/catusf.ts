import { cleanText } from "../lib/text.js";

const POS_CODE_PATTERN = "(?:d|dt|đt|đg|đgt|t|tt|trt|tht|lt|l|pt|pht|ph)";

interface NumberedMarker {
  index: number;
  end: number;
  number: number;
}

export function stripCatusfLineSenseMarker(line: string): string {
  return cleanText(line).replace(/^([1-9]\d?)[.)]\s+(?=\S)/u, "");
}

export function splitCatusfNumberedDefinitions(line: string): string[] {
  const text = cleanText(line).replace(
    new RegExp(`^[1-9]\\d?[\\).]?\\s+(?=${POS_CODE_PATTERN}\\.\\s)`, "iu"),
    ""
  );
  const candidates: NumberedMarker[] = [];
  const markerPattern = /(?<!\S)([1-9]\d?)[.)](?=\s)/gu;
  for (const match of text.matchAll(markerPattern)) {
    candidates.push({
      index: match.index,
      end: match.index + match[0].length,
      number: Number(match[1])
    });
  }

  const selected: NumberedMarker[] = [];
  let expected = 1;
  for (const candidate of candidates) {
    if (candidate.number !== expected) continue;
    selected.push(candidate);
    expected += 1;
  }
  if (selected.length === 0) return [text];

  const prefix = cleanText(text.slice(0, selected[0]!.index));
  const definitions: string[] = [];
  for (const [index, marker] of selected.entries()) {
    const next = selected[index + 1];
    const meaning = cleanText(text.slice(marker.end, next?.index ?? text.length));
    if (!meaning) continue;
    definitions.push(index === 0 && prefix ? cleanText(`${prefix} ${meaning}`) : meaning);
  }
  return definitions.length > 0 ? definitions : [text];
}
