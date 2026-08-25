# Agent Note: First-run readiness reads every provider, and the setup card closes

Status: implemented

[English](2026-08-12-onboarding-reads-every-provider.md) | Tiếng Việt

## Vấn đề

Bước hướng dẫn lần đầu sử dụng (first-run onboarding) và trang Models đều chỉ đặt cùng một câu hỏi cho một snapshot liên kết (joined) mô tả toàn bộ nhà cung cấp — đã lưu credential của `deepseek-official` chưa? Hai lỗi phát sinh từ cùng một lần đọc này.

Người dùng đã cấu hình một nhà cung cấp khác (một gateway pi-ai nào đó, hoặc một tuyến tự dựng), hoàn toàn không có ý định dùng endpoint DeepSeek chính thức, sẽ bị lời nhắc yêu cầu credential toàn màn hình chiếm quyền trên mọi phiên trắng, trong khi ô nhập bên dưới đã sẵn có một model khả dụng được chọn sẵn. Ngoài việc lưu một khóa DeepSeek, họ không thể làm gì để kết thúc lời nhắc đó — vì projection sẵn sàng (readiness) của bước này chưa bao giờ nhìn vào dòng mà họ đã cấu hình xong.

Trên trang Models, cùng một lần đọc đó, mỗi lần vào trang lại mở rộng thẻ cấu hình DeepSeek ngay trước mặt họ, và thẻ đó không thể đóng lại: nó được render từ dữ liệu dòng, không có bất kỳ state cục bộ nào để nút "hủy" có thể đảo lại, nên nút hủy đó không tạo ra hiệu ứng nhìn thấy được nào. Tệ hơn, nó dùng chung một callback đóng với thẻ chỉnh sửa theo dòng, thẻ thêm mới, và thẻ khai báo tùy chỉnh — callback đó lại xóa vô điều kiện cả ba state; do đó việc hủy một thẻ mà nó không sở hữu lại xóa mất bản nháp trong thẻ thêm mới, còn bản thân thẻ đó vẫn mở.

## Quyết định

Một hàm vị từ (predicate) duy nhất trả lời sự thật mà cả hai giao diện thực sự cần. `providerUsable(row)` trả về true khi tuyến đã được đăng ký vào registry adapter (`entry.active`), và credential mà profile đã giải quyết của nó nêu tên đã được lưu; những profile không nêu tên bất kỳ tham chiếu nào đi theo đường xác thực riêng của nhà cung cấp, cũng như những tuyến còn sống không có địa chỉ settings — cả hai trường hợp đều không nợ trang này một khóa.

`onboardingReadiness` (trước đây tên là `deepSeekReadiness`, cái tên đó không còn mô tả đúng những gì nó đọc) chỉ cần trong snapshot liên kết có bất kỳ dòng nào khả dụng là trả về `provider-ready`. Chỉ người dùng không có cả hai mới đi tới bước tra cứu DeepSeek chính thức, phần đó giữ nguyên: đó là tuyến duy nhất mà lời nhắc này có thể cung cấp ô nhập khóa. Ngưỡng này gộp luôn hai chẩn đoán mà projection cũ mang theo — `settings-unavailable` và `credential-ref-unavailable` — vì cả hai đều mô tả những tuyến đang hoạt động mà ngưỡng mới hiện coi là khả dụng; đối với người dùng thì kết quả vốn đã giống nhau (bước này không render trực tiếp trạng thái hoàn tất).

`needsSetup(row, anyUsable)` nhận cùng một sự thật đó, nên thẻ cấu hình chỉ còn đại diện cho tư thế lần đầu sử dụng (first-run). Khi có một nhà cung cấp khác có thể tiếp cận được, DeepSeek chỉ còn là một dòng bình thường có chấm báo thiếu khóa, cách cùng một thẻ đó đúng một cú nhấp "chỉnh sửa".

Giờ đây mỗi loại thẻ có callback đóng của riêng mình. `closeSetup` ghi nhận nhà cung cấp đó vào tập `dismissedSetup` cục bộ của component, không đụng đến gì khác; `closeEditor` vẫn xóa ba state mà những thẻ đó sở hữu. Cả hai đều đi qua cùng một helper `announceSaved` để tải lại sau khi lưu. Trạng thái đóng thuộc về trạng thái xem, giống như thẻ chỉnh sửa và thẻ thêm mới đang mở: với người dùng vẫn còn ở tư thế lần đầu sử dụng, việc tải lại sẽ khôi phục lại tư thế đó.

## Các phương án đã cân nhắc

- **Suy ra trạng thái sẵn sàng từ danh mục model (`llm.models`) thay vì từ snapshot liên kết.** Đây là cách trả lời trực tiếp nhất cho câu hỏi "người dùng có thứ gì để trò chuyện không", nhưng sẽ tốn thêm một lượt gọi liệt kê cho mỗi nhà cung cấp trên một giao diện vốn đã có sẵn snapshot liên kết, và một lỗi liệt kê thoáng qua ở một nhà cung cấp nào đó sẽ khiến onboarding bật lại.
- **Yêu cầu `row.configured` trong `providerUsable`.** Đọc có vẻ chặt chẽ hơn, nhưng lại loại trừ đúng những tuyến được triển khai gắn qua `cordis.yml`, không có khai báo nhà cung cấp nào có thể cấu hình được — đó là những tuyến còn sống, đang cung cấp model, chỉ là trang này không cấu hình được chúng. Điều làm cho một nhà cung cấp khả dụng là việc đăng ký, không phải khả năng cấu hình.
- **Chỉ thêm trạng thái đóng, giữ nguyên việc thẻ tự động mở rộng.** Cách đó chỉ sửa được nút hủy, không sửa được gì khác: người dùng đã có nhà cung cấp khả dụng vẫn sẽ bị nhét một form DeepSeek mỗi lần vào trang Models, đó chỉ là phiên bản im lặng hơn của cùng một cách hiểu sai.
- **Lưu bền trạng thái đóng vào settings.** Một cờ bền vững kiểu "đừng hỏi DeepSeek nữa" là sự thật thứ hai về trạng thái lần đầu sử dụng, có thể mâu thuẫn với snapshot liên kết. Bản thân credential đã kết thúc vĩnh viễn tư thế đó rồi, còn mọi thẻ khác trên trang này đều chỉ tồn tại trong phạm vi phiên.

## Hệ quả

Onboarding giờ kết thúc vì lý do tuyến DeepSeek hoàn toàn không liên quan, nên tên của bước này là thứ cuối cùng còn gắn nó với adapter đó; sau này nếu có một bước cung cấp được nhiều hơn một tuyến có thể cấu hình, thứ bị thay thế sẽ là bản thân lời nhắc, chứ không phải projection sẵn sàng. Liên hợp chẩn đoán đã thu hẹp lại nghĩa là một địa chỉ settings `llm-deepseek` không giải quyết được sẽ được báo là `provider-ready` thay vì lý do riêng của nó — hành vi người dùng nhìn thấy không đổi, trang Models vẫn là giao diện chẩn đoán.

## Kiểm thử

Test trong package chốt `providerUsable` cho bốn trạng thái liên kết, và chốt `onboardingReadiness` cho ngưỡng mới cùng từng chẩn đoán còn lại; test phân vùng bao phủ tư thế lần đầu sử dụng, tư thế dòng bình thường, và lần hủy giữ được bản nháp trong thẻ thêm mới trong khi thu gọn thẻ cấu hình. Luồng e2e web `onboarding-usable-provider` phát lại toàn bộ kịch bản qua giao thức thật: hủy khi cả hai thẻ đang mở, đổi cấu hình sang `minimax-cn`, tải lại, rồi không còn xuất hiện việc chiếm quyền nữa — kèm một golden aria của trạng thái sau khi đóng.
