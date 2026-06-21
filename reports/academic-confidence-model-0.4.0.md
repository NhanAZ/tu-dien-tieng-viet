# Academic Confidence Model 0.4.0

Ngày sinh: 2026-06-21T06:25:56.762Z

Trạng thái: **HEURISTIC_NOT_CALIBRATED**  
Model: `heuristic-v1`

Ba trường confidence có ý nghĩa riêng:

- `source_confidence`: confidence provenance của fact canonical.
- `cluster_confidence`: confidence heuristic của phép gom cụm.
- `canonical_selection_confidence`: confidence heuristic khi chọn bản ghi canonical trong cụm.

Không diễn giải các số này như xác suất học thuật đã hiệu chuẩn; chưa có gold labels của con người.

| Status | Clusters | Source conf. TB | Cluster conf. TB | Canonical selection TB |
| --- | ---: | ---: | ---: | ---: |
| `auto_accepted` | 38.968 | 0.9 | 0.7971 | 0.9499 |
| `entity_or_encyclopedic` | 14.423 | 0.65 | 1 | 1 |
| `machine_clustered` | 7.771 | 0.8499 | 0.7 | 0.9449 |
| `machine_retained` | 49.090 | 0.8455 | 0.9886 | 0.9973 |
| `needs_review` | 58.673 | 0.687 | 0.997 | 0.9993 |
| `reference_non_vi` | 57.449 | 0.85 | 1 | 1 |

## Nguồn canonical lớn nhất

| Source | Rights | Quality | Clusters | Source conf. TB | Canonical selection TB |
| --- | --- | --- | ---: | ---: | ---: |
| `kaikki_enwiktionary_vi` | open | cộng đồng | 57.449 | 0.85 | 1 |
| `dai_nam_quoc_am_tu_vi` | public-domain | học thuật | 48.144 | 0.7147 | 0.9997 |
| `kaikki_viwiktionary` | open | cộng đồng | 47.660 | 0.85 | 0.9904 |
| `underthesea_uvd` | open | học thuật | 41.666 | 0.9 | 0.95 |
| `catusf_vietviet` | documented-unclear | tổng hợp | 31.448 | 0.65 | 1 |
| `vntk_dictionary` | open | tổng hợp | 7 | 0.75 | 1 |

Trọng số rights và quality được ghi nguyên vẹn trong `data/processed/senses/confidence-report.json`.
