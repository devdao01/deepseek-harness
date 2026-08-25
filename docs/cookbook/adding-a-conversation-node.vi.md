# Thêm Web Client Conversation Node

[English](adding-a-conversation-node.md) | Tiếng Việt

Hướng dẫn này thêm một hàng nội dung do nghiệp vụ tự sở hữu vào view Chat của Web Client. Plugin hoàn chỉnh sau khi làm xong sẽ liên kết một họ sự kiện Session bền vững thành một Context, dựng State nghiệp vụ theo kiểu gia tăng (incremental), phát hành dữ liệu Step có kiểu, rồi render Chat Node có khóa (keyed); toàn bộ quá trình không quét cửa sổ Session hay các node đã render khác. Hướng dẫn này giả định Host đã ghi lại các sự kiện này, và plugin Client này đã được lắp vào Web bundle; các view mục tiêu bổ sung như UI ngoài phía Host và Trajectory không nằm trong phạm vi tài liệu này.

[Quyết định lắp ráp Conversation Node](../../.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.md) ghi lại đầy đủ mô hình engine và lý do thiết kế; tài liệu này chỉ trình bày đường đi triển khai.

## 1. Thiết kế họ sự kiện có thể replay

Hãy chọn một id nghiệp vụ ổn định trước khi viết Definition. Mỗi sự kiện cấu thành cùng một Node phải mang id đó, hoặc chỉ dựa trên payload của chính nó để suy ra id đó một cách độc lập; Client không bao giờ được đoán rằng một update thuộc về "Context chưa hoàn tất gần nhất".

Lấy một review job làm ví dụ, quy ước sự kiện có thể là:

| Sự kiện | Vai trò | Sự thật bắt buộc phải được bền vững hóa |
|---|---|---|
| `review/start` | start duy nhất | `reviewId`, tọa độ Turn/Step, tiêu đề |
| `review/progress` | update | cùng `reviewId`, tọa độ, tiến độ có thể replay |
| `review/end` | update | cùng `reviewId`, tọa độ, tóm tắt cuối cùng |

Dùng kiểu id gắn nhãn (branded) do bên sản xuất sở hữu để vượt qua ranh giới tiến trình. Đặt phần gộp `SessionEventMap` và kiểu payload trong export kiểu thuần túy của bên sản xuất, sau đó gói Client import export đó chỉ dưới dạng side-effect kiểu (type-only). Mỗi `(kind, id)` chỉ được có tối đa một sự kiện start. Với nghiệp vụ chỉ có một sự kiện duy nhất, có thể dùng chính danh tính ổn định của sự kiện đó (ví dụ `event.seq`) làm id nội bộ của Definition.

Hệ thống hỗ trợ sự kiện gia tăng. Nếu bên sản xuất có thể phát ra whole-value checkpoint với chi phí thấp thì nên ưu tiên dùng, vì khi start nằm ngoài cửa sổ đã nạp, checkpoint vẫn dùng trực tiếp được. Mỗi delta phải mang id ổn định, và khi replay theo thứ tự tăng dần của `seq` trong log thì phải tạo ra State một cách tất định; nó không được phụ thuộc vào trạng thái chỉ tồn tại trong bộ nhớ thời gian thực. Nếu cửa sổ lịch sử hiện tại chỉ có update, Assembler sẽ giữ một Context đang chờ (pending), và không dựng State cho đến khi phân trang sớm hơn bổ sung đủ start. Nếu sản phẩm bắt buộc phải render khi start chưa được nạp, sự kiện terminal hoặc checkpoint phải mang đủ trạng thái fallback hoàn chỉnh, để Definition có thể dựng kết quả trực tiếp; đừng khôi phục nó bằng cách quét các sự kiện không liên quan.

## 2. Triển khai Definition và Chat payload có kiểu

Để thể hiện đầy đủ mối quan hệ liên kết, đoạn code dưới đây viết khai báo của bên sản xuất và đóng góp của Client trong cùng một khối code. Trong bộ package thực tế, id gắn nhãn và khai báo `SessionEventMap` nên nằm ở bên sản xuất sự kiện, còn Definition, gộp Chat data và renderer nên nằm ở plugin Client.

```ts ignore-check
import { createElement } from 'react'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  ClientContext, ConversationLocation, ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

type ReviewId = Branded<'ReviewId'>

interface ReviewStartData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly title: string
}

interface ReviewProgressData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly completed: number
}

interface ReviewEndData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly summary: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one durable review job.
     * @mode emit
     * @param data - stable identity, location, and initial display state.
     */
    'review/start': ReviewStartData
    /**
     * Records replayable progress for one review job.
     * @mode emit
     * @param data - stable identity, location, and latest progress.
     */
    'review/progress': ReviewProgressData
    /**
     * Closes one review job with its final summary.
     * @mode emit
     * @param data - stable identity, location, and final display state.
     */
    'review/end': ReviewEndData
  }
}

interface ReviewChatData {
  readonly title: string
  readonly completed: number
  readonly status: 'running' | 'completed'
  readonly summary?: string
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'review-job': ReviewChatData
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationStepDataMap {
    'review-job': ReviewChatData
  }
}

interface ReviewState extends ReviewChatData {
  readonly turn: number
  readonly step: number
}

function locationOf(context: ConversationNodeContext): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

function viewData(state: ReviewState): ReviewChatData {
  return {
    title: state.title,
    completed: state.completed,
    status: state.status,
    ...state.summary === undefined ? {} : { summary: state.summary },
  }
}

const reviewDefinition: ConversationNodeDefinition<ReviewState> = {
  kind: 'review-job',
  target: 'chat',
  match: (event) => {
    if (event.type === 'review/start') {
      return { id: String(event.data.reviewId), role: 'start' }
    }
    if (event.type === 'review/progress' || event.type === 'review/end') {
      return { id: String(event.data.reviewId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'review/start') throw new Error('review-job requires review/start')
    return {
      turn: match.event.data.turn,
      step: match.event.data.step,
      title: match.event.data.title,
      completed: 0,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === 'review/progress') {
      return { ...context.state, completed: match.event.data.completed }
    }
    if (match.event.type === 'review/end') {
      return { ...context.state, completed: 100, status: 'completed', summary: match.event.data.summary }
    }
    return context.state
  },
  publication: match => match.event.type === 'review/progress'
    ? 'animation-frame'
    : 'immediate',
  buildLocationData: (context, scope) => {
    if (scope !== 'step' || context.state === undefined) return null
    return {
      kind: 'step',
      turn: context.state.turn,
      step: context.state.step,
      key: 'review-job',
      value: viewData(context.state),
    }
  },
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'review-job',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: locationOf(context),
      visibility: 'visible',
      data: viewData(context.state),
    }
  },
}

function ReviewNodeView({ node }: ChatNodeViewProps<'review-job'>) {
  const text = node.data.summary ?? `${node.data.title}: ${node.data.completed}%`
  return createElement('p', null, text)
}

export const inject = ['conversationEvents', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(reviewDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'review-job',
  }, ReviewNodeView))
}
```

`match(event)` là bộ trích xuất danh tính (identity extractor), không phải fold: nó chỉ nhận được sự kiện hiện tại, và trả về id nội bộ của Definition cùng vai trò trong vòng đời. Khi khớp, Assembler định vị Context theo `(kind, id)`, rồi gọi `start` một lần, hoặc giao State hiện tại cho `update`. Cả hai hàm đều phải trả về State mà engine sẽ dùng tiếp sau đó; khuyến nghị trả về một value bất biến (immutable) mới, nhưng nếu hàm sửa đổi tại chỗ (in-place) rồi trả về cùng một object, ngữ nghĩa tiếp nhận cũng vẫn giống nhau.

`buildLocationData(context, scope)` có thể phát hành dữ liệu do Definition sở hữu lên Turn hoặc Step do engine sở hữu. Dùng declaration merging để chỉ định kiểu value chính xác cho từng key. Một Node khác trong cùng Location đó có thể dùng slot hook giới hạn (ví dụ `useTurnData(key)`) để đọc giá trị đó, mà không cần lấy Session, cũng không cần quét `snapshot.chat.nodes`.

`target` và `buildViewNode(context)` phải cùng khai báo một đóng góp render do target sở hữu. Hãy giữ `context.key` làm danh tính phía React, chọn `anchorSeq` dựa trên bằng chứng thứ tự bền vững, và chỉ trả về dữ liệu mà renderer có thể dùng trực tiếp. Một khi một Node target đã được phát hành, hãy tiếp tục trả về cùng một key; khi cần tạm rời khỏi luồng hiển thị hãy dùng `visibility: 'hidden'`, đừng đổi thành trả về `null` để thu hồi nó.

## 3. Chỉ truy vấn Context nghiệp vụ sớm hơn tại thời điểm start

Một số Definition cần State mới nhất của một kind nghiệp vụ khác, nằm trước vị trí hiện tại. `start` sẽ nhận được `ConversationContextReader`; hãy gọi `reader.previous<State>(kind)` tại đây, đừng nhận tập hợp Context hoặc quét sự kiện. Reader trả về dữ liệu chỉ-đọc của Context đã bắt đầu gần nhất trước `seq` start hiện tại.

Assembler sẽ ghi lại phụ thuộc này. Nếu prepend cũ hơn sau đó mang tới một Context tiền nhiệm gần hơn, bổ sung một khoảng trống cửa sổ trước đây chưa biết, hoặc State tiền nhiệm bị sửa đổi, engine sẽ chạy lại Context của bên phụ thuộc từ `start`, và replay update của nó theo thứ tự tăng dần của `seq`. Definition được truy vấn vẫn chịu trách nhiệm ghi thông tin hữu ích vào State của chính nó; Reader không cung cấp phương thức truy vấn chuyên biệt theo nghiệp vụ, cũng không cấp quyền sửa đổi Context khác.

## 4. Hiểu ba đường nạp dữ liệu

Lịch sử có thể được yêu cầu từ đuôi, từng trang một hướng về trước, nhưng mỗi trang đã nhận được sẽ chuẩn hóa theo thứ tự tăng dần của `seq` trước, rồi mới đưa vào replay State.

| Đường | Việc engine làm | Hành vi Definition có thể quan sát được |
|---|---|---|
| replace khi open, resync, hoặc gap repair | Dựng lại cửa sổ đã nạp, mỗi sự kiện khớp một lần với mỗi Definition, rồi replay mỗi Context đã có start | Thực thi `start` trước, rồi thực thi update của nó theo thứ tự tăng dần của `seq`; chỉ có update thì Context đang chờ vẫn chưa có State |
| prepend một trang lịch sử sớm hơn | Chỉ khớp các sự kiện sớm hơn mới thêm vào, gộp vào Context theo `(kind, id)`, giữ nguyên node có khóa hiện có, và chỉ chạy lại Context và phụ thuộc bị ảnh hưởng | start mới phát hiện sẽ kích hoạt các update đã thu thập; thay đổi Location hoặc phụ thuộc tiền nhiệm cũng có thể khiến Context chạy lại |
| append một sự kiện thời gian thực | Mỗi Definition gọi `match` một lần, tìm Context khớp theo key, chỉ cập nhật Context đó | Thực hiện một lần `update` cho sự kiện khớp sau start và yêu cầu một lần phát hành; không quét Context hiện có |

Khi đăng ký `D` Definition, một sự kiện mới sẽ chỉ khớp `D` lần với sự kiện hiện tại; việc tra cứu key Context sau khi khớp là thời gian hằng số. Code Definition phải giữ vững tính chất này: đường nóng (hot path) append bình thường không được duyệt qua toàn bộ cửa sổ sự kiện, mọi Context, `context.matches`, hoặc tập hợp Node đã render. Sự thật tích lũy đưa vào State, thông tin dùng chung trong cùng Turn/Step đưa vào Location data, phụ thuộc tiền nhiệm có chỉ mục dùng `reader.previous()`.

`publication` điều khiển thời điểm vật chất hóa sau khi State thay đổi. Dùng `immediate` cho thay đổi cấu trúc hoặc terminal, dùng `animation-frame` cho delta hiển thị tần suất cao, dùng `none` khi chỉ tích lũy State cho lần phát hành sau. Engine vẫn áp dụng mỗi update theo thứ tự log; tùy chọn này chỉ gộp tần suất phát hành view.

## 5. Xác minh replay, phân trang và render

Thêm test tập trung, chứng minh các kết quả sau:

1. Cửa sổ đầy đủ sau replace tạo ra State cuối cùng, Location data, payload Node và `anchorSeq` đúng như dự kiến.
2. Cửa sổ đuôi chỉ có update vẫn ở trạng thái pending; sau khi prepend start duy nhất, kết quả giống hệt replace đầy đủ.
3. Tiếp tục append thời gian thực sau lịch sử ban đầu, kết quả giống với việc replay cửa sổ đầy đủ đã gộp.
4. prepend trang sớm hơn chỉ thêm các hàng sớm hơn; value Node có khóa hiện có mà dữ liệu không đổi sẽ không bị thay thế.
5. delta hiển thị lặp lại giữ nguyên `context.key`, và khi yêu cầu `animation-frame` thì phát hành tối đa một lần mỗi frame.
6. renderer có khóa chỉ tiêu thụ `node.data` và hook Location giới hạn, không quét cửa sổ sự kiện Session, Context, hay Chat Node.

Về xử lý stream và ngắt quãng, xem [`packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts`](../../packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts); về truy vấn tiền nhiệm, xem [`inbox.ts`](../../packages/client/ui-conversation/src/client/conversation-nodes/inbox.ts) và [`message.ts`](../../packages/client/ui-conversation/src/client/conversation-nodes/message.ts); ví dụ chỉ phát hành Turn data mà không tạo Node riêng, xem [`packages/client/ui-deliverables`](../../packages/client/ui-deliverables).
