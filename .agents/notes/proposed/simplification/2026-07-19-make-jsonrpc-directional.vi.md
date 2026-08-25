# Agent Note: Đơn nhất hóa kết quả hoàn tất và chiều truyền của JSON-RPC

Status: proposed

[English](2026-07-19-make-jsonrpc-directional.md) | Tiếng Việt

## Vấn đề

Lớp cầu nối JSON-RPC mô hình hóa cả hai đầu như những peer đối xứng, nhưng giao thức thực tế lại có chiều cố định. Lớp truyền dùng chung (nay là `dsh-sdk-protocol`, được máy chủ và client TypeScript SDK dùng chung, trong đó client thực thi chiều request đi ra/notification đi vào) vẫn hiện thực hai nửa mà không đầu nào sử dụng: request do máy chủ khởi tạo và notification do client khởi tạo. Python SDK gửi request rồi nhận response hoặc notification, nhưng vẫn xếp hàng các request đi vào từ máy chủ mà không dùng tới, đồng thời phơi bày các phương thức hỗ trợ trả lời.

`session/prompt` còn báo cáo cùng một lượt đã kết thúc bằng hai cấu trúc giao thức. Máy chủ phát ra `session.finished` trước, rồi trả về hằng `{ accepted: true }`; Python SDK vứt bỏ response đó và thay vào đó chờ notification để lấy trạng thái. Response chỉ được ghi sau khi hàm xử lý trả về, nên trên cùng một luồng có thứ tự, notification chắc chắn đi trước response hằng số này.

Những khả năng hai chiều không được dùng tới này kéo theo bảng request đang chờ, sinh ID, hàng đợi request, đường từ chối lúc đóng, phương thức hỗ trợ trả lời và một bộ logic chờ hoàn tất thứ hai, mà không có bên gọi production nào sử dụng.

## Đề xuất

Thu hẹp hai đầu theo đúng vai trò thực tế. Máy chủ giữ request đi vào, response đi ra và notification đi ra; client TypeScript và Python giữ request đi ra cùng response hoặc notification đi vào. Xóa những chiều mà không đầu nào dùng — request do máy chủ khởi tạo và notification do client khởi tạo.

Sau khi `agent.whenIdle()` hoàn tất, để `session/prompt` trả về trực tiếp `{ status, reason }` làm kết quả của lượt. Xóa `session.finished`, response chấp nhận hằng số và vòng lặp chờ hoàn tất sau response trong Python. `session.event` và các notification subagent vẫn được phát theo luồng trước response, và các sự kiện phiên được lưu bền vẫn là nguồn sự thật để tái dựng response cuối cùng.

## Kế hoạch triển khai

1. Trong `packages/sdk/server/src/server.ts`, thay `SessionPromptResult.accepted` bằng `status: 'ok' | 'error' | 'aborted'` và `TurnEndReason` đã bắt được. `HarnessSdkJsonRpcServer.prompt()` ánh xạ `completed` thành `ok`, `aborted` thành `aborted`, và các nguyên nhân khác hiện có hoặc có thể mở rộng qua declaration merging thành `error`; việc chuyển sang trạng thái rảnh mà không có `turn/end` vẫn được coi là lỗi bất biến. Chỉ xóa `session.finished`, giữ nguyên `session.event`, `subagent.started` và `subagent.finished`.
2. Trong `packages/sdk/protocol/src/transport.ts`, thu hẹp lớp dùng chung về những chiều có bên tiêu thụ — request đi vào/response đi ra (máy chủ) và request đi ra/response đi vào cùng notification đi vào (client TypeScript SDK) — chỉ xóa cách dùng `request()` do máy chủ khởi tạo và việc phân phối notification do client khởi tạo, hoặc tách lớp đó thành hai lớp truyền cho máy chủ và client. Kết quả request, phản hồi lỗi khi phương thức không tồn tại và khi handler lỗi giữ nguyên hành vi cũ, và tiếp tục xếp sau các notification do handler được chờ phát ra.
3. Trong `python/sdk/src/deepseek_harness/client.py`, `models.py` và `__init__.py`, xóa `IncomingRequest`, `_requests`, `notify()`, `next_request()`, `respond()` và `respond_error()`. Bổ sung `SessionPromptResponse` công khai và đã được kiểm định để mang trạng thái cùng nguyên nhân, cho `session_prompt()` trả về đối tượng đó, và giữ lại một lớp bảo vệ đọc rõ ràng: bỏ qua các khung request ngoài dự kiến từ máy chủ, tránh để chúng chạm tới bộ chờ response.
4. Trong `python/sdk/src/deepseek_harness/api.py`, dựng `TurnResult.status` và `TurnResult.reason` mới từ `SessionPromptResponse`, rồi xóa nhánh `session.finished` và vòng lặp hoàn tất thứ hai. Giữ subscription mở trong suốt request, và giữ bước rút cạn notification cuối cùng của `_request_raw()`, đảm bảo sự kiện `turn/end` cuối được ghi trước response cùng mọi notification subagent đều được thu thập trước khi `Session.run()` tái dựng thông điệp trợ lý cuối cùng.
5. Thay các ca kiểm thử cặp lớp truyền đối xứng trong `packages/sdk/protocol/tests/transport.spec.ts` bằng độ phủ theo chiều, và cập nhật `server.spec.ts`, `plugin-apply.spec.ts` cùng `built-scope-carrier.e2e.ts` để bao phủ kết quả trực tiếp, thứ tự, chồng lấn, đóng và các bản giả đã thu hẹp; đồng thời cập nhật client TypeScript SDK (`packages/sdk/client`) cùng bộ kiểm thử của nó để dùng luồng kết thúc dựa trên response. Cập nhật `python/sdk/tests/test_client.py` để bao phủ luồng kết thúc dựa trên response, việc xử lý khung request ngoài dự kiến, hành vi callback và đồng thời, cùng các phương thức hỗ trợ công khai đã bị xóa. Đồng thời cập nhật README JSON-RPC, README Python SDK song ngữ, JSDoc và khai báo của các export, `scripts/smoke-python-runtime.py` và snapshot tệp thực thi đơn của Python.

## Phương án thay thế

**Giữ peer JSON-RPC đối xứng dạng tổng quát cho các phương thức tương lai.** Request do máy chủ khởi tạo sau này có thể dùng cho việc cấp quyền tương tác, nhưng hiện chưa có phương thức có kiểu hay bên tiêu thụ production nào. Sau khi tính năng đó được thiết kế xong, giao thức tiền phát hành có thể bổ sung chiều tối thiểu cần thiết, không cần giữ trước khả năng peer không dùng tới.

**Giữ `session.finished` cho client dạng luồng.** Kết thúc lượt không phải dữ liệu gia tăng: response của request đã đánh dấu chính ranh giới đó, và trong luồng có thứ tự nó nằm sau mọi notification trước đó. Một notification kết thúc thứ hai sẽ tạo ra hai cách biểu diễn kết quả, buộc client phải điều hòa chúng.

## Tiêu chí nghiệm thu

- Đầu TypeScript không thể khởi tạo request, cũng không tiêu thụ notification.
- Đầu Python không thể khởi tạo notification, cũng không tiêu thụ request từ máy chủ.
- Sau khi lượt kết thúc, `session/prompt` trả về trạng thái có thẩm quyền `ok`, `error` hoặc `aborted` cùng nguyên nhân của nó.
- Các sự kiện phiên và notification vòng đời subagent phát ra trong lượt đều tới trước response.
- Việc từ chối chồng lấn trên cùng một phiên, phân khung, đầu vào nhiều byte, lỗi handler, flush, thứ tự đóng và việc tái dựng response cuối cùng giữ nguyên hành vi cũ.
- Kiểm thử cầu nối TypeScript, kiểm thử Python SDK, độ phủ JSON-RPC sau build, snapshot và tài liệu API được sinh ra đều vượt qua.

## Rủi ro

Đề xuất này cố ý thu hẹp định dạng giao thức tiền phát hành. Các client thô chỉ lắng nghe `session.finished`, cũng như các bên nhúng dùng phương thức truyền đối xứng không được sử dụng, đều phải chuyển sang đọc response của request. Nếu tương lai cần request do máy chủ khởi tạo, nên bổ sung giao thức có kiểu, chứ không tái dùng một cơ chế tổng quát đang ngủ đông.
