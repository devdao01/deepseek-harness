# Agent Note: Lỗi thay đổi có bảo vệ bổ sung hướng dẫn khắc phục tại ranh giới model

Status: implemented

[English](2026-08-03-fs-tool-error-remedy.md) | Tiếng Việt

## Vấn đề

Các thất bại `write` và `edit` có bảo vệ đến với model dưới dạng thông báo chỉ nêu điều kiện mà không đưa ra cách khắc phục đúng duy nhất: `FS_STALE_VERSION` («file changed since it was read») và `FS_NOT_OBSERVED` («edit requires reading … first»). Model phải tự đoán rằng cách khắc phục là đọc lại (hoặc đọc lần đầu) rồi thử lại, trong khi các tầng retry/quyền/UI định tuyến dựa trên mã lỗi có cấu trúc cũng nhìn thấy đúng đoạn văn bản thông báo đó. Thông báo do provider sở hữu thuộc về từ vựng hướng máy của seam lưu trữ ([seam năng lực hệ thống tệp](../architecture/2026-06-17-filesystem-capability-seam.md)), nên hướng dẫn khắc phục không thể đặt ở đó, nếu không sẽ rò rỉ cách diễn đạt hướng model sang mọi bên tiêu thụ `FsError`.

## Quyết định

`dsh-tool-fs` sở hữu một tầng bao lỗi hướng model là `remediateFsError` (nằm trong `src/error.ts`), được áp dụng trong `write.ts` và `edit.ts` sau bước ánh xạ từ chối của sandbox. Nó bổ sung hướng dẫn khắc phục cho hai mã lỗi thay đổi có bảo vệ, còn các lỗi khác được truyền qua nguyên trạng:

- `FS_STALE_VERSION` (bao gồm cả trường hợp thiếu đích chỉnh sửa — nó dùng chung mã lỗi với lỗi dữ liệu cũ) bổ sung `— re-read the file, then retry`.
- `FS_NOT_OBSERVED` bổ sung `— read the file, then retry`.

Mã lỗi `FsError` có cấu trúc giữ nguyên, để các tầng retry/quyền/UI tiếp tục định tuyến dựa trên nó; lỗi gốc được nối vào làm `cause`. Thông báo của provider vẫn hướng máy và không đổi.

Trong `edit.ts`, waterfall (sự kiện kiểu thác) `fs/edit-intent` giờ nằm trong cùng khối `try` với thao tác thay đổi của provider, nên từ chối `FS_NOT_OBSERVED` do plugin policy ném ra từ intent slot cũng nhận được hướng dẫn khắc phục — cả hai đường từ chối đều đến với model bằng cùng một cách diễn đạt khắc phục.

## Các phương án thay thế đã cân nhắc

- **Bổ sung hướng dẫn khắc phục vào thông báo của provider trong `dsh-fs` / `dsh-fs-local`.** Bị bác bỏ: các thông báo đó là từ vựng seam hướng máy, được các tầng retry, quyền, UI và các tầng hướng model tiêu thụ; cách diễn đạt hướng model nên nằm tại ranh giới model, tức nơi `dsh-tool-fs` vốn đã sở hữu việc định dạng kết quả ([seam năng lực hệ thống tệp](../architecture/2026-06-17-filesystem-capability-seam.md)).
- **Đưa cách khắc phục vào phần hướng dẫn trong prompt.** Bị bác bỏ: thất bại xảy ra giữa chừng tác vụ; hướng dẫn tĩnh không thể tác động một cách đáng tin cậy đến quyết định thử lại, còn thông báo lỗi thì xuất hiện đúng lúc model buộc phải hành động.
- **Diễn đạt hướng dẫn khắc phục bằng mã lỗi `FsError` mới.** Bị bác bỏ: các điều kiện tương ứng với hai thất bại này vốn đã được tầng retry xử lý; tách mã lỗi sẽ khiến cùng một ngữ nghĩa lại đi theo các đường định tuyến khác nhau.

## Hệ quả

Văn bản mà model nhìn thấy của hai mã lỗi này thay đổi; snapshot không cần khóa `fs-policy-reject` đã được ghi lại, và README của `dsh-tool-fs` cùng `dsh-fs-observation-policy` cố định nguyên văn phần văn bản sau khi bổ sung. Unit test phủ trực tiếp tầng bao (văn bản hướng dẫn khắc phục, việc giữ nguyên mã lỗi, chuỗi cause, việc truyền qua nguyên trạng với mã lỗi khác và giá trị không phải `FsError`), còn đường đi tool sau khi lắp ráp khẳng định hướng dẫn khắc phục của cả hai mã lỗi đều đến được với model.

[Quyết định tiếp theo về quan sát sự vắng mặt trong hệ thống tệp](../bug-fix/2026-08-09-filesystem-absence-observation.md) làm cho hướng dẫn khắc phục dữ liệu cũ có hiệu lực trong tình huống bị xóa từ bên ngoài. Lần đọc lại thất bại vẫn trả về `FS_NOT_FOUND`, nhưng có ghi nhận sự vắng mặt đã được xác nhận: sau đó edit trả về `FS_NOT_FOUND` mà không kèm hướng dẫn khắc phục dữ liệu cũ nữa; còn write thì thử lại bằng `createIfAbsent` nguyên tử và giữ lại tệp do bất kỳ bên tạo đồng thời nào đã ghi.
