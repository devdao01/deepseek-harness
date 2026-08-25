# @deepseek-ai/dsh-host-plugin-inventory

[English](README.md) | Tiếng Việt

Hình chiếu (projection) Host chỉ đọc của cây Cordis Loader hiện tại. `PluginInventoryGateway` đăng ký dịch vụ `pluginInventory`, và công bố một Remote trực tiếp do Typert sinh ra: `pluginInventory/list`. Mỗi lệnh gọi đọc trực tiếp `ctx.loader.entries()`, bỏ qua các dòng group mang tính cấu trúc, sau đó trả về các mục còn lại theo thứ tự Loader, và chỉ bao gồm id mục Loader, định danh module, trạng thái bật hiệu lực và pha (phase) Fiber gốc hiện tại.

Pha có thể là `pending`, `loading`, `active`, `failed` hoặc `unloading`; là `null` khi mục không có Fiber gốc còn sống. Snapshot này cố tình chỉ thể hiện thời điểm gọi: Loader vẫn là thẩm quyền vòng đời duy nhất, package này không sở hữu cache, lịch sử, mô hình nguồn gốc, luồng sự kiện hay đường dẫn chỉnh sửa. Kiểu payload công khai nằm ở `./types`, Typert sinh ra sản phẩm Remote cho Host và Client được export từ `./typert` và `./remote`.

Dịch vụ này chỉ dành cho Remote sử dụng, cố tình không khai báo merge `Context` Cordis cùng tiến trình. Package client tiêu thụ nó thông qua lắp ráp [`api-remotes`](../../api/remotes/README.md) tường minh, chứ không import triển khai Host.

## Trải nghiệm model

Không có, vì hình chiếu inventory chỉ dành cho Host này không đăng ký prompt, tool, message hay request nhà cung cấp.

#### Ảnh hưởng KV Cache

Không có; package này không bao giờ lắp ráp đầu vào cho model.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ thể hiện thời điểm gọi** — kết quả không bao gồm lịch sử thất bại bền vững hay subscription; miễn là không tồn tại Fiber gốc còn sống, sẽ báo cáo `null`, không phân biệt lý do.
- **Không có nguồn gốc hay khả năng chỉnh sửa** — dịch vụ không nhận biết mục được đưa vào bởi bundle, profile hay override nào, cũng không thể bật, tắt, thêm hay gỡ plugin.
