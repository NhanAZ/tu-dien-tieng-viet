# Kế hoạch thu thập dữ liệu từ điển tiếng Việt theo nhiều pha

## 1. Mục đích

Tài liệu này là kế hoạch thực thi chính cho giai đoạn dữ liệu. Nó chuyển dự án từ cách làm "tìm được nguồn nào thì nhập ngay nguồn đó" sang quy trình có cổng kiểm soát rõ ràng:

1. Chốt phạm vi và mô hình dữ liệu.
2. Đánh giá nguồn trước khi tải hàng loạt.
3. Nhập từng nhóm dữ liệu theo mục đích.
4. Đo chất lượng độc lập với số lượng.
5. Chỉ phát hành khi có thể truy nguyên và gỡ từng nguồn.

Website vẫn nằm ngoài phạm vi cho đến khi hoàn tất các pha dữ liệu bắt buộc.

## 2. Sửa cách hiểu về "bộ dữ liệu lớn"

Không cộng tất cả loại dữ liệu vào một con số duy nhất. Dự án phải công bố riêng tối thiểu các chỉ số sau:

- Số mục từ tiếng Việt có ít nhất một định nghĩa tiếng Việt.
- Số nghĩa, không chỉ số headword.
- Số headword chỉ có bằng chứng từ wordlist, Hunspell hoặc corpus nhưng chưa có định nghĩa.
- Số thành ngữ, tục ngữ và tổ hợp cố định.
- Số mục từ cổ, phương ngữ, khẩu ngữ, thuật ngữ chuyên ngành.
- Số mục có phát âm, từ loại, từ nguyên, ví dụ và quan hệ ngữ nghĩa.
- Số chữ Hán có âm Hán Việt và nghĩa tiếng Việt.
- Số cách ghi chữ Nôm có âm Quốc ngữ và dẫn chứng nguồn.
- Số chữ được Unihan bổ sung metadata. Chỉ số này không được gọi là số mục Hán Việt hoặc Hán Nôm.

Một chữ CJK chỉ có mã Unicode, bộ thủ hoặc số nét không phải là một mục Hán Việt. Unihan chỉ là nguồn làm giàu metadata cho mục đã được xác lập từ nguồn tiếng Việt/Hán Nôm.

## 3. Các sản phẩm dữ liệu tách biệt

### 3.1. Từ điển lõi tiếng Việt

Chứa headword có ít nhất một nghĩa, với mỗi nghĩa có provenance riêng. Đây là tập được dùng để tính "số mục từ điển tiếng Việt".

Đầu ra dự kiến: `data/processed/words/`.

### 3.2. Kho từ vựng mở rộng

Chứa từ xuất hiện trong wordlist, Hunspell, corpus hoặc tài nguyên NLP nhưng chưa có định nghĩa đủ tin cậy. Tập này phục vụ autocomplete, spellcheck, phát hiện khoảng trống và xếp hàng biên tập.

Đầu ra dự kiến: `data/processed/lexemes/`.

Không cộng tập này vào số mục từ điển lõi.

### 3.3. Lớp ngữ nghĩa

Chứa synset, đồng nghĩa, trái nghĩa, hypernym, hyponym, miền nghĩa và ánh xạ đa ngữ. Dữ liệu WordNet không được ép trực tiếp vào một mảng `synonyms` nếu chưa giữ được sense/synset.

Đầu ra dự kiến: `data/processed/semantics/`.

### 3.4. Lớp Hán Việt

Chứa chữ có âm Hán Việt và nghĩa tiếng Việt từ nguồn Hán Việt xác định, thí dụ Thiều Chửu. Bộ thủ, số nét và biến thể được Unihan bổ sung sau, không tạo mục mới.

Đầu ra dự kiến: `data/processed/han-viet/`.

### 3.5. Lớp chữ Nôm

Chứa quan hệ giữa âm/từ Quốc ngữ và một hoặc nhiều cách ghi Nôm, biến thể tự dạng, nguồn văn bản và mức độ tin cậy. Không gộp `readings_nom` vào `readings_han_viet`.

Đầu ra dự kiến: `data/processed/nom/`.

### 3.6. Lớp dẫn chứng corpus

Chứa câu trích, tài liệu, vị trí, thời kỳ, thể loại và kết quả phân tích ngôn ngữ. Dẫn chứng corpus không được biến thành định nghĩa.

Đầu ra dự kiến: `data/processed/evidence/`.

## 4. Hồ sơ sử dụng nguồn

Dự án duy trì ba profile build:

| Profile | Nội dung | Mục đích |
| --- | --- | --- |
| `open-only` | Chỉ nguồn mở hoặc public domain đã xác minh | Bản có thể tái phân phối công khai an toàn nhất |
| `documented` | Thêm nguồn chưa rõ hoàn toàn nhưng có provenance, snapshot và cơ chế gỡ | Nghiên cứu nội bộ, đánh giá coverage |
| `reference-only` | Nguồn hạn chế, thương mại hoặc permission-only | Chỉ đối chiếu thủ công, không nhập nội dung vào dữ liệu phát hành |

Mỗi nguồn phải có `source_id` ổn định và các trường:

```text
source_id
source_name
source_url
snapshot_url_or_revision
retrieved_at
content_hash
license
license_url
rights_status
redistribution_allowed
commercial_allowed
share_alike_required
attribution_required
quality_tier
enabled_profiles
removal_notes
```

Mỗi đóng góp dữ liệu phải truy được đến nguồn:

```text
entry_id
sense_id_or_fact_id
source_id
source_entry_id_or_url
source_revision
raw_record_hash
confidence
review_status
imported_at
```

## 5. Cổng bắt buộc cho mọi nguồn

Một nguồn chỉ được chuyển sang bước parse khi có đủ hồ sơ tối thiểu:

1. Xác định chủ thể/tổ chức phát hành.
2. Xác định URL gốc hoặc snapshot có revision.
3. Xác định định dạng và ước lượng số bản ghi.
4. Ghi trạng thái quyền sử dụng, kể cả khi là `documented-unclear`.
5. Ghi chất lượng dự kiến: học thuật, cộng đồng, tổng hợp, OCR hoặc machine-generated.
6. Lấy mẫu ít nhất 100 bản ghi và đánh giá lỗi.
7. Xác định parser, khóa định danh và cách rollback.
8. Chứng minh có thể loại toàn bộ đóng góp của nguồn bằng rebuild.

Không đạt cổng này thì nguồn chỉ nằm trong `reports/current/SOURCES_CANDIDATES.md`.

## 6. Tổng quan các pha

| Pha | Tên | Kết quả chính |
| ---: | --- | --- |
| 0 | Đóng băng và sửa baseline | Hủy hiệu lực số liệu sai, kiểm kê dữ liệu hiện có |
| 1 | Kiến trúc provenance và rollback | Source registry, contribution trace, lệnh tắt nguồn |
| 2 | Thẩm định nguồn | Hồ sơ nguồn, mẫu dữ liệu, điểm chất lượng, quyết định ingest |
| 3 | Từ điển lõi mở | Baseline tiếng Việt có định nghĩa và nguồn rõ |
| 4 | Mở rộng headword và chính tả | Lexeme coverage, không làm phình giả số mục từ điển |
| 5 | Hợp nhất nghĩa và chuẩn hóa học thuật | Sense model, dedupe, nhãn register/region/domain |
| 6 | Phát âm, từ nguyên và biến thể | IPA, normalizer, phương ngữ, cổ/ngữ mạng |
| 7 | Quan hệ ngữ nghĩa | WordNet/synset và quan hệ theo từng nghĩa |
| 8 | Hán Việt và Hán Nôm | Hai lớp riêng, Unihan chỉ enrichment |
| 9 | Corpus và dẫn chứng | Ví dụ thật, tần suất, collocation có citation |
| 10 | QA, versioning và phát hành | Data card, benchmark, release reproducible |

## 7. Chi tiết từng pha

## Pha 0 - Đóng băng và sửa baseline

### Công việc

- Gắn trạng thái `invalidated` cho báo cáo 49.931/97.536 hiện tại.
- Không xóa raw snapshot; giữ lại để audit lỗi đã xảy ra.
- Xác định từng thư mục normalized/processed do nguồn nào tạo.
- Lập danh sách lỗi thiết kế hiện tại, đặc biệt việc Unihan tự sinh mục.
- Chốt thuật ngữ: tiếng Việt, Hán Việt, chữ Hán dùng tại Việt Nam, chữ Nôm, CJK metadata.
- Lưu baseline checksum và dung lượng để so sánh sau này.

### Đầu ra

- `data/processed/STATUS.md`.
- `docs/BASELINE_AUDIT.md`.
- Danh sách nguồn và số đóng góp hiện tại.

### Cổng hoàn tất

- Không còn tài liệu nào gọi 97.536 code point Unihan là 97.536 mục Hán Việt/Hán Nôm.
- Tất cả số liệu cũ được đánh dấu không dùng cho release.
- Chưa ingest thêm nguồn mới.

## Pha 1 - Kiến trúc provenance và rollback

### Công việc

- Chuyển registry nguồn từ mô tả tự do sang dữ liệu máy đọc được.
- Tách raw, normalized và contribution theo `source_id`.
- Thêm `source_revision`, `raw_record_hash`, `confidence` và `review_status`.
- Thiết lập profile `open-only`, `documented`, `reference-only`.
- Viết lệnh bật/tắt nguồn và rebuild toàn bộ output.
- Viết test "source removal": tắt một nguồn, bảo đảm không còn fact/sense nào trỏ tới nguồn đó.
- Ghi dependency license cho dữ liệu phái sinh và yêu cầu attribution.

### Đầu ra

- `data/source-registry.json`.
- `data/source-policy.json`.
- `npm.cmd run source:disable -- <source_id>`.
- `npm.cmd run source:enable -- <source_id>`.
- `data/processed/source-manifest.json` cho mỗi build.

### Cổng hoàn tất

- 100% sense/fact có provenance.
- Có thể gỡ một nguồn và rebuild mà không sửa code parser.
- Build manifest liệt kê profile, source revision và checksum.

## Pha 2 - Thẩm định nguồn trước ingest

### Nhóm A: khảo sát ngay

- Kaikki/viwiktionary và enwiktionary phần tiếng Việt.
- FVDP Việt-Việt và các bộ song ngữ liên quan.
- undertheseanlp/resources `DI_Vietnamese-UVD`.
- OVDP SourceForge và mirror StarDict.
- catusf/tudien, đánh giá từng từ điển con thay vì áp license repo cho tất cả file.
- vntk/dictionary.
- duyet/vietnamese-wordlist và hunspell-vi.

### Nhóm B: khảo sát sau baseline

- OMW, Vietnamese WordNet, Vietnamese SentiWordNet.
- VietNormalizer, ViLexNorm, ViSoLex, ViDia2Std.
- Nôm Foundation, chunom.org, viet-yomitan.
- PhoMT, TALPCo, Underthesea corpus, Concepticon, WOLD, PanLex.

### Nhóm C: xin quyền hoặc chỉ đối chiếu

- VLSP/DUA, ELRA Vietnamese WordNet, ELRA Etymology Dictionary.
- HVDic Thi Viện, VDict, Soha, Laban, Cambridge, SEAlang.
- Dữ liệu app/mobile hoặc bộ thương mại không có quyền trích xuất.

### Chấm điểm nguồn

Mỗi nguồn được chấm 0-5 ở các tiêu chí:

- Độ tin cậy học thuật.
- Rõ provenance.
- Rõ quyền sử dụng.
- Chất lượng cấu trúc.
- Độ phủ tiếng Việt.
- Khả năng tái lập snapshot.
- Chi phí parse và QA.

### Cổng hoàn tất

- Mỗi nguồn Nhóm A có dossier và mẫu 100 bản ghi.
- Có quyết định `ingest`, `quarantine`, `reference-only` hoặc `reject`.
- Không quyết định dựa riêng vào số lượng quảng cáo của nguồn.

## Pha 3 - Xây từ điển lõi mở

### Thứ tự thực hiện

1. Kaikki/viwiktionary.
2. Kaikki/enwiktionary với `lang=Vietnamese`.
3. FVDP Việt-Việt đã xác định snapshot.
4. underthesea UVD nếu qua cổng nguồn.
5. vntk và các tập catusf đã đánh giá provenance.

### Chuẩn hóa

- Unicode NFC.
- Giữ dấu thanh khi tạo khóa merge.
- Tách headword gốc, normalized và no-tone index.
- Giữ nguyên từng sense theo nguồn trước khi dedupe.
- Gắn ngôn ngữ của định nghĩa, ví dụ và bản dịch.
- Không suy đoán `thuần Việt` hoặc `Hán Việt` chỉ từ hình thức từ.

### Cổng hoàn tất

- 100% mục lõi có ít nhất một định nghĩa.
- 100% định nghĩa có source trace.
- 0 lỗi JSON Schema và 0 lỗi UTF-8/NFC.
- Báo cáo riêng số headword, sense, ví dụ và nguồn.
- Kiểm tra thủ công mẫu phân tầng tối thiểu 500 mục.

## Pha 4 - Mở rộng headword và chính tả

### Nguồn

- duyet/vietnamese-wordlist.
- hunspell-vi và `dictionary-vi`.
- undertheseanlp/dictionary wordlist.
- Headword chưa có nghĩa từ FVDP/OVDP/catusf.
- Tần suất headword từ corpus sau khi lọc lỗi tokenization.

### Quy tắc

- Headword chưa có nghĩa đi vào `lexemes`, không đi vào `words`.
- Phân biệt từ, cụm từ, tên riêng, ký hiệu, lỗi OCR và token rác.
- Lưu bằng chứng xuất hiện và nguồn, không tạo định nghĩa giả.
- Tạo hàng đợi "missing definitions" theo tần suất và số nguồn đồng thuận.

### Cổng hoàn tất

- Báo cáo coverage theo nguồn và giao giữa các wordlist.
- Có precision estimate qua mẫu thủ công cho headword mới.
- Không tăng số mục từ điển lõi chỉ bằng wordlist.

## Pha 5 - Hợp nhất nghĩa và chuẩn hóa học thuật

### Công việc

- Thiết kế `sense_id` ổn định theo headword, POS và nghĩa nguồn.
- Phân biệt trùng nguyên văn, paraphrase gần nhau và nghĩa thực sự khác.
- Dedupe hai tầng: exact normalization trước, semantic candidate sau.
- Semantic dedupe chỉ tự động khi ngưỡng đã được hiệu chỉnh trên gold sample.
- Gắn nhãn `register`, `region`, `domain`, `period`, `usage_status`.
- Giữ wording gốc có citation; có thể có trường bản chuẩn hóa tách biệt.
- Tách thành ngữ, tục ngữ và cụm cố định khỏi compound tự do.

### Cổng hoàn tất

- Gold sample tối thiểu 1.000 cặp nghĩa.
- Precision merge tự động đạt ngưỡng đã chốt, mục không chắc chuyển review queue.
- Không mất provenance khi gộp nghĩa.
- Có báo cáo xung đột giữa nguồn.

## Pha 6 - Phát âm, từ nguyên và biến thể

### Công việc

- Chuẩn hóa IPA theo phương ngữ được ghi rõ, không tạo một IPA giả định cho mọi vùng.
- Thêm syllable count và tokenization có kiểm chứng.
- Tích hợp normalizer cho Unicode, dấu cũ/mới, viết tắt và số.
- Thêm variant relation cho phương ngữ, từ cổ, teencode và lỗi chính tả.
- Từ nguyên chỉ được nhập từ nguồn cụ thể; không suy đoán bằng mô hình.
- Đánh giá ELRA Etymology Dictionary và WOLD trong profile phù hợp.

### Cổng hoàn tất

- Mỗi biến thể chỉ đến canonical headword có lý do và nguồn.
- Phân biệt rõ variant, misspelling, dialect và historical form.
- Báo cáo coverage IPA/từ nguyên theo nguồn và vùng.

## Pha 7 - Quan hệ ngữ nghĩa

### Công việc

- Đánh giá OMW và Vietnamese WordNet theo synset, không theo chuỗi từ đơn thuần.
- Ánh xạ word sense của từ điển lõi sang synset bằng rule + review queue.
- Lưu đồng nghĩa/trái nghĩa/bao-hàm ở mức sense.
- SentiWordNet và WSD là lớp bổ sung, không sửa định nghĩa gốc.

### Cổng hoàn tất

- Không có quan hệ ngữ nghĩa mồ côi hoặc trỏ nhầm POS.
- Có benchmark ánh xạ sense-synset.
- Mỗi quan hệ có source và confidence.

## Pha 8 - Hán Việt và Hán Nôm

### 8A. Hán Việt

- Dùng Thiều Chửu làm benchmark nền về âm và nghĩa.
- Đối chiếu Wiktionary và nguồn Hán Việt khác đã qua cổng.
- Mỗi chữ phải có ít nhất một âm Hán Việt hoặc nghĩa tiếng Việt từ nguồn xác định mới được tính là mục Hán Việt.
- Compound Hán Việt trỏ về headword tiếng Việt bằng quan hệ, không trộn hai schema.

### 8B. Chữ Nôm

- Thiết kế schema riêng cho Quốc ngữ, tự dạng Nôm, variant, văn bản dẫn chứng và tần suất.
- Ưu tiên Nôm Foundation và chunom.org sau khi hoàn thành dossier.
- Phân biệt chữ Hán mượn âm/nghĩa, chữ Nôm tự tạo và variant glyph khi nguồn cho phép.
- Không gọi toàn bộ chữ Nôm là "chữ Hán tiếng Trung" và không gọi toàn bộ chữ Hán là chữ Nôm.

### 8C. Unihan enrichment

- Chỉ join vào code point đã tồn tại từ 8A hoặc 8B.
- Chỉ bổ sung code point, radical-stroke, total strokes, variants và Vietnamese IRG references.
- `kVietnamese` là một thuộc tính đối chiếu, không tự động thắng nguồn âm Hán Việt chuyên ngành.
- `kDefinition` tiếng Anh phải ghi ngôn ngữ và không thay nghĩa tiếng Việt.

### Cổng hoàn tất

- Không còn mục chỉ có metadata Unihan nhưng không có bằng chứng Việt/Hán Nôm.
- Báo cáo riêng Hán Việt và Nôm.
- Benchmark Thiều Chửu nêu rõ số chữ, số âm, số nghĩa và phần thiếu.
- Coverage 214 bộ thủ chỉ là thống kê phân bố, không phải chứng minh độ đầy đủ.

## Pha 9 - Corpus và dẫn chứng

### Nguồn ưu tiên

- Underthesea News/Law Corpus nếu điều khoản phù hợp.
- PhoMT và TALPCo cho ví dụ song ngữ.
- VLSP corpus sau khi có DUA.
- Thư viện số Hán Nôm cho dẫn chứng lịch sử theo điều kiện sử dụng.

### Công việc

- Sentence segmentation, word segmentation và POS tagging bằng pipeline versioned.
- Lấy câu thật theo sense candidate, không dùng câu ngẫu nhiên chỉ vì chứa headword.
- Ghi document id, vị trí, năm, thể loại và license.
- Lọc dữ liệu cá nhân và nội dung không phù hợp trước khi phát hành.
- Tính frequency/collocation theo corpus, không trộn tần suất từ các corpus khác nhau mà thiếu trọng số.

### Cổng hoàn tất

- Mỗi ví dụ có citation và quyền sử dụng phù hợp profile.
- Đánh giá thủ công relevance của mẫu ví dụ.
- Tần suất ghi rõ corpus, thời kỳ và phương pháp tokenization.

## Pha 10 - QA, versioning và phát hành

### Bộ kiểm định bắt buộc

- JSON Schema và referential integrity.
- Unicode NFC, code point hợp lệ và round-trip UTF-8.
- ID ổn định giữa hai build cùng input.
- Không có source trace hỏng.
- Source-removal regression test.
- Exact duplicate và near-duplicate report.
- Mẫu QA phân tầng theo nguồn, POS, vùng, thời kỳ và độ hiếm.
- Kiểm tra regression cho các cặp dấu như `ma`, `má`, `mà`, `mả`, `mã`, `mạ`.
- Kiểm tra Hán/Nôm trên code point ngoài BMP.

### Artifact phát hành

- `reports/current/DATA_CARD.md`: phạm vi, nguồn, hạn chế, bias, cách dùng.
- `SOURCES.md`: attribution và snapshot.
- `reports/current/COVERAGE_REPORT.md`: số liệu đúng ngữ nghĩa.
- `reports/current/QUALITY_REPORT.md`: lỗi, mẫu QA, confidence.
- `CHANGELOG.md`: thay đổi theo phiên bản.
- Manifest checksum cho raw/normalized/processed.
- Hai build tách biệt: `open-only` và `documented`.

### Cổng hoàn tất

- Pipeline tái lập được từ raw snapshot.
- Tất cả test bắt buộc đạt.
- Không dùng các từ "đầy đủ nhất" hoặc "chuẩn học thuật" nếu chưa công bố benchmark và hạn chế.
- Release được gắn semantic version và ngày snapshot.

## 8. Thứ tự triển khai thực tế gần nhất

Không bắt đầu Pha 3 trước khi Pha 0-2 hoàn tất. Trình tự công việc kế tiếp là:

1. Gắn invalidated cho output hiện tại và viết baseline audit.
2. Hoàn thiện registry/provenance/rollback.
3. Lập dossier cho toàn bộ Nhóm A trong tài liệu tra soát nguồn.
4. Chốt schema v2 sau khi xem mẫu thật từ Nhóm A.
5. Mới bắt đầu tải và parse baseline theo từng source PR/change set độc lập.

## 9. Nguyên tắc dừng

Dừng một nguồn hoặc một pha khi xảy ra một trong các điều kiện:

- Không xác định được nguồn gốc dữ liệu.
- Parser tạo tỷ lệ bản ghi lỗi vượt ngưỡng đã chốt.
- Không thể gỡ riêng đóng góp của nguồn.
- Dữ liệu làm giảm precision hoặc phá schema mà không có review queue.
- Nguồn thay đổi điều khoản, chặn truy cập hoặc có khiếu nại.
- Số lượng tăng nhưng không tăng coverage có ý nghĩa.

Khi dừng, giữ raw snapshot trong khu vực quarantine nếu phù hợp, ghi quyết định vào audit log và không đưa contribution vào release.

## 10. Định nghĩa hoàn thành toàn dự án dữ liệu

Giai đoạn dữ liệu chỉ được coi là hoàn thành khi:

- Từ điển lõi, lexeme, semantics, Hán Việt, Nôm và corpus evidence đã tách lớp.
- Mọi fact/sense có provenance và có thể gỡ theo nguồn.
- Có benchmark chất lượng, không chỉ thống kê số lượng.
- Có bản `open-only` tái phân phối được và bản `documented` phục vụ nghiên cứu nội bộ.
- Hạn chế dữ liệu được ghi công khai trong data card.
- Website có thể đọc schema ổn định mà không phải tự suy đoán ý nghĩa trường dữ liệu.
