# Academic Phase 6 Pronunciation Conflicts 0.4.0

Generated: 2026-06-21T06:27:13.497Z

Status: **PHASE6_PRONUNCIATION_CONFLICTS_DRAFT**

| Metric | Count |
| --- | ---: |
| Pronunciation facts | 323.020 |
| Headwords with pronunciation facts | 48.349 |
| Headwords with multiple raw IPA values | 48.159 |
| Formatting-only conflicts | 0 |
| Dialect/source variants | 43.301 |
| Source-attested same-entry variants | 4.270 |
| Unresolved conflicts | 588 |
| Unresolved internal groups | 916 |
| Unresolved same-raw-record groups | 880 |
| Review rows routed to parser fix | 0 |
| Review rows routed to human review | 588 |
| Human-review packet tasks | 590 |
| Packet pronunciation conflict tasks | 588 |
| Packet dialect-label tasks | 2 |
| Facts without dialect metadata | 2.097 |
| Conflict headwords without dialect metadata | 374 |

## Interpretation

- `formatting_only`: raw values differ only by paired display delimiters such as brackets or slashes. `safe_display_ipa` may be used for display, while all source facts remain unchanged.
- `dialect_source_variant`: each source/dialect/system bucket has one normalized display value, but buckets disagree. Keep variants separate until dialect/system metadata is stronger.
- `source_attested_variant`: one raw source entry publishes distinct sound elements in an internally variant source/dialect/system bucket. Preserve all of them as source-attested alternatives without selecting a scalar.
- `unresolved`: at least one source/dialect/system bucket has multiple normalized display values; do not select a scalar IPA without deeper review.
- Unresolved analysis explains whether the remaining issue comes from same raw records, multiple raw records in the same source/dialect bucket, or case/form variants.
- Entry-scope triage routes only reused source-entry IDs to parser repair. Distinct source records, including same-form/same-POS variants, require human review; neither route authorizes an IPA merge.
- The human-review packet combines 588 unresolved pronunciation rows and 2 manual dialect-label rows. Reviewer decision fields are blank by design.

Machine-readable artifacts:

- `data/processed/phase6/pronunciation-conflicts.json`
- `data/processed/phase6/pronunciation-conflicts.jsonl`
- `data/processed/phase6/pronunciation-conflicts.sample.jsonl`
- `data/processed/phase6/pronunciation-source-entry-policy.json`
- `data/processed/phase6/pronunciation-entry-scope-triage.json`
- `data/processed/phase6/pronunciation-unresolved-analysis.json`
- `data/processed/phase6/pronunciation-unresolved-analysis.jsonl`
- `data/processed/phase6/pronunciation-unresolved-analysis.sample.jsonl`
- `data/processed/phase6/human-review-packet.json`
- `data/processed/phase6/human-review-packet.jsonl`
- `data/processed/phase6/human-review-packet.sample.jsonl`
