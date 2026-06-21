# SOURCES_CANDIDATES.md

Generated at: 2026-06-21T06:15:57.151Z

Danh sách khảo sát nguồn. Trạng thái `candidate` không đồng nghĩa với đã được phép ingest; nguồn phải qua dossier và phase gate trong roadmap.

| Key | Tên nguồn | Quyền | License | Chất lượng | Ước tính | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| `vntk_dictionary` | [vntk/dictionary - Vietnamese Dictionary for Node](https://github.com/vntk/dictionary) | open | MIT | tổng hợp | Khoảng 42k mục từ Việt-Việt có định nghĩa trong data/dictionary.json. | use |
| `kaikki_viwiktionary` | [Kaikki.org raw Wiktextract data from Vietnamese Wiktionary](https://kaikki.org/viwiktionary/rawdata.html) | open | CC BY-SA 4.0 / GFDL theo Wiktionary; Kaikki xuất dữ liệu phái sinh cùng license | cộng đồng | Khoảng 30.6 MB gzip, hàng trăm nghìn dòng JSONL từ viwiktionary. | use |
| `unicode_unihan` | [Unicode Unihan Database](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip) | open | Unicode License Agreement for Data Files and Software | học thuật | Khoảng 8.1 MB zip; hơn 100k CJK codepoints tùy trường dữ liệu. | use |
| `kaikki_enwiktionary_vi` | [Kaikki.org English Wiktionary entries for Vietnamese](https://kaikki.org/dictionary/Vietnamese/) | open | CC BY-SA 4.0 / GFDL theo Wiktionary | cộng đồng | Khoảng 11.7 MB gzip, mục tiếng Việt với cấu trúc Anh ngữ phong phú. | use |
| `fvdp_hongocduc` | [Free Vietnamese Dictionary Project (Hồ Ngọc Đức)](https://vi.wiktionary.org/wiki/Wiktionary:Nguồn_gốc/FVDP) | chưa phân loại | GNU GPL v2 or later theo thông tin 00-database-info được Wiktionary lưu lại | cao | Việt-Việt khoảng 30k mục; Anh-Việt hơn 109k mục; Việt-Anh hơn 23k mục. | manual |
| `underthesea_dictionary` | [undertheseanlp/dictionary](https://github.com/undertheseanlp/dictionary) | open | GPL-3.0 cho repo | tổng hợp | 79,226 từ dạng word list, không có định nghĩa trong nhánh master hiện tại. | use |
| `underthesea_uvd` | [Underthesea Vietnamese Dictionary (DI_Vietnamese-UVD)](https://github.com/undertheseanlp/resources/tree/master/resources/DI_Vietnamese-UVD) | open | GPL-3.0 theo repository undertheseanlp/resources | học thuật | 31.327 headword, 13 lớp từ, định nghĩa và ví dụ có cấu trúc. | use |
| `duyet_vietnamese_wordlist` | [duyet/vietnamese-wordlist Viet74K](https://github.com/duyet/vietnamese-wordlist) | open | GPL-2.0 | tổng hợp | Khoảng 74.000 từ và cụm từ. | use |
| `hunspell_vi` | [hunspell-vi](https://github.com/1ec5/hunspell-vi) | open | GPL-3.0-or-later; thành phần gốc từ FVDP/Aspell | học thuật | Hai wordlist đơn âm theo quy tắc đặt dấu cũ/mới. | use |
| `omw_wiktionary_vi` | [Open Multilingual Wordnet - Wiktionary Vietnamese](https://github.com/omwn/omw-data/tree/main/wns/wikt) | open | CC BY-SA / GFDL theo Wiktionary | cộng đồng | Khoảng 176 KB ánh xạ lemma tiếng Việt sang Princeton WordNet synset. | use |
| `dynamotn_stardict_vi` | [dynamotn/stardict-vi / OVDP StarDict dictionaries](https://github.com/dynamotn/stardict-vi) | chưa phân loại | Repo không có LICENSE; SourceForge OVDP ghi GPLv2 | cần kiểm tra | Nhiều từ điển song ngữ StarDict. | candidate |
| `thieu_chuu_1942` | [Hán Việt tự điển - Thiều Chửu](https://books.google.com/books/about/H%C3%A1n_Vi%E1%BB%87t_t%E1%BB%B1_%C4%91i%E1%BB%83n.html?id=-t3o0AEACAAJ) | chưa phân loại | Bản gốc có khả năng public domain theo năm mất 1954 và mốc 50 năm sau khi tác giả mất; digitization/OCR cần kiểm tra riêng | cần kiểm tra | Khoảng hơn 9k-10k chữ Hán tùy bản số hóa. | manual |
| `dao_duy_anh_1932` | [Hán Việt từ điển - Đào Duy Anh](https://search.worldcat.org/title/Han-Viet-tu-dien/oclc/12293059) | chưa phân loại | Không dùng: tác giả mất 1988, chưa hết hạn theo mốc 50 năm sau khi mất tại Việt Nam tính đến 2026 | không dùng | Chưa dùng. | rejected |
| `dai_nam_quoc_am_tu_vi` | [Đại Nam Quấc âm tự vị - Huỳnh Tịnh Paulus Của](https://vi.wikisource.org/wiki/Đại_Nam_Quấc_âm_tự_vị) | public-domain | Bản gốc public domain; bản chép Wikisource theo CC BY-SA 4.0/GFDL | học thuật | Hai tập, 39 trang tổng hợp Wikisource gồm mục từ và mục ghép. | use |
| `khai_tri_tien_duc_1931` | [Việt Nam tự điển - Hội Khai Trí Tiến Đức](https://archive.org/search?query=%22Vi%E1%BB%87t%20Nam%20t%E1%BB%B1%20%C4%91i%E1%BB%83n%22%20%22Khai%20Tr%C3%AD%22) | chưa phân loại | Cần xác minh public domain và điều khoản bản số hóa | cần kiểm tra | Scan/OCR tùy bản. | manual |
| `hanviet_pinyin_wordlist` | [ph0ngp/hanviet-pinyin-wordlist](https://github.com/ph0ngp/hanviet-pinyin-wordlist) | chưa phân loại | MIT cho repo/dataset do tác giả công bố | cần kiểm tra | CSV chữ Hán - âm Hán Việt - pinyin. | candidate |
| `kanjidict_vn` | [trungnt2910/KanjiDictVN](https://github.com/trungnt2910/KanjiDictVN) | chưa phân loại | MIT cho mã nguồn; README ghi cách đọc/nghĩa tiếng Việt thuộc bản quyền hvdic.thivien.net 2001-2025 | không dùng | 10,350 mục Hán tự. | rejected |
| `cvdict` | [ph0ngp/CVDICT](https://github.com/ph0ngp/CVDICT) | chưa phân loại | CC BY-SA 4.0 | trung bình | Hơn 122,000 từ và cụm từ tiếng Trung với nghĩa tiếng Việt. | candidate |
| `catusf_thieu_chuu_stardict` | [catusf/tudien - bản StarDict Hán Việt Thiều Chửu](https://github.com/catusf/tudien) | public-domain | Bản gốc Thiều Chửu public domain; repository công bố CC0-1.0 cho bản số hóa | học thuật | 9,897 mục theo bài giới thiệu. | use |
| `chunom_standard` | [Chunom.org - List of Standard Characters](https://chunom.org/pages/standard/) | documented-unclear | Không thấy tuyên bố license riêng; nguồn cho phép tải TSV công khai và được xếp tầng documented-unclear | học thuật | Khoảng 3.930 dòng chữ/từ ghép Nôm, gồm âm Quốc ngữ, dạng Nôm, nghĩa Anh và tần suất. | use |
| `catusf_vietviet` | [catusf/tudien - Từ điển Việt-Việt Hồ Ngọc Đức](https://github.com/catusf/tudien/tree/master/dict) | documented-unclear | Repository CC0-1.0; metadata ghi Hồ Ngọc Đức, provenance từng định nghĩa chưa đầy đủ | tổng hợp | 23.798 mục Việt-Việt dạng TAB. | use |
| `hvdic_websites` | [Các website tổng hợp Hán Nôm/Hán Việt như hvdic.*](https://hvdic.thivien.net/) | chưa phân loại | Điều khoản sử dụng/license chưa đủ rõ cho crawl hàng loạt | không dùng | Lớn nhưng không rõ license. | rejected |

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

### fvdp_hongocduc

- Tên: Free Vietnamese Dictionary Project (Hồ Ngọc Đức)
- Link: https://vi.wiktionary.org/wiki/Wiktionary:Nguồn_gốc/FVDP
- License: GNU GPL v2 or later theo thông tin 00-database-info được Wiktionary lưu lại
- Năm/phiên bản: 1997-2004
- Cách trích dẫn: Ho Ngoc Duc and Free Vietnamese Dictionary Project contributors.
- Ghi chú: License có vẻ rõ, nhưng pipeline hiện chưa có URL raw chính thức ổn định cho bản Việt-Việt; dùng gián tiếp qua Wiktionary nếu xuất hiện trong dump.

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

### dynamotn_stardict_vi

- Tên: dynamotn/stardict-vi / OVDP StarDict dictionaries
- Link: https://github.com/dynamotn/stardict-vi
- License: Repo không có LICENSE; SourceForge OVDP ghi GPLv2
- Năm/phiên bản: Git HEAD 0f0b46997db2305ccd0cb9e161f25ac73988b0a9 observed 2026-06-19
- Cách trích dẫn: Open Vietnamese Dictionary Project / StarDict conversion contributors.
- Ghi chú: Cần xác minh license cho từng bộ .dict/.idx và parser StarDict trước khi đưa vào dữ liệu chính.

### thieu_chuu_1942

- Tên: Hán Việt tự điển - Thiều Chửu
- Link: https://books.google.com/books/about/H%C3%A1n_Vi%E1%BB%87t_t%E1%BB%B1_%C4%91i%E1%BB%83n.html?id=-t3o0AEACAAJ
- License: Bản gốc có khả năng public domain theo năm mất 1954 và mốc 50 năm sau khi tác giả mất; digitization/OCR cần kiểm tra riêng
- Năm/phiên bản: Ấn bản gốc 1942
- Cách trích dẫn: Thiều Chửu, Hán Việt tự điển, 1942.
- Ghi chú: Không crawl từ các website tổng hợp khi chưa rõ điều khoản. Ưu tiên dùng bản số hóa có license rõ hoặc bản người dùng bổ sung thủ công.

### dao_duy_anh_1932

- Tên: Hán Việt từ điển - Đào Duy Anh
- Link: https://search.worldcat.org/title/Han-Viet-tu-dien/oclc/12293059
- License: Không dùng: tác giả mất 1988, chưa hết hạn theo mốc 50 năm sau khi mất tại Việt Nam tính đến 2026
- Năm/phiên bản: 1932
- Cách trích dẫn: Đào Duy Anh, Hán Việt từ điển, 1932.
- Ghi chú: Loại khỏi dữ liệu chính cho đến khi có căn cứ pháp lý khác.

### dai_nam_quoc_am_tu_vi

- Tên: Đại Nam Quấc âm tự vị - Huỳnh Tịnh Paulus Của
- Link: https://vi.wikisource.org/wiki/Đại_Nam_Quấc_âm_tự_vị
- License: Bản gốc public domain; bản chép Wikisource theo CC BY-SA 4.0/GFDL
- Năm/phiên bản: 1895-1896; bản Wikisource theo revision được ghi trong raw snapshot
- Cách trích dẫn: Huỳnh Tịnh Paulus Của, Đại Nam Quấc âm tự vị; Wikisource contributors.
- Ghi chú: Pipeline lấy HTML đã hiệu đính từ API Wikisource, lưu page id và revision id để truy nguyên.

### khai_tri_tien_duc_1931

- Tên: Việt Nam tự điển - Hội Khai Trí Tiến Đức
- Link: https://archive.org/search?query=%22Vi%E1%BB%87t%20Nam%20t%E1%BB%B1%20%C4%91i%E1%BB%83n%22%20%22Khai%20Tr%C3%AD%22
- License: Cần xác minh public domain và điều khoản bản số hóa
- Năm/phiên bản: 1931
- Cách trích dẫn: Hội Khai Trí Tiến Đức, Việt Nam tự điển, 1931.
- Ghi chú: Chưa dùng trong pipeline tự động.

### hanviet_pinyin_wordlist

- Tên: ph0ngp/hanviet-pinyin-wordlist
- Link: https://github.com/ph0ngp/hanviet-pinyin-wordlist
- License: MIT cho repo/dataset do tác giả công bố
- Năm/phiên bản: 2024
- Cách trích dẫn: Phong Phan, hanviet-pinyin-wordlist.
- Ghi chú: README cho biết dữ liệu được tham khảo từ nhiều nguồn, gồm cả từ điển Trần Văn Chánh 1999 và Nguyễn Quốc Hùng 1975; cần thẩm định quyền tái cấp phép dữ liệu trước khi nhập.

### kanjidict_vn

- Tên: trungnt2910/KanjiDictVN
- Link: https://github.com/trungnt2910/KanjiDictVN
- License: MIT cho mã nguồn; README ghi cách đọc/nghĩa tiếng Việt thuộc bản quyền hvdic.thivien.net 2001-2025
- Năm/phiên bản: Release mới nhất quan sát 2025-12-25
- Cách trích dẫn: Nguyễn Thành Trung, KanjiDictVN.
- Ghi chú: Không đưa phần dữ liệu tiếng Việt vào processed vì README xác nhận quyền sở hữu của hvdic.thivien.net.

### cvdict

- Tên: ph0ngp/CVDICT
- Link: https://github.com/ph0ngp/CVDICT
- License: CC BY-SA 4.0
- Năm/phiên bản: Repo hiện hành, khảo sát 2026-06-19
- Cách trích dẫn: Phong Phan, CVDICT; derived from CC-CEDICT.
- Ghi chú: Nguồn mở và có ích cho cụm từ Trung-Việt, nhưng phần lớn nghĩa được dịch bằng AI và dữ liệu không khớp trực tiếp schema mục từ tiếng Việt/chữ Hán hiện tại.

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

### hvdic_websites

- Tên: Các website tổng hợp Hán Nôm/Hán Việt như hvdic.*
- Link: https://hvdic.thivien.net/
- License: Điều khoản sử dụng/license chưa đủ rõ cho crawl hàng loạt
- Năm/phiên bản: Website hiện hành
- Cách trích dẫn: Không áp dụng.
- Ghi chú: Không crawl để tránh vi phạm điều khoản hoặc bản quyền dữ liệu tổng hợp.
