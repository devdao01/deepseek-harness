# Agent Note: Ánh xạ mức dùng token và tỷ lệ chiếm dụng ngữ cảnh

Status: implemented

[English](2026-07-29-projected-token-usage-and-request-context.md) | 中文

## Vấn đề

Dòng thống kê (StatsLine) trên Web trước đây suy ra tổng token từ các node phiên hiện đang được nạp. Cửa sổ này được phân trang, nên việc cuộn sẽ làm thay đổi tổng số; còn compaction (nén) lại thay thế nội dung hiển thị mà không giữ lại mức dùng tính phí đứng sau nó. Mức dùng tính phí bền vững của provider cần một nguồn dữ liệu chịu được cả hai điều này.

Tỷ lệ chiếm dụng ngữ cảnh cần một tử số và một mẫu số, mà cả hai đều chưa từng được bất kỳ interface hiện có nào gửi tới trình duyệt: kích thước prompt của request gần nhất, và dung lượng của route mà request đó dùng.

## Quyết định

Cả hai giá trị đều là trạng thái ánh xạ phiên (session projection) bền vững thông thường. Khi `ctx.sessionProjections` tồn tại, `@deepseek-ai/dsh-token-meter` sẽ đăng ký hai đơn vị.

`tokenUsage` gộp toàn bộ log bền vững thành bốn nhóm đếm: input chưa cache, output, cache read và cache write. Ngay cả khi request sau đó thất bại, các mẫu mức dùng `assistant/chunk` vẫn được giữ lại; giá trị mức dùng `assistant/message` của cùng một `(turn, step)` sẽ thay thế mẫu trước đó, không bị đếm trùng. Reasoning (suy luận) vẫn là một mục con của output. Compaction và việc thay thế lớp bề mặt không xóa mức dùng tính phí trước đó.

`contextPressure` mang theo `pressureTokens` tùy chọn (kích thước prompt mới nhất do provider báo cáo, bằng tổng input chưa cache cộng cache read và write, không tính output), cùng `contextWindow` tùy chọn lấy từ bản ghi `request/context` mới nhất. Trước khi nguồn tương ứng của chúng xuất hiện, cả hai trường đều không bị tổng hợp giả.

`request/context` là sự kiện phiên mới, chỉ ghi vào log, ghi lại metadata của route đã được resolve cho request, gắn với registration đã bind. AgentLoop thêm nó ngay sau `request/header` trong bước xử lý, dữ liệu lấy từ metadata ngữ cảnh mà `prepareCall()` giờ trả về cùng với config đã resolve: chính là truy vấn đã bind registration và đã kiểm tra reasoning từ trước, nên không xảy ra lần resolve thứ hai. Khi provider, model và dung lượng đều giống bản ghi trước, sẽ bỏ qua không ghi. Các route mà adapter không công bố dung lượng sẽ được ghi lại với `contextWindow` bị thiếu, nhờ đó xóa mẫu số của route trước đó.

Dung lượng cố tình không đưa vào `EpochHeader`. Kiểu này là quy ước tái tạo — tức request được dựng từ những gì — và `headerEquals` so sánh nó theo từng field để xác định một snapshot có thực sự là một `change` hay không. Dung lượng là metadata của adapter mô tả route; nếu đưa nó vào đó sẽ khiến thay đổi dung lượng giả dạng thành thay đổi của request envelope, đồng thời kéo nó vào bất biến tái tạo của AgentLoop.

Cả hai đơn vị đều tuân theo vòng đời ánh xạ chuẩn: baseline từ trang lịch sử cuối, khung thời gian thực `session/projection`, lưu trữ phía client theo nguyên tắc seq cao thắng, checkpoint JSON, khôi phục từ cache và unmount đơn vị. Hệ thống không có bất kỳ trường lịch sử, khung mux, projector, bộ đếm revision hay hàng rào (fence) phía client nào dành riêng cho token.

`StatsLine` trên Web đọc cả hai qua vị trí `useProjection` chuẩn. Các node trong cửa sổ vẫn cung cấp số lượt (turn) và bước (step), cùng thời gian thực tế (wall-clock) của LLM (mô hình ngôn ngữ lớn) và công cụ (tool): chúng trả lời câu hỏi "trên màn hình đang có gì", và ở phạm vi cửa sổ thì đó chính xác là điều đúng. Sau khi compaction đưa các bước assistant hiển thị về 0, các nhóm token và ngữ cảnh bền vững vẫn được giữ lại. Cache write được tính vào input tính phí và mẫu số tỷ lệ cache hit. Khi chưa triển khai token-meter, nhóm token sẽ bị loại bỏ; tỷ lệ chiếm dụng chỉ hiển thị khi cả pressure và dung lượng đều đã biết.

## Tỷ lệ chiếm dụng ngữ cảnh là giá trị gần đúng, và chính điều đó là quyết định

`pressureTokens` và `contextWindow` là hai trường độc lập, mỗi trường theo nguyên tắc "bản ghi sau thắng" riêng, không phải một phép quan sát nguyên tử (atomic). Khi đổi model, dung lượng mới sẽ được ghép với pressure của route trước đó, cho tới khi request tiếp theo báo cáo mức dùng; tử số mô tả request cuối cùng, chứ không phải bề mặt hiện tại.

Đây là kết quả được chấp nhận có chủ đích. Tỷ lệ phần trăm chiếm dụng là con số tham khảo hướng tới người dùng: không có khâu nào trong harness ra quyết định dựa trên nó, compaction đọc trực tiếp từ `measure()`. Dòng trạng thái TUI vẫn luôn tính tỷ lệ chiếm dụng theo cách này, tức lấy tổng của `measure()` chia cho dung lượng được resolve riêng cho model đang chọn; do đó việc làm phiên bản nguyên tử ở đây mới là ngoại lệ, chứ không phải chuẩn mực.

Tính phi-nguyên-tử này là có chủ đích, không phải lỗi. Bên tiêu thụ nào thực sự cần con số chính xác trong cùng một ranh giới nên tự gọi `ctx.tokenMeter.measure()` tại ranh giới request của chính mình, nơi cả hai giá trị cùng khả dụng, thay vì đọc từ ánh xạ này.

## Phương án khác đã cân nhắc

**Gửi snapshot nguyên tử tại ranh giới request bằng khung mux tạm thời (đã triển khai, sau đó bị bác bỏ).** Một revision trước đó phát ra `session/model-request`: một khung không thể phát lại (non-replayable), mang `contextTokens` và `contextWindow` được đo tại cùng ranh giới `agent/model-request`. Điều thực sự khiến nó bị loại bỏ là nó trở thành loại duy nhất không thể phát lại trên luồng mux. Luồng Host và luồng mux là hai luồng SSE (Server-Sent Events) độc lập, không có bảo đảm thứ tự giữa chúng: một request được phát ra trước khi remove có thể đến sau `host/session-removed`, làm hồi sinh dữ liệu đo lường của một phiên đã chết; còn một request hợp lệ của vòng đời mới tái sử dụng cùng id lại có thể bị một remove đến muộn chặn mất. `session/subscribed` không chứng minh được vòng đời: nó chỉ cho biết một hàng đợi bắt đầu theo dõi một id nào đó, chứ không cho biết một phiên bộ nhớ mới đã thay thế phiên cũ; còn `lastSeq` là mốc bền vững mà hai vòng đời có thể dùng chung. Cách sửa đúng đắn cần một thế hệ vòng đời (lifecycle generation) tăng đơn điệu gắn trên cả khung, subscription và remove, cộng thêm một lần so sánh mốc phía client.

Cái giá phải trả cho điều này là hiển thị tệ hơn: tỷ lệ chiếm dụng trống trơn sau mỗi lần kết nối lại, và không bao giờ nhúc nhích trong suốt thời gian phiên phát triển. Nó còn biến ApiProxy thành một điểm đo lường, buộc mỗi request phải gọi `measure()` với độ phức tạp O(surface), và diễn đạt trạng thái kết nối lại thông qua một lỗi `cancelled` tổng hợp khi mở kết nối mà UI phải xử lý đặc biệt.

**Gộp cửa sổ node đã nạp trong React.** Không thể giữ dữ liệu qua phân trang hoặc compaction, và còn buộc gói hiển thị phải tái tạo ngữ nghĩa log.

**Chỉ phát mức dùng cùng với message assistant cuối cùng.** Nếu request báo cáo một mảnh mức dùng rồi thất bại, sẽ mất mức dùng tính phí của chính nó.

**Resolve dung lượng ngay bên trong token-meter.** Gói này tự mô tả là không phụ thuộc vào việc route model, và ngoài ra là một bên chỉ đọc thuần túy, không bao giờ ghi thêm vào log. AgentLoop đã giữ sẵn metadata đã resolve tại nơi nó ghi request header.

**Thêm trường dung lượng vào RPC `session.models`.** Handler của nó đã resolve ra dung lượng rồi bỏ đi, nên trường này gần như miễn phí; nhưng `StatsLine` nằm ở `ui-conversation`, còn catalog model nằm ở `ui-model-selection`, mà `ui-conversation` không được phép phụ thuộc vào `ui-model-selection`. Để đưa nó tới nơi, sẽ phải thêm một mục dock thứ hai, tách một dòng văn bản ra hai plugin, hoặc thực hiện một lần ghi store xuyên plugin.

**Thêm vòng tròn ngữ cảnh cạnh bộ chọn model.** Vị trí đó sẽ khiến người dùng hiểu nhầm đây là trạng thái của model đang chọn. Dòng thống kê có thể mang con số này mà không cần thêm UI hay đường dữ liệu trùng lặp.

## Hệ quả

Tổng token giữ ổn định qua phân trang, compaction, phát lại (replay), khởi động lại và kết nối lại, vì chúng là trạng thái ánh xạ bền vững thông thường được khôi phục qua đường dẫn chung. Các race điều kiện do sắp xếp lại thứ tự xuyên luồng vốn không thể tồn tại về mặt cấu trúc, chứ không phải bị chặn bởi hàng rào.

Tỷ lệ chiếm dụng là giá trị gần đúng theo nghĩa đã ghi ở trên. Vì cả hai trường đều bền vững, nó khả dụng ngay sau khi khôi phục hoặc kết nối lại; cái giá là nó mô tả request cuối cùng đã được ghi log, chứ không phải ranh giới hiện tại chính xác.

Mỗi log phiên sẽ có thêm một bản ghi `request/context` nhỏ cho mỗi lần thay đổi route hoặc thay đổi dung lượng đã công bố. Ánh xạ token-meter là chủ sở hữu chính thức duy nhất của ngữ nghĩa mức dùng ánh xạ phiên bền vững; TUI không gắn seam ánh xạ chung, nên vẫn giữ map theo-từng-bước thời gian thực của riêng mình, còn fixture trình duyệt độc lập (dữ liệu chuẩn bị trước cho test) sẽ phản chiếu đơn vị đó. ApiProxy không mang bất kỳ mã dành riêng cho token nào, không sở hữu cache chỉ số theo-từng-phiên, và không thực hiện đo lường. Trình duyệt chỉ giữ hai giá trị ánh xạ chung, không giữ dữ liệu đo lường cục bộ theo kết nối; các gia tăng văn bản dạng stream vẫn không buộc dòng thống kê phải tính toán lại.
