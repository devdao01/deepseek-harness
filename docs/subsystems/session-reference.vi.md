# Tham chiếu phiên

[English](session-reference.md) | Tiếng Việt

Yêu cầu tham chiếu xuyên phiên có cấu trúc và ngữ cảnh thông điệp sau khi chuẩn bị. [Quy ước package](../../packages/context/session-reference) định nghĩa URI chuẩn tắc, phép chiếu bề mặt hiện tại, JSON an toàn theo nhãn và bảo toàn byte, lỗi ổn định cùng prompt không đáng tin của mô hình. Bộ điều hợp máy chủ dùng các kiểu này, chứ không đưa cú pháp nhắc (mention) của UI riêng vào lõi agent (tác tử).

Nguồn: [`packages/context/session-reference/src/types.ts`](../../packages/context/session-reference/src/types.ts)

## Đầu vào và ứng viên

`SessionReferenceInput` là lựa chọn không phụ thuộc máy chủ. id có tính thẩm quyền; label là siêu dữ liệu hiển thị đi kèm ảnh chụp.

```ts type-equiv
/** One source session selected by a host. */
interface SessionReferenceInput {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Optional user-facing mention label. */
  label?: string
}
```

`SessionReferenceCandidate` là kết quả khám phá hướng tới máy chủ. Khi tồn tại tiêu đề phiên mới nhất, label của nó dùng tiêu đề đó; việc lọc vẫn chỉ tìm trong session id và cwd, không bao giờ tìm trong transcript (bản ghi văn bản).

```ts type-equiv
/** One host-facing candidate from exact session metadata. */
interface SessionReferenceCandidate {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Latest log-backed title, falling back to the opaque session id. */
  label: string
  /** Source session working directory, when recorded. */
  cwd?: string
  /** Source session creation time in Unix epoch milliseconds. */
  createdAt: number
}
```

## Thông điệp sau khi chuẩn bị

Quá trình chuẩn bị giữ nguyên nội dung thông điệp hiện tại ở dạng đọc được, và trả về tối đa một ngữ cảnh tổng hợp.

```ts type-equiv
/** Direct message content and optional referenced-session context. */
interface PreparedReferencedMessage {
  /** Readable message content after host mention tokens are removed. */
  content: ContentBlock[]
  /** Aggregated untrusted snapshot, absent when the message has no references. */
  additionalContext?: UserMessage
}
```

## Lỗi

`SessionReferenceError.code` phân biệt cấu hình hoặc đầu vào không hợp lệ, tự tham chiếu, giới hạn số lượng, đọc nguồn thất bại, vượt ngân sách và hủy bỏ. Giao thức máy chủ sẽ ánh xạ các code này sang lớp bọc lỗi riêng của mình, không cần kiểm tra byte của prompt.

```ts type-equiv
/** Stable failure codes exposed to host adapters. */
type SessionReferenceErrorCode =
  | 'SESSION_REFERENCE_INVALID_CONFIG'
  | 'SESSION_REFERENCE_INVALID_REFERENCE'
  | 'SESSION_REFERENCE_SELF_REFERENCE'
  | 'SESSION_REFERENCE_TOO_MANY'
  | 'SESSION_REFERENCE_READ_FAILED'
  | 'SESSION_REFERENCE_BUDGET_EXCEEDED'
  | 'SESSION_REFERENCE_CANCELLED'
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionreferenceresolver--sessionreferenceresolver"></a>

### `ctx.sessionReferenceResolver` — `SessionReferenceResolver`

Exact-read consumer that prepares immutable cross-session message context.

```ts cordis-catalog
/**
 * List reference candidates, ranked by working-directory affinity.
 * @param agent - target agent; self is excluded and its cwd drives ranking.
 * @param query - optional case-insensitive session-id/cwd/title substring.
 * @param limit - optional positive result cap.
 * @param signal - optional cancellation boundary for host autocomplete teardown.
 * @returns candidates labeled by latest title or, when absent, session id.
 */
async listCandidates( agent: Agent, query: string = '', limit: number = this.config.candidateLimit, signal?: AbortSignal, ): Promise<SessionReferenceCandidate[]>

/**
 * Snapshot all references before enqueue and return one aggregated durable context.
 * @param agent - target agent; references to it are rejected.
 * @param content - already host-normalized readable message content.
 * @param references - structured source sessions in mention order.
 * @param signal - optional cancellation boundary for host request teardown.
 * @returns detached content and optional referenced-session context.
 */
async prepare( agent: Agent, content: ContentBlock[], references: SessionReferenceInput[], signal?: AbortSignal, ): Promise<PreparedReferencedMessage>
```

Types: [Agent](core.md) · [ContentBlock](llm-streaming.md)

Source: [`packages/context/session-reference/src/index.ts:70`](../../packages/context/session-reference/src/index.ts)
<!-- END GENERATED cordis-surface -->
