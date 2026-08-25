# Lưu trữ spill

[English](spill.md) | Tiếng Việt

Seam lưu trữ spill là một [capability seam](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md) giúp lưu bền văn bản quá lớn của công cụ, rồi trả về định vị hướng tới mô hình cùng chỉ dẫn truy xuất; năng lực này được tách thành ba package: Service Definition ([dsh-spill](../../packages/spill/spill), `ctx.spillStore`), Service Provider ([dsh-spill-local](../../packages/spill/spill-local), tệp riêng tư có phạm vi phiên trên hệ thống tệp của máy chủ) và Consumer ([dsh-spill-policy](../../packages/spill/spill-policy), chính sách `tools/post-execute`). spill là **một năng lực tùy chọn**, không thuộc trục chính của agent loop (vòng lặp tác tử), nên từ vựng của nó được ghi ở đây chứ không nằm trong [core.md](core.md). Cơ chế xem trước vẫn thuộc về [dsh-output-retention](../../packages/util/output-retention); seam này chỉ lưu văn bản cuối cùng do chính sách giao cho nó.

Mã nguồn: [`packages/spill/spill/src/types.ts`](../../packages/spill/spill/src/types.ts)

## Yêu cầu lưu

`saveText` là thao tác dịch vụ duy nhất: lưu bền `content` nguyên trạng, rồi trả về định vị mờ đục, gợi ý truy xuất do backend cung cấp và số byte chính xác. Yêu cầu mang theo không gian tên lưu trữ tại thời điểm lưu (`owner`), công cụ và lời gọi đã sinh ra nội dung (`source`, dùng để đặt tên và kiểm tra chứ không phải kiểm soát truy cập), cùng `suggestedName` mà backend có thể dùng làm gợi ý đặt tên (nó không phải một đường dẫn).

```ts type-equiv
/** One request to persist text to a spill artifact. */
interface SaveTextSpill {
  owner: SpillOwner
  source: SpillSource
  /**
   * A caller-suggested base name (e.g. `web_fetch.txt`). The backend sanitizes
   * it to a single safe path segment before use — it is a hint, never a path.
   */
  suggestedName: string
  /** The full text to persist (UTF-8). */
  content: string
}
```

```ts type-equiv
/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * {@link SpillLocator} is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 */
interface SpillOwner {
  sessionId: SessionId
}
```

`SpillOwner.sessionId` là không gian tên lưu trữ tại thời điểm lưu. Phiên sau khi fork sẽ kế thừa các định vị spill đã có từ log mầm; những artifact đó không bị sao chép hay chuyển quyền sở hữu, còn spill sinh ra sau khi fork thì dùng id của phiên con. Việc dọn dẹp theo thời hạn lưu giữ có thể làm các định vị cũ mất hiệu lực cùng với những artifact phiên cũ khác; seam spill không định nghĩa chính sách dọn dẹp theo từng phiên.

```ts type-equiv
/**
 * Tool and call that produced one spilled artifact — recorded by the backend for a readable
 * filename and inspection. Not interpreted for access control; purely
 * descriptive.
 */
interface SpillSource {
  /** The tool whose result was spilled (e.g. `web_fetch`). */
  toolName: string
  /** The model-issued call id the result belongs to. */
  callId: CallId
  /** A short human label for the artifact (e.g. `result`). */
  label: string
}
```

## Kết quả

```ts type-equiv
/** A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance. */
interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}
```

`SpillLocator` là handle hướng tới mô hình được [branded](core.md#branded-ids) do backend trả về. Backend cục bộ kết xuất nó thành đường dẫn hệ thống tệp; backend từ xa hoặc cơ sở dữ liệu có thể kết xuất URI, khóa hoặc token lệnh. Bên tiêu thụ coi nó là giá trị mờ đục và kết xuất bằng `retrievalHint`, thay vì mặc định rằng `read` luôn là cơ chế truy xuất đúng.

```ts type-equiv
/**
 * Opaque model-facing handle for one spilled artifact. A local backend may use a
 * filesystem path; a remote or database backend may use a URI or key. Consumers
 * render it with {@link SpillRef.retrievalHint}, but do not parse it.
 */
type SpillLocator = Branded<'SpillLocator'>
```

## Dịch vụ

`SpillStore` (`ctx.spillStore`, định nghĩa tại [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)) là dịch vụ trừu tượng chỉ có một phương thức: `saveText(input) → Promise<SpillRef>`. Nó lưu bền toàn bộ `content`, và từ chối khi việc lưu trữ thực sự thất bại (quyền hạn, ENOSPC, backend không khả dụng). Seam này chỉ lo phần lưu trữ: không lo chính sách lưu giữ, không thay thế kết quả công cụ, không cung cấp API truy xuất／tìm kiếm.

Backend cục bộ ([dsh-spill-local](../../packages/spill/spill-local)) ghi vào `<root>/session-<hash>/<random>-<safeName>`: thư mục gốc là thư mục riêng tư (0700) đã cấu hình hoặc tạo trễ, thư mục con của phiên dùng `sha256(sessionId)`, và ghi theo cách độc quyền chỉ chủ sở hữu truy cập được (`open(path, 'wx', 0o600)`) để ngăn symlink cấy sẵn chuyển hướng thao tác ghi. `locator` của nó là đường dẫn cục bộ, còn `retrievalHint` cho mô hình biết hãy dùng `read` hoặc `grep` trên đường dẫn đó. Bên tiêu thụ chính sách ([dsh-spill-policy](../../packages/spill/spill-policy)) sẽ thay kết quả cuối cùng dạng văn bản thuần vượt quá `maxInlineBytes` bằng phần xem trước đầu-cuối do thư viện lưu giữ sinh ra kèm tham chiếu spill; quá trình này là nỗ lực tốt nhất: khi lưu thất bại thì giữ nguyên kết quả nội tuyến ban đầu, chứ không biến một lời gọi thành công thành `isError`.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxspillstore--spillstore-abstract-seam"></a>

### `ctx.spillStore` — `SpillStore` (abstract seam)

Abstract spill storage service. Subclass, implement saveText, and load the subclass as a plugin — it registers as `ctx.spillStore` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior).

Semantics every implementation must honor:

- saveText persists the FULL `content` verbatim and returns an opaque locator, exact byte length, and model-facing retrieval guidance.
- Storage is scoped by the request's SaveTextSpill.owner session; the backend chooses a private (not world-readable) location and a collision-free name derived from — never equal to — the caller's `suggestedName`.
- `saveText` REJECTS on a real storage failure (permissions, ENOSPC, backend unavailable); the caller decides how to degrade (the spill policy treats a rejection as best-effort and keeps the inline result).

```ts cordis-catalog
/**
 * Persist `input.content` to a session-scoped spill artifact.
 * @param input - the owner, caller-supplied source fields, suggested name, and full text to save.
 * @returns the saved artifact's {@link SpillRef}; rejects on a storage failure.
 */
abstract saveText(input: SaveTextSpill): Promise<SpillRef>
```

Source: [`packages/spill/spill/src/index.ts:45`](../../packages/spill/spill/src/index.ts)
<!-- END GENERATED cordis-surface -->
