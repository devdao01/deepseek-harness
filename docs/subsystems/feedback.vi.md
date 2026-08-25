# Phản hồi cho message

[English](feedback.md) | Tiếng Việt

[`@deepseek-ai/dsh-message-feedback`](../../packages/feedback/message-feedback) sở hữu phần phản hồi có thể chỉnh sửa dành cho từng message của assistant. Nó cố ý tách khỏi sự kiện `feedback/record` bất biến ở cấp Session: message feedback là một bản ghi đi kèm (sidecar) thuộc storage-domain cục bộ, không phải nội dung hay phép chiếu của Session log, và cũng không thực hiện bàn giao telemetry.

Nguồn: [`packages/feedback/message-feedback/src/types.ts`](../../packages/feedback/message-feedback/src/types.ts)

## Kiểu công khai

```ts type-equiv
/** Opaque compare-and-set token for one exact feedback item revision. */
type MessageFeedbackVersion = Branded<'MessageFeedbackVersion'>
```

```ts type-equiv
/** The human's overall judgment of one assistant message. */
type MessageFeedbackRating = 'positive' | 'negative'
```

```ts type-equiv
/** One current feedback value and its opaque mutation token. */
interface MessageFeedbackItem {
  /** Stable identity of the assistant message inside the owning Session. */
  readonly messageId: MessageId
  /** Overall positive or negative judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional explanation, preserved verbatim after validation. */
  readonly note?: string
  /** Equality-only token replaced by every material create or update. */
  readonly version: MessageFeedbackVersion
  /** Host-assigned creation time in Unix epoch milliseconds. */
  readonly createdAt: number
  /** Host-assigned time of the most recent material update. */
  readonly updatedAt: number
}
```

```ts type-equiv
/** Read all message feedback belonging to one persisted Session lifecycle. */
interface MessageFeedbackListRequest {
  /** Persisted Session whose sidecar should be read. */
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** Current feedback values for one Session, in first-creation order. */
interface MessageFeedbackListValue {
  /** Fresh immutable item snapshots. */
  readonly items: readonly MessageFeedbackItem[]
}
```

```ts type-equiv
/** Create or replace feedback for one assistant message. */
interface MessageFeedbackPutRequest {
  /** Persisted Session that owns the target message. */
  readonly sessionId: SessionId
  /** Target assistant-message identity. */
  readonly messageId: MessageId
  /** Desired overall judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional non-blank explanation. */
  readonly note?: string
  /** Observed item version, or `null` to require that no item exists. */
  readonly ifVersion: MessageFeedbackVersion | null
}
```

```ts type-equiv
/** Delete feedback for one message after observing its current version. */
interface MessageFeedbackDeleteRequest {
  /** Persisted Session that owns the sidecar. */
  readonly sessionId: SessionId
  /** Message whose feedback should be absent after this operation. */
  readonly messageId: MessageId
  /** Observed item version; ignored when the item is already absent. */
  readonly ifVersion: MessageFeedbackVersion
}
```

```ts type-equiv
/** Idempotent deletion acknowledgement. */
interface MessageFeedbackDeleteValue {
  /** Stable postcondition shared by the first deletion and every retry. */
  readonly absent: true
}
```

```ts type-equiv
/** No persisted Session header exists for the requested id. */
interface MessageFeedbackSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** The id does not name a derived, append-origin assistant message. */
interface MessageFeedbackTargetNotFound {
  readonly code: 'target-not-found'
  readonly sessionId: SessionId
  readonly messageId: MessageId
}
```

```ts type-equiv
/** A material mutation did not match the addressed item's current version. */
interface MessageFeedbackVersionConflict {
  readonly code: 'version-conflict'
  /** Authoritative current item, or `null` when it does not exist. */
  readonly current: MessageFeedbackItem | null
}
```

```ts type-equiv
/** A supplied note contains no non-whitespace character. */
interface MessageFeedbackNoteBlank {
  readonly code: 'note-blank'
}
```

```ts type-equiv
/** A supplied note exceeds the configured UTF-8 byte limit. */
interface MessageFeedbackNoteTooLarge {
  readonly code: 'note-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}
```

```ts type-equiv
/** Failures shared by the public message-feedback operations. */
type MessageFeedbackFailure =
  | MessageFeedbackSessionNotFound
  | MessageFeedbackTargetNotFound
  | MessageFeedbackVersionConflict
  | MessageFeedbackNoteBlank
  | MessageFeedbackNoteTooLarge
```

```ts type-equiv
/** Successful public operation result. */
interface MessageFeedbackSuccess<T> {
  readonly ok: true
  readonly value: T
}
```

```ts type-equiv
/** Rejected public operation result with a stable business failure. */
interface MessageFeedbackRejected<E extends MessageFeedbackFailure> {
  readonly ok: false
  readonly error: E
}
```

```ts type-equiv
/** Result returned by the message-feedback `list` operation. */
type MessageFeedbackListResult =
  | MessageFeedbackSuccess<MessageFeedbackListValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound>
```

```ts type-equiv
/** Result returned by the message-feedback `put` operation. */
type MessageFeedbackPutResult =
  | MessageFeedbackSuccess<MessageFeedbackItem>
  | MessageFeedbackRejected<
    | MessageFeedbackSessionNotFound
    | MessageFeedbackTargetNotFound
    | MessageFeedbackVersionConflict
    | MessageFeedbackNoteBlank
    | MessageFeedbackNoteTooLarge
  >
```

```ts type-equiv
/** Result returned by the message-feedback `delete` operation. */
type MessageFeedbackDeleteResult =
  | MessageFeedbackSuccess<MessageFeedbackDeleteValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound | MessageFeedbackVersionConflict>
```

## Dữ liệu và tính đồng thời

Mỗi Session có một bản ghi đi kèm chứa danh tính header `{createdAt, cwd}` và các mục phản hồi được khóa theo `MessageId`. Mỗi mục mang đánh giá tốt hoặc xấu, ghi chú tùy chọn, các dấu thời gian `createdAt`/`updatedAt` do Host gán, và version opaque của riêng nó. Version chỉ được dùng để so sánh bằng, và chỉ so sánh với message đích; bên gọi không được sắp thứ tự hay tự tổng hợp nó.

`put` áp dụng đồng thời lạc quan nghiêm ngặt: mọi yêu cầu trên một mục đã tồn tại đều phải khớp `ifVersion` hiện tại, ngay cả khi yêu cầu không làm thay đổi giá trị đích. Xung đột sẽ trả về mục hiện tại có thẩm quyền (hoặc `null` khi không tồn tại), nhờ vậy bên gọi có thể hòa giải phản hồi bị mất hoặc chỉnh sửa đồng thời mà không cần đọc thêm. Xóa một mục vốn đã không tồn tại cũng thành công. Hàng đợi phân theo Session bao trọn việc kiểm tra, đọc, phán định xung đột và ghi nguyên hàng, nên những bảo đảm này áp dụng cho các lời gọi đồng thời trong một tiến trình Host duy nhất.

## Thẩm quyền về mục tiêu và vòng đời

`SessionPersistence.inspect()` cung cấp quan sát về Session đích, và không xuất bản hay khôi phục Agent, cũng không commit cold repair. Đường đi cold trước hết được `listSnapshots()` tiền kiểm để xác định rõ là không tồn tại; còn Session đã vào danh mục mà kiểm tra thất bại thì được truyền đi nguyên trạng như một sự cố hạ tầng. `put` chỉ chấp nhận `assistant/message` không rỗng, thuộc append-origin và có `MessageId` đã chỉ định; các bản ghi replacement-origin, bản ghi rỗng chỉ mang usage, và bản ghi không phải của assistant đều không phải mục tiêu phản hồi.

Danh tính `{createdAt, cwd}` đã lưu phải khớp với header thu được khi kiểm tra. Không khớp thì xử lý như không tồn tại: `list` trả về danh sách rỗng, còn `put` có thể thay thế hàng cũ bằng một bản ghi mới gắn với danh tính header hiện tại. Fork dùng danh tính Session mới, nên dù seed có chứa cùng những message thì vẫn không nhận được bản sao của bản ghi đi kèm.

## Lưu trữ bền vững và Remote contract

Dịch vụ lưu toàn bộ hàng Session trong storage domain `message_feedback` thông qua `ctx.storageDomain`. Trước khi `put` commit bản ghi đi kèm tham chiếu tới message đích, mục tiêu live có danh tính khớp sẽ đi qua checkpoint `ctx.sessions.flush` có thẩm quyền; sau đó cả đường đi live lẫn cold đều đọc lại vật lý từ số thứ tự 0 qua `SessionPersistence.readFrom`. Quan sát thu được sẽ được xác thực lại trước khi ghi bản ghi đi kèm, nên phần commit bền vững của log đích luôn diễn ra trước bản ghi đi kèm của nó. `maxNoteBytes` là trường bắt buộc, giới hạn phần văn bản ghi chú theo số byte UTF-8; bản kết hợp Web Host đặt giá trị `8192`. Package này xuất bản các Remote contract một ngôi của Host là `messageFeedback.list`, `messageFeedback.put` và `messageFeedback.delete` thông qua `TypertRemoteService` và `@Remote`; phần Cordis API được sinh ra bên dưới là thẩm quyền ở mức phương thức.

Plugin disposal trước hết đóng việc tiếp nhận thay đổi, rút cạn công việc đã vào hàng đợi của từng Session, rồi mới đóng storage domain.

## Giao diện Web

[`@deepseek-ai/dsh-client-ui-message-feedback`](../../packages/client/ui-message-feedback) là consumer phía trình duyệt. `@deepseek-ai/dsh-api-remotes` gắn phần đóng góp `messageFeedback` được sinh ra, nên plugin này gọi `ctx.remote.messageFeedback` mà không đụng tới tầng truyền tải.

Điều khiển này là mục `feedback` (order 10) của list slot `conversation.chat.assistant-actions`; slot đó do `ui-conversation` khai báo và được render trong hàng IconActions của các message assistant đã chốt. Để đến được điểm render đó cần một thay đổi ở đường ống: `AssistantMessageNode` giờ mang `messageId` tùy chọn lấy từ sự kiện `assistant/message`. Phần đầu ra dở dang bị đóng băng do gián đoạn không có trường này, và điểm render sẽ bỏ qua slot khi trường vắng mặt. Thanh thao tác này render một lần cho mỗi Turn, trên message assistant kết thúc lượt: Host chấp nhận mọi message bước thuộc append-origin làm mục tiêu, nhưng trong một Turn nhiều bước thì các bước trước đó render hàng tool chứ không phải phần nội dung có thể đánh giá, nên phạm vi UI phơi bày hẹp hơn mức Host contract cho phép.

Mỗi Session có một `MessageFeedbackController`, hỗ trợ điều khiển cho mọi message trong Session đó: chỉ một lần đọc `list` là đủ lấp đầy toàn bộ cuộc hội thoại, và lần đọc đó được hoãn tới lần hover hoặc focus đầu tiên chứ không kích hoạt lúc mount. Mỗi thay đổi gửi version cuối cùng mà controller quan sát được làm `ifVersion`; phản hồi `version-conflict` mang theo mục có thẩm quyền, và controller dựa vào đó để đối chiếu mà không cần tải lại. Các thay đổi được tuần tự hóa theo Session, và thao tác trong hàng đợi được so với version đã commit. `connection/reset` chỉ làm mới những Session đã từng được đọc.

## Ranh giới và giới hạn

- Hàng đợi thay đổi chỉ có hiệu lực trong tiến trình. storage-domain không có ghi có điều kiện xuyên tiến trình, nên khi nhiều Host cùng ghi vào một thư mục gốc lưu trữ thì không có bảo đảm compare-and-swap hay chống mất cập nhật.
- Session persistence không có interface xóa bền vững. Dịch vụ không coi `session/disposed` hay `host/session-removed` là hành động xóa, nên không ngụy tạo thao tác lan truyền; sau khi log bị gỡ ngoài luồng, bản ghi đi kèm mồ côi có thể vẫn tiếp tục tồn tại.
- Yêu cầu rơi đúng vào khoảng cửa sổ cực ngắn sau khi live detach nhưng trước khi persistence catalog vật chất hóa header có thể nhận `session-not-found`; bên gọi nên thử lại sau khi retirement materialization hoàn tất.
- Do persistence không có thao tác đọc metadata theo id, yêu cầu cold sẽ quét toàn bộ thư mục snapshot của Session. Một hàng Session đơn lẻ cũng không có giới hạn về số mục hay tổng số byte; chừng nào chưa có consumer cụ thể sở hữu chính sách cho hàng, `maxNoteBytes` chỉ giới hạn từng ghi chú.
- Chỉ khi `{createdAt, cwd}` khác nhau thì danh tính header mới nhận diện được id được tái sử dụng; contract này không phân biệt được các log nhân bản giữ nguyên cùng danh tính header.
- Host contract không ghi lại actor đã xác thực hay danh tính phục vụ kiểm toán, nên giả định rằng ranh giới bên gọi là đáng tin cậy.
- Điều khiển Web chỉ xuất hiện trong khung xem hội thoại. Khung xem trajectory và waterfall không render mục phản hồi, dù các nút assistant của chúng cũng mang cùng `messageId`.
- Sidecar này không phát khung thời gian thực, nên đánh giá từ một tab khác phải chờ tới lúc kết nối lại hoặc lần phản hồi xung đột kế tiếp mới thấy được, chứ không xuất hiện ngay.
- Trình soạn ghi chú không kiểm tra trước `maxNoteBytes`; ghi chú quá dài sẽ thất bại với `note-too-large` lúc lưu, chứ không phải trong lúc nhập.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmessagefeedback--messagefeedbackservice"></a>

### `ctx.messageFeedback` — `MessageFeedbackService`

Storage-domain sidecar service. It inspects persisted Session history and never creates or resumes an Agent or Session.

```ts cordis-catalog
/**
 * Read feedback belonging to the current persisted Session lifecycle.
 * A stale row from a reused Session id is invisible.
 * @param request - Session identity to inspect and list.
 * @returns current immutable items or `session-not-found`.
 */
@Remote('list') async list(request: MessageFeedbackListRequest): Promise<MessageFeedbackListResult>

/**
 * Create or replace feedback for one derived append-origin assistant
 * message. Every request must match the addressed item's current version;
 * a matching no-op returns the stored item without changing its revision.
 * @param request - target, desired value, and observed item version.
 * @returns the committed item or an explicit business failure.
 */
@Remote('put') put(request: MessageFeedbackPutRequest): Promise<MessageFeedbackPutResult>

/**
 * Delete one feedback item. Absence is successful regardless of the
 * supplied version; an existing item requires an exact version match.
 * @param request - Session, message, and observed item version.
 * @returns the stable absent postcondition, or an explicit failure.
 */
@Remote('delete') delete(request: MessageFeedbackDeleteRequest): Promise<MessageFeedbackDeleteResult>
```

Source: [`packages/feedback/message-feedback/src/index.ts:150`](../../packages/feedback/message-feedback/src/index.ts)
<!-- END GENERATED cordis-surface -->
