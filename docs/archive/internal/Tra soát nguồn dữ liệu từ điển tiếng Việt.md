# Tra soát nguồn dữ liệu từ điển tiếng Việt

> Mục tiêu: tổng hợp càng nhiều nguồn dữ liệu có thể dùng để xây dựng từ điển tiếng Việt, gồm nguồn mở, dữ liệu học thuật, corpus, wordlist, Hán–Nôm/Hán–Việt, WordNet, nguồn song ngữ và các nguồn chỉ nên dùng để đối chiếu vì có khả năng có bản quyền.

---

## 1. Nguồn nên ưu tiên dùng trước

| Nguồn | Loại dữ liệu | Gợi ý dùng |
|---|---:|---|
| **Wiktionary dumps / viwiktionary + enwiktionary** | Mục từ, nghĩa, từ loại, ví dụ, bản dịch | Nền tảng tốt nhất để có dữ liệu mở. Nên tải dump thay vì scrape từng trang. |
| **Kaikki.org / Wiktextract** | JSON đã trích xuất từ Wiktionary | Rất tiện để ingest vào database; dữ liệu được trích xuất sẵn từ Wiktionary. |
| **Free Vietnamese Dictionary Project – Hồ Ngọc Đức / FVDP** | Việt–Việt, Anh–Việt, Việt–Anh, Pháp–Việt, Đức–Việt… | Nguồn “cổ điển” quan trọng. Cần đọc kỹ license từng bộ dữ liệu. |
| **Open Vietnamese Dictionary Project – OVDP** | StarDict / nhiều bộ song ngữ | Có các bộ Anh–Việt và nhiều ngôn ngữ khác. Thường gặp ở dạng StarDict. |
| **undertheseanlp/dictionary** | Tổng hợp từ Hồ Ngọc Đức, tudientv, Wiktionary | Có khoảng 79.000 từ; hữu ích để khởi tạo dữ liệu. Cần kiểm tra license nguồn gốc nếu tái phân phối. |
| **undertheseanlp/resources – DI_Vietnamese-UVD** | Underthesea Vietnamese Dictionary | Kho tài nguyên NLP mở, có dataset dạng dictionary. |
| **catusf/tudien** | Từ điển cho Kindle/Kobo/StarDict/Yomitan/Mdict… | Rất đáng xem vì có pipeline tạo nhiều định dạng. |
| **vntk/dictionary** | Package Node có `words`, `lower_words`, `definitions` | Dễ nhúng vào app/web; nên kiểm nguồn định nghĩa nếu tái phát hành lớn. |
| **duyet/vietnamese-wordlist** | Danh sách từ 11K, 22K, 39K, 74K | Không có định nghĩa, nhưng rất hữu ích để seed headword, spellcheck, autocomplete. |
| **hunspell-vi** | Từ điển kiểm tra chính tả tiếng Việt | Hữu ích cho spellcheck, biến thể dấu cũ/dấu mới. |

---

## 2. Wiktionary và dữ liệu trích xuất

| Nguồn | Dạng | Ghi chú |
|---|---:|---|
| **vi.wiktionary dump** | XML/SQL dump | Lấy toàn bộ Wiktionary tiếng Việt. Có định nghĩa tiếng Việt, nhưng cần parse wiki markup. |
| **en.wiktionary Vietnamese entries** | XML dump hoặc Kaikki JSON | Enwiktionary thường có cấu trúc tốt: từ loại, phát âm, từ nguyên, nghĩa tiếng Anh, ví dụ. |
| **Kaikki Vietnamese** | JSONL | Dễ ingest nhất; có raw data từ Wiktextract. |
| **Wiktextract** | Tool parse Wiktionary | Có thể tự chạy trên dump để chủ động schema, lọc tiếng Việt, lọc trường `lang=Vietnamese`. |
| **DBnary** | RDF / OntoLex | Dữ liệu Wiktionary dạng linked data, phù hợp nếu muốn dùng semantic web / RDF. |
| **Wiktionary FVDP import pages** | Nguồn gốc/giấy phép | Dùng để xác minh phần nào của FVDP đã được phép nhập vào Wiktionary/GFDL. |

---

## 3. Bộ từ điển mở/ứng dụng có dữ liệu tải được

| Nguồn | Dạng | License / chú ý |
|---|---:|---|
| **OVDP SourceForge** | StarDict zip | Có nhiều bộ song ngữ; cần kiểm GPLv2 và metadata từng file. |
| **dynamotn/stardict-vi** | StarDict | Bản mirror/đóng gói OVDP cho GoldenDict/StarDict; nên đối chiếu với nguồn gốc OVDP. |
| **catusf/tudien** | `.tab`, `.toml`, output Kindle/Kobo/StarDict/Mdict/Yomitan | Điểm mạnh là toolchain; kiểm từng submodule/từ điển con. |
| **vntk/dictionary** | npm / JS | MIT ở repo; cần kiểm nguồn định nghĩa gốc nếu dùng thương mại. |
| **tsdocode/vietnamese-dictionary trên Hugging Face** | CSV | Có thể dùng để thử nghiệm nhanh; cần kiểm license trên trang dataset. |
| **Kaggle English Vietnamese Dataset** | Bảng song ngữ | Hữu ích cho tra cứu song ngữ hoặc phrase table; cần kiểm license cụ thể trên Kaggle. |

---

## 4. Wordlist, chính tả, stopword, normalizer

| Nguồn | Dạng | Gợi ý dùng |
|---|---:|---|
| **duyet/vietnamese-wordlist** | Text wordlist | Seed headword, autocomplete, kiểm lỗi nhập liệu. |
| **hunspell-vi** | Hunspell `.dic/.aff` | Spellcheck tiếng Việt. |
| **dictionary-vi npm** | Spelling dictionary package | Tiện nếu build bằng Node. |
| **Vietnamese stopwords** | Stopword list | Hữu ích cho tìm kiếm, phân tích corpus, ranking. |
| **VietNormalizer** | Rule/dictionary chuẩn hóa | Chuẩn hóa số, ngày giờ, tiền tệ, acronym, Unicode. |
| **ViLexNorm** | Chuẩn hóa ngôn ngữ mạng xã hội | Dùng để thêm biến thể teencode/không dấu → chuẩn. |
| **ViSoLex** | Lookup từ không chuẩn / lexical normalization | Bổ sung từ viết tắt, sai chính tả, biến thể mạng xã hội. |
| **ViDia2Std** | Phương ngữ → tiếng Việt chuẩn | Bổ sung biến thể vùng miền. |

---

## 5. WordNet, đồng nghĩa, quan hệ ngữ nghĩa

| Nguồn | Dạng | Gợi ý dùng |
|---|---:|---|
| **Vietnamese WordNet – VLSP** | WordNet tiếng Việt | Có thể phải điền form/xin quyền truy cập. |
| **ELRA-M0110 Vietnamese WordNet** | Excel, 211.000 entries | Bản thương mại/học thuật; cần mua hoặc xin license. |
| **Open Multilingual Wordnet – OMW** | WordNet đa ngữ mở | Dùng để mở rộng quan hệ nghĩa, synset, multilingual mapping. |
| **Vietnamese WordNet papers** | Tài liệu/phương pháp | Dùng để học schema, quan hệ synset, cách tổ chức dữ liệu. |
| **Vietnamese SentiWordNet** | Sentiment lexicon | Dùng để thêm điểm cảm xúc/tích cực/tiêu cực cho mục từ. |
| **ViConBERT / ViConWSD** | Word sense disambiguation | Hữu ích cho phân biệt nghĩa theo ngữ cảnh. |

---

## 6. Nguồn Hán–Nôm, Hán–Việt, từ nguyên

| Nguồn | Dạng | Gợi ý dùng |
|---|---:|---|
| **Nôm Foundation – Tự Điển Chữ Nôm Dẫn Giải** | Tra cứu chữ Nôm | Nguồn quan trọng cho chữ Nôm/Hán–Nôm. |
| **Nôm Foundation – Digital Library of Hán-Nôm** | Thư viện số | Dùng làm corpus cổ, ví dụ trích dẫn, đối chiếu chữ Nôm. |
| **chunom.org** | Tra chữ Nôm | Hữu ích cho tra cứu, đối chiếu chữ Nôm. |
| **viet-yomitan** | Yomitan dictionaries | Có dữ liệu Chữ Nôm/Yomitan; nên kiểm nguồn và license. |
| **HVDic Thi Viện** | Từ điển Hán Nôm online | Rất tốt để đối chiếu; không nên scrape nếu chưa xin phép. |
| **CVDICT** | Hán–Việt/Trung–Việt | Chuyển dịch từ CC-CEDICT; hữu ích cho Trung–Việt/Hán–Việt. |
| **KanjiDictVN** | Hán tự/Kanji + âm Hán–Việt | Dùng để thêm trường chữ Hán, âm Hán–Việt. |
| **hanviet-pinyin-wordlist** | Hán–Việt theo pinyin | Hữu ích cho lookup pinyin và âm Hán–Việt. |
| **ELRA Vietnamese Etymology Dictionary** | XML, khoảng 3.100 entries | Dữ liệu từ nguyên; khả năng cần mua/xin license. |
| **SEAlang Vietnamese Lexicography** | Corpus-based dictionary | Tốt để tham khảo; không mặc định là dữ liệu mở. |

---

## 7. Corpus và dữ liệu phụ để làm từ điển chất lượng hơn

| Nguồn | Dạng | Gợi ý dùng |
|---|---:|---|
| **VLSP datasets** | Word segmentation, POS, NER, sentiment, speech… | Cần form/DUA; hữu ích cho tách từ, từ loại, ví dụ, domain labels. |
| **Underthesea News Corpus / Vietnamese Law Corpus** | Corpus tin tức, pháp luật | Dùng để lấy ví dụ thật, tần suất, collocation. |
| **PhoMT** | Cặp câu Việt–Anh | Tốt để khai thác ví dụ song ngữ, collocation, phrase translation. |
| **TALPCo** | Parallel corpus Nhật–Việt–Anh… | Bổ sung ví dụ song ngữ/đa ngữ. |
| **VnCoreNLP** | Tokenizer, POS, NER, parser | Dùng để xử lý corpus và chuẩn hóa mục từ. |
| **Concepticon Vietnamese** | Concept list | Hữu ích làm danh sách nghĩa cơ bản/semantic concepts. |
| **World Loanword Database – Vietnamese** | Meaning-word pairs | Hữu ích cho từ vay mượn, nguồn gốc, donor language. |
| **PanLex** | Lexical translation database | Dùng để mở rộng bản dịch đa ngữ; cần kiểm license/API trước khi ingest. |

---

## 8. Nguồn online tốt để đối chiếu, nhưng không nên lấy dữ liệu nếu chưa xin phép

| Nguồn | Có gì hay | Cảnh báo |
|---|---|---|
| **VDict** | Nhiều bộ: Việt–Anh, Anh–Việt, Việt–Pháp, Pháp–Việt, Việt–Việt, WordNet Anh–Anh, tục ngữ/thành ngữ. | Dùng đối chiếu thủ công; không mặc định có quyền crawl/tái bản. |
| **Soha Tra Từ** | Nhiều bộ chuyên ngành, lượng mục từ lớn. | Cần xem điều khoản/xin phép trước khi dùng làm dataset. |
| **Laban Dictionary** | Anh–Việt/Việt–Anh/Anh–Anh, dữ liệu lớn, nhiều ví dụ. | Dữ liệu có bản quyền/licensed. |
| **Cambridge English–Vietnamese** | Bản dịch, ví dụ Anh–Việt. | Chỉ dùng tham khảo; muốn dùng dữ liệu cần license. |
| **Dict Box / EV Dict / mobile apps khác** | Offline dictionary, pronunciation, nhiều bộ từ điển. | Không nên trích xuất database app nếu không có quyền. |

---

## 9. Quy trình ghép thành một bộ từ điển sạch

### Bước 1: Tạo danh sách mục từ nền

Ưu tiên ghép từ:

- FVDP / OVDP
- Wiktionary / Kaikki
- duyet/vietnamese-wordlist
- hunspell-vi
- catusf/tudien
- vntk/dictionary

### Bước 2: Chuẩn hóa mục từ

Nên tạo các trường:

```text
id
headword
headword_normalized
headword_no_tone
word_type
syllable_count
language
source
license
created_at
updated_at
```

### Bước 3: Ghép định nghĩa

Thứ tự ưu tiên:

1. Wiktionary / Kaikki
2. FVDP Việt–Việt
3. vntk/dictionary
4. catusf/tudien
5. Các nguồn khác có license phù hợp

### Bước 4: Thêm metadata ngôn ngữ học

Các trường nên có:

```text
part_of_speech
pronunciation
ipa
etymology
han_nom
han_viet
synonyms
antonyms
related_terms
examples
translations
register
region
domain
```

### Bước 5: Thêm biến thể

Nên xử lý:

- Có dấu / không dấu
- Dấu cũ / dấu mới
- Sai chính tả phổ biến
- Teencode
- Từ viết tắt
- Phương ngữ Bắc / Trung / Nam
- Từ cổ
- Từ Hán–Việt
- Từ vay mượn

### Bước 6: Tạo bảng license riêng

Không nên trộn tất cả vào một database duy nhất mà không theo dõi license. Nên có bảng riêng:

```text
source_id
source_name
source_url
license
license_url
commercial_allowed
redistribution_allowed
share_alike_required
attribution_required
notes
```

### Bước 7: Tạo bảng trace nguồn cho từng nghĩa

Một mục từ có thể lấy từ nhiều nguồn. Nên có bảng:

```text
entry_id
sense_id
source_id
source_entry_url
source_revision
confidence
imported_at
```

---

## 10. Phân loại pháp lý nên dùng

| Nhóm | Ý nghĩa | Cách dùng |
|---|---|---|
| **CC0 / Public domain-like** | Rất dễ dùng | Có thể dùng cho sản phẩm mở hoặc thương mại, vẫn nên ghi nguồn. |
| **MIT / BSD / Apache** | Dễ dùng | Phù hợp app thương mại, cần giữ notice nếu có. |
| **GPL** | Mã/dữ liệu copyleft mạnh | Cẩn thận nếu sản phẩm đóng; có thể phải mở nguồn phần phái sinh. |
| **CC-BY** | Cần ghi công | Dùng được nếu ghi attribution đúng. |
| **CC-BY-SA** | Ghi công + share-alike | Dữ liệu phái sinh có thể phải chia sẻ cùng license. |
| **Research only / DUA** | Chỉ nghiên cứu | Không dùng thương mại nếu chưa xin phép. |
| **Commercial / Permission-only** | Cần mua hoặc xin license | Chỉ dùng để đối chiếu thủ công nếu chưa có quyền. |
| **Không rõ license** | Rủi ro cao | Không ingest vào database chính. |

---

## 11. Danh sách URL tham khảo nhanh

### Wiktionary / Wiktextract / Linked data

- https://dumps.wikimedia.org/
- https://dumps.wikimedia.org/viwiktionary/latest/
- https://dumps.wikimedia.org/enwiktionary/latest/
- https://kaikki.org/dictionary/rawdata.html
- https://github.com/tatuylonen/wiktextract
- https://kaiko.getalp.org/about-dbnary/
- https://github.com/kaiko-ai/dbnary

### FVDP / OVDP / StarDict

- https://vi.wiktionary.org/wiki/Wiktionary:Ngu%E1%BB%93n_g%E1%BB%91c/FVDP
- https://sourceforge.net/projects/ovdp/
- https://github.com/dynamotn/stardict-vi

### GitHub / NLP / wordlist

- https://github.com/undertheseanlp/dictionary
- https://github.com/undertheseanlp/resources
- https://github.com/catusf/tudien
- https://github.com/vntk/dictionary
- https://github.com/duyet/vietnamese-wordlist
- https://github.com/1ec5/hunspell-vi
- https://www.npmjs.com/package/dictionary-vi
- https://github.com/stopwords/vietnamese-stopwords
- https://github.com/vncorenlp/VnCoreNLP

### Hán–Nôm / Hán–Việt

- https://nomfoundation.org/
- https://nomfoundation.org/nom-tools/Tu-Dien-Chu-Nom-Dan_Giai/Introduction
- https://nomfoundation.org/nom-project/Digital-Library-of-Han-Nom
- https://chunom.org/
- https://hvdic.thivien.net/
- https://github.com/ph0ngp/CVDICT
- https://github.com/trungnt2910/KanjiDictVN
- https://github.com/ph0ngp/hanviet-pinyin-wordlist
- https://thu-tram.github.io/viet-yomitan/

### WordNet / semantic resources

- https://vlsp.org.vn/resources
- https://catalogue.elra.info/
- https://omwn.org/
- https://aclanthology.org/2016.gwc-1.38.pdf

### Corpus / parallel data / concept lists

- https://github.com/VinAIResearch/PhoMT
- https://arxiv.org/abs/2110.12199
- https://github.com/matbahasa/TALPCo
- https://concepticon.clld.org/languages/vietnamese
- https://wold.clld.org/vocabulary/24
- https://panlex.org/

### Nguồn đối chiếu, cần xin phép nếu muốn dùng dữ liệu

- https://vdict.com/
- https://tratu.soha.vn/
- https://dict.laban.vn/
- https://dictionary.cambridge.org/dictionary/english-vietnamese/
- https://sealang.net/vietnamese/dictionary.htm

---

## 12. Khuyến nghị thực chiến

Nếu muốn làm nhanh một bản từ điển có thể dùng được, nên bắt đầu như sau:

1. **Import Kaikki/Wiktionary** để có cấu trúc nghĩa, từ loại, phát âm, ví dụ.
2. **Import FVDP/OVDP** để bổ sung lượng mục từ lớn, đặc biệt Anh–Việt và Việt–Việt.
3. **Dùng duyet wordlist + hunspell-vi** để tăng coverage mục từ và chính tả.
4. **Dùng catusf/tudien + vntk/dictionary** để tham khảo thêm format và định nghĩa.
5. **Tách rõ license theo từng source** trước khi public hoặc thương mại hóa.
6. **Sau đó mới thêm WordNet, Hán–Nôm, corpus, phương ngữ, teencode** để nâng chất lượng.

Công thức khởi đầu tốt:

```text
Base dictionary = Kaikki/Wiktionary + FVDP/OVDP + underthesea/dictionary
Headword expansion = duyet wordlist + hunspell-vi + catusf/tudien
Semantic layer = OMW / Vietnamese WordNet / Wiktionary relations
Han-Nom layer = Nôm Foundation + CVDICT + KanjiDictVN + hanviet-pinyin-wordlist
Examples = PhoMT + Underthesea corpus + VLSP/corpus licensed
Legal filter = per-source license table
```
