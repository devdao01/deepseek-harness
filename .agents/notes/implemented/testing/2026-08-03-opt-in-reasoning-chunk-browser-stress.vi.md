# Agent Note: Phát hành tích lũy theo từng khung cho các shard reasoning (suy luận) và xác minh stress trên browser

Status: implemented

[English](2026-08-03-opt-in-reasoning-chunk-browser-stress.md) | 中文

## Vấn đề

Luồng reasoning dài liên tục sinh ra một lượng lớn `assistant/chunk`. Các sự kiện thô này phải lần lượt được sắp thứ tự, ghi log và gộp qua `PartialAccumulator` để giữ độ trung thực khi replay và nội dung cuối cùng đầy đủ; nhưng React chỉ cần thấy kết quả tích lũy hiện tại, không cần quan sát từng trạng thái trung gian trong cùng một khung hình (frame) trình duyệt.

Mỗi `yield` của luồng bất đồng bộ đều có thể tạo ranh giới microtask mới, nên chỉ dựa vào việc gộp theo microtask của `Notifier.markDirty()` sẽ suy biến thành: cứ mỗi shard lại dựng lại một `ConversationSnapshot`, thông báo một lần cho `useSyncExternalStore`, và chạy một lần React render. Ngay cả khi dòng Think thời gian thực vẫn được gập lại (collapsed), 100.000 shard reasoning vẫn có thể khiến công việc điều phối, commit và layout chiếm dụng main thread. Ranh giới hiệu năng phải nằm giữa tầng nhận sự kiện của phiên và tầng phát hành cho React, không được che giấu bằng cách làm chậm bên sản xuất hoặc bỏ bớt sự kiện thô.

## Quyết định

`Session.acceptLiveEvent()` lập tức append từng sự kiện thô, và đồng bộ cập nhật transcript (bản ghi văn bản), `PartialAccumulator` cùng các trạng thái phái sinh khác của phiên. Các shard hiển thị `block-start`, `text-delta`, `reasoning-delta`, `tool-call-delta` và `block-end` được phát hành qua `Notifier.markFrameDirty()`: thay đổi đầu tiên sẽ lên lịch một lần `requestAnimationFrame`, các shard tiếp theo chỉ tiếp tục cập nhật bộ tích lũy; callback của khung hình dựng lại một snapshot tích lũy từ trạng thái mới nhất và thông báo cho subscriber đúng một lần. `usage`, `finish` và các shard không hiển thị chưa xác định vẫn nằm trong cửa sổ sự kiện, nhưng không kích hoạt thông báo React vô ích. Phiên và các kiểm tra lịch sử dùng chung một cách phân loại shard hiển thị.

`Notifier` quản lý công việc phát hành đang chờ bằng loại lịch trình và nhãn thế hệ (generation). Sự kiện cấu trúc thông thường vẫn phát hành qua `markDirty()` trong microtask; nếu tin nhắn đã hoàn tất (finalize), sự kiện tool, hoặc lỗi đến trong khi vẫn còn việc phát hành khung hình đang chờ, microtask sẽ thay thế nó, callback khung hình cũ bị vô hiệu do không khớp thế hệ. `notifyNow()` cũng vô hiệu hóa lịch trình cũ, để giữ độ phản hồi đồng bộ cho input có kiểm soát. Môi trường không có `requestAnimationFrame` sẽ lùi về gộp theo microtask. Sự kiện finalize có thể bỏ qua một partial trung gian chưa kịp hiển thị, nhưng nội dung finalize được phát hành và thứ tự sự kiện thô vẫn được giữ nguyên vẹn.

Việc cuộn theo chiều ngang bám đuôi văn bản tích lũy của dòng Think thời gian thực thuần túy là căn chỉnh thị giác, không cần đọc layout đồng bộ trong mỗi lần React commit. Bộ điều phối bên trong component gộp các yêu cầu liên tiếp thành một lần mỗi ba khung hình, đọc `scrollWidth` và `clientWidth` từ DOM mới nhất và cập nhật `scrollLeft` trực tiếp tới vị trí mới nhất; nhịp thị giác cố định giúp thay đổi tóm tắt vẫn đọc được, mà không dồn ứ animation cuộn mượt của trình duyệt. Việc throttle này chỉ tác động đến phần tóm tắt cuộn ngang của Think, không làm trễ việc cuộn phần nội dung Chat chính, việc neo khi prepend lịch sử, hay `scrollIntoView` do người dùng kích hoạt.

`pnpm run test:web:stress` được giữ lại như bằng chứng hiệu năng trên browser, không cần khóa, phải bật tường minh. Phiên `?fixture` xác định phát ra 100.000 `reasoning-delta` theo nhịp độc lập với việc vẽ; điểm đánh dấu kết thúc chứng minh sự kiện đã được gộp qua phiên sản xuất và đến được dòng Think thời gian thực; nhịp tim (heartbeat) 50ms và sự kiện DOM được lên lịch trước lần lượt đo độ trễ chững main thread và độ trễ tương tác, ngân sách 250ms dùng để nhận diện regression rõ rệt. `DSH_WEB_STRESS_HEADFUL=1` cho phép nhà phát triển dùng panel Performance để phân tích cùng kịch bản trong trình duyệt hiển thị (headful). Làn stress này là bằng chứng cho chẩn đoán hiệu năng thủ công và nghiệm thu bản sửa lỗi, không phải cổng CI mặc định, cũng không thay thế test đơn vị điều phối xác định.

Test tập trung cố định việc gộp theo khung hình của `Notifier`, việc ưu tiên sự kiện cấu trúc, callback bị vô hiệu và fallback không có rAF, và ở tầng `Session` chứng minh mỗi khung hình chỉ phát hành đúng một lần văn bản tích lũy mới nhất và finalize không bị callback khung cũ thông báo trùng lặp. Test đơn vị nhỏ của fixture (dữ liệu tiền cấu hình cho test) tiếp tục cố định việc xác thực input, nhịp đến từ bên ngoài, từ chối chạy đồng thời, số lượng sự kiện chính xác và việc gửi điểm đánh dấu kết thúc, mà không cần đưa workload 100.000 shard vào bộ test mặc định.

## Các phương án thay thế đã cân nhắc

**Dùng transition, deferred value, hoặc throttle component cho snapshot trong React.** Không áp dụng: nguồn phiên vẫn thông báo cho `useSyncExternalStore` theo từng shard, React render đã xảy ra trước khi component quyết định trì hoãn hiển thị, và nhiều component cùng tiêu thụ một snapshot sẽ phải lặp lại chính sách. Việc throttle cuộn thị giác của tóm tắt Think nằm sau khi snapshot đã phát hành, chỉ giảm tần suất layout đồng bộ, không đảm nhận chính sách phát hành dữ liệu.

**Bỏ bớt, lấy mẫu, hoặc ghép các shard thô ở tầng nhận hoặc tầng log.** Không áp dụng: `assistant/chunk` thô là sự thật của phiên có thể replay được; thay đổi nó sẽ mất độ trung thực chẩn đoán và UI, đồng thời trộn chính sách tần suất hiển thị vào tầng dữ liệu có thẩm quyền.

**Chỉ dùng gộp theo microtask.** Không áp dụng: các `yield` bất đồng bộ liên tiếp sẽ rút cạn hàng đợi microtask giữa các shard liền kề, khiến việc gộp theo microtask gần như suy biến thành thông báo mỗi shard một lần.

**Điều khiển nhịp độ của bên sản xuất test theo khung hình animation.** Không áp dụng: bên sản xuất sẽ đồng bộ chậm lại khi render chậm, tạo ra áp lực ngược (backpressure) ngầm mà luồng mạng thật không có, và che giấu tình trạng đói main thread.

**Model thật hoặc luồng byte HTTP đã ghi lại.** Không áp dụng: model thời gian thực không xác định, còn bản ghi HTTP/SSE (Server-Sent Events) cũng không cải thiện assertion mục tiêu. Fixture trong bộ nhớ giữ lại từng sự kiện phiên bất đồng bộ, việc gộp ở client sản xuất và đường dẫn render React, đồng thời kiểm soát được workload và nhịp đến.

## Hệ quả

Tần suất phát hành `ConversationSnapshot` dạng streaming bị ràng buộc bởi tần suất vẽ của trình duyệt, React xử lý tối đa một partial tích lũy chứa toàn bộ văn bản đã nhận mỗi khung hình; sự kiện cấu trúc vẫn có thể phát hành nhanh hơn. Việc nhận, sắp thứ tự, ghi log, ghép chuỗi và cập nhật bộ tích lũy vẫn thực hiện theo từng shard thô, nên quyết định này chỉ giảm việc dựng lại snapshot và công việc của React, không biến chi phí phân tích luồng thô thành đã được giải quyết một cách giả tạo.

Việc đọc/ghi layout theo chiều ngang để gập tóm tắt Think tối đa thực hiện mỗi ba khung hình một lần, và bắt kịp trực tiếp vị trí mới nhất tại thời điểm đó; React vẫn commit bình thường theo snapshot tích lũy, khi finalize thì tóm tắt trở lại dòng đầu. Chính sách thị giác cục bộ này không làm thay đổi tính tức thời của cuộn nội dung chính và tương tác người dùng.

Làn stress trên browser tiếp tục cung cấp tín hiệu phản hồi và điểm vào profiling trực quan trên ứng dụng đã lắp ráp thật, nhưng khác biệt phần cứng và lịch trình khiến nó chỉ phù hợp làm bằng chứng hiệu năng tường minh. Test tập trung xác định chịu trách nhiệm giữ vững số lần phát hành, nội dung tích lũy và thứ tự ưu tiên, giữ cho làn test mặc định luôn nhanh.
