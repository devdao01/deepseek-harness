# Agent Note: Năng lực đặt câu hỏi ask-user

Status: implemented
Archived: 2026-07-27

[English](2026-06-25-ask-user-question.md) | 中文

## Vấn đề

agent (tác tử) đôi khi không thể tiếp tục thực thi một cách an toàn chỉ dựa vào inference (suy luận) của model: nó cần con người chọn hướng đi, xác nhận một hành động rủi ro hoặc mặc định, hoặc cung cấp thông tin còn thiếu. Trước khi có thay đổi này, cách duy nhất để lấy câu trả lời là model đặt câu hỏi trong văn bản assistant rồi dừng lại, việc này làm gián đoạn vòng lặp gọi công cụ (tool) bình thường: agent không có cách tạm dừng có cấu trúc, không có metadata tùy chọn cho UI sử dụng, không có hệ thống phân loại abort/error, và cũng không có cách để các front-end không phải stdio hiển thị câu hỏi một cách nhất quán.

Đây là một năng lực hướng đến người dùng, nhưng nó cũng vượt qua ranh giới package. Công cụ hướng đến model cần một bộ từ vựng yêu cầu độc lập với provider (nhà cung cấp); mỗi giao diện UI cần quyết định cách hiển thị và thu thập câu trả lời; agent loop (vòng lặp tác tử) nên giữ nguyên không đổi, vì bản thân việc gọi công cụ đã có đúng hình dạng bất đồng bộ (asynchronous).

## Quyết định

Giới thiệu `dsh-user-interaction` như một package interface (giao diện) độc lập với provider cho `ctx.userInteraction`, đặt cùng với consumer (bên tiêu thụ) hướng đến model là `dsh-tool-ask-user` dưới `packages/ui`. Việc nhóm này là có chủ đích: đặt câu hỏi cho con người là một tính năng sản phẩm được UI hỗ trợ, không thuộc về phần lõi (core) không có provider. seam (điểm nối năng lực) vẫn sở hữu một bộ từ vựng request/response/error ổn định, còn giao diện sản phẩm UI cung cấp provider cụ thể để thu thập câu trả lời. Công cụ này đăng ký `ask_user_question`, chuyển tiếp `{ questions, agent, signal }`, và trả về câu trả lời có cấu trúc do provider tính toán như kết quả của tool.

Bộ từ vựng yêu cầu hướng đến model được cố ý căn chỉnh theo schema khảo sát sản phẩm: `ask_user_question({ questions: [{ id, question, header?, options?: [{ label, description? }], multi_select? }] })`. `id` do phía cung cấp câu hỏi đặt và được trả về lại trong kết quả, giúp các yêu cầu theo lô (batch) có thể định tuyến mà không cần dựa vào nội dung câu hỏi. `label` vừa là văn bản hiển thị cho người dùng, vừa là giá trị được chọn trả về cho model; không có `value` riêng, không có `recommended`, không có `allow_custom`, và cũng không có alias `desc`.

Provider trả về `{ answers: [{ id, selected, custom? }] }`. `selected` luôn là một mảng các label của lựa chọn đã chọn, do đó câu trả lời đơn lựa chọn và `multi_select` dùng chung một hình dạng kết quả. `custom` mang câu trả lời "khác" dạng văn bản tự do; câu hỏi không có option sẽ trực tiếp thu thập `custom`. Khi `custom` tồn tại, nó ghi đè lên bất kỳ option nào đã chọn, `selected` sẽ rỗng. Các provider hỗ trợ hoàn thành một phần dùng hình dạng `{ id, selected: [] }` sẵn có để biểu thị một mục bị bỏ qua có chủ đích, mà không cần mở rộng từ vựng kết quả tool.

`UserInteractionError` kế thừa `HarnessError`, do đó các lỗi như `NO_PROVIDER`, `ASK_ABORTED`, hoặc thiếu chủ sở hữu yêu cầu sẽ thoát ra dưới dạng tool error `{ name, code }` có thể định tuyến bằng máy thông qua `ctx.tools.execute()`. Điều này nhất quán với hệ thống phân loại lỗi có cấu trúc, cho phép model hoặc plugin bọc ngoài phân biệt "người dùng hủy" với một exception ném ra thông thường.

## Ánh xạ UI

`dsh web` gắn `dsh-client-ui-question`: phía host của nó cho phép sản phẩm Web tải chọn lọc công cụ hướng đến model, còn phía trình duyệt đăng ký một mục `question` trong slot vùng nhập liệu có tên riêng do conversation sở hữu. `createApiProxy` triển khai provider Web bằng một bảng pending trong tiến trình, khóa theo rpcId sinh ở phía host. Nó đăng ký mục đang chờ trước, sau đó phát broadcast `question/requested`; mỗi lần mux mở lại sẽ phát lại với cùng id; xác thực session và lô câu trả lời đầy đủ trước khi chấp nhận; và phát broadcast `question/resolved` sau khi trả lời, hủy, abort, hoặc giải phóng tài nguyên. Việc chấp nhận sẽ xóa mục đó một cách đồng bộ, do đó phản hồi hợp lệ đầu tiên sẽ thắng, các phản hồi trùng lặp hoặc đến muộn sẽ trả về `not-pending`.

Vùng nhập liệu Web hiển thị một câu hỏi tại một thời điểm, đồng thời giữ mỗi yêu cầu ở tầng đối tượng session. Nó hỗ trợ đơn lựa chọn, đa lựa chọn, câu hỏi không có option, hoặc câu trả lời tùy chỉnh tường minh, văn bản mô tả và nhãn gợi ý trực quan, nhưng không tự động chọn mục được gợi ý. Chọn một mục đơn lựa chọn sẽ ngay lập tức chuyển sang mục tiếp theo; khi tất cả các mục đã được trả lời hoặc bỏ qua tường minh, nhấn Enter để gửi; trong lúc IME đang gõ chữ, nhấn Enter chỉ xác nhận ứng viên nhập liệu. Footer chỉ bỏ qua mục hiện tại và giữ lại các bản nháp trước đó; đóng control sẽ từ chối toàn bộ lời gọi tool với `ASK_CANCELLED`. Vùng nhập liệu thông thường chỉ khôi phục sau khi frame resolved của host loại bỏ mục đang chờ.

`dsh-tui` render mỗi câu hỏi thành một lớp phủ (overlay) trên bàn phím, hiển thị mô tả option, hỗ trợ đơn lựa chọn, đa lựa chọn và câu trả lời tùy chỉnh dạng tự do, và từ chối các câu hỏi đang chờ khi abort, provider dispose (giải phóng tài nguyên), hoặc terminal đóng lại. Cả yêu cầu theo lô và yêu cầu đồng thời đều được xếp hàng đợi, đảm bảo tại một thời điểm chỉ có một lớp phủ chiếm focus bàn phím.

Từng có một ánh xạ ACP (Agent Client Protocol) elicitation ở tầng bridge hoặc editor UI; [ACP như một giao thức chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md) đã loại bỏ ánh xạ thứ ba này.

## Các phương án thay thế đã cân nhắc

**Văn bản assistant theo sau bởi một lượt dừng lại.** Model có thể đặt câu hỏi cho người dùng bằng văn bản assistant thuần túy rồi dừng lại. Cách này làm mất metadata option có cấu trúc, UI không có cách nào độc lập với provider để render lựa chọn, và câu trả lời tiếp theo của con người chỉ có thể đến dưới dạng prompt user mới, chứ không phải như kết quả của thao tác cần câu trả lời đó.

**Package ask-user do core sở hữu.** Triển khai ban đầu đặt seam và tool hướng đến model lần lượt ở `packages/core` và `packages/ui`, nhưng cả hai đều mô tả cùng một tính năng tương tác người-máy được UI hỗ trợ. seam vẫn độc lập với provider, nhưng nó không phải là hạ tầng lõi không có provider giống như session, tool, hay agent registry. Đặt `dsh-user-interaction` và `dsh-tool-ask-user` cùng nhau dưới `packages/ui` giúp việc phân chia package khớp với ranh giới sản phẩm: ứng dụng và bridge cung cấp provider cho câu trả lời của con người, ứng dụng stdio tải chọn lọc công cụ hướng đến model.

**Dùng permission request để xử lý câu hỏi chung.** Permission request là ủy quyền cho việc thực thi tool; `ask_user_question` là thu thập thông tin với câu trả lời tự do tùy chọn. Tái sử dụng kênh permission sẽ làm lẫn lộn hai khái niệm sản phẩm khác nhau.

**Nguyên thủy tạm dừng ở cấp vòng lặp.** agent loop đã biết cách chờ một lời gọi tool và khôi phục từ kết quả tool. Thêm một nhánh đặc biệt mới ở cấp vòng lặp sẽ lặp lại hình dạng bất đồng bộ này và buộc mỗi cách triển khai vòng lặp phải hiểu một mối quan tâm thuộc về UI.

## Hệ quả

Tính năng này trao cho model một nguyên thủy tạm dừng mạnh mẽ, do đó việc dẫn dắt bằng prompt rất quan trọng. Mô tả tool nói với model: đặt câu hỏi ngắn gọn, sử dụng option bất cứ khi nào có thể. Chiến lược sản phẩm sau này có thể bọc `tools/execute` để giới hạn khi nào tool khả dụng, nhưng vòng lặp không nên xử lý đặc biệt cho nó.

`dsh-user-interaction` và `dsh-tool-ask-user` đều nằm trong `packages/ui` vì chúng cùng tạo thành một năng lực tương tác người-máy hướng đến sản phẩm. `agent-core` không tải tool hay provider. `dsh-tui-demo` tải chọn lọc seam, provider TUI, và tool hướng đến model. `dsh web` khởi động seam/provider ở host runtime, và phơi bày tool đó thông qua plugin question Web đã chọn. Ứng dụng tự động hóa ACP không gắn cả seam lẫn tool này.

## Kiểm thử

Độ phủ unit test cố định các kịch bản sau: đăng ký/giải phóng provider, từ chối provider trùng lặp, abort trước khi provider sẵn sàng, từ chối câu hỏi rỗng, tool error có cấu trúc thoát ra qua `ctx.tools.execute()`, câu trả lời theo lô, câu trả lời đa lựa chọn, câu trả lời tùy chỉnh, bỏ qua tường minh theo từng mục, và schema hướng đến model (bao gồm việc loại bỏ `value`, `recommended`, `allow_custom` và `desc`). Test TUI bao phủ mô tả option, yêu cầu xếp hàng đợi, dọn dẹp khi đóng/abort, nhập liệu tự do không có option, lựa chọn không hợp lệ, đa lựa chọn trùng lặp và luồng câu hỏi theo lô. Test Web cố định việc phát lại id ổn định, xác thực phản hồi, quyết toán theo nguyên tắc phản hồi đầu tiên thắng, phân biệt việc hủy toàn bộ yêu cầu với việc chủ sở hữu abort đối với phản hồi trùng lặp và đến muộn, tiến tới mục tiếp theo sau đơn lựa chọn, gửi bằng Enter an toàn với IME, giữ lại việc bỏ qua theo từng mục, việc vùng nhập liệu tiếp quản, gửi theo lô có cấu trúc, và việc khôi phục vùng nhập liệu thông thường.
