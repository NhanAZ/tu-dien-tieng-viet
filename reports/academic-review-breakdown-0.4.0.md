# Academic Review Breakdown 0.4.0

Generated at: 2026-06-21T06:28:10.176Z

This report splits machine-first sense-layer risk into actionable buckets. It is not a human-reviewed academic benchmark.

## Totals

| Metric | Value |
| --- | ---: |
| Sense clusters scanned | 226.374 |
| Source definitions scanned | 283.629 |
| Needs-review/quarantine clusters | 58.673 |
| Needs-review/quarantine definitions | 59.355 |
| Entity/encyclopedic clusters | 14.423 |
| Entity/encyclopedic definitions | 14.423 |
| Reference non-Vi clusters | 57.449 |
| Reference non-Vi definitions | 57.449 |

## Reason Breakdown

| Reason | Clusters | Definitions | Needs review | Quarantine | Entity/encyclopedic | Reference non-Vi | Top source |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `documented-unclear-source` | 40.072 | 40.640 | 18.172 | 0 | 14.423 | 0 | `catusf_vietviet` (40.074) |
| `low-confidence` | 81.143 | 81.752 | 59.276 | 0 | 14.423 | 0 | `dai_nam_quoc_am_tu_vi` (41.092) |
| `missing-pos` | 34.454 | 34.454 | 32.816 | 0 | 1.638 | 0 | `dai_nam_quoc_am_tu_vi` (32.209) |
| `too-short` | 23.068 | 26.749 | 5.622 | 0 | 259 | 10.062 | `kaikki_enwiktionary_vi` (10.071) |
| `proper-name-candidate` | 10.192 | 10.192 | 44 | 0 | 8.878 | 0 | `catusf_vietviet` (10.192) |
| `place-name-candidate` | 10.592 | 10.592 | 25 | 0 | 10.155 | 0 | `catusf_vietviet` (10.592) |
| `domain-or-encyclopedic-candidate` | 1.043 | 1.043 | 5 | 0 | 869 | 0 | `catusf_vietviet` (1.043) |
| `punctuation-headword-candidate` | 120 | 120 | 1 | 0 | 77 | 0 | `catusf_vietviet` (120) |
| `non-vi-definition` | 57.460 | 57.460 | 1 | 0 | 0 | 57.449 | `kaikki_enwiktionary_vi` (57.460) |
| `leading-sense-marker` | 0 | 0 | 0 | 0 | 0 | 0 | - |
| `raw-pos-code` | 0 | 0 | 0 | 0 | 0 | 0 | - |
| `too-long` | 391 | 395 | 25 | 0 | 336 | 2 | `catusf_vietviet` (364) |
| `hard-risk-label` | 0 | 0 | 0 | 0 | 0 | 0 | - |
| `no-vietnamese-definition` | 57.449 | 57.449 | 0 | 0 | 0 | 57.449 | `kaikki_enwiktionary_vi` (57.449) |

## Suggested Actions

| Bucket | Definitions | Recommendation |
| --- | ---: | --- |
| `leading-sense-marker` | 0 | Auto-normalize display text and/or POS only with source-preserving original text; verify by rerunning normalize, merge, academic:auto-cluster and academic:validate. |
| `raw-pos-code` | 0 | Map raw POS codes to canonical Vietnamese POS labels before clustering; this is low risk if provenance keeps raw source record. |
| `missing-pos` | 34.454 | Auto-fill only when a trusted parser exposes explicit POS. Otherwise keep as needs_review. |
| `proper/place/domain/punctuation candidates` | 21.947 | Do not delete. Re-layer into entities or encyclopedic output with provenance. |
| `non-vi-definition` | 57.460 | Keep separate as reference/bilingual layer; do not count as Vietnamese definition coverage. |

## Notes

- Buckets overlap; one definition can have multiple risk tags.
- `reference_non_vi` is useful for bilingual/reference inspection, but it is not Vietnamese definition coverage.
- Proper names, place names and encyclopedic candidates are exported to `data/processed/entities/`, not deleted.

Machine-readable output: `data/processed/senses/review-breakdown.json`.
