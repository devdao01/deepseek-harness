# Agent Note: product one-shot subagent dùng Job nền tổng quát

Status: implemented

[English](2026-08-12-product-subagent-one-shot-background-tasks.md) | 中文

## Vấn đề

Các nhà cung cấp Codex và Claude Code đã có khả năng chạy một task tự chứa và trả về một câu trả lời cuối cùng, còn `dsh-tool-subagent` cũng đã có khả năng đấu nối bất kỳ nhà cung cấp one-shot nào vào runtime Job nền tổng quát. Hàng tool sản phẩm đi kèm lại tắt đường này, nên dù việc ủy quyền và bước tiếp theo của agent độc lập với nhau, agent vẫn chỉ có thể chờ câu trả lời của product.

Việc công khai thực thi nền không được phép thêm session sản phẩm, trạng thái job riêng cho sản phẩm, thêm một bên chịu trách nhiệm hủy khác, hay thêm một giao thức kết quả khác. Cùng một lần chạy của nhà cung cấp vẫn phải chỉ chịu trách nhiệm cho một process hoặc query gốc và một câu trả lời cuối cùng, còn registry job hiện có tiếp tục chịu trách nhiệm về id, thu thập kết quả, hủy, dọn dẹp owner và thông báo hoàn tất.

## Quyết định

`dsh` bản production không cài đặt nhà cung cấp product tùy chọn. Profile nào chọn bật tích hợp product sẽ cài đặt `dsh-subagent-codex`, `dsh-subagent-claude-code`, hoặc cả hai, và gắn mỗi cái đúng một lần ở host plane. Agent Preset `standard`, `code` và `cordis` cấu hình hàng tool product tương ứng đang ngủ (disabled) với `backgroundMode: one-shot`; sau khi xóa field `disabled` của một hàng, tham số tùy chọn sẵn có `run_in_background` sẽ được công khai cho agent do preset đó tổ hợp ra. Khi bỏ qua tham số này hoặc truyền `false`, nó sẽ chờ ở foreground; khi truyền tường minh `true`, nó sẽ trả về Job id thuộc sở hữu của parent sau khi hoàn tất đồng bộ bước preflight và đăng ký Job, mà không chờ nhà cung cấp khởi động hay hoàn tất.

[Adapter nền one-shot tổng quát](2026-07-08-background-subagent-tasks.md) chịu trách nhiệm đăng ký và quyết toán ở nền. Nó khởi động cùng một [`SubagentRun`](2026-06-21-subagent-capability-seam.md), để signal hủy riêng của Job phủ lên việc khởi động và thực thi của nhà cung cấp, chờ `run.result` và `run.dispose()`, ánh xạ kết quả cuối cùng vào Job, và công khai trạng thái đó qua `job_output`, `job_list`, `job_kill` cùng thông báo hoàn tất hiện có. [Quyết định về nhà cung cấp product](2026-08-04-claude-code-and-codex-subagent-backends.md) tiếp tục chịu trách nhiệm về giao thức gốc, việc chọn câu trả lời, hủy cục bộ và việc dừng hẳn hoàn toàn cây process.

Quyết định này không thêm cấu hình nhà cung cấp, interface service, sự kiện, field giao thức, định dạng lưu trữ bền vững hay định danh product nào mới. Khác biệt giữa foreground và background chỉ nằm ở việc consumer hiện có nào đang chờ cùng một lần chạy one-shot đó.

### Quyền sở hữu và vòng đời

```text
product tool call
  -> omitted / false: tool call waits -> final answer or error -> run disposal
  -> true: Job preflight + owner cleanup
           -> starter begins provider startup under Job-owned signal
           -> Job record/id published and returned (startup remains pending)
           -> provider result + run disposal -> Job settlement + notice
                                              -> job_output reads / job_kill cancels
  -> parent disposal: Job owner cleanup cancels -> run disposal -> process exit
```

| Sự thật hoặc tài nguyên | Bên chịu trách nhiệm | Trách nhiệm của product tool | Kết quả quan sát được |
| --- | --- | --- | --- |
| Cài đặt và đăng ký nhà cung cấp product | Profile tường minh | Cài đặt package nhà cung cấp tùy chọn, và gắn ở host plane đúng một lần | Tên nhà cung cấp khả dụng, nhưng không khiến mọi lần cài đặt `dsh` production đều bao gồm package đó |
| Chọn và công khai product | Agent Preset | Gắn một tên tool cố định vào một nhà cung cấp cố định | Bật một hàng chỉ công khai đúng product tool tương ứng |
| Chọn foreground hay background | `dsh-tool-subagent` | Giải quyết `run_in_background` theo chính sách `one-shot` | Bỏ tham số thì chạy ở foreground; truyền tường minh `true` thì trả về Job id |
| Job id, trạng thái, output, hủy và thông báo | `ctx.jobs` và `dsh-tool-jobs` | Đăng ký và hiển thị lần chạy one-shot hiện có | Tool job tổng quát thu thập hoặc dừng lần chạy đúng cho parent tương ứng |
| Câu trả lời gốc và dừng hẳn process | Nhà cung cấp product và `dsh-subprocess` | Tạo ra một kết quả cuối cùng và giải phóng một cây process | Cả việc quyết toán Job lẫn trả về ở foreground đều chờ tài nguyên được giải phóng |

## Tổ hợp phát hành

Base production không đưa hai nhà cung cấp product tùy chọn vào bao đóng dependency. Profile nào chọn bật tích hợp product sẽ cài đặt và gắn một hoặc cả hai nhà cung cấp ở host plane. Mỗi preset đầy đủ giữ hai hàng product tool ở trạng thái disabled, và đóng góp tool điều khiển Job tổng quát vào phạm vi agent của chính nó; base host chịu trách nhiệm về registry Job dùng chung. Sau khi nhà cung cấp Profile tồn tại, người dùng sao chép một preset, rồi xóa `disabled` khỏi hàng product tương ứng; process product không khởi động trong lúc tổ hợp.

Nếu một tổ hợp tùy chỉnh độc lập bật thực thi nền one-shot, nó bắt buộc phải đồng thời cung cấp nhà cung cấp product lẫn năng lực Job tổng quát đầy đủ: `dsh-jobs-local` đóng vai trò nhà cung cấp Job, `dsh-tool-jobs` đóng vai trò consumer hướng tới model. Profile dựa trên `dsh-base` đã có sẵn năng lực Job, chỉ cần thêm nhà cung cấp product tùy chọn trước khi bật hàng tool preset. Product tool không có runtime Job vẫn có thể thực thi ở foreground, nhưng yêu cầu chạy nền tường minh sẽ thất bại ngay ở bước preflight Job hiện có, không phát hành id không thể thu thập được.

Tổ hợp product của ACP dùng cùng hàng product cố định và tool điều khiển job tổng quát. Snapshot schema không cần key của nó công khai `description`, `prompt` và `run_in_background` tùy chọn cho từng product tool đã bật, mà không gọi Codex, Claude Code hay model bên ngoài nào.

## Xác minh

Test tổ hợp Web gắn tường minh hai nhà cung cấp tùy chọn từ dependency anchor của examples trong repo, rồi khởi động bốn biến thể preset người dùng — không bật product nào, chỉ bật Codex, chỉ bật Claude Code, và bật cả hai — và kiểm tra mỗi product tool đã bật đều công khai `run_in_background` cùng với `job_output`, `job_list` và `job_kill`. Hai tổ hợp Loader do package chịu trách nhiệm chạy dưới `PATH` rỗng, kiểm tra cùng schema và tool điều khiển, và chứng minh việc load nhà cung cấp tường minh không khởi động process product. Snapshot ACP không cần key cố định schema product sau khi tổ hợp tường minh, còn bộ test hiện có của `dsh-tool-subagent` và job cố định giá trị mặc định foreground, đăng ký Job, thu thập output cuối cùng, hủy, thông báo hoàn tất, giải phóng tài nguyên owner và giải phóng tài nguyên nhà cung cấp.

## Phương án khác đã cân nhắc

**Để product tool tiếp tục chỉ hỗ trợ chạy foreground.** Cách này giữ schema tối thiểu, nhưng sẽ ngăn agent lên lịch công việc product độc lập, dù adapter Job nền one-shot tổng quát đã chịu trách nhiệm cho vòng đời cần thiết.

**Để việc ủy quyền product mặc định chạy nền.** Job one-shot cần thu thập kết quả sau đó, điều này khác với một subagent có thể tiếp tục (resumable) sở hữu session id bền vững riêng và giao kết quả quyết toán riêng. Foreground tiếp tục là giá trị mặc định tương thích, background tiếp tục là lựa chọn lên lịch tường minh.

**Để trạng thái session gốc của Codex hoặc Claude Code chịu trách nhiệm vòng đời nền.** Điều này sẽ tạo ra id, trạng thái, hủy và ngữ nghĩa khôi phục riêng cho từng nhà cung cấp, nằm ngoài registry job tổng quát. Nhà cung cấp tiếp tục chỉ tạo ra kết quả one-shot, và giữ id gốc như một sự thật riêng tư.

**Thêm tool output, wait hoặc kill riêng cho product.** Tool điều khiển độc lập sẽ lặp lại giao thức job tổng quát, và dạy mỗi nhà cung cấp một workflow thu thập kết quả khác nhau. Các tool `job_*` hiện có đã bao phủ mọi thao tác cần thiết.

**Đồng thời thêm session product có thể tiếp tục.** Việc khôi phục, tương tác tiếp theo, tiến độ và session product bền vững cần một quy ước product và quyền sở hữu vòng đời mới. Quyết định này chỉ công khai đường nền one-shot đã được hiện thực hóa sẵn.

## Hệ quả

Agent có thể tiếp tục làm việc khác trong khi Codex hoặc Claude Code xử lý một task one-shot độc lập, sau đó thu thập câu trả lời cuối cùng hoặc hủy lần chạy đó qua cùng tool điều khiển Job dùng chung với các producer nền khác. Bên gọi ở foreground tiếp tục nhận được hành vi kết quả và lỗi như trước.

Mỗi lần ủy quyền product vẫn khởi động một process hoặc query gốc hoàn toàn mới, coi văn bản cuối cùng là payload product duy nhất, và kết thúc bằng việc giải phóng tài nguyên nhà cung cấp cùng thoát toàn bộ cây process. Lệnh gọi nền còn công khai thêm Job id tổng quát, trạng thái, thông báo hoàn tất, và kết quả thu thập hoặc hủy. Job nền chỉ tồn tại trong process hiện tại và do parent sở hữu: nó không tiếp tục sống sau khi parent giải phóng tài nguyên, không công khai hoạt động trung gian của product, và cũng không khiến cuộc hội thoại product trở nên có thể khôi phục được. Chỉ khi Profile tường minh cài đặt tích hợp product thì bản cài production mới gánh chi phí tương ứng; bất kỳ tổ hợp nào công khai tham số nền cũng đồng thời phải giữ cho nhà cung cấp Job tổng quát và tool điều khiển luôn khả dụng.
