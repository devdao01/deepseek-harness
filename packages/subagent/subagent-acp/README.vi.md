# @deepseek-ai/dsh-subagent-acp

[English](README.md) | Tiếng Việt

Nhà cung cấp ACP (Agent Client Protocol) chạy mỗi subagent trong một tiến trình con hoàn toàn mới và điều khiển nó với vai trò client của Agent Client Protocol. Đây là phương án thay thế ngoài tiến trình cho spawn và fork: subagent (tác tử con) có runtime, phiên, cấu hình mô hình và tool riêng của nó.

## Khởi động và quyền sở hữu

`start(request)` phân giải thư mục làm việc của subagent trước, rồi lần lượt thực hiện `spawn` → ACP `initialize` → `newSession`, sau đó mới hoàn thành. Vì vậy, việc hoàn thành có nghĩa là phiên từ xa đã sẵn sàng và quyền sở hữu cũng đã được chuyển cho bên gọi. Khi spawn thất bại, initialize thất bại, tạo phiên mới thất bại, hoặc thất bại do bị hủy trước khi phát hành, lời hứa chỉ bị từ chối sau khi tiến trình con đã được thu hồi; còn nếu phân giải thư mục làm việc thất bại thì sẽ từ chối khi chưa spawn bất kỳ tiến trình nào.

Thư mục làm việc ưu tiên dùng giá trị ghi đè `cwd` đã cấu hình, nếu không thì dùng cwd của phiên cha đang thực hiện ủy thác, và tuyệt đối không dùng cwd của chính tiến trình server, vì cùng một tiến trình server phục vụ các phiên đến từ nhiều workspace. Giá trị lấy từ agent cha phải là đường dẫn tuyệt đối, trỏ tới một thư mục mà harness có thể đi vào (có quyền search, đây là yêu cầu đối với cwd của tiến trình con); chính đường dẫn đã phân giải đó đồng thời đóng vai trò cwd của tiến trình con và workspace của ACP `session/new`.

Id lần chạy trả về được sinh trong không gian tên của agent cha. Id phiên của server con chỉ dùng cho các lời gọi giao thức ACP, vì ACP chỉ đảm bảo id đó là duy nhất bên trong tiến trình con hoàn toàn mới ấy; nếu dùng nó làm id vòng đời ở phía cha thì có thể xung đột với một lần chạy từ xa khác hoặc với agent cục bộ.

Sau khi phát hành, nhà cung cấp gửi prompt và thu thập văn bản `agent_message_chunk` dạng stream vào `SubagentResult.output`. Lỗi prompt/truyền tải sẽ hoàn thành với `stopReason: 'error'`; nếu tín hiệu request bắt buộc hoặc yêu cầu dispose (giải phóng tài nguyên) yêu cầu hủy thì hoàn thành với `aborted`.

`dispose()` có tính idempotent. Nó gỡ bỏ listener tín hiệu, yêu cầu hủy ACP khi khả thi, rồi dùng các thao tác do seam này định nghĩa để chạy thang tháo dỡ riêng của backend này (`disposeAcpChild`): trước hết đóng stdin và chờ `disposeEofGraceMs` để tiến trình con dừng hẳn theo cách hợp tác, sau đó kích hoạt bước leo thang `terminate()` của handle (SIGTERM, thời gian ân hạn spawn, SIGKILL — trên Windows thì kết thúc cưỡng bức trực tiếp), rồi chờ bên chịu trách nhiệm tiến trình con đưa ra bằng chứng thoát của toàn bộ cây tiến trình. Mỗi lần chạy đều dùng một tiến trình hoàn toàn mới; chưa triển khai pool tiến trình.

## Năng lực và context

ACP không khai báo bất kỳ năng lực khởi động nào, vì tiến trình hiện tại không thể ép buộc runtime về độ sâu, bộ lọc tool, persona hay đầu ra có cấu trúc của subagent từ xa. Nó cũng báo cáo `inheritsParentContext: false`: phiên từ xa bắt đầu từ trạng thái hoàn toàn mới, đầu vào duy nhất bắt nguồn từ agent cha là cwd workspace nói trên; context hội thoại không vượt qua ranh giới tiến trình.

## Cấu hình

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `providerName` | `acp` | Tên trong registry trên `ctx.subagents`. |
| `command` | Bắt buộc | Tệp thực thi được spawn ở mỗi lần chạy. |
| `args` | `[]` | Tham số lệnh. |
| `cwd` | cwd của phiên cha | Giá trị ghi đè thư mục làm việc cho tiến trình con và phiên ACP của nó; không được rỗng. Giá trị tương đối sẽ được phân giải khi nạp, lấy thư mục khởi động của harness làm gốc, và kết quả phải trỏ tới một thư mục mà harness có thể đi vào. |
| `permission` | `reject` | Tự động trả lời các yêu cầu quyền: từ chối, hoặc chọn tùy chọn `allow_once` hay `allow_always` đầu tiên. |
| `env` | `{}` | Môi trường tiến trình con tường minh, chồng lên môi trường tiến trình cha đã được dọn sạch thông tin xác thực. |
| `disposeEofGraceMs` | `6000` | Thời gian ân hạn sau EOF của stdin và trước khi kết thúc ở mức nền tảng phải là số dương, và không được lớn hơn [`MAX_TIMER_DELAY_MS`](../../util/timeout/README.md). |
| `disposeGraceMs` | `3000` | Thời gian ân hạn trên POSIX sau SIGTERM và trước SIGKILL (Windows kết thúc cưỡng bức trực tiếp), phải là số dương và không lớn hơn [`MAX_TIMER_DELAY_MS`](../../util/timeout/README.md). |

```yaml
- id: subagent-acp
  name: '@deepseek-ai/dsh-subagent-acp'
  config:
    providerName: acp
    command: node
    args: ['--import', 'tsx', './packages/examples/acp-demo/src/bin.ts', '--config', './examples/acp-agent/cordis.yml']
    permission: reject
    env:
      DEEPSEEK_API_KEY: !!js process.env.DEEPSEEK_API_KEY
```

## Ánh xạ lý do kết thúc

| ACP | Harness |
|---|---|
| `end_turn` | `completed` |
| `max_tokens` | `max-tokens` |
| `refusal` | `refusal` |
| `cancelled` | `aborted` |
| `max_turn_requests` hoặc giá trị không xác định | `error` |

## Ranh giới tiến trình

Tiến trình con được spawn qua seam [`dsh-subprocess`](../../subprocess/subprocess/README.md): bước dọn thông tin xác thực dùng chung trước hết loại bỏ các biến môi trường bị nghi là thông tin xác thực và những tên `DSH_*` đã có sẵn trong môi trường, các giá trị `config.env` tường minh được merge vào sau khi dọn (`DEEPSEEK_API_KEY` được chuyển tiếp có chủ đích sẽ được giữ lại, và những dữ kiện triển khai dạng `DSH_*` như `DSH_PERMISSION_MODE` cũng đến được tiến trình con theo cách tương tự — việc dọn chỉ loại bỏ các giá trị môi trường cũ trùng tên), stderr được kế thừa vào chính luồng của tiến trình cha, còn dispose thì áp dụng cửa sổ thời gian EOF của plugin này trước, rồi để bên chịu trách nhiệm tiến trình con thực hiện bước leo thang SIGTERM→SIGKILL và chờ toàn bộ cây tiến trình thoát. Định dạng truyền tải (wire format) của giao thức ACP mới là ranh giới tuần tự hóa thực sự; các giá trị subagent trong cùng tiến trình không bị clone vì mục đích phòng vệ.

Gói này không có default export. Nếu có, việc giải nén của Cordis loader sẽ che khuất metadata `inject` được đặt tên; xem [postmortem 0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md).

## Trải nghiệm mô hình

### Yêu cầu subagent

#### Những gì mô hình nhìn thấy

Subagent từ xa nhận nội dung tác vụ độc lập qua ACP, và sử dụng system prompt, tool cùng phiên hoàn toàn mới do chính tiến trình của nó cấu hình. Nó không nhận hội thoại của agent cha. Nhà cung cấp này không khai báo bất kỳ năng lực khởi động tùy chọn nào, nên service cục bộ sẽ từ chối các yêu cầu đòi hỏi persona, bộ lọc tool, ép buộc độ sâu hay đầu ra có cấu trúc, thay vì âm thầm bỏ qua những yêu cầu đó.

#### Ảnh hưởng tới Token

Subagent trả chi phí token cho context đầy đủ, độc lập của nó và cho lịch sử nhiều bước của nó. Những token này không bao giờ đi vào context của agent cha.

#### Ảnh hưởng tới KV Cache

Độc lập với cache request của agent cha. Mỗi subagent ACP chỉ có thể tái sử dụng tiền tố khi nhà cung cấp, mô hình, thành phần lắp ráp và lịch sử của chính nó đều giống nhau; ngoài ra, các bước của subagent chỉ tăng trưởng theo kiểu chỉ-thêm.

### Kết quả tool ở phía cha (gián tiếp)

#### Những gì mô hình nhìn thấy

Thông qua `dsh-tool-subagent`, agent cha chỉ nhận văn bản assistant dạng stream cuối cùng của subagent, hoặc lỗi lý do kết thúc chính xác do bên tiêu thụ đó đưa ra; không nhận thông điệp trung gian hay lưu lượng tool. Các yêu cầu đã bị hủy trước khi phát hành sẽ trở thành chính xác `Error: subagent request was aborted before the ACP child started`; các lỗi khởi động khác được truyền nguyên trạng dưới dạng `Error: <message>`.

#### Ảnh hưởng tới Token

Đầu vào của agent cha chỉ tăng thêm kết quả cuối cùng hoặc lỗi, nội dung phụ thuộc dữ liệu và được giữ lại cho tới khi nén (compaction). Bản thân nhà cung cấp này không thêm schema nào vào phía cha.

#### Ảnh hưởng tới KV Cache

Chỉ-thêm; nội dung hiển thị mới nằm sau tiền tố request có thể tái sử dụng, và không làm mất hiệu lực các mục KV Cache hiện có.

## Giới hạn đã biết và phần tạm hoãn

- **Mỗi lần chạy dùng một tiến trình hoàn toàn mới**: pool tiến trình bền vững thuộc về đợt tối ưu về sau (xem [Agent Note về seam](../../../.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.md)).
- **Chỉ hỗ trợ workspace cục bộ**: cwd đã phân giải là đường dẫn cục bộ giao cho tiến trình con trên cùng một máy; việc ánh xạ workspace cho agent ACP từ xa cần một năng lực backend riêng, và năng lực đó chưa được thiết kế ở đây.
- **Không hỗ trợ năng lực khởi động tùy chọn**: nhà cung cấp này không thể áp dụng `outputSchema`, giới hạn độ sâu, bộ lọc tool hay persona của harness cục bộ bên trong tiến trình từ xa, nên không khai báo các năng lực đó; service sẽ từ chối những yêu cầu cần đến chúng.
- **Chỉ thu thập văn bản `agent_message_chunk` đã được gửi**: server tự động hóa giữ dữ liệu suy luận (reasoning), hoạt động tool, kế hoạch và các dữ liệu trace khác trong nhật ký phiên của subagent, không phát ra qua ACP.
- **Tự động trả lời lời nhắc quyền** (`permission: allow | reject`): không hiển thị `session/request_permission` của subagent cho con người.
