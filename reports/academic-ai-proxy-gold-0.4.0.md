# AI Proxy Gold Sense Labels 0.4.0

Status: `AI_PROXY_GOLD_LABELS_NOT_HUMAN_GOLD`

This file assigns conservative AI proxy labels to the 1,000 sense-pair queue rows. It is not a human gold benchmark and must not be used to pass `academic:gold:check`.

## Counts

- Rows: 1.000
- Labels: `different_sense`=333, `encyclopedic_or_name`=50, `near_paraphrase`=290, `same_sense`=307, `unclear`=20
- Confidence: `high`=328, `low`=52, `medium`=620

## Files

- `data/audit/academic/ai-proxy-gold-sense-pairs.jsonl`
- `data/audit/academic/ai-proxy-gold-summary.json`

## Rule

Use this only to prioritize or prefill human review. Do not rename it to `gold-sense-pairs.jsonl`, do not call it human-reviewed, and do not auto-merge senses from it.
