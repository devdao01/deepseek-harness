# Agent Note: Expose định danh phiên agent và vị trí log JSONL cho tool và hook

Status: implemented

[English](2026-07-10-agent-session-identity-and-log-location.md) | 中文

## Vấn đề

Agent (tác tử) có thể nhận biết workspace của mình qua `session.header.cwd`, nhưng model dùng bash không thể xác định đáng tin cậy phiên nào sở hữu lời gọi hiện tại, cũng không thể tìm ra transcript (bản ghi văn bản) bền vững ghi lại lời gọi đó. Việc tìm kiếm `./.sessions` tương đương với việc đoán cấu hình triển khai và bố cục JSONL; thư mục gốc tùy chỉnh, backend bền vững thay thế, khôi phục, fork, và các agent cha-con chạy đồng thời đều làm việc đoán này thất bại. Hook cũng cần vị trí transcript, và các plugin trong tương lai cũng có thể cần expose thêm các sự thật môi trường khác thuộc sở hữu của harness cho lệnh shell.

Ranh giới này phải duy trì hai thuộc tính: chủ sở hữu của sự thật quyết định cách giải quyết sự thật đó; mỗi tiến trình con nhận một snapshot cho mỗi lần thực thi, chứ không phải trạng thái toàn cục có thể biến đổi ở cấp tiến trình. Đặc biệt, harness lồng nhau không được rò rỉ các giá trị `DSH_*` trong môi trường của nó sang agent hiện tại, backend bền vững, hoặc tiến trình con có cấu hình có thể khác.

## Quyết định

Thêm một truy vấn vị trí đồng bộ, không tác dụng phụ, vào seam [`SessionPersistence`](../architecture/2026-06-14-session-persistence.md):

```ts
import type { SessionHeader } from '@deepseek-ai/dsh-session'

interface SessionLocation {
  readonly kind: string
  readonly path: string
}

interface SessionPersistence {
  locate(meta: SessionHeader): SessionLocation | undefined
}
```

`path` là đường dẫn tuyệt đối cục bộ tới log riêng mà backend đó dành cho `meta`; `kind` xác định hình thức biểu diễn của nó. JSONL trả về `{ kind: 'jsonl', path }` bằng cách dùng thư mục gốc đã được giải quyết và các hàm hỗ trợ đường dẫn. SQLite cùng bất kỳ backend nào không thể trung thực cung cấp một sản phẩm cục bộ theo từng phiên đều trả về `undefined`. Truy vấn này không tạo hay flush bất cứ thứ gì, do đó nó vẫn có thể báo cáo đường dẫn đích sẽ được tạo theo yêu cầu ngay cả khi file chưa tồn tại.

Gói bash hướng tới model có một registry `ctx.shellEnv`. Bên đóng góp khai báo tên ổn định, mỗi khóa `DSH_*` mà nó có thể trả về, mô tả của mỗi khóa, và `resolve(execution: ToolExecution)`. Hệ thống fail rõ ràng khi tên bên đóng góp trùng lặp, quyền sở hữu khóa trùng lặp, dùng khóa dành riêng, khai báo sai định dạng, hoặc output lúc runtime không được khai báo hay không phải chuỗi. Đăng ký thuộc về Cordis effect, và bị gỡ bỏ cùng lúc với fiber của plugin đóng góp. `list()` expose các khai báo mà không cần chạy resolver, nhờ đó API môi trường này có thể được liệt kê bởi công cụ chẩn đoán và các bên tiêu thụ prompt/UI trong tương lai.

Registry tái tạo lớp phủ (overlay) đáng tin cậy cho mỗi `ToolExecution` bash ở foreground và background:

- `DSH_HOME` luôn là đường dẫn tuyệt đối tới Harness home đã cấu hình. Thư viện độc lập [`@deepseek-ai/dsh-home-paths`](../../../../packages/util/home-paths/README.md) quy định thứ tự ưu tiên: `dshHome` tường minh, tiếp theo là `$DSH_HOME` trong môi trường, cuối cùng là `~/.dsh`.
- `DSH_SHELL=1` luôn tồn tại, dùng để đánh dấu tiến trình con bash hướng tới model do DeepSeek Harness quản lý.
- Khi lời gọi thực thi có agent liên kết, `DSH_SESSION_ID` tồn tại và bằng `agent.session.header.id`.
- Lớp chuyển đổi bền vững tích hợp sẵn cung cấp `DSH_SESSION_JSONL` với điều kiện `ctx.sessionPersistence.locate(header)` trả về `kind: 'jsonl'`.

Session persistence vẫn là chủ sở hữu sự thật: JSONL không phụ thuộc vào tool-bash, cũng không tự đăng ký biến shell; hook tiếp tục dùng trực tiếp `locate()`. tool-bash là lớp chuyển đổi biến sự thật bền vững thành quy ước shell. Các plugin khác cần expose sự thật cho shell dựa vào registry này, và tự đăng ký các khóa riêng của mình; chúng không sửa `process.env`.

Seam bash export `DSH_ENV_PREFIX` làm nguồn namespace duy nhất, và suy ra `DshEnvironmentKey` từ `typeof` của hằng số đó. tool-bash suy ra tên tích hợp sẵn và hướng dẫn cho model từ hằng số này, còn executor dùng hằng số này để lọc các giá trị đã có sẵn trong môi trường. Seam truyền lớp phủ được quản lý riêng biệt qua `ShellExecRequest.dshEnv`/`ShellExecSpec.dshEnv`: `env` thông thường vẫn là giao diện plugin trong tiến trình dùng chung mà hook sử dụng, còn `dshEnv` được ràng buộc kiểu về các khóa được quản lý. Executor cục bộ loại bỏ toàn bộ khóa được quản lý kế thừa trong môi trường, lần lượt áp dụng dọn dẹp thông thường, môi trường terminal và `env` tường minh, cuối cùng gộp snapshot `dshEnv` đáng tin cậy, do đó các mục trong `env` không bao giờ có thể đè lên giá trị được quản lý. Điều này đảm bảo giá trị bị thiếu nghĩa là nó thực sự không tồn tại ở hiện tại, chứ không phải được kế thừa từ lớp ngoài hay từ một harness trước đó. Tool hướng tới model vẫn bỏ qua tham số `env`/`stdin` do model cung cấp.

Mô tả tool bash chỉ giải thích quy ước bền vững: các sự thật môi trường của harness hiện tại được cung cấp qua các biến `$DSH_*` được quản lý, có thể xem khi cần. Nó không liệt kê các khóa dành riêng cho persistence, cũng không thêm mục hệ thống prompt vĩnh viễn. Schema tool đã được ghi trong request header, output tool được ghi lại là `tool/result`, do đó không cần thêm loại event phiên mới.

[Lớp cầu nối hook Claude Code và Codex](2026-06-30-hook-bridges.md) giải quyết vị trí transcript từ cùng seam persistence khi dựng payload. Codex dùng `transcript_path: string | null`; Claude Code giữ trường chuỗi của nó, và fallback về `''`. Truy vấn hook không vật chất hóa hay flush phiên.

## Khảo sát sản phẩm tương tự

Các sản phẩm tương tự tách định danh ổn định khỏi lưu trữ vật lý. Codex tiêm `CODEX_THREAD_ID` ổn định vào shell được spawn, còn recorder và giao diện hook chịu trách nhiệm cung cấp đường dẫn transcript. Claude Code cung cấp `session_id` và `transcript_path` qua input hook/state có cấu trúc. OpenCode mang định danh trong tool context có cấu trúc; Kimi Code khai triển placeholder phiên; Reasonix lưu đường dẫn phiên đang hoạt động trên controller. Quy tắc có thể áp dụng chung là: tiêm định danh tại ranh giới lời gọi, để tầng lưu trữ giải quyết vị trí, không bao giờ dùng biến toàn cục "phiên hiện tại" cấp tiến trình trong harness đồng thời.

## Ngữ nghĩa vòng đời và bền vững

Phiên mới nhận id trước lượt đầu tiên, do đó lời gọi bash đầu tiên của nó đã có thể đọc `DSH_SESSION_ID` và đích JSONL. File JSONL có thể chưa tồn tại cho đến khi checkpoint kết thúc lượt đầu tiên thành công, và khi một lượt vẫn chưa kết thúc, nó chỉ chứa phần tiền tố đã flush gần nhất. `DSH_SESSION_JSONL` là gợi ý vị trí, không phải chứng chỉ ủy quyền hay đảm bảo tính mới.

Thao tác khôi phục tái sử dụng header đã tải, do đó id và vị trí không đổi. Fork và spawn tạo id và vị trí phiên mới. Lời gọi cha và con mỗi bên tự giải quyết sự thật từ `ToolExecution.agent` của riêng mình; ngay cả khi lời gọi chồng lấp, mỗi lệnh vẫn nhận một snapshot bất biến. Thay thế session persistence service sẽ ảnh hưởng đến các lần thu thập sau đó, vì lớp chuyển đổi truy vấn `ctx.get('sessionPersistence')` tại thời điểm thực thi; bản thân registry bị ràng buộc trong phạm vi effect, và an toàn để dùng với HMR (hot module replacement).

`dshHome` là ngữ cảnh triển khai không phụ thuộc phiên. agent-core giải quyết một giá trị qua `@deepseek-ai/dsh-home-paths`, và truyền cùng giá trị đó cho cả tool-bash lẫn phát hiện skill (kỹ năng) cục bộ; các bên tiêu thụ độc lập gọi cùng resolver đó. Nếu cả `dshHome` cấp cao và `skills.local.dshHome` đều được cung cấp nhưng kết quả giải quyết khác nhau, việc tổ hợp sẽ thất bại, thay vì công khai các home mâu thuẫn nhau. Persistence có thể thay đổi độc lập mà không cần đóng băng sự thật của nó vào tiền tố phiên.

## Kiểm thử

Unit test bao phủ việc kiểm tra khai báo registry, giải phóng effect, thu thập theo từng lần thực thi, thứ tự ưu tiên `dshHome`, và thứ tự executor cục bộ dọn dẹp rồi tái tạo `DSH_*`. Test ghi request bao phủ snapshot foreground/background, không có lời gọi agent, persistence không tồn tại hoặc là JSONL, bỏ qua `env` của model, và cách ly cha-con. Test quy ước locator JSONL/SQLite cùng cả hai bộ test cầu nối hook đều khóa hai phương ngữ transcript có sẵn và không có sẵn.

Một integration test đầy đủ vòng lặp không cần key sẽ điều khiển agent loop thật, JSONL persistence, tool-bash và bash-local ở lượt đầu tiên. Tiến trình con in ra `DSH_HOME`, `DSH_SHELL`, id phiên, đích JSONL và giá trị canary cũ kế thừa; test kiểm tra giá trị hiện tại, biến cũ không tồn tại, file trước khi flush không tồn tại, và cuối cùng kiểm tra header persistence. Snapshot test cố định ghi lại mô tả bash thông thường trong request header. Quy ước này là thực thi cục bộ có tính xác định, không liên quan đến lựa chọn model, do đó không cần test có key.

## Các phương án thay thế đã cân nhắc

**Chỉ cung cấp id, rồi dùng `find`.** Tìm kiếm không thể biết thư mục gốc tùy chỉnh hay bố cục backend, và tồn tại race condition trong môi trường nhiều phiên.

**Chỉ cung cấp đường dẫn tuyệt đối.** Đường dẫn có thể không sẵn có, được tạo trễ, hoặc phụ thuộc vào hình thức biểu diễn, không thể dùng làm định danh phiên ổn định.

**Dùng `process.env` toàn cục.** Các agent chạy đồng thời sẽ đè lên nhau, harness lồng nhau cũng sẽ kế thừa giá trị "phiên hiện tại" đã cũ.

**Đặt mô tả persistence vào tiền tố phiên.** Service đang hoạt động có thể thay đổi qua HMR hoặc chuyển backend trong tương lai, trong khi tiền tố phiên vẫn bị đóng băng; hướng dẫn dành riêng cho persistence do đó sẽ trở nên lỗi thời.

**Dùng event kiểu waterfall (dạng thác nước) có kiểu.** Listener không chạy thì không thể khai báo quyền sở hữu, và listener sau đó có thể đè lên khóa mà không báo. Registry có thể phát hiện xung đột khóa ngay khi đăng ký, và vẫn có thể liệt kê được.

**Để mỗi backend persistence tự đăng ký biến môi trường bash.** Điều này sẽ đảo ngược hướng phụ thuộc, khiến tầng lưu trữ phụ thuộc vào một bên tiêu thụ cụ thể, và buộc các triển khai không dùng bash cũng phải đưa nó vào. Hook vẫn cần `locate()`.

**Thêm tool `session_info` hướng tới model.** bash đã cung cấp API truy vấn, thêm tool mới chỉ tốn thêm schema và một lượt gọi; registry có thể mở rộng cho các sự thật môi trường tương lai, không cần thêm một tool cho mỗi sự thật.

## Hệ quả

Mỗi tiến trình con bash hướng tới model đều nhận được Harness home hiện tại và định danh shell, lời gọi có agent liên kết còn nhận thêm định danh phiên ổn định. Lời gọi dùng backend JSONL có thể nhận đường dẫn đích tùy chọn; persistence không phải file sẽ trung thực bỏ qua giá trị đó. Các sự thật `DSH_*` được quản lý trong các tiến trình con này đến từ harness: hệ thống loại bỏ giá trị được quản lý đã có sẵn trong môi trường, thêm lại giá trị đáng tin cậy hiện tại vào cuối cùng, các mục `env` của bên gọi thông thường không thể đè lên chúng.

Namespace này có thể được phát hiện, nhưng không phải bí mật. Đường dẫn có thể tiết lộ thư mục gốc đã cấu hình, đích được tạo trễ cũng có thể không tồn tại hoặc đã lỗi thời, và lệnh có thể tự đè biến trong cú pháp shell riêng của nó. Bên tiêu thụ nên coi các giá trị này là thông tin liên kết và sự thật môi trường, kiểm tra metadata transcript khi tính quy thuộc là quan trọng, và dựa vào chính sách sandbox/hệ thống file thay vì tính bí mật của biến để hoàn thành việc ủy quyền.
