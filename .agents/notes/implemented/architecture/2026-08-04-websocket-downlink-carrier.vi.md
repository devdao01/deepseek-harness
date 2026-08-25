# Agent Note: Bộ mang WebSocket cho đường xuống trên trình duyệt

Status: implemented

[English](2026-08-04-websocket-downlink-carrier.md) | 中文

## Problem

`events.mux` và `events.host` của Web GUI trên trình duyệt từ lâu dùng hai response SSE (Server-Sent Events). Trình duyệt HTTP/1.1 thường chỉ cho phép khoảng sáu kết nối đồng thời cho mỗi origin; mỗi trang chiếm vĩnh viễn hai kết nối khiến nhiều tab cùng origin, tài nguyên plugin và các RPC thông thường tranh giành slot kết nối, và khi chạm ngưỡng thì không phải giảm tốc mà là xếp hàng và nghẽn. Bản thân protocol RPC không phụ thuộc kênh truyền, ràng buộc đến từ bộ mang vật lý của trình duyệt, không nên thấm vào lớp đối tượng session/runtime.

## Decision

Bộ mang thực sự trên trình duyệt mở một WebSocket độc lập cho mỗi loại luồng đường xuống: `/api/events.mux` chỉ gửi `MuxFrame`, `/api/events.host` chỉ gửi `HostFrame`. Mỗi thông điệp văn bản là một JSON `ServerRequest` hoàn chỉnh; client tiếp tục xác thực envelope trước, rồi xác thực union của frame cụ thể theo path, và giao `RpcRequest<Frame>` đã thu hẹp cho `ConnectionController` sẵn có. Hai luồng giữ vòng đời độc lập và không đảm bảo thứ tự chéo luồng; bất kỳ luồng nào kết thúc cũng khiến toàn bộ connection generation thất bại và được tái tạo theo chính sách backoff sẵn có.

WebSocket chỉ đảm nhận đường xuống host→browser. Mọi lệnh gọi unary client→host và `respond` đối với server request tiếp tục dùng `POST /api/*` sẵn có; không nhận bất kỳ thông điệp nghiệp vụ nào từ client trên WebSocket. Do đó `WebApiClient` đồng thời giữ HTTP `fetch` cho đường lên và WebSocket cho đường xuống, còn fixture (dữ liệu tiền trạng cho test) và `InProcessApiClient(toFetchHandler(api))` tiếp tục triển khai cùng abstraction hai luồng `IApiClient`. Bộ mang fetch trong-tiến-trình vẫn giữ mã hóa/giải mã SSE để kiểm chứng tính đẳng cấu của protocol không phụ thuộc kênh truyền, nhưng request GET tới `/api/events.*` trên mạng chỉ trả về yêu cầu upgrade, không đóng vai trò fallback tương thích trình duyệt.

## Ranh giới Upgrade và vòng đời

`dsh-host-webserver` cung cấp một điểm đăng ký upgrade-route chính xác, song song với route thông thường, chỉ phân phối socket upgrade của Node theo pathname, cô lập lỗi socket thô, và đợi các kết nối upgrade còn sống đóng lại trong lúc server teardown; nó không biết gì về frame Harness hay thông điệp WebSocket. `dsh-client-connection` sở hữu WebSocket handshake, việc ghi frame ra và hủy luồng, và tái dùng hàng rào tin cậy Host/Origin của `/api` trước khi upgrade. Authority không đáng tin hoặc Origin chéo nguồn không đáng tin bị từ chối trước khi `ctx.apiProxy.events.*` khởi động.

Trình duyệt abort hay socket đóng sẽ hủy luồng host tương ứng; teardown của plugin còn đợi source iterator đó hoàn tất dọn dẹp. Khi luồng host giữa chừng ném lỗi, bộ mang gửi một frame `stream/error` sẵn có rồi đóng socket; client gom frame đó lại thành mất kết nối, không phát cho sink nghiệp vụ. Mỗi WebSocket báo cáo open độc lập, handshake readiness sẵn có vẫn đợi cả mux lẫn host cùng open và lệnh gọi HTTP `host.describe` thành công rồi mới phát connected.

## Verification

Test hợp đồng của webserver ghim chặt việc phân phối theo pathname upgrade, từ chối đăng ký trùng lặp, giải phóng tài nguyên và teardown; test mạng thật của connection ghim chặt kiểm tra tin cậy riêng cho từng WebSocket trong hai luồng, việc open, envelope schema, thứ tự frame, lỗi luồng và việc hủy khi đóng; test client đồng thời chứng minh đường xuống tạo URL `ws:`/`wss:`, còn unary và `respond` vẫn gọi HTTP `fetch`. Bản replay keyless trên trình duyệt sau khi lắp ráp tiếp tục bao phủ toàn bộ chuỗi Chromium, host thật, đường lên HTTP và đường xuống WebSocket.

## Alternatives considered

**Dùng một WebSocket duy nhất ghép mux và host.** Việc này đòi hỏi thêm channel tag, hàng đợi ghép kênh và chính sách backpressure cho một kết nối, đồng thời thay đổi ngữ nghĩa readiness hai-luồng hiện có; hai WebSocket riêng đã tránh được giới hạn sáu kết nối của HTTP/1.1, đồng thời giữ thay đổi lần này ở đúng lớp bộ mang vật lý.

**Chuyển cả unary và respond vào WebSocket song công.** Việc này sẽ viết lại timeout, hủy, HTTP status, hàng rào tin cậy và hành vi liên kết request, nhưng không mang lại lợi ích gì thêm cho vấn đề slot kết nối đường xuống hiện tại; đường lên HTTP là ranh giới được giữ nguyên có chủ đích.

**Giữ lại SSE trên mạng như fallback.** Hai bộ mang song song sẽ khiến đường trình duyệt production có thể âm thầm phân nhánh do proxy hoặc khác biệt handshake, và khiến vấn đề giới hạn kết nối tiếp tục tồn tại trên một nhánh được hỗ trợ; ở giai đoạn tiền phát hành chỉ giao WebSocket cho đường xuống, thất bại được thể hiện rõ ràng qua cơ chế reconnect và trạng thái kết nối sẵn có.

**Dựa vào HTTP/2 để mở rộng năng lực kết nối đồng thời.** Server dev tích hợp sẵn là HTTP/1.1 thuần văn bản trên Node, và proxy tiền trạm khi triển khai cũng không phải bất biến mà sản phẩm có thể dựa vào; đường xuống vật lý nên dùng trực tiếp nguyên thủy của trình duyệt không bị giới hạn bởi pool kết nối đó.

## Consequences

Mỗi trang Web vẫn có hai kết nối đường xuống dài hạn, nhưng chúng không còn tiêu tốn hạn ngạch sáu kết nối HTTP/1.1 của trình duyệt; runtime tiếp tục tiêu thụ hai luồng sẵn có và giữ nguyên mọi ngữ nghĩa reconnect, sửa luồng và không đảm bảo thứ tự chéo luồng. Cái giá là webserver có thêm một mặt đăng ký upgrade, nửa phía host của package connection có thêm một phụ thuộc triển khai WebSocket, và cần bảo trì riêng hai kiểu mã hóa/giải mã vật lý — WebSocket trên trình duyệt và SSE trong-tiến-trình; chúng chia sẻ cùng schema `ServerRequest`/frame và ngữ nghĩa `IApiClient`, tránh hình thành một bộ protocol nghiệp vụ thứ hai.
