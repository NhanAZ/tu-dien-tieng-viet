# Changelog

## Unreleased

### Changed

- Consolidated documentation entry points into root `README.md`, `AGENTS.md`, and `TODO.md`.
- Removed the separate `docs/README.md`, obsolete implementation narrative reports, and intermediate academic Markdown reports now superseded by `reports/academic-layer-report-0.4.0.md` plus machine-readable audit artifacts.
- Corrected the CatusF numbered-definition parser so literal numbers in examples are no longer split into false definition fragments.
- Rebuilt the documented profile from raw snapshots: definitions decreased from 291,128 to 283,629 while headword coverage remained 89,569.
- Routed mixed entity-risk members into a member-level review queue while retaining non-entity canonical clusters; quarantine decreased from 3,569 to zero, while 149 low-information definitions remain in `needs_review` and are not machine-accepted.
- Removed the remaining source-specific numbered sense markers; `leading-sense-marker` is now zero.
- Split CatusF, Kaikki, UVD, Unihan and Dai Nam parsing helpers out of `normalize.ts`; all 16 frozen normalized artifact checksums remain unchanged after the mechanical refactor.

### Added

- Separate source-attributed entity/encyclopedic and reference non-Vi layers with JSON Schema validation.
- Full near-duplicate triage for all 11,144 detected pairs without automatic merging.
- Three-part heuristic confidence model separating source, cluster, and canonical-selection confidence.
- Deterministic stratified sense samples by status, source, confidence tier, and definition length.
- Regression fixtures for CatusF/Kaikki numbering, confidence semantics, exact clustering, short guards, canonical priority and mixed entity risk.
- JSON Schemas for sense/entity/reference indexes, near-duplicate candidate/triage artifacts, confidence reports and stratified sample indexes.
- Frozen-raw checksum regression covering 16 deterministic normalized artifacts.
- A 1,000-row score-stratified silver benchmark with schema validation and a conservative `NO_AUTO_MERGE` decision; 60 explicit semantic negatives score 1.0 under the existing Jaccard generator.
- Phase 6 baseline audit for pronunciation, etymology, origin and variants, including fact-layer IPA conflict buckets and provenance blockers.
- Draft additive Phase 6 fact layer with 323,020 pronunciation facts, 16,223 origin facts, explicit raw Kaikki sound tag/note metadata, and 100% compatibility projection for existing IPA/origin scalars.
- Machine-readable Phase 6 source-entry policy: 4,270 same-entry variants are retained as source-attested alternatives, while 588 cross-entry/form headwords remain in the review queue.
- Entry-scope triage for all 588 Phase 6 review rows, with raw-record scopes and deterministic routes.
- Record-disambiguated raw Kaikki pronunciation source-entry IDs; zero IDs are reused across raw hashes, pronunciation IDs remain stable, and all 588 remaining rows are routed to human review.
- A 2,097-row dialect metadata-gap ledger with source/reason/route summaries, schemas and validator cross-checks; no dialect is inferred for unlabeled facts.

## 0.4.0-beta - 2026-06-20

### Added

- Machine-first canonical sense layer included in the documented release snapshot.
- `academic:review-breakdown` report and machine-readable `data/processed/senses/review-breakdown.json`.
- Release archive manifest now records checksum details for `data/processed/senses/`.

### Changed

- Dataset version bumped to `0.4.0-beta`.
- POS normalization now maps raw one-letter POS codes to canonical labels or `khác`.
- Easy leading definition markers such as `d.`, `đg.`, `t.` are stripped during merge while source provenance remains intact.
- CatusF numbered definition lines are split into separate source-attributed definition facts.

## 0.3.0 - 2026-06-20

### Added

- Documented research ingest for `catusf_vietviet`, including StarDict TAB/HTML parsing, `<h3>` subentry splitting, source-level provenance, and lower-confidence `documented-unclear` labels.
- Generic source-removal regression script, currently targeting `catusf_vietviet`.

### Changed

- Reports and QA sampling now derive source counts and language counts dynamically instead of carrying forward build-specific constants.

## 0.2.0 - 2026-06-20

### Added

- Twelve-source `documented` build and eleven-source `open-only` build.
- Separate layers for dictionary headwords, lexeme-only records, Han-Viet, Nom, semantic synsets, orthographic variants, and evidence examples.
- Definition/fact-level provenance, source profiles, source enable/disable commands, frozen collection state, and source-removal regression test.
- Seven JSON Schemas, full-layer provenance checks, deterministic source samples, QA summary, data card, coverage report, and quality report.
- Release archives with profile-specific manifest, index, QA summary, archive size, and SHA-256.
- Manual review artifacts: 500 stratified word records, 1,000 cross-source sense pairs, and a 5,000-item missing-definition queue.

### Corrected

- Invalidated the old claim that 97,536 Unihan rows were Vietnamese or Han-Viet dictionary entries.
- Prevented pure CJK headwords from entering the Vietnamese `words` layer.
- Changed `headword_no_tone` to preserve Vietnamese vowel quality marks.
- Rebuilt tone-placement variants so distinct syllables such as `am/âm/ăm` are never grouped; only genuine forms such as `hoà/hòa` remain.
- Fixed a Nom ID collision between `cảm ơn` and `cám ơn`.
- Removed unresolved `id.` placeholders from final Đại Nam definitions.

### Known Limitations

- The 500-entry QA sample and 1,000-pair sense benchmark still require human adjudication.
- External corpus ingestion remains deferred; current evidence examples come from dictionary sources.
- The documented Nom layer uses a source whose separate redistribution license is not explicit.

## 0.1.0 - 2026-06-19

- Initial exploratory pipeline and invalidated baseline retained for audit only.
