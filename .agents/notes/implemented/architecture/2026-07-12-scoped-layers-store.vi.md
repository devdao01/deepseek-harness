# Agent Note: Kho lưu trữ phân lớp theo scope dùng chung

Status: implemented

[English](2026-07-12-scoped-layers-store.md) | Tiếng Việt

## Vấn đề

Cơ chế scope agent (smart agent) ([Quyết định](2026-07-08-agent-scope-contexts.md), [Thiết kế runtime](2026-07-12-agent-scope-runtime-design.md)) khiến các registry hỗ trợ scope lặp đi lặp lại cùng một hình dạng: một lớp đăng ký toàn cục, cộng một lớp tương ứng chính xác với một agent cụ thể. Bảy mặt tiền (facade) đăng ký đều dùng hình dạng này: `tools.register`, `tools.restrict` và `tools.guard` (trong `dsh-tools`); `SystemPrompt.section`, `SystemPrompt.tools` và `SystemPrompt.variable` (trong `dsh-system-prompt`); và `CommandRuntime.register` (trong `dsh-commands`).

Nếu không có nguyên thủy (primitive) dùng chung, mỗi mặt tiền phải tự lặp lại cùng một chuỗi điều phối vòng đời xoay quanh trạng thái lĩnh vực riêng của nó: xuất khả năng hiển thị từ context của phía gọi, tạo container riêng theo yêu cầu, gắn quyền sở hữu vào cùng một Cordis fiber, nạp undo trước rồi mới thông báo observer, trả về nguyên trạng disposer của Cordis, và thu hồi trạng thái riêng khi rỗng. Các kiểu map và set tách biệt riêng lẻ cũng khiến dịch vụ thiếu một đối tượng biểu thị toàn bộ đóng góp của một scope.

Việc lặp code mang theo ba yêu cầu không rõ ràng:

- Khả năng hiển thị và quyền sở hữu phải đến từ cùng một context; nếu tách riêng việc nhận hai điều này, có thể đăng ký ra một đóng góp hiển thị với một scope nhưng lại bị hủy cùng một scope khác.
- Undo phải được thu thập trước khi callback thay đổi chạy, để callback ném lỗi vẫn có thể rollback thay đổi.
- Disposer công khai phải chính xác là hàm mà `ctx.effect()` trả về; bọc nó sẽ phá vỡ việc tháo dỡ có thứ tự dựa trên identity của Cordis.

Điều được chia sẻ là vòng đời và kho lưu trữ giữ thứ tự chèn, chứ không phải chính sách registry. Giới hạn tool, xử lý mục vận chuyển giữ lại, thời điểm đánh giá prompt, chuẩn hóa command, chẩn đoán chính xác và cô lập exception của callback vẫn thuộc về quy ước riêng của từng lĩnh vực.

## Quyết định

`@deepseek-ai/dsh-scope` cung cấp module implementation `store.ts` độc lập với kiểu key. Package tiếp tục liệt kê Cordis và `@deepseek-ai/dsh-invariants` là peer dependency; plugin đồng hành bất biến thức của nó giữ nguyên. Gốc package export bốn ký hiệu lưu trữ: `ScopeLayer`, `ScopedLayers`, `NamedEntries` và `AnonymousEntries`. `EntryValues` vẫn là interface nội bộ, `store.ts` không phải subpath của package.

`ScopeLayer` giữ khái niệm tổng hợp (aggregate) tường minh, đồng thời chỉ yêu cầu xác định toàn bộ lớp có rỗng hay không. Dịch vụ định nghĩa một lớp cụ thể, khiến cấu trúc bảng và helper lĩnh vực của nó phù hợp với dịch vụ đó; `ScopedLayers` chịu trách nhiệm về construct, chọn lựa, gắn vòng đời, thông báo và thu hồi tổng hợp.

## Interface công khai

```ts ignore-check
export interface ScopeLayer {
  isEmpty(): boolean
}

export class ScopedLayers<L extends ScopeLayer> {
  constructor(
    createLayer: (scope: ScopeKey | undefined) => L,
    onChange: () => void,
  )

  readonly global: L
  peek(scope: ScopeKey | undefined): L | undefined

  merge<V>(
    scope: ScopeKey | undefined,
    pick: (layer: L) => NamedEntries<V>,
  ): Map<string, V>

  effect(
    ctx: Context,
    action: (layer: L) => () => void,
    options: { label: string; notify?: boolean },
  ): () => void
}

export class NamedEntries<V> {
  constructor(duplicateError: (name: string) => Error)
  insert(name: string, value: V): () => void
  get(name: string): V | undefined
  has(name: string): boolean
  keys(): IterableIterator<string>
  entries(): IterableIterator<[string, V]>
  values(): IterableIterator<V>
  isEmpty(): boolean
}

export class AnonymousEntries<V> {
  append(value: V): () => void
  values(): IterableIterator<V>
  isEmpty(): boolean
}
```

## Quy ước lưu trữ

- Constructor chỉ tạo `global` một lần duy nhất, gọi `createLayer(undefined)`. Chỉ `effect()` mới tạo lớp riêng; `peek()` và `merge()` không bao giờ tạo lớp riêng, còn `peek(undefined)` trả về `undefined`, vì lớp toàn cục đã tồn tại tường minh từ trước.
- `merge()` là interface đọc tổng quát duy nhất hiện thực hóa (materialize) kết quả. Nó copy các mục đăng ký toàn cục có tên theo thứ tự chèn, rồi áp dụng các mục riêng theo thứ tự chèn của chúng; các mục cùng tên hoàn tất việc che (shadow), nhưng không di chuyển các tên không liên quan.
- `NamedEntries.insert()` kiểm tra và chèn theo cách nguyên tử (atomic), trả về undo có tính idempotent chỉ hủy đúng mục đó, và lấy chẩn đoán trùng tên chính xác của registry sở hữu thông qua factory do phía gọi cung cấp. Việc truy vấn và iterator giữ thứ tự gốc của `Map`, và giữ duyệt sống (live traversal) trong cùng một generation của bảng không rỗng; xóa rỗng bảng sẽ mở một generation mới, do đó iterator chưa kết thúc không thể quan sát việc tự thay thế.
- `AnonymousEntries.append()` cấp một key nội bộ duy nhất cho mỗi lần đăng ký, do đó các callback hay giá trị khác có giá trị bằng nhau vẫn độc lập với nhau. Iterator của nó giữ thứ tự chèn, và dùng cùng ranh giới duyệt sống theo generation.
- `effect()` xuất khóa qua `scopeOf(ctx)` và gắn action vào cùng một `ctx.effect()`. Nó chỉ chấp nhận một action đồng bộ, và action đó chỉ trả về một undo đồng bộ; action hoặc trả về undo của nó, hoặc phải ném lỗi trước khi giữ lại bất kỳ đóng góp nào. Helper không chuẩn hóa union `Effect` rộng hơn của Cordis.
- `effect()` thu thập undo của action trước khi gọi `onChange`, và trả về nguyên trạng disposer của `ctx.effect()`. Khi hủy, action undo chạy trước rồi mới thông báo; Cordis bảo đảm tính idempotent của nó; chỉ khi `ScopeLayer.isEmpty()` của toàn bộ lớp trả về true, helper mới xóa lớp riêng.
- `options.notify` mặc định là `true`. Chính sách riêng của callback vẫn có hiệu lực cuối cùng: callback thay đổi của tool và prompt có thể ném lỗi và kích hoạt rollback đăng ký; `CommandRuntime.notifyChange()` cô lập lỗi observer; guard của tool truyền `notify: false`.

## Di chuyển registry

`dsh-tools` định nghĩa một `ToolLayer`, chứa tool có tên cùng các đăng ký restriction và guard đã biên dịch ẩn danh. `ToolRuntime` giữ resolver lĩnh vực riêng tư của nó, chịu trách nhiệm về định nghĩa hiển thị, tên đã biết trước restriction, tên toàn cục có thể bị hạn chế, việc che riêng, restriction, và việc chèn `run_code` được giữ lại. Việc đánh giá guard sẽ duyệt sống bảng toàn cục trước, rồi mới duyệt sống bảng riêng: đăng ký mới thêm vào một generation không rỗng có thể chạy trong lần phân phối hiện tại, còn việc tự thay thế sau khi xóa rỗng bảng guard chỉ chạy từ lần phân phối tiếp theo.

`dsh-system-prompt` định nghĩa một `PromptLayer`, chứa đoạn (section) và biến có tên, cùng provider tool ẩn danh. Luồng lắp ráp hợp nhất các đoạn trước khi đánh giá, do đó provider bị che sẽ không bị gọi. Mỗi lần lắp ráp chỉ hiện thực hóa một lần tập thành viên provider tool. Provider biến sẽ duyệt sống bảng toàn cục trước, rồi mới duyệt sống bảng riêng: provider mới thêm vào một generation không rỗng có thể chạy trong lần lắp ráp hiện tại, còn việc tự thay thế sau khi xóa rỗng bảng biến chỉ chạy từ lần lắp ráp tiếp theo.

`dsh-commands` định nghĩa một lớp bảng đơn, chứa `NamedEntries<RegisteredCommand>`. View đang có hiệu lực dùng `merge()`; `CommandRuntime` giữ việc chuẩn hóa và đóng băng định nghĩa, chẩn đoán trùng tên chính xác, descriptor bất biến đã sắp xếp, thực thi trực tiếp, dọn dẹp HMR (Hot Module Replacement), và hành vi cô lập lỗi riêng cho từng observer `commands/change`.

Cả bảy mặt tiền đều giữ việc xác thực và chẩn đoán trong registry sở hữu của chúng, và tiếp tục trả về nguyên trạng disposer của Cordis. Việc di chuyển không thay đổi hành vi registry công khai, cũng không thay đổi output mô hình nhìn thấy hay con người nhìn thấy, cũng như output ở tầng protocol, lưu trữ bền vững hay cấu hình.

## Phương án thay thế

**Giữ các implementation độc lập riêng lẻ.** Cách này không cần thêm interface thư viện mới, nhưng cả bảy mặt tiền vẫn sẽ lặp lại thứ tự vòng đời, identity disposer và việc thu hồi scope.

**Mỗi bảng một helper.** Cách này giảm được một phần code cục bộ, nhưng vẫn giữ nhiều map phân theo scope, và không thể thu hồi đúng đóng góp tổng hợp của một scope.

**Mỗi scope một instance registry.** Sub-registry cần lấy view toàn cục cộng riêng qua ủy quyền, xử lý phép trừ đặc biệt cho restriction, và phát hiện observer xuyên instance. Cách này chỉ chuyển dịch độ phức tạp, chứ không loại bỏ nó.

**Tham số scope tường minh trên phương thức đăng ký.** Việc tách input khả năng hiển thị và quyền sở hữu khiến vòng đời không khớp trở thành trạng thái có thể biểu diễn, còn việc bỏ sót scope sẽ lặng lẽ trở thành đăng ký toàn cục.

**Chấp nhận toàn bộ union `Effect` của Cordis.** Cả bảy cổng đăng ký đều không liên quan tới setup bất đồng bộ, nhiều undo, hay ranh giới kết toán độc lập. Nếu không có phía tiêu thụ hiện có cần, việc chuẩn hóa tổng quát chỉ lặp lại cơ chế vòng đời của Cordis.

**Phơi bày `ScopedLayers.values()`, `ScopedLayers.keys()`, hoặc predicate cho phép toàn cục.** Các thao tác này sẽ mã hóa chiến lược duyệt sống hay hiện thực hóa đặc thù của phía tiêu thụ, cùng chiến lược lọc. Việc duyệt trực tiếp bảng mục giữ được ngữ nghĩa sống tường minh, `merge()` bao phủ thao tác che tên dùng chung, còn `ToolRuntime` tiếp tục giữ resolver riêng có chức năng phong phú hơn.

**Đặt `values()` lên `ScopeLayer`, hoặc export `EntryValues`.** Một lớp tổng hợp các bảng dị thể (heterogeneous), do đó không có kiểu giá trị hay chiến lược iterator nhất quán. `EntryValues` chỉ phù hợp để chia sẻ chi tiết implementation giữa hai lớp bảng; phơi bày nó công khai chỉ mở rộng interface, mà không mang lại cách đọc toàn lớp có ý nghĩa cho phía gọi.

**Mô tả lớp sinh ra bằng bảng mapped-type.** Cả lớp cụ thể ba bảng và một bảng đều ngắn, dễ kiểm tra, và có thể tự do giữ helper lĩnh vực. Bộ sinh class sẽ thêm một mô hình construct thứ hai và hình dạng runtime sinh ra, mà lợi ích lại nhỏ.

## Hệ quả

- Các registry hỗ trợ scope đều biểu thị trạng thái qua một lớp tổng hợp, và tái sử dụng cùng chuỗi điều phối construct, quyền sở hữu, rollback, thông báo và thu hồi. Mỗi registry vẫn giữ chính sách xác thực, chẩn đoán, lọc, đánh giá và observer đặc thù riêng của lĩnh vực.
- Interface đọc công khai được giữ hẹp: việc duyệt trực tiếp bảng mục giữ được ngữ nghĩa sống tường minh, `merge()` là thao tác hiện thực hóa che tên dùng chung duy nhất. `ScopeLayer` dị thể không có quy ước `values()` toàn lớp.
- Helper cố ý giữ đồng bộ. Nếu đăng ký tương lai cần setup bất đồng bộ hoặc nhiều undo sở hữu riêng, phải làm rõ quyền sở hữu và ranh giới kết toán trước, rồi mới mở rộng quy ước này.
- Action phải ném lỗi trước khi giữ lại đóng góp, hoặc trả về undo cho mọi thứ nó đã giữ lại; helper không thể sửa các thay đổi vượt quá quy ước này. Thao tác mục được cung cấp mang tính nguyên tử; registry đã di chuyển sẽ thực hiện xác thực có thể thất bại trước khi chèn.
- Lớp riêng sẽ luôn giữ trạng thái đã được cấp phát, cho tới khi mọi bảng trong tổng hợp của nó đều rỗng. Do đó, việc hủy một mặt tiền sẽ không làm mất các đóng góp khác của cùng scope đó.
- Bốn ký hiệu công khai tạo thành một quy ước package có thể tái sử dụng. Giữ `EntryValues` là interface nội bộ, và giữ chính sách phía tiêu thụ ngoài helper, giúp giới hạn phạm vi tương thích.
- Việc di chuyển không thay đổi bất kỳ hành vi registry công khai nào, cũng không thay đổi bất kỳ output nào ở tầng mô hình, con người, protocol, lưu trữ bền vững, cấu hình hay đồ thị phụ thuộc.

## Xác minh

- Test đơn vị của `dsh-scope` bao phủ việc construct toàn cục, việc construct trễ (lazy) của lớp riêng, việc đọc không tạo mới, thứ tự hợp nhất và che theo tên, thu hồi tổng hợp, dọn dẹp khi factory và action thất bại, thứ tự thông báo và rollback, `notify: false`, nhãn effect, identity disposer gốc, việc tháo dỡ idempotent, lỗi trùng tên do phía gọi cung cấp, đăng ký độc lập của các giá trị ẩn danh bằng nhau, iterator sống, và việc tách khỏi generation sau khi xóa rỗng bảng.
- Bộ test chuyên biệt cho tool, system prompt và command bao phủ restriction, xử lý mục vận chuyển giữ lại, tính nhất quán giữa tên đã biết và tên có thể hạn chế, việc guard tái nhập (reentrant) và tự thay thế, thứ tự xác thực, chẩn đoán chính xác, việc che section trước khi đánh giá, quan hệ thành viên snapshot của provider, biến tái nhập và tự thay thế, observer command cô lập lỗi, view đã đóng băng và sắp xếp, thực thi trực tiếp và hủy vòng đời.
- Việc kiểm tra tương đương kiểu (type equivalence) của dữ liệu cốt lõi scope gắn tài liệu `ScopeLayer` với khai báo nguồn của nó. Cổng kiểm tra tài liệu, module graph, build, hygiene, coverage và sản phẩm build cấp toàn repo bao phủ export gốc package và ranh giới package.
- Các snapshot không cần key hiện có của ACP (Agent Client Protocol), headless và TUI tiếp tục đóng vai trò ranh giới hồi quy (regression) cho tool schema và việc lắp ráp prompt; command con người do TUI bao phủ. Việc implement không cập nhật bất kỳ transcript (bản ghi văn bản) kỳ vọng nào.
