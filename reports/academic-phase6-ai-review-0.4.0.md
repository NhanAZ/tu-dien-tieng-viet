# Academic Phase 6 AI Review 0.4.0

Generated: 2026-06-21T06:27:18.403Z

Status: **AI_ASSISTED_REVIEW_NOT_HUMAN_REVIEWED**

This is an advisory AI-assisted review layer for the blank Phase 6 human-review packet. It is not a human-reviewed benchmark and does not authorize scalar IPA or dialect promotion.

| Metric | Count |
| --- | ---: |
| AI-reviewed tasks | 590 |
| Pronunciation conflict tasks | 588 |
| Dialect-label tasks | 2 |
| Requires human confirmation | 590 |
| Promotion allowed | 0 |

## Decisions

- `insufficient_evidence`: 56
- `split_by_source_entry_or_pos`: 533
- `split_label_and_qualifier`: 1

## Confidence

- `high`: 0
- `medium`: 534
- `low`: 56

## Use

- Treat every row as an AI recommendation only.
- Keep the original human-review packet unmodified.
- Use this layer to prioritize and accelerate expert review.
- Do not call this human-reviewed, gold, or academically final.

Machine-readable artifacts:

- `data/processed/phase6/ai-review/ai-review-summary.json`
- `data/processed/phase6/ai-review/ai-review-decisions.jsonl`
- `data/processed/phase6/ai-review/ai-review-decisions.sample.jsonl`
