# @deepseek-ai/dsh-command-compact

[English](README.md) | Tiếng Việt

Cung cấp quyền điều khiển compaction (nén) `/compact` hướng tới người dùng thông qua [`ctx.compaction`](../compaction/README.md). Plugin này đăng ký một lệnh toàn cục thông qua [`ctx.commands`](../../interaction/commands/README.md), nhờ đó mọi command adapter trong tổ hợp đều có thể phát hiện và thực thi nó mà không cần một lượt mô hình. [Agent Note về compaction thủ công theo hàng đợi](../../../.agents/notes/implemented/feature/2026-07-30-queued-manual-compaction.md) sở hữu các quyết định về tiếp nhận, khóa và tính bền vững.

## Quy ước lệnh

| Đầu vào | Kết quả |
|---|---|
| `/compact` | Tóm tắt một khoảng trước đó hợp lệ, cân bằng, ngay cả khi chưa đạt áp lực tự động; sau khi flush cặp nhãn độc lập, báo cáo số mục lịch sử đã bị thay thế và số token ước tính. |
| `/compact`, nhưng không có lịch sử nào có thể nén | `No compactable history yet.`: không ghi nhãn, cũng không thay đổi surface. |
| `/compact <bất kỳ>` | `Usage: /compact (no arguments)`: lệnh này không nhận tham số, và cũng không gọi backend compaction. |

Lệnh này không phụ thuộc vào backend cụ thể nào, chỉ dựa vào `compactNow(agent, signal)`. Agent (tác tử) gọi lệnh này chính là mục tiêu chính xác của thao tác, còn UI khởi tạo việc phân phối sẽ chuyển tiếp tín hiệu hủy qua seam. Mỗi lần gọi hoàn tất đều ghi lại cặp sự kiện chỉ-log `command/run` / `command/done` thuộc về executor; cả hai đều không đi vào lịch sử mô hình. Khi thành công, `command/done.sourceEventSeq` sẽ chỉ ra sự kiện `compaction/summary` của giao dịch đó, cho phép tầng hiển thị gộp vòng đời lệnh vào checkpoint tương ứng mà không cần phân tích văn bản kết quả hay giả định hai dòng liền kề nhau.

Các mã `ManualCompactionError` dự kiến sẽ trở thành lỗi trực tiếp ổn định:

| Mã | Kết quả trực tiếp |
|---|---|
| `busy` | `Compaction is unavailable because this process has an active compaction, or the agent is not idle.` |
| `changed` | `The history selected for compaction changed before it could be replaced. The conversation is unchanged; the attempt is recorded in the session log.` |
| `summary` | `Compaction could not produce a useful summary. The conversation is unchanged; the attempt is recorded in the session log.` |
| `commit` | `Compaction did not finish cleanly; some session history may have changed. Inspect the current session state before retrying.` |
| `persistence` | `Compaction finished, but the session could not be saved.` |

Kết quả busy được cố ý giới hạn trong phạm vi tiến trình: nhãn đang hoạt động chưa khớp cặp sẽ chặn thao tác, còn nhãn cũ hơn `session/end-seed` mới nhất thì đã lỗi thời và không chặn. Lỗi triển khai ngoài dự kiến sẽ từ chối phân phối. Việc hủy vẫn có quyền quyết định cuối cùng; backend sẽ hoàn tất bước dọn dẹp đóng/flush cần thiết, lệnh sẽ kết thúc nội bộ bằng `Compaction cancelled.`, còn executor của lệnh sẽ dừng chờ do lỗi hủy. Việc dỡ plugin sẽ hủy đăng ký `/compact` trước, sau đó chờ mọi handler đã bắt đầu kết thúc, do đó teardown ở cấp gốc không bao giờ vượt qua ranh giới đóng hoặc flush của một lệnh đã bị hủy.

Các prompt được gửi trong lúc compaction đang chạy vẫn sẽ được tiếp nhận theo FIFO thông thường của agent, giữ nguyên thông tin định danh và đánh thức. Chúng chỉ khởi động sau khi checkpoint bền vững tường minh của compaction và phần dự trữ tiếp nhận được giải phóng. Ngữ cảnh được inject lúc rảnh rỗi không bị chặn: nó có thể được ghi giữa `compaction/start` và `compaction/end`, và việc thay thế vị trí sẽ giữ nó hiển thị sau checkpoint.

## Kết hợp

Bên sản xuất tiêm `commands` và `compact`. Gắn registry lệnh, một backend và plugin này:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
- id: command-compact
  name: '@deepseek-ai/dsh-command-compact'
```

Cấu hình cơ bản đi kèm của `dsh` gắn plugin này cạnh `compaction-basic`, và Web client cung cấp command adapter. Các giao diện automation chưa kết hợp command adapter chỉ giữ lại compaction tự động.

## Trải nghiệm mô hình

### Quyền điều khiển `/compact` của người dùng

#### Mô hình thấy gì

Đầu vào dạng slash và kết quả trực tiếp không bao giờ đi vào request của mô hình. Compaction đã được tiếp nhận sẽ thay thế một khoảng trước đó bằng checkpoint vai trò user của backend, nằm riêng trong cặp nhãn `compaction/* { turn: null }`.

#### Ảnh hưởng Token

Vòng đời lệnh không làm tăng token mô hình. Compaction thành công sẽ thay thế khoảng đã chọn bằng một bản tóm tắt có khung, từ đó giảm các request tiếp theo; việc tạo tóm tắt tự thân cần một request phụ trợ.

#### Ảnh hưởng KV Cache

Việc phát hiện và ghi sổ lệnh không ảnh hưởng đến cache. Việc thay thế surface đã được tiếp nhận sẽ làm mất hiệu lực tái sử dụng kể từ token lịch sử bị che khuất đầu tiên.

## Giới hạn đã biết & công việc hoãn lại

- **Chỉ ở trạng thái rảnh rỗi**: khi một lượt hoặc một prompt đánh thức đã được tiếp nhận có quyền ưu tiên, `/compact` sẽ báo `busy`; bản thân lệnh không xếp hàng đợi.
- **Không nhận tham số phạm vi hay chính sách**: dạng không tham số giữ hành vi ổn định trên các command adapter. Phạm vi tường minh vẫn do interface lập trình `compactRegion()` xử lý.
- **Chỉ dành cho command adapter**: giao diện không có `ctx.commands` không thể gọi lệnh này, chỉ có thể dựa vào compaction theo áp lực tự động.
