# Phase 6 AI Proxy Review 0.4.0

Status: `PHASE6_AI_PROXY_REVIEW_NOT_HUMAN_REVIEWED`

This packet fills reviewer-like fields from the existing AI advisory layer, but every row is explicitly blocked from import as human review.

## Counts

- Rows: 590
- Import eligible: 0
- Counts as human review: false
- Requires human confirmation: 590
- Promotion allowed: 0

## Decision Counts

- `insufficient_evidence`: 56
- `split_by_source_entry_or_pos`: 533
- `split_label_and_qualifier`: 1

## Files

- `data/processed/phase6/ai-proxy-review/ai-proxy-review-summary.json`
- `data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.jsonl`
- `data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.sample.jsonl`

## Rule

Use this as a reviewer prefill aid only. It is not a human-reviewed layer and must not authorize scalar IPA, dialect, origin, etymology, or sense projection.
