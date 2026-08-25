# Attachment ảnh bền vững

[English](attachment.md) | Tiếng Việt

Attachment seam tách quyền sở hữu ảnh nhị phân ra khỏi log session. Bên sản xuất giao các byte đã mã hóa và được kiểm chứng cho [`ctx.attachments`](#ctxattachments--attachmentstore-abstract-seam); chỉ sau khi đối tượng được lưu bền vững xong, service mới phát hành một tham chiếu bất biến, định địa chỉ theo nội dung (content-addressed). Sự kiện session và `ImageBlock` mà mô hình nhìn thấy chứa tham chiếu đó cùng metadata của nó, không bao giờ chứa object URL của trình duyệt, đường dẫn tạm của host gốc, URL của bên cung cấp, hay dữ liệu base64.

Bản nháp chưa gửi trên trình duyệt có thể ở lại trong bộ nhớ, client gốc cũng có thể lưu tạm chúng trong bộ nhớ tạm của hệ điều hành. Sau khi host chấp nhận message của người dùng, nó sẽ di chuyển ảnh trong message tới `<DSH_HOME>/attachments/v1` trước, rồi mới nối thêm sự kiện người dùng. Đầu ra ảnh có cấu trúc của mô hình tuân theo cùng quy tắc: lưu bền vững trước, nối sự kiện sau.

Nguồn: [`packages/attachment/attachment/src/types.ts`](../../packages/attachment/attachment/src/types.ts)

## Định danh và metadata đã kiểm chứng

`AttachmentId` là chuỗi mờ (opaque) có gắn nhãn kiểu. Backend cục bộ hiện sinh ra `sha256:<digest>`, nhưng bên tiêu thụ không được phân tích cách biểu diễn này, cũng không được suy ra đường dẫn hệ thống tệp từ đó.

```ts type-equiv
/** Raster image formats accepted by the version-one attachment path. */
type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
```

```ts type-equiv
/** Durable, serializable metadata for one immutable image object. */
interface ImageAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Media type verified from the stored bytes. */
  mediaType: ImageMediaType
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
  /** Optional display name stripped of local path information. */
  name?: string
}
```

```ts type-equiv
/** Deployment-resolved limits used by upload admission and request buffering. */
interface ImageAttachmentLimits {
  maxImageBytes: number
  maxImagesPerMessage: number
  maxMessageImageBytes: number
  maxImagePixels: number
  mediaTypes: readonly ImageMediaType[]
}
```

Tham chiếu ghi lại kích thước nội tại và độ dài đã mã hóa, giúp client bố trí lịch sử mà không cần giải mã trước; mỗi lần đọc có thẩm quyền vẫn kiểm chứng lại digest, chữ ký media, kích thước và metadata dựa trên đối tượng thực.

## Ghi và đọc dữ liệu đã kiểm chứng

```ts type-equiv
/** Request to validate and durably commit one image. */
interface SaveImageAttachment {
  data: Uint8Array
  /** Caller-declared media type, checked against fully decoded bytes. */
  mediaType: ImageMediaType
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string
}
```

```ts type-equiv
/** Stored image bytes returned after reference and digest verification. */
interface StoredImageAttachment {
  ref: ImageAttachmentRef
  data: Uint8Array
}
```

`saveImage()` kiểm chứng byte và commit một đối tượng theo cách nguyên tử, sau đó mới trả về tham chiếu của nó. `validateImage()` thực hiện cùng bước kiểm tra chấp nhận, nhưng không lưu bền vững bất cứ thứ gì; bên gọi theo lô sẽ kiểm chứng toàn bộ thành viên qua hàm này trước khi lưu bất kỳ thành viên nào, nên việc kiểm chứng bị từ chối sẽ không để lại đối tượng dở dang. `readImage()` nhận tham chiếu đến từ đường dẫn session đã được ủy quyền, chỉ trả về byte sau khi kiểm chứng tính toàn vẹn thành công. Service này cố ý không quy định policy giữ lại (retention): session được khôi phục và fork có thể chia sẻ đối tượng, nên việc thu gom rác dựa trên tham chiếu sẽ được triển khai sau, chứ không gắn với việc xóa của bất kỳ session riêng lẻ nào.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxattachments--attachmentstore-abstract-seam"></a>

### `ctx.attachments` — `AttachmentStore` (abstract seam)

Immutable binary attachment service. Implementations validate bytes before publishing a reference.

```ts cordis-catalog
/**
 * Validate one image without persisting it.
 * Batch callers validate every member before saving any member.
 * @param input - encoded bytes, declared media type, and optional display name.
 * @returns completion after the encoded raster has been fully decoded.
 */
abstract validateImage(input: SaveImageAttachment): Promise<void>

/**
 * Validate one ordered image batch before committing any member.
 * Validation failures start no writes; storage failures return no partial
 * references, although already published content-addressed objects may stay
 * unreachable until a future retention policy collects them.
 * @param inputs - encoded images in their owning message order.
 * @returns durable references in the exact input order.
 */
async saveImages(inputs: readonly SaveImageAttachment[]): Promise<readonly ImageAttachmentRef[]>

/**
 * Validate and durably commit one image before its owning session event is appended.
 * @param input - encoded bytes, declared media type, and optional display name.
 * @returns a durable content-addressed reference.
 */
abstract saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef>

/**
 * Read one image and verify that bytes still match the recorded reference.
 * @param ref - durable reference from the session log.
 * @param signal - optional cancellation for backend read and verification work.
 * @returns the verified bytes and canonical reference.
 * @throws the signal reason when aborted, or a storage error when verification fails.
 */
abstract readImage(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<StoredImageAttachment>
```

Source: [`packages/attachment/attachment/src/index.ts:31`](../../packages/attachment/attachment/src/index.ts)
<!-- END GENERATED cordis-surface -->
