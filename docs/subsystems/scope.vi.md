# Đăng ký có scope

[English](scope.md) | Tiếng Việt

[Package scope](../../packages/core/scope) cung cấp định danh, carrier và từ vựng tầng scope, giúp cùng một ngữ cảnh đăng ký vừa biểu đạt tính hiển thị theo từng agent (tác tử), vừa biểu đạt quyền sở hữu vòng đời dùng chung. Nó là nguyên thủy thư viện, không phải service Cordis; lý do thiết kế vòng đời do [Agent Note về thiết kế runtime agent-scope](../../.agents/notes/implemented/architecture/2026-07-12-agent-scope-runtime-design.md#scope-routing-one-opaque-key-selects-one-layer) quy định, các quyết định ở tầng registry do [Agent Note về kho lưu trữ dùng chung](../../.agents/notes/implemented/architecture/2026-07-12-scoped-layers-store.md) quy định, còn API gọi được và ngữ nghĩa lọc thì do [README](../../packages/core/scope/README.md) của package quy định.

Mã nguồn: [`packages/core/scope/src/index.ts`](../../packages/core/scope/src/index.ts) và [`packages/core/scope/src/store.ts`](../../packages/core/scope/src/store.ts).

## Định danh và carrier phân phát

`ScopeKey` là một định danh đối tượng mờ đục. agent loop (vòng lặp tác tử) đã phát hành dùng chính đối tượng `Agent` đang hoạt động làm key của nó, nhưng nguyên thủy này không bao giờ soi vào đối tượng đó.

```ts type-equiv
/** An opaque, identity-compared scope key. */
type ScopeKey = object
```

`Scoped<T>` là nhãn thương hiệu ở thời điểm biên dịch, gắn lên bộ nhận định tuyến mờ đục mà `scopeTarget(base, key)` trả về. Khai báo sự kiện có lọc theo scope yêu cầu dùng carrier này làm kiểu `this`, còn chủ thể sự kiện thật vẫn được truyền vào dưới dạng tham số tường minh.

```ts type-equiv
/**
 * A routing-only event receiver built by {@link scopeTarget}. The type
 * parameter records the subject type for dispatch checking; the carrier does
 * not expose the subject's properties. Event payloads carry the real subject.
 */
type Scoped<T extends object> = object & { readonly [ScopedBrand]: T }
```

## Ngữ cảnh đăng ký có quyền sở hữu

`Scope` ghép ngữ cảnh đăng ký có nhãn với hai interface tháo dỡ. `rawDispose` giữ nguyên đúng định danh của disposer Cordis mà một effect tổ hợp có thứ tự cần tới; `dispose()` là ranh giới dừng hẳn công khai dành cho bên gọi trực tiếp và bên gọi tranh chấp.

```ts type-equiv
/** A minted registration scope and its quiescent disposal boundaries. */
interface Scope {
  /** Context through which scope-owned registrations are made. */
  ctx: Context
  /** Exact Cordis disposer, used when nesting this scope in an ordered composite effect. */
  rawDispose: () => Promise<void> | void
  /** Dispose every scope-owned registration; racing calls await the same completion. */
  dispose(): Promise<void>
}
```

## Tầng registry có scope

`ScopeLayer` biểu diễn toàn bộ phần đóng góp của một registry ở tầng toàn cục hoặc ở đúng một tầng scope. Một layer cụ thể có thể gộp nhiều table có tên và không tên; khi cả layer rỗng, `ScopedLayers` có thể thu hồi trạng thái có scope mà không loại bỏ các table anh em.

```ts type-equiv
/** One scope's aggregate contribution to a registry. */
interface ScopeLayer {
  /** Whether every table in this layer is empty. */
  isEmpty(): boolean
}
```

`ScopedLayers<L>` sở hữu layer toàn cục được tạo ngay lập tức, cùng các layer scope chính xác được tạo lười. Việc đọc không tạo ra layer: `peek(undefined)` nghĩa là không tồn tại lớp phủ theo scope, còn `merge()` sẽ lần lượt hiện thực hóa các mục có tên ở tầng toàn cục theo thứ tự chèn cùng các mục che khuất có scope. Việc đăng ký dùng chính một ngữ cảnh để biểu đạt cả tính hiển thị lẫn quyền sở hữu effect của Cordis, lấy được một hàm thu hồi đồng bộ trước phần thông báo tùy chọn, trả về disposer nguyên bản của Cordis, và chỉ thu hồi layer có scope khi toàn bộ `ScopeLayer` của nó rỗng.

`NamedEntries<V>` cung cấp tra cứu theo thứ tự chèn và lặp động, còn lỗi trùng lặp do bên gọi xử lý. `AnonymousEntries<V>` cấp một định danh duy nhất cho mỗi lần append, nên các mục có giá trị bằng nhau vẫn độc lập với nhau. Trong cùng một vòng đời của table không rỗng, iterator có thể quan sát các thay đổi sau đó; sau khi table bị làm rỗng, iterator hiện có sẽ không quan sát các lần chèn tiếp theo nữa. Cả hai đều trả về hàm thu hồi lũy đẳng, tương ứng chính xác với mục tương ứng; interface triển khai dùng chung `EntryValues` không được công khai ra ngoài.
