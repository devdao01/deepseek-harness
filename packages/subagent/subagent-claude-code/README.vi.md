# @deepseek-ai/dsh-subagent-claude-code

[English](README.md) | Tiếng Việt

Gói (package) này đăng ký nhà cung cấp subagent cố định `claude-code`. Sau mỗi lần chấp nhận một yêu cầu chạy, nó gọi Claude Agent SDK chính thức ngay trong workspace của phiên phát sinh ủy thác, phân giải tệp thực thi `claude` gốc thông qua service tiến trình con dùng chung, gửi một tác vụ văn bản tự chứa, và chỉ trả về câu trả lời cuối cùng theo giao ước kết quả dùng chung của [`dsh-subagent`](../subagent/README.md).

## Khởi động và quyền sở hữu

`start(request)` chỉ chấp nhận chuỗi khối văn bản không rỗng, và xác định cwd của agent con dựa trên phiên cha. Nó tạo một `AbortController` riêng, gọi `query()` của SDK chính thức, và chỉ phát hành lần chạy này sau khi hook `spawnClaudeCodeProcess` của SDK đã cung cấp handle CLI đang hoạt động do [`dsh-subprocess`](../../subprocess/subprocess/README.md) quản lý. Nếu xảy ra thất bại hoặc bị hủy trước khi phát hành, nó sẽ đóng query, kết thúc mọi cây tiến trình đã thu được và chờ chúng thoát, rồi mới từ chối lời gọi `start()`.

SDK nhận tác vụ được ghép nguyên trạng từ các khối văn bản. Nhà cung cấp lặp trọn vẹn luồng thông điệp của SDK, và chỉ chấp nhận thông điệp `result` thỏa mãn các điều kiện sau: `subtype: "success"`, `is_error: false` và `result` không phải khoảng trắng, sau đó iterator còn phải kết thúc bình thường. Mọi kiểu lỗi con của SDK, thông điệp thành công nhưng bị đánh dấu lỗi, thiếu câu trả lời, iterator thất bại, giao thức thất bại hoặc tiến trình thất bại đều ánh xạ thành `error`; nhà cung cấp này không sinh ra `max-tokens` hay `refusal`.

Việc hủy cục bộ sẽ thắng trong cuộc đua kết quả và ánh xạ thành `aborted`. `dispose()` (giải phóng tài nguyên) có tính idempotent: nó hủy lần chạy này, yêu cầu đóng query của SDK, gọi cơ chế kết thúc cây tiến trình theo từng cấp dùng chung, và chờ toàn bộ cây tiến trình thoát. Việc đóng êm của SDK chỉ diễn đạt ý định ở mức giao thức; việc tiến trình đã dừng hẳn hay chưa vẫn lấy handle tiến trình con làm chuẩn. Thất bại kết quả và thất bại dọn dẹp độc lập vẫn tách biệt với nhau.

## Thiết lập gốc và tương tác

Nhà cung cấp cố ý bỏ qua tùy chọn `settingSources` của SDK. Do đó, SDK chính thức sẽ đọc các thiết lập Claude thông thường ở mức người dùng, dự án và cục bộ của máy host, tương đối so với cwd của phiên cha, bao gồm cả trạng thái tài khoản gốc và cấu hình sản phẩm. Nhà cung cấp không sao chép cũng không lọc các tệp này, và cũng không tạo hay sửa trạng thái đăng nhập.

Mỗi query đều đặt `persistSession: false` và vô hiệu hóa `AskUserQuestion`. Nhà cung cấp không đặt `canUseTool`, elicitation hay callback hội thoại, nên tương tác trong chế độ không người trực sẽ thất bại qua SDK, chứ không chờ một giao diện người dùng mà nhà cung cấp này không chịu trách nhiệm.

## Năng lực và context

Nhà cung cấp này không khai báo bất kỳ năng lực khởi động tùy chọn nào, và báo cáo `inheritsParentContext: false`. Claude Code nhận tác vụ văn bản độc lập và cwd của phiên cha, nhưng không nhận hội thoại, persona, bộ lọc tool, chính sách độ sâu hay giao ước đầu ra có cấu trúc của phiên cha. Mỗi lần chạy đều có query SDK, controller hủy, tiến trình CLI và phiên sản phẩm không lưu bền riêng của nó.

## Cấu hình

| Khóa cấu hình | Mặc định | Ý nghĩa |
|---|---|---|
| `env` | `{}` | Môi trường SDK/CLI được chỉ định tường minh, chồng lên môi trường cha sau khi cơ chế dùng chung đã dọn sạch thông tin xác thực. |
| `disposeGraceMs` | `3000` | Thời gian ân hạn giữa các cấp kết thúc của bên chịu trách nhiệm cây tiến trình dùng chung, đơn vị mili giây, phải là giá trị dương hữu hạn và không được lớn hơn [`MAX_TIMER_DELAY_MS`](../../util/timeout/README.md) dùng chung của repo; sau đó việc giải phóng tài nguyên sẽ chờ toàn bộ cây tiến trình thoát. |

Môi trường production phân giải `claude` từ `PATH` của thế giới thực thi tiến trình con sau khi đã dọn thông tin xác thực, rồi áp dụng các mục `env` tường minh, và giao đường dẫn thu được cho SDK dưới dạng `pathToClaudeCodeExecutable`. Trên Windows, đường dẫn `.cmd` hoặc `.bat` đã phân giải được giao cho `cmd.exe /v:off` khai triển một lần dưới dạng giá trị môi trường có dấu nháy và chỉ dùng cho lần spawn này, nên các ký tự đặc biệt trong đường dẫn hợp lệ vẫn chỉ là dữ liệu. SDK đã khóa phiên bản sau đó đặt các tùy chọn dòng lệnh cố định ở cuối dòng lệnh của cmd; những tùy chọn này không chứa ký tự đặc biệt của cmd, và cũng không phải argv Windows thông thường. Thiết lập gốc và xác thực tiếp tục là nguồn có thẩm quyền. Plugin này không cài thêm một bản CLI khác, không chọn mô hình, không tạo thư mục chính của sản phẩm, không thực hiện đăng nhập và cũng không dò tài khoản. Các biến môi trường mang đặc trưng thông tin xác thực sẽ bị dọn trước khi các giá trị ghi đè `env` tường minh có hiệu lực, nên API key hay token dành cho tiến trình con phải được cung cấp tường minh trong cấu hình đó. Trừ khi bị ghi đè, các biến endpoint không phải thông tin xác thực như `ANTHROPIC_BASE_URL` cùng các biến môi trường thông thường như `PATH` và `HOME` vẫn được kế thừa.

Bản `dsh` production không cài đặt hay mount nhà cung cấp tùy chọn này. Profile chọn bật nó phải cài `@deepseek-ai/dsh-subagent-claude-code` và mount một lần trên host plane (mặt phẳng host); bản thân việc nạp nhà cung cấp không khởi động tiến trình Claude trước khi tool được gọi. Agent Preset đầy đủ mang theo dòng tool sản phẩm tương ứng và đặt `disabled: true`; sao chép một preset rồi xóa trường này là có thể chỉ phơi bày `subagent_claude_code` cho agent được lắp ráp từ bản sao đó. Chính sách `one-shot` của nó khiến các lời gọi bỏ qua `run_in_background` hoặc truyền `false` tiếp tục chờ ở tiền cảnh, còn truyền tường minh `true` sẽ trả về Job ID do agent cha sở hữu, dùng cho `job_output` hoặc `job_kill`. base host (host cơ sở) và preset đầy đủ đã cung cấp sẵn registry job dùng chung và các tool điều khiển.

Đoạn lắp ráp độc lập dưới đây trình bày đầy đủ các năng lực tường minh. Profile dựa trên `@deepseek-ai/dsh-base` giữ nguyên dòng Job đã có, chỉ thêm dòng nhà cung cấp sản phẩm và bật dòng tool của preset, không được mount trùng service Job.

```yaml
- id: subagent-claude-code
  name: '@deepseek-ai/dsh-subagent-claude-code'
  config:
    env:
      ANTHROPIC_API_KEY: !!js process.env.ANTHROPIC_API_KEY

- id: jobs
  name: '@deepseek-ai/dsh-jobs-local'

- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'

- id: tool-subagent-claude-code
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: claude-code
    toolName: subagent_claude_code
    backgroundMode: one-shot
    maxDepth: provider-managed
```

## Tương thích sản phẩm và bằng chứng

Phụ thuộc runtime được khóa chính xác ở `@anthropic-ai/claude-agent-sdk@0.3.220`. Lần chạy production sử dụng bản cài `claude` gốc. Bài kiểm thử sản phẩm thật không cần khóa dùng CLI Claude Code 2.1.220 do SDK phân phối làm fixture (dữ liệu chuẩn bị trước cho test) tất định, và chạy qua cùng bộ đường dẫn phân giải tệp thực thi gốc và đường dẫn shim batch trên Windows; bài kiểm thử này không khẳng định tương thích với mọi phiên bản cài đặt riêng lẻ. Tổ hợp Loader chứng minh hai gói sản phẩm có thể cùng tồn tại mà không khởi động bất kỳ sản phẩm nào.

Giấy phép phân phối giới hạn ở tư cách chủ sở hữu dự án bao trùm SDK chính thức và tải trọng CLI／nền tảng chính thức mà mỗi phiên bản SDK khai báo. [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md) công bố tập đóng tải trọng tùy chọn hiện tại, nhưng không xác nhận rằng các điều khoản khai báo trong đó thuộc loại giấy phép dễ dãi; các phụ thuộc runtime không liên quan và không dễ dãi khác vẫn khiến cổng kiểm tra khai báo bên thứ ba thất bại.

## Trải nghiệm mô hình

### Yêu cầu của agent con

#### Những gì mô hình nhìn thấy

Agent con Claude Code nhận tác vụ văn bản độc lập trong một query SDK hoàn toàn mới. Workspace của nó là cwd của phiên cha; mô hình, chỉ dẫn hệ thống, tool, quyền và xác thực của nó đến từ thiết lập Claude gốc và bản cài sản phẩm trên máy host.

#### Ảnh hưởng tới token

Agent con phải chịu chi phí token cho context và query Claude Code độc lập. Token của agent con không đi vào context của agent cha.

#### Ảnh hưởng tới KV Cache

Việc này độc lập với cache request của agent cha. Khả năng tái sử dụng chỉ phụ thuộc vào mô hình, chỉ dẫn, tool, thiết lập gốc và query hoàn toàn mới của chính Claude Code.

### Điều phối và kết quả ở phía cha (gián tiếp)

#### Những gì mô hình nhìn thấy

Thông qua `dsh-tool-subagent`, lời gọi tiền cảnh khiến mô hình cha nhìn thấy câu trả lời cuối cùng của Claude Code thỏa mãn điều kiện thành công nghiêm ngặt, hoặc nhìn thấy lỗi nguyên trạng do bên tiêu thụ đưa ra khi kết quả chưa hoàn tất. Lời gọi chạy nền sẽ trả về Job id trước; sau đó mặt phẳng điều khiển job dùng chung sẽ gửi thông báo hoàn tất, phơi bày câu trả lời cuối cùng và trạng thái qua `job_output`, và cho phép `job_kill` yêu cầu hủy. Suy luận, hoạt động tool, thông điệp trung gian, stderr, khác biệt workspace, thông tin sử dụng và định danh sản phẩm của Claude Code đều không được sao chép sang phiên cha.

#### Ảnh hưởng tới token

Đầu vào tiền cảnh tăng thêm nội dung câu trả lời cuối cùng hoặc lỗi được giữ trong kết quả tool. Đầu vào chạy nền còn bao gồm xác nhận khởi động, thông báo hoàn tất, cùng kết quả của `job_output`, `job_kill` hoặc trạng thái về sau; token của tác vụ con vẫn không đi vào context của agent cha. Bản thân nhà cung cấp này không thêm schema tool nào ở phía cha.

#### Ảnh hưởng tới KV Cache

Chỉ-thêm: tiền cảnh thêm một kết quả sau tiền tố request cha có thể tái sử dụng, còn chạy nền sẽ tiếp tục thêm xác nhận khởi động Job, thông báo, cùng các kết quả điều khiển hoặc thu thập về sau. Điều phối chạy nền có thể thêm một lượt do thông báo đánh thức, nhưng những thông điệp này đều không viết lại tiền tố trước đó.

## Giới hạn đã biết và công việc tiếp theo

- **Mỗi lần chạy đều tạo mới một query và một tiến trình**: không hỗ trợ chạy tiếp, khôi phục, pooling, luồng tiến độ hay lưu bền phiên sản phẩm.
- **Thiết lập của host cố ý giữ tính thẩm quyền**: thiết lập ở mức dự án và người dùng có thể thay đổi mô hình, tool và hành vi; nhà cung cấp này không cung cấp chế độ production đã được lọc hay cách ly khỏi môi trường host.
- **Bản cài sản phẩm và trạng thái tài khoản vẫn do cơ chế gốc quản lý**: thiếu `claude`, không tương thích, cấu hình sai hay xác thực thất bại đều hiện ra dưới dạng lỗi khởi động hoặc lỗi chạy; plugin này không cung cấp trình cài đặt hay luồng đăng nhập.
- **CLI nền tảng của SDK vẫn nằm trong tập đóng cài đặt**: môi trường production bỏ qua nó và dùng `claude` do host cung cấp, nhưng phụ thuộc tùy chọn của SDK hiện tại vẫn được cài, và cung cấp fixture tương thích không cần khóa. Việc loại bỏ tải trọng này là một hạng mục tiếp theo riêng của tập đóng cài đặt sản phẩm.
- **Không có đường tương tác với con người**: `AskUserQuestion` bị vô hiệu hóa và các callback tương tác khác cũng không tồn tại, nên tác vụ cần phê duyệt hoặc đầu vào mới sẽ thất bại chứ không treo.
- **Tải trọng sản phẩm chỉ chứa văn bản cuối cùng**: suy luận, thông điệp trung gian, giao tiếp tool, thông tin sử dụng, stderr và khác biệt workspace vẫn chỉ nằm bên trong sản phẩm; Job id, thông báo và trạng thái dùng chung đến từ runtime job dùng chung.
- **Không có năng lực dùng chung tùy chọn**: với nhà cung cấp này, service dùng chung sẽ từ chối schema đầu ra, persona cho tác vụ con, lọc tool và ràng buộc ép độ sâu của harness.
- **Không có timeout theo thời gian thực trôi qua và không rollback tác dụng phụ**: công việc chạy dài do bên gọi hủy, và các tệp hay hệ thống bên ngoài đã bị thay đổi trước khi hủy sẽ không được khôi phục về trạng thái ban đầu.
