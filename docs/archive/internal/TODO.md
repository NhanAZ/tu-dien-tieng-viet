# TODO - Từ điển tiếng Việt Data Pipeline

Last updated: 2026-06-21

File này chỉ điều phối **việc còn lại**. Không dùng làm changelog và không nhồi lại các mục đã xử lý xong. Nếu cần tra lịch sử/artifact, xem `data/processed/`, `data/audit/`, `reports/`, và `data/releases/`.

## Current State

- Version: `0.4.0-beta`
- Build: `984181246dc11941`
- Profile: `documented`
- Collection: frozen
- Automated QA: PASS
- Sense validation: PASS
- Release archive: `data/releases/0.4.0-beta/documented/tu-dien-tieng-viet-0.4.0-beta-documented.tar.gz`
- Archive bytes: `124185454`
- Archive SHA-256: `21f95fc8347d183a7a51591ecddd894eed6a566b5c4b09c1ced3a70d0a41f42d`

Current important counts:

- Dictionary headwords: `89.569`
- Definitions: `283.629`
- Canonical sense clusters: `226.374`
- Sense needs-review definitions: `59.355`
- Reference non-Vi definitions: `57.449`
- Near-duplicate pairs: `11.144`
- Phase 6 pronunciation facts: `323.020`
- Phase 6 origin facts: `16.223`
- Phase 6 unresolved pronunciation conflict rows: `588`
- Phase 6 manual dialect-label rows: `2`
- Phase 6 human-review packet: `590` tasks
- Phase 6 AI-assisted review: `590` advisory decisions
- Phase 6 AI proxy review: `590` reviewer-prefill rows, `0` import eligible
- Phase 6 owner-authorized reviewed layer: `590` reviewed rows
- Phase 5 owner-authorized gold labels: `1.000` labeled pairs
- AI review guardrails: `0` scalar promotion allowed

Key files:

- `data/processed/phase6/human-review-packet.json`
- `data/processed/phase6/human-review-packet.jsonl`
- `data/processed/phase6/ai-review/ai-review-summary.json`
- `data/processed/phase6/ai-review/ai-review-decisions.jsonl`
- `data/processed/phase6/ai-review/ai-review-decisions.csv`
- `data/processed/phase6/ai-review/ai-review-decisions.xlsx`
- `data/processed/phase6/ai-proxy-review/ai-proxy-review-summary.json`
- `data/processed/phase6/ai-proxy-review/ai-proxy-review-packet.jsonl`
- `data/processed/phase6/human-reviewed/reviewed-summary.json`
- `data/processed/phase6/human-reviewed/reviewed-decisions.jsonl`
- `data/processed/phase6/projection-policy.json`
- `data/processed/phase6/ai-vs-reviewed-report.json`
- `data/audit/academic/ai-proxy-gold-summary.json`
- `data/audit/academic/ai-proxy-gold-sense-pairs.jsonl`
- `data/audit/academic/gold-sense-pairs.jsonl`
- `data/audit/academic/owner-authorized-gold-summary.json`
- `data/audit/academic/confidence-calibration.json`
- `data/audit/source-dossier-audit.json`
- `docs/Data completion criteria 0.4.0.md`
- `docs/Phase 6 pronunciation reviewer guide.md`
- `scripts/academic-phase6-review-export.ts`
- `scripts/academic-phase6-ai-proxy-review.ts`
- `scripts/academic-phase6-accept-ai-review.ts`
- `scripts/academic-phase6-projection-policy.ts`
- `scripts/academic-ai-vs-reviewed-report.ts`
- `scripts/academic-ai-proxy-gold-labels.ts`
- `scripts/academic-accept-ai-proxy-gold.ts`
- `scripts/academic-confidence-calibration.ts`
- `scripts/source-dossier-audit.ts`
- `reports/academic-phase6-ai-review-0.4.0.md`
- `reports/academic-phase6-ai-proxy-review-0.4.0.md`
- `reports/academic-ai-proxy-gold-0.4.0.md`
- `reports/academic-owner-authorized-gold-0.4.0.md`
- `reports/academic-phase6-owner-authorized-review-0.4.0.md`
- `reports/academic-phase6-projection-policy-0.4.0.md`
- `reports/academic-ai-vs-reviewed-0.4.0.md`
- `reports/academic-confidence-calibration-0.4.0.md`
- `reports/source-dossier-audit-0.4.0.md`
- `data/processed/senses/validation-summary.json`
- `data/processed/quality-summary.json`

## Non-Negotiable Rules

- Không build website chính thức khi website brief còn `WEBSITE_BRIEF_STATUS: PENDING`.
- Không gọi dataset là "đầy đủ nhất", "chuẩn học thuật hoàn chỉnh", hoặc "human-reviewed academic release".
- Owner authorized AI to act as reviewer for this workspace run; keep that provenance in reviewer metadata.
- Không promote AI decisions vào scalar `pronunciation_ipa`, `dialect`, `origin`, etymology hoặc sense layer nếu policy không cho phép.
- Không tự sinh nghĩa, IPA, từ nguyên, ví dụ, quan hệ nghĩa bằng AI nếu không ghi rõ là machine/AI-assisted.
- Không auto-merge near duplicates bằng Jaccard alone.
- Không ingest nguồn mới nếu chưa có source dossier, rights review, provenance design và rollback plan.
- Không machine-translate English definitions để tăng coverage tiếng Việt.

## TODO - Việc còn lại sau owner-authorized AI run

- [TODO] `P1` Quyết định có mở rộng coverage IPA/origin/variant không.
  - Phase 6 audit vẫn báo coverage gaps: IPA `48.348`, etymology `31.733`, variants `70`.
  - Không có nguồn mới thì chỉ giữ trạng thái documented beta.

- [TODO] `P2` Nếu muốn scalar projection, tạo chính sách khác với `scalarProjectionAllowed=true`.
  - Policy hiện tại cố ý không promote scalar vì 590 decision đều là split/insufficient.
  - Không sửa trực tiếp `pronunciation_ipa` nếu chưa đổi policy.

## BLOCKED

- [BLOCKED] `P0` Website schema 1.0.
  - Blocker: `docs/Xây dựng Website Từ Điển Tiếng Việt Chuyên Sâu.md` vẫn pending.
  - Không build website chính thức.
  - Chỉ được làm internal inspection/export tooling nếu user yêu cầu rõ.

- [BLOCKED] `P1` Commercial/restricted dictionary ingestion.
  - Blocker: rights/permissions.
  - Giữ nguồn restricted ở reference-only hoặc rejected cho đến khi có quyền rõ.

## LATER

- [LATER] `P1` Phase 7 - Semantic relations.
  - Use sense-level IDs, not raw headword strings.
  - OMW/WordNet relation must point to sense/cluster, not just word.

- [LATER] `P1` Phase 8 - Hán-Việt/Hán Nôm deepening.
  - Keep separate from Vietnamese `words`.
  - Do not mix Hán-Việt and Nôm readings/counts.

- [LATER] `P1` Phase 9 - Corpus evidence.
  - Add only corpora with rights/provenance.
  - Corpus examples do not become definitions.

## Commands

Use `npm.cmd` on Windows PowerShell.

Focused regeneration after Phase 6 review/export changes:

```powershell
npm.cmd run typecheck
npm.cmd run validate
npm.cmd run provenance
npm.cmd run removal
npm.cmd run stability
npm.cmd run academic:audit
npm.cmd run academic:sense-draft
npm.cmd run academic:auto-cluster
npm.cmd run academic:near-duplicates
npm.cmd run academic:silver-benchmark
npm.cmd run academic:ai-proxy-gold
npm.cmd run academic:gold:accept-ai
npm.cmd run academic:gold:check
npm.cmd run academic:confidence
npm.cmd run academic:confidence-calibration
npm.cmd run academic:samples
npm.cmd run academic:phase6-facts
npm.cmd run academic:phase6-conflicts
npm.cmd run academic:phase6-ai-review
npm.cmd run academic:phase6-ai-proxy-review
npm.cmd run academic:phase6:accept-ai
npm.cmd run academic:phase6:projection-policy
npm.cmd run academic:ai-vs-reviewed
npm.cmd run academic:phase6-review-export
npm.cmd run academic:phase6-audit
npm.cmd run academic:validate
npm.cmd run academic:report
npm.cmd run academic:review-breakdown
npm.cmd run manifest
npm.cmd run quality
npm.cmd run audit:samples
npm.cmd run report
npm.cmd run release:snapshot
```

Full pipeline from existing raw:

```powershell
npm.cmd run pipeline
```

Command expected to fail until website brief exists:

```powershell
npm.cmd run website:gate:strict
```
