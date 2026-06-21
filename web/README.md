# Web từ điển tiếng Việt

Ứng dụng tra cứu chạy bằng Vinext/React, đọc dữ liệu đã xử lý từ thư mục
`../data/processed` và sinh API tĩnh vào `public/api`.

## Lệnh chính

```powershell
npm.cmd install
npm.cmd run data:build
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
```

`npm.cmd run dev` tự chạy `data:build` trước khi mở server local. Sau khi dữ
liệu gốc thay đổi, chạy lại `npm.cmd run data:build` hoặc khởi động lại dev
server để cập nhật API tĩnh.

## Dữ liệu web sinh ra

- `public/api/search-index.json`: chỉ mục gọn cho tra không dấu, snippet nghĩa và các cờ lọc.
- `public/api/words/*.json`: chi tiết mục từ theo bucket chữ cái.
- `public/api/han-index.json`: chỉ mục Hán-Việt/bộ thủ.
- `public/api/han-viet/*.json`: chi tiết Hán-Việt theo bộ thủ.
- `public/api/nom-index.json`: dữ liệu Nôm.
- `public/api/stats.json`: thống kê build, profile, release SHA và coverage.

## Trạng thái hiện tại

- Dataset: `0.4.0-beta`, profile `documented`.
- Build ID dữ liệu: `984181246dc11941`.
- Website đã kiểm tra với `npm.cmd run lint` và `npm.cmd run build`.
