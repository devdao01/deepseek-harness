# Agent Note: Đổi `dsh-fs-observation-policy` thành plugin cổng theo sự kiện, thay vì interface theo phương thức

Status: implemented

[English](2026-06-26-file-context-as-event-gate.md) | Tiếng Việt

## Vấn đề

[Agent Note về tách filesystem seam](../simplification/2026-06-26-fsspec-style-fs-seam.md) đặt `ctx.fileContext` giữa công cụ hướng tới model và provider `ctx.fs`: `dsh-tool-fs` inject `fileContext`, và định tuyến mọi `read`/`write`/`edit` qua các phương thức của nó. Điều này khiến `fileContext` **nằm trên đường dẫn quan trọng và không thể bỏ qua**. Công cụ không thể truy cập `ctx.fs` mà không đi qua nó, tầng chính sách nắm giữ fs I/O và cửa sổ đọc, và một triển khai không cần trạng thái quan sát chính sách cũng không thể đơn giản gỡ bỏ package đó — `dsh-tool-fs` sẽ thất bại vì không resolve được `ctx.fileContext`.

Điều này gộp ba việc lẽ ra nên tách rời làm một:

1. **Công cụ làm gì**——resolve đường dẫn, đọc theo cửa sổ, ghi/sửa file. Đây là trách nhiệm của công cụ, chỉ cần `ctx.fs`.
2. **Chính sách độ mới/quan sát**——"phải đọc trước khi sửa", "ghi/sửa phải dựa trên phiên bản bạn đã đọc". Đây là trách nhiệm của plugin `dsh-fs-observation-policy`.
3. **Ghi lại trạng thái quan sát**——một side effect, không bao giờ nên chặn công cụ hoạt động bình thường.

Vì công cụ gọi các phương thức của `fileContext`, gỡ bỏ tầng chính sách là một breaking change, chứ không phải mất đi một cách nhẹ nhàng một capability *bổ sung*. Tầng chính sách mang tính chịu lực đối với việc công cụ hoạt động, chứ không phải một sự siết chặt tùy chọn.

## Quyết định

Đảo ngược luồng điều khiển. **`dsh-tool-fs` trở thành executor, gọi trực tiếp `ctx.fs`**; **`dsh-fs-observation-policy` trở thành plugin cổng (gate) + ghi log**, tham gia thông qua sự kiện, không bao giờ qua việc công cụ gọi phương thức, và cũng không đăng ký service `ctx.fileContext`.

```text
tool          dsh-tool-fs       executor: resolves, reads windows, writes/edits via ctx.fs;
                                emits fs policy events; renders results
policy        dsh-fs-observation-policy  plugin: listens to fs/write-intent +
                                fs/edit-intent (single-slot waterfall) and fs/observed
                                (emit) events; adds observed-state + freshness.
provider contract dsh-fs            ctx.fs: text IO + ATOMIC mutation primitives whose version
                                guard is OPTIONAL; owns the fs policy event vocabulary
provider      dsh-fs-local      local implementation of ctx.fs
```

Mô hình này mang tính xếp chồng (layered): `ctx.fs` trần thực thi text I/O nguyên tử, không ràng buộc, còn `dsh-fs-observation-policy` xếp chồng lên trên trạng thái quan sát, đọc-trước-khi-sửa và version guard. Do đó gỡ bỏ tầng chính sách thì công cụ vẫn dùng được, chỉ là không còn bị ràng buộc. Cấu hình agent (tác nhân) phát hành chính thức sẽ load chính sách; chế độ trần tồn tại để chính sách vẫn tùy chọn ở ranh giới service, chứ không phải là tư thế triển khai thông thường.

[Quyết định tiếp theo về việc quan sát thiếu vắng trong filesystem](../bug-fix/2026-08-09-filesystem-absence-observation.md) tinh chỉnh payload ghi log từ chỉ biểu diễn phiên bản thành công sang trạng thái tồn tại/vắng mặt tường minh, và yêu cầu việc tạo có bảo vệ phải phát hành theo cách không thay thế. Quyền sở hữu cổng sự kiện và ranh giới chính sách không I/O vẫn giữ nguyên.

`dsh-tool-fs` không còn inject `fileContext`. Nó inject `fs` và `tools`/`systemPrompt`.

## Chính sách được thực thi bởi CAS của provider, không phải bởi việc stat của `dsh-fs-observation-policy`

`dsh-fs-observation-policy` thực thi "bạn phải ghi/sửa dựa trên phiên bản bạn đã đọc", **bản thân nó không bao giờ gọi `stat` hay so sánh phiên bản**. Nó cung cấp phiên bản đã quan sát làm baseline cho CAS, để tầng critical section mutation của provider phát hiện sự lỗi thời:

- "Chủ sở hữu này gần đây quan sát thấy gì?" là điều duy nhất `dsh-fs-observation-policy` quyết định cục bộ——một lần tra cứu `WeakMap`, không I/O. Không có bản ghi nghĩa là chưa từng thấy; bản ghi vắng mặt chỉ cho phép tạo có bảo vệ; bản ghi tồn tại mang baseline thay thế/sửa.
- "Phiên bản còn hợp lệ không, hoặc đích tạo có còn vắng mặt không?" được quyết định **bên trong ranh giới thay đổi nguyên tử của provider**. `dsh-fs-observation-policy` cung cấp `replaceIfVersion` hoặc `createIfAbsent`; với phiên bản đã thay đổi, provider ném `FS_STALE_VERSION`; việc tạo có bảo vệ nếu thua một người tạo khác thì ném `FS_NOT_OBSERVED`.

Đây là chủ đích. Nếu `dsh-fs-observation-policy` stat và so sánh phiên bản trong bộ xử lý waterfall (sự kiện dạng thác nước) của nó, sẽ có khoảng hở TOCTOU giữa kiểm tra đó và lần ghi thực tế của công cụ——file có thể thay đổi trong khoảng thời gian đó, nên kiểm tra đó chỉ là một đảm bảo giả, khóa của provider dù sao cũng phải xử lý hậu quả. Đặt việc kiểm tra phiên bản trong critical section của provider vừa không có race condition vừa không cần thêm `stat`. Vì vậy `dsh-fs-observation-policy` **không** làm bất kỳ I/O filesystem nào; đảm bảo "phải dựa trên lần đọc gần nhất" được *thực thi* bởi CAS, `dsh-fs-observation-policy` chỉ chịu trách nhiệm chọn baseline (`vObserved`) và cổng hóa dựa trên quan sát trước đó.

## Thay đổi convention của provider: version guard trở thành tùy chọn

Để provider trần không bị ràng buộc, version guard trên hai mutation của nó trở thành **tùy chọn**——truyền vào thì có guard, bỏ qua thì thực thi vô điều kiện:

```ts ignore-check
// writeText: expected is now optional. The FsWriteIntent union is UNCHANGED.
writeText(target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal): Promise<FsWriteOutcome>
//   undefined          → unconditionally create-or-overwrite (bare default)
//   createIfAbsent     → create only, reject an existing file (dsh-fs-observation-policy, unobserved)   [unchanged]
//   replaceIfVersion   → overwrite only at the observed version, else FS_STALE_VERSION    [unchanged]

// editText: expected becomes optional (was the required { version: FsVersion }).
editText(target: FsTarget, edit: FsEditRequest, expected?: { version: FsVersion }, signal?: AbortSignal): Promise<FsEditOutcome>
//   undefined    → unconditionally replace literal text in the current content (bare default);
//                  a missing target still reports FS_STALE_VERSION
//   { version }  → edit only at that version, else FS_STALE_VERSION (the current behavior)
```

Bản thân union `FsWriteIntent` không đổi——trạng thái "vô điều kiện" thứ ba được biểu đạt bằng cách *bỏ qua* `expected`, nên hai mutation dùng chung một hình dạng đối xứng (`expected?`: bỏ qua = không guard, truyền vào = có guard). Điều này giữ tương thích ngược hoàn toàn với đường có guard mà `dsh-fs-observation-policy` sử dụng; chỉ trường hợp "không guard" trước đây không thể xảy ra là mới thêm, và đó là hành vi mặc định của provider trần. Dù trường hợp nào, mutation vẫn chạy trong khóa per-target của backend, nên ghi/sửa vô điều kiện vẫn nguyên tử (không tạo ra file bị xé); "vô điều kiện" chỉ bỏ đi tiền điều kiện *phiên bản*, không phải tính nguyên tử. `editText` báo cáo đích thiếu là `FS_STALE_VERSION` trên cả đường có guard và không guard, giữ một mã lỗi sửa thống nhất biểu thị "hiện không thể sửa đích này".

## Từ vựng sự kiện (thuộc sở hữu của `dsh-fs`)

Các sự kiện được định nghĩa trong `@deepseek-ai/dsh-fs`, không phải trong `dsh-fs-observation-policy`. Đây là điều bị ép buộc bởi convention giải kết hợp: `dsh-tool-fs` là bên phát, nên nó phải tham chiếu kiểu sự kiện, và nó phải biên dịch được ngay cả khi `dsh-fs-observation-policy` không còn cung cấp service phương thức. `dsh-fs` là package mà cả `dsh-tool-fs` và `dsh-fs-observation-policy` đã cùng phụ thuộc, nên đây là nơi duy nhất có thể cho bên phát và bên lắng nghe chính sách dùng chung từ vựng mà không khiến bên phát phụ thuộc vào plugin chính sách.

Các sự kiện này mang theo từ vựng `dsh-fs` sẵn có (`FsTarget`, `FsVersion`, `FsObservation`, `FsWriteIntent`) cộng với một actor mờ (opaque)——không mang khái niệm hướng tới model nào (cửa sổ dòng, số dòng hay footer đã render không rò rỉ vào tầng này).

**Hai sự kiện quyết định `fs/*` là waterfall một khe (single-slot), ai đến trước xử lý trước.** `dsh-fs-observation-policy` không gọi `next()` mà trả về trực tiếp, nên trong triển khai mặc định nó chiếm khe đó; các listener đăng ký sớm hơn hoặc dùng `prepend` sẽ thay thế chính sách đó. Mối quan tâm về quyền, audit và sandbox vẫn nằm trên waterfall `tools/execute` có thể kết hợp.

actor trong `dsh-fs` có kiểu `object`——một vật mang thuần túy mờ, convention của provider không bao giờ đọc hay thu hẹp nó. Việc suy ra owner (`actor.agent?.session`) và hình dạng cấu trúc `{ agent?: { session? } }` hoàn toàn nằm trong `dsh-fs-observation-policy`, do nó thu hẹp actor kiểu `object` thành hình dạng đó trong listener của mình. `dsh-fs` sở hữu tên sự kiện và từ vựng fs; nó không sở hữu cấu trúc owner runtime của tầng chính sách.

```ts
import type { FsObservation, FsTarget, FsVersion, FsWriteIntent } from '@deepseek-ai/dsh-fs'

interface Events {
  /**
   * Single-slot decision: produce the write expectation for the next
   * ctx.fs.writeText. The default returns undefined (unconditional create-or-
   * overwrite — the bare provider). The policy listener returns createIfAbsent
   * (unobserved) or { kind: 'replaceIfVersion', version: vObserved } (observed).
   * The listener does NOT call next(): one decision, not a composable chain. @mode waterfall
   */
  'fs/write-intent'(target: FsTarget, actor: object | undefined, next: () => FsWriteIntent | undefined | Promise<FsWriteIntent | undefined>): Promise<FsWriteIntent | undefined>
  /**
   * Single-slot decision: produce the optional version guard for the next
   * ctx.fs.editText. The default returns undefined (unconditional edit of the
   * current content — the bare provider; no stat). The policy listener returns
   * { version: vObserved }, or throws FS_NOT_OBSERVED if the actor is unset or
   * has not observed the target. Does NOT call next(): one decision. @mode waterfall
   */
  'fs/edit-intent'(target: FsTarget, actor: object | undefined, next: () => { version: FsVersion } | undefined | Promise<{ version: FsVersion } | undefined>): Promise<{ version: FsVersion } | undefined>
  /**
   * Record that an actor observed a target as present at a version or absent.
   * Fire-and-forget (plain emit). Listeners MUST be
   * synchronous, side-effect-only recorders (`dsh-fs-observation-policy`'s is a WeakMap
   * write); the tool does not guard the emit, so a throwing listener surfaces as
   * the tool's isError result. No listener ⇒ nothing recorded.
   * @mode emit
   */
  'fs/observed'(target: FsTarget, observation: FsObservation, actor: object | undefined): void
}
```

Các sự kiện quyết định `fs/*` là **waterfall không ràng buộc do công cụ phân phát** (giống `agent/request`, do vòng lặp phân phát và không có `this`), chứ không phải waterfall ràng buộc theo service (như `llm/stream`). Bên phân phát là plugin `dsh-tool-fs`, nó không phải một service.

## Convention công cụ (`dsh-tool-fs`)

Công cụ giữ nguyên schema hướng tới model (`read`/`write`/`edit`, không đổi từng byte) và đoạn prompt. Dẫn dắt prompt vẫn ưu tiên chính sách vì triển khai load công cụ fs được kỳ vọng cũng load `dsh-fs-observation-policy`: model vẫn được báo phải đọc trước khi ghi đè hoặc sửa, và yêu cầu đó đến từ plugin fs-observation-policy, không phải từ backend. Việc rơi về provider trần không đổi lập trường của prompt.

`dsh-tool-fs` nhận trách nhiệm executor được di dời từ service phương thức `fileContext` cũ, bao gồm **render đọc** (`read-render.ts`: `buildWindow` + `formatReadOutput`, `READ_MAX_BYTES`, `READ_MAX_LINE_LENGTH`, `FileReadOutcome`/`FileTextLine`, và `STREAM_MIN_SIZE` trong `read.ts`), giờ là chi tiết render của công cụ vì việc đọc giờ do công cụ sở hữu. Các kiểu và hàm hỗ trợ render đọc này chuyển sang `dsh-tool-fs`; plugin chính sách không còn là phụ thuộc kiểu của công cụ.

`dsh-tool-fs` là một plugin gốc duy nhất đăng ký cả ba công cụ (`read`/`write`/`edit`), giống `dsh-tool-bash`. Nó inject `fs` (cộng `tools`/`systemPrompt`), không bao giờ inject `fileContext`. (Đề xuất ban đầu còn định phơi bày mỗi công cụ như plugin đường dẫn con `/read`/`/write`/`/edit` cho các triển khai tập trung; bị từ bỏ khi triển khai——không có consumer nào cần triển khai đơn công cụ, và việc phát hành theo đường dẫn con buộc phải xử lý tùy chỉnh `tsdown`/`tsconfig`/`files`/workspace-constraint mà các gói công cụ anh em không cần. Các hàm hỗ trợ đăng ký theo từng công cụ (`applyReadTool`/`applyWriteTool`/`applyEditTool`) vẫn được giữ như module nội bộ của tổ hợp plugin gốc.)

Giảm thiểu ngân sách `stat` bằng cách để waterfall lười sinh ra kỳ vọng——mặc định trần trả về `undefined` (không guard), không bao giờ stat:

- **read**——một lần `stat`; khi thiếu metadata, emit `{ kind: 'absent' }` trước khi trả về `FS_NOT_FOUND`; khi đích là file, thực hiện lần lượt `readText`/`streamText`, `buildWindow`, rồi emit `{ kind: 'present', version: info.version }`. Việc bỏ `stat` xác nhận sau khi đọc của `fileContext.read` cũ vẫn được giữ nguyên trạng bỏ; một writer race giữa stat định tuyến và việc đọc nhiều nhất chỉ khiến lần sửa có bảo vệ tiếp theo báo lỗi thời sai (false stale).
- **write**——`expectation = await ctx.waterfall('fs/write-intent', target, exec, () => undefined)`, sau đó `ctx.fs.writeText(target, content, expectation)`, rồi emit phiên bản kết quả biểu thị tồn tại. Dù có hay không `dsh-fs-observation-policy`, **zero stat trong công cụ**.
- **edit**——`expectation = await ctx.waterfall('fs/edit-intent', target, exec, () => undefined)`, sau đó `ctx.fs.editText(target, edit, expectation)`, rồi emit phiên bản kết quả biểu thị tồn tại. Cả hai trường hợp đều **zero stat trong công cụ**: mặc định trần là `undefined` (sửa vô điều kiện), nên công cụ không bao giờ stat để tạo baseline. Nếu đích trên đường trần không tồn tại, provider báo `FS_STALE_VERSION`; khi chính sách đã giữ quan sát vắng mặt, trả trực tiếp `FS_NOT_FOUND`.

Công cụ truyền `exec` (ngữ cảnh thực thi công cụ) làm tham số `actor` trong mỗi lần phân phát, để `dsh-fs-observation-policy` suy ra owner của trạng thái quan sát. Công cụ không biết plugin chính sách có tồn tại hay không: nó luôn cung cấp hành vi mặc định trần trong thunk `next`, còn `dsh-fs-observation-policy` sẽ ngắt mạch (short-circuit) nó trước khi thunk chạy, trong triển khai mặc định.

**`fs/observed` kích hoạt sau khi thao tác thành công, và sau khi dò metadata xác nhận vắng mặt.** Listener của nó phải đồng bộ, không ném exception; công cụ không bảo vệ plain emit, nên một listener ném exception có thể thay thế lỗi đọc sắp trả về, hoặc báo cáo thất bại sau khi mutation đã thành công. Việc quan sát bất đồng bộ hoặc có thể thất bại cần một convention sự kiện khác.

## Convention plugin chính sách (`dsh-fs-observation-policy`)

`dsh-fs-observation-policy` là plugin, không phải service. Nó không đăng ký `ctx.fileContext`, không có bề mặt phương thức công khai, không phơi bày phương thức `read`/`write`/`edit`/`resolve`. Nó đăng ký ba listener qua `ctx.on()` (mỗi cái trả về một disposer cho HMR (hot module replacement)). Nó duy trì trạng thái quan sát `WeakMap<owner, Map<targetKey, FsObservation>>`, cộng với việc suy ra owner có cấu trúc (thu hẹp actor `object` mờ trong sự kiện thành hình dạng `{ agent?: { session? } }` của riêng mình), nhưng không inject `fs`——mỗi handler chỉ thao tác trên `WeakMap` của chính nó, không bao giờ thao tác trên `ctx.fs`.

- Listener `fs/write-intent`: chưa từng thấy/vắng mặt ⇒ `createIfAbsent`; tồn tại ⇒ `replaceIfVersion`. Nó không gọi `next()`: hoàn toàn chiếm khe quyết định duy nhất.
- Listener `fs/edit-intent`: chưa từng thấy ⇒ `FS_NOT_OBSERVED`; vắng mặt ⇒ `FS_NOT_FOUND`; tồn tại ⇒ trả về version guard của nó. Cũng không gọi `next()`.
- Listener `fs/observed`: ghi lại giá trị có thể phân biệt tồn tại/vắng mặt.

Một mục trạng thái quan sát là **bản ghi quan sát trước đó**, nhưng trường có thể phân biệt của nó ảnh hưởng tới quyết định. Read/write/edit thành công sẽ ghi trạng thái tồn tại cùng phiên bản, để chuỗi tạo-rồi-sửa hoặc sửa-rồi-sửa hoạt động mà không cần đọc lại giữa chừng. Read/view xác nhận vắng mặt sẽ thay thế trạng thái phiên bản dương (positive) cũ bằng trạng thái vắng mặt, nên chỉ cho phép tạo có bảo vệ; việc tạo thành công sau đó sẽ lại thay thế trạng thái vắng mặt bằng phiên bản tồn tại mới. Chỉ khi mục không tồn tại mới biểu thị chưa từng thấy, và khiến edit trả về `FS_NOT_OBSERVED`. owner được suy ra có cấu trúc từ `{ agent?: { session? } }`; dispose sẽ loại bỏ mọi trạng thái (an toàn với HMR).

`dsh-fs-observation-policy` giờ là một plugin thuần chính sách/ghi log, không có API service——nó chỉ ảnh hưởng ra bên ngoài thông qua cổng sự kiện. Đây chính là điểm mấu chốt để gỡ bỏ sự ràng buộc phương thức của `dsh-tool-fs`.

## Hành vi provider trần (không có `dsh-fs-observation-policy`)

Đây không phải tư thế triển khai kỳ vọng——cấu hình load công cụ fs được kỳ vọng cũng load `dsh-fs-observation-policy`. Đây là giới hạn dưới của provider không ràng buộc, tồn tại sau khi công cụ không còn gắn với service phương thức chính sách. Khi `dsh-fs-observation-policy` không tồn tại, mỗi waterfall `fs/*` rơi về giá trị mặc định `undefined`, `fs/observed` không có listener:

- **read** hành vi không đổi (nó chưa bao giờ cần chính sách; chỉ là emit một `fs/observed` mà giờ không ai lắng nghe).
- **write** tạo-hoặc-ghi-đè vô điều kiện: `expected` là `undefined`, nên `writeText` ghi trực tiếp bất kể file đã tồn tại hay chưa, bất kể phiên bản hiện tại. Không yêu cầu đọc trước, không kiểm tra phiên bản.
- **edit** thay thế vô điều kiện văn bản nguyên văn trong nội dung hiện tại của file: `expected` là `undefined`, nên `editText` khớp và ghi lại mà không có version guard, không yêu cầu đọc trước (`FS_EDIT_NOT_FOUND`/`FS_AMBIGUOUS_EDIT` vẫn áp dụng——chúng liên quan tới khớp nguyên văn, không phải độ mới). Đích thiếu vẫn báo `FS_STALE_VERSION`, nhất quán với mã lỗi "hiện không thể sửa đích này" của đường sửa có guard.

Cả hai mutation vẫn nguyên tử (khóa per-target của backend là vô điều kiện). Điều *không tồn tại* (chứ không phải mất đi) chỉ là chính sách mà `dsh-fs-observation-policy` lẽ ra sẽ xếp chồng lên: trạng thái quan sát, đọc-trước-khi-sửa và version guard cho ghi/sửa. Sau khi load `dsh-fs-observation-policy`, listener của nó trả về giá trị `expected` có guard thay vì `undefined`, từ đó xếp chồng các ràng buộc này; bản thân provider trần không cần thay đổi gì.

## Quan hệ thay thế

Agent Note này sửa chữa——chứ không lật đổ——[Agent Note về tách filesystem seam](../simplification/2026-06-26-fsspec-style-fs-seam.md). Việc tách bốn tầng, convention provider và *chính sách* độ mới đều được giữ nguyên. Điều thay đổi là **cách tầng công cụ và tầng chính sách kết hợp với nhau**: service phương thức bắt buộc trở thành cổng sự kiện do plugin sở hữu, fs I/O + cửa sổ đọc chuyển từ `fileContext` lên `dsh-tool-fs`. Mô tả trong Agent Note về tách filesystem seam về việc `dsh-tool-fs` inject `fileContext` và `fileContext` sở hữu `read`/`write`/`edit` đã được cập nhật trong cùng thay đổi này.

## Xác minh

Test chốt hai đường: không có `dsh-fs-observation-policy`, plugin công cụ gốc khởi động với `dsh-fs-local`, read, create, overwrite và edit chưa đọc đều thành công; có chính sách, edit chưa đọc trả về `FS_NOT_OBSERVED`, overwrite chưa đọc bị `createIfAbsent` chặn. Sau khi chính sách đã quyết định, listener intent đăng ký sau sẽ không được chạm tới. Edit lỗi thời thất bại thông qua CAS của provider, trong khi chính sách không thực hiện `stat`; ngân sách công cụ giữ nguyên một lần `stat` cho read, zero cho write hoặc edit trên cả hai đường. Test cũng lắp ráp đường phục hồi xóa: thay đổi lỗi thời, đọc lại xác nhận vắng mặt, tạo lại có bảo vệ. Schema hướng tới model không đổi từng byte, nhưng transcript (bản ghi văn bản) kết quả sau khi phục hồi có thay đổi.

## Phương án thay thế đã cân nhắc

- **Giữ `ctx.fileContext` như service phương thức trên đường dẫn quan trọng**——hình thái ban đầu được triển khai trong [Agent Note về tách filesystem seam](../simplification/2026-06-26-fsspec-style-fs-seam.md); bị bác bỏ vì công cụ không thể hoạt động nếu không có tầng chính sách, khiến chính sách mang tính chịu lực đối với thao tác cơ bản, chứ không phải một sự siết chặt tùy chọn.
- **Kiểm tra phiên bản phía chính sách** (`dsh-fs-observation-policy` stat và so sánh phiên bản trong bộ xử lý waterfall của nó)——bị bác bỏ vì có khoảng hở TOCTOU giữa kiểm tra đó và lần ghi thực tế của công cụ; critical section mutation của provider là nơi duy nhất không có race condition, nên chính sách chỉ chọn baseline CAS và cổng hóa dựa trên quan sát trước đó.
- **Plugin đường dẫn con `/read`/`/write`/`/edit` theo từng công cụ**——bị từ bỏ khi triển khai: không có consumer nào cần triển khai đơn công cụ, và việc phát hành theo đường dẫn con buộc phải xử lý tùy chỉnh `tsdown`/`tsconfig`/`files`/workspace-constraint mà các gói công cụ anh em không cần; các hàm hỗ trợ đăng ký theo từng công cụ vẫn được giữ như module nội bộ của tổ hợp plugin gốc.

## Hậu quả

- **Tầng gián tiếp sự kiện thay thế lệnh gọi phương thức.** Một waterfall + emit không trực tiếp bằng `await ctx.fileContext.edit(...)`. Lợi ích là loại bỏ phụ thuộc phương thức từ công cụ tới chính sách, trong khi vẫn giữ plugin chính sách mặc định; cái giá là phải học thêm một bộ từ vựng sự kiện. Được giảm nhẹ bằng cách giữ ba sự kiện có phạm vi hẹp và ghi lại ngữ nghĩa thunk mặc định trên mỗi sự kiện.
- **Sự kiện chính sách nằm trong storage seam.** `dsh-fs` thêm hai sự kiện quyết định phiên bản và một sự kiện ghi log, dù nó "chỉ là storage". Đây là cái giá của việc giải kết hợp (bên phát không được phụ thuộc vào plugin chính sách). Các sự kiện này chỉ mang từ vựng `dsh-fs` cộng một actor `object` mờ, không mang khái niệm hướng tới model, nên seam không bị nhiễm kiểu cửa sổ dòng/chính sách quan sát, cũng không bị nhiễm cấu trúc owner agent/session.
- **Chỉ một chính sách chiếm chỗ, theo quy ước ai đến trước xử lý trước.** Khe `fs/write-intent`/`fs/edit-intent` vừa đủ chứa một người quyết định; listener đăng ký trước (hoặc `prepend`) thắng, các listener còn lại bị ngắt mạch. `dsh-fs-observation-policy` chiếm khe đó là quy ước triển khai, không phải bất biến do hệ thống sự kiện ép buộc——một người quyết định thứ hai đăng ký trước sẽ vượt qua nó. Điều này chấp nhận được vì một người quyết định chính sách phiên bản fs thứ hai là lỗi cấu hình, chứ không phải một tính năng. Nếu tương lai có nhu cầu *xếp chồng* chính sách phiên bản fs, đó sẽ là một Agent Note mới (waterfall truyền giá trị có thể kết hợp), chứ không phải âm thầm thêm listener thứ hai vào các sự kiện này. Việc chặn quyền/audit/sandbox theo lớp đã có chủ sở hữu: `tools/execute`.
- **Loại bỏ stat xác nhận sau khi đọc** khiến các lần sửa *có guard* sau đó thỉnh thoảng từ chối ghi để an toàn khi có race đọc/ghi (`FS_STALE_VERSION` → đọc lại). Đây là mất mát về tiện lợi UX, hoàn toàn không phải lỗ hổng đúng đắn; khóa của provider vẫn ngăn việc ghi dựa trên phiên bản sai.
- **Provider trần không đọc-trước-khi-ghi/sửa, cũng không kiểm tra phiên bản.** Các triển khai không có `dsh-fs-observation-policy` cho phép model ghi đè hoặc sửa vô điều kiện bất kỳ file đã tồn tại nào. Đây chính là hàm ý có chủ đích của việc giữ công cụ độc lập với service chính sách: kỷ luật an toàn tồn tại trong plugin `dsh-fs-observation-policy`. Triển khai bỏ qua nó là lựa chọn có chủ đích một filesystem không ràng buộc; đối với cấu hình phát hành công cụ fs, đây không phải là tư thế kỳ vọng.
</content>
