# Data Completion Criteria 0.4.0

Status: owner-authorized operational criteria.

## Scope

Version `0.4.0-beta` is data-complete when the dataset can be rebuilt from frozen raw sources, passes all automated gates, contains accepted sense labels, contains reviewed Phase 6 pronunciation decisions, and has a release snapshot with checksums.

Website schema readiness is outside this completion definition.

## Required Conditions

1. Raw collection remains frozen unless explicitly refreshed.
2. Active sources have source IDs, citations, rights status, and rollback path.
3. Wordlist-only sources stay in `lexemes`, not `words`.
4. Han-Viet, Nom, and Unihan enrichment remain separate layers.
5. `words` contains Vietnamese headwords with definitions and Latin-script evidence.
6. Sense layer is regenerated and validated.
7. `gold-sense-pairs.jsonl` exists and passes `academic:gold:check`.
8. Phase 6 review layer exists for all 590 review tasks.
9. Projection policy exists before any scalar IPA/dialect projection.
10. AI-vs-reviewed comparison report exists.
11. Confidence calibration report exists.
12. Near-duplicate threshold policy is evidence-backed.
13. No restricted/commercial source is ingested without source-level clearance.
14. `validate`, `provenance`, `removal`, `stability`, and `quality` pass.
15. `academic:validate` and Phase 6 audit run successfully.
16. Reports and release snapshot are regenerated after final artifacts.
17. Archive manifest records checksums for processed, schema, reports, and Phase 6 files.

## Current Owner Authorization

The project owner authorized AI to complete review-like tasks for this workspace run. Artifacts produced under that instruction must retain reviewer metadata such as `ai_owner_authorized_by_project_owner`.

## Completion Command

```powershell
npm.cmd run pipeline
npm.cmd run release:snapshot
```
