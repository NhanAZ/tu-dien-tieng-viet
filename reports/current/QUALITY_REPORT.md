# Báo cáo chất lượng dữ liệu

## Kết luận kỹ thuật

Build `984181246dc11941` đã **đạt toàn bộ cổng kiểm định tự động hiện có**: schema, provenance, tính duy nhất ID, phân lớp Việt/Hán/Nôm, checksum raw, source-removal và regression biến thể dấu. Kết quả này chứng minh pipeline nhất quán và có thể audit; nó **không thay thế thẩm định học thuật thủ công** đối với từng nghĩa.

Lớp canonical sense draft trong `data/processed/senses/` hiện có 226.374 cluster từ 283.629 definition, validation **PASS**. Phần máy đã auto/machine cluster 100.258 definition; 14.423 definition đã tách sang `data/processed/entities/`; còn 59.355 definition ở nhóm needs-review/quarantine.

Phase 6 có 590 dòng `ai-reviewed` advisory để ưu tiên review; các dòng này không phải `human-reviewed` và không được promote vào scalar IPA/dialect nếu chưa có xác nhận người.

## Cổng kiểm định tự động

| Kiểm tra | Giá trị lỗi/kết quả | Trạng thái |
| --- | ---: | --- |
| Số lượng index khớp file dữ liệu | đạt | PASS |
| Headword lõi không có định nghĩa | 0 | PASS |
| Mục chữ Hán/CJK lọt vào words | 0 | PASS |
| Chỉ mục bỏ dấu thanh sai | 0 | PASS |
| ID trùng giữa các lớp | 0 | PASS |
| Định nghĩa trùng chính xác cùng nguồn | 0 | PASS |
| Placeholder 'id.' còn sót từ Đại Nam | 0 | PASS |
| Nhóm biến thể dấu sai quan hệ | 0 | PASS |
| Raw file thiếu SHA-256 | 0 | PASS |
| Bản ghi mẫu nguồn hỏng cấu trúc | 0 | PASS |
| Source-removal regression test | đạt | PASS |
| ID ổn định giữa hai lần merge cùng input | đạt | PASS |

## Mẫu cấu trúc theo nguồn

Mỗi nguồn được lấy mẫu tất định tối đa 100 contribution, kiểm tra headword/fact không rỗng, source ID và SHA-256 provenance. Đây là kiểm tra cấu trúc máy, không phải chấm đúng-sai ngữ nghĩa.

| Nguồn | Contribution khả dụng | Cỡ mẫu | Đạt | Lỗi | Trạng thái |
| --- | ---: | ---: | ---: | ---: | --- |
| `vntk_dictionary` | 41.687 | 100 | 100 | 0 | PASS |
| `kaikki_viwiktionary` | 63.160 | 100 | 100 | 0 | PASS |
| `unicode_unihan` | 10.223 | 100 | 100 | 0 | PASS |
| `kaikki_enwiktionary_vi` | 89.199 | 100 | 100 | 0 | PASS |
| `underthesea_dictionary` | 26.024 | 100 | 100 | 0 | PASS |
| `underthesea_uvd` | 41.681 | 100 | 100 | 0 | PASS |
| `duyet_vietnamese_wordlist` | 25.346 | 100 | 100 | 0 | PASS |
| `hunspell_vi` | 942 | 100 | 100 | 0 | PASS |
| `omw_wiktionary_vi` | 4.941 | 100 | 100 | 0 | PASS |
| `dai_nam_quoc_am_tu_vi` | 48.151 | 100 | 100 | 0 | PASS |
| `catusf_thieu_chuu_stardict` | 9.898 | 100 | 100 | 0 | PASS |
| `chunom_standard` | 2.390 | 100 | 100 | 0 | PASS |
| `catusf_vietviet` | 40.074 | 100 | 100 | 0 | PASS |

## Regression đã khóa

- `words` bắt buộc có ký tự Latin; chữ Hán thuần không thể làm phình số mục từ tiếng Việt.
- Unihan không thể tự tạo mục Hán-Việt; số mục chỉ có Unihan hiện bằng 0.
- `headword_no_tone` chỉ bỏ năm dấu thanh, giữ nguyên â/ă/ê/ô/ơ/ư.
- Nhóm dấu chỉ hợp lệ khi mọi dạng có cùng base sau khi bỏ dấu thanh và cùng tone signature. Sau sửa lỗi, 1.536 nhóm giả giảm còn 70 nhóm thật như `hoà/hòa`.
- Source-removal test tắt một nguồn bằng policy, rebuild, rồi bật lại để chứng minh rollback không cần sửa parser.
- Fingerprint ID của bảy lớp phải giữ nguyên qua hai lần merge cùng normalized input.

## Benchmark thủ công còn mở

- `data/audit/qa-word-sample-500.json`: 500 mục phân tầng trên các nguồn định nghĩa lõi, đã qua kiểm tra máy nhưng trường đánh giá con người còn để `null`.
- `data/audit/sense-merge-gold-template-1000.json`: 1.000 cặp nghĩa liên nguồn để gán nhãn same/related/different/uncertain; chưa được gọi là gold cho đến khi có người duyệt.
- `data/audit/missing-definitions-top-5000.json`: hàng đợi lexeme thiếu nghĩa, ưu tiên theo số nguồn bằng chứng.

Vì các benchmark thủ công này chưa hoàn tất, release không tự nhận là “đầy đủ nhất” hoặc “chuẩn học thuật tuyệt đối”.
