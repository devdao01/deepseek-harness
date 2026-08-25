# @deepseek-ai/dsh-storage

[English](README.md) | Tiếng Việt

Trung tâm lưu trữ (`ctx.storage`) cho dữ liệu phi-phiên: một registry backend có tên cộng với các facility dạng dữ liệu đã được mount. Bản thân trung tâm không thực hiện IO: backend sở hữu phương tiện, còn dạng dữ liệu sở hữu ngữ nghĩa. [Tổng quan họ storage](../README.md) liệt kê các gói này; [Agent Note về lưu trữ KV theo domain](../../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md) ghi lại lý do thiết kế.

## Cấu trúc

- `ctx.storage.backend`: bảng tên → backend. Nhiều backend giữ trạng thái mount song song (`json`, `sqlite`); backend nào phục vụ một bên tiêu thụ là do cấu hình của chính bên tiêu thụ đó quyết định (bảng định tuyến ở tầng domain), tuyệt đối không phải lựa chọn toàn cục của trung tâm. `register()` trả về hàm giải phóng tài nguyên; đăng ký trùng tên hoặc tra cứu tên không xác định đều báo lỗi rõ ràng.
- `ctx.storage.mount(form, facility)`／`ctx.storage.form(form)`: mount dạng dữ liệu. `StorageForms` có thể mở rộng bằng declaration merging; tầng domain merge `domain` và truy cập qua `ctx.storage.domain`.
- Một backend sở hữu một phương tiện và công bố các **facet** hình dạng dữ liệu mà nó hỗ trợ. Facet hiện tại là `kv`; `src/backend.ts` chịu trách nhiệm định nghĩa giao ước chính xác của nó.

## Trải nghiệm mô hình

### Đăng ký backend và form

#### Những gì mô hình nhìn thấy

Không có. `ctx.storage` là registry phía host; trung tâm không đăng ký tool, không chèn prompt và cũng không ghi sự kiện phiên.

#### Ảnh hưởng tới Token

Không làm tăng token trực tiếp ở bất kỳ request nào.

#### Ảnh hưởng tới KV Cache

Độc lập với request thời gian thực: trung tâm không bao giờ chạm vào tiền tố request, nên không thể làm mất hiệu lực việc tái sử dụng cache của nhà cung cấp.

## Giới hạn đã biết và phần tạm hoãn

- **`kv` là hình dạng dữ liệu duy nhất**: hiện tại backend chỉ có một facet cần triển khai.
- **Dạng dữ liệu được phân giải theo nhu cầu**: đọc `ctx.storage.domain` trước khi plugin domain mount sẽ ném `form-not-mounted`; quá trình lắp ráp sẽ sắp xếp các plugin theo đúng thứ tự tương ứng (cấu hình sai báo lỗi rõ ràng, thay vì âm thầm trì hoãn xử lý).
