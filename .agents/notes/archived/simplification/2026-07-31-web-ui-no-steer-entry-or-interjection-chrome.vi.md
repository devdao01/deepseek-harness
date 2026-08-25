# Agent Note: Web UI bỏ entry steer và chrome interjection (chen ngang)

Status: implemented

Archived: 2026-08-07

[English](2026-07-31-web-ui-no-steer-entry-or-interjection-chrome.md) | 中文

## Vấn đề

Steering giữa chừng là capability của host/agent-loop (`mode:'steer'`, `user/message` bền vững). Sản phẩm Web đã khóa composer trong lúc turn đang chạy, và chưa bao giờ phát hành menu queue/steer, nhưng client vẫn luồn `'queue' | 'steer'` xuyên qua input machine, `conversation.send` và key locale, và render steering đã tiêu thụ thành bubble mang huy hiệu "插话"/"Interjection" (chen ngang). Điều này để lại một UI dở dang: chế độ submit không dùng tới, một cử chỉ mà người dùng không thể thực hiện nhưng lại có văn bản sản phẩm cho nó, và một lớp chrome mà sản phẩm không sở hữu bị đóng chặt vào golden e2e.

## Quyết định

Giữ lại steering ở tầng host và runtime. Chỉ bỏ entry và chrome của Web UI:

- `InputMachine`/`SessionInput`/`InputActions.submit`/hub `defaultSink` chỉ còn queue; luôn gọi `session.prompt(..., 'queue')`.
- `ConversationService.send(text)` bỏ tham số mode, luôn luôn queue.
- Nội dung steer bền vững được render thành bubble thường căn phải (không huy hiệu, không IconActions của người dùng), để steer từ bên ngoài/host vẫn hiển thị được khi replay.
- Xóa chuỗi locale `message.steering` và CSS huy hiệu không dùng tới.
- e2e steering của web vẫn POST `mode:'steer'` qua `/api/session.prompt`, và khẳng định việc lưu bền vững cùng sự tuân thủ có thể quan sát được ở model; không còn kỳ vọng chrome chen ngang. Đồng bộ cập nhật các dòng sự kiện trong [web input machine note](../architecture/2026-07-25-web-input-machine-and-slash-pipeline.md).

## Các phương án thay thế đã cân nhắc

**Xóa hoàn toàn steering ở tầng host.** Vượt ngoài phạm vi; người dùng chỉ yêu cầu dọn sạch phần hiển thị và entry của Web UI. Việc drain agent-loop, event session và mode dây dẫn vẫn là capability chịu lực cho ACP/TUI/tự động hóa.

**Ẩn nội dung `user/message` steer bền vững trong transcript.** Khi client bên ngoài steer, replay sẽ bị sai lệch, nên thay vào đó dùng bubble thường.

**Giữ tham số mode nhưng luôn luôn chỉ truyền `'queue'`.** Sẽ để lại bề mặt API chết và test chỉ hư cấu ra đường `'steer'` mà composer không bao giờ tới được.

## Hệ quả

- **Một phần đã bị thay thế.** Mục 1 và mục 3 tới 5 của quyết định không còn mô tả đúng master nữa: steering của composer sau đó đã được phát hành, [quyết định về nguồn context và nhãn steer](../feature/2026-08-04-web-context-source-and-steer-marks.md) chịu trách nhiệm định nghĩa nhãn của nó. Các sự kiện hiện tại được liệt kê dưới đây.
- Quyền sở hữu steering phía host không đổi: việc drain agent-loop, event session và mode dây dẫn vẫn cần thiết cho ACP, tự động hóa và client không phải Web.
- `ConversationService.send(text)` vẫn không nhận mode, luôn luôn queue; cử chỉ Steer của composer chuyển sang dùng `session.prompt(mode: 'steer')`.
- Nội dung `user/message` steer bền vững vẫn được gộp vào transcript, nên steer được submit từ bên ngoài sẽ xuất hiện trung thực khi replay. Giờ nó mang nhãn chen ngang, thay vì bubble không có nhãn nhận diện.
- Các mục next-step không có nguồn từ người dùng (context `agent.inject`: thông báo phê duyệt, hoàn thành task, snapshot đính kèm) được phát bằng placement `context`, không bao giờ render thành bubble steering đang chờ; chúng ở trạng thái không hiển thị cho tới khi được nhận (claim) thành context card `user/message` bền vững.

## Testing

- `packages/client/ui-conversation` bao phủ unit/jsdom: enter/sink của input machine, định tuyến ConversationService, nhánh steering của MessageItem, submit của InputBar.
- `apps/web/tests/steering.e2e.ts` replay không cần key cùng baseline golden của nó, baseline này kiểm tra nhãn chen ngang.
- Test chiếu `session/queue` của `packages/host/apiproxy` khẳng định mục next-step có nguồn từ người dùng vẫn giữ `steering`, còn mục có nguồn từ plugin rơi vào `context`.
