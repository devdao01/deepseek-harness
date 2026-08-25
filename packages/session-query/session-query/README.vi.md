# @deepseek-ai/dsh-session-query

[English](README.md) | Tiếng Việt

`SessionQueryEngine` là quy ước `ctx.sessionQuery` trừu tượng, mang tính tổ hợp. Nó hiện thực việc truy hồi chính xác lịch sử phiên, truy vết quan hệ và lọc không phụ thuộc nhà cung cấp trên `ctx.sessions` trực tiếp và `ctx.sessionPersistence` tùy chọn được gắn động; backend cụ thể hiện thực hai phương thức toàn văn của nó. Một id khớp chỉ sinh ra một bản ghi: sự kiện trực tiếp được ưu tiên, còn `live` và `persisted` báo cáo tính sẵn có của cả hai nguồn. Nếu header bất biến xung đột, nó thất bại với `SESSION_QUERY_SOURCE_CONFLICT`.

## Đọc

- `listSessions(signal?)` đọc metadata lưu trữ hiện tại, hợp nhất chúng theo cách ưu tiên bản ghi trực tiếp, và trả về các bản ghi đã sao chép theo thứ tự tất định mới-nhất-trước.
- `readSession(sessionId)` trả về một nhật ký thô đầy đủ, tách rời khỏi kho lưu trữ, sau khi thực hiện đúng phần xác thực phát lại cốt lõi như khi khôi phục; nó không bao giờ đưa phiên đó vào kho lưu trữ trực tiếp.
- `filterSessions(filters, signal?)` áp dụng các vị từ metadata phiên và tính sẵn có không phụ thuộc nhà cung cấp lên cùng kho ngữ liệu logic đã sao chép.
- `filterEvents(sessionId, filters)` trích xuất tài liệu ngữ nghĩa first-party và áp dụng các vị từ metadata cùng vị từ văn bản theo nghĩa đen, không phụ thuộc nhà cung cấp, theo thứ tự seq tăng dần.
- `readTitleSnapshots(sessionIds, signal?)` giải quyết các id duy nhất từ một lần quan sát kho ngữ liệu ưu tiên nguồn trực tiếp, chuyển tín hiệu hủy tới truy vấn liệt kê và kiểm tra lưu trữ, và trả về kết quả đã kết toán cho từng phiên theo thứ tự, để một nguồn tiêu đề bị thiếu hoặc sai định dạng không làm mất kết quả của các phiên khác. Mỗi nguồn trực tiếp được fold trực tiếp, còn mỗi worker lưu trữ fold thành kết quả header/tiêu đề tách rời khỏi kho lưu trữ, và giải phóng nhật ký đầy đủ trước khi lấy id kế tiếp ra khỏi hàng đợi. Việc hủy sẽ từ chối toàn bộ lô. `readTitleSnapshot(sessionId, signal?)` là góc nhìn một lần quan sát; `readTitle(sessionId, signal?)` chỉ trả về `session/title` đã fold, ở dạng tùy chọn, của nó.
- `listEvents(sessionId)` nạp nhật ký thô ưu tiên nguồn trực tiếp, phân loại từng sự kiện thành `current`, `shadowed` hoặc `log-only`; phép phân loại này dùng fold tầng bề mặt dùng chung của `dsh-session`.
- `readSurface(sessionId)` trả về một header đã sao chép, các biên bắt giữ nhật ký thô, và toàn bộ tầng bề mặt hiện tại sau khi fold, sắp xếp theo thứ tự lịch sử của mô hình. Phiên trực tiếp được ưu tiên hơn phiên lưu trữ; nén (compaction) chỉ được quan sát trước hoặc sau phần ghi thêm thay thế của nó, không bao giờ xuất hiện dạng trộn lẫn tổng hợp.
- `readEvent(request, signal?)` trả về một header đã sao chép, sự kiện đích đầy đủ và một cửa sổ seq thô có giới hạn. `before` và `after` mặc định bằng 0, và không được vượt quá `readWindowMax`.
- `traceSession(sessionId, signal?)` chỉ đọc kho ngữ liệu một lần, trả về tổ tiên tính từ cha trực tiếp trở ra, cùng cây hậu duệ đệ quy tất định. `complete: false` đánh dấu cha đầu tiên bị thiếu; chu trình nối với mục tiêu sẽ thất bại với `SESSION_QUERY_INVALID_LINEAGE`.
- `traceEvent(request, signal?)` chỉ nạp nhật ký logic một lần, trả về header nguồn đã sao chép của nó, các thay thế vị trí trực tiếp và liên kết sự kiện nguồn được tham chiếu trực tiếp. `replacementChain` truy vết theo các bên thay thế vị trí đến bản thay thế cuối cùng; liên kết sự kiện nguồn vẫn không mang tính bắc cầu.

Lưu trữ là tùy chọn và có thể gắn hoặc gỡ động. Khi lưu trữ đã gắn không đọc được, việc liệt kê trên toàn kho ngữ liệu và truy vết huyết thống thất bại với `SESSION_QUERY_PERSISTENCE_FAILED`; bản ghi lưu trữ đã đọc thành công nhưng không qua được kiểm tra hợp lệ của Session thì thất bại với `SESSION_QUERY_CORRUPT_SESSION`. Việc đọc tiêu đề, truy vết sự kiện hoặc đọc sự kiện đối với phiên trực tiếp đã biết không truy vấn lưu trữ, nên tình trạng sức khỏe của backend lưu trữ không thể làm trạng thái bộ nhớ hiện tại trở nên không đọc được. Các thao tác tiêu đề và sự kiện trên lưu trữ thực hiện truy vấn liệt kê trước khi nạp, và từ chối khi metadata không khớp, thay vì ghép các quan sát không nhất quán. Tín hiệu hủy của truy vết huyết thống được chuyển tới truy vấn liệt kê lưu trữ; tín hiệu hủy của truy vết sự kiện và đọc sự kiện được chuyển tới cả truy vấn liệt kê lẫn kiểm tra lưu trữ. Mỗi thao tác đều chờ lời gọi backend đã khởi động kết toán, rồi từ chối bằng đúng lý do của tín hiệu, ngay cả khi backend bỏ qua tín hiệu đó. Việc đọc tiêu đề, truy vết sự kiện hoặc đọc sự kiện đối với phiên trực tiếp đã biết mà bị hủy từ trước sẽ bị từ chối trước khi fold hoặc chụp ảnh, và không truy vấn lưu trữ. Quan sát tiêu đề hàng loạt thực hiện một truy vấn liệt kê metadata, dùng tối đa `persistedInspectConcurrency` worker để kiểm tra các id lưu trữ duy nhất, và giữ lại header do chính mỗi tiêu đề quan sát được để phục vụ việc ủy quyền ở phía dưới. Việc hủy sẽ không khởi động các lần kiểm tra đã xếp hàng, và chỉ từ chối sau khi các worker đã khởi động kết toán. `listSessions()` vẫn nhẹ, không nạp nhật ký hay lập chỉ mục tiêu đề.

## Lọc và trích xuất

`SessionResultFilter` bao phủ id, cwd có thể null, khoảng thời gian tạo, cha có thể null và tính sẵn có của nguồn. `SessionEventResultFilter` bao phủ khoảng seq/thời gian, loại sự kiện, tầng bề mặt và văn bản ngữ nghĩa. Các mảng bộ lọc dùng AND; các giá trị trong cùng một mệnh đề danh sách dùng OR. Giá trị danh sách rỗng không khớp gì cả, khoảng bao gồm cả hai đầu mút, còn khoảng sai định dạng hoặc giá trị union đóng không hợp lệ thì thất bại với `SESSION_QUERY_INVALID_FILTER`.

Mệnh đề văn bản được thiết kế có chủ đích để không phụ thuộc nhà cung cấp FTS: văn bản của bên gọi được escape thành biểu thức chính quy Unicode không phân biệt hoa thường, trong đó mỗi đoạn khoảng trắng liên tiếp khớp với một hoặc nhiều ký tự khoảng trắng. Đó là phép quét văn bản ngữ nghĩa theo nghĩa đen, không phải truy vấn toàn văn. `extractSessionEventText()` và `buildSessionEventSearchDocuments()` định nghĩa phép chiếu tài liệu first-party dùng chung; khối suy luận (reasoning), biên cấu trúc, mảnh stream, header yêu cầu và các biến thể declaration merging chưa biết không sinh ra tài liệu.

## Phương thức toàn văn

`SessionQueryEngine.searchSessions(request, exec?)` nhóm kho ngữ liệu logic theo sự kiện khớp mạnh nhất; `searchEvents(request, exec?)` tìm kiếm trong một phiên logic. Đây là hai phương thức trừu tượng duy nhất của dịch vụ. Cả hai đều trả về kết quả phân trang, với thông tin tiếp nối là `SessionSearchCursor` được gắn nhãn (branded) do dịch vụ nắm giữ; chấp nhận việc hủy tùy chọn, và cung cấp trích đoạn mà không dùng điểm số dạng số riêng của nhà cung cấp. Kết quả phân trang của tìm kiếm sự kiện còn mang theo header đích đã sao chép, lấy từ đúng thế hệ chỉ mục của kết quả khớp, để bên tiêu thụ có ủy quyền có thể gắn chính sách vào lần quan sát tải trọng này. Yêu cầu tìm kiếm chỉ chấp nhận bộ lọc metadata sự kiện, vì việc lọc văn bản theo nghĩa đen dùng đường quét đã nêu ở trên.

Gói này không có bộ điều phối nhà cung cấp, hiện thực dự phòng hay plugin cụ thể độc lập. Backend dịch vụ cụ thể kế thừa phần đọc, lọc và truy vết đã được hiện thực, đồng thời chịu trách nhiệm quan sát toàn văn, đối soát, xếp hạng, thế hệ con trỏ và thực thi truy vấn; hiện thực đầu tiên là [`@deepseek-ai/dsh-session-query-sqlite`](../session-query-sqlite/README.md).

`SessionQueryError.code` là một union đóng, bao phủ xác thực yêu cầu, mục tiêu bị thiếu, tầng bề mặt sai định dạng, xung đột nguồn, lỗi lưu trữ/chỉ mục, việc hủy, cùng con trỏ không hợp lệ hoặc đã cũ; các giá trị literal chính xác được định nghĩa trong [`src/config.ts`](src/config.ts).

`listEvents()`, `readSurface()` và `traceEvent()` thực hiện cùng một phép fold tầng bề mặt một lượt của `dsh-session`. Nhật ký đã nạp chỉ hợp lệ khi seq của sự kiện bắt đầu từ không và liên tục, dấu tầng bề mặt phù hợp với yêu cầu áp dụng theo loại sự kiện, mảng sự kiện nguồn không rỗng và không trùng lặp, các tham chiếu trỏ tới sự kiện có trước, và mỗi thay thế vị trí đều nêu tên và tham chiếu từng nút tầng bề mặt mà nó loại bỏ; mọi vi phạm đều thất bại với `SESSION_QUERY_INVALID_SURFACE`.

## Cấu hình

| Khóa | Mặc định | Quy ước |
|---|---:|---|
| `readWindowMax` | `50` | Số sự kiện thô tối đa cho `before` hoặc `after`. |
| `persistedInspectConcurrency` | `4` | Số lần kiểm tra nhật ký lưu trữ đồng thời tối đa trong một lần đọc hàng loạt; phải là số nguyên an toàn dương. |

## Trải nghiệm mô hình

Không có. Dịch vụ truy vấn đáng tin cậy này chỉ trả về bản ghi phiên đã sao chép cho bên gọi, không đăng ký prompt, schema, tool hay message hướng tới mô hình.

#### Ảnh hưởng tới KV Cache

Không có; gói này không lắp ráp cũng không gửi yêu cầu tới nhà cung cấp.

## Giới hạn đã biết và phần tạm hoãn

- **Không có ủy quyền bên gọi**: đây là hạ tầng đáng tin cậy trong phạm vi ngữ cảnh; tool của mô hình hoặc UI trong tương lai phải giới hạn những phiên mà bên gọi có thể kiểm tra.
- **Không có registry hay tool hướng tới mô hình**: chưa có registry cho bộ trích xuất và nhà cung cấp tìm kiếm, chưa có khả năng duyệt đệ quy các sự kiện nguồn được tham chiếu, và chưa có tool hướng tới mô hình. [Quyết định truy vết](../../../.agents/notes/implemented/feature/2026-07-13-session-query-tracing.md) chịu trách nhiệm về ngữ nghĩa quan hệ; các quyết định về quy thuộc SQLite và tokenizer nằm ở [bản ghi tìm kiếm đã hiện thực](../../../.agents/notes/implemented/feature/2026-07-10-sqlite-session-query-provider.md).
