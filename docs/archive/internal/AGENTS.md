# AGENTS.md

## Mission

This repository builds a source-attributed Vietnamese dictionary dataset. Work on data collection, normalization, merging, validation, QA, and release artifacts. Do not build the website until the data phase is explicitly closed by the user.

The execution roadmap is `docs/Kế hoạch thu thập dữ liệu từ điển tiếng Việt theo nhiều pha.md`. The current working line is `0.4.0-beta`; automated data gates pass, while human review benchmarks remain open.

The detailed Phase 5 execution plan is `docs/Kế hoạch Pha 5 - Hợp nhất nghĩa và chuẩn hóa học thuật 0.4.0.md`. Use `npm.cmd run academic:audit`, `npm.cmd run academic:sense-draft`, `npm.cmd run academic:auto-cluster`, `npm.cmd run academic:near-duplicates`, `npm.cmd run academic:confidence`, `npm.cmd run academic:samples`, `npm.cmd run academic:validate`, `npm.cmd run academic:report`, and `npm.cmd run academic:review-breakdown` to measure and reduce sense-level academic-readiness gaps before claiming Phase 5 progress. Use `npm.cmd run academic:gold:check` only after human labels exist.

The website brief `docs/Xây dựng Website Từ Điển Tiếng Việt Chuyên Sâu.md` is currently marked `WEBSITE_BRIEF_STATUS: PENDING`. This is a serious schema risk. Treat the dataset as research/data-QA ready, not website-schema-1.0 ready, until the user fills that brief and a schema compatibility review is completed.

## Non-Negotiable Data Boundaries

- `words` contains Vietnamese headwords with at least one definition and at least one Latin-script character.
- Wordlists without definitions belong in `lexemes`, never in `words`.
- Han-Viet and Nom are separate layers. Do not add their counts to Vietnamese dictionary headwords.
- Unihan is enrichment only. It may not create a standalone Han-Viet or Nom entry.
- `headword_no_tone` removes only the five Vietnamese tone marks; it must preserve â/ă/ê/ô/ơ/ư.
- Do not invent definitions, IPA, etymologies, variants, examples, radicals, readings, or semantic relations.
- Preserve source language. Do not machine-translate definitions to inflate Vietnamese coverage.
- Every definition/fact must retain source ID, raw record hash, confidence, and review status.

## Source And Rights Rules

- `open-only` selects sources marked `open` or `public-domain`.
- `documented` may add `documented-unclear` sources only with snapshot, attribution, provenance, and source-level rollback.
- Commercial, permission-only, anti-crawl, and known restricted sources remain reference-only or rejected.
- Non-commercial intent does not replace permission, attribution, or provenance.
- For a complaint, disable the source by ID and rebuild; do not hand-edit facts out of processed JSON.

## Commands

Use `npm.cmd` on Windows PowerShell when `npm.ps1` is blocked.

```powershell
npm.cmd install
npm.cmd run pipeline
npm.cmd run pipeline:refresh
npm.cmd run academic:audit
npm.cmd run academic:sense-draft
npm.cmd run academic:auto-cluster
npm.cmd run academic:near-duplicates
npm.cmd run academic:silver-benchmark
npm.cmd run academic:confidence
npm.cmd run academic:samples
npm.cmd run academic:validate
npm.cmd run academic:report
npm.cmd run academic:review-breakdown
npm.cmd run academic:phase6-facts
npm.cmd run academic:phase6-conflicts
npm.cmd run academic:phase6-audit
npm.cmd run academic:gold:check
npm.cmd run audit:samples
npm.cmd run test:academic-fixtures
npm.cmd run test:normalized-checksums
npm.cmd run release:snapshot
```

Profile and rollback commands:

```powershell
npm.cmd run profile:open
npm.cmd run profile:documented
npm.cmd run source:disable -- <source_id>
npm.cmd run source:enable -- <source_id>
npm.cmd run collection:freeze
npm.cmd run website:gate
npm.cmd run website:gate:strict
```

## Required Gates

Before calling a build ready, run:

```powershell
npm.cmd run validate
npm.cmd run provenance
npm.cmd run removal
npm.cmd run stability
npm.cmd run quality
npm.cmd run academic:audit
npm.cmd run academic:sense-draft
npm.cmd run academic:auto-cluster
npm.cmd run academic:near-duplicates
npm.cmd run academic:silver-benchmark
npm.cmd run academic:confidence
npm.cmd run academic:samples
npm.cmd run academic:validate
npm.cmd run academic:report
npm.cmd run academic:review-breakdown
npm.cmd run academic:phase6-facts
npm.cmd run academic:phase6-conflicts
npm.cmd run academic:phase6-audit
npm.cmd run report
```

Required expectations:

- zero JSON Schema failures;
- zero inactive or mismatched source traces;
- zero duplicate IDs;
- zero non-Latin headwords in `words`;
- zero standalone Unihan records;
- zero invalid tone-placement groups;
- source-removal regression passes;
- ID-stability regression passes;
- academic audit, sense draft, auto-cluster draft, validation, report, and review breakdown are generated before any claim of Phase 5 readiness;
- `academic:gold:check` passes before any claim of human-reviewed sense benchmark readiness;
- raw, normalized, processed, schema, and archive checksums are recorded.
- frozen-raw normalizer checksum regression passes after parser refactors.

Before declaring schema compatibility for the future website, `npm.cmd run website:gate:strict` must pass and the website brief must be reviewed against the generated schema.

## Project Layout

- `scripts/`: TypeScript pipeline and QA.
- `data/raw/`: immutable source snapshots.
- `data/normalized/`: source-specific JSONL.
- `data/processed/`: current profile output.
- `data/processed/senses/`: canonical machine-first sense layer generated by Phase 5 scripts.
- `data/processed/entities/`: source-attributed entity/encyclopedic candidates moved out of the academic core.
- `data/processed/reference-non-vi/`: non-Vietnamese reference definitions, excluded from Vietnamese definition coverage.
- `data/releases/`: profile-specific compressed release snapshots.
- `data/audit/`: invalidated baseline, rollback evidence, and manual review queues.
- `data/schema/`: official schemas.
- `SOURCES.md`: attribution for the active profile.
- `reports/current/SOURCES_CANDIDATES.md`: surveyed sources not active in the current build.
- `reports/current/DATA_CARD.md`, `reports/current/COVERAGE_REPORT.md`, `reports/current/QUALITY_REPORT.md`: generated release documentation.
- `TODO.md`: coordination checklist for completed, pending, blocked, and later work.
- `README.md`: documentation map and current project entry point.

## Engineering Notes

- Keep scripts idempotent; merge resets generated output.
- Keep raw files untouched. CatusF, Kaikki, UVD, Unihan and Dai Nam parsing helpers live in `scripts/normalizers/`; keep `normalize.ts` as the orchestrator unless a small parser becomes large enough to split.
- Run `npm.cmd run test:academic-fixtures` before normalization changes and `npm.cmd run test:normalized-checksums` after rebuilding frozen raw. Numbered-definition cleanup must not split or strip literal quantities/examples.
- Update `scripts/lib/sources.ts` and the source dossier before ingesting a new source.
- Prefer streaming JSONL/gzip reads for large data.
- Treat OMW links as semantic candidates until sense-level human review exists.
- Never authorize near-duplicate auto-merge from Jaccard alone; the silver benchmark contains semantic negatives with score 1.0.
- Do not add IPA/origin coverage to provenance-free scalars. Build additive fact-level records and deterministic compatibility projections first.
- Phase 6 facts and pronunciation conflict buckets live in `data/processed/phase6/`; run `academic:phase6-conflicts` after `academic:phase6-facts`. Keep scalar `pronunciation_ipa` and `origin` as compatibility projections until website/schema review.
- The 500-word QA sample and 1,000-pair sense template are not gold until a human fills their review fields.
