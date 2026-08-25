# Agent Note: Code Mode sụp gộp bộ thực thi chứ không chỉ mặt thông báo

Status: implemented

[English](2026-08-07-code-mode-executor-collapse.md) | Tiếng Việt

## Vấn đề

`mode: 'code'` chỉ sụp gộp mặt thông báo, không sụp gộp mặt thực thi. `wireSchemas()` chỉ gửi cho model một công cụ duy nhất — `run_code` — nhưng bộ thực thi lại phân giải mọi lệnh gọi thông qua `get()`, mà `get()` trả về toàn bộ bảng công cụ có thể nhìn thấy cộng thêm các công cụ truyền tải được bảo lưu. Chỉ cần model phát ra tên công cụ gốc (`write`, `read`, `bash`, `subagent` v.v.), nó có thể hoàn toàn vòng qua `run_code`: lệnh gọi vẫn chạy hết toàn bộ pipeline và thực thi thành công, dù schema của nó chưa từng được thông báo. Bên cung cấp model không chặn các tên công cụ chưa được thông báo, vì vậy không gửi schema không đồng nghĩa với có ràng buộc.

Hợp đồng của gói đã chỉ đích danh phản mẫu hình này: khi bên gọi trực tiếp có thể vòng qua, việc lược bỏ schema không được tính là thực thi cưỡng chế — sự từ chối phải được kiểm chứng bởi bộ thực thi.

## Quyết định

`ToolRuntime` phân giải định nghĩa thực thi được thông qua `resolveExecution(name, scope, nested)` mới thêm, riêng tư, áp dụng việc sụp gộp mode tại ranh giới thao tác sở hữu quyết định này. Khi `modeFor(scope)` phân giải thành `code`, lệnh gọi trực tiếp của model (`nested = false`) chỉ được phép đặt tên công cụ truyền tải bảo lưu `run_code`; bất kỳ tên gốc nào cũng phân giải thành `undefined`, và được biểu diễn qua lỗi `UNKNOWN_TOOL` sẵn có của bộ thực thi, với thông điệp chỉ ra đường đúng là chuyển sang `run_code` — vì cái tên đó **đã được khai báo** đối với model hiện tại (tín hiệu của bên gọi đã bị hủy vẫn giữ hợp đồng hủy: `ABORTED_BEFORE_DISPATCH`, và finalizer của công cụ có thể nhìn thấy vẫn được áp dụng). Các mode scope hợp lệ bao gồm cả khai báo kế thừa từ agent preset, do đó wire schema của nó khớp với quyền thực thi. Lệnh gọi bị sụp gộp bị chặn ngay tại `createExecution` (giai đoạn đầu của `prepare`) — trước cả pipeline chính sách có thể mở rộng, nên listener `tools/pre-execute`, `ask` của approval và guard không bao giờ quan sát thấy một lệnh gọi chắc chắn sẽ bị từ chối, và con người cũng không bị nhắc phê duyệt nó. Lệnh gọi con lồng nhau (`nested = true` — tức có đặt token `parent`, trong mã sản xuất chỉ có binding SDK của `run_code` mới đặt token này) có thể gọi bất kỳ công cụ nào nhìn thấy được, do đó chương trình vẫn giữ nguyên toàn bộ binding sinh ra cho khai báo SDK.

Bốn điểm tra cứu trên đường thực thi — `executionMode`, `dispatchToolBody`, `postExecute`, `normalizeDispatchResult` — chuyển sang dùng `resolveExecution`. `createExecution` áp dụng cùng việc sụp gộp thông qua vị từ dùng chung `collapses(name, nested)`, để phân biệt lệnh gọi bị sụp gộp với tên thực sự chưa biết trước pipeline chính sách. Ngữ nghĩa của view registry công khai (`get`) và hình chiếu SDK (`schemas`) không đổi: hiển thị, kiểm tra và liệt kê binding vẫn thấy toàn bộ tập hợp có thể nhìn thấy. Thông báo (`wireSchemas`) và bộ thực thi giờ nhất quán với nhau. Lệnh gọi bị sụp gộp mang tham số không thể tuần tự hóa JSON báo lỗi tham số `TypeError` (hợp đồng invalid-args) thay vì `UNKNOWN_TOOL` — thân hàm vẫn không chạy, chính sách cũng không thực thi.

Sụp gộp là bất biến liên quan đến an toàn, vì vậy việc nghiệm thu được chốt qua bộ thực thi: ở mode `code`, model gọi trực tiếp công cụ gốc trả về `UNKNOWN_TOOL`; cùng công cụ đó gọi qua SDK con thì thành công; mode `native`/`both` gọi trực tiếp và `run_code` tự thân hành vi không đổi. Ghi chú này bổ sung ranh giới thực thi lên trên [nền tảng Code Mode](../feature/2026-06-15-code-mode.md) sẵn có, thiết kế truyền tải vẫn thuộc sở hữu của ghi chú kia.

## Phương án thay thế

### Lọc theo mode ở `get()` / view registry

View được tiêu thụ bởi hiển thị, kiểm tra `tool-cordis` và binding SDK; view bị sụp gộp sẽ ẩn khỏi mặt chương trình những công cụ vẫn phải được binding, và thay đổi hợp đồng phân giải công khai cho tất cả bên tiêu thụ, chứ không chỉ bộ thực thi.

### Lọc tại điểm vào agent-loop

loop không phải bên gọi duy nhất của bộ thực thi, và sự phân biệt thực sự quan trọng (model gọi trực tiếp vs lệnh gọi con truyền tải) nằm ở đầu vào thực thi, không nằm ở ranh giới loop. Lọc tại điểm vào cũng sẽ mã hóa lặp lại ngữ nghĩa mode mà registry đã có sẵn.

### Từ chối thông qua guard tích hợp sẵn

guard là phần mở rộng plugin tùy chọn; bất biến an toàn không thể phụ thuộc vào việc triển khai tình cờ lắp đúng plugin. Quyết định về mode thuộc sở hữu của registry, phải do chính nó thực thi.

### Chỉ giữ việc lược bỏ schema (giữ nguyên hiện trạng)

Không có bên cung cấp nào đảm bảo chặn các tên chưa được thông báo; các phiên được báo cáo chứng minh việc chặn sẽ không xảy ra.

## Hệ quả

- `mode: 'code'` giờ đây thực hiện đúng những gì nó thông báo: model gọi trực tiếp công cụ gốc trở thành `UNKNOWN_TOOL`, model có thể tự sửa bằng cách chuyển sang `run_code` (lệnh gọi đã bị hủy vẫn phân giải thành `ABORTED_BEFORE_DISPATCH` theo hợp đồng hủy).
- Hành vi `both` và `native` không đổi; lệnh gọi con SDK không đổi (tín hiệu phân biệt là token `parent`).
- Lệnh gọi bị sụp gộp bị từ chối ngay ở giai đoạn `prepare` — trước cả pipeline chính sách có thể mở rộng: listener pre-execute, `ask` của approval và guard không bao giờ quan sát thấy nó. `executionMode` cũng fail-closed tương tự (`exclusive`), điều phối không có sai khác quan sát được.
- Các đoạn hướng dẫn công cụ gốc (`tool:read`, `tool:write`, `tool:bash` v.v.) vẫn giữ trong system prompt, vì chúng đồng thời mô tả năng lực khả dụng qua cả generative SDK lẫn function calling gốc, và một số đoạn còn mang chính sách định tuyến xuyên công cụ mà không mô tả công cụ đơn lẻ nào chứa hết được (`read` ưu tiên hơn `bash cat`, chính sách fs-observation-policy mặc định yêu cầu `read` trước `write`, một vài trường hợp ủy quyền dùng `subagent` thay vì `workflow`). Cái ngăn model gọi trực tiếp công cụ gốc là sự sụp gộp của bộ thực thi, chứ không phải việc lọc prompt.
- Prompt sẽ **khai báo** việc sụp gộp này, nằm ở đoạn `tools:code-only` đứng trước các đoạn hướng dẫn 100–199. Những đoạn đó chỉ viết ra tên công cụ mà không giới hạn cách nào có thể chạm tới nó, do đó model chỉ đọc chúng sẽ phát ra lệnh gọi gốc, nhận `UNKNOWN_TOOL` cho một công cụ mà chính prompt đó vừa khai báo, từ đó suy ra triển khai không nhất quán, thay vì tự sửa. Thông báo từ chối đưa ra đường đúng cũng vì lý do tương tự. Ở `both`, quy tắc này render thành rỗng: lệnh gọi gốc của nó thực sự chạy, và khai báo ở đó sẽ là sai — đây cũng là lý do `both-mode-turn` không còn dùng chung prompt kỳ vọng với `code-mode-turn`.
- Bất kỳ tổ hợp truyền tải nào trong tương lai đặt token `parent`, lệnh gọi con của nó tự động chạm được toàn bảng, nhất quán với ngữ nghĩa lệnh gọi lồng nhau sẵn có của token này.
