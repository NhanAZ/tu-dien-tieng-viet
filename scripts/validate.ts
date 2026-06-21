import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import { PROCESSED_DIR, SCHEMA_DIR, readJson } from "./lib/paths.js";

interface ValidationSummary {
  wordFiles: number;
  hanFiles: number;
  wordEntries: number;
  hanEntries: number;
  lexemeEntries: number;
  nomEntries: number;
  semanticEntries: number;
  evidenceEntries: number;
  variantEntries: number;
  errors: Array<{ file: string; index: number; errors: unknown }>;
}

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const wordSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "word-entry.schema.json"));
const hanSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "han-character.schema.json"));
const lexemeSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "lexeme-entry.schema.json"));
const nomSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "nom-entry.schema.json"));
const semanticSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "semantic-entry.schema.json"));
const evidenceSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "evidence-entry.schema.json"));
const variantSchema = await readJson<Record<string, unknown>>(path.join(SCHEMA_DIR, "variant-entry.schema.json"));
ajv.addSchema(wordSchema);
const validateWord = ajv.getSchema("https://local.tu-dien-tieng-viet/schema/word-entry.schema.json")!;
const validateHan = ajv.compile(hanSchema);
const validateLexeme = ajv.compile(lexemeSchema);
const validateNom = ajv.compile(nomSchema);
const validateSemantic = ajv.compile(semanticSchema);
const validateEvidence = ajv.compile(evidenceSchema);
const validateVariant = ajv.compile(variantSchema);

async function validateDir(
  dir: string,
  validate: ValidateFunction,
  kind: "word" | "han" | "lexeme" | "nom" | "semantic" | "evidence" | "variant"
): Promise<ValidationSummary> {
  const summary: ValidationSummary = {
    wordFiles: 0,
    hanFiles: 0,
    wordEntries: 0,
    hanEntries: 0,
    lexemeEntries: 0,
    nomEntries: 0,
    semanticEntries: 0,
    evidenceEntries: 0,
    variantEntries: 0,
    errors: []
  };
  if (!existsSync(dir)) return summary;

  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  for (const file of files) {
    const filePath = path.join(dir, file);
    const entries = await readJson<unknown[]>(filePath);
    if (kind === "word") {
      summary.wordFiles += 1;
      summary.wordEntries += entries.length;
    } else if (kind === "han") {
      summary.hanFiles += 1;
      summary.hanEntries += entries.length;
    } else if (kind === "lexeme") {
      summary.lexemeEntries += entries.length;
    } else if (kind === "nom") {
      summary.nomEntries += entries.length;
    } else if (kind === "semantic") {
      summary.semanticEntries += entries.length;
    } else if (kind === "evidence") {
      summary.evidenceEntries += entries.length;
    } else {
      summary.variantEntries += entries.length;
    }

    entries.forEach((entry, index) => {
      if (!validate(entry)) {
        summary.errors.push({ file: filePath, index, errors: validate.errors });
      }
    });
  }

  return summary;
}

const words = await validateDir(path.join(PROCESSED_DIR, "words"), validateWord, "word");
const han = await validateDir(path.join(PROCESSED_DIR, "han-viet"), validateHan, "han");
const lexemes = await validateDir(path.join(PROCESSED_DIR, "lexemes"), validateLexeme, "lexeme");
const nom = await validateDir(path.join(PROCESSED_DIR, "nom"), validateNom, "nom");
const semantics = await validateDir(path.join(PROCESSED_DIR, "semantics"), validateSemantic, "semantic");
const evidence = await validateDir(path.join(PROCESSED_DIR, "evidence"), validateEvidence, "evidence");
const variants = await validateDir(path.join(PROCESSED_DIR, "variants"), validateVariant, "variant");

const summary: ValidationSummary = {
  wordFiles: words.wordFiles,
  hanFiles: han.hanFiles,
  wordEntries: words.wordEntries,
  hanEntries: han.hanEntries,
  lexemeEntries: lexemes.lexemeEntries,
  nomEntries: nom.nomEntries,
  semanticEntries: semantics.semanticEntries,
  evidenceEntries: evidence.evidenceEntries,
  variantEntries: variants.variantEntries,
  errors: [
    ...words.errors,
    ...han.errors,
    ...lexemes.errors,
    ...nom.errors,
    ...semantics.errors,
    ...evidence.errors,
    ...variants.errors
  ]
};

if (summary.errors.length > 0) {
  console.error(`[validate] Failed with ${summary.errors.length} invalid entries.`);
  for (const error of summary.errors.slice(0, 20)) {
    console.error(JSON.stringify(error, null, 2));
  }
  process.exit(1);
}

console.log(
  `[validate] OK: ${summary.wordEntries} words; ${summary.lexemeEntries} lexeme-only; ` +
    `${summary.hanEntries} Han-Viet; ${summary.nomEntries} Nom; ${summary.semanticEntries} synsets; ` +
    `${summary.variantEntries} variants; ${summary.evidenceEntries} evidence.`
);
