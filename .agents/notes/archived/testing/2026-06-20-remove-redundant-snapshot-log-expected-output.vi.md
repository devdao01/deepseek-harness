# Agent Note: Dùng `session.jsonl` làm sản phẩm log session snapshot duy nhất

Status: implemented

Archived: 2026-07-26

[English](2026-06-20-remove-redundant-snapshot-log-expected-output.md) | 中文

## Vấn đề

Kịch bản snapshot ACP (Agent Client Protocol) điều khiển bởi model chứa cả `session.jsonl` lẫn `session.expected.jsonl`. Với kịch bản ghi hình thông thường, `session.jsonl` là fixture (dữ liệu chuẩn bị trước cho test) replay được thu thập từ lần chạy thật; test replay chuẩn hóa log vừa được lưu bền vững, rồi so sánh nó với `session.expected.jsonl`. Trong fixture hiện tại, hai bản log đã chuẩn hóa của kịch bản ghi hình thông thường hoàn toàn giống nhau.

Kịch bản override viết tay (`error-finish`, `cancel`) hiện dùng `replay.override.json` để điều khiển hành vi model, giữ `session.jsonl` làm fixture dummy tối giản, còn `session.expected.jsonl` lưu log lưu bền vững kỳ vọng. File override là một mảng JSON gồm các đối tượng `ReplayEntry`: `{ "kind": "chunks", "chunks": StreamChunk[] }`, `{ "kind": "throw", "chunks": StreamChunk[], "message": string, "code": string }`, hoặc `{ "kind": "hang" }`. Việc tách này cũng không cần thiết: khi sidecar override tồn tại, `llm-replay` sẽ thay thế script dẫn xuất, không cần lấy mảnh model từ `session.jsonl`, do đó `session.jsonl` vẫn có thể dùng làm sản phẩm log session kỳ vọng của kịch bản.

## Quyết định

Loại bỏ hoàn toàn khái niệm `session.expected.jsonl`. Mỗi kịch bản có tối đa một sản phẩm log session đã commit, đó là `session.jsonl`:

- Với kịch bản ghi hình, `session.jsonl` vẫn là log thu thập gốc. Replay vẫn dẫn xuất mảnh model từ đó, test snapshot so sánh log lưu bền vững đã chuẩn hóa từ lần chạy replay với `session.jsonl` đã chuẩn hóa.
- Với kịch bản override viết tay, `replay.override.json` điều khiển hành vi model, `session.jsonl` lưu log session kỳ vọng được sinh ra. Khi file override tồn tại, adapter replay không lấy mảnh model từ fixture, nên cùng một file vừa có thể làm log kỳ vọng, vừa không ảnh hưởng tới hành vi replay.
- Với kịch bản không có model, `session.jsonl` có thể giữ lại làm fixture tối giản cần thiết để khởi động `llm-replay`; trừ khi kịch bản tạo ra session lưu bền vững, không cần so sánh log session.

Output kỳ vọng của stdout giữ nguyên không đổi; chúng là phép chiếu hướng tới editor, không trùng lặp với fixture session.

## Các phương án thay thế đã cân nhắc

**Chuẩn hóa hai bên dựa trên context dùng chung (của lần chạy replay).** Bị bác bỏ. `normalizeSessionLog` xóa cwd bằng khớp chuỗi chính xác, nên cwd được ghi trong fixture sẽ không bị xóa, mỗi lần so sánh sẽ thất bại. Hai bên chuẩn hóa dựa trên context tự dẫn xuất từ header riêng của mình — phần giải thích hiện thực bên dưới mô tả cơ chế cụ thể.

## Kiểm chứng

`session.expected.jsonl` không còn xuất hiện trong harness snapshot, fixture, bộ bảo vệ mục cô lập và tài liệu; với mỗi kịch bản có model, test snapshot đều dẫn xuất log session kỳ vọng từ `session.jsonl`; kịch bản viết tay có sidecar commit log kỳ vọng được sinh ra dưới dạng `session.jsonl`, và override hành vi model bằng `replay.override.json`; bộ bảo vệ fixture cô lập biết file nào cần thiết cho từng loại kịch bản. [Agent Note test snapshot ACP](2026-06-19-acp-snapshot-tests.md) (bản ghi quyết định của agent) mô tả tập fixture đã tinh gọn.

## Hệ quả

Người review mất đi một tên sản phẩm có thể phân biệt trực quan giữa log lưu bền vững kỳ vọng và fixture replay. Output kỳ vọng của stdout vẫn bảo vệ transcript (bản ghi văn bản) editor, còn việc so sánh output replay với `session.jsonl` giữ được kiểm tra hồi quy vòng lặp/lưu bền vững mà không cần sao chép file.

## Giải thích hiện thực

Hai bên chuẩn hóa dựa trên giá trị header riêng của mình, vì ghi hình và replay có id, đường dẫn và timestamp khác nhau. `fixtureContext()` dẫn xuất context từ header của fixture, khiến fixture đã chuẩn hóa mang tính idempotent (bất biến khi lặp lại). Log session dùng so sánh bằng thông thường thay vì cập nhật snapshot file, nên quá trình so sánh không ghi đè lên fixture.
