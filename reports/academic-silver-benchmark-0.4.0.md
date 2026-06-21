# Silver Sense Benchmark 0.4.0

Ngày sinh: 2026-06-21T06:25:46.250Z

Trạng thái: **SILVER_BENCHMARK_NOT_GOLD**  
Quyết định: **NO_AUTO_MERGE**

Benchmark dùng 1.000 cặp: 200 positive controls và 800 near candidates lấy phân tầng trên toàn bộ 11.144 cặp. Labeler không đọc score khi gán nhãn; score chỉ dùng sau đó để tính metric theo threshold.

| Nhãn | Số cặp |
| --- | ---: |
| same_sense | 514 |
| near_paraphrase | 107 |
| different_sense | 60 |
| unclear | 319 |
| đủ điều kiện đo threshold | 481 |

| Threshold | TP | FP | TN | FN | Precision | Recall | F1 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.82 | 421 | 60 | 0 | 0 | 0.8753 | 1 | 0.9335 |
| 0.86 | 347 | 60 | 0 | 74 | 0.8526 | 0.8242 | 0.8382 |
| 0.90 | 279 | 60 | 0 | 142 | 0.823 | 0.6627 | 0.7342 |
| 0.94 | 151 | 60 | 0 | 270 | 0.7156 | 0.3587 | 0.4779 |
| 0.98 | 30 | 60 | 0 | 391 | 0.3333 | 0.0713 | 0.1175 |

Không threshold nào được cấp quyền auto-merge từ benchmark này. Đây là silver control set, không phải human gold; các hàng unclear chưa được giải quyết và queue cân bằng không phản ánh prevalence thực tế.

Artifact máy đọc: `data/processed/senses/silver-benchmark-report.json`.  
Benchmark rows: `data/audit/academic/silver-sense-benchmark.jsonl`.
