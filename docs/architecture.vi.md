# Kiến trúc DeepSeek Harness

[English](architecture.md) | Tiếng Việt

Hãy đọc tài liệu này trước khi thay đổi bất cứ thứ gì dưới `packages/`. Tài liệu giả định bạn đã hiểu Cordis; nếu chưa, hãy đọc [nhập môn](cordis-primer.md) hoặc [hướng dẫn](cordis-tutorial/index.md) trước.

Khuyến khích dùng agent (tác tử) để khám phá codebase và hiểu kiến trúc của nó.

## Cordis

[Cordis](cordis-primer.md) là framework nền của dsh: các plugin đóng góp service, sự kiện có kiểu và các hiệu ứng phụ có thể hoàn tác vào một context dùng chung. Mọi phần của sản phẩm đều là plugin, bao gồm bộ điều hợp mô hình, registry công cụ, nhật ký phiên, và cả bản thân agent loop (vòng lặp tác tử), vì vậy mọi phần đều có thể thay thế từ cấu hình.

Không tồn tại một nhân đặc quyền cần vá: cách mở rộng dsh là gắn plugin bên cạnh các plugin khác, và mỗi mục đăng ký là một hiệu ứng phụ, sẽ được thu hồi khi plugin của nó được gỡ.

## Profile và bundle

`dsh` đang chạy là một cây plugin, được tạo thành từ các tầng xếp chồng theo thứ tự lúc khởi động.

**profile** là một bản lắp ghép có tên, lưu trong Harness home. Nó liệt kê các bundle mà nó xếp chồng, lưu các plugin ngoài cây do nó cài đặt, và giữ `cordis.patch.yml` của chính người dùng. `web` và `headless` được phát hành kèm dưới dạng mẫu.

**bundle** là định dạng phân phối cho các mục cấu hình Cordis cùng mã gắn kèm của chúng, nên nội dung nó chèn vào luôn có thể được các tầng bên trên vá.

Cả hai đều tự khai báo trong `package.json` của mình qua trường `dsh`: `dsh.profile` liệt kê các bundle của một profile, `dsh.bundle` trỏ tới tệp patch của một bundle.

[`dsh-base`](../packages/bundle/base/README.md) là tầng đầu tiên của mọi profile: bộ điều hợp mô hình, công cụ, lưu trữ bền vững, chính sách sandbox và phê duyệt, cài đặt, thông tin xác thực, telemetry. [`dsh-web-app`](../packages/bundle/web-app/README.md) bổ sung ứng dụng trình duyệt; [`dsh-headless`](../packages/bundle/headless/README.md) bổ sung bộ chạy một lần và hoàn toàn không kèm máy chủ.

Các tầng được áp dụng lên một danh sách mục rỗng theo thứ tự sau: trước tiên áp dụng từng bundle theo thứ tự profile liệt kê, rồi tới `cordis.patch.yml` của profile, tiếp đó là tệp cùng loại ở cấp home, và cuối cùng là các overlay `--patch` tùy ý. Một patch định vị một mục theo id rồi thay toàn bộ config của nó, hoặc chèn mục mới.

Để xem cây cấu hình mà máy bạn thực sự khởi động:

```sh
dsh --profile web --dump-config
```

Bất kỳ mục nào nó in ra đều có thể được thay bằng patch của chính bạn.

Cơ chế lắp ghép xem [app-boot](../packages/boot/app-boot/README.md#profiles); các trường cấu hình xem [danh mục cấu hình](config-catalog.md) được sinh ra.

## Package lõi

Dưới đây là một số package lõi đóng góp nội dung vào cây Cordis.

| Package | Trách nhiệm | Khóa `ctx` |
|---|---|---|
| [`core/session`](subsystems/session.md) | Nhật ký `SessionEvent` chỉ ghi thêm và kho lưu trong bộ nhớ | `ctx.sessions` |
| [`core/system-prompt`](subsystems/system-prompt.md) | Lắp ghép các mảnh prompt và schema công cụ | `ctx.systemPrompt` |
| [`core/tools`](subsystems/tools.md) | Registry công cụ theo phạm vi và pipeline thực thi có kiểm soát | `ctx.tools` |
| [`core/agent`](subsystems/core.md) | Giao diện `Agent`, registry agent đang hoạt động và sự kiện `agent/*` | `ctx.agents` |
| [`core/agent-loop`](subsystems/core.md) | Bộ điều khiển mặc định hiện thực giao diện đó | `ctx.agentLoop` |
| [`core/scope`](subsystems/scope.md) | Nguyên thủy đăng ký theo phạm vi từng agent | Thư viện, không có khóa ctx |
| [`llm/llm`](subsystems/llm-streaming.md) | Từ vựng thông điệp và luồng, cùng seam bộ điều hợp | `ctx.llm` |

<a id="events"></a>

## Sự kiện

Sự kiện chính là điểm mở rộng, và chọn đúng miền sự kiện là quyết định đầu tiên của hầu hết thay đổi.

- **Sự kiện phiên** là những sự thật bền vững được ghi thêm vào nhật ký và phát qua `session/event`. Dùng nó khi một sự thật phải còn tồn tại sau khi nạp lại.
- **Sự kiện agent** (`agent/*`) mang theo `Agent` đang hoạt động: inbox, bước, trạng thái, request, kiểm chứng, chạy tiếp. Dùng nó khi cần quan sát hoặc chặn công việc đang diễn ra.
- **Sự kiện năng lực** cho phép gắn chính sách và bộ điều hợp vào một seam (`fs/*`, `tools/*`, `telemetry/*`) mà không cần import vòng.

[Bản đồ sự kiện](event-producer-consumer.md) liệt kê bên sản xuất và bên tiêu thụ của từng sự kiện.

<a id="turn-flow"></a>

## Luồng lượt

Một **bước** là một request tới mô hình cộng với các công cụ mà nó gọi. Một **lượt** gồm không hoặc nhiều bước: nó mở ra trước khi nhận đầu vào đầu tiên, và đóng lại khi không còn nợ công việc nào.

```text
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas
  -> agent/pre-step                   reject | enter(messages)
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     append entered messages as user/message
     derive model history from the log
     agent/request -> llm/stream -> assistant/chunk* -> assistant/message
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
  -> agent/turn-stopping
turn/end
```

`turn/*`, `step/*`, `user/message`, `assistant/*` và `tool/*` là các sự kiện phiên bền vững; phần còn lại là những điểm mở rộng thời gian thực thuộc ba miền sự kiện. `agent/pre-step`, `agent/request`, `llm/stream` và ba sự kiện `tools/*` là waterfall (sự kiện thác nước), listener của chúng phải gọi `next()` mới ủy quyền tiếp được; `agent/turn-stopping` là sự kiện serial, không có `next()`.

Đầu vào đến bộ điều khiển qua cùng một inbox. Một số thông điệp đánh thức nó ngay lập tức; ngữ cảnh được tiêm sẽ nằm lại trong inbox cho tới khi một thông điệp khác đánh thức nó.

`agent/pre-step` quyết định mô hình nhìn thấy gì. Listener có thể viết lại các thông điệp đã nhận, hoặc từ chối thẳng chúng; khi lần nhận đầu tiên bị từ chối hoặc bị viết lại thành rỗng, một lượt bền vững không chứa bước nào vẫn được đóng lại, nên nhật ký sẽ ghi nhận lần thử đó. Mỗi bước đọc các mảnh prompt và schema công cụ do plugin đăng ký.

Chi tiết xem [sơ đồ tuần tự](agent-lifecycle.md), [pipeline công cụ](tool-execution-pipeline.md) và [hủy bỏ cùng khôi phục lỗi](subsystems/core.md#the-agent-handle).

## Nhật ký phiên

Nhật ký phiên là nguồn của ngữ cảnh mà mô hình nhìn thấy. `deriveMessages()` chiếu ra lịch sử mô hình từ đó, còn các sự kiện `assistant/chunk` thô thì đảm bảo độ trung thực khi phát lại và trên UI. Fork, khôi phục, transcript (bản ghi văn bản), telemetry và lưu trữ bền vững đều dẫn xuất từ luồng sự kiện này.

**Mô hình nhìn thấy tức là đã được ghi.** Mọi thứ đến được request tới mô hình đều phải tái dựng được từ nhật ký, và có một bất biến runtime khẳng định điều đó. Do vậy, thêm một đầu vào mà mô hình nhìn thấy nghĩa là thêm một sự kiện phiên: mở rộng `SessionEventMap` và render từ nhật ký.

## Seam năng lực

Một **seam** là một năng lực có thể thay thế, gồm ba vai trò: **Service Definition** khai báo giao diện, **Service Provider** hiện thực nó, và **Consumer** sử dụng nó (thường là công cụ hướng tới mô hình). Một package có thể gộp nhiều vai trò, nhưng một vai trò đơn lẻ tự nó không phải là seam; thêm một năng lực nghĩa là thiết kế cả ba cùng nhau ([bản đồ năng lực](capability-seams.md)).

Seam chính là lý do vì sao thay một provider có thể thay đổi cả sản phẩm. Provider hệ tệp và tiến trình dùng chung một thế giới thực thi, nên trỏ chúng tới sandbox từ xa cũng là dời cả Bash, PTY và LSP theo, không cần fork riêng cho từng provider. [Provider subagent](subsystems/subagent.md) đứng sau cùng một giao diện cũng khác nhau rất nhiều, từ tạo mới một agent con cho tới ủy quyền một lượt cho sản phẩm khác.

## Hành vi mới thuộc về đâu

Hành vi mới gắn vào các điểm mở rộng đã được tài liệu hóa. Khi thay đổi chính vòng lặp, bản đồ này cũng được cập nhật theo.

| Mục tiêu | Cơ chế |
|---|---|
| Thêm nhà cung cấp mô hình | Đăng ký bộ điều hợp của nó trên `ctx.llm` |
| Thêm năng lực hướng tới mô hình | Đăng ký trên `ctx.tools`; schema của nó tham gia lắp ghép prompt |
| Cho một phiên có tập năng lực khác | Lắp ghép một agent preset; các dòng service trong đó cần realm `isolate` |
| Thêm thực thi shell | Đăng ký backend `ctx.shell`; backend cục bộ spawn tiến trình qua `ctx.subprocess` |
| Thêm thực thi terminal bền vững | Đăng ký backend `ctx.terminals` và `dsh-tool-terminal` |
| Thêm lệnh người dùng | Đăng ký trên `ctx.commands`; nó phân phối được mà không cần lượt của mô hình |
| Thêm công việc nền | Đăng ký trên `ctx.jobs`; công cụ `job_*` chịu trách nhiệm thu thập hoặc dừng |
| Thêm truy cập hoặc chính sách hệ tệp | Đăng ký provider `ctx.fs`, hoặc lắng nghe sự kiện `fs/*` |
| Giới hạn các tiến trình được khởi chạy | Dùng backend `ctx.sandbox`; bên tiêu thụ bọc argv trước khi khởi chạy tiến trình |
| Chặn request, công cụ hoặc lượt | Dùng sự kiện `agent/*` hoặc `tools/*` tương ứng; `agent/turn-stopping` sẽ dừng lượt |
| Thêm ngữ cảnh mà mô hình nhìn thấy | Gọi `agent.inject()`; nó sẽ rơi vào request được chấp thuận kế tiếp |
| Thêm tích hợp UI hoặc trình soạn thảo | Điều khiển `ctx.agents` và render từ `session/event` |
| Thêm Chat node cho Web Client | Đăng ký `ConversationNodeDefinition` + keyed renderer |
| Thêm trạng thái phiên bền vững | Mở rộng `SessionEventMap`; render và phát lại từ nhật ký |
| Sinh tiêu đề phiên | Đăng ký provider `ctx.sessionTitle` duy nhất |
| Quản lý mục tiêu trong cùng phiên | Dùng `ctx.goals`; chạy tiếp qua `agent/*` |
| Fork phiên đang hoạt động | `ctx.sessions.fork(source, boundary?, childSessionId?)` |
| Giới hạn mục đăng ký cho một agent duy nhất | Dùng `agent.ctx` của agent đó |

[Sổ tay mở rộng](cookbook/extension-cookbook.md) ánh xạ tính năng sang năng lực, đồng thời lập chỉ mục các hướng dẫn từng bước cho [package](cookbook/adding-a-package.md), [công cụ](cookbook/adding-a-tool.md), [bộ điều hợp LLM (mô hình ngôn ngữ lớn)](cookbook/adding-an-llm-adapter.md), [Chat node](cookbook/adding-a-conversation-node.md) và [thẻ cài đặt](cookbook/adding-a-settings-card.md).
