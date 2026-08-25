# Agent Note: Phát hành JSONL bền vững theo cách nguyên bản trên Windows

Status: implemented

[English](2026-07-05-windows-jsonl-durable-publish.md) | Tiếng Việt

## Vấn đề

`dsh-session-persistence-jsonl` phát hành nhật ký phiên một cách trì hoãn ở lần nối thêm đầu tiên. Giao thức POSIX ghi vào một tệp tạm, thực hiện fsync trên tệp đó, liên kết nó tới tên cuối cùng, thực hiện fsync trên thư mục cha, rồi gỡ liên kết tạm. Việc fsync thư mục cha là một phần của cam kết bền vững: khi xảy ra sự cố sau thay đổi không gian tên, tên cuối cùng đã được commit không được phép mất, nếu không bên gọi sẽ lầm tưởng nhật ký phiên đã hiện thực hóa.

Windows có thao tác không gian tên nguyên tử, nhưng Node không phơi bày cam kết fsync thư mục cha tương đương với POSIX. Nếu coi việc đồng bộ thư mục thất bại trên Windows là thành công, thì backend lưu trữ bền vững sẽ bị suy yếu một cách âm thầm. Vì vậy, nhánh Windows cần dùng một nguyên thủy phát hành khác, thay vì thêm nhánh điều kiện vào hàm trợ giúp `syncDir` của POSIX.

## Quyết định

Backend JSONL phân nhánh bên trong `materialize()`, trước bất kỳ thay đổi không gian tên nào. Phần mã dùng chung tính toán thư mục phiên, đường dẫn nhật ký cuối cùng, cùng header đã mã hóa và lô sự kiện ban đầu; sau đó POSIX và Windows lần lượt thực thi giao thức phát hành của riêng mình.

POSIX giữ nguyên giao thức hiện có: tạo thư mục gốc, thư mục dự án và thư mục phiên, rồi fsync thư mục cha của chúng; ghi tệp tạm và fsync tệp đó; phát hành bằng `link()`, bảo đảm không bao giờ ghi đè nhật ký cuối cùng đã tồn tại; fsync thư mục phiên; cuối cùng gỡ liên kết cứng tạm dư thừa.

Windows tạo các thư mục còn thiếu thông qua việc phát hành từ vùng đệm bền vững: tạo một thư mục ngang hàng ngẫu nhiên với tiền tố cố định `.dsh-mkdir-`, tên của nó không liên quan tới tên cơ sở của đích; sau đó dùng `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)` để phát hành nó thành tên thư mục cuối cùng, và không dùng `MOVEFILE_REPLACE_EXISTING` hay `MOVEFILE_COPY_ALLOWED`. Việc hiện thực hóa tệp trước hết ghi vào nhật ký tạm và fsync nó, rồi dùng chính lời gọi `MoveFileExW` có bật write-through đó để phát hành tệp tạm tới đường dẫn cuối cùng, và cũng không cho phép thay thế. `koffi` là lớp cầu nối Win32 tối thiểu cần thiết để phủ nhóm API này; `pnpm-workspace.yaml` cho phép chạy script cài đặt của nó, vì package này phân phối loader nguyên bản và các module nền tảng dựng sẵn.

## Các phương án đã cân nhắc

**Bỏ qua lỗi đồng bộ thư mục trên Windows.** Không áp dụng, vì như vậy sẽ báo cáo lần nối thêm đầu tiên là lưu trữ bền vững thành công trong khi chưa hề bắt buộc ghi mục không gian tên đã phát hành xuống bộ lưu trữ ổn định.

**Dùng `CreateHardLinkW`.** Không áp dụng, vì liên kết cứng phụ thuộc hệ thống tệp, không phát hành được thư mục, và không cung cấp tùy chọn write-through.

**Dùng API thay thế hoặc API giao dịch.** Ngữ nghĩa thay thế của `ReplaceFileW` mâu thuẫn với yêu cầu từ chối xung đột cùng một id, còn Transactional NTFS thì không nên dùng cho thiết kế ứng dụng mới.

## Ảnh hưởng

Backend duy trì cùng một cam kết đối ngoại trên mọi nền tảng: lần nối thêm đầu tiên hoặc phát hành nhật ký đầy đủ tới tên cuối cùng, hoặc thất bại mà không ghi đè nhật ký đã có. Việc phân nhánh theo nền tảng chỉ là chi tiết triển khai; API `SessionPersistence` và định dạng bản ghi logic JSONL đều không đổi. [Quyết định mã hóa Zstandard](2026-07-19-zstandard-jsonl-session-logs.md) về sau sẽ tác động lên các byte mờ đục trước, rồi mới tới lượt một trong hai nền tảng thực hiện phát hành.

Kiểm thử Windows thực thi đường dẫn phát hành Win32 thật trên Windows nguyên bản. Hành vi khi mất điện là thuộc tính thuộc cam kết API, kiểm thử đơn vị không chứng minh được; những bất biến kiểm thử được bao gồm: việc hiện thực hóa trên Windows không gọi fsync thư mục, xung đột đường dẫn cuối cùng thì thất bại, thành phần đường dẫn đích dài tới mức tối đa vẫn hiện thực hóa được, nhật ký tạm đã được fsync trước khi phát hành, và nhật ký sinh ra có thể tải bình thường.

Việc nối thêm và sửa chữa trên cả hai nền tảng vẫn dùng fsync trên handle tệp thông thường. Sau khi nối thêm thất bại, hệ thống đóng handle chỉ-nối-thêm, mở lại nhật ký ở chế độ đọc-ghi, cắt tệp về kích thước trước khi nối thêm, và fsync kết quả quay lui, vì Windows không cho phép gọi `ftruncate` trên handle chỉ-nối-thêm.
