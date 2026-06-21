export type WordOrigin = "thuần Việt" | "Hán Việt" | "vay mượn khác" | "không rõ";

export interface SourceTrace {
  source_id: string;
  source_entry_id: string | null;
  source_revision: string | null;
  raw_record_hash: string;
  confidence: number;
  review_status: "unreviewed" | "machine-checked" | "human-reviewed";
}

export interface Definition {
  meaning: string;
  examples: string[];
  source: string;
  language: "vi" | "en" | "fr" | "la" | "other";
  provenance: SourceTrace;
  labels: string[];
}

export interface EtymologyFact {
  text: string;
  language: "vi" | "en" | "other";
  source: string;
  provenance: SourceTrace;
}

export interface WordEntry {
  id: string;
  word: string;
  headword_normalized: string;
  headword_no_tone: string;
  syllable_count: number;
  language: "vi";
  pronunciation_ipa: string | null;
  part_of_speech: string[];
  origin: WordOrigin;
  han_viet_ref: string[];
  han_nom_forms: string[];
  definitions: Definition[];
  etymologies: EtymologyFact[];
  synonyms: string[];
  antonyms: string[];
  related_words: string[];
  compound_words: string[];
  sources: string[];
}

export interface HanMeaning {
  meaning: string;
  source: string;
  language: "vi" | "en" | "other";
  provenance: SourceTrace;
}

export interface HanCharacterEntry {
  id: string;
  character: string;
  radical: string | null;
  radical_stroke_count: number | null;
  total_stroke_count: number | null;
  readings_han_viet: string[];
  readings_nom: string[];
  writing_systems: Array<"Hán" | "Nôm">;
  meanings: HanMeaning[];
  compound_examples: string[];
  variant_forms: string[];
  sources: string[];
}

export interface JsonlCounts {
  words: number;
  hanCharacters: number;
  skipped: number;
}

export interface LexemeEvidence {
  source_id: string;
  source_entry_id: string | null;
  raw_record_hash: string;
}

export interface LexemeEntry {
  id: string;
  headword: string;
  headword_normalized: string;
  headword_no_tone: string;
  syllable_count: number;
  language: "vi";
  evidence: LexemeEvidence[];
}

export interface NomEntry {
  id: string;
  quoc_ngu: string;
  characters: string;
  variants: string[];
  definition: string | null;
  definition_language: "vi" | "en" | "other" | null;
  frequency: number | null;
  provenance: SourceTrace;
}

export interface EvidenceEntry {
  id: string;
  headword: string;
  text: string;
  translation: string | null;
  language: string;
  provenance: SourceTrace;
}

export interface SemanticEntry {
  id: string;
  synset_id: string;
  part_of_speech: "adjective" | "adjective satellite" | "adverb" | "noun" | "verb" | "unknown";
  lemmas: string[];
  provenance: SourceTrace[];
}

export interface VariantEntry {
  id: string;
  key: string;
  forms: string[];
  relation: "tone-placement";
  provenance: SourceTrace[];
}
