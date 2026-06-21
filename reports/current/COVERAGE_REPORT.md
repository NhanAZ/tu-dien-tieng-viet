# Báo cáo độ phủ dữ liệu từ điển tiếng Việt

Ngày tạo: 13:23:33 21/6/2026  
Build: `984181246dc11941` · Phiên bản: `0.4.0-beta` · Profile: `documented`

## Tổng quan đúng ngữ nghĩa

- **89.569 mục từ tiếng Việt có định nghĩa**, với 283.629 định nghĩa có provenance.
- **26.581 lexeme chỉ có bằng chứng chính tả**, được giữ ngoài từ điển lõi vì chưa có định nghĩa.
- **11.936 chữ Hán có bằng chứng Hán-Việt**, trong đó Unihan chỉ bổ sung metadata cho mục đã tồn tại.
- **2.390 ánh xạ chữ Nôm** trong lớp riêng, không cộng vào số mục từ tiếng Việt hay Hán-Việt.
- **3.627 synset ứng viên**, 70 nhóm biến thể dấu và 173.093 ví dụ nguồn từ các mục từ điển.
- **226.374 canonical sense clusters draft** trong `data/processed/senses/`, validation PASS.

## Độ phủ mục từ tiếng Việt

| Chỉ tiêu | Số mục | Tỷ lệ trên 89.569 headword |
| --- | ---: | ---: |
| Có ít nhất một định nghĩa tiếng Việt | 82.446 | 92,05% |
| Có ít nhất một định nghĩa tiếng Anh | 29.377 | 32,8% |
| Có IPA | 48.348 | 53,98% |
| Có từ loại | 58.514 | 65,33% |
| Có từ nguyên từ nguồn | 24.727 | 27,61% |
| Có nhãn usage/register/domain/period | 70.389 | 78,59% |
| Có từ hai nguồn trở lên | 45.916 | 51,26% |


## Canonical sense draft

| Chỉ tiêu | Giá trị |
| --- | ---: |
| Trạng thái | MACHINE_FIRST_DRAFT |
| Validation | PASS |
| Definition đầu vào | 283.629 |
| Canonical sense clusters | 226.374 |
| Auto accepted definitions | 84.712 |
| Machine clustered definitions | 15.546 |
| Machine retained definitions | 52.144 |
| Needs review definitions | 59.355 |
| Quarantined definitions | 0 |
| Entity/encyclopedic definitions | 14.423 |
| Reference non-Vi definitions | 57.449 |
| Near-duplicate pair chưa merge | 11.144 |

Lớp này nằm ở `data/processed/senses/`. Đây là canonical draft do máy xử lý, không phải human-reviewed release.


### Headword theo nguồn đóng góp

| Nguồn | Headword |
| --- | ---: |
| `catusf_vietviet` | 29.183 |
| `dai_nam_quoc_am_tu_vi` | 42.958 |
| `kaikki_enwiktionary_vi` | 29.377 |
| `kaikki_viwiktionary` | 39.936 |
| `underthesea_uvd` | 31.102 |
| `vntk_dictionary` | 31.108 |

### Định nghĩa theo nguồn

| Nguồn | Định nghĩa |
| --- | ---: |
| `catusf_vietviet` | 40.074 |
| `dai_nam_quoc_am_tu_vi` | 48.151 |
| `kaikki_enwiktionary_vi` | 57.460 |
| `kaikki_viwiktionary` | 54.576 |
| `underthesea_uvd` | 41.681 |
| `vntk_dictionary` | 41.687 |

## Hán-Việt và chữ Nôm được tách lớp

| Chỉ tiêu | Kết quả |
| --- | ---: |
| Chữ Hán có ít nhất một nghĩa | 11.936 |
| Chữ Hán có ít nhất một âm Hán-Việt | 11.057 |
| Chữ Hán được Unihan bổ sung metadata | 11.936 |
| Mục chỉ có Unihan, không có bằng chứng Việt | **0** |
| Bộ thủ Khang Hi có đại diện | 214/214 |
| Chữ Hán ngoài BMP | 1.425 |
| Mục Nôm có định nghĩa/gloss | 2.385 |
| Mục Nôm có tần suất nguồn | 1.406 |
| Mục Nôm chứa code point ngoài BMP | 656 |

Coverage 214/214 bộ thủ chỉ mô tả phân bố của tập chữ, **không phải bằng chứng rằng từ điển đã đầy đủ**.

## Dung lượng artifact

| Tầng | Dung lượng |
| --- | ---: |
| Raw snapshot | 93,73 MB |
| Normalized theo nguồn | 321,46 MB |
| Processed | 361,43 MB |

## Giới hạn cần đọc cùng số liệu

- 26.581 lexeme chưa có nghĩa không được tính là mục từ điển lõi.
- 57.460 định nghĩa tiếng Anh được giữ nguyên ngôn ngữ; pipeline không dịch máy để giả tăng coverage tiếng Việt.
- Synset OMW là ứng viên ngữ nghĩa theo lemma/POS, chưa phải ánh xạ sense đã duyệt.
- Ví dụ hiện có đến từ nguồn từ điển. Corpus ngoài độc lập chưa được nhập vì chưa đạt đồng thời cổng quyền sử dụng và relevance theo sense.
- Lớp Nôm của profile `documented` dùng nguồn `chunom_standard` có quyền tái phân phối chưa rõ hoàn toàn; có thể gỡ bằng source policy.
- Website brief đang PENDING; schema chưa được chốt là website-ready.
