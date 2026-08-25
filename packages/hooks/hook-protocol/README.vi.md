# @deepseek-ai/dsh-hook-protocol

[English](README.md) | Tiếng Việt

**Lõi dùng chung** cho định dạng giao thức (wire format) hook của Claude Code／Codex. Đây không phải là một plugin Cordis: nó không đăng ký hay inject bất cứ thứ gì. Đây là một **thư viện** cung cấp các nguyên hàm (primitive) độc lập với phương ngữ, được hai plugin cầu nối (`@deepseek-ai/dsh-hooks-claude-code`, `@deepseek-ai/dsh-hooks-codex`) import, giúp cả hai không phải triển khai lặp lại phần giống nhau của giao thức.

Codex chủ động triển khai lại một *tập con* của giao thức hook Claude Code, bao gồm cấu trúc matcher group `hooks.json` giống nhau, quy ước exit code／xuất ra stdout giống nhau, và cùng mô hình thực thi command hook. Phần thực sự dùng chung nằm ở đây; mỗi cầu nối chỉ chịu trách nhiệm cho phần khác biệt của mình.

## Nội dung dùng chung (ở đây) và nội dung theo từng phương ngữ (cầu nối)

| Mối quan tâm | Ở đây (`dsh-hook-protocol`) | Cầu nối (`dsh-hooks-claude-code` / `-codex`) |
|---|---|---|
| Kiểm tra và khớp Matcher | `matcherDiagnostic(pattern, mode)` dùng cho chẩn đoán lúc parse; `matchesMatcher(pattern, query, mode)` dùng cho khớp runtime cô lập | Chọn `mode` của riêng mình (`claude` = chuỗi nghĩa đen hoặc regex, `codex` = luôn dùng regex), và từ chối các config group có chẩn đoán lỗi |
| Chạy hook | `runHook(bash, hook, opts, now)`: cung cấp stdin payload + env qua `ctx.shell`, sau đó decode | Xây dựng stdin **payload** cho từng sự kiện + **env** riêng của phương ngữ đó |
| Decode đầu ra | `parseHookOutput(exit, stdout, stderr)` → `HookOutput` trung lập | Ánh xạ `HookOutput` trung lập sang các kiểu Decision đặc thù theo điểm mở rộng |
| Gộp N hook | `mergeHookOutputs(outputs)` → `MergedHookOutcome` nghiêm ngặt nhất | (không có) |
| Ghi lại lâu dài | `appendHookInvoked` / `appendHookResult` (sự kiện phiên `hook/*`; `decision`／`stderrSummary` của kết quả được suy ra từ `HookOutput` ở đây) | Gọi các hàm này trước và sau mỗi lần gọi |
| Tách khỏi trạng thái dừng hoàn toàn (quiescence) | `createDetachedRuns()`: theo dõi các chuỗi chạy được kích hoạt nhưng không chờ; `drain()` sẽ abort trước, rồi chờ chúng | Truyền `signal` cho mỗi `runHook` tách rời, và đăng ký `drain` làm effect disposer |

## Nguyên hàm

- **`matcherDiagnostic(matcher, mode)` / `matchesMatcher(matcher, query, mode)`**: khớp mọi thứ khi thiếu, `''` hoặc `'*'`; mode `claude` coi pattern thuần `[A-Za-z0-9_|]+` là chuỗi nghĩa đen (dấu gạch đứng = luân phiên khớp chính xác), các pattern khác coi là regex; mode `codex` luôn dùng regex không neo (unanchored). Parser của cầu nối sẽ loại bỏ trường matcher của các sự kiện không có đối tượng khớp matcher, sau đó dùng `matcherDiagnostic` để từ chối các regex không hợp lệ mà sự kiện thực sự sử dụng, và đưa ra chẩn đoán ổn định trước khi đăng ký bất kỳ hook nào. Predicate runtime vẫn sẽ cô lập các pattern không hợp lệ thành không khớp, do đó gọi trực tiếp thư viện này sẽ không ném exception về phía agent loop (vòng lặp tác tử).
- **`runHook(bash, hook, options, now)`**: yêu cầu và chuyển tiếp `options.signal` do bên gọi sở hữu, serialize `options.payload` vào stdin của hook (thêm ký tự xuống dòng cuối khi và chỉ khi `options.trailingNewline`), gộp `options.env` sau khi thực thi dọn dẹp credential (giao diện plugin đáng tin cậy của `dsh-shell`), tuân theo `timeoutSec` của hook (nếu không thì dùng `options.defaultTimeoutMs`; giá trị mặc định thuộc về cầu nối, config mặc định của nó là giá trị tham chiếu `DEFAULT_HOOK_TIMEOUT_MS` 10 phút của lib), rồi decode kết quả (truyền `options.expectedEventName` cho codec). Vì vậy việc hủy sẽ tới được ranh giới kết thúc process group và join của executor. Nó không bao giờ ném exception: việc executor từ chối (lỗi hạ tầng) sẽ chuyển thành `HookOutput` với `exitCode: undefined` (lỗi không chặn). `now` được inject để test có thể kiểm soát thời lượng.
- **`parseHookOutput(exitCode, stdout, stderr, expectedEventName?)`** decode trạng thái exit và stdout có cấu trúc. Khi exit code là 2, nội dung stderr sẽ chặn thực thi; các lỗi khác không chặn. Quyết định quyền hạn đặc thù theo hook được khớp sẽ ghi đè quyết định top-level cũ (legacy); trường phân biệt sự kiện không khớp hoặc thiếu chỉ ức chế các trường đặc thù theo sự kiện. Các trường top-level vẫn không phụ thuộc vào sự kiện, đầu ra thành công nhưng không phải JSON sẽ để lại cho cầu nối xử lý.
- **`mergeHookOutputs(outputs)`**: gộp mỗi kết quả hook khớp tại một điểm: thứ tự ưu tiên quyền hạn là **deny > ask > allow**, kể từ `continue:false` đầu tiên, trạng thái halt được giữ nguyên, lý do chặn được nối bằng `\n\n`, `additionalContext`／`systemMessages` được tích lũy theo thứ tự.
- **`createDetachedRuns()`**: theo dõi xem các điểm chạy tách rời dưới dạng emit đã đạt trạng thái dừng hoàn toàn hay chưa (không có điểm mở rộng nào chờ chúng). Cầu nối sẽ theo dõi từng chuỗi chạy, bao gồm cả lần chạy hook và continuation của nó, và đăng ký `drain()` làm effect disposer. drain sẽ kích hoạt `signal` abort của tracker (do đó các process hook vẫn đang chạy sẽ bị kết thúc thông qua `runHook`, thay vì chờ tới khi timeout), sau đó resolve khi tất cả các chuỗi đã theo dõi đã kết thúc. Vì vậy khi `fiber.dispose()` resolve, sẽ không còn công việc hook tách rời nào sót lại có thể tác động lên context đã dispose (đã giải phóng tài nguyên) (xem [Mẫu hình phòng vệ](../../../docs/defensive-patterns.md): dispose phải đạt trạng thái dừng hoàn toàn).

## Sự kiện phiên `hook/*`

Được gộp vào `SessionEventMap` thông qua declaration merging (chỉ ghi log, giống `compaction/*`; không phải `SurfaceEventType`, không có `surfaceOp`): `hook/invoked` (lệnh hook đã chạy) và `hook/result` (kết quả của nó, được ghép cặp theo `handlerId`, quy tắc quyết định do `appendHookResult` đảm nhiệm). Payload và JSDoc cho từng sự kiện nằm trong [danh mục sự kiện log bền vững](../../../docs/persistence-catalog.md) được tạo sinh; `stderrSummary` được cắt ngắn theo `stderrSummaryMaxChars` đã ghi nhận (cấu hình của cầu nối, giá trị tham chiếu mặc định `DEFAULT_STDERR_SUMMARY_MAX_CHARS` = 500; bỏ qua khi rỗng).

Việc ghi lời gọi／kết quả hook phải nằm trong một lượt (turn) chưa kết thúc. `UserPromptSubmit`, `PreToolUse`, `PostToolUse` và `Stop` theo cấu trúc thỏa mãn quan hệ này do owner định nghĩa. `SessionStart` chạy trước lượt 1, do đó không có bản ghi `hook/*`; ngữ cảnh đã được chấp nhận của nó sẽ ở trạng thái chờ trong inbox cho đến khi việc đánh thức (wakeup) mở ra một lượt, chi tiết xem Agent Note của hooks.

## Trải nghiệm mô hình

Ảnh hưởng gián tiếp thông qua `dsh-hooks-claude-code` và `dsh-hooks-codex`; chúng có thể chuyển đầu ra hook đã parse thành ngữ cảnh prompt, kết quả đã bị chặn, hoặc phản hồi continuation.

#### Ảnh hưởng KV Cache

Không ảnh hưởng trực tiếp; thay đổi tiền tố request do các bên tiêu thụ nêu trên chịu trách nhiệm.

## Hạn chế đã biết và công việc hoãn lại

- **`HookOutput.updatedInput` được parse nhưng không được áp dụng**: việc viết lại input là một vấn đề thiết kế nhất quán đã hoãn lại (xem [Agent Note pre-tool-input-rewrite](../../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.md)); khi hook thiết lập nó, cầu nối sẽ ghi log + cảnh báo. Quy ước đầy đủ xem `src/types.ts`.
