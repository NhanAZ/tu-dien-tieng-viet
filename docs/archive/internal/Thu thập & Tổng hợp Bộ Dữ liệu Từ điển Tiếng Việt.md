# PROMPT: Thu thập & Tổng hợp Bộ Dữ liệu Từ điển Tiếng Việt (kể cả Hán Việt) từ mọi nguồn mở

## 1. Vai trò

Bạn là kỹ sư dữ liệu (data engineer) cấp cao, chuyên xây dựng pipeline thu thập – chuẩn hoá – kiểm định dữ liệu ngôn ngữ học. Nhiệm vụ của bạn ở giai đoạn này **chỉ là chuẩn bị dữ liệu**, chưa cần xây giao diện web. Đầu ra là một bộ dữ liệu JSON sạch, có cấu trúc, có ghi nguồn - để dùng làm input cho một website từ điển sau này.

## 2. Mục tiêu

Thu thập và hợp nhất **bộ dữ liệu từ điển tiếng Việt lớn nhất có thể**, gồm:
- Toàn bộ từ thuần Việt và từ Hán Việt thông dụng, cổ, phương ngữ, thành ngữ, tục ngữ - gộp từ càng nhiều nguồn mở càng tốt, không giới hạn quy mô.
- Phần Hán Việt phải **đầy đủ ở mức tương đương tự điển Thiều Chửu**: toàn bộ chữ Hán có âm Hán Việt, kèm bộ thủ, số nét, nghĩa từng chữ - không chỉ các chữ thông dụng trong từ ghép hằng ngày.

Không cần quan tâm trùng lặp giữa các nguồn ở bước thu thập - việc hợp nhất/khử trùng sẽ xử lý ở bước sau.

## 3. Nguyên tắc pháp lý (bắt buộc tuân thủ nghiêm ngặt)

- Chỉ thu thập từ nguồn **public domain** hoặc có **giấy phép mở rõ ràng** (CC BY, CC BY-SA, GPL, MIT, hoặc tự điển cổ đã hết hạn bản quyền).
- Theo luật Việt Nam, tác phẩm văn học/khoa học thường được bảo hộ đến **50 năm sau khi tác giả mất**; với các tự điển cổ (ví dụ Thiều Chửu mất 1954, Đào Duy Anh mất 1988, Huỳnh Tịnh Của mất 1908...), hãy **tự kiểm tra từng trường hợp** trước khi xác định là public domain - không mặc định.
- **Tuyệt đối không** thu thập từ các bộ từ điển thương mại còn bản quyền (ví dụ Từ điển tiếng Việt – Hoàng Phê bản hiện hành, các từ điển xuất bản gần đây) trừ khi có giấy phép sử dụng rõ ràng.
- Với mỗi nguồn dùng, ghi lại: tên, link gốc, loại giấy phép, năm xuất bản/cập nhật, cách trích dẫn bắt buộc (nếu có). Nếu license không rõ ràng → loại khỏi bộ dữ liệu chính, liệt kê riêng vào danh sách "cần xác minh thêm", không dùng.

## 4. Phạm vi nguồn dữ liệu cần khảo sát

Hãy tự tìm kiếm và đánh giá (không giới hạn ở danh sách này, đây chỉ là điểm khởi đầu):

**Từ điển tiếng Việt thuần Việt / tổng hợp:**
- Dự án Free Vietnamese Dictionary Project (Hồ Ngọc Đức) - dữ liệu mở, từng dùng cho bộ gõ và kiểm chính tả tiếng Việt.
- Wiktionary tiếng Việt (qua Wikimedia dumps, giấy phép CC BY-SA) - cả mục từ tiếng Việt lẫn mục Hán Việt.
- Các tự điển cổ đã public domain: Đại Nam Quấc âm tự vị (Huỳnh Tịnh Paulus Của, 1895), Việt Nam tự điển (Hội Khai Trí Tiến Đức, 1931) - thường có bản số hoá trên các thư viện số/Internet Archive.
- Các repo dữ liệu mở trên GitHub (tìm theo từ khoá: `vietnamese-dictionary`, `tu-dien-tieng-viet`, `vietnamese-nlp-dictionary`).

**Hán Việt / Hán Nôm (ưu tiên độ đầy đủ):**
- Hán Việt tự điển - Thiều Chửu (1942): cần tìm bản số hoá đầy đủ (text/Unicode), đây là nguồn chính cho mục tiêu "đầy đủ như Thiều Chửu".
- Hán Việt từ điển - Đào Duy Anh (1932).
- Unicode Unihan Database (unicode.org) - nguồn mở, miễn phí, rất hữu ích để lấy bộ thủ (Kangxi radical), số nét, mã Unicode chuẩn cho từng chữ Hán - dùng để đối chiếu/làm giàu dữ liệu, không thay thế phần nghĩa và âm Hán Việt.
- Các trang tổng hợp Hán Nôm mở (ví dụ hvdic.thivien.net, hvdic.thaiphong.net) - kiểm tra kỹ điều khoản sử dụng/license trước khi lấy dữ liệu, vì đây là trang tổng hợp lại từ nhiều nguồn khác.

**Thành ngữ – tục ngữ – từ địa phương:** tìm các bộ dữ liệu mở chuyên biệt nếu có, hoặc trích xuất từ Wiktionary/tự điển cổ ở trên.

## 5. Schema dữ liệu đầu ra

**Mục từ tiếng Việt** (giữ nguyên schema đã thống nhất trước đó):

```json
{
  "id": "slug",
  "word": "string",
  "pronunciation_ipa": "string | null",
  "part_of_speech": ["..."],
  "origin": "thuần Việt | Hán Việt | vay mượn khác",
  "han_viet_ref": ["id chữ Hán liên quan, nếu có"],
  "definitions": [
    { "meaning": "string", "examples": ["..."], "source": "key trong SOURCES.md" }
  ],
  "synonyms": ["..."],
  "antonyms": ["..."],
  "related_words": ["..."],
  "compound_words": ["..."],
  "sources": ["key1", "key2"]
}
```

**Mục chữ Hán (đầy đủ kiểu Thiều Chửu)** - đây là phần cần mở rộng kỹ:

```json
{
  "id": "string (mã hoặc Unicode codepoint)",
  "character": "漢",
  "radical": "氵",
  "radical_stroke_count": 3,
  "total_stroke_count": 14,
  "readings_han_viet": ["Hán"],
  "meanings": [
    { "meaning": "tên một con sông; chỉ chung dải Ngân Hà; chỉ người/nước Hán...", "source": "key trong SOURCES.md" }
  ],
  "compound_examples": ["Hán Việt", "Hán tự", "Hán học"],
  "variant_forms": ["..."],
  "sources": ["key1", "key2"]
}
```

Tạo JSON Schema chính thức cho cả hai loại mục từ trong `data/schema/`, dùng để validate ở bước cuối.

## 6. Quy trình xử lý (pipeline)

**Bước 1 - Khảo sát nguồn:** Tạo file `reports/current/SOURCES_CANDIDATES.md` liệt kê mọi nguồn tìm được: tên, link, loại giấy phép, ước tính số lượng mục, đánh giá độ tin cậy, trạng thái (✅ dùng được / ⚠️ cần xác minh / ❌ loại bỏ vì bản quyền).

**Bước 2 - Thu thập dữ liệu thô:** Viết script tải/crawl từng nguồn, lưu nguyên bản vào `data/raw/<ten-nguon>/`. Với nguồn không tải tự động được (yêu cầu đăng nhập, chặn bot, chỉ có bản scan ảnh...), ghi rõ trong báo cáo để người dùng tự bổ sung thủ công sau.

**Bước 3 - Parse & chuẩn hoá:** Viết script chuyển từng nguồn thô sang đúng schema ở mục 5. Chuẩn hoá Unicode về dạng NFC, thống nhất cách viết hoa/thường, dấu câu.

**Bước 4 - Hợp nhất (merge):** Khi nhiều nguồn có cùng một từ/chữ Hán, gộp lại thành một mục duy nhất, giữ nhiều nghĩa từ nhiều nguồn (mỗi nghĩa ghi rõ nguồn riêng), loại bỏ định nghĩa trùng lặp gần như y hệt.

**Bước 5 - Validate:** Kiểm tra toàn bộ dữ liệu theo JSON Schema; báo lỗi rõ ràng nếu có mục không hợp lệ; build phải dừng nếu dữ liệu sai cấu trúc.

**Bước 6 - Thống kê & báo cáo:** Sinh báo cáo `reports/current/COVERAGE_REPORT.md` gồm: tổng số mục từ tiếng Việt, tổng số chữ Hán thu thập được, % phủ trên tổng 214 bộ thủ Khang Hi (để kiểm chứng mục tiêu "đầy đủ như Thiều Chửu"), số lượng theo từng nguồn, danh sách từ/chữ trùng đã hợp nhất.

**Bước 7 - Xuất dữ liệu cuối:** Lưu vào `data/processed/words/` (chia theo chữ cái đầu) và `data/processed/han-viet/` (chia theo bộ thủ), sẵn sàng để một project web khác đọc vào trực tiếp.

## 7. Yêu cầu kỹ thuật

- Dùng Node.js + TypeScript cho toàn bộ script (để tái sử dụng dễ dàng khi build website sau này).
- Mỗi script trong `scripts/` phải chạy độc lập, có thể chạy lại nhiều lần mà không gây lỗi trùng dữ liệu (idempotent).
- Log rõ ràng tiến trình (số mục đã xử lý, lỗi gặp phải).
- Toàn bộ pipeline phải chạy được bằng vài lệnh đơn giản, mô tả trong README (ví dụ: `npm run fetch`, `npm run normalize`, `npm run merge`, `npm run validate`, `npm run report`).

## 8. Giới hạn thực tế cần lưu ý

Nếu trong quá trình chạy, bạn (AI agent) không có quyền truy cập mạng để tải toàn bộ dữ liệu thật từ các nguồn trên:
- Vẫn phải viết **hoàn chỉnh toàn bộ pipeline/script** sẵn sàng chạy khi có mạng đầy đủ.
- Cố gắng thu thập thực tế tối đa những gì truy cập được trong giới hạn hiện có.
- Với phần không tải được, **không được tự bịa dữ liệu** - hãy để trống, ghi chú rõ trong `reports/current/COVERAGE_REPORT.md` nguồn nào chưa lấy được và hướng dẫn cách bổ sung thủ công.

## 9. Yêu cầu bàn giao (deliverables)

- Toàn bộ source code pipeline (`scripts/`, `data/schema/`) - chạy lại được, dễ mở rộng thêm nguồn mới sau này.
- Bộ dữ liệu đã chuẩn hoá trong `data/processed/` - lớn nhất có thể thu thập được trong phạm vi truy cập thực tế.
- `SOURCES.md` đầy đủ: nguồn, license, cách trích dẫn.
- `reports/current/COVERAGE_REPORT.md`: số liệu thống kê độ phủ.
- `README.md`: hướng dẫn chạy lại toàn bộ pipeline và cách thêm nguồn dữ liệu mới.

Đây là output sẽ được dùng làm input trực tiếp cho project website từ điển ở bước tiếp theo - vì vậy cấu trúc thư mục `data/` và schema phải khớp để không cần chuyển đổi lại.
