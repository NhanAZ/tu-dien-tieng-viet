# Kế hoạch Pha 5 - Hợp nhất nghĩa và chuẩn hóa học thuật 0.4.0

Ngày tạo: 20/06/2026

## Mục tiêu

Pha 5 biến dữ liệu sau Pha 4 từ trạng thái "nhiều mục và có provenance" thành trạng thái có thể kiểm soát học thuật ở mức nghĩa. Trọng tâm không phải tăng số lượng headword, mà là:

- phân biệt nghĩa thật, định nghĩa trùng, paraphrase gần nhau và mô tả bách khoa;
- thiết kế `sense_id` ổn định;
- tạo hàng đợi review có ưu tiên;
- đo chất lượng theo nguồn, confidence, nhãn, POS, ví dụ và quyền sử dụng;
- chỉ cho phép gộp nghĩa tự động sau khi có gold sample và benchmark.

Website vẫn ngoài phạm vi. Pha này chỉ chuẩn bị dữ liệu cho nghiên cứu sâu và cho một schema web tương lai.

## Trạng thái đầu vào

- Dataset hiện hành: `0.3.0`.
- Working profile: `documented`.
- `data/processed/words/` có headword và definition-level provenance.
- Schema hiện tại chưa có `sense_id`, `sense_group`, `definition_cluster` hoặc review workflow chính thức.
- Human QA vẫn chưa đạt cổng 500 mục/1.000 cặp nghĩa.

## Nguyên tắc

- Không sửa trực tiếp `data/processed/words/` trong Pha 5-alpha.
- Không gộp nghĩa bằng heuristic nếu chưa có benchmark.
- Không biến wordlist/corpus-only thành định nghĩa.
- Không dịch máy định nghĩa tiếng Anh để tăng coverage tiếng Việt.
- Mọi quyết định gộp/tách nghĩa phải giữ được source trace gốc.

## Mốc 0.4.0-alpha - Academic Audit

### Công việc

1. Sinh audit từ dữ liệu hiện hành:
   - coverage theo định nghĩa, nguồn, language, POS, label, example, confidence, review status;
   - exact duplicate và near-duplicate candidate trong từng headword;
   - candidate cần review: quyền chưa rõ, confidence thấp, thiếu POS, thiếu label, thiếu ví dụ, nhãn tên riêng/địa danh/bách khoa, định nghĩa quá ngắn/dài;
   - danh sách headword đa nghĩa nhiều định nghĩa cần ưu tiên.
2. Sinh dữ liệu máy đọc được trong `data/audit/academic/`.
3. Đưa số liệu đọc cho người vào `reports/academic-layer-report-0.4.0.md`.

### Gate

- Lệnh `npm.cmd run academic:audit` chạy được và tái lập.
- Báo cáo nêu rõ dataset có hay chưa đủ điều kiện Pha 5.
- Không thay đổi output release hiện hành.

## Mốc 0.4.0-beta - Sense Model Draft

### Công việc

1. Thiết kế schema nháp cho:
   - `sense_id`;
   - `sense_group_id`;
   - `definition_cluster_id`;
   - `canonical_definition`;
   - `source_definitions`;
   - `review_status`;
   - `merge_decision`;
   - `domain/register/region/period/usage_status`.
2. Tạo migration thử nghiệm từ audit candidates, không ghi đè `words`.
3. Tạo `data/audit/academic/gold-sense-pairs.todo.jsonl` từ queue ưu tiên.
4. Chạy machine-first auto cluster để xử lý phần chắc trước:
   - exact duplicate khác nguồn;
   - chọn canonical definition theo ưu tiên nguồn;
   - phân tầng `auto_accepted`, `machine_clustered`, `machine_retained`, `needs_review`, `quarantined`, `reference_non_vi`;
   - giữ near-duplicate ở dạng candidate nếu chưa có benchmark.

### Gate

- Schema nháp validate được trên sample.
- Tối thiểu 1.000 cặp nghĩa được chọn làm gold sample todo.
- Không mất provenance khi map definition sang sense candidate.
- `npm.cmd run academic:auto-cluster` sinh được canonical sense cluster draft.

## Mốc 0.4.0-rc - Benchmark và Review Queue

### Công việc

1. Gán nhãn thủ công gold sample:
   - `same_sense`;
   - `near_paraphrase`;
   - `different_sense`;
   - `encyclopedic_or_name`;
   - `unclear`.
2. Đo precision/recall của duplicate và near-duplicate heuristic.
3. Chỉ bật auto-merge cho nhóm có precision đạt ngưỡng đã chốt.
4. Phần không chắc vào review queue, không merge im lặng.

### Gate

- Gold sample tối thiểu 1.000 cặp nghĩa có nhãn.
- Precision auto-merge đạt ngưỡng dự án chốt.
- Có conflict report giữa nguồn.

## Mốc 0.4.0 - Academic Sense Release

### Artifact

- `data/audit/academic/summary.json`
- `data/audit/academic/source-academic-stats.json`
- `data/audit/academic/duplicate-candidates.json`
- `data/audit/academic/review-queue.sample.jsonl`
- `data/audit/academic/sense-entry.draft.schema.json`
- `data/audit/academic/sense-inventory.jsonl.gz`
- `data/audit/academic/sense-inventory.sample.jsonl`
- `data/audit/academic/sense-cluster-candidates.json`
- `data/audit/academic/gold-sense-pairs.sense-todo.jsonl`
- `data/audit/academic/auto-cluster-summary.json`
- `data/audit/academic/canonical-sense-clusters.jsonl.gz`
- `data/audit/academic/canonical-sense-clusters.sample.jsonl`
- `data/audit/academic/auto-cluster-review-remainder.sample.jsonl`
- `data/audit/academic/auto-cluster-near-candidates.json`
- `data/processed/senses/index.json`
- `data/processed/senses/validation-summary.json`
- `data/processed/senses/canonical-sense-clusters.jsonl.gz`
- `data/processed/senses/canonical-sense-clusters.sample.jsonl`
- `data/processed/senses/review-remainder.sample.jsonl`
- `data/processed/senses/near-duplicate-candidates.json`
- `data/schema/canonical-sense-cluster.schema.json`
- `data/schema/review-remainder.schema.json`
- `reports/academic-layer-report-0.4.0.md`
- schema nháp sense-level nếu beta/rc hoàn tất

### Gate phát hành

- Pha 5-alpha audit pass.
- `npm.cmd run academic:sense-draft` sinh được sense ID nháp ổn định cho toàn bộ definition.
- `npm.cmd run academic:auto-cluster` giảm duplicate bằng exact-source agreement và không làm mất provenance.
- `npm.cmd run academic:validate` đạt trên `data/processed/senses/`.
- `npm.cmd run academic:report` sinh báo cáo layer.
- Có kế hoạch review người thật và benchmark rõ ràng.
- Không tuyên bố "chuẩn học thuật hoàn chỉnh" nếu gold sample/human QA chưa đạt.
- Nếu schema sense-level chưa ổn định, release chỉ được gọi là `0.4.0-alpha` hoặc `0.4.0-beta`, không gọi là data 1.0.

## Việc không làm trong Pha 5

- Không xây website chính thức.
- Không nhập nguồn mới chỉ để tăng số lượng.
- Không tự sinh nghĩa bằng AI.
- Không sửa tay file processed lớn.
- Không gộp Hán-Việt/Nôm vào headword tiếng Việt.
