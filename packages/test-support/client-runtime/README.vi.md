# @deepseek-ai/dsh-client-test-runtime

[English](README.md) | 中文

Runtime kiểm thử slot jsdom hướng tới kiểm thử tính năng phía client: `Context` Cordis thật, `SlotRegistry` production và renderer web-react, được lắp ráp quanh các test double session/workspace có kiểu. Bộ test tính năng có thể kiểm thử đầy đủ khai báo, đăng ký, scope, store, inject, render, cập nhật và hủy mà không cần tự dựng máy móc cho từng bộ — và không tồn tại bản triển khai thứ hai nào của logic production.

Các test double triển khai chính xác giao diện đối ngoại mà tính năng nhận được qua ctx (`TestSessions implements ISessions`, `TestWorkspaces implements IWorkspaces`; mỗi fixture session là `FixtureSession implements SessionFace`; `stubSettingsScope` là `SettingsScope` được test điều khiển việc publish, kèm spy khi ghi), nên một khi mặt production đổi hình dạng, test rig sẽ báo lỗi ngay ở thời điểm biên dịch, chứ không âm thầm trôi dạt. provide bundle được vật chất hóa bằng cách chạy trực tiếp `SessionProvideChannel` production — dùng chung bản triển khai với `SessionRuntime`. Fixture chỉ bơm dữ liệu thông thường: dòng danh sách, snapshot session (được viết lại bằng patch immer qua `updateSnapshot`), giá trị projection, và các stub hành vi lấy kiểu theo `ISession` — spec gọi động từ chưa được stub sẽ báo lỗi rõ ràng. `provide()` có kiểu sẽ ràng buộc fake của tên dịch vụ đã khai báo thành tập con `Partial` của giao diện đối ngoại dịch vụ đó.

Snapshot DOM cục bộ: `declare(children)` đăng ký frame tự động, lớp bọc `<div data-slot>` theo từng key chính là gốc snapshot; `renderSlot(key, owner)` trả về view cục bộ của slot đó (container, truy vấn Testing Library có giới hạn phạm vi, `update(owner)` tại chỗ); bộ serializer snapshot đã đăng ký gấp tên class hash CSS-module về lại tên ngữ nghĩa (`_frame_a1b2c3` → `frame`) để giữ `.snap` chỉ chứa cấu trúc, và gấp nội dung bên trong `<svg>` thành dấu vân tay `data-content`. Bộ test cần frame trang tùy chỉnh dùng `root.declare(children, Frame)` thay thế; `mount(plugin)` chạy trên fiber thật và báo lỗi trước khi thiếu dịch vụ; `dispose()` tháo dỡ view, feature fiber, scope đã đúc và trạng thái store bền vững theo một trục duy nhất.

Không thuộc đồ thị plugin sản phẩm (không có `dsh.client`); các gói feature chỉ phụ thuộc vào nó qua `devDependencies`.

## Trải nghiệm model

Không có; gói này là hạ tầng kiểm thử phía trình duyệt, không có gì đến được request model.

#### KV Cache effect

Không có; gói này không lắp ráp cũng không gửi request tới provider.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ có thể tiêu thụ qua alias mã nguồn trong repo.** spec phân giải tới `src` qua tsconfig `paths`; artifact build `lib/` lại export `@deepseek-ai/dsh-client-runtime/client`, và bundle đó là script loader trình duyệt không có export ESM Node, nên `lib/index.js` không thể import được dưới Node thuần. Mọi bên tiêu thụ đều là bộ Vitest trong repo; không tồn tại entry point runtime tương thích Node.
- **Snapshot session là dữ liệu fixture, không phải lịch sử phát lại (replay).** `updateSnapshot` ghi trực tiếp vào store snapshot; phép tính wire tới snapshot vẫn do test của chính gói runtime và e2e replay canh giữ. Do đó fixture có thể biểu diễn trạng thái mà projection production không bao giờ tạo ra.
