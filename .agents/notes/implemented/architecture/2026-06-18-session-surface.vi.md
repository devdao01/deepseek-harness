# Agent Note: Session surface — phép chiếu có thứ tự trên nhật ký sự kiện

Status: implemented

[English](2026-06-18-session-surface.md) | Tiếng Việt

## Vấn đề

Nhật ký sự kiện là nguồn dữ liệu có thẩm quyền, nhưng việc thao tác lịch sử trước đây không có cơ chế dùng chung được lưu bền. Nếu không có cơ chế như vậy, các plugin như nén ngữ cảnh (context compaction) sẽ viết lại yêu cầu dẫn xuất thông qua các listener nhạy cảm với thứ tự, mà không ghi lại mỗi lần thay thế đã dùng những sự kiện nào. Mỗi lần thêm một kiểu thao tác lịch sử mới, còn phải sửa cả `deriveMessages()`.

## Quyết định

Thêm một **surface**: phép chiếu có thứ tự, được dẫn xuất và cache lại, của các seq sự kiện (tức tập con sự kiện sinh ra thông điệp LLM), được duy trì thông qua các dấu `surfaceOp` trong nhật ký sự kiện.

### `SessionEvent` được bổ sung hai trường cấp cao nhất

Mỗi `SessionEvent` nhận thêm hai trường tùy chọn (metadata cấu trúc, ngang hàng với `seq`/`time`):

- **`sourceEventSeqs?: number[]`**: các số seq của sự kiện trước đó được tham chiếu như nguồn dữ liệu (ví dụ seq của từng `assistant/chunk` cấu thành `assistant/message`, hoặc các nút surface bị dấu nén che khuất). Giá trị `[]` xuất hiện chỉ hợp lệ trên `assistant/message`, biểu thị một luồng provider được biết là rỗng; khi định dạng cũ hoặc sự kiện bên ngoài thiếu trường này thì không có ghi nhận về việc thông điệp này sinh ra từ những sự kiện trước đó nào. Với các sự kiện surface khác, một khi trường này xuất hiện thì nó phải là danh sách không rỗng. Nếu không có các seq tham chiếu đó, quá trình phát lại sẽ không thể xác minh rằng thao tác replace-range đã liệt kê đủ mọi sự kiện mà nó gỡ bỏ.
- **`surfaceOp?: SurfaceOp`**: sự kiện này gia nhập surface như thế nào. Sự kiện không thuộc surface không mang trường này.

### SurfaceOp: hai thao tác

```ts
export type SurfaceOp =
  | 'append'                                    // normal tail append
  | { op: 'replace'; start: number; end: number }  // shadow [start, end] inclusive
```

1. **Append**: nối seq của sự kiện mới vào đuôi. `user/message`, `assistant/message`, `tool/result`, `context/message` dùng thao tác này. Agent loop truyền `surfaceOp: 'append'` trên mọi thao tác append kiểu này, và ghi `sourceEventSeqs` khi phù hợp: mỗi `assistant/message` thành công đều ghi trọn tập nguồn `assistant/chunk` (bao gồm cả `[]`), còn `tool/result` ghi nguồn `tool/call` của nó.

2. **Replace**: gỡ bỏ các mục từ `start` đến `end` (bao gồm cả hai đầu), và chèn seq của sự kiện mới vào vị trí đó. Cả `start` và `end` đều phải tồn tại trong surface hiện tại; `start === end` nghĩa là thay thế một mục duy nhất. `sourceEventSeqs` của sự kiện đó phải chứa mọi seq surface bị che khuất. Các sự kiện bị che khuất vẫn nằm trong nhật ký, nhưng không còn xuất hiện trên surface.

### SurfaceManager: dựa trên gia tăng, không phải dựng lại toàn bộ

Một `Session` sở hữu một `SurfaceManager`, và bộ quản lý này duy trì một mảng `number[]` có thứ tự gồm các seq sự kiện. Bộ quản lý sẽ kiểm tra từng ứng viên gieo mầm hoặc append trước khi commit mà không áp dụng nó, sau đó chỉ xử lý những sự kiện đã commit kể từ lần đồng bộ trước, thay vì quét lại toàn bộ nhật ký. `Session.surface` phơi bày chính bộ quản lý đó qua quy ước chỉ-đọc `SessionSurface`, nhờ vậy việc tiếp nhận, dẫn xuất lịch sử, nén và ngữ cảnh workspace dùng chung cùng một trạng thái gia tăng. Replace định vị hai điểm đầu cuối theo vị trí trong mảng (cả hai đều nằm trong phạm vi), và splice seq thay thế vào phạm vi đó; không có bộ quản lý thứ hai, đối tượng liên kết hay map từ seq sang nút nào lặp lại việc biểu diễn thứ tự.

Khi không có sự kiện mới, xử lý gia tăng là O(1); khi có sự kiện mới đến thì là O(số sự kiện mới).

`deriveMessages()` dùng surface khi có dấu surface, và quay về phép quét tuyến tính sẵn có cho các phiên không có dấu (tương thích ngược).

### Lưu bền

Các trường mới được tuần tự hóa như thuộc tính JSON cấp cao nhất. Backend JSONL không cần thay đổi gì: `JSON.stringify`/`JSON.parse` giữ nguyên mọi thứ một cách trong suốt. Bảng `events` của backend SQLite được bổ sung hai cột TEXT cho phép NULL (`source_event_seqs`, `surface_op`). `SCHEMA_VERSION` trên đĩa được tăng để phản ánh thay đổi tập cột, và theo chính sách bump-and-reject tiền phát hành, cơ sở dữ liệu do bản build khác ghi sẽ bị từ chối khi mở thay vì được di trú (không có dữ liệu người dùng lưu bền nào cần nâng cấp). `version` của định dạng phiên cố định ở `SESSION_FORMAT_VERSION = 0` (lập trường "không ổn định/tiền phát hành"): các trường surface tùy chọn được hấp thụ mà không tăng số phiên bản.

### Khôi phục sau sự cố

Module `repair.ts` tổng hợp các sự kiện đóng `tool/result` cho những lời gọi công cụ mồ côi sau sự cố. Các sự kiện đóng này mang `surfaceOp: 'append'` và `sourceEventSeqs` trỏ tới sự kiện `tool/call` mồ côi, đảm bảo surface được dựng lại là hợp lệ.

### Bất biến

`Session` kiểm tra `sourceEventSeqs` và `surfaceOp` tại ranh giới seed/append vốn luôn được bật: chỉ `assistant/message` mới được dùng danh sách sự kiện nguồn rỗng; tham chiếu phải duy nhất, sớm hơn và đã biết; các điểm đầu cuối thay thế phải tồn tại trong thứ tự surface; `sourceEventSeqs` phải phủ mọi nút bị che khuất. Đây là các quy tắc tiếp nhận từng bản ghi và chiếu lưu trữ, không phải quy tắc do một service bất biến tùy chọn cung cấp.

Mọi sự kiện có thể gia nhập surface đều phải mang `surfaceOp`, nếu không nó sẽ biến mất khỏi lịch sử dẫn xuất. Nạp chồng `append` có kiểu cưỡng chế quy tắc này với các kiểu sự kiện literal; các kiểm tra lúc chạy trong `append` và trong hàm khởi tạo gieo mầm phủ các union đã nới rộng và các nhật ký được nạp vào. Theo chính sách định dạng tiền phát hành, seed không hợp lệ bị từ chối chứ không được nâng cấp.

## Các phương án từng cân nhắc

- **Bọc `agent/request` theo từng plugin** (mô hình thao tác lịch sử trước khi có surface): thứ tự listener mong manh, không thể ghi nhận lâu dài nội dung đã thay đổi, và mỗi kiểu thao tác mới lại buộc `deriveMessages()` ở lõi phải sửa thêm lần nữa.
- **Phạm vi replace nửa mở `[start, endExclusive)`**: bị bác bỏ. Các điểm đầu cuối được đặt tên theo seq sự kiện surface, và việc thay thế một mục duy nhất (`start === end`) đọc tự nhiên hơn với ngữ nghĩa đoạn đóng.
- **Các đối tượng nút liên kết cộng với map seq**: bị bác bỏ. Mã sản xuất không đọc liên kết tiền nhiệm, công dụng duy nhất của hậu nhiệm chính là vị trí kế tiếp trong mảng, và việc thay thế vốn dĩ đã cần tra cứu `indexOf` tuyến tính. Một mảng seq duy nhất giữ nguyên độ phức tạp tiệm cận trong khi chỉ để lại một biểu diễn cần kiểm tra.
- **Dựng lại toàn bộ sau khi đánh dấu bẩn** thay cho xử lý gia tăng: là O(N²) trong suốt vòng đời phiên, mỗi lần append một sự kiện lại phải quét lại toàn bộ sự kiện trước đó.

## Hệ quả

- **`packages/core/session`**: `surface.ts` (`SurfaceManager`) duy trì một mảng seq có thứ tự dùng cho việc tiếp nhận ứng viên và chiếu thời gian thực; `SessionSurface` là khung nhìn công khai chỉ-đọc của nó. `SurfaceOp`/`SurfaceIntent` cùng các trường sự kiện phiên cấp cao nhất ghi lại cách một mục gia nhập nó. `append()` yêu cầu sự kiện surface phải mang `SurfaceIntent`, `deriveMessages()` lấy việc duyệt surface làm đường dẫn xuất duy nhất, còn `repair.ts` phát ra các sự kiện đóng có nhận biết surface. Hàm khởi tạo gieo mầm từ chối các sự kiện gieo mầm có thể gia nhập surface mà thiếu dấu `surfaceOp` (xem mục "Bất biến").
- **`packages/core/agent-loop`**: mọi thao tác append liên quan đến sự kiện surface đều truyền các tùy chọn surface. Mỗi `assistant/message` đều tham chiếu các seq mảnh đã sinh ra nó; mỗi `tool/result` đều tham chiếu seq `tool/call` của nó.
- **`packages/session/session-persistence-sqlite`**: bảng `events` được bổ sung hai cột TEXT cho phép NULL (`source_event_seqs`, `surface_op`); `SCHEMA_VERSION` được tăng (bump-and-reject, không di trú).
- **`packages/session/session-persistence-jsonl`**: không cần thay đổi.
- **`packages/session/session-persistence`**: giao diện trừu tượng không đổi.

surface là nền tảng để việc thao tác lịch sử được triển khai — cơ chế nén của dsh-compaction chạy ngay trên nó. Plugin nén hoặc tool-result-pruner sẽ append một kiểu sự kiện sinh thông điệp sẵn có (ví dụ một `user/message` mang phần tóm tắt), kèm `surfaceOp: { op: 'replace', start, end }` và `sourceEventSeqs` phủ các mục bị che khuất — sự kiện mới thế chỗ phạm vi đó trên surface, còn các sự kiện trace của chính plugin (như `compaction/start`, `compaction/end`) thì không vào surface. Việc phát lại giữ nguyên quyết định đó một cách tất định.

Một lần thay thế `tool/result` chỉ có thể viết lại đúng một `tool/result` hiện tại, và phải giữ nguyên mọi trường dữ liệu ngoài `content`. Việc tiếp nhận ở Session sẽ cưỡng chế quy tắc này cùng với việc kiểm tra phạm vi vị trí và các sự kiện nguồn được tham chiếu, không phụ thuộc vào plugin chẩn đoán tùy chọn.
