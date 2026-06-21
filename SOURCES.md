# SOURCES.md

Generated at: 2026-06-21T06:15:57.151Z

Profile: `documented`. Collection frozen: `true`.

Các nguồn dưới đây đã qua phase gate và được chọn cho build kế tiếp. Khi collection đang frozen, danh sách có thể rỗng.

| Key | Tên nguồn | Quyền | License | Chất lượng | Ước tính | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| `vntk_dictionary` | [vntk/dictionary - Vietnamese Dictionary for Node](https://github.com/vntk/dictionary) | open | MIT | tổng hợp | Khoảng 42k mục từ Việt-Việt có định nghĩa trong data/dictionary.json. | use |
| `kaikki_viwiktionary` | [Kaikki.org raw Wiktextract data from Vietnamese Wiktionary](https://kaikki.org/viwiktionary/rawdata.html) | open | CC BY-SA 4.0 / GFDL theo Wiktionary; Kaikki xuất dữ liệu phái sinh cùng license | cộng đồng | Khoảng 30.6 MB gzip, hàng trăm nghìn dòng JSONL từ viwiktionary. | use |
| `unicode_unihan` | [Unicode Unihan Database](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip) | open | Unicode License Agreement for Data Files and Software | học thuật | Khoảng 8.1 MB zip; hơn 100k CJK codepoints tùy trường dữ liệu. | use |
| `kaikki_enwiktionary_vi` | [Kaikki.org English Wiktionary entries for Vietnamese](https://kaikki.org/dictionary/Vietnamese/) | open | CC BY-SA 4.0 / GFDL theo Wiktionary | cộng đồng | Khoảng 11.7 MB gzip, mục tiếng Việt với cấu trúc Anh ngữ phong phú. | use |
| `underthesea_dictionary` | [undertheseanlp/dictionary](https://github.com/undertheseanlp/dictionary) | open | GPL-3.0 cho repo | tổng hợp | 79,226 từ dạng word list, không có định nghĩa trong nhánh master hiện tại. | use |
| `underthesea_uvd` | [Underthesea Vietnamese Dictionary (DI_Vietnamese-UVD)](https://github.com/undertheseanlp/resources/tree/master/resources/DI_Vietnamese-UVD) | open | GPL-3.0 theo repository undertheseanlp/resources | học thuật | 31.327 headword, 13 lớp từ, định nghĩa và ví dụ có cấu trúc. | use |
| `duyet_vietnamese_wordlist` | [duyet/vietnamese-wordlist Viet74K](https://github.com/duyet/vietnamese-wordlist) | open | GPL-2.0 | tổng hợp | Khoảng 74.000 từ và cụm từ. | use |
| `hunspell_vi` | [hunspell-vi](https://github.com/1ec5/hunspell-vi) | open | GPL-3.0-or-later; thành phần gốc từ FVDP/Aspell | học thuật | Hai wordlist đơn âm theo quy tắc đặt dấu cũ/mới. | use |
| `omw_wiktionary_vi` | [Open Multilingual Wordnet - Wiktionary Vietnamese](https://github.com/omwn/omw-data/tree/main/wns/wikt) | open | CC BY-SA / GFDL theo Wiktionary | cộng đồng | Khoảng 176 KB ánh xạ lemma tiếng Việt sang Princeton WordNet synset. | use |
| `dai_nam_quoc_am_tu_vi` | [Đại Nam Quấc âm tự vị - Huỳnh Tịnh Paulus Của](https://vi.wikisource.org/wiki/Đại_Nam_Quấc_âm_tự_vị) | public-domain | Bản gốc public domain; bản chép Wikisource theo CC BY-SA 4.0/GFDL | học thuật | Hai tập, 39 trang tổng hợp Wikisource gồm mục từ và mục ghép. | use |
| `catusf_thieu_chuu_stardict` | [catusf/tudien - bản StarDict Hán Việt Thiều Chửu](https://github.com/catusf/tudien) | public-domain | Bản gốc Thiều Chửu public domain; repository công bố CC0-1.0 cho bản số hóa | học thuật | 9,897 mục theo bài giới thiệu. | use |
| `chunom_standard` | [Chunom.org - List of Standard Characters](https://chunom.org/pages/standard/) | documented-unclear | Không thấy tuyên bố license riêng; nguồn cho phép tải TSV công khai và được xếp tầng documented-unclear | học thuật | Khoảng 3.930 dòng chữ/từ ghép Nôm, gồm âm Quốc ngữ, dạng Nôm, nghĩa Anh và tần suất. | use |
| `catusf_vietviet` | [catusf/tudien - Từ điển Việt-Việt Hồ Ngọc Đức](https://github.com/catusf/tudien/tree/master/dict) | documented-unclear | Repository CC0-1.0; metadata ghi Hồ Ngọc Đức, provenance từng định nghĩa chưa đầy đủ | tổng hợp | 23.798 mục Việt-Việt dạng TAB. | use |

### vntk_dictionary

- Tên: vntk/dictionary - Vietnamese Dictionary for Node
- Link: https://github.com/vntk/dictionary
- License: MIT
- Năm/phiên bản: Git HEAD 2408c9d2c7e6908d166a773b60fd216492326d97, repository copyright 2017
- Cách trích dẫn: Vietnamese Natural Language Processing (VNTK), vntk/dictionary, MIT License.
- Ghi chú: Repo công bố MIT License. Phần provenance của chính dữ liệu không mô tả sâu; pipeline giữ nguyên attribution nguồn và không suy đoán origin.

### kaikki_viwiktionary

- Tên: Kaikki.org raw Wiktextract data from Vietnamese Wiktionary
- Link: https://kaikki.org/viwiktionary/rawdata.html
- License: CC BY-SA 4.0 / GFDL theo Wiktionary; Kaikki xuất dữ liệu phái sinh cùng license
- Năm/phiên bản: Kaikki extraction 2026-06-18 from viwiktionary dump dated 2026-05-01 (per rawdata page)
- Cách trích dẫn: Wiktionary contributors; Tatu Ylonen / Kaikki.org; Wiktextract: Wiktionary as Machine-Readable Structured Data, LREC 2022.
- Ghi chú: Pipeline lọc mục tiếng Việt và mục một chữ Hán có gloss tiếng Việt. Dữ liệu Wiktionary có thể chứa đóng góp cộng đồng nên cần giữ attribution CC BY-SA.

### unicode_unihan

- Tên: Unicode Unihan Database
- Link: https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip
- License: Unicode License Agreement for Data Files and Software
- Năm/phiên bản: UCD latest, Last-Modified 2025-08-18 observed from Unicode download endpoint
- Cách trích dẫn: The Unicode Consortium, Unicode Character Database: Unihan Database.
- Ghi chú: Chỉ dùng làm lớp metadata để bổ sung mã Unicode, bộ thủ, số nét và biến thể cho mục Hán/Nôm đã có chứng cứ Việt từ nguồn khác. Không được tự sinh mục từ Unihan.

### kaikki_enwiktionary_vi

- Tên: Kaikki.org English Wiktionary entries for Vietnamese
- Link: https://kaikki.org/dictionary/Vietnamese/
- License: CC BY-SA 4.0 / GFDL theo Wiktionary
- Năm/phiên bản: Kaikki language extract snapshot 2026-06-15
- Cách trích dẫn: English Wiktionary contributors; Tatu Ylonen / Kaikki.org; Wiktextract.
- Ghi chú: Bổ sung IPA, etymology, POS, sense và quan hệ; định nghĩa tiếng Anh được gắn language=en.

### underthesea_dictionary

- Tên: undertheseanlp/dictionary
- Link: https://github.com/undertheseanlp/dictionary
- License: GPL-3.0 cho repo
- Năm/phiên bản: Git HEAD 2c078cfc373b06e2980d324ce1d7bd13740c3319 observed 2026-06-19
- Cách trích dẫn: underthesea Vietnamese open dictionary project.
- Ghi chú: Chỉ nhập vào lớp lexeme để bổ sung bằng chứng headword; không dùng wordlist này làm định nghĩa.

### underthesea_uvd

- Tên: Underthesea Vietnamese Dictionary (DI_Vietnamese-UVD)
- Link: https://github.com/undertheseanlp/resources/tree/master/resources/DI_Vietnamese-UVD
- License: GPL-3.0 theo repository undertheseanlp/resources
- Năm/phiên bản: 1.0-alpha.1, 2020; repository snapshot hiện hành
- Cách trích dẫn: Vu Anh and Underthesea contributors, Underthesea Vietnamese Dictionary.
- Ghi chú: Nguồn cấu trúc chính cho nghĩa tiếng Việt và từ loại; có tài liệu thiết kế từ điển máy tính đi kèm.

### duyet_vietnamese_wordlist

- Tên: duyet/vietnamese-wordlist Viet74K
- Link: https://github.com/duyet/vietnamese-wordlist
- License: GPL-2.0
- Năm/phiên bản: Repository snapshot hiện hành
- Cách trích dẫn: Duyet; Ho Ngoc Duc, Vietnamese word lists.
- Ghi chú: Chỉ dùng cho lexeme coverage, spellcheck và missing-definition queue.

### hunspell_vi

- Tên: hunspell-vi
- Link: https://github.com/1ec5/hunspell-vi
- License: GPL-3.0-or-later; thành phần gốc từ FVDP/Aspell
- Năm/phiên bản: v2.2.0 và repository hiện hành
- Cách trích dẫn: Minh Nguyen, Ivan Garcia, Ho Ngoc Duc and hunspell-vi contributors.
- Ghi chú: Dùng cho lexeme đơn âm và quan hệ biến thể dấu; không coi là từ điển từ ghép.

### omw_wiktionary_vi

- Tên: Open Multilingual Wordnet - Wiktionary Vietnamese
- Link: https://github.com/omwn/omw-data/tree/main/wns/wikt
- License: CC BY-SA / GFDL theo Wiktionary
- Năm/phiên bản: OMW data repository snapshot hiện hành
- Cách trích dẫn: Open Multilingual Wordnet; Wiktionary contributors.
- Ghi chú: Dùng làm semantic candidate theo synset; không tự động khẳng định đồng nghĩa ở mọi ngữ cảnh.

### dai_nam_quoc_am_tu_vi

- Tên: Đại Nam Quấc âm tự vị - Huỳnh Tịnh Paulus Của
- Link: https://vi.wikisource.org/wiki/Đại_Nam_Quấc_âm_tự_vị
- License: Bản gốc public domain; bản chép Wikisource theo CC BY-SA 4.0/GFDL
- Năm/phiên bản: 1895-1896; bản Wikisource theo revision được ghi trong raw snapshot
- Cách trích dẫn: Huỳnh Tịnh Paulus Của, Đại Nam Quấc âm tự vị; Wikisource contributors.
- Ghi chú: Pipeline lấy HTML đã hiệu đính từ API Wikisource, lưu page id và revision id để truy nguyên.

### catusf_thieu_chuu_stardict

- Tên: catusf/tudien - bản StarDict Hán Việt Thiều Chửu
- Link: https://github.com/catusf/tudien
- License: Bản gốc Thiều Chửu public domain; repository công bố CC0-1.0 cho bản số hóa
- Năm/phiên bản: Thiều Chửu 1942; snapshot GitHub hiện hành
- Cách trích dẫn: Catus Felis conversion; Thiều Chửu, Hán Việt tự điển.
- Ghi chú: Nguồn nền cho phần Hán Việt. Mỗi mục có chữ, một hoặc nhiều âm Hán Việt và nghĩa tiếng Việt; Unihan chỉ bổ sung metadata sau bước merge.

### chunom_standard

- Tên: Chunom.org - List of Standard Characters
- Link: https://chunom.org/pages/standard/
- License: Không thấy tuyên bố license riêng; nguồn cho phép tải TSV công khai và được xếp tầng documented-unclear
- Năm/phiên bản: Snapshot tải trong fetch manifest
- Cách trích dẫn: Chunom.org, List of Standard Characters and source text corpus references.
- Ghi chú: Lựa chọn chữ dựa trên xuất hiện thực trong Truyện Kiều, Nhật dụng thường đàm, Lục Vân Tiên, Chinh phụ ngâm và thơ Hồ Xuân Hương. Có thể tắt tức thời bằng source policy.

### catusf_vietviet

- Tên: catusf/tudien - Từ điển Việt-Việt Hồ Ngọc Đức
- Link: https://github.com/catusf/tudien/tree/master/dict
- License: Repository CC0-1.0; metadata ghi Hồ Ngọc Đức, provenance từng định nghĩa chưa đầy đủ
- Năm/phiên bản: Snapshot GitHub hiện hành; metadata 23.798 mục
- Cách trích dẫn: Hồ Ngọc Đức; Catus Felis conversion repository.
- Ghi chú: Bổ sung và đối chiếu với vntk trong profile documented. Lineage từng định nghĩa chưa đầy đủ, nên nguồn được giữ tách biệt để có thể gỡ toàn bộ đóng góp bằng một lệnh nếu có khiếu nại.
