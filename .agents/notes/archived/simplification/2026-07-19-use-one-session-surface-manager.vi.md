# Agent Note: Mỗi session chỉ dùng một surface manager

Status: implemented

Archived: 2026-07-26

[English](2026-07-19-use-one-session-surface-manager.md) | 中文

## Vấn đề

`Session` trước đây duy trì hai instance `SurfaceManager` cho cùng một event log chỉ-thêm-vào (append-only). Một instance chịu trách nhiệm kiểm chứng event khởi tạo (seed) và event ứng viên thêm vào; instance còn lại được tạo trễ (lazy) độc lập gộp (fold) các event đã commit, phục vụ `session.surface`, tin nhắn dẫn xuất, compaction (nén) và context workspace. Một khi surface công khai được đọc, mỗi event sau đó đều thúc đẩy hai bản trạng thái node và trạng thái thế hệ thay thế (replace generation) trùng lặp, mà không tạo thành nguồn sự thật độc lập hay ranh giới lỗi nào.

## Quyết định

Mỗi `Session` chủ động tạo và chỉ giữ một `SurfaceManager` duy nhất. Luồng tiếp nhận event khởi tạo và event thêm vào gọi `validateNext()` của manager này trước khi commit event, còn `session.surface` trả về cùng đối tượng đó qua hợp đồng chỉ-đọc sau:

```ts
export interface SessionSurface {
  readonly nodes: readonly number[]
  readonly replaceGeneration: number
}
```

Việc kiểm chứng event ứng viên vẫn giữ tính nguyên tử (atomic). `validateNext()` có thể đồng bộ các event log đã commit, nhưng chỉ lập kế hoạch thay đổi cho event ứng viên chưa commit. Event ứng viên chỉ đi vào trạng thái manager sau `log.push()`, ở lần đồng bộ tăng dần tiếp theo, do đó việc kiểm chứng surface thất bại hay bị `internal/dispatch` phủ quyết trước khi commit sẽ không để lại node hay thế hệ thay thế giả.

`foldSurface()` vẫn là hàm replay toàn bộ log tách biệt, dùng cho kiểm chứng offline và tái tạo lại. Nó dùng cùng phép chuyển trạng thái, và nhất quán với manager đang hoạt động ở mỗi tiền tố đã commit, nhưng không chia sẻ trạng thái có thể thay đổi.

## Phương án thay thế

**Tiếp tục tách trạng thái tiếp nhận và view chiếu (projection).** Hai instance độc lập trông có vẻ có thể cô lập việc đọc công khai và việc kiểm chứng, nhưng những gì bên gọi nhận được vốn dĩ là trạng thái surface được mượn, hợp đồng chỉ-đọc đã khai báo ngăn chặn việc sửa đổi thông thường. Việc nhân đôi manager không tạo thành ranh giới tin cậy runtime.

**Tính lại surface công khai từ toàn bộ log ở mỗi lần đọc.** Phương án này loại bỏ được trạng thái cache trùng lặp, nhưng sẽ từ bỏ việc dẫn xuất tăng dần, khiến mỗi lần dựng request tăng trưởng theo toàn bộ lịch sử session.

## Ảnh hưởng

- Luồng tiếp nhận, `session.surface`, tin nhắn dẫn xuất, compaction và context workspace quan sát cùng một trạng thái tăng dần.
- `Session.surface` không phơi bày phương thức kiểm chứng, đồng thời giữ định danh đối tượng và mảng node chỉ-đọc được mượn ổn định.
- Ép kiểu (type assertion) mang tính cố ý phá hoại vẫn có thể phá vỡ trạng thái được mượn; bên gọi JavaScript cố tình lách qua hợp đồng chỉ-đọc không thuộc ranh giới cùng tiến trình được hỗ trợ.
- Test surface, seed, phủ quyết dispatch, tái tạo request, compaction và context workspace bao phủ cả manager dùng chung lẫn đường replay tách biệt.
