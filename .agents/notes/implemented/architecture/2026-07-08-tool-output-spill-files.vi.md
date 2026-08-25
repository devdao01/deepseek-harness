# Agent Note: Chính sách spill output của tool

Status: implemented

[English](2026-07-08-tool-output-spill-files.md) | Tiếng Việt

## Vấn đề

Output của tool cần một preview có giới hạn mà mô hình có thể nhìn thấy, nhưng một phần kết quả siêu lớn vẫn có thể hữu ích về sau. Nội dung trang đã crawl hay response tool dài dòng không nên chiếm trọn request mô hình tiếp theo, nhưng mô hình vẫn nên có thể dùng tool đọc file hiện có để xem kết quả đầy đủ đã được định dạng sau này.

Hành vi trước thay đổi này không nhất quán. `dsh-bash-local` đã ghi toàn bộ luồng stdout/stderr vào một file spill tạm thời riêng tư khi phần đuôi trong bộ nhớ bị tràn; còn kết quả tool văn bản thông thường vẫn được trả về inline, trừ khi bản thân tool tự implement giới hạn. [Thư viện giữ lại kết quả tool](2026-07-06-tool-result-retention-library.md) chịu trách nhiệm về cơ chế preview, nhưng không chịu trách nhiệm về lưu trữ, cũng không chịu trách nhiệm áp dụng các cơ chế này vào chính sách pipeline thực thi cho kết quả tool cuối cùng.

Hình dạng của nó nhất quán với thiết kế chính sách timeout: tác giả tool khai báo giá trị chuẩn và Native renderer (renderer gốc), còn plugin chính sách thực thi ngân sách context mặc định của deployment trên nội dung đã render. Tool vẫn có thể spill sớm tại giới hạn thu thập của provider; spill hiển thị do tool tự chịu trách nhiệm có thể giữ lại giá trị chuẩn đã thu thập đầy đủ, chỉ thay thế nội dung hiển thị. [Quy ước output tool chuẩn](2026-07-20-canonical-tool-output-contract.md) quy định sự phân biệt này.

## Quyết định

Thêm một lớp seam lưu trữ spill nhẹ và một plugin chính sách spill mặc định dưới nhóm mới `packages/spill/`:

| Package | Vai trò |
|---|---|
| `@deepseek-ai/dsh-spill` | Interface: `ctx.spillStore`, các kiểu từ vựng, không chứa implementation lưu trữ. |
| `@deepseek-ai/dsh-spill-local` | Backend cục bộ: cung cấp lưu trữ file riêng tư, theo scope session, trên filesystem của host. |
| `@deepseek-ai/dsh-spill-policy` | Plugin chính sách kết quả tool: bọc kết quả văn bản cuối cùng sau khi phân phối, và thay thế kết quả siêu lớn bằng preview được giữ lại cùng locator spill. |

Hệ thống không thêm một package chuyên biệt hướng tới phía tiêu thụ là mô hình. Phía tiêu thụ chính là pipeline thực thi `ctx.tools` hiện có: `dsh-spill-policy` dùng kết quả tool cuối cùng qua waterfall (chuỗi sự kiện dạng thác) `tools/post-execute`, còn mô hình đọc nội dung theo gợi ý truy xuất mà backend trả về kèm locator.

### spill seam

Seam lưu trữ được giữ tối thiểu: lưu văn bản, và trả về locator cùng gợi ý truy xuất.

```ts ignore-check
interface SpillStore {
  saveText(input: SaveTextSpill): Promise<SpillRef>
}

interface SpillSource {
  toolName: string
  callId: CallId
  label: string
}

interface SaveTextSpill {
  owner: { sessionId: SessionId }
  source: SpillSource
  suggestedName: string
  content: string
}

type SpillLocator = Branded<'SpillLocator'>

interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}
```

`SpillLocator` là một handle [gắn brand](../../../../packages/util/brand) mà mô hình có thể nhìn thấy, do backend trả về. Backend cục bộ render nó thành đường dẫn filesystem; backend remote hoặc database có thể render URI, key, hoặc command token. Phía tiêu thụ coi nó là giá trị mờ (opaque), và dùng `retrievalHint` để render, thay vì giả định `read` luôn luôn là cơ chế truy xuất đúng. `SpillOwner.sessionId` là namespace lưu trữ tại thời điểm lưu: session được fork sẽ kế thừa locator spill có sẵn từ log seed, không cần copy chúng hay tiếp nhận lại quyền sở hữu; spill mới sau khi fork dùng session id con. Việc dọn dẹp theo retention có thể làm locator cũ hết hiệu lực cùng với các sản phẩm session cũ khác; spill seam không định nghĩa chính sách dọn dẹp theo từng session.

`dsh-spill-local` chỉ chịu trách nhiệm về chi tiết lưu trữ: chọn thư mục theo scope session, tên an toàn, ngăn path traversal, thực hiện ghi, và trả về `{ locator, bytes, retrievalHint }`. Nó không chịu trách nhiệm về chính sách retention, thay thế kết quả tool, tìm kiếm, hay kiểm tra file. File được ghi tại `<root>/session-<hash>/<random>-<safeName>`: `root` là đường dẫn cấu hình, hoặc thư mục tạm cấp tiến trình riêng tư (0700) được tạo trễ (lazy); thư mục con theo session là tiền tố ngắn của `sha256(sessionId)`; node lá gồm tiền tố hex ngẫu nhiên cộng `suggestedName` của phía gọi, giá trị này được làm sạch thành một segment path duy nhất (nhất quán với `encodeSegment` của backend JSONL). Hệ thống dùng `open(path, 'wx', 0o600)` để ghi, bảo đảm độc quyền và chỉ chủ sở hữu mới truy cập được, do đó symlink được cài sẵn từ trước không thể chuyển hướng việc ghi. Locator chính là đường dẫn đó, còn gợi ý truy xuất báo cho mô hình biết có thể dùng `read` hoặc `grep` trên đường dẫn đó.

### spill policy

`dsh-spill-policy` là một bộ chuyển đổi kết quả `tools/post-execute`, chỉ có một mục cấu hình:

```ts ignore-check
interface Config {
  /** Omitted means no automatic spill policy. Present means apply to oversized plain text tool results. */
  maxInlineBytes?: number
}
```

Khi bỏ qua `maxInlineBytes`, plugin không đăng ký gì cả, thực sự là no-op. Khi đặt giá trị này, nó sẽ áp dụng chính sách mặc định lên kết quả tool văn bản thuần cuối cùng:

1. Cho tool chạy bình thường, ủy quyền qua `next()`, để listener downstream kết toán kết quả trước.
2. Chỉ khi mọi `ContentBlock[]` cuối cùng đã được chấp nhận đều là văn bản thuần, mới trải phẳng (flatten) chúng; kết quả chứa bất kỳ block không phải văn bản nào được giữ nguyên.
3. Nếu kích thước byte UTF-8 không vượt `maxInlineBytes`, giữ nguyên.
4. Nếu vượt giới hạn, gọi `ctx.spillStore.saveText()` với toàn bộ văn bản cuối cùng.
5. Thay thế kết quả mà mô hình nhìn thấy bằng preview đầu-cuối được giữ lại cùng tham chiếu spill.

Preview thuộc về giá trị mặc định implementation do chính sách sở hữu: dùng `maxInlineBytes` làm giới hạn trên, dùng `TextRetainer` của thư viện retention để chia đầu-cuối. Chỉ khi có deployment thứ hai chứng minh nhu cầu, cấu hình tương lai mới công khai kích thước preview.

Văn bản thay thế cố ý giữ tính tổng quát, vì chính sách chỉ biết kết quả tool đã được định dạng cuối cùng, không biết tài nguyên nội bộ của tool:

```text
<retained preview>

(Omitted N bytes. Full formatted result stored at: /.../session-.../....txt. Use read with offset/limit, or grep this path to search within it.)
```

Nếu `ctx.spillStore.saveText()` thất bại (quyền truy cập, ENOSPC, backend không khả dụng), hoặc lời gọi không có session sở hữu, hoặc chưa load backend, plugin sẽ ghi log lý do và trả về kết quả nguyên trạng. Việc spill thất bại sẽ không bao giờ biến một tool call thành công thành kết quả `isError`, cũng không ẩn kết quả inline.

Chính sách bỏ qua `read`, để tránh tạo thành vòng lặp `read -> spill file -> read again`. Cấu hình lựa chọn tham gia (opt-in) bổ sung sẽ chờ tới khi thực sự xuất hiện tool thứ hai có nhu cầu này mới đưa vào.

## Ví dụ: web_fetch

`web_fetch` là ví dụ đầu tiên, vì nó tự nhiên trả về kết quả văn bản lớn, và không cần code spill riêng cho tool. Bản thân tool không cần xử lý đặc biệt:

```ts ignore-check
ctx.tools.register(defineTool({
  name: 'web_fetch',
  output: {
    schema: WEB_FETCH_RESULT_SCHEMA,
    render: (_args, value) => [{ type: 'text', text: formatFetchOutput(value) }],
  },
  async execute(args, exec) {
    const result = await ctx.web.fetch({ url: args.url }, exec.signal ? { signal: exec.signal } : undefined)
    return result
  },
}))
```

Sau khi cấu hình `dsh-spill-policy`, kết quả fetch lớn đã định dạng sẽ tự động được giữ lại và spill. Deployment thể hiện hành vi này bằng cách đặt giới hạn tài nguyên của provider cao hơn giới hạn chính sách:

```yaml
- id: web-fetch-http
  name: '@deepseek-ai/dsh-web-fetch-http'
  config:
    maxBodyChars: 500000

- id: spill-local
  name: '@deepseek-ai/dsh-spill-local'

- id: spill-policy
  name: '@deepseek-ai/dsh-spill-policy'
  config:
    maxInlineBytes: 50000
```

Sự phân tách này quan trọng. `web-fetch-http` vẫn chịu trách nhiệm về giới hạn tài nguyên (`maxResponseBytes`, `maxBodyChars`), dùng để bảo vệ network, bộ nhớ và công việc giải mã. `spill-policy` chỉ chịu trách nhiệm về giới hạn context mô hình sau khi kết quả đã tồn tại. Nếu provider đã trả về `truncated: true`, file spill chứa kết quả đã định dạng đầy đủ mà tool trả về, chứ không phải toàn bộ trang web gốc; chính sách không đưa ra cam kết nào khác.

## Quan hệ với retention và spill sớm

Retention và lưu trữ spill độc lập với nhau:

- `@deepseek-ai/dsh-output-retention` chịu trách nhiệm về cơ chế preview (`TextRetainer`, `ItemRetainer`, và metadata lược bỏ).
- `@deepseek-ai/dsh-spill` chịu trách nhiệm lưu văn bản cuối cùng, và trả về locator cùng gợi ý truy xuất.
- `@deepseek-ai/dsh-spill-policy` áp dụng chính sách kết quả cuối cùng mặc định trong pipeline tool, kết hợp cả hai điều trên.

Chính sách kết quả cuối cùng không thể thay thế việc spill sớm do tool tự chịu trách nhiệm. Một phần nội dung hữu ích không tồn tại trong `ToolExecutionResult.content` cuối cùng:

- Output cuối cùng của `bash` đã là nội dung phần đuôi cộng đường dẫn spill tạm thời; toàn bộ luồng stdout/stderr nằm trong file thực thi.
- Output cuối cùng của `subagent` là câu trả lời cuối cùng của subagent, chứ không phải quỹ đạo (trajectory) thực thi của subagent.
- Các tool tương lai có thể tạo ra sản phẩm runtime chưa bao giờ xuất hiện trong `ToolExecutionResult.content` cuối cùng.

Các trường hợp này có thể trực tiếp dùng `ctx.spillStore` trong công việc tiếp theo, không thuộc phạm vi ví dụ đầu tiên.

## Ngoài phạm vi

- v1 không thêm tool `artifact_read` hoặc `artifact_search` hiển thị cho mô hình.
- v1 không thêm cấu hình retention theo từng tool.
- Không thêm tham số timeout/truncation hiển thị cho mô hình.
- Không di chuyển output của `read` vào file spill.
- Không thay thế giới hạn provider/tài nguyên như `web-fetch-http.maxBodyChars`.
- Phiên bản đầu không thống nhất các file tạm của bash, cũng không thu thập quỹ đạo thực thi của subagent.

## Việc hoãn lại

- `saveFile()`/`linkOrCopy` dùng cho file spill của executor hiện có, cần thiết để thống nhất hành vi bash.
- Spill quỹ đạo thực thi subagent do tool chịu trách nhiệm (`await run.result`, đọc subsession trong tiến trình trước `run.dispose()`, lưu JSONL).
- Nếu quy tắc bỏ qua tích hợp sẵn của `read` chưa đủ, thêm cấu hình opt-out hoặc khai báo chính sách theo từng tool.
- Backend lưu trữ remote/database hướng tới ACP (Agent Client Protocol) hoặc môi trường remote, vì đường dẫn cục bộ không có ý nghĩa trong các môi trường này.
- Chính sách dọn dẹp và retention cho file spill cũ, nhiều khả năng sẽ gắn với việc dọn dẹp session.

## Kiểm thử

- Test đơn vị của `dsh-spill` khóa chặt quy ước seam: đăng ký thành `ctx.spillStore`, mỗi context chỉ cho phép một implementation, và giải phóng khi dispose (giải phóng tài nguyên).
- Test đơn vị của `dsh-spill-local` bao phủ `saveText`, việc làm sạch `encodeSegment` (dấu phân cách/dấu ngã/dấu chấm ở segment path đầy đủ/giá trị null), thư mục băm theo session, quyền chỉ chủ sở hữu, mỗi lần lưu tạo ra đường dẫn khác nhau, thư mục gốc cấu hình/thư mục gốc riêng tư, và việc từ chối khi lưu trữ thất bại.
- Test đơn vị của `dsh-spill-policy` chạy tool thật qua `ctx.tools.execute`: no-op ở chế độ tắt, thay thế văn bản siêu lớn, kết quả nhỏ/không phải văn bản giữ nguyên, bỏ qua `read`, fallback nỗ lực hết mức (lưu thất bại/không backend/không chủ sở hữu), và tổ hợp downstream (giới hạn kết quả đã thay thế, giữ `additionalContexts`).
- Test tích hợp của `dsh-tool-web` chạy `web_fetch`, đường thực thi thực sự đi qua `ctx.tools.execute`, và dùng backend `spill-local` cùng chính sách thật; test chứng minh chỉ có gợi ý spill được cố ý thêm vào mới thay đổi văn bản mô hình nhìn thấy, còn file spill lưu kết quả đã định dạng đầy đủ.
- Ví dụ `tui-agent` load `spill-local` và `spill-policy`, do đó smoke test Loader/PTY không cần key của nó sẽ chạy đường load thật (hình dạng export namespace-plugin và `inject`).

## Ảnh hưởng

Chính sách mặc định chỉ nhìn thấy văn bản đã định dạng cuối cùng. Nó không thể giữ lại nội dung nội bộ đã bị provider giới hạn từ trước, cũng không thể giữ lại sản phẩm runtime chưa từng thuộc về kết quả. Phiên bản đầu tập trung vào spill kết quả cuối cùng thay vì spill sớm, nên giới hạn này chấp nhận được; việc spill sớm do tool tự chịu trách nhiệm vẫn thuộc công việc tiếp theo.

Backend cục bộ trả về đường dẫn thật, giữ v1 đơn giản và phù hợp với hành vi tool agent (smart agent) đã được xác thực; bản thân seam chỉ cam kết một locator mờ cộng gợi ý truy xuất, nên backend remote có thể trả về locator không phải file.

Giá trị của backend cục bộ phụ thuộc vào việc tool `read`/`grep` hiện có có thể kiểm tra đường dẫn cục bộ đã trả về hay không, ngay cả khi thư mục spill nằm ngoài cwd của session. Hiện tại điều kiện này đúng, vì chính sách filesystem sẽ ghi log quan sát và thiết lập write-protect, nhưng không giới hạn việc đọc trong workspace. Chính sách giới hạn workspace trong tương lai phải cho phép tường minh đường dẫn spill cục bộ, hoặc chuyển sang backend spill không phải file trỏ tới reader được hỗ trợ qua gợi ý truy xuất.

**Khoảng trống snapshot.** Hiện tại không có kịch bản snapshot ACP nào bao phủ gợi ý spill `web_fetch` hiển thị trong transcript (bản ghi văn bản). Harness snapshot ACP replay trong môi trường không cần key, không truy cập được web thực, còn spill của `web_fetch` cần một HTTP body thật vượt giới hạn; kịch bản xác định cần một đích fetch loopback đã cấu hình sẵn, nhưng cây replay hiện tại chưa được đấu nối (ví dụ hoàn toàn chưa load `tool-web`). Hành vi này hiện được bao phủ bởi test tích hợp của `dsh-tool-web` nhắm vào server loopback. Bù đắp khoảng trống này thuộc công việc tiếp theo: đấu nối `tool-web` cùng đích fetch đã cấu hình sẵn vào ví dụ ACP, rồi ghi lại kịch bản `web-fetch-spill`.

Nếu chính sách bắt đầu chịu trách nhiệm về ngữ nghĩa riêng của từng tool, nó sẽ phình to quá mức. Phạm vi của nó được giữ hẹp: chỉ xử lý kết quả cuối cùng dạng văn bản thuần. Việc spill sớm do tool tự chịu trách nhiệm vẫn để lại cho công việc tương lai.

## Các phương án thay thế từng cân nhắc

**Yêu cầu mỗi tool opt-in qua khai báo retention.** v1 không chấp nhận, vì mục tiêu là hiện thực hành vi mặc định tương tự việc lưu trữ bền vững kết quả tool tổng quát của Claude Code. Chỉ cần một mục cấu hình deployment `maxInlineBytes` là đủ để xác thực hình dạng đó.

**Xây `tool-results` thành một nền tảng kết quả tool rộng.** Không chấp nhận: một tên package rộng sẽ cám dỗ hệ thống gộp chính sách retention, thay thế kết quả, cách diễn đạt preview, tìm kiếm và spill sớm vào chung một seam. Phần có thể chia sẻ lưu trữ nhỏ hơn nhiều: lưu văn bản, và trả về locator cùng gợi ý truy xuất.

**Dùng `ctx.fs.writeText` hoặc tool `write` hiển thị cho mô hình.** Không chấp nhận: việc ghi file workspace mang theo ngữ nghĩa file dự án, chính sách write/edit, trạng thái quan sát, và side effect hiển thị cho người dùng. File spill là sản phẩm runtime, không phải thay đổi workspace do mô hình viết. Tool `read` hiện có sau đó có thể kiểm tra chúng, nhưng thao tác tạo thuộc về spill seam runtime.

**Để `web-fetch-http` crawl không giới hạn, chỉ dựa vào spill-policy.** Không chấp nhận: spill-policy chỉ chạy sau khi kết quả tool cuối cùng đã tồn tại, không thể bảo vệ network, bộ nhớ hay tài nguyên giải mã. Giới hạn tài nguyên của provider vẫn phải tồn tại.

**Gộp retention vào cơ chế spill.** Không chấp nhận: retention và spill có trách nhiệm khác nhau. `TextRetainer`/`ItemRetainer` quyết định giữ lại phần preview nào và lược bỏ những gì; lưu trữ spill chỉ chịu trách nhiệm lưu văn bản cuối cùng mà chính sách yêu cầu.
