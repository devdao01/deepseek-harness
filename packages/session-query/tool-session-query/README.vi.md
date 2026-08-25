# @deepseek-ai/dsh-tool-session-query

[English](README.md) | Tiếng Việt

Tool cho mô hình, nằm trên `ctx.sessionQuery` và được ủy quyền theo workspace. Gói opt-in này chỉ phụ thuộc vào interface hợp nhất, và đăng ký `session_search`, `session_event_search`, `session_trace`, `session_event_trace` và `session_event_read`; các tổ hợp host đã phát hành không gắn nó theo mặc định.

## Cấu hình

| Khóa | Mặc định | Ý nghĩa |
|---|---:|---|
| `maxSearchResults` | `100` | Số kết quả khớp đã được ủy quyền, không phải của chính phiên gọi, tối đa được thu thập trong quá trình phân trang nội bộ của nhà cung cấp |
| `searchTimeoutMs` | `30000` | Thời hạn cộng tác gắn vào hai tool tìm kiếm toàn văn |

Bên gọi chỉ có thể đến từ `ToolExecution.exec.agent`. Truy cập liên phiên yêu cầu giá trị `cwd` của phiên đích và phiên gọi phải bằng nhau tuyệt đối; bên gọi không có `cwd` chỉ có thể kiểm tra chính nó. Việc tìm kiếm không bao giờ phơi bày con trỏ của nhà cung cấp, offset, kích thước trang hay giới hạn trên do mô hình kiểm soát. Vì một lần tìm kiếm tiêu thụ nội bộ con trỏ nhà cung cấp gắn với thế hệ, cả hai tool tìm kiếm đều thực thi loại trừ lẫn nhau với các lời gọi tool ngang cấp; ba tool truy vết/đọc chính xác thì chọn thực thi song song. Mỗi bộ thực thi chính xác đều chuyển tín hiệu thực thi nguyên vẹn tới phần ủy quyền và tới phần truy vết/đọc của dịch vụ, nên việc hủy sẽ chờ quá trình dọn dẹp lưu trữ theo kiểu cộng tác, và giữ đúng lý do của tín hiệu. Dấu thời gian tại biên tool yêu cầu `Z` tường minh hoặc offset dạng số, và được chuyển thành bộ lọc epoch mili-giây bao gồm cả hai đầu mút.

`session_search` luôn bỏ qua phiên của bên gọi. Các id cha được yêu cầu sẽ được khử trùng lặp và kiểm tra theo quyền workspace của bên gọi trước khi vào FTS; chỉ những id đã được ủy quyền mới tới được nhà cung cấp, còn các phỏng đoán về id không tồn tại và phỏng đoán xuyên workspace hành xử hoàn toàn giống nhau, dấu root vẫn được OR một cách độc lập. `session_event_search` trong phiên hiện tại dừng ngay trước bước gọi nó, nên đầu ra assistant hiện tại và các lời gọi tool đã ghi nhận không thể tự khớp với chính mình. Mục tiêu trực tiếp được ủy quyền xong trước khi truy vết, đọc sự kiện hay đọc tiêu đề. Đầu ra huyết thống sẽ thay thế tổ tiên và hậu duệ chưa được ủy quyền ở biên bằng một dấu hiệu không chứa id phiên bị ẩn.

Mỗi lời gọi `ctx.sessionQuery` đáng tin cậy đều đi qua một bộ làm sạch tại biên mô hình. Trước hết nó kiểm tra việc hủy từ bên gọi và giữ nguyên chính xác điều đó. Thông tin chẩn đoán về kho ngữ liệu và thông tin chẩn đoán của nhà cung cấp lấy được (bao gồm các nguyên nhân lồng nhau có thể kiểm tra an toàn) sẽ được ghi vào nhật ký nội bộ theo nỗ lực tốt nhất; các lỗi không in được sẽ dùng một placeholder nhật ký cố định. Việc định dạng chẩn đoán và phân loại lỗi được bảo vệ độc lập với nhau, nên một nguyên nhân không in được không thể thoát ra, cũng không thể ngăn một lỗi bên ngoài đã được phân loại an toàn; còn việc phân loại hoặc ghi nhật ký không an toàn thì lùi về mã và thông điệp `SESSION_QUERY_TOOL_FAILED` cố định. Lỗi xác thực tham số cục bộ và lỗi ủy quyền vẫn giữ nguyên chính xác thông điệp do tool tự sở hữu.

Gói này cố ý không thực hiện cắt bớt theo byte hay ký tự, cũng không import backend spill. Các triển khai cần giới hạn đầu ra nội tuyến nên gắn `@deepseek-ai/dsh-spill-policy`, nó có thể thay thế văn bản đã kết xuất sau khi thực thi mà vẫn giữ nguyên kết quả đầy đủ.

## Trải nghiệm mô hình

### System prompt

#### Nội dung mô hình nhìn thấy

Mô hình nhận được một mục hướng dẫn cố định về lịch sử trước đó.

##### Hướng dẫn về lịch sử trước đó

```markdown
Use session_search to find relevant work from prior sessions, or session_event_search to search earlier events in one session. Search results are cursor-free and workspace-scoped. Follow a useful hit with session_trace, session_event_trace, or session_event_read when you need lineage, relationships, or exact data.
```

#### Ảnh hưởng tới token

Trong lúc plugin được gắn, mỗi yêu cầu đều có một mục ngắn gọn cố định.

#### Ảnh hưởng tới KV Cache

Tiền tố ổn định khi plugin và văn bản hướng dẫn không đổi.

### Schema của tool

#### Nội dung mô hình nhìn thấy

Mô hình nhìn thấy các [schema `session_search`, `session_event_search`, `session_trace`, `session_event_trace` và `session_event_read`](../../../docs/tool-catalog.md#deepseek-aidsh-tool-session-query) được sinh ra. Bộ lọc tìm kiếm làm tăng thêm một lượng token schema cố định, còn con trỏ, đường dẫn workspace, phân trang đầu ra và giới hạn trên của kết quả do mô hình kiểm soát vẫn không tồn tại.

#### Ảnh hưởng tới token

Khi hiển thị, mỗi yêu cầu đều gửi 5 schema chỉ đọc cố định.

#### Ảnh hưởng tới KV Cache

Tiền tố ổn định khi khả năng hiển thị và định nghĩa của tool không đổi.

### Kết quả của tool

#### Nội dung mô hình nhìn thấy

Mỗi lời gọi thành công đều phát ra một khối văn bản thuần. Kết quả tìm kiếm gồm tiêu đề và trích đoạn khớp tốt nhất; truy vết gồm toàn bộ quan hệ đã được ủy quyền; đọc sự kiện gồm JSON đích không lược bỏ. Chính sách spill dùng chung có thể thay thế văn bản nội tuyến quá lớn bằng bản xem trước, thông tin định vị mờ và hướng dẫn truy hồi.

#### Ảnh hưởng tới token

Kết quả phụ thuộc vào dữ liệu, và tồn tại trong lịch sử tool đã ghi nhận cho đến khi nén (compaction); `maxSearchResults` giới hạn số kết quả tìm kiếm.

#### Ảnh hưởng tới KV Cache

Văn bản kết quả chỉ-ghi-thêm nằm sau tiền tố yêu cầu có thể tái dùng, nên không làm mất hiệu lực các mục cache trước đó.

## Giới hạn đã biết và phần tạm hoãn

- Tìm kiếm trả về tối đa theo giới hạn của triển khai, và khi có nhiều kết quả khớp hơn thì yêu cầu mô hình thu hẹp truy vấn; không cung cấp token tiếp nối.
- Danh tính workspace dùng phép so sánh chuỗi `cwd` chính xác một cách thận trọng, nên các đường dẫn tương đương qua symlink không chia sẻ quyền.
- Các tổ hợp tùy chỉnh không gắn chính sách spill dùng chung sẽ nhận toàn bộ tải trọng truy vết và sự kiện ở dạng nội tuyến.
