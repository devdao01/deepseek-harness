# Thông tin xác thực của người dùng

[English](credentials.md) | Tiếng Việt

Credential seam của [dsh-credentials](../../packages/credentials/credentials) giữ bí mật nằm ngoài cấu hình: các phân đoạn settings và các mục trong `cordis.yml` chỉ mang *tham chiếu* (tên biến môi trường), còn giá trị thuộc về những provider như [dsh-credentials-local](../../packages/credentials/credentials-local), và consumer giải tham chiếu một lần cho mỗi thao tác — adapter LLM (mô hình ngôn ngữ lớn) giải một lần cho mỗi yêu cầu mô hình, nên thông tin xác thực sau khi xoay vòng sẽ có hiệu lực ngay ở yêu cầu kế tiếp mà không cần khởi động lại. Một quy tắc ở cấp seam ràng buộc mọi provider: giá trị lưu trữ rỗng ở bất cứ đâu cũng được coi như không tồn tại.

Nguồn: [`packages/credentials/credentials/src/index.ts`](../../packages/credentials/credentials/src/index.ts)

## Định danh

Một tham chiếu đặt tên cho một thông tin xác thực bằng tên biến môi trường kiểu POSIX. Brand ngăn bên gọi lẫn lộn credential reference với các chuỗi khác được truyền giữa các package hay tiến trình; cú pháp định danh shell được kiểm tra lúc khởi tạo.

```ts type-equiv
/** Nominal reference to one credential: a POSIX-style environment-variable name. */
type CredentialRef = Branded<'CredentialRef'>
```

## Giải tham chiếu

`resolve(ref)` trả về giá trị cùng lớp nguồn đã cung cấp giá trị đó (do provider định nghĩa); khi chưa được cấu hình thì trả về `undefined`. Consumer giải lại tham chiếu ở mỗi thao tác và tuyệt đối không cache xuyên thao tác — chính kiểu đọc theo từng thao tác này là cơ chế cập nhật nóng.

```ts type-equiv
/** One resolved credential value and the source layer that supplied it. */
interface ResolvedCredential {
  /** The non-empty secret value. */
  value: string
  /** Provider-defined source layer id (the local provider uses `env`, `file`, `project-env`, and `user-env`). */
  source: string
}
```

## Mô tả

`describe(ref)` đáp ứng cho giao diện cấu hình mà tuyệt đối không lộ giá trị: hiện tham chiếu có giải được hay không, đến từ lớp nào, và `set` hiện có thể thành công hay không. Provider cục bộ báo cáo `writable: false` cho những tham chiếu được cấp giá trị bởi môi trường của tiến trình hiện tại — một lần ghi như vậy sẽ có vẻ thành công trong khi việc giải tham chiếu vẫn tiếp tục trả về giá trị che phủ, nên seam từ chối thẳng, và nhờ đó giao diện cũng có thể hiển thị tham chiếu đó ở chế độ chỉ đọc ngay từ đầu.

```ts type-equiv
/** Source and writability facts for one reference, safe for configuration UIs — never the value. */
interface CredentialInfo {
  /** Whether {@link CredentialProvider.resolve} would currently return a value. */
  configured: boolean
  /** Source layer currently supplying the value; absent while unconfigured. */
  source?: string
  /** Whether {@link CredentialProvider.set} would currently succeed for this reference. */
  writable: boolean
}
```

## Thay đổi đã commit

`credentials/updated (ref)` được phát ra sau khi một nguồn do provider quản lý có thay đổi đã commit — `set`, `unset`, hoặc một chỉnh sửa bên ngoài được quan sát thấy trong kho lưu trữ. Thay đổi của chính môi trường tiến trình là không quan sát được và không bao giờ phát sự kiện. Consumer không cần sự kiện này (chúng giải lại tham chiếu theo từng thao tác); nó phục vụ việc giao diện cấu hình làm mới huy hiệu «đã cấu hình».

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcredentials--credentialprovider-abstract-seam"></a>

### `ctx.credentials` — `CredentialProvider` (abstract seam)

Abstract credential service. Providers implement the four operations over their source layers; one seam-wide rule binds them all: an empty stored value is absent everywhere — `resolve` skips it, `describe` reports it unconfigured — so a blank never masquerades as a configured secret.

```ts cordis-catalog
/**
 * Resolve one reference to its current value. Resolution is per call:
 * consumers re-resolve at each operation and must not cache across
 * operations — that per-operation read is what makes a changed credential
 * reach the next operation without a restart.
 * @param ref - the reference to resolve.
 * @returns the value and its source, or `undefined` while unconfigured.
 */
abstract resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined>

/**
 * Describe one reference for configuration surfaces without exposing the
 * value.
 * @param ref - the reference to describe.
 * @returns configured state, supplying source, and writability.
 */
abstract describe(ref: CredentialRef): Promise<CredentialInfo>

/**
 * Durably store one value in the provider-managed writable source. Rejects
 * while a read-only source shadows the reference — the write would appear
 * to succeed while resolution keeps returning the shadowing value — and
 * rejects an empty value (use {@link unset}).
 * @param ref - the reference to store.
 * @param value - the non-empty secret value.
 */
abstract set(ref: CredentialRef, value: string): Promise<void>

/**
 * Remove one reference from the provider-managed writable source; removing
 * an absent reference is a no-op. Rejects while a read-only source shadows
 * the reference, like {@link set}.
 * @param ref - the reference to remove.
 */
abstract unset(ref: CredentialRef): Promise<void>
```

Source: [`packages/credentials/credentials/src/index.ts:60`](../../packages/credentials/credentials/src/index.ts)

<a id="credentials-events"></a>

### `credentials/*` events

<a id="credentialsupdated--emit"></a>

#### `credentials/updated` — emit

Committed change to a provider-managed credential source: a `set`, an `unset`, or an external edit observed in storage. Ambient process-environment changes are not observable and never emit. Listener failures are contained and logged — a sync throw and an async rejection alike — without changing the committed operation's outcome, except `INVARIANT`-coded failures, which rethrow after every listener ran; that rethrow reaches the emitter only from synchronous listeners, so invariant checks on this event must not be async functions.

```ts cordis-catalog
/**
 * Committed change to a provider-managed credential source: a `set`, an
 * `unset`, or an external edit observed in storage. Ambient
 * process-environment changes are not observable and never emit. Listener
 * failures are contained and logged — a sync throw and an async rejection
 * alike — without changing the committed operation's outcome, except
 * `INVARIANT`-coded failures, which rethrow after every listener ran;
 * that rethrow reaches the emitter only from synchronous listeners, so
 * invariant checks on this event must not be async functions.
 * @param ref - the reference whose stored value changed.
 * @mode emit
 */
'credentials/updated'(ref: CredentialRef): void
```

Source: [`packages/credentials/credentials/src/types.ts:29`](../../packages/credentials/credentials/src/types.ts)
<!-- END GENERATED cordis-surface -->
