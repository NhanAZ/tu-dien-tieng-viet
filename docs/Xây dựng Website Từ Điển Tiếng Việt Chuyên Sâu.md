# PROMPT: Xây dựng Website Từ Điển Tiếng Việt Chuyên Sâu (có Hán Việt)

## 1. Vai trò

Bạn là kỹ sư phần mềm full-stack cấp cao, mạnh về frontend hiện đại, thiết kế UI tối giản và xử lý dữ liệu có cấu trúc. Hãy xây dựng **từ đầu đến cuối một project thật, chạy được**, không phải bản demo rời rạc hay mô tả ý tưởng suông.

## 2. Bối cảnh & phạm vi sản phẩm

Đây là từ điển **tiếng Việt thuần túy (Việt–Việt)**, bao gồm cả lớp từ Hán Việt (giải nghĩa chữ Hán gốc, âm Hán Việt, bộ thủ).

**KHÔNG bao gồm**: Anh–Việt, Việt–Anh, Anh–Anh, hay bất kỳ cặp ngôn ngữ nào khác. Không cần dark mode. Không quảng cáo, không yếu tố "app giải trí/gamification".

Đối tượng dùng: giáo viên lớn tuổi, học sinh – sinh viên, người yêu ngôn ngữ, người nghiên cứu. Vì vậy giao diện phải **đơn giản, dễ đọc, dễ thao tác** hơn là "đẹp nhưng rối".

Vấn đề cần giải quyết: các từ điển tiếng Việt online hiện nay thường lan man nhiều ngôn ngữ, giao diện cũ kỹ, trải nghiệm kém. Sản phẩm này phải nghiêm túc, đáng tin cậy như một công cụ tham khảo học thuật thật sự.

## 3. Phong cách thiết kế (bắt buộc)

- Tham chiếu phong cách: Apple, Google, GitHub, Notion — sạch, tối giản, nhiều khoảng trắng, bố cục rõ ràng, ít màu mè (1 màu nhấn duy nhất là đủ).
- Giao diện sáng (light) làm mặc định và duy nhất, không cần toggle dark mode.
- Typography là yếu tố chính tạo cảm giác chuyên nghiệp: dùng font sans-serif hỗ trợ tốt tiếng Việt có dấu (ví dụ Inter, Be Vietnam Pro, hoặc Noto Sans). Với phần chữ Hán, dùng thêm font CJK phù hợp (ví dụ Noto Serif SC/TC) làm fallback để chữ Hán hiển thị đúng nét, không vỡ font.
- Cỡ chữ cơ bản đủ lớn, dễ đọc cho người lớn tuổi; cho phép người dùng tăng/giảm cỡ chữ.
- Responsive đầy đủ: mobile, tablet, desktop. Tốc độ tải nhanh, hạn chế JS không cần thiết.

## 4. Ngăn xếp công nghệ đề xuất (mặc định, có thể điều chỉnh nếu có lý do hợp lý)

- **Static Site Generator**: Astro + TypeScript (phù hợp với hàng nghìn trang tĩnh, tải nhanh, ít JS mặc định, dễ deploy GitHub Pages).
- **CSS**: Tailwind CSS, dùng design token nhất quán (màu, spacing, typography scale).
- **Tìm kiếm phía client**: build sẵn search index tĩnh (JSON) lúc build bằng MiniSearch hoặc FlexSearch — hỗ trợ tìm gần đúng, tìm không dấu, autocomplete, không cần server.
- **Hosting**: GitHub Pages.
- **CI/CD**: GitHub Actions, tự động build & deploy khi push vào nhánh `main`.
- **"API"**: vì là static hosting, expose dữ liệu dưới dạng JSON tĩnh tại các đường dẫn ổn định (ví dụ `/api/words/<slug>.json`, `/api/index.json`), kèm tài liệu mô tả cấu trúc để bên thứ ba có thể dùng lại.

## 5. Schema dữ liệu (bắt buộc tuân theo, có thể bổ sung thêm field nếu cần)

```json
{
  "id": "string (slug, vd: \"hanh-phuc\")",
  "word": "hạnh phúc",
  "pronunciation_ipa": "string | null",
  "part_of_speech": ["danh từ", "tính từ"],
  "origin": "thuần Việt | Hán Việt | vay mượn khác",
  "han_viet": {
    "characters": [
      { "char": "幸", "meaning": "may mắn", "radical": "干", "stroke_count": 8 },
      { "char": "福", "meaning": "phúc, điều tốt lành", "radical": "示", "stroke_count": 13 }
    ]
  },
  "definitions": [
    {
      "meaning": "Trạng thái sung sướng vì cảm thấy hoàn toàn đạt được ý nguyện.",
      "examples": ["Gia đình hạnh phúc."],
      "source": "key tham chiếu tới SOURCES.md"
    }
  ],
  "synonyms": ["sung sướng", "vui sướng"],
  "antonyms": ["bất hạnh", "đau khổ"],
  "related_words": ["hạnh phúc gia đình", "bất hạnh"],
  "compound_words": ["hạnh phúc luận"],
  "sources": ["nguồn-1", "nguồn-2"]
}
```

Yêu cầu xử lý dữ liệu:
- Dữ liệu thô lưu trong `data/raw/<nguồn>/`, có file mô tả license & cách thu thập.
- Dữ liệu đã chuẩn hoá theo schema trên lưu trong `data/processed/`, chia nhỏ theo chữ cái đầu để tránh file quá lớn.
- Có JSON Schema chính thức trong `data/schema/` để validate dữ liệu khi build (build phải fail nếu dữ liệu sai schema).
- Viết script import/transform (`scripts/import-*.ts`) tách riêng theo từng nguồn, dễ chạy lại và mở rộng.
- Vì agent có thể không truy cập được toàn bộ internet, hãy tạo sẵn **bộ dữ liệu mẫu (seed data)** khoảng 300–500 mục từ (gồm cả từ thuần Việt và Hán Việt) nhập thủ công/biên soạn hợp lý, đủ để demo trọn vẹn mọi tính năng ngay lập tức. Pipeline phải dễ mở rộng lên hàng chục nghìn từ sau này.
- Mỗi nguồn dữ liệu dùng phải được ghi rõ trong `SOURCES.md`: tên nguồn, license, link, cách trích dẫn, tuân thủ điều khoản license đó (đặc biệt nếu dùng nguồn dạng CC BY-SA thì phải ghi công và giữ license tương tự).

## 6. Tính năng cần xây dựng đầy đủ

**Tìm kiếm**
- Ô tìm kiếm trung tâm ở trang chủ, có autocomplete/gợi ý khi gõ.
- Tìm chính xác và tìm gần đúng (không phân biệt dấu thanh, viết không dấu vẫn ra kết quả).
- Tìm kiếm trong nội dung định nghĩa (tìm theo nghĩa, không chỉ theo từ).
- Tìm riêng theo chữ Hán hoặc âm Hán Việt.

**Trang chi tiết một từ**
- Hiển thị đầy đủ: từ loại, các nghĩa, ví dụ minh hoạ.
- Nếu là từ Hán Việt: hiển thị từng chữ Hán gốc, nghĩa từng chữ, bộ thủ, số nét.
- Từ đồng nghĩa, trái nghĩa, từ liên quan, từ ghép — có liên kết để bấm xem tiếp.
- Ghi rõ nguồn tham khảo cho từng mục nghĩa.
- Nút sao chép link, chia sẻ, đọc to bằng Web Speech API (nếu khả thi).

**Duyệt từ điển**
- Mục lục duyệt theo bảng chữ cái A–Z.
- Duyệt theo bộ thủ chữ Hán (cho phần Hán Việt), giống cách tra tự điển Hán Việt truyền thống.
- "Từ của ngày" / từ ngẫu nhiên ở trang chủ.

**Cá nhân hoá (không cần backend, dùng localStorage)**
- Lưu từ yêu thích.
- Lịch sử tra cứu gần đây.
- Tuỳ chỉnh cỡ chữ.

**Khả năng truy cập & hiệu năng**
- Tương phản tốt, điều hướng được bằng bàn phím, hỗ trợ ARIA cho trình đọc màn hình.
- Lighthouse score > 90 ở mọi mục (Performance, Accessibility, Best Practices, SEO).

**SEO**
- Mỗi từ có URL tĩnh riêng (vd `/tu/hanh-phuc`), đầy đủ meta tag, Open Graph, sitemap.xml tự sinh khi build.

## 7. Cấu trúc thư mục đề xuất

```
project/
├── data/
│   ├── raw/                  # dữ liệu thô theo từng nguồn + ghi chú license
│   ├── processed/            # JSON đã chuẩn hoá theo schema, chia theo chữ cái
│   └── schema/                # JSON Schema validate dữ liệu
├── scripts/
│   ├── import-*.ts
│   ├── build-search-index.ts
│   └── validate-data.ts
├── src/
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   └── styles/
├── public/
├── .github/workflows/deploy.yml
├── astro.config.mjs
├── package.json
├── README.md
└── SOURCES.md
```

## 8. CI/CD

- GitHub Actions workflow: cài dependency → validate dữ liệu theo schema → build search index → build site tĩnh → deploy lên GitHub Pages khi push vào `main`.
- Nếu có thể, thêm workflow riêng kiểm tra chất lượng dữ liệu (JSON lint, phát hiện trùng entry).

## 9. Yêu cầu chất lượng code

- TypeScript toàn bộ, chia component rõ ràng, có comment ở phần logic quan trọng (đặc biệt build search index và validate dữ liệu).
- README chi tiết: cài đặt, chạy local (`npm install && npm run dev`), build, deploy, và **hướng dẫn cách thêm từ mới vào từ điển** (vì dữ liệu sẽ mở rộng lâu dài).
- Có unit test tối thiểu cho phần xử lý dữ liệu và search.
- Không dùng thư viện nặng không cần thiết.

## 10. Yêu cầu bàn giao (deliverables)

- Project hoàn chỉnh, chạy được ngay với `npm install && npm run dev`.
- Giao diện đã hoàn thiện đúng phong cách yêu cầu ở mục 3 — không phải khung sườn trống.
- Bộ dữ liệu mẫu (300–500 từ) đủ để demo trọn vẹn mọi tính năng.
- `README.md` và `SOURCES.md` đầy đủ.
- GitHub Actions workflow deploy thành công lên GitHub Pages (hoặc hướng dẫn rõ ràng để tự bật Pages cho repo).
- Nếu có điểm chưa rõ trong yêu cầu, hãy tự quyết định theo tiêu chí "đơn giản – chuyên nghiệp – dễ bảo trì", ghi chú lại giả định trong README, và **tiếp tục xây dựng ngay** thay vì dừng lại hỏi thêm.
# Xây dựng Website Từ Điển Tiếng Việt Chuyên Sâu

> WEBSITE_BRIEF_STATUS: IMPLEMENTED_DRAFT
>
> File này là brief vận hành cho bản web đầu tiên trong `web/`. Bản hiện tại đã được triển khai bằng Vinext/React, sinh API tĩnh từ `data/processed`, build/lint pass ngày 21/06/2026 và vẫn có thể được review tiếp trước khi chốt schema website 1.0.

## Mục Đích

Tài liệu này phải mô tả sản phẩm website từ điển sẽ tiêu thụ dữ liệu trong `data/processed/`. Nội dung ở đây có thể ảnh hưởng đến schema, index, phân tầng dữ liệu, API contract, search UX, licensing display, source attribution và cách tách lớp Việt/Hán-Việt/Nôm.

## Checklist Cần Điền

- [ ] Đối tượng người dùng chính: học sinh/sinh viên, nhà nghiên cứu, dịch giả, người học tiếng Việt, người học Hán Nôm, hay công chúng phổ thông.
- [ ] Màn hình tra cứu chính cần hiển thị những lớp nào: từ Việt, nghĩa, ví dụ, IPA, từ loại, Hán-Việt, Nôm, biến thể, nguồn, etymology, semantic links.
- [ ] Cách phân biệt "mục từ phổ thông", "tên riêng", "địa danh", "thuật ngữ chuyên ngành", "cổ/ngữ lịch sử", "phương ngữ", "lexeme chưa có nghĩa".
- [ ] Yêu cầu search: bỏ dấu, giữ dấu, fuzzy, autocomplete, reverse lookup, Han/Nom lookup, radical/stroke lookup, full-text definition search.
- [ ] Yêu cầu filter/facet: nguồn, thời kỳ, miền, từ loại, domain, độ tin cậy, open-only/documented.
- [ ] Yêu cầu attribution hiển thị cho từng nghĩa và từng nguồn.
- [ ] Cách xử lý nguồn `documented-unclear` trên website public.
- [ ] Có cần API public không; nếu có, endpoint và contract mong muốn.
- [ ] Có cần offline bundle/mobile/PWA không.
- [ ] Có cần editorial workflow để duyệt 500 QA sample, sense merge, missing definitions không.
- [ ] Có cần bảng quan hệ sense-level, synonym/antonym theo nghĩa, hay chỉ hiển thị candidate.
- [ ] Có cần phân trang/chunk tối ưu cho client-side static web không.
- [ ] Có cần search index riêng như MiniSearch/Lunr/SQLite/Meilisearch/Typesense/Elastic không.
- [ ] Có cần ảnh scan, trích dẫn học thuật, bibliographic citation, hay chỉ dữ liệu JSON.
- [ ] Tiêu chuẩn phát hành: open-only mặc định hay documented research có cảnh báo.

## Schema Impact Notes

Cho đến khi checklist trên được điền, dataset hiện tại chỉ được coi là:

- hợp lệ cho data engineering và nghiên cứu;
- chưa được chốt là schema 1.0;
- chưa được chốt là đầu vào tối ưu cho website;
- cần review lại các lớp `words`, `lexemes`, `han-viet`, `nom`, `semantics`, `evidence`, `variants` trước khi xây UI/API.

## Quy Tắc Cho AI/Agent

- Không tự bịa yêu cầu website để lấp file này.
- Không đổi schema lớn chỉ dựa trên brief này nếu chưa có schema compatibility review.
- Khi nâng lên website schema 1.0, phải chạy lại schema compatibility review trước khi đổi dữ liệu processed.
- Nếu brief thật yêu cầu dữ liệu khác với schema hiện tại, lập migration plan thay vì sửa dữ liệu processed thủ công.
