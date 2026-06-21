# Hướng dẫn review phát âm Phase 6

Tài liệu này dùng cho gói review 590 tác vụ phát âm/dialect-label sinh từ lớp AI-assisted advisory.

AI chỉ đóng vai trò gợi ý. Chỉ quyết định do người/chuyên gia xác nhận mới được đưa sang reviewed layer hoặc dùng cho projection policy.

## File đầu vào

- JSONL gốc: `data/processed/phase6/ai-review/ai-review-decisions.jsonl`
- Bảng CSV: `data/processed/phase6/ai-review/ai-review-decisions.csv`
- Workbook XLSX: `data/processed/phase6/ai-review/ai-review-decisions.xlsx`

## Cột reviewer cần điền

- `human_decision`
- `human_selected_display_ipa` nếu có đủ căn cứ để chọn IPA hiển thị
- `human_selected_dialect` nếu dialect được nguồn ghi rõ
- `human_qualifier_note` nếu source note có phần mô tả thêm không phải dialect
- `human_reviewer_id`
- `human_reviewed_at`
- `human_notes`

## Ý nghĩa quyết định

- `split_by_source_entry_or_pos`: giữ phát âm tách theo source record, cách viết của nguồn, hoặc POS; không chọn một scalar IPA.
- `insufficient_evidence`: bằng chứng chưa đủ; giữ tác vụ mở hoặc chuyển chuyên gia.
- `split_label_and_qualifier`: source note có thể gồm nhãn dialect/place và qualifier; chỉ tách sau khi reviewer xác nhận.
- `keep_all_source_attested_variants`: giữ mọi biến thể được nguồn công bố, kèm provenance.
- `select_one_display_ipa`: chỉ chọn IPA hiển thị khi bằng chứng nguồn và policy cho phép rõ ràng.
- `requires_parser_followup`: trả về tầng parser/source-record, chưa đưa ra quyết định ngôn ngữ học.
- `assign_recognized_dialect`: gán dialect từ nhãn nguồn ghi rõ.
- `not_a_dialect_label`: note/tag của nguồn không phải metadata dialect.
- `leave_dialect_null`: để dialect trống/null khi thiếu hoặc mơ hồ.

## Quy tắc bắt buộc

- Không xem AI review là human review.
- Không suy dialect từ dạng IPA, thứ tự âm, nguồn, hoặc mục từ lân cận.
- Không promote bất kỳ AI decision nào vào `pronunciation_ipa`, `dialect`, `origin`, hoặc etymology.
- Không xóa fact nguồn chỉ để giảm số conflict.
- Luôn giữ source ID, raw hash, evidence key, confidence, review status và rationale.

## Quy trình đề xuất

1. Lọc `ai_priority`, bắt đầu từ `high`.
2. Kiểm `source_evidence_key`, `source_note`, `reason_tags`, và `entry_scope_reasons`.
3. Chỉ điền `human_decision` khi bằng chứng nguồn đủ mạnh.
4. Điền reviewer ID, ngày review, và ghi chú.
5. Trả lại CSV/XLSX đã điền để import vào reviewed layer riêng.
