# Agent Note: Miền mục tiêu cùng phiên được lưu bền vững

Status: implemented

[English](2026-07-19-persisted-same-session-goal-domain.md) | 中文

## Vấn đề

Một mục tiêu chạy dài có thể trải dài qua nhiều prompt, lượt hoặc request model. Nếu coi mục tiêu đó là biến vòng lặp trong bộ nhớ, nó sẽ mất khi tiến trình khởi động lại; nếu chỉ lưu trong trạng thái UI, không thể dựng lại hành vi model. Nếu coi mỗi lượt trong phiên là tiến độ mục tiêu, các message người dùng không liên quan đến công việc tự động cũng sẽ tiêu tốn ngân sách.

Vòng đời bền vững và quyền tiếp tục thực thi là hai sự thật khác nhau. Phiên có thể giữ mục tiêu đang hoạt động sau khi khởi động lại hoặc fork, nhưng việc người dùng mở phiên rồi âm thầm khởi động công việc lại không trực quan. Miền này cần trạng thái có thể replay, nhưng không được lưu bền vững quyền tự thực thi; nó cũng phải tồn tại như một plugin trên các service agent (tác tử) và phiên công khai, chứ không phải một trường hợp đặc biệt trong vòng lặp cụ thể.

## Quyết định

`@deepseek-ai/dsh-goal` tại `packages/goal/goal/` quản lý một mục tiêu cùng phiên hiện tại qua `ctx.goals`. Mục tiêu chứa id gắn brand, mô tả mục tiêu, giai đoạn bền vững, số revision compare-and-swap và `maxGoalRounds`. `defaultMaxGoalRounds` là cấu hình triển khai đã được kiểm tra, mặc định là `256`; `create()` giải quyết nó thành giá trị đầy đủ nội bộ trước khi thay đổi, chứ không expose quá trình giải quyết như một động từ service bổ sung.

Giai đoạn bền vững gồm `active`, `paused`, `blocked` và `complete`. Snapshot bị chặn chứa mã kebab-case chữ thường hoàn toàn do chính sách định nghĩa và message văn bản tự do đã chuẩn hóa, do đó giới hạn dùng lượng, giới hạn Goal Round, thất bại thực thi và chờ input người dùng có thể chia sẻ một trạng thái vòng đời mà không mất lý do. Trạng thái kích hoạt thời gian thực độc lập là `armed` hoặc `disarmed`. Tạo và resume tường minh sẽ kích hoạt mục tiêu; pause, complete, blocked và clear đều giải kích hoạt. Edit giữ nguyên trạng thái kích hoạt và lý do bị chặn; resume và complete xóa lý do đó. Snapshot bền vững không bao giờ chứa trạng thái kích hoạt.

### Bản ghi bền vững và replay

Mỗi thay đổi đều nối thêm một event phiên `goal/change` có version, chứa snapshot đầy đủ; khi xóa thì chứa bia mộ (tombstone) mang số revision. Log phiên là nguồn sự thật bền vững duy nhất, do đó việc lưu bền vững và fork sẽ kế thừa bản ghi mục tiêu mà không cần cơ sở dữ liệu hay trường header riêng. [Quyết định event bền vững thuộc sở hữu mục tiêu](../architecture/2026-07-31-goal-owned-durable-events.md) đảm nhiệm việc tách event bền vững của mục tiêu khỏi trạng thái hộp thư đến và ngữ cảnh model.

Việc gấp (fold) replay chỉ suy ra thay đổi vòng đời từ `goal/change`, và kiểm tra hình dạng JSON, id mới, tính liên tục của revision, chuyển đổi vòng đời, bộ đếm, và timestamp tăng đơn điệu trong một mục tiêu. Chỉ khi nguồn là `user/message` đã được chấp nhận, mang số dương và liên tục trên revision hiện đang hoạt động mới đẩy Goal Round tiến lên, và không được vượt quá `maxGoalRounds`; lượt phiên thông thường không ảnh hưởng đến bộ đếm này. Bản ghi sai định dạng ở định dạng hiện tại sẽ khiến replay thất bại, chứ không bị bỏ qua hay sửa chữa.

Replay gia tăng sẽ tiến con trỏ sau mỗi event hợp lệ, và dừng lại tại event hỏng đầu tiên, do đó các lần đọc tiếp theo sẽ báo cáo cùng một lỗi bền vững đó. Sau khi khởi động lại vẫn lấy log bền vững làm chuẩn.

### Vòng đời và trạng thái kích hoạt thời gian thực

Chỉ có tối đa một mục tiêu hiện tại. Tạo yêu cầu không tồn tại mục tiêu hiện tại chưa hoàn thành, và luôn sinh ra một id chưa từng dùng trước đó cho phiên này, với số revision là một; mục tiêu đã hoàn thành có thể được thay thế. Mỗi thay đổi khác đều mang theo `GoalRef` kỳ vọng, id hoặc revision lỗi thời sẽ bị từ chối. Chỉ khi giới hạn Goal Round vẫn còn dư địa, giai đoạn tạm dừng hoặc bị chặn cùng mục tiêu đang hoạt động đã giải kích hoạt mới có thể resume. Tầng domain kiểm tra hình dạng lý do bị chặn, nhưng để mã lý do và quyết định có bị chặn hay không cho bên tiêu thụ chính sách.

Cache dựng từ bất kỳ seed nào đều bắt đầu ở trạng thái chưa kích hoạt, và mỗi cạnh `agent/session-start` cũng giải kích hoạt lại lần nữa. `GoalService.disarm(agent)` còn cho phép chủ sở hữu vòng đời gỡ quyền trong tiến trình, mà không ghi event phiên, không thay đổi revision, cũng không phát `goal/changed`. Do đó, việc khôi phục phiên, fork và thay thế driver tiếp tục thực thi đều giữ lại mục tiêu và lịch sử bền vững, nhưng không bao giờ tự khởi động công việc. Prompt người dùng sau đó có thể được model diễn giải, API chính sách của nó có thể gọi tường minh thao tác resume và kích hoạt mục tiêu.

### Ranh giới service

Service chỉ chấp nhận đúng đối tượng `Agent` thời gian thực đã đăng ký dưới id tương ứng. Sau khi thay đổi được commit, nó phát event `goal/changed` có phạm vi, và cách ly lỗi listener. Bên tiêu thụ chính sách làm việc qua service này, giao diện `Agent` công khai và event `agent/*`; miền mục tiêu không import cũng không sửa `dsh-agent-loop`.

## Kiểm thử

Unit test cố định giá trị mặc định khi tạo, kiểm tra agent thời gian thực chính xác, từ chối compare-and-swap, mọi chuyển đổi vòng đời, kiểm tra và giữ lại lý do bị chặn, ràng buộc giới hạn Goal Round khi resume, xóa và thay thế, replay từ seed và kế thừa `SessionStore.fork()`, giải kích hoạt khi khởi động phiên và bởi chủ sở hữu vòng đời, kích hoạt lại mục tiêu đang hoạt động, gấp event bền vững, tính độc lập của hộp thư đến, replay ổn định với event hỏng, hủy service và listener, cách ly listener, kẹp (clamp) khi đồng hồ tường lùi lại, giải mã bản ghi nghiêm ngặt, tính liên tục vòng đời, và quy thuộc Goal Round liên tiếp. Test tiến trình Loader/stdio không cần key gắn service và bên tiêu thụ vòng đời qua `cordis.yml` chuyên dụng cho test, rồi đọc JSONL bền vững từ bên ngoài để xác minh bản ghi mục tiêu và không có Goal Round không được yêu cầu nào tồn tại. Mã nguồn package chịu ràng buộc cổng bao phủ 100% theo từng file của repo.

## Các phương án thay thế đã cân nhắc

- **Lưu mục tiêu vào cơ sở dữ liệu độc lập hoặc header phiên** — không áp dụng, vì log phiên đã cung cấp thứ tự, tính bền vững, tiền tố fork và khả năng dựng lại; một kho lưu trữ thứ hai sẽ đưa vào vấn đề tính nguyên tử và phả hệ.
- **Ràng buộc mỗi thay đổi bền vững với ngữ cảnh model đang xếp hàng.** [Quyết định event bền vững thuộc sở hữu mục tiêu](../architecture/2026-07-31-goal-owned-durable-events.md) sau này không áp dụng phương án này: tool mục tiêu và prompt tiếp tục thực thi đã lập lịch sẽ expose trạng thái khi cần, còn việc lưu bền vững domain không phụ thuộc vào kết quả hàng đợi.
- **Lưu bền vững trạng thái kích hoạt và tự khởi động lại** — không áp dụng, vì khi mở hoặc khôi phục phiên phải chờ input người dùng; giai đoạn bền vững ghi lại trạng thái, chứ không phải sự ủy quyền tiêu tốn thêm tài nguyên.
- **Tính mọi lượt phiên là Goal Round** — không áp dụng, vì cùng một phiên có thể chứa làm rõ của người dùng, kiểm tra và công việc không liên quan; chỉ lượt tiếp tục thực thi quy thuộc cho mục tiêu mới tiêu tốn ngân sách đó.
- **Thêm trạng thái mục tiêu hoặc trừu tượng vòng lặp tổng quát vào `dsh-agent-loop`** — không áp dụng, vì trạng thái và chính sách tiếp tục thực thi có thể tổ hợp qua plugin, động từ `Agent` và event hiện có, mà không cần cấp đặc quyền cho triển khai vòng lặp mặc định.

## Hệ quả

- Lịch sử mục tiêu là dữ liệu phiên thông thường, tiếp tục tồn tại sau khi lưu bền vững, khôi phục, nén (compaction) không liên quan, và fork phiên.
- Khôi phục và fork expose cùng giai đoạn bền vững, nhưng không thực hiện gì cho đến khi thay đổi resume tường minh kích hoạt mục tiêu.
- Snapshot đầy đủ giúp dễ kiểm tra, replay nghiêm ngặt và chiếu (project) theo kiểu last-wins, không thêm message chỉ dùng cho thay đổi vào lịch sử model.
- Kiểm tra số revision và vòng đời sẽ từ chối sớm bản ghi mục tiêu bị can thiệp, ghi một phần hoặc không nhất quán từ nhà sản xuất.
- Giới hạn Goal Round chỉ ràng buộc số lần tiếp tục thực thi; khi Goal Round, token, chi phí, thời gian hoặc giới hạn bên cung cấp dừng công việc, bên tiêu thụ chính sách sẽ ánh xạ chúng thành các lý do bị chặn khác nhau.

## Giới hạn đã biết và các việc tạm hoãn

- Miền này ghi lại trạng thái, nhưng không lập lịch Goal Round, không hủy lượt đang hoạt động, cũng không phân loại việc dừng bất thường.
- Bên ghi `complete` hoặc `blocked` có thẩm quyền cuối cùng; bộ đánh giá độc lập hoặc chứng chỉ hoàn thành được hoãn lại cho bên tiêu thụ chính sách triển khai.
- Mỗi phiên chỉ có một mục tiêu hiện tại; không tồn tại đồ thị mục tiêu song song hay kho lưu trữ mục tiêu liên phiên.
- Các plugin dùng chung cùng một ranh giới tiến trình đáng tin cậy. Plugin ghi trực tiếp vào phiên có thể giả mạo bản ghi mục tiêu; replay nghiêm ngặt sẽ phát hiện sự không nhất quán và khiến việc truy cập mục tiêu thất bại tại bản ghi vi phạm, nhưng không cách ly plugin hay sửa log.
- `GOAL_CHANGE_VERSION` không cam kết tương thích trước khi phát hành đầu tiên, cũng không cung cấp đường di trú.
