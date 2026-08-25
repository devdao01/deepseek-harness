# dsh-brand

[English](README.md) | Tiếng Việt

Nguyên thủy kiểu danh nghĩa (nominal type) `Branded<B>`: một gói **chỉ chứa kiểu** rất nhỏ, không có mã runtime, cũng không phụ thuộc vào gói harness nào khác; mọi gói chịu trách nhiệm về id xuyên biên (cross-boundary id) đều dùng chung gói này.

## `Branded` là gì

Việc gắn nhãn (brand) khiến các chuỗi có cấu trúc giống nhau như `SessionId` và `CallId` không thể hoán đổi cho nhau ở tầng kiểu, mặc dù cả hai đều là `string` thông thường tại runtime.

```ts
import type { Branded } from '@deepseek-ai/dsh-brand'

export type SessionId = Branded<'SessionId'>

/** Brand a string as a SessionId (a plain cast — zero runtime cost). */
export function SessionId(id: string): SessionId {
  return id as SessionId
}
```

Thao tác khởi tạo được thực hiện thông qua factory chuyên dụng cho từng id, nằm trong gói sở hữu nó. Hành vi so sánh, ghi log, tuần tự hóa JSON và định dạng giao thức (wire format) giống hệt chuỗi thông thường; thông tin nhãn (brand) sẽ bị xóa tại thời điểm biên dịch.

## Chính sách: gắn nhãn cho id xuyên biên gói

Mỗi gói gắn nhãn cho id mà nó sở hữu: `CallId` nằm trong `dsh-llm`, `SessionId` dùng chung cho agent/session nằm trong `dsh-session`, `JobId` nằm trong `dsh-jobs`. Gắn nhãn cho các id xuyên gói có khả năng bị nhầm lẫn, nhưng không cần gắn nhãn cho mọi chuỗi.

Gói này chỉ chịu trách nhiệm về nguyên thủy duy nhất này. Việc giữ không phụ thuộc nghĩa là, ví dụ, `dsh-jobs` có thể dùng kiểu có nhãn cho `JobId` mà không cần import các gói chức năng không liên quan chỉ để dùng `Branded`.
