# Agent Note: Lỗi kết thúc của luồng LLM

Status: implemented

[English](2026-07-29-terminal-llm-stream-failures.md) | Tiếng Việt

Ghi chú này chỉ thay thế cơ chế về danh tính của lỗi được ném ra và sidecar cục bộ theo lời gọi trong [Khôi phục yêu cầu LLM (mô hình ngôn ngữ lớn) có giới hạn](2026-06-21-bounded-llm-request-recovery.md) và [Khôi phục tràn context sau lời gọi](2026-07-10-after-call-compaction-pressure-and-overflow-recovery.md). Hai ghi chú trên vẫn tiếp tục quy định các dữ kiện lỗi có cấu trúc, chiến lược retry, các lần thử bền vững và khôi phục compaction.

## Problem

Lỗi của adapter từng có hai cách biểu diễn công khai: exception được ném ra từ việc chọn, phân phối, khởi tạo iterator hoặc lặp, và `finish { kind: 'error' | 'aborted' }` nằm trong luồng. `LlmRuntime` sẽ đánh dấu đối tượng được ném trong một sidecar khóa theo luồng, giúp agent loop (vòng lặp tác tử) phân biệt nó với lỗi của middleware và của bên tiêu thụ. Bên tiêu thụ vẫn phải bọc catch quanh vòng lặp, kiểm tra signal, ghi log từng phân mảnh và lắp ráp; do đó tính đúng đắn phụ thuộc vào việc chứng minh câu lệnh nào đã ném lỗi, rồi truy vấn metadata gắn vào chính iterable được trả về.

Chiến lược retry cũng dùng cách quy kết gián tiếp như vậy. Dù `prepareCall()` đã nắm bắt đăng ký dịch vụ, chiến lược vẫn phải tra cứu qua sidecar của luồng sau khi phân phối. Vì thế, các route được phục vụ bởi lớp bao và các route được phục vụ bởi adapter dùng chung một API truy vấn không minh bạch, dù thẩm quyền của hai bên là khác nhau.

## Decision

`LlmRuntime` là ranh giới chuẩn hóa cho một lần thử của adapter. Nó chỉ bắt lỗi ở khâu chọn adapter cuối cùng, phân phối đồng bộ, khởi tạo iterator và `next()`, chuyển giá trị được ném thành `LlmFailure` bất biến, rồi phát ra một `finish` kết thúc. Việc bên gọi hủy hoặc lỗi `ABORTED` sẽ chọn lý do kết thúc aborted; các lỗi adapter khác chọn lý do kết thúc error. Adapter cũng có thể trực tiếp phát ra bất kỳ lý do kết thúc nào trong hai lý do đó.

Khối catch thuộc về adapter kết thúc trước khi mỗi phân mảnh được yield. Lỗi từ middleware `llm/stream`, các lời gọi lồng nhau, dọn dẹp adapter, bên tiêu thụ phân mảnh, ghi log, kiểm tra signal và lắp ráp vẫn được ném ra như khiếm khuyết hoặc lỗi vòng đời; chúng tuyệt đối không đi vào luồng khôi phục yêu cầu mô hình. Lỗi truyền tải sau một phần delta có thể để lại khối chưa đóng, nên invariant của luồng chỉ cho phép tồn tại khối chưa đóng khi lý do kết thúc của finish kết thúc là error hoặc aborted. Sẽ không lắp ráp assistant message hay tool call từ những đầu ra không hoàn chỉnh đó.

`PreparedLlmCall` công khai chiến lược retry bất biến được nắm bắt cùng cấu hình và đăng ký của nó. Việc dùng lại handle dùng-một-lần và cấu hình không khớp vẫn là lỗi lạm dụng `INVALID_PREPARED_CALL` đồng bộ. Các route được phục vụ hoàn toàn bởi middleware `llm/stream` không có đăng ký đã chuẩn bị, nên cũng không có chiến lược dịch vụ.

Agent loop chỉ tiêu thụ một cách biểu diễn lỗi duy nhất. Nó không còn dùng catch phân loại, mà lặp trực tiếp và ghi lại phân mảnh, kiểm tra finish kết thúc, rồi chuyển dữ kiện lỗi trong đó cùng chiến lược đã chuẩn bị cho `agent/request-error`. Các API sidecar công khai `isLlmAdapterFailure`, `llmFailureOf` và `llmRetryPolicyOf` không còn tồn tại.

## Alternatives considered

**Giữ lại việc đánh dấu lỗi cục bộ theo lời gọi.** Cách này bảo toàn danh tính của đối tượng được ném, nhưng buộc mỗi bên tiêu thụ phải bọc catch quanh một vùng chứa cả phần việc dễ lỗi của chính mình, và khiến việc phân loại phụ thuộc vào danh tính của lớp bao iterable. Đối tượng lỗi gốc không thể đóng vai trò lâu dài trong khôi phục; chính các dữ kiện đã chuẩn hóa mới là giá trị ranh giới hữu ích.

**Yêu cầu mọi adapter phát ra phân mảnh lỗi và cấm ném exception.** Iterator thư viện, transport và cơ chế phân phối của JavaScript vẫn có thể ném lỗi. Bắt mỗi adapter nhân bản cùng một ranh giới catch sẽ gây trùng lặp trách nhiệm, và cũng không bảo vệ được bên tiêu thụ trực tiếp của `LlmRuntime` khỏi những hiện thực khiếm khuyết.

**Bắt mọi lỗi lặp trong agent loop.** Nếu không tái lập ánh xạ sidecar từ đối tượng luồng tới lời gọi adapter đã tạo ra nó, loop không thể phân biệt đáng tin cậy giữa lỗi của bên cung cấp với lỗi của middleware, của việc ghi thêm vào session, của việc hủy hay của việc lắp ráp. Việc phân loại phải thuộc trách nhiệm của nơi khởi tạo lời gọi adapter.

**Trả về `Result` trước khi bắt đầu stream.** Kết quả trước khi stream không thể biểu diễn lỗi truyền tải xảy ra sau khi đã có đầu ra một phần, trừ khi thêm một vòng đời phản hồi thứ hai. Phân mảnh kết thúc hiện có đã đủ để biểu diễn kết quả của cả lần thử sớm lẫn muộn.

## Consequences

Mọi bên tiêu thụ `LlmRuntime.stream()` đều nhận lỗi chạy adapter thông qua một giao thức kết thúc có kiểu, còn lỗi lập trình và lỗi vòng đời vẫn giữ ngữ nghĩa exception thông thường. Việc khôi phục từ bỏ danh tính chính xác của đối tượng được ném, chỉ phơi bày các dữ kiện độc lập với bên cung cấp, tách rời khỏi đối tượng gốc. Dịch vụ luồng gánh thêm một chút công việc xử lý adapter, nhưng bên tiêu thụ đã xóa được khối catch dùng để xác định adapter nào ném exception, cũng như xóa được metadata khóa theo luồng. Lời gọi đã chuẩn bị mang chiến lược một cách tường minh, còn các route được phục vụ hoàn toàn bởi middleware thì rõ ràng là không có chiến lược.
