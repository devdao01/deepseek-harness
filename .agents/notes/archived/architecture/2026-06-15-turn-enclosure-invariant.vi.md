# Agent Note: Mọi sự kiện phiên đều nằm khép kín trong một turn (lượt)

Status: implemented
Archived: 2026-07-28

[English](2026-06-15-turn-enclosure-invariant.md) | 中文

## Vấn đề

Backend persistence phiên bền vững (được giới thiệu trong thay đổi đi kèm) dùng **turn (lượt)** làm ranh giới khôi phục sau crash: một vụ crash có thể để lại một turn cuối cùng chưa đóng, và `load` sẽ đóng nó bằng một `turn/end {kind:'interrupted'}` tổng hợp, đồng thời giữ lại các sự kiện thật của turn đó (xem [Session persistence](2026-06-14-session-persistence.md)). Việc khôi phục này chỉ well-defined khi không có bất kỳ sự kiện bền vững *hợp lệ* nào nằm ngoài turn (tức là trong khoảng trống giữa `turn/end` trước đó và `turn/start` kế tiếp); nếu không, những sự kiện đó sẽ bị cuốn vào việc đóng ngắt quãng của turn kế tiếp.

Giả định này không đúng. Có hai đường ghi sự kiện nằm ngoài mọi turn:

1. **Tin nhắn người dùng đang xếp hàng chờ.** Agent loop (vòng lặp agent) xả các tin nhắn đang chờ và append `user/message` *trước* `turn/start` — khiến prompt của chính một turn rơi vào khoảng trống giữa `turn/end` trước đó và `turn/start` kế tiếp.
2. **Việc bơm ngữ cảnh (context injection) khi rảnh.** `agent.inject()` append trực tiếp một `context/message`. Bên gọi thực tế trong môi trường production là `dsh-tool-bash`, nó bơm thông báo hoàn thành tác vụ nền từ `ctx.bash.onTaskDone` — callback này kích hoạt khi tác vụ bash nền hoàn thành, điều này thường xảy ra khi agent đang **rảnh** (giữa các turn).

Trong tình huống 2, nếu `context/message` được bơm vào là sự kiện cuối cùng trước khi flush/dispose (sau đó không có turn nào append `turn/end`), `scanLog` sẽ coi nó là tàn dư của crash và **loại bỏ khi khôi phục** — ngữ cảnh đã bơm vào đã được ghi bền vững xuống đĩa, nhưng bị âm thầm mất sau khi tải lại. Tình huống 1 tự thân không gây hại (`user/message` luôn được theo sau bởi turn mà nó kích hoạt), nhưng làm mờ quy tắc "cái gì có thể xuất hiện ngoài turn".

## Quyết định

**Mọi sự kiện phiên đều nằm bên trong một turn**: giữa `turn/start` và `turn/end` khớp với nó. Cụ thể:

- Agent loop append các sự kiện `user/message` đang xếp hàng **sau** `turn/start` (bên trong turn), thay vì trước. Do đó, một khi các tin nhắn này đã được ghi log, sẽ có một `turn/end` còn nợ, và finalizer sẵn có đảm bảo nó được ghi.
- Khi agent **đang chạy** gọi `agent.inject()`, nó sẽ gia nhập turn đã mở. Trong lúc bước hiện tại đang thực thi các lệnh gọi công cụ của assistant, ngữ cảnh đã được chấp nhận sẽ chờ theo thứ tự đến để quyết toán ở đợt đó, sau đó được append sau mỗi kết quả đã ghi log; ngay cả khi việc thực thi bị gián đoạn, nó vẫn được ghi trước khi turn đóng lại.
- Khi agent **đang rảnh** gọi `agent.inject()`, thì `context/message` được bọc trong một turn dùng một lần: `turn/start{trigger:{kind:'injection'}}` → `context/message` → `turn/end{completed}`. Một biến thể `injection` mới được thêm vào `TurnTriggerMap` có thể gộp mở rộng.
- Mỗi vòng lặp của agent loop suy ra số turn tiếp theo từ log (`lastTurnNumber(session) + 1`), thay vì duy trì một bộ đếm riêng, nhờ đó turn dùng một lần từ việc bơm lúc rảnh không xung đột số hiệu với turn thật kế tiếp.
- Companion `dsh-session/invariant` đăng ký kiểm tra này vào `ctx.invariants`: khi được chọn, việc append `user/message` / `context/message` / `steering/message` mà không có turn nào đang mở sẽ ném ra `InvariantError` quy về `@deepseek-ai/dsh-session`.

Bất biến về khả năng serialize được thực thi tại cùng một ranh giới mã nguồn (`Session.append` ném lỗi với dữ liệu không thể serialize sang JSON), do đó "cái gì có thể vào log" giờ được quản lý tập trung tại một chỗ, thay vì được từng backend phía sau tình cờ phát hiện riêng lẻ.

## Phương án thay thế đã cân nhắc

**Nới lỏng phía đọc thay vì ràng buộc phía ghi** — để `scanLog` chấp nhận các sự kiện nằm ngoài turn đã mở. Bị bác bỏ: một quy tắc phía ghi đơn nhất, có thể kiểm tra được, tốt hơn một ranh giới quét lỏng lẻo hơn (ranh giới đó đòi hỏi phải suy luận đồng thời cả turn một phần *lẫn* các sự kiện rải rác giữa các turn).

## Hậu quả

Turn giờ là ranh giới persistence/replay *duy nhất*, nên quy tắc khôi phục sau crash của [Session persistence](2026-06-14-session-persistence.md) là đầy đủ, chứ không chỉ là đủ dùng: turn cuối cùng bị gián đoạn được đóng lại (bằng `turn/end {interrupted}` tổng hợp), sự kiện thật của nó được giữ lại, và không có rủi ro nào về việc trộn lẫn ngữ cảnh giữa các turn, vì không tồn tại ngữ cảnh giữa các turn. `scanLog` giữ được sự đơn giản (tối đa một turn cuối cùng có thể chưa đóng, tuyệt đối không có sự kiện rải rác giữa các turn), và thông báo tác vụ nền lúc rảnh vẫn sống sót sau persistence + khôi phục.

Cái giá phải trả: gọi `agent.inject()` lúc rảnh giờ ghi ba dòng log thay vì một; lịch sử được suy ra có thêm một turn chỉ chứa ngữ cảnh đã bơm (không có output của assistant) — `deriveMessages()` đã suy ra thuần túy theo loại sự kiện, nên kết quả render hoàn toàn giống nhau. Trigger `injection` là một giá trị từ vựng đĩa mới; giống như mọi lần thêm mới vào `SessionEventMap`/`TurnTriggerMap`, nó thuộc về một phần của định dạng đã đóng băng. Thứ tự sự kiện bên trong turn đã thay đổi (`turn/start` giờ đứng trước `user/message`), điều này có thể quan sát được với bất kỳ code nào khẳng định thứ tự cũ — test của chính agent loop là bên tiêu thụ duy nhất thuộc loại đó.

Quy tắc này chủ động chọn cách thực thi ở phía ghi, kiểm tra ở môi trường dev, thay vì cách khoan dung ở phía đọc: các backend tương lai (SQLite/WAL) kế thừa cùng một ranh giới sạch sẽ mà không cần thêm công sức, còn plugin nào ghi log sự kiện ngoài turn sẽ thất bại ồn ào ở môi trường dev, thay vì âm thầm mất dữ liệu ở lần tải lại kế tiếp.

Các lỗi phát hiện được bên trong turn được ghi log trước `turn/end`. Các lỗi flush xảy ra sau đó không có vị trí hợp lệ bên trong turn, nên được báo cáo qua `agent/error` và log, thay vì được append như một sự kiện phiên. Điều này giữ cho log replay cân bằng; chẩn đoán vận hành cho persistence cần một kênh telemetry riêng.
