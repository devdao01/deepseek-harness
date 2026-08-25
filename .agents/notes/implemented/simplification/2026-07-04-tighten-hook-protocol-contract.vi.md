# Agent Note: Siết chặt giao ước hook-protocol — dialect, các trường bị vứt bỏ, giá trị mặc định trùng lặp và ngữ nghĩa `hook/result` do lib sở hữu

Status: implemented

[English](2026-07-04-tighten-hook-protocol-contract.md) | Tiếng Việt

## Vấn đề

Có bốn phần trong giao ước `dsh-hook-protocol`/bridge không tuân theo chuẩn mực mà [Agent Note về subagent observe/enrich](../../archived/feature/2026-06-30-subagent-observe-enrich.md) đã ghi lại — tài liệu đó đã xóa trường vòng đời `agentType` vì thiếu bên tiêu thụ, còn các mục dưới đây thì không qua được cùng phép thử ấy:

1. **Biến thể `'native'` của `HookDialect`** (`packages/hooks/hook-protocol/src/types.ts`) không có bên tạo ra — bridge sẽ gắn nhãn `'claude'` và `'codex'`; nơi duy nhất trong toàn bộ mã nguồn dựng ra `'native'` là chính unit test của thư viện đó. JSDoc của bản thân trường này định nghĩa `dialect` là «bridge đang chạy nó», mà native thì không phải bridge: [Agent Note về điểm mở rộng chặn bắt](../feature/2026-06-30-interception-extension-points.md) ghi rằng hook native không phải một gói, và «plugin native có thể dùng Decision có kiểu mà không cần log hook bền vững»; ví dụ thực hành plugin native chủ lực khẳng định đúng điều đó (hoàn toàn không có sự kiện `hook/*`).
2. **`HookOutput.suppressOutput`** (cùng tệp) được codec phân tích rồi bị vứt bỏ trên mọi đường dẫn: không nhánh bridge nào xử lý nó, không có fold hợp nhất, không có warn, không có dòng deferred-list — trong tất cả những trường cùng loại «được phân tích nhưng không được thực hiện», nó là trường duy nhất không có tuyên bố hoãn rõ ràng (`updatedInput` → một dòng log warn cộng với [đề xuất pre-tool-input-rewrite](../../proposed/feature/2026-06-30-pre-tool-input-rewrite.md); `systemMessage` → một dòng log warn cộng dòng deferred trong README; `continue`/`stopReason` → một mốc neo `TODO(hook-continue-false)` cộng bản ghi decision `'stop'`). Xét về mặt cấu trúc thì căn bản chẳng có gì để chặn cả: stdout của hook không bao giờ đi vào bất kỳ transcript (bản ghi văn bản) nào; ngữ cảnh chỉ chảy vào qua `additionalContext`, và log cũng chỉ ghi `decision`/`stderrSummary`. Do đó, tác giả hook đặt `suppressOutput: true` sẽ nhận được một thao tác rỗng không tiếng động, và không hề có cảnh báo nào.
3. **`defaultTimeoutMs` được đặt mặc định lặp lại bằng các literal trôi nổi trong cả hai cấu hình bridge** — `.default(600_000)` của schema cộng thêm một dự phòng `?? 600_000` (`packages/hooks/hooks-claude-code/src/index.ts`, `packages/hooks/hooks-codex/src/index.ts`), khiến một hằng số ở cấp giao thức có tới hai nơi sở hữu trong mỗi bridge, và hai bridge có thể lặng lẽ phân kỳ về giá trị mặc định dùng chung. *Theo quy tắc no-hardcoded-tunables, núm chỉnh này vẫn là cấu hình tường minh do bridge sở hữu (bên cạnh `stderrSummaryMaxChars`); thứ cần sửa là nơi sở hữu literal.*
4. **Ngữ nghĩa của `hook/result` tồn tại trong hai bridge (mỗi bên một bản), chứ không nằm ở lib sở hữu sự kiện đó.** `summarize()` — quy tắc cắt ngắn stderr — giống hệt từng byte trong `packages/hooks/hooks-claude-code/src/index.ts` và `packages/hooks/hooks-codex/src/index.ts`; quy tắc chuỗi decision `output.decision ?? (output.continue === false ? 'stop' : 'pass')` cũng vậy. Thế nhưng `dsh-hook-protocol` lại khai báo `hook/result`, mô tả `stderrSummary` trong tài liệu là «đã cắt ngắn» mà không sở hữu logic cắt ngắn, ghi lại các giá trị decision mà không sở hữu logic ánh xạ. Nếu một bridge trôi dạt (giới hạn khác, dự phòng khác), ngữ nghĩa của sự kiện bền vững dùng chung sẽ lặng lẽ phân nhánh.

## Quyết định

`HookDialect` là một tập bridge đóng: `'claude' | 'codex'`; `HookOutput` gỡ bỏ `suppressOutput` vốn không được hỗ trợ. `hook/result.durationMs` được giữ lại như một mốc thời gian kiểm toán bền vững, chỉ được chuẩn hóa trong snapshot. Mỗi giá trị mặc định tham chiếu chỉ tồn tại ở một nơi: `DEFAULT_HOOK_TIMEOUT_MS` và `DEFAULT_STDERR_SUMMARY_MAX_CHARS`. `HookResultRecord` cùng `appendHookResult` đảm nhiệm logic tóm tắt stderr và suy ra decision cho cả hai bridge. `BLOCKING_EXIT_CODE` là hằng số nội bộ của codec.

## Các phương án đã cân nhắc

### Vì sao không giữ chúng lại?

Từ vựng chưa được hỗ trợ có thể quay lại khi thực sự có bên tiêu thụ. `durationMs` được giữ vì mốc thời gian kiểm toán bền vững có giá trị độc lập với việc hiện tại có bên đọc hay không. Việc dựng payload đặc thù theo bridge vẫn nằm trong từng bridge, còn việc chuẩn hóa cho sự kiện bền vững dùng chung thì thuộc về thư viện giao thức.

## Kiểm chứng

`HookDialect` chỉ gồm Claude và Codex, còn `suppressOutput` không tồn tại trong mã nguồn, trong tài liệu các trường đã phân tích, cũng như trong logic chuẩn hóa. `durationMs` được giữ trong sự kiện và fixture (dữ liệu chuẩn bị cho test), và được làm sạch khi phát lại. Hai giá trị mặc định `600_000` và `500` mỗi cái chỉ xuất hiện một lần trong thư viện giao thức; phần ghi đè timeout của từng hook vẫn có hiệu lực; bộ test của cả hai bridge đều kiểm chứng quy tắc cắt ngắn stderr và quy tắc decision do thư viện sở hữu.

## Hệ quả

Thay đổi về `dialect`, `suppressOutput`, tham số điều chỉnh và ngữ nghĩa đều không nhìn thấy được trong định dạng giao thức (wire format) lẫn kết quả đầu ra mong đợi. Cái giá phải trả là những thay đổi trong `dsh-hook-protocol` và hai bridge — với lập trường tiền phát hành thì chi phí này rất thấp, và cũng rẻ hơn việc để hai bản sao của cùng một ngữ nghĩa sự kiện bền vững già cỗi theo hai hướng.
