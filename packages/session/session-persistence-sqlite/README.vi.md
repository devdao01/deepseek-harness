# @deepseek-ai/dsh-session-persistence-sqlite

[English](README.md) | Tiếng Việt

Backend lưu trữ session lâu bền dạng SQLite: nhà cung cấp `SessionPersistence` thứ hai (xem [lưu trữ session lâu bền](../../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md)), tuân theo cùng quy ước với `dsh-session-persistence-jsonl` (chỉ nối thêm, seq liên tục, thực thể hóa trễ, đóng lượt bị gián đoạn khi load), nhưng biểu diễn bằng dòng `node:sqlite` thay vì byte tệp.

`locate(meta)` trả về `undefined`: tất cả session dùng chung một cơ sở dữ liệu, nên không tồn tại đường dẫn transcript (bản ghi văn bản) thực, độc lập theo từng session.

## Mô hình lưu trữ

Mỗi `SessionEvent` ánh xạ 1:1 vào một dòng trong bảng `events` gồm `(session_id, seq, type, time, data, source_event_seqs, surface_op)`; `data` là payload sự kiện dạng văn bản JSON, do đó cấu trúc dòng chính là sự kiện gốc (bao gồm cả `assistant/chunk`, giữ `seq` liên tục). Hai cột `TEXT` `source_event_seqs` và `surface_op` có thể null, lưu các trường metadata giao diện tùy chọn của sự kiện (xem [giao diện session](../../../.agents/notes/implemented/architecture/2026-06-18-session-surface.md)). Metadata ngoài log (`SessionHeader`), id incarnation theo từng lần thực thể hóa, và revision đơn điệu theo từng log nằm trong dòng `sessions`; `createdAt` là số nguyên an toàn không âm lưu trong cột `INTEGER` strict. Dòng trạng thái đơn lẻ mang id lưu trữ bất biến. Dòng `sessions` chỉ được ghi bởi lần `append` đầu tiên, và sự tồn tại của nó là tín hiệu thực thể hóa trễ (`list` báo cáo chính xác các session có dòng).

Phạm vi Node mà repository hỗ trợ có thể dùng `node:sqlite` mà không cần flag. Cơ sở dữ liệu bật khóa ngoại, và dùng journal mode đã cấu hình (mặc định `wal`; dùng rollback mode khi tệp bộ nhớ dùng chung WAL không áp dụng được). `PRAGMA application_id` xác định cơ sở dữ liệu lưu trữ chuẩn, `PRAGMA user_version` lưu phiên bản bố cục. Cơ sở dữ liệu mới phải không có application identity hoặc đối tượng schema do người dùng định nghĩa; việc khởi tạo tạo toàn bộ bảng trong một transaction và đóng dấu cả hai pragma. Cơ sở dữ liệu không phiên bản không pristine, application identity ngoài, và mọi phiên bản không phải hiện tại đều bị từ chối trước khi thay đổi journal-mode, vì định dạng chưa phát hành này không có migration.

Trên hệ thống tệp có mode POSIX, backend yêu cầu mode `0700` cho thư mục còn thiếu, và tạo độc quyền cơ sở dữ liệu còn thiếu với mode `0600` trước khi SQLite mở; umask của tiến trình có thể giới hạn thêm cả hai. WAL mới, bộ nhớ dùng chung và sidecar rollback-journal lâu bền nhận mode chỉ-chủ-sở-hữu cuối cùng của cơ sở dữ liệu. Thư mục, tệp cơ sở dữ liệu và sidecar hiện có giữ nguyên mode gốc; lỗi thiết lập hệ thống tệp ngoài trường hợp cơ sở dữ liệu đã tồn tại sẽ khiến khởi tạo thất bại. Các giá trị mặc định này ngăn việc lộ thông tin ngoài ý muốn do umask tiến trình lỏng lẻo, nhưng không bảo vệ tính bảo mật hay toàn vẹn của cơ sở dữ liệu khi principal khác có thể thay thế mục cơ sở dữ liệu trong thư mục cha.

## Ngữ nghĩa quy ước trên dòng

- **Append = transaction.** `append` chạy `BEGIN`/`COMMIT` quanh batch: nó thực thể hóa dòng `sessions` (nếu chưa được thực thể hóa), và INSERT từng sự kiện, trước tiên khẳng định quy ước seq liên tục (seq của sự kiện đầu tiên phải bằng next-seq đã lưu). Lỗi trong batch (vi phạm UNIQUE trên seq trùng lặp) sẽ rollback hoàn toàn, giữ log đã lưu và con trỏ trong bộ nhớ nhất quán. (`load()` đã cân bằng log đã lưu, nên `append` không cần sửa đuôi bị gián đoạn do sự cố.)
- **Thực thể hóa trễ.** `create()` chỉ ghi ý định trong bộ nhớ, không ghi dòng nào trước lần `append` đầu tiên. Session đã tạo nhưng chưa từng append không có dòng `sessions`, nên không xuất hiện trong `list()` (báo cáo chính xác các session có dòng).
- **Đóng lượt bị gián đoạn khi load.** Triển khai `load()` tuân theo [quy ước phục hồi sau sự cố dùng chung](../../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md): giữ lại lượt bị gián đoạn hợp lệ, nối thêm sự kiện đóng tổng hợp trong một transaction, và chỉ loại bỏ các dòng đuôi bị rách. Session không thể tải nếu có lỗi phân tích đã commit hoặc thiếu khoảng trong chuỗi. Việc phục hồi thay đổi các dòng đã lưu, nên lần append tiếp theo bắt đầu từ log cân bằng và con trỏ chính xác.
- **Kiểm tra không sửa đổi.** `inspect()` trả về view logic bất biến, cân bằng, và có thể tổng hợp closer khôi phục trong bộ nhớ, nhưng không xóa dòng đuôi bị rách, không nối thêm dòng khôi phục hay thay đổi revision nhẹ.
- **Revision nhẹ.** `listSnapshots(signal?)` kết hợp danh tính bất biến của lưu trữ và tệp cơ sở dữ liệu, id incarnation theo từng lần thực thể hóa, và bộ đếm theo từng session tăng dần trong mỗi transaction thay đổi. Việc đọc tiền tố hoàn chỉnh nắm bắt revision đó và các dòng sự kiện của nó trong cùng một read transaction, còn `readStoredRevision()` chỉ truy vấn dòng session để xác nhận preparation đã giữ lại. Nó giữ ổn định quan sát không đổi mà không cần parse dòng sự kiện, và phân biệt lưu trữ độc lập với log cùng id được tái tạo. Nó kiểm tra hủy trước và sau các truy vấn metadata sẵn sàng dùng chung và đồng bộ; bản thân truy vấn không thể bị ngắt trước hạn.

## Cấu hình (schemastery)

```ts
interface Config {
  path: string   // SQLite database file path, or ':memory:' for an in-process DB
  journalMode?: 'wal' | 'delete' | 'truncate' | 'persist'   // journal_mode pragma; default 'wal'
  preparedSessionCacheSize?: number   // positive integer; default 5
  writeBatchMaxDelayMs?: number   // positive integer; default 200; maximum 2_147_483_647
}
```

## Đường ghi

Giống backend JSONL, plugin sao chép mỗi `session/event` đã đóng băng vào controller của session đang hoạt động tương ứng, mỗi session đang hoạt động có một controller riêng. Sự kiện đang chờ đầu tiên mở cửa sổ batch cố định đã cấu hình, sự kiện sau đó tham gia nhưng không reset deadline. Khi cửa sổ hết hạn, một transaction được khởi động; sự kiện được nhận trong quá trình ghi đó tạo thành một batch tiếp theo độc lập, có giới hạn. `session/flush` hủy chờ và giải phóng batch hiện tại lẫn đang chờ. Controller lưu bền vững một lần seed fork, và giữ con trỏ ghi, đảm bảo thao tác khôi phục không bao giờ append lại sự kiện đã lưu; nó cũng thiết lập trạng thái ban đầu cho session đang hoạt động khi apply, vì HMR (thay thế module nóng) không replay `session/created`. Dispose (giải phóng tài nguyên) giải phóng từng controller được giữ lại trước khi đóng cơ sở dữ liệu. Mỗi sự kiện vẫn chiếm một dòng SQLite riêng; batch chỉ gộp nhiều INSERT hơn vào cùng một transaction và cùng một lần tăng revision.

## Trải nghiệm mô hình

### Lịch sử hội thoại đã khôi phục

#### Mô hình thấy gì

Lưu trữ SQLite không cung cấp prompt hay schema cho request hiện tại. Việc tải khôi phục lịch sử hiển thị giống hệt JSONL, và giữ lại header trước đó để tái tạo; loop mới cấu thành envelope hiện tại. Việc khôi phục cân bằng bằng `TOOL_NOT_STARTED` cho các request assistant không có lệnh gọi đã lưu; lệnh gọi đã lưu nhưng không có kết quả sẽ trở thành `TOOL_OUTCOME_UNKNOWN`, yêu cầu mô hình chỉ thử lại công việc chỉ đọc hoặc idempotent, và xác minh tác dụng phụ có thể có hoặc hỏi người dùng. Metadata dòng và phân đoạn thô không trở thành tin nhắn.

#### Ảnh hưởng Token

Lưu trữ SQLite không làm tăng lượng token dùng cho request hiện tại. Việc khôi phục khôi phục lịch sử đã giữ lại và tạo ra chi phí token từ envelope hiện tại cũng như văn bản kết quả sửa chữa được đính kèm dưới dạng tham chiếu vào mỗi lệnh gọi bị gián đoạn.

#### Ảnh hưởng KV Cache

Lưu trữ SQLite không sửa đổi tiền tố request hiện tại. Chỉ khi lịch sử tái tạo, envelope hiện tại và tuyến mô hình khớp nhau thì loop khôi phục mới tái sử dụng được cache của nhà cung cấp; kết quả sửa chữa sau sự cố sẽ được nối thêm vào cuối.

## Hạn chế đã biết và công việc hoãn lại

- **`DatabaseSync` là đồng bộ**: mỗi transaction append chặn event loop trong suốt thời gian thực hiện; chấp nhận được với lưu trữ local, nhưng là giới hạn thông lượng đối với server đa session bận rộn.
- **Không có chiến lược chờ hoặc thử lại khi tranh chấp ghi**: backend không đặt busy timeout, cũng không thử lại lỗi locked-database, nên thao tác bị từ chối ngay khi kết nối khác đang giữ write transaction.
- **Chỉ mở được cơ sở dữ liệu pristine mới hoặc `SCHEMA_VERSION` hiện tại thuộc sở hữu riêng**: đối tượng schema không phiên bản, application identity ngoài, và mọi phiên bản schema khác đều bị từ chối, chứ không migration (phần mềm chưa phát hành, không có dữ liệu người dùng lâu bền cần giữ lại).
- **Không xóa session đã lưu**: dòng tích lũy cho đến khi bị loại bỏ từ bên ngoài (seam không có giao diện xóa; `ON DELETE CASCADE` đã được cấu hình cho việc dọn dẹp ngoài băng thông này).
- **TODO:** backend này gọi trực tiếp `node:sqlite`. Nếu áp dụng Cordis database service (`cordis/db` / plugin driver SQL `@cordisjs`), nên chuyển sang định tuyến qua service đó thay vì giữ trực tiếp `DatabaseSync` ở đây; giao diện quy ước (`SessionPersistence`) sẽ không đổi, chỉ thay driver lưu trữ.
