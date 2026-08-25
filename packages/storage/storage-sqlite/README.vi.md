# @deepseek-ai/dsh-storage-sqlite

[English](README.md) | Tiếng Việt

Backend SQLite của [trung tâm lưu trữ](../storage/README.md): đăng ký dưới tên backend `sqlite`, cung cấp facet `kv` thông qua một cơ sở dữ liệu duy nhất; cơ sở dữ liệu đó do `node:sqlite` thao tác, có thể là một tệp đơn hoặc `:memory:`. Thiết kế và các đánh đổi xem [Agent Note về lưu trữ KV theo domain](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.zh.md).

## Mô hình lưu trữ

Mỗi hàng là một document: mỗi bảng của một unit sẽ trở thành một bảng STRICT vật lý `"u_<unit>_<table>" (key TEXT PRIMARY KEY, value TEXT)`, trong đó `value` là văn bản JSON của bản ghi, nên một key chỉ cập nhật một hàng (đây là lý do các domain thay đổi với tần suất cao được định tuyến về đây thay vì backend JSON). Định danh unit nằm trong hai bảng metadata: `units` đánh dấu phiên bản định dạng của unit khi unit được mở lần đầu, và từ chối với `version-mismatch` khi descriptor khác biệt; `unit_globals` lưu hàng singleton toàn cục của từng unit. Phiên bản bố cục vật lý nằm ở `PRAGMA user_version`; mọi giá trị đánh dấu khác đều bị từ chối (định dạng chưa phát hành, không migrate). Tên unit và tên bảng được kiểm tra theo `UNIT_NAME_RE` của trung tâm trước khi đi vào DDL, nên không có đầu vào bên ngoài nào bị nội suy vào định danh SQL.

Mỗi nguyên thủy ghi là một câu lệnh đã được chuẩn bị trước: tính nguyên tử theo từng câu lệnh của SQLite đủ để thỏa mãn giao ước KV mà không cần transaction tường minh, còn thứ tự ghi vẫn do bên gọi chịu trách nhiệm (chuỗi ghi ở tầng domain). Thư mục và tệp cơ sở dữ liệu còn thiếu sẽ được tạo với quyền chỉ chủ sở hữu truy cập được (`0o700`／`0o600`), nhất quán với backend SQLite của phần lưu trữ phiên.

## Cấu hình (schemastery)

```ts
interface Config {
  path: string   // SQLite database file path, or ':memory:' for an in-process DB
  journalMode?: 'wal' | 'delete' | 'truncate' | 'persist'   // journal_mode pragma; default 'wal'
}
```

## Trải nghiệm mô hình

### Bản ghi domain đã lưu

#### Những gì mô hình nhìn thấy

Không có. Backend này không đóng góp prompt, tool hay schema; nó lưu trữ bền vững dữ liệu domain phi-phiên (bản ghi workspace, metadata đồng hành của phiên trong tương lai) phía sau `ctx.storage`, và chỉ dành cho bên tiêu thụ ở phía host.

#### Ảnh hưởng tới Token

Không tốn token nào cho request thời gian thực.

#### Ảnh hưởng tới KV Cache

Không có: backend này không bao giờ chạm vào tiền tố của request thời gian thực.

## Giới hạn đã biết và phần tạm hoãn

- **`DatabaseSync` là đồng bộ**: mỗi lần ghi đều chặn event loop trong lúc thực thi một câu lệnh; ở quy mô dữ liệu domain thì điều này chấp nhận được.
- **Không có chiến lược chờ bận hay thử lại**: khi một kết nối khác đang giữ transaction ghi, thao tác sẽ bị từ chối ngay lập tức; không có bảo vệ cho ghi đa tiến trình.
- **Chỉ mở `STORAGE_SQLITE_SCHEMA_VERSION` hiện tại**: mọi phiên bản đã đánh dấu khác đều bị từ chối thay vì migrate (lập trường tiền phát hành).
- **`openDatabase` lặp lại trình tự mở của SQLite phần lưu trữ phiên**: việc tách ra một tầng phương tiện dùng chung được hoãn tới đợt migrate backend phiên đã lên kế hoạch (xem phần rà soát tái sử dụng trong Agent Note).
