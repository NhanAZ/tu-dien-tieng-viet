# Data Card: Bộ dữ liệu từ điển tiếng Việt

## Tóm tắt

Đây là bộ dữ liệu nghiên cứu đa lớp cho tiếng Việt, gồm từ điển lõi có định nghĩa, lexeme chưa có nghĩa, Hán-Việt, chữ Nôm, synset ứng viên, biến thể chính tả và ví dụ có provenance. Snapshot này là phiên bản `0.4.0-beta`, build `984181246dc11941`, profile `documented`.

## Mục đích sử dụng

- Tra cứu và xây dựng công cụ từ điển tiếng Việt có attribution.
- Nghiên cứu coverage, chuẩn hóa chính tả, Hán-Việt và chữ Nôm.
- Tạo hàng đợi biên tập, đối chiếu nguồn và benchmark NLP có kiểm soát.

Không nên dùng dữ liệu như chuẩn duy nhất để chấm đúng-sai ngôn ngữ, suy luận nguồn gốc dân tộc/ngôn ngữ, hoặc huấn luyện hệ thống đưa ra kết luận học thuật mà không kiểm chứng nguồn gốc từng fact.

## Thành phần

| Lớp | Số lượng | Ý nghĩa |
| --- | ---: | --- |
| Từ điển lõi | 89.569 | Headword tiếng Việt có ít nhất một định nghĩa |
| Định nghĩa | 283.629 | Fact theo nguồn, giữ ngôn ngữ và provenance |
| Canonical sense draft | 226.374 | Cluster nghĩa do máy xử lý trong `data/processed/senses/` |
| Lexeme-only | 26.581 | Bằng chứng chính tả, chưa khẳng định nghĩa |
| Hán-Việt | 11.936 | Chữ có nghĩa/âm từ nguồn Việt; Unihan chỉ enrichment |
| Chữ Nôm | 2.390 | Ánh xạ Quốc ngữ-tự dạng trong schema riêng |
| Synset ứng viên | 3.627 | Liên kết OMW, chưa phải gold sense mapping |
| Biến thể dấu | 70 | Quan hệ cách đặt dấu cũ/mới có cùng âm tiết |
| Ví dụ | 173.093 | Ví dụ trích từ định nghĩa nguồn |

## Nguồn và quyền sử dụng

| Source ID | Trạng thái quyền | Tầng chất lượng | License/ghi chú quyền |
| --- | --- | --- | --- |
| `vntk_dictionary` | open | tổng hợp | MIT |
| `kaikki_viwiktionary` | open | cộng đồng | CC BY-SA 4.0 / GFDL theo Wiktionary; Kaikki xuất dữ liệu phái sinh cùng license |
| `unicode_unihan` | open | học thuật | Unicode License Agreement for Data Files and Software |
| `kaikki_enwiktionary_vi` | open | cộng đồng | CC BY-SA 4.0 / GFDL theo Wiktionary |
| `underthesea_dictionary` | open | tổng hợp | GPL-3.0 cho repo |
| `underthesea_uvd` | open | học thuật | GPL-3.0 theo repository undertheseanlp/resources |
| `duyet_vietnamese_wordlist` | open | tổng hợp | GPL-2.0 |
| `hunspell_vi` | open | học thuật | GPL-3.0-or-later; thành phần gốc từ FVDP/Aspell |
| `omw_wiktionary_vi` | open | cộng đồng | CC BY-SA / GFDL theo Wiktionary |
| `dai_nam_quoc_am_tu_vi` | public-domain | học thuật | Bản gốc public domain; bản chép Wikisource theo CC BY-SA 4.0/GFDL |
| `catusf_thieu_chuu_stardict` | public-domain | học thuật | Bản gốc Thiều Chửu public domain; repository công bố CC0-1.0 cho bản số hóa |
| `chunom_standard` | documented-unclear | học thuật | Không thấy tuyên bố license riêng; nguồn cho phép tải TSV công khai và được xếp tầng documented-unclear |
| `catusf_vietviet` | documented-unclear | tổng hợp | Repository CC0-1.0; metadata ghi Hồ Ngọc Đức, provenance từng định nghĩa chưa đầy đủ |

Profile `open-only` chỉ chọn nguồn `open` hoặc `public-domain`. Profile `documented` có thể thêm nguồn `documented-unclear` khi có snapshot, attribution và cơ chế gỡ nhanh. Ý định phi thương mại không được dùng thay cho provenance hoặc quyền sử dụng.

## Thu thập và xử lý

Raw snapshot được lưu nguyên trạng kèm URL, kích thước và SHA-256. Mỗi parser tạo JSONL tách theo source ID. Merge giữ dấu thanh trong khóa headword, hợp nhất contribution nhưng không làm mất source trace. Chữ Hán, chữ Nôm và từ Quốc ngữ được tách schema; Unihan chỉ join vào chữ đã có bằng chứng Việt.

## Chất lượng và khả năng tái lập

- JSON Schema và provenance đạt trên toàn bộ lớp phát hành.
- 13 nguồn có mẫu cấu trúc tất định tối đa 100 contribution/nguồn đạt kiểm tra máy.
- Lớp canonical sense draft đạt validator riêng; đây là machine-first layer, không phải human-reviewed release.
- Source-removal test đã chứng minh có thể gỡ một nguồn bằng policy và rebuild.
- Build manifest ghi profile, nguồn, checksum raw và checksum schema.
- Các mẫu benchmark thủ công 500/1.000 đã được tạo nhưng chưa gán nhãn con người.
- Website brief chưa được điền; dữ liệu chưa được tuyên bố là schema 1.0 cho website.

## Hạn chế và thiên lệch

- Nguồn cộng đồng có độ sâu không đồng đều; nhiều headword có nghĩa tiếng Anh nhưng thiếu nghĩa tiếng Việt.
- Từ điển lịch sử Đại Nam giữ wording cổ theo nguồn và có thể khác chính tả/nghĩa hiện đại.
- IPA chủ yếu phản ánh coverage của Wiktionary, chưa bảo đảm đầy đủ phương ngữ Bắc-Trung-Nam.
- Nguồn từ nguyên còn mỏng; pipeline không tự suy đoán “thuần Việt” hay “Hán-Việt”.
- Semantic synset và ví dụ chưa qua benchmark relevance theo sense.
- Chữ Nôm trong build documented phụ thuộc một nguồn chưa có tuyên bố license riêng rõ hoàn toàn.
- Coverage 214 bộ thủ không đồng nghĩa với độ đầy đủ từ vựng hay học thuật.
- Brief website đang pending có thể làm thay đổi schema, index hoặc export contract trước khi xây website.

## Gỡ nguồn và khiếu nại

Chạy `npm.cmd run source:disable -- <source_id>`, sau đó rebuild. Có thể đổi sang profile an toàn hơn bằng `npm.cmd run profile:open`. Không xóa raw snapshot audit trước khi xác định yêu cầu pháp lý; tách raw khỏi artifact phân phối nếu có khiếu nại.
