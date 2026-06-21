# Source Dossiers

Assessment date: 2026-06-19

This document records the phase-2 gate decision for sources selected in the next reproducible build. Counts and hashes are finalized by `data/raw/fetch-manifest.json` after fetch.

## Decision scale

- `ingest-core`: definitions or structured lexical facts may enter the dictionary core.
- `ingest-lexeme`: headword evidence only; it cannot increase the dictionary-entry count.
- `ingest-semantic`: synset/semantic candidate layer only.
- `enrichment-only`: may enrich an existing Vietnamese lexical record but cannot create one.
- `documented-build`: usable in the local documented profile, independently removable.
- `quarantine`: surveyed but not selected.
- `reference-only`: manual comparison only.

## Approved sources

### `kaikki_viwiktionary`

- Decision: `ingest-core` and Han-Viet candidate evidence.
- Publisher: Wiktionary contributors, extracted by Wiktextract/Kaikki.
- Rights: CC BY-SA/GFDL.
- Format: gzip JSONL.
- Strengths: Vietnamese definitions, POS, examples, relations, etymology and some Han readings.
- Risks: community data, duplicated/raw glosses and uneven templates.
- Parser rule: only `lang_code=vi` enters Vietnamese words; single CJK characters require Vietnamese lexical evidence.
- Rollback: normalized directory is isolated by source ID.

### `kaikki_enwiktionary_vi`

- Decision: `ingest-core` with definition language `en`.
- Publisher: English Wiktionary contributors, extracted by Wiktextract/Kaikki.
- Rights: CC BY-SA/GFDL.
- Format: gzip JSONL, language-specific Vietnamese extract.
- Strengths: strong IPA, etymology, POS and structured sense data.
- Risks: English glosses must not be presented as Vietnamese definitions; occasional CJK lemmas need filtering.
- Parser rule: all definitions carry `language=en`; Vietnamese headword validation remains mandatory.
- Rollback: isolated source ID.

### `underthesea_uvd`

- Decision: `ingest-core`; preferred structured Vietnamese source.
- Publisher: Underthesea NLP resources, metadata version 1.0-alpha.1 (2020).
- Rights: GPL-3.0 at repository level.
- Format: YAML mapping headwords to POS, definitions and examples.
- Declared size: 31,327 words and 13 POS classes.
- Strengths: dictionary-computing design documents, Vietnamese definitions and examples.
- Risks: likely lineage overlap with Hồ Ngọc Đức/vntk; duplicate senses must preserve source lineage.
- Parser rule: YAML is parsed structurally, never with regular expressions.
- Rollback: isolated source ID.

### `vntk_dictionary`

- Decision: `ingest-core` as an independently attributed mirror/implementation.
- Publisher: vntk/dictionary.
- Rights: MIT repository license; deeper definition provenance is incompletely documented.
- Format: JSON.
- Strengths: stable, simple and already tested.
- Risks: substantial overlap with Underthesea UVD; quality tier remains aggregate rather than academic primary.
- Parser rule: exact duplicates remain traceable and are reported rather than silently counted twice.
- Rollback: isolated source ID.

### `underthesea_dictionary`

- Decision: `ingest-lexeme` only.
- Publisher: Underthesea NLP.
- Rights: GPL-3.0 repository.
- Format: text wordlist.
- Declared size: 79,226 merged words in project documentation.
- Strengths: broad headword coverage.
- Risks: mixed lineage from Hồ Ngọc Đức, tudientv and Wiktionary; no definitions.
- Parser rule: no row can create a dictionary-core sense.
- Rollback: isolated source evidence.

### `duyet_vietnamese_wordlist`

- Decision: `ingest-lexeme` only.
- Publisher: duyet/vietnamese-wordlist, based on Hồ Ngọc Đức wordlists.
- Rights: GPL-2.0.
- Format: UTF-8/legacy-compatible text; Viet74K selected.
- Strengths: broad words and phrases for autocomplete and gap analysis.
- Risks: names, uncommon strings and phrases are not all dictionary headwords.
- Parser rule: valid Unicode and lexical-shape checks; no invented definition.
- Rollback: isolated source evidence.

### `hunspell_vi`

- Decision: `ingest-lexeme` and orthographic-variant evidence.
- Publisher: Minh Nguyen, Ivan Garcia, Hồ Ngọc Đức and contributors.
- Rights: GPL-3.0-or-later; lineage documented in README/license.
- Format: Hunspell `.dic` in old/new accent-placement variants.
- Strengths: mature spelling data and explicit accent-style distinction.
- Risks: intentionally covers monosyllables rather than compounds.
- Parser rule: strip Hunspell flags; never claim compound-word coverage.
- Rollback: isolated source evidence.

### `omw_wiktionary_vi`

- Decision: `ingest-semantic` candidate layer.
- Publisher: Open Multilingual Wordnet from Wiktionary mappings.
- Rights: CC BY-SA/GFDL.
- Format: tab-separated Princeton WordNet synset to Vietnamese lemma mappings.
- Strengths: explicit synset IDs and POS suffixes.
- Risks: a synset mapping is a candidate relation, not proof that all lemmas are interchangeable in every context; some lemmas are CJK forms.
- Parser rule: preserve synset and POS; do not flatten directly into dictionary synonyms.
- Rollback: independent semantic output.

### `catusf_thieu_chuu_stardict`

- Decision: `ingest-core` for Han-Viet.
- Publisher: digitization/conversion in catusf/tudien; original Thiều Chửu dictionary (1942).
- Rights: original work treated as public domain under the project brief's term calculation; repository publishes CC0.
- Format: tab-separated character, readings and Vietnamese definition.
- Declared size: 9,897 entries.
- Strengths: direct Vietnamese scholarly readings and meanings.
- Risks: digitization errors and modern simplified variants.
- Parser rule: this source creates Han-Viet records; Unihan can only enrich them afterwards.
- Rollback: isolated source ID.

### `dai_nam_quoc_am_tu_vi`

- Decision: `ingest-core` after structural parse QA.
- Publisher: Huỳnh Tịnh Của (1895-1896), transcribed by Wikisource contributors.
- Rights: original public domain; transcription CC BY-SA/GFDL.
- Format: rendered MediaWiki HTML snapshot with page and revision IDs.
- Strengths: historical vocabulary, Southern regional usage, compounds and examples.
- Risks: complex two-column HTML, page-break continuation and historical spelling.
- Parser rule: preserve historical wording; compounds are separate candidates only when a headword and definition can be extracted confidently.
- Rollback: one source snapshot and normalized directory.

### `unicode_unihan`

- Decision: `enrichment-only`.
- Publisher: Unicode Consortium.
- Rights: Unicode data license.
- Format: Unihan ZIP.
- Strengths: code points, radical-stroke data, total strokes and variants.
- Risks: pan-CJK scope caused the invalid 97,536-entry baseline.
- Hard rule: metadata can join only an existing Han-Viet or Nom record. An unmatched Unihan code point is discarded from lexical output.
- Rollback: remove enrichment facts without deleting source lexical records.

### `chunom_standard`

- Decision: `documented-build` for the independent Nom layer.
- Publisher: Chunom.org.
- Rights: no separate license statement found; a public TSV download is explicitly provided. Classified `documented-unclear`.
- Format: TSV with Unicode, frequency, Nom text, Quốc ngữ and English gloss.
- Observed size: 3,930 data rows in the public download.
- Strengths: character choices cite real occurrences in Truyện Kiều, Nhật dụng thường đàm, Lục Vân Tiên, Chinh phụ ngâm and Hồ Xuân Hương.
- Risks: rights metadata is incomplete and English glosses are not Vietnamese definitions.
- Parser rule: isolated Nom output; all facts removable by source ID; excluded from `open-only`.
- Rollback: disable source and rebuild.

### `catusf_vietviet`

- Decision: `documented-build` and `ingest-core` for Vietnamese definitions.
- Publisher: catusf/tudien conversion; metadata names Hồ Ngọc Đức's Vietnamese dictionary.
- Rights: repository publishes CC0-1.0, but lineage of every aggregated definition is not independently proven; classified `documented-unclear`.
- Format: tab-separated StarDict text with HTML, hidden search keys and occasional `<h3>` subentries.
- Declared size: 23,798 rows.
- Strengths: broad modern Vietnamese coverage and useful overlap/cross-checking with vntk, Underthesea and Wiktionary.
- Risks: provenance is at conversion-row level, not original editorial-sense level; includes proper names, place names and encyclopedia-like entries.
- Parser rule: remove hidden search-key text, split `<h3>` subentries, keep definition language `vi`, label every definition `documented-unclear`, and use lower confidence than primary structured sources.
- Rollback: disable `catusf_vietviet` and rebuild; source-removal regression targets this source.

## Quarantined or reference-only sources

### OVDP / `dynamotn_stardict_vi`

- Decision: `quarantine`.
- Reason: project-level GPL information exists, but each packaged StarDict needs its own metadata and lineage review.

### `kanjidict_vn`

- Decision: `reference-only`.
- Reason: repository README explicitly attributes Vietnamese readings/meanings to a currently copyrighted website dataset.

### HVDic, VDict, Soha, Laban, Cambridge and SEAlang

- Decision: `reference-only`.
- Reason: valuable manual comparison sources, but no permission for bulk extraction/republication has been established.

### VLSP and ELRA resources

- Decision: `permission-required`.
- Reason: useful academic datasets but access is governed by forms, DUA or purchase terms not completed in this workspace.

## Phase-2 gate result

Approved sources have a stable source ID, reproducible raw endpoint, structured parser plan and source-level rollback. Actual snapshot hashes, row counts and sample error rates are recorded after fetch/normalize in the generated quality reports.
