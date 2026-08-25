# Agent Note: Hiển thị chuỗi cause của lỗi tại mọi ranh giới chẩn đoán

Status: implemented

[English](2026-07-20-error-cause-chain-diagnostics.md) | 中文

## Vấn đề

Khi TUI kết nối tới endpoint DeepSeek không truy cập được, thất bại chỉ hiện một thông báo `fetch failed`, không kèm bất kỳ chi tiết nào thêm. Hai lỗ hổng độc lập cùng tạo ra ngõ cụt này:

1. `fetch` của undici gói mọi thất bại tầng truyền tải (DNS, kết nối bị từ chối, TLS, proxy) thành một `TypeError: fetch failed` trần trụi, còn các chi tiết có thể hành động được — `ECONNREFUSED`, `bad port`, AggregateError của Happy Eyeballs — đều nằm trên `error.cause`. Mọi ranh giới chẩn đoán trong harness đều chỉ hiển thị `error.message` (hoặc `String(error)` tương đương với Error), nên lớp bọc che mất thông tin chẩn đoán trong thông báo của TUI, trong `turn/end` reason được lưu bền vững, và trong mọi dòng log.
2. Lối vào readline (`dsh-stdio`) hoàn toàn không hiển thị nguyên nhân thất bại: `turn/end` với `reason.kind === 'error'` chỉ in ra dấu nhắc `> ` tiếp theo, và cùng thất bại đó trong `demo:repl` là im lặng hoàn toàn.

## Quyết định

- `dsh-llm` export `errorChain(value)`: hiển thị giá trị được ném ra cùng toàn bộ chuỗi `cause` của nó (`outer: inner: …`) và các thành viên AggregateError (`msg [m1; m2]`), đồng thời chịu được cause vòng lặp và ép kiểu độc hại. Nó chỉ là bộ hiển thị dành cho đầu ra chẩn đoán; việc định tuyến vẫn dựa trên `HarnessError.code`.
- Adapter DeepSeek gói các thất bại truyền tải xảy ra trước khi nhận được response thành `LlmError('TRANSPORT')`, ghi rõ `baseURL` đã cấu hình và nối giá trị rejection gốc vào chuỗi lỗi dưới dạng `cause`. Request bị hủy trở thành `LlmError('ABORTED')`; vì tín hiệu của lượt đã ở trạng thái hủy, agent loop (vòng lặp trợ lý) vẫn phân loại lượt đó là bị hủy chứ không phải khôi phục.
- Mỗi ranh giới chẩn đoán chuyển sang dùng `errorChain` thay cho `error.message`/`String(error)`: thông điệp lỗi `turn/end` được lưu bền vững của agent-loop (`errorData`), cảnh báo log của nó, thông báo `agent/error` và dòng lỗi khởi động của TUI, cùng dòng log lỗi khởi động của `dsh-stdio`. Sự kiện `agent/error` thời gian thực và `SettleReason` giữ nguyên giá trị được ném ra dưới dạng `unknown`; từng bên tiêu thụ chẩn đoán tự hiển thị, thay vì để vòng lặp gói nó thành một lỗi khác. Các bản sao `renderThrown` riêng trong `dsh-agent-loop`, `dsh-stdio`, `dsh-tui` bị xóa, thống nhất dùng chung một bộ hiển thị này.
- `dsh-stdio` hiển thị `turn/end` reason thất bại: `[turn failed <code>] <message>`, `[turn aborted] <reason>`, `[turn rejected] <reason>`, `[turn interrupted by a previous process exit]` cùng thông báo chạm trần token đầu ra. Các kind chưa biết được mở rộng qua declaration merging sẽ được xử lý như một lượt kết thúc bình thường.

`errorChain` đặt trong `dsh-llm` giống như `HarnessError`, với cùng lý do: đó là package lá mà mọi bên tiêu thụ đều đã import, nên dùng chung không thêm cạnh phụ thuộc mới.

## Phương án khác đã cân nhắc

**Hiển thị chuỗi ngay trong constructor của từng lỗi (ghi cause vào `message`).** Bác bỏ: khi bên tiêu thụ đồng thời duyệt `cause` sẽ bị hiển thị hai lần (bản sửa đầu tiên của adapter đã tạo ra `… fetch failed: bad port: fetch failed: bad port`), đồng thời phá vỡ chuỗi có cấu trúc mà bên tiêu thụ muốn định tuyến theo lỗi bên trong cần đến.

**Chỉ làm một log exporter nhận biết `cause`.** Bác bỏ: `turn/end` reason được lưu bền vững và thông báo TUI không phải dòng log; thông điệp bị che sẽ nằm lại trong session log — bản ghi bền vững duy nhất về thất bại trong lượt — và trong UI chính.

**Nâng cấp `renderThrown` theo từng package.** Bác bỏ: ba package vốn đã tự giữ các bản sao riêng gần như giống hệt nhau; nâng cấp riêng lẻ chỉ cố định hóa đúng phần trùng lặp mà bộ hiển thị dùng chung cần loại bỏ.

## Hệ quả

- Thất bại truyền tải giờ hiển thị trong thông báo TUI, transcript (bản ghi văn bản) của readline và session log bền vững dưới dạng `DeepSeek API request to <baseURL> failed: fetch failed: connect ECONNREFUSED …`, đánh đổi bằng chuỗi chẩn đoán dài hơn.
- Thông điệp lỗi `turn/end` được lưu bền vững có kèm chi tiết cause. Các fixture snapshot (dữ liệu chuẩn bị cho test) hiện có phát lại giống hệt ở mức byte, vì lỗi được viết kịch bản của chúng không có `cause` (với loại lỗi này thì `errorChain(err)` bằng đúng `err.message`); chỉ chuỗi kỳ vọng trong unit test là thay đổi. Fixture ghi lại từ thất bại truyền tải thật sẽ mang theo chuỗi đầy đủ.
- `errorChain` hiển thị `message` mà không kèm tên lớp (`String(error)` sẽ hiển thị `Error: <message>`), nên một `TypeError` trần trong dòng log sẽ mất nhãn kiểu, trừ khi thông điệp rỗng (khi đó quay về dùng tên lớp). Tại các ranh giới chẩn đoán này, chi tiết chuỗi được đánh giá là giá trị hơn tên lớp.
- `dsh-stdio` không còn im lặng với đầu ra của lượt thất bại; bên tiêu thụ pipeline phân tích transcript sẽ thấy các dòng `[turn …]` mới.
- Các bản sao `renderThrown` còn lại trong `dsh-subagent`, `dsh-workflow`, `dsh-skill`, `dsh-workflow-worker-thread` vẫn không hiển thị chuỗi; chúng gói các lỗi trong package vốn đã tự mang thông điệp, sẽ chuyển sang `errorChain` khi nào thông tin chẩn đoán chứng tỏ là không đủ.
