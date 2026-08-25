# session-query/: họ năng lực truy vấn session

[English](README.md) | Tiếng Việt

Họ gói này cung cấp khả năng truy vấn được ủy quyền cho log session thời gian thực và lâu bền, độc lập với nén (compaction).

| Gói | Trách nhiệm | Khóa ctx |
|---|---|---|
| [`session-query/`](session-query/README.md) | Định nghĩa các thao tác đọc, truy vấn quan hệ và tìm kiếm đáng tin cậy | `ctx.sessionQuery` |
| [`session-query-sqlite/`](session-query-sqlite/README.md) | Triển khai truy vấn session dùng tìm kiếm toàn văn SQLite | `ctx.sessionQuery` |
| [`session-log-export/`](session-log-export/README.md) | Thêm lệnh Web `/export`, trạng thái tải xuống trình duyệt dùng chung và cửa sổ kết quả bên trên endpoint ZIP của Host | `ctx.sessionLogDownload` |
| [`tool-session-query/`](tool-session-query/README.md) | Công khai truy vấn session được ủy quyền theo workspace cho mô hình | đăng ký vào `ctx.tools` |

Tham chiếu hệ thống con — bản ghi logic, đọc có giới hạn, truy vết, bộ lọc, trang kết quả — xem [docs/subsystems/session-query.md](../../docs/subsystems/session-query.md).
