# Agent Note: Kiểm thử snapshot ACP — ghi một lần / phát lại tất định

Status: implemented

[English](2026-06-19-acp-snapshot-tests.md) | Tiếng Việt

## Vấn đề

Kiểm thử đơn vị không bao phủ được tiến trình con agent (tác tử) hoàn chỉnh sau khi lắp ráp cùng định dạng giao thức tự động hóa ACP (Agent Client Protocol) của nó, còn kiểm thử với API thật thì không tất định và bị chặn bởi khóa API. Do đó, ngay cả khi kiểm tra độ bao phủ của kiểm thử đơn vị đã pass, phần đấu nối Loader, hành vi backend và output giao thức vẫn có thể hồi quy, như [postmortem về sự cố default export](../../../../docs/postmortem/0001-acp-default-export-drops-inject.md) đã chứng minh.

Yếu tố cản trở việc kiểm thử transcript (bản ghi văn bản) đầy đủ nằm ở mô hình: output của agent được điều khiển bởi LLM (mô hình ngôn ngữ lớn) không tất định, còn kiểm thử bị chặn bởi khóa API mà mỗi lần chạy đều gọi API thật thì vừa không tất định vừa không chạy được trong CI. Tầng kiểm thử này cần có đồng thời cả độ trung thực của lần chạy thật lẫn tính tất định của fixture (dữ liệu chuẩn bị sẵn cho kiểm thử).

## Quyết định

Kiểm thử snapshot khởi chạy ví dụ ACP thật, điều khiển giao thức stdio của nó bằng kịch bản tất định, rồi so sánh output đã chuẩn hóa với output kỳ vọng đã commit. Nhật ký phiên được ghi một lần từ API thật sẽ cung cấp dữ liệu cho toàn bộ các luồng mô hình về sau. Fixture chính là JSONL bền vững thông thường của sản phẩm.

### Fixture chính là JSONL phiên bền vững

Tệp `session.jsonl` của mỗi kịch bản đều được thu thập từ một lần chạy thật. Sự kiện `assistant/chunk` tái hiện luồng mô hình; các sự kiện tool, message và biên ghi lại hành vi của harness. Nhờ vậy, một sản phẩm phiên thông thường vừa đóng vai trò nguồn phát lại, vừa là output kỳ vọng về hành vi.

Mọi fixture định dạng phiên được commit vào repo đều dùng bố cục vật lý dạng đóng gói chuẩn tắc. Kịch bản bao phủ mọi loại dòng được suy ra một cách máy móc từ một bản ghi thật độc lập; kiểm thử yêu cầu nó phải chứa mọi loại dòng lưu trữ dạng đóng gói, và sau khi giải mã, hai fixture phải bằng nhau chính xác theo từng sự kiện; sau đó, việc phát lại thông thường và so sánh nhật ký sẽ chứng minh tiến trình sau khi lắp ráp có thể tiêu thụ và tái hiện bố cục đó.

### Phát lại suy ra kịch bản mô hình từ nhật ký

`llm-replay` chập mạch waterfall (chuỗi sự kiện waterfall) `llm/stream` vốn không phụ thuộc nhà cung cấp. `deriveReplayScript()` cắt các sự kiện `assistant/chunk` đã ghi tại phân mảnh `finish` kết thúc, và dùng thay đổi `(turn, step)` để từ chối lời gọi chưa kết thúc trước đó. `compaction/summary` mang `llmStreamCall: true` sẽ đóng góp một lời gọi tại vị trí của nó trong nhật ký bền vững: phần phát lại tái dựng biên khối chuẩn tắc từ `rawOutput`, giữ lại usage đã ghi (nếu có), và cung cấp một `stop` kết thúc. Cờ đánh dấu này phân biệt lời gọi cục bộ đó với bản tóm tắt theo mẫu hoặc bản tóm tắt từ xa; hai loại sau, dù có giữ `rawOutput`, cũng không dùng adapter của ngữ cảnh này.

### Mục phát lại trong bộ nhớ tuân thủ đầy đủ contract của LLM

`deriveReplayScript` sinh ra một tập `ReplayEntry`, tức các đơn vị trong bộ nhớ mà listener phát lại phục vụ theo vị trí:

```
{ kind: 'chunks', chunks: StreamChunk[] }
| { kind: 'throw', chunks: StreamChunk[], message: string, code: string }
| { kind: 'hang' }
```

Nhật ký suy ra các mục phân mảnh từ các luồng assistant đã kết thúc và từ những lời gọi compaction (nén) được đánh dấu tường minh. Các trường hợp ném lỗi trước khi luồng bắt đầu, treo, và lời gọi tới bộ tóm tắt bên ngoài không có biểu diễn phân mảnh cục bộ nào để tái dựng, nên những kịch bản này sẽ cung cấp `replay.override.json`. Mục throw có thể chứa phân mảnh tiền tố để mô phỏng lỗi xảy ra giữa chừng luồng. Việc ghi đè tường minh giúp tránh phải suy đoán hành vi adapter từ lý do kết thúc lượt vốn bị mất mát thông tin, hoặc từ output riêng lẻ của nhà cung cấp.

### Phát lại theo vị trí, mỗi lúc chỉ một luồng đang chạy

Việc phát lại diễn ra theo vị trí, nên mỗi kịch bản chỉ cho phép một luồng mô hình đang chạy. Snapshot cho phiên chạy song song sẽ cần các mục được đánh chỉ mục theo khóa yêu cầu. Thay đổi thứ tự lời gọi đòi hỏi phải ghi lại; khi fixture bị thiếu hoặc cạn kiệt thì báo lỗi ngay lập tức.

### Ghi thì thu thập nhật ký; phát lại không cần khóa API cần cấu hình không có nhà cung cấp

Chế độ ghi chạy kịch bản với adapter `llm-deepseek` thật cùng backend bền vững JSONL được cấu hình `persistenceCompression: 'none'`, rồi sao chép tệp `.jsonl` sinh ra vào thư mục kịch bản. Chế độ raw tường minh giúp fixture phát lại đã commit đọc được theo từng dòng, còn triển khai thông thường vẫn dùng giá trị nén mặc định của backend; các đoạn phân mảnh liên tiếp đủ điều kiện vẫn dùng dòng lưu trữ dạng đóng gói mặc định. Việc ghi nối theo từng sự kiện là bền vững, nhưng harness vẫn tắt tiến trình con một cách êm ái trước khi thu thập (đóng stdin → `await ctx.dispose()`) để đảm bảo sự kiện cuối cùng đã được xả ra. Bản thân `llm-replay` không thực hiện việc ghi — nó chỉ chịu trách nhiệm phát lại.

Việc phát lại dùng overlay `cordis.snapshot.yml` để thay adapter thật bằng `llm-replay`, đồng thời giữ nguyên tổ hợp thực tế. Việc ghi thì dùng cấu hình thông thường và thư mục gốc bền vững do harness cung cấp. Chế độ phát lại bỏ qua việc nạp `.env`, nên một khóa API vô tình tồn tại cũng không kích hoạt lời gọi thật. Xem [Agent Note về cấu hình một nguồn duy nhất](../../archived/testing/2026-07-04-single-source-acp-replay-config.md).

### Hai bề mặt: chuẩn hóa rồi so sánh

Lần chạy snapshot khẳng định **cả hai** bề mặt sau khi chuẩn hóa, vì bề mặt bên ngoài của harness là khác nhau:

1. **transcript stdout** — các phản hồi ACP JSON-RPC đã đóng khung và các cập nhật message mà client tự động hóa nhận được. Nó bắt các hồi quy về contract truyền tải, được so sánh với `stdout.expected.jsonl` đã commit.
2. **JSONL phiên được lưu lại**, sau khi chuẩn hóa thì so sánh với `session.jsonl`. Cùng một fixture vừa làm nguồn phát lại vừa làm nhật ký kỳ vọng. Nội dung chính của prompt và tool sẽ được làm sạch; mỗi loại request header được một kịch bản cố định phần chuỗi header còn lại. Theo mặc định, pin này sở hữu các tệp đi kèm dễ đọc chứa prompt và tool schema; khi toàn bộ chuỗi tương ứng giống hệt nhau, có thể chỉ định một pin khác làm nguồn cho một trong hai loại đó, nhờ vậy mỗi phiên bản tệp đi kèm khác nhau chỉ được commit một lần. Bộ bảo vệ fixture sẽ từ chối nội dung tệp đi kèm trùng lặp, còn quá trình ghi/làm mới sẽ từ chối bên tham chiếu dùng chung nào sinh ra byte khác biệt. Lý do ban đầu của việc cố định request header được giữ trong [Agent Note về cố định request header](../../archived/testing/2026-07-06-pin-request-header-content-in-one-scenario.md). Kịch bản Override chỉ suy ra hành vi mô hình từ tệp đi kèm của chính nó.

Hai bề mặt bổ sung cho nhau: stdout bao phủ định dạng giao thức tự động hóa đã tinh giản, còn JSONL bao phủ cấu trúc vòng lặp, tool và biên mà định dạng giao thức cố ý lược bỏ.

Việc chuẩn hóa sẽ thay thế phiên, cwd, id giao thức, dấu thời gian, đường dẫn và các giá trị dễ biến động theo tiến trình, đồng thời giữ lại số thứ tự tất định. Quá trình ghi và làm mới còn lưu workspace được sinh ra cùng các bí danh do hệ thống tệp phân giải thành `{{cwd}}` trong fixture phát lại, để thư mục gốc tạm của nền tảng và basename ngẫu nhiên không ảnh hưởng tới kết quả ghi; các đường dẫn tạm viết tay và giá trị cwd nằm dưới `workspaceParent` tường minh vẫn giữ nguyên giá trị nguyên văn. Kịch bản giới hạn việc dùng bash thật ở các lệnh ổn định. Output kỳ vọng của stdout vẫn là JSONL đúng định dạng giao thức, mỗi dòng gốc đều phải phân tích được thành JSON. Việc cập nhật snapshot Vitest thông thường chỉ ghi output kỳ vọng của stdout; việc ghi fixture phát lại do các chế độ `record` và `refresh` tường minh đảm nhiệm.

### Cách ly: hiện dựa vào chuẩn hóa, sau này có thể thêm sandbox

Tính tất định của tool đến từ cwd được sinh ra, môi trường đã làm sạch, shell mới không phải login shell, tập lệnh bị giới hạn và việc chuẩn hóa. cwd mặc định là thư mục tạm của nền tảng; khi thư mục tạm là gốc chính sách luôn ghi được còn hành vi lại cần một vị trí dự án riêng, kịch bản có thể cung cấp thư mục cha của nó. Các lần chạy phát lại song song đều có cwd riêng, thư mục bền vững riêng và thư mục gốc spill có độ dài cố định phân biệt theo khóa kịch bản, nhờ đó thao tác dọn dẹp của kịch bản này không thể xóa mất phần khôi phục output đầy đủ đang diễn ra của kịch bản khác, đồng thời ngân sách xem trước đường dẫn thật vẫn ổn định. Tầng này không tuyên bố cung cấp cách ly ở mức OS. Nếu cần mức mạnh hơn, một trình thực thi sandbox có thể thay thế backend cục bộ thông qua [capability seam](../architecture/2026-06-13-capability-seams.md) sẵn có.

### Plugin phát lại là một package độc lập

`@deepseek-ai/dsh-llm-replay` là một package hỗ trợ, không phải mã keo cục bộ của ví dụ. Nó thay thế adapter thật bằng cách chập mạch `llm/stream` với luồng được tái dựng từ JSONL, và việc đặt nó ở cấp package khiến logic phát lại nằm dưới cổng kiểm soát bao phủ thông thường.

### Hai lệnh con, phát lại nằm trong cổng mặc định

`pnpm run test:snapshot` phát lại fixture đã commit mà không cần khóa API; `test:snapshot:record` dùng API thật và ghi đè nhật ký phiên đã thu thập cùng output kỳ vọng của stdout. Chính cổng không cần khóa đó sẽ phát hiện các JSONL trong repo qua bản ghi header `session`, và từ chối mọi fixture khác với biểu diễn đóng gói chuẩn tắc của codec dùng chung. Khi thiếu fixture, lỗi được báo rõ ràng. Mỗi kịch bản đều gồm `input.json`, `stdout.expected.jsonl` và `session.jsonl`; trường hợp không gọi mô hình thì dùng nhật ký chỉ có bản ghi header. Chỉ những kịch bản được đánh dấu `overridden` mới cần `replay.override.json`, vì một khi tệp này tồn tại thì nó sẽ thay thế phần phát lại được suy ra. Bộ bảo vệ fixture sẽ từ chối các tệp bị thiếu, không khớp và mồ côi. Cả hai lệnh đều nhận bộ lọc kịch bản.

## Các phương án đã cân nhắc

- **Viết tay `llm.json` chứa phân mảnh mô hình** — bản nháp ban đầu; việc tái sử dụng nhật ký phiên thật khiến fixture trở thành sản phẩm thực sự của hệ thống thay vì một mock dựng tay, đồng thời để nó kiêm luôn vai trò output kỳ vọng về hành vi.
- **Bắt buộc cung cấp override phát lại cho mọi bản tóm tắt compaction** — bác bỏ: sự kiện tóm tắt bền vững đã cố định vị trí, output đầy đủ và usage tùy chọn của lời gọi cục bộ thành công. Cờ đánh dấu lời gọi cục bộ tường minh giữ được fixture một nguồn duy nhất này mà không phải bịa ra lời gọi cho bộ tóm tắt theo mẫu hay bộ tóm tắt từ xa.
- **Thư viện ghi HTTP ở mức byte (Polly/nock/MSW)**: bác bỏ. Chúng gắn chặt với adapter, xử lý SSE (Server-Sent Events) dạng streaming thì vụng về, và nằm ở tầng thấp hơn đối tượng được kiểm thử.
- **Tổng hợp mục ném lỗi/hủy từ `turn/end {kind:'error'|'aborted'}`**: bác bỏ. Cách này sẽ gắn `llm-replay` với ngữ nghĩa đóng lượt nằm bên trong loop, và lý do trong `turn/end` thì mất mát thông tin (không phân biệt được lỗi 401 được ném ra với finish-error); tệp đi kèm `replay.override.json` tường minh là một seam rõ ràng hơn.
- **Nhân đôi hai tệp đi kèm request header bên cạnh mỗi pin theo loại**: bác bỏ. Tổ hợp prompt và tool schema biến đổi độc lập với nhau, nên chỉ cần một component dùng chung thay đổi là các tệp giống hệt nhau đến từng byte trong những pin theo loại không liên quan cũng sẽ phát sinh thay đổi vô nghĩa. Nguồn tách theo component tường minh cho phép giữ lại một pin cấu trúc cho mỗi loại mà không lặp nội dung.

## Hệ quả

Tầng kiểm thử này bổ sung cho mỗi kịch bản một bộ fixture đã qua đánh giá gồm input, phiên, stdout, override tùy chọn và workspace tùy chọn, đồng thời thêm một tệp cho mỗi chuỗi prompt đã cố định khác nhau và một tệp cho mỗi chuỗi tool schema đã cố định khác nhau. Cả việc ghi lẫn phát lại đều sao chép workspace seed vào cwd được sinh ra. Đổi lại, tầng này cung cấp độ bao phủ tất định, không cần khóa API, thông qua Loader thật và tổ hợp tool thật, trong đó có một kịch bản khôi phục sau tràn ngữ cảnh đã lắp ráp, với bản tóm tắt compaction được đánh dấu đóng vai trò lời gọi phụ trợ. Phần lớn các kịch bản còn giữ lại là kiểm thử backend sau khi lắp ráp chứ không phải ACP; [quyết định ACP chỉ phục vụ tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md#snapshot-boundary) giữ kho ngữ liệu này ở đây cho tới khi nó có thể chuyển sang bộ kiểm thử headless độc lập với truyền tải mà không mất độ bao phủ.

Agent Note này liên quan tới [Agent Note về tính tất định được đề xuất](../../proposed/testing/2026-06-11-deterministic-and-stress-testing.md) nhưng không thay thế nó: "fixture phát lại đa dụng" trong đề xuất đó suy dẫn lại *lịch sử message* của phiên sau mỗi lần kiểm thử (bất biến về tính nhất quán nội tại), còn các snapshot ở đây cố định hành vi sau khi lắp ráp và output tự động hóa bên ngoài. Trước khi kho ngữ liệu backend chuyển ra khỏi ACP, hai bên bổ sung cho nhau.
