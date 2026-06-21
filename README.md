# Từ điển tiếng Việt

Kho dữ liệu và website tra cứu cho bộ từ điển tiếng Việt có dẫn nguồn. Dữ liệu
được thu thập, chuẩn hóa, hợp nhất, kiểm định provenance và đóng gói theo các
lớp riêng: mục từ tiếng Việt, lexeme chưa có định nghĩa, Hán-Việt, Nôm, ví dụ,
ứng viên nghĩa, phát âm và nguồn gốc.

## Trạng thái

- Phiên bản dữ liệu: `0.4.0-beta`
- Profile phát hành: `documented`
- Build ID: `984181246dc11941`
- Nguồn đang chọn: 13
- Website: đã có bản Vinext/React trong `web/`

## Thống kê chính

- 89.569 mục từ tiếng Việt.
- 82.446 mục từ có định nghĩa tiếng Việt.
- 283.629 định nghĩa có provenance, gồm 226.169 nghĩa tiếng Việt.
- 26.581 lexeme chỉ có bằng chứng chính tả, không tính vào từ điển lõi.
- 11.936 chữ Hán trong lớp Hán-Việt.
- 2.390 mục Nôm trong lớp riêng.
- 3.627 synset ứng viên, 70 nhóm biến thể chính tả và 173.093 ví dụ.
- 323.020 pronunciation facts và 16.223 origin facts.
- 590 dòng Phase 6 đã được nhập lớp review AI theo ủy quyền của chủ dự án.

Unihan chỉ là lớp enrichment; số dòng Unihan không được cộng vào số mục từ
tiếng Việt, Hán-Việt hoặc Nôm.

## Phát hành dữ liệu

Gói dữ liệu chính không được commit trực tiếp vào Git vì lớn hơn ngưỡng vận hành
an toàn của GitHub. Bản phát hành được đưa lên GitHub Release:

- File: `tu-dien-tieng-viet-0.4.0-beta-documented.tar.gz`
- Dung lượng: 124.185.454 bytes
- SHA-256: `21f95fc8347d183a7a51591ecddd894eed6a566b5c4b09c1ced3a70d0a41f42d`
- Manifest local: `data/releases/0.4.0-beta/documented/archive-manifest.json`

Archive gồm `data/processed`, `data/schema`, `SOURCES.md` và
`reports/current`.

## Cài đặt

Yêu cầu Node.js 20 trở lên cho pipeline dữ liệu. Trên Windows PowerShell, dùng
`npm.cmd` nếu `npm.ps1` bị execution policy chặn.

```powershell
npm.cmd install
npm.cmd run typecheck
```

## Pipeline dữ liệu

Các lệnh chính:

```powershell
npm.cmd run pipeline
npm.cmd run pipeline:refresh
npm.cmd run release:snapshot
```

`pipeline` rebuild từ raw snapshot hiện có. `pipeline:refresh` có thể tải lại
nguồn khi chủ dự án chủ động mở refresh. Các thư mục dữ liệu lớn
`data/raw`, `data/normalized`, `data/processed` và `data/audit` được bỏ khỏi Git;
dùng release archive để phục hồi chúng khi cần.

## Website

Ứng dụng web nằm trong `web/`.

```powershell
cd web
npm.cmd install
npm.cmd run data:build
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
```

`data:build` đọc `../data/processed` và sinh API tĩnh vào `web/public/api`.
Nếu clone repo mới từ GitHub, hãy tải release archive, giải nén để có
`data/processed`, rồi chạy lại `npm.cmd run data:build`.

## Cấu trúc repo

- `scripts/`: pipeline TypeScript, validation, QA, report và release snapshot.
- `data/schema/`: JSON Schema chính thức.
- `data/releases/`: manifest, checksum và metadata của các bản phát hành.
- `docs/`: tài liệu nguồn, brief website và hướng dẫn review còn đang dùng.
- `docs/archive/internal/`: tài liệu nội bộ, TODO và kế hoạch cũ đã gom lại.
- `reports/current/`: data card, coverage, quality và source candidates.
- `reports/`: báo cáo học thuật 0.4.0 sinh từ pipeline.
- `web/`: ứng dụng tra cứu.

## Tài liệu cần đọc

- `SOURCES.md`
- `reports/current/DATA_CARD.md`
- `reports/current/COVERAGE_REPORT.md`
- `reports/current/QUALITY_REPORT.md`
- `docs/SOURCE_DOSSIERS.md`
- `web/README.md`

## Giới hạn

Bộ dữ liệu đã qua các cổng tự động và có lớp review AI theo ủy quyền của chủ dự
án. Khi dùng cho công bố học thuật hoặc sản phẩm có rủi ro cao, vẫn nên đọc
`reports/current/DATA_CARD.md` và `reports/current/QUALITY_REPORT.md` để nắm
phạm vi nguồn, giấy phép, provenance và các giới hạn còn lại.
