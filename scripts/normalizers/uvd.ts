import { parse as parseYaml } from "yaml";

import { cleanText, dedupeStrings, mapPartOfSpeech, splitExamples } from "../lib/text.js";
import { sourceTrace } from "../lib/provenance.js";
import type { Definition } from "../lib/types.js";

export interface UvdDefinition {
  def?: string;
  examples?: string[];
}

export interface UvdSense {
  tag?: string;
  defs?: UvdDefinition[];
}

export function parseUvdYaml(text: string): Record<string, UvdSense[]> {
  return parseYaml(text) as Record<string, UvdSense[]>;
}

export function parseUvdSenses(
  word: string,
  senses: UvdSense[],
  source: string
): { partOfSpeech: string[]; definitions: Definition[] } {
  const partOfSpeech = dedupeStrings(senses.map((sense) => mapPartOfSpeech(sense.tag)));
  const definitions = senses
    .flatMap((sense, senseIndex) =>
      (sense.defs ?? []).map((definition, definitionIndex) => ({
        meaning: cleanText(definition.def),
        examples: splitExamples(definition.examples ?? []),
        source,
        language: "vi" as const,
        provenance: sourceTrace(
          source,
          `${word}:${senseIndex + 1}:${definitionIndex + 1}`,
          JSON.stringify({ word, senseIndex, definition }),
          { confidence: 0.9 }
        ),
        labels: []
      }))
    )
    .filter((definition) => definition.meaning);
  return { partOfSpeech, definitions };
}
