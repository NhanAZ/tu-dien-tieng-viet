import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(webRoot, "..");
const processedDir = path.join(repoRoot, "data", "processed");
const apiDir = path.join(webRoot, "public", "api");

function noTone(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300\u0301\u0303\u0309\u0323]/g, "")
    .normalize("NFC")
    .toLowerCase();
}

function bucketFor(word) {
  const first = noTone(word).trim()[0] ?? "other";
  return /[a-z]/.test(first) ? first : "other";
}

function compactDefinition(definition) {
  return {
    meaning: definition.meaning,
    language: definition.language,
    source: definition.source,
    examples: Array.isArray(definition.examples) ? definition.examples.slice(0, 2) : [],
    labels: Array.isArray(definition.labels) ? definition.labels.slice(0, 5) : [],
  };
}

const SEARCH_FLAG_IPA = 1;
const SEARCH_FLAG_VI_DEFINITION = 2;
const SEARCH_FLAG_HAN_NOM = 4;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonOrNull(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data)}\n`, "utf8");
}

async function buildWords() {
  const wordsDir = path.join(processedDir, "words");
  const files = (await readdir(wordsDir)).filter((file) => file.endsWith(".json")).sort();
  const searchIndex = [];
  const letterCounts = {};
  const sourceCounts = {};
  const wordBucketsDir = path.join(apiDir, "words");
  await mkdir(wordBucketsDir, { recursive: true });

  for (const file of files) {
    const words = await readJson(path.join(wordsDir, file));
    const normalizedWords = words.map((entry) => {
      const viDefinitions = entry.definitions.filter((definition) => definition.language === "vi");
      const definitions = viDefinitions.length > 0 ? viDefinitions : entry.definitions.slice(0, 3);
      const sources = Array.from(new Set(entry.definitions.map((definition) => definition.source))).sort();
      for (const source of sources) sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
      const bucket = bucketFor(entry.word);
      const normalizedHeadword = entry.headword_no_tone ?? noTone(entry.word);
      const searchTokens = normalizedHeadword.match(/[a-z]+/g) ?? [];
      letterCounts[bucket] = (letterCounts[bucket] ?? 0) + 1;
      searchIndex.push({
        i: entry.id,
        w: entry.word,
        n: normalizedHeadword,
        t: `|${searchTokens.join("|")}|`,
        b: bucket,
        d: definitions[0]?.meaning ?? "",
        f:
          (entry.pronunciation_ipa ? SEARCH_FLAG_IPA : 0) |
          (viDefinitions.length > 0 ? SEARCH_FLAG_VI_DEFINITION : 0) |
          ((entry.han_viet_ref?.length ?? 0) > 0 || (entry.han_nom_forms?.length ?? 0) > 0
            ? SEARCH_FLAG_HAN_NOM
            : 0),
      });
      return {
        ...entry,
        definitions: entry.definitions.map(compactDefinition),
      };
    });
    await writeJson(path.join(wordBucketsDir, file), normalizedWords);
  }

  searchIndex.sort((a, b) => a.n.localeCompare(b.n, "vi") || a.w.localeCompare(b.w, "vi"));
  await writeJson(path.join(apiDir, "search-index.json"), searchIndex);
  return { searchIndex, letterCounts, sourceCounts };
}

async function buildHan() {
  const hanDir = path.join(processedDir, "han-viet");
  const files = (await readdir(hanDir)).filter((file) => file.endsWith(".json")).sort();
  const hanIndex = [];
  const radicalCounts = {};
  const hanOutDir = path.join(apiDir, "han-viet");
  await mkdir(hanOutDir, { recursive: true });

  for (const file of files) {
    const rows = await readJson(path.join(hanDir, file));
    await writeJson(path.join(hanOutDir, file), rows);
    for (const row of rows) {
      const radical = row.radical || "unknown";
      radicalCounts[radical] = (radicalCounts[radical] ?? 0) + 1;
      hanIndex.push({
        id: row.id,
        char: row.character,
        radical,
        strokes: row.total_stroke_count,
        readings: row.readings_han_viet ?? [],
        meaning: row.meanings?.[0]?.meaning ?? "",
        file,
      });
    }
  }

  hanIndex.sort((a, b) => (a.strokes ?? 0) - (b.strokes ?? 0) || a.char.localeCompare(b.char, "zh"));
  await writeJson(path.join(apiDir, "han-index.json"), hanIndex);
  await writeJson(
    path.join(apiDir, "radicals.json"),
    Object.entries(radicalCounts)
      .map(([radical, count]) => ({ radical, count }))
      .sort((a, b) => a.radical.localeCompare(b.radical, "zh"))
  );
  return { hanIndex, radicalCounts };
}

async function buildNom() {
  const nom = await readJson(path.join(processedDir, "nom", "entries.json"));
  await writeJson(path.join(apiDir, "nom-index.json"), nom);
  return nom;
}

async function copySchemasAndReports() {
  await cp(path.join(processedDir, "source-manifest.json"), path.join(apiDir, "source-manifest.json"));
  await cp(path.join(processedDir, "quality-summary.json"), path.join(apiDir, "quality-summary.json"));
}

await rm(apiDir, { recursive: true, force: true });
await mkdir(apiDir, { recursive: true });

const index = await readJson(path.join(processedDir, "index.json"));
const quality = await readJson(path.join(processedDir, "quality-summary.json"));
const senseValidation = await readJson(path.join(processedDir, "senses", "validation-summary.json"));
const phase6 = await readJson(path.join(processedDir, "phase6", "index.json"));
const archiveManifest = await readJsonOrNull(
  path.join(
    repoRoot,
    "data",
    "releases",
    quality.release.datasetVersion,
    quality.release.profile,
    "archive-manifest.json"
  )
);
const { searchIndex, letterCounts, sourceCounts } = await buildWords();
const { hanIndex, radicalCounts } = await buildHan();
const nom = await buildNom();
await copySchemasAndReports();

await writeJson(path.join(apiDir, "stats.json"), {
  generatedAt: new Date().toISOString(),
  buildId: quality.release.buildId,
  version: quality.release.datasetVersion,
  profile: quality.release.profile,
  archiveSha256: archiveManifest?.sha256 ?? null,
  counts: {
    words: index.wordCount,
    definitions: quality.layers.definitions,
    lexemes: index.lexemeOnlyCount,
    withVietnameseDefinition: quality.dictionaryCoverage.withVietnameseDefinition,
    hanViet: index.hanCharacterCount,
    nom: index.nomEntryCount,
    semanticSynsets: index.semanticSynsetCount,
    evidence: index.evidenceCount,
    senseClusters: senseValidation.clusters,
    pronunciationFacts: phase6.pronunciationFacts,
    originFacts: phase6.originFacts,
    reviewedPhase6Rows: phase6.ownerAuthorizedReview?.totalRows ?? 0,
  },
  letterCounts,
  sourceCounts,
  radicalCount: Object.keys(radicalCounts).length,
  searchRows: searchIndex.length,
  hanRows: hanIndex.length,
  nomRows: nom.length,
});

await writeFile(
  path.join(webRoot, "public", "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${searchIndex
    .slice(0, 5000)
    .map((entry) => `  <url><loc>/tu/${encodeURIComponent(entry.i)}</loc></url>`)
    .join("\n")}\n</urlset>\n`,
  "utf8"
);

console.log(
  `[web:data] ${searchIndex.length.toLocaleString("vi-VN")} words, ${hanIndex.length.toLocaleString(
    "vi-VN"
  )} Han-Viet, ${nom.length.toLocaleString("vi-VN")} Nom entries`
);
