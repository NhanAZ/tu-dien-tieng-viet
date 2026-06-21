# Phase 6 Projection Policy 0.4.0

Status: `PHASE6_PROJECTION_POLICY_DEFINED`

Reviewed rows available: 590

Scalar projection allowed: `false`

## Rules

- `split_by_source_entry_or_pos`: do_not_project_scalar_ipa. The reviewed decision preserves source-entry/POS separation.
- `insufficient_evidence`: leave_projection_unchanged. The reviewed decision does not provide enough evidence for scalar projection.
- `split_label_and_qualifier`: record_label_split_candidate_without_scalar_promotion. Dialect label parsing can be recorded, but not promoted to a display scalar without a later schema decision.

## Rollback

disable or remove the reviewed/projection layer and rebuild from source facts. Direct processed mutation allowed: `false`.
