# Academic Phase 6 Audit 0.4.0

Ngày sinh: 2026-06-21T06:27:35.404Z

Trạng thái: **NOT_READY_FOR_PHASE6_RELEASE**

| Hạng mục | Coverage / số lượng | Provenance |
| --- | ---: | --- |
| Headword có IPA | 48.348 (53.98%) | scalar compatibility |
| Pronunciation facts | 323.020 | projection 48348/48348 |
| Headword có nhiều IPA nguồn | 48.159 | formatting=0, source=43.301, source-entry=4.270, unresolved=588 |
| AI-assisted review tasks | 590 | requires human=590, promotion=0 |
| Headword có từ nguyên | 24.727 (27.61%) | PASS |
| Etymology facts | 31.733 | invalid=0 |
| Origin khác không rõ | 12.712 | scalar compatibility |
| Origin facts | 16.223 | projection 12712/12712 |
| Nhóm biến thể | 70 | invalid=0 |
| Form trong nhóm biến thể | 140 | 142 traces |

## Kết luận

Không ingest thêm IPA hoặc origin vào scalar trực tiếp. Lớp fact draft đã có projection tương thích cho scalar hiện tại; dialect metadata đã được khôi phục khi raw source có tag hoặc note địa danh rõ ràng. Các phần tử âm thanh khác nhau trong cùng source entry được giữ như source-attested alternatives, còn 2.097 pronunciation facts chưa có dialect và review queue qua nhiều entry/form vẫn mở nên chưa sẵn sàng release Pha 6. AI-assisted review đã đưa ra khuyến nghị bảo thủ cho 590 task, nhưng không thay thế human/expert review và không cho phép promote scalar. Etymology facts và variant traces hiện có provenance hợp lệ nhưng coverage còn hẹp.

Artifact máy đọc: `data/audit/academic/phase6-summary.json`.
