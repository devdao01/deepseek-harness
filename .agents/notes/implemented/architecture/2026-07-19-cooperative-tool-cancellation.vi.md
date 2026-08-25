# Agent Note: Hủy tool hợp tác tại ranh giới registry

Status: implemented

[English](2026-07-19-cooperative-tool-cancellation.md) | Tiếng Việt

## Vấn đề

Mỗi lời gọi tool đã gõ kiểu (typed) cần một signal hủy do phía gọi nắm giữ. `ToolExecutionInput.signal` tùy chọn cho phép phía gọi trực tiếp không nhận quyền sở hữu, khiến `exec.signal` trong mỗi thân tool trở thành giá trị tùy chọn, đồng thời cám dỗ registry cung cấp signal dự phòng không thể biểu diễn vòng đời phía gọi thật sự.

Từng giai đoạn của pipeline cũng có nhu cầu về khả năng thay đổi (mutability) khác nhau. Implementation tool, chính sách trước, chính sách sau và observer kết quả chỉ mượn trạng thái hủy, còn lớp bọc điều phối bao quanh (surrounding dispatch wrapper) phải tạm thời thay thế signal để thêm deadline hoặc scope hủy theo từ vựng khác. Một kiểu công khai có thể thay đổi duy nhất hoặc trao quyền sửa đổi cho quá nhiều giai đoạn, hoặc ngăn cản kiểu tổ hợp này.

Việc hủy có thể xảy ra trước chính sách, trong lúc approval, trong lúc chờ điều phối bao quanh, sau khi thân tool đã khởi động, hoặc trong lúc chính sách sau đang chờ. Một kết quả `ABORTED` đơn nhất không thể giúp phía tiêu thụ kết quả bền vững phán đoán liệu thân tool có thể đã tạo ra side effect hay chưa. Việc để promise tool đua (race) với việc hủy cũng không phải phương án dự phòng an toàn, vì sau khi registry báo cáo hoàn tất, công việc cùng tiến trình bị bỏ rơi vẫn tiếp tục chạy.

## Quyết định

`ToolExecutionInput.signal` là `AbortSignal` bắt buộc và chỉ đọc, do đó `ToolExecution.signal` và `ToolRunContext.signal` cũng đều bắt buộc và chỉ đọc. Mỗi phía gọi đã gõ kiểu cung cấp tường minh signal do chính nó nắm giữ; registry không cung cấp overload, controller mặc định, sentinel không bao giờ hủy, hay đường thực thi tiện lợi nào khác.

`ToolDefinition.execute(args, exec)` giữ nguyên chữ ký hiện có. `defineTool()` sẽ suy luận context `exec.signal` thành `AbortSignal` bắt buộc, do đó mỗi tool TypeScript đã đăng ký đều có thể quan sát hoặc chuyển tiếp việc hủy mà không cần type assertion. Mọi phía gọi trực tiếp bên thứ nhất và việc điều phối lồng nhau của Code Mode đều truyền tường minh signal của thao tác hiện tại.

Registry tin tưởng quy ước cùng tiến trình đã gõ kiểu này. Nó không xác thực `AbortSignal` tại runtime, cũng không thêm test input đối kháng (hostile) cho signal thiếu hoặc dị dạng. Việc xác thực vẫn nằm ở ranh giới parser và cấu hình, JSON mô hình và tool, lưu trữ bền vững và file, worker, tiến trình và protocol; JavaScript không có kiểu vi phạm interface TypeScript không được hưởng quy ước tương thích.

### Khả năng thay đổi do giai đoạn pipeline quyết định

`ToolDispatchExecution` giống hệt `ToolExecution`, chỉ khác ở chỗ `signal` bắt buộc của nó có thể sửa đổi. Chỉ waterfall (chuỗi sự kiện dạng thác) `tools/execute` nhận kiểu này. Chính sách trước, chính sách sau, observer kết quả, guard và implementation tool nhận view chỉ đọc của đối tượng runtime có thể thay đổi riêng tư của registry.

Lớp bọc điều phối bao quanh có thể thay thế `exec.signal` trong lúc ủy quyền, nhưng không thể xóa nó hay gán `undefined` qua hệ thống kiểu. Registry bắt (capture) signal bắt buộc của phía gọi bên ngoài đối tượng có thể thay đổi, hợp nhất (fuse) mỗi lần thay thế của lớp bọc với signal của phía gọi trước khi gọi thân tool, gỡ bỏ listener chỉ thuộc về lần điều phối này sau khi hoàn tất, và khôi phục vô điều kiện signal thượng nguồn (upstream) bắt buộc.

### Code hủy ghi lại việc điều phối đã xảy ra hay chưa

`dsh-tools` export `TOOL_ABORTED = 'ABORTED'` và `TOOL_ABORTED_BEFORE_DISPATCH = 'ABORTED_BEFORE_DISPATCH'`. Registry ghi lại việc thân tool đã được gọi ngay trước thời điểm gọi `ToolDefinition.execute()`.

`ABORTED_BEFORE_DISPATCH` mang `{ name: 'AbortError' }` và văn bản mô hình nhìn thấy `Error: tool call aborted before dispatch`. Kết quả này được dùng bất cứ khi nào việc hủy ngăn thân tool được gọi, bao gồm: đã bị hủy khi vào, bị hủy trong lúc chính sách trước hoặc approval, signal của lớp bọc đã bị hủy, kết quả thành công mà lớp bọc trả về trước khi ủy quyền bị việc hủy của phía gọi vượt trước, và các lời gọi cùng batch bị agent loop (vòng lặp smart agent) bỏ qua sau khi turn bị hủy.

`ABORTED` mang văn bản mô hình nhìn thấy `Error: tool call aborted`, và chỉ được dùng sau khi thân tool đã được gọi, bao gồm việc hủy xảy ra trong lúc lớp bọc điều phối bao quanh hoặc listener chính sách sau chờ sau khi thân tool hoàn tất. Việc từ chối, lỗi lớp bọc, lỗi tool hoặc lỗi chính sách sau đều cụ thể hơn việc hủy chung. Timeout tự sở hữu của timeout-policy vẫn là `TOOL_TIMEOUT`, context được đính kèm trễ trước khi kết quả thành công bị việc hủy thay thế vẫn được giữ lại.

### Đã hủy khi vào sẽ short-circuit sau khi hiện thực hóa

Registry tạo call token trước, chụp snapshot callback `finalizeContent` tùy chọn của định nghĩa tool hiển thị, và snapshot cùng đóng băng tham số không mất dữ liệu. Ngay cả khi signal của phía gọi đã bị hủy, việc hiện thực hóa tham số thất bại vẫn được ưu tiên trả về trước. Trước khi xử lý nội dung cuối cùng, registry cũng snapshot không mất dữ liệu kết quả ứng viên, và chuyển lỗi snapshot kết quả thành lỗi thông thường, nhờ đó callback này vẫn có thể bảo đảm bất biến thức (invariant) nội dung của nó luôn đúng. Sau khi hiện thực hóa tham số thành công, signal đã bị hủy khi vào sẽ bỏ qua `tools/pre-execute`, approval, `tools/execute`, `tools/post-execute` và thân tool, sau đó callback chỉ xử lý nội dung này sẽ xử lý `ABORTED_BEFORE_DISPATCH` trước, rồi mới phát hành duy nhất một lần `tools/result` có thẩm quyền đã đóng băng.

### Công việc đã khởi động vẫn phải dừng hoàn toàn

Một khi thân tool đã khởi động, registry sẽ chờ nó hoàn tất. Việc hủy tới được thân tool qua signal đã hợp nhất, nhưng registry sẽ không đua (race) với promise của nó hay bỏ rơi promise đó. Implementation hợp tác sẽ tự dừng công việc hoặc tiếp tục chuyển tiếp việc hủy, và hoàn tất sau khi công việc nó nắm giữ đã dừng hoàn toàn; implementation cùng tiến trình không hợp tác có thể khiến registry chờ vô thời hạn. Tầng tiến trình, worker, network và provider vẫn chịu trách nhiệm về cơ chế chấm dứt riêng của chúng.

Quyết định này chỉ yêu cầu ranh giới lời gọi tool mang theo signal hủy. Việc các năng lực bất đồng bộ mà thân tool có thể vươn tới cũng phải nhận signal thuộc về một lần di chuyển khác, xem [Bắt buộc hủy qua seam năng lực tool](../../proposed/architecture/2026-07-19-required-cancellation-through-tool-capability-seams.md) đang được đề xuất.

## Xác minh

[`execution-signal-types.spec.ts`](../../../../packages/core/tools/tests/execution-signal-types.spec.ts) chứng minh kiểu signal chính xác bắt buộc, view chỉ đọc cho observer và tool, view mà lớp bọc điều phối bao quanh có thể thay thế nhưng không thể xóa, và việc suy luận của `defineTool()`. [`tools.spec.ts`](../../../../packages/core/tools/tests/tools.spec.ts) bao phủ việc hiện thực hóa và bỏ qua giai đoạn khi đã hủy lúc vào, race điều kiện giữa chính sách và lớp bọc, việc phân loại lời gọi thân tool, hợp nhất signal của phía gọi, độ ưu tiên lỗi, giữ lại context, và dừng hoàn toàn. [`tool-calls.spec.ts`](../../../../packages/core/agent-loop/tests/tool-calls.spec.ts) và [`contract-regressions.spec.ts`](../../../../packages/core/agent-loop/tests/contract-regressions.spec.ts) bao phủ việc bổ sung kết quả bền vững cho các lời gọi cùng batch chưa được điều phối. [`code-mode.spec.ts`](../../../../packages/core/tools/tests/code-mode.spec.ts) và test tích hợp bên thứ nhất bao phủ việc chuyển tiếp tường minh, [`timeout-policy.spec.ts`](../../../../packages/guard/timeout-policy/tests/timeout-policy.spec.ts) giữ nguyên việc quy trách nhiệm timeout.

Không có test registry nào có thể chứng minh rằng bất kỳ code bên thứ ba cùng tiến trình tùy ý nào sẽ quan sát signal hay dừng trong thời gian hữu hạn. Test của từng năng lực vẫn cần chứng minh việc hủy và dừng hoàn toàn tại ranh giới có side effect tương ứng.

## Các phương án thay thế từng cân nhắc

**Giữ signal tùy chọn và sinh giá trị dự phòng.** Không chấp nhận, vì signal dự phòng do registry nắm giữ không đại diện cho vòng đời của bất kỳ phía gọi nào, và cũng giữ lại trường hợp thiếu mà hệ thống kiểu vốn dĩ nên ngăn chặn.

**Xác thực `AbortSignal` tại runtime.** Không chấp nhận, vì đây là ranh giới cùng tiến trình đã gõ kiểu, không phải ranh giới serialize. Kiểm tra runtime chỉ lặp lại quy ước tĩnh, vẫn không thể cưỡng chế implementation sử dụng signal một cách hợp tác.

**Thêm metadata `supportsCancellation`, kiểm tra số lượng tham số callback, hoặc lint sử dụng signal.** Không chấp nhận, vì các phương pháp này đều không thể chứng minh công việc bất đồng bộ sẽ quan sát hoặc chuyển tiếp việc hủy đúng cách. Việc signal có sẵn thuộc về quy ước kiểu; hành vi cụ thể vẫn do tool và năng lực chịu trách nhiệm.

**Phơi bày cùng một kiểu thực thi có thể thay đổi cho mọi giai đoạn.** Không chấp nhận, vì observer và implementation tool chỉ cần mượn signal. Việc chia kiểu theo giai đoạn giới hạn quyền thay thế vào đúng nơi pipeline sở hữu thao tác đó.

**Cấm lớp bọc điều phối bao quanh thay thế signal.** Không chấp nhận, vì deadline và scope thao tác lồng nhau cần signal được suy dẫn theo từ vựng. Việc bắt và hợp nhất signal của phía gọi vừa giữ được khả năng tổ hợp, vừa không cho phép cắt đứt việc hủy của phía gọi.

**Để promise tool đua với việc hủy.** Không chấp nhận, vì cách này sẽ báo cáo hoàn tất trong khi side effect vẫn có thể đang tồn tại, vi phạm [quy tắc dispose (giải phóng tài nguyên) phải đạt trạng thái dừng hoàn toàn](../../../../docs/defensive-patterns.md#dispose-must-reach-quiescence-not-just-request-it).

## Hệ quả

- TypeScript sẽ từ chối mọi `ToolExecutionInput` thiếu `signal`, việc tool hay observer sửa signal chỉ đọc, và nỗ lực xóa signal của lớp bọc điều phối bao quanh.
- Phía tiêu thụ kết quả bền vững có thể phân biệt lời gọi mà thân tool có thể đã tạo ra side effect (`ABORTED`) với lời gọi chưa từng vào thân tool (`ABORTED_BEFORE_DISPATCH`).
- Theo nguyên tắc tiền phát hành (pre-release) của repo, thay đổi này cố ý mang tính đột phá (breaking); không giữ overload tương thích hay hành vi dự phòng runtime.
- Tool hợp tác sẽ dừng kịp thời và đạt trạng thái dừng hoàn toàn; implementation bỏ qua signal sẽ biểu hiện thành lời gọi vẫn đang chờ.
- Interface năng lực downstream giữ nguyên không đổi, cho tới khi Agent Note đề xuất liên quan được chấp nhận và implement.
