# Academic Layer Report 0.4.0

Ngày sinh: 2026-06-21T06:28:02.226Z

Trạng thái layer: **MACHINE_FIRST_DRAFT**  
Validation: **PASS**

Layer này nằm ở `data/processed/senses/` và là canonical sense draft do máy xử lý. Nó đã có schema và validator, nhưng chưa phải bản human-reviewed.

## Tổng quan

| Chỉ tiêu | Giá trị |
| --- | ---: |
| Headword nguồn | 89.569 |
| Definition nguồn | 283.629 |
| Canonical sense clusters | 226.374 |
| Definition đã xử lý bằng exact/machine cluster | 100.258 |
| Definition còn needs-review/quarantine | 59.355 |
| Definition tách sang entity/encyclopedic | 14.423 |
| Tỷ lệ còn needs-review/quarantine | 20.93% |
| Near-duplicate pair chưa merge | 11.144 |

## Phân tầng

| Status | Cluster | Definition | Tỷ lệ definition |
| --- | ---: | ---: | ---: |
| `auto_accepted` | 38.968 | 84.712 | 29.87% |
| `machine_clustered` | 7.771 | 15.546 | 5.48% |
| `machine_retained` | 49.090 | 52.144 | 18.38% |
| `needs_review` | 58.673 | 59.355 | 20.93% |
| `quarantined` | 0 | 0 | 0% |
| `entity_or_encyclopedic` | 14.423 | 14.423 | 5.09% |
| `reference_non_vi` | 57.449 | 57.449 | 20.25% |

## Artifact Chính

- `data/processed/senses/index.json`
- `data/processed/senses/validation-summary.json`
- `data/processed/senses/canonical-sense-clusters.jsonl.gz`
- `data/processed/senses/canonical-sense-clusters.sample.jsonl`
- `data/processed/senses/review-remainder.sample.jsonl`
- `data/processed/senses/near-duplicate-candidates.json`

## Còn Lại

- `auto_accepted` và `machine_clustered` có thể dùng làm lớp canonical draft.
- `machine_retained` là singleton/nhóm giữ lại bằng máy, chưa gộp.
- `needs_review` và `quarantined` chưa nên gọi là học thuật sạch.
- `entity_or_encyclopedic` đã tách ra `data/processed/entities/`, không bị tính là lỗi quarantine của lõi học thuật.
- `reference_non_vi` là định nghĩa không phải tiếng Việt, hữu ích để đối chiếu nhưng không thay thế định nghĩa tiếng Việt.
