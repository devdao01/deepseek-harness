# Agent Note: Để test trên các nền tảng được hỗ trợ tập trung vào ngữ nghĩa

Status: implemented

[English](2026-07-22-cross-platform-test-fixtures.md) | Tiếng Việt

## Vấn đề

Bộ test unit và coverage chạy trên Windows, macOS và Linux, nhưng hành vi không phụ thuộc nền tảng có thể bị che khuất bởi fixture (dữ liệu tiền cấu hình cho test) đặc thù nền tảng. Đường dẫn POSIX theo nghĩa đen sẽ trở thành đường dẫn tương đối theo ổ đĩa trên Windows; URI `file:` kèm hostname có thể là đường dẫn UNC hợp lệ trên Windows; thời điểm ổn định khi đóng pipe của subprocess hay lập lịch event loop cũng không nhất quán giữa các host khác nhau. Trạng thái filesystem chỉ tồn tại trên POSIX như FIFO, execute mode bit và directory search permission bit không có fixture nào có thể trực tiếp dựng lên trên Windows.

Nếu coi cú pháp fixture là hành vi sản phẩm, sẽ dẫn đến báo cáo sai regression, hoặc thúc đẩy production code đưa vào cơ chế chuẩn hóa xóa bỏ mất ngữ nghĩa đường dẫn gốc (native).

## Quyết định

Khi test hành vi không phụ thuộc nền tảng, dùng API `node:path` và `node:url` của host để dựng đường dẫn tuyệt đối và URI `file:`, sau đó assert output tuyệt đối theo nền tảng gốc hoặc output tương đối workspace ổn định, tùy theo yêu cầu quy ước. Fixture URI không hợp lệ dùng một dạng encoding sẽ bị `fileURLToPath()` từ chối trên mọi nền tảng được hỗ trợ.

Test lỗi transport inject message writer của connection, và truyền vào lỗi callback ghi bất đồng bộ giống hệt Node stream thật. Production writer vẫn ghi message đã đóng khung vào stdin của subprocess. Cách làm này giữ cho subprocess thật vẫn sống, khiến test không cần chạm vào pipe handle đặc thù nền tảng, mà vẫn phân biệt được chắc chắn giữa lỗi transport và process thoát.

Việc dọn dẹp tài nguyên của language server chấm dứt toàn bộ cây process con cháu: POSIX dùng process group ID âm, Windows chạy đồng bộ `taskkill /T /F`. Windows chỉ bỏ qua trạng thái "process tree đã không còn tồn tại" mà taskkill trả về; lỗi thực thi lệnh, lỗi quyền hạn và các lỗi khác khi chấm dứt process tree vẫn thuộc lỗi dọn dẹp tài nguyên. Truy vấn provider chỉ đọc sẽ retry một lần duy nhất khi transport được pool hóa đã chọn bị mất hiệu lực trước hoặc trong lúc truy vấn bắt đầu; lỗi trả về khi server vẫn còn sống sẽ không kích hoạt retry. Test terminal sẽ chờ output render có thể quan sát được, không giả định một vòng event loop là đủ.

Đối với các nguyên thủy (primitive) thực sự chỉ tồn tại trên POSIX, test chỉ loại trừ Windows đối với riêng use case đó. Các use case xuyên nền tảng liền kề vẫn chốt hành vi từ chối file không thông thường, lệnh không khả dụng và thư mục làm việc không truy cập được. Đường dẫn được hỗ trợ trên Windows vẫn bị ràng buộc bởi cổng coverage theo từng file, không bị loại trừ cùng với test file.

## Phương án thay thế đã cân nhắc

**Chuẩn hóa mọi đường dẫn và URI thành chuỗi POSIX.** Việc này giúp assertion nhất quán, nhưng cũng thay đổi hành vi đúng của Windows: đường dẫn ngoài là đường dẫn tuyệt đối gốc, URI file UNC là hợp lệ, và home directory đã cấu hình cần được resolve theo quy tắc đường dẫn của host.

**Thao túng trạng thái nội bộ của pipe subprocess cho tới khi write thất bại.** Quyền sở hữu của CRT descriptor và libuv handle khác nhau trên các host và version Node khác nhau, nên cách làm này đang test cơ chế fixture chưa được tài liệu hóa, chứ không phải quy ước lỗi write của connection.

**Bỏ qua toàn bộ test file hoặc package trên Windows.** Việc loại trừ quá rộng sẽ che khuất hành vi được hỗ trợ. Chỉ loại trừ các fixture đơn lẻ không thể dựng trạng thái tương ứng trên Windows; các quy ước liên quan vẫn giữ nguyên coverage.

## Hệ quả

Fixture có thể di động (portable) cần được dựng tường minh hơn, vì đường dẫn kỳ vọng phải bắt nguồn từ hằng số gốc dùng chung, còn lỗi transport được inject qua hook write hẹp. Các mục loại trừ chỉ áp dụng cho một nền tảng cụ thể phải đi kèm assertion xuyên nền tảng liền kề, để tiếp tục bao phủ hành vi sản phẩm tương ứng. Sau khi graceful shutdown ở cấp giao thức thất bại, việc dọn dẹp tài nguyên trên Windows phụ thuộc vào lệnh `taskkill` của host; khi lệnh thực thi đồng bộ thành công, đảm bảo dispose (giải phóng tài nguyên) hoàn tất trong thời gian hữu hạn, và đảm bảo có thể quan sát được process con cháu đã thoát trước khi dọn dẹp trả về; nếu chấm dứt process tree thất bại, logic giải phóng tài nguyên vẫn quan sát được lỗi đó.
