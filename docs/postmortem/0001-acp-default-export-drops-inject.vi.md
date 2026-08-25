# Phân tích sự cố (postmortem) 0001: Máy chủ ACP (Agent Client Protocol) sập khi kết nối — `export default` làm mất `inject` của plugin

[English](0001-acp-default-export-drops-inject.md) | Tiếng Việt

Trạng thái: đã giải quyết; bản sửa xem tại PR (Pull Request) #41 `feat/acp-2-bridge`

## Tóm tắt

Hai lỗi tích hợp vẫn khiến ACP sập ngay cả khi unit test đạt độ phủ toàn phần: một default export khiến Loader làm mất `inject`, và một lượt tra cứu service tùy chọn qua proxy có thể truy vết (traceable proxy) thất bại tại ranh giới shadow. Các test mount thủ công đã bỏ qua cả hai đường này. Bản sửa bổ sung độ phủ test Loader thực không cần API key, và đặt ra quy tắc cấp package cho việc export plugin và truy cập service tùy chọn.

## Tổng quan

Máy chủ ACP (`examples/acp-agent`, `@deepseek-ai/dsh-acp`) sập ngay thời điểm một editor thực (Zed) kết nối: request `session/new` đầu tiên trả về `Internal error: cannot get property "agents" without inject`, `session/load` cũng trả về cùng lỗi đó với `sessionPersistence`. Dù có 178 unit test xanh và độ phủ dòng 100%, bridge hoàn toàn không hoạt động trong môi trường production. Hai bug độc lập ẩn sau cùng một chuỗi lỗi, và bộ test đều không bắt được cả hai vì cùng một lý do: mọi test đều đi qua một đường mount plugin không chạm tới cách plugin thực sự được nạp và cách service thực sự được phân giải.

## Ảnh hưởng

Máy chủ ACP không thể tạo hay nạp bất kỳ phiên nào — đây chính là hai RPC đầu tiên mà editor gọi. Bất kỳ ai kết nối agent (tác tử) với Zed đều gặp lỗi cứng ngay lập tức. Không mất dữ liệu (chưa có gì được bền vững hóa trước khi sập); cái giá phải trả hoàn toàn là "tính năng không dùng được" cộng hai lần điều tra tìm nguyên nhân.

## Dòng thời gian

- Khi bridge (RFC 010) được đưa vào, nó đi kèm một bộ unit test đầy đủ, bao phủ codec, truyền tải trong bộ nhớ, message giao thức đã sinh ra, đường thất bại và HMR (Hot Module Replacement); ngoài ra còn có một test e2e API thực cần key và một test e2e độ sạch stdout không cần key. Tất cả đều xanh, độ phủ 100%.
- Phiên Zed thực thất bại ngay lập tức tại `session/new`, báo lỗi `cannot get property "agents" without inject`.
- Điều tra ban đầu đi theo hướng lý thuyết "traceable/shadow" của Cordis (nghe có vẻ hợp lý, và cơ chế này thực sự tồn tại — xem Bug #2), sau đó đã chèn thêm log vào việc duyệt fiber thực tế trong `reflect.ts` ở thư mục vendor, và chạy tiến trình con thực. Kết quả trace cho thấy exception được ném ra tại dòng 179 của `apply()`, *tại thời điểm nạp plugin*, nằm ở fiber ROOT và không có shadow — điều này bác bỏ lý thuyết shadow cho trường hợp `session/new`.
- Tìm ra nguyên nhân gốc #1: một dòng thừa `export default apply`. Sau khi xóa, `session/new` được sửa.
- Sau khi xóa, Bug #2 lộ ra: `session/load` vẫn báo lỗi trên `sessionPersistence` — đây là một cơ chế thực sự khác (duyệt shadow), được xác nhận bằng cách cô lập sửa lỗi và chạy lại tiến trình con thực.

## Nguyên nhân gốc #1 — `export default apply` làm mất `inject` của plugin (gây sập `session/new`)

`packages/acp/acp/src/index.ts` là một *plugin dạng namespace*: nó export `name`, `inject`, `Config` và `apply` như các named export độc lập, giống mọi plugin khác trong repo (`invariants`, `llm-deepseek`, `tool-bash`, `tui`, v.v.). Nhưng nó *còn* có thêm một dòng mà các plugin khác không có:

```ts ignore-check
export const name = 'acp'
export const inject = ['agents', 'sessions', 'sessionPersistence']
export function apply(ctx: Context, config: AcpConfig): void { /* … */ }
// …
export default apply   // ← the bug
```

Khi plugin được nạp từ `cordis.yml`, Cordis Loader chuẩn hóa module đã import qua `Loader.unwrapExports` (`vendor/loader/src/index.ts`):

```ts ignore-check
unwrapExports(exports: any) {
  if (isNullable(exports)) return exports
  exports = exports.default ?? exports        // ← prefers `.default`
  if (!exports.__esModule) return exports
  return exports.default ?? exports
}
```

Khi có default export, `exports.default ?? exports` sẽ phân giải thành **hàm `apply` trần**. Hàm trần không có `inject`, không có `name`, không có thuộc tính `Config` — những thứ này tồn tại dưới dạng named export *cùng cấp* trên namespace của module, nhưng việc unwrap về `.default` đã bỏ toàn bộ namespace đó. Loader sau đó dựng fiber của plugin dựa trên `inject` rỗng.

Do đó `apply` chạy trong một fiber **không được inject bất kỳ service nào**. Dòng đầu tiên `const agents = ctx.agents` duyệt cây fiber (ROOT → Include → Loader → ROOT), không tìm thấy `agents` trong store của bất kỳ fiber nào, đến fiber gốc (`runtime === null`) thì ném lỗi `cannot get property "agents" without inject`. Sự sập xảy ra tại *thời điểm nạp*, chứ không phải trong handler xử lý request sau đó — request chỉ tình cờ kích hoạt việc nạp.

**Bản sửa:** xóa `export default apply`. Sau đó Loader dùng namespace của module, nhận diện đúng `inject`/`name`/`Config`, và `apply` chạy trong một fiber đã thực sự được inject các service đã khai báo.

## Nguyên nhân gốc #2 — lượt đọc service tùy chọn qua shadow có thể truy vết kích hoạt guard inject (gây sập `session/load`)

Sau khi sửa #1, `session/new` hoạt động bình thường, nhưng `session/load` vẫn báo lỗi `cannot get property "sessionPersistence" without inject`. Vấn đề này *thực sự* bắt nguồn từ cơ chế proxy/shadow có thể truy vết của Cordis, đáng để hiểu chính xác.

`session/load` gọi `agents.resume(...)`, hàm này ủy quyền cho `AgentLoop.resume()`, nơi đọc `this.ctx.sessionPersistence`. `static inject` của `AgentLoop` cố tình không bao gồm `sessionPersistence` — nếu inject nó sẽ khiến bản demo không bền vững hóa treo mãi mãi, chờ một backend không bao giờ được nạp. Service đó do một plugin/fiber anh em độc lập cung cấp, được đọc theo kiểu cơ hội (opportunistic).

Việc truy cập service trong Cordis đi qua context proxy (`vendor/cordis/src/reflect.ts`). Khi gọi một phương thức service qua một *proxy có thể truy vết* lấy được từ một fiber khác (ở đây: bridge fiber gọi `ctx.agents.resume`, registry trả về `this.factory` — tức `AgentLoop` — bọc lại thành một proxy traceable mới gắn với bên gọi), `createShadowMethod` (`vendor/cordis/src/utils.ts`) sẽ gán lại `this` thành một object *shadow*, với `ctx` của nó mang `[symbols.shadow]` trỏ tới context khởi tạo của chính `AgentLoop`. Bên trong `resume`, việc phân giải `this.ctx.sessionPersistence` bắt đầu duyệt từ fiber của shadow:

```ts ignore-check
// reflect.ts get handler
let fiber = (ctx[symbols.shadow] as Context ?? ctx).fiber   // ← starts at AgentLoop's fiber
while (true) {
  const impl = fiber.store?.[prop]
  if (impl) return getTraceable(ctx, impl.value)
  if (prop in fiber.inject) { /* inactive-context error */ }
  if (!fiber.runtime) throw error                            // ← reached root, throw
  if (fiber.parent[symbols.isolate][prop] !== key) throw error
  fiber = fiber.parent.fiber                                 // ← ancestor-only
}
```

Việc duyệt **chỉ đi theo hướng tổ tiên (ancestor)**. `sessionPersistence` vừa không nằm trong fiber store của `AgentLoop` (không nằm trong `static inject` của nó), cũng không nằm trên bất kỳ tổ tiên nào tới root (nó nằm ở một *nhánh anh em*), do đó việc duyệt đến fiber gốc thì ném lỗi.

Tại sao test khôi phục `AgentLoop` trong bộ nhớ không bắt được vấn đề này? Vì chúng gọi trực tiếp `ctx.agents.resume(...)` từ code test — *bên ngoài mọi fiber plugin*. Lúc này `ctx.fiber.runtime` là `null`, và handler proxy đi theo một đường vòng sớm:

```ts ignore-check
if (!ctx.fiber.runtime) return ctx.reflect.get(prop, false)   // ← direct global-store lookup, no fiber walk
```

`ctx.reflect.get(name, false)` là một lượt tra cứu trực tiếp trong global service store dựa trên isolate symbol — hoàn toàn bỏ qua topology fiber, và sẽ tìm thấy service. Do đó việc đọc từ test cấp cao nhất thành công; còn khi đến từ bên trong một fiber plugin thực, qua shadow, thì lại ném lỗi. Bridge chính là trường hợp thứ hai.

**Bản sửa:** dùng `ctx.get('sessionPersistence')` để đọc service tùy chọn, phương thức này dùng global isolate-keyed store đồng thời vẫn giữ kiểm tra trạng thái hoạt động. Với các service nằm trong tập inject mà plugin đã khai báo, việc đọc thuộc tính trực tiếp vẫn dùng được như bình thường.

## Vì sao mọi test đều không bắt được (thất bại thực sự)

Cả hai bug đều bắt nguồn từ cùng một khoảng trống quy trình căn bản: **không có test nào chạy qua đường nạp plugin thực hoặc topology gọi thực.**

- Harness trong bộ nhớ mount bridge bằng cách dựng thủ công object plugin: `ctx.plugin({ name, inject, apply })`. Cách này cung cấp `inject` thủ công, nên không bao giờ tái hiện được Bug #1 — `unwrapExports` chỉ được *Loader* gọi, `ctx.plugin` không bao giờ gọi nó. Ngay cả `ctx.plugin(NamespaceImport)` cũng không bắt được.
- Cùng harness đó mount mọi thứ dàn phẳng trên một root context, nên việc khôi phục `AgentLoop` chạm tới từ đó hoặc chạy ở cấp cao nhất (đường vòng `!runtime`), hoặc chạy qua shadow mà origin của shadow đó vẫn phân giải về root — che giấu lỗi duyệt tổ tiên của Bug #2.
- e2e không cần key duy nhất chỉ gửi `initialize` và kiểm tra độ sạch stdout. `initialize` không bao giờ chạm tới factory, nên cả hai bug đều lọt qua an toàn.
- Test duy nhất chạy `session/new`/`session/load` cần key mới chạy được, nên CI (không có key) bỏ qua nó — còn ở local nó "pass" chỉ vì một bản `lib/` đã build từ trước (chứa code cũ) tình cờ thỏa mãn việc phân giải module.

Độ phủ dòng 100% luôn được thỏa mãn. Độ phủ chứng minh dòng code *đã được thực thi*; nó không thể chứng minh tính năng có *hoạt động đúng theo cách được giao* hay không.

## Các biện pháp bảo vệ đã bổ sung

- **Xóa `export default apply`** (`packages/acp/acp/src/index.ts`) — bản sửa cho Bug #1.
- **`AgentLoop.resume` dùng `this.ctx.get('sessionPersistence')`** (`packages/core/agent-loop/src/index.ts`) — bản sửa cho Bug #2, kèm chú thích giải thích bẫy duyệt shadow.
- **e2e `session/new` không cần key, chạy qua stdio thực** (`examples/acp-agent/tests/acp.e2e.ts`): khởi động ví dụ dưới dạng tiến trình con qua Loader thực, và assert `session/new` trả về đúng. Có thể phơi bày rõ Bug #1 mà không cần API key. Đã xác nhận rằng khôi phục `export default apply` sẽ khiến test thất bại.
- **Đặt `TSX_TSCONFIG_PATH` trong lệnh spawn e2e**: tiến trình con chạy từ một cwd tạm, tsx không thể tìm được ánh xạ `paths` trong tsconfig của gốc repo bằng cách tìm ngược lên — do đó import dsh-* âm thầm rơi về (fall back) `lib/` đã build. Trỏ tsx tới tsconfig của repo giúp việc phân giải không phụ thuộc vào cwd, đảm bảo test chạy trên *mã nguồn*, chứ không phải sản phẩm build có thể đã lỗi thời.
- **Quy tắc trong [docs/testing.md](../testing.md)**: "kiểm thử đường vào thực", độ phủ dòng không đồng nghĩa với độ phủ hành vi — bài học này được đưa vào quy tắc cho mọi plugin trong tương lai.

## Bài học

- Plugin dạng namespace và default export loại trừ lẫn nhau dưới Cordis Loader. Hãy chọn hình thức namespace (`name`/`inject`/`Config`/`apply`), đừng thêm `export default` — `unwrapExports` sẽ bỏ mất namespace đó.
- Với service mà plugin đọc theo kiểu cơ hội nhưng không khai báo trong `static inject`, hãy dùng `ctx.get(name)`, không bao giờ dùng `ctx.<name>`. Proxy thuộc tính phân giải qua việc duyệt fiber chỉ theo hướng tổ tiên, sẽ thất bại khi đi qua shadow từ bên ngoài; `ctx.get(name)` là một lượt tra cứu không phụ thuộc topology (và mặc định dùng chế độ nghiêm ngặt — đọc từ backend không hoạt động trả về `undefined`, không trả backend đó cho bên gọi trong lúc teardown).
- Test dựng plugin thủ công không thể xác minh cách plugin được nạp. Ít nhất một test phải chạy qua đường Loader/export thực từ đầu đến cuối. Khi thao tác lõi không gọi mô hình, test đó không cần API key — nên nó thuộc về CI, không phải nằm sau cổng key.
- Hãy tin vào kết quả trace, đừng mê tín lý thuyết. Lời giải thích shadow tinh tế là có thật, nhưng đó là bug *thứ hai*; bug *thứ nhất* là một lỗi export một dòng, và sau nhiều giờ suy luận nghe có vẻ hợp lý nhưng thực ra sai, một dòng `console.error` trong lúc duyệt fiber đã tìm ra nó trong vài phút.
