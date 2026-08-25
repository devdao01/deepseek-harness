# Agent Note: Cấu hình credential lần đầu cho DeepSeek chính thức

Status: implemented

[English](2026-07-30-deepseek-onboarding-credential-setup.md) | Tiếng Việt

## Vấn đề

[Mặt phẳng cấu hình web](../architecture/2026-07-30-web-config-plane.md) cho phép chỉnh sửa trực tiếp thiết lập provider và credential, nhưng người dùng lần đầu vẫn rơi vào Hero hội thoại trống trơn; khi route `deepseek-official` đi kèm sản phẩm thiếu credential, giao diện không đưa ra hướng dẫn nào có thể hành động được. Trang Models có thể sửa trạng thái đó, nhưng bắt người dùng tự khám phá ra lối vào này làm suy yếu phần dẫn dắt lần đầu. Giao diện không được lẫn lộn giữa thiếu credential và thiếu adapter: trình duyệt có thể lưu giá trị cho một credential reference đã tồn tại, nhưng không thể mount động Cordis plugin `llm-deepseek`.

## Quyết định

**Models và phần dẫn dắt lần đầu dùng chung một phép chiếu trạng thái sẵn sàng.** `ui-settings-models` duy trì một store, ghép `llm.providers({})`, `settings.describe({})` đã được che giấu và `credentials.describe({refs})` gọi theo lô thành cùng một trạng thái. Phép chiếu lần đầu chọn ra mục provider có thể cấu hình `deepseek-official` do namespace `llm-deepseek` và settings path rỗng nắm giữ, đọc `apiKeyEnv` đang có hiệu lực, rồi kiểm tra descriptor credential tương ứng. Route đang sống có cùng provider id nhưng không có khai báo provider có thể cấu hình khớp với nó sẽ được coi là thiếu adapter trong phần dẫn dắt lần đầu. Credential cung cấp qua biến môi trường của process, nếu đã cấu hình, sẽ được xem là sẵn sàng và giữ ở chế độ chỉ đọc.

**Vỏ settings chỉ đóng góp thứ tự, không nắm chính sách provider.** `ui-settings` khai báo một list slot `settings.onboarding` ở scope gốc, và mỗi lần chỉ mount một bước có thứ tự khi giao diện hiện tại là Hero trống. Bên đăng ký hiện hành nhận callback `complete()` và `openSection(id)` riêng tư; sau khi hoàn tất bước hiện tại, quyền sở hữu được chuyển cho mục kế tiếp. `ui-settings-models` đăng ký bước DeepSeek, tuyên bố chào mừng đứng trước nó, cùng phân vùng Models thông qua `slots.inject()`, nhờ vậy mọi đóng góp đều theo cùng vòng đời của một client Cordis plugin, và hai popup cũng không thể chồng lên nhau. Phần trình bày dùng chung của chúng do [quyết định về dẫn dắt sản phẩm bằng modal dùng chung](2026-08-13-shared-modal-product-onboarding.md) nắm giữ.

**Popup lần đầu render inline trình soạn credential có sẵn.** Khi adapter đã mount và đang hoạt động, reference của nó phân giải được, ghi được nhưng chưa cấu hình, `ProviderEditor` sẽ render ở chế độ chỉ-credential bên trong modal dẫn dắt dùng chung. Cùng một component đó chịu trách nhiệm toàn bộ cho ô nhập mật khẩu, kiểm tra hợp lệ, `credentials.set({ref, value})`, xử lý lỗi ghi và làm mới sau khi ghi; chế độ chỉ-credential không phát ra thay đổi settings của provider. "Cấu hình sau" chỉ hoàn tất đúng lượt hiện tại của bộ điều phối. Khi thiếu adapter thì vẫn bỏ qua, vì trình duyệt không thể mount một Cordis plugin còn thiếu.

**Trạng thái không khả dụng không chiếm chỗ của sản phẩm.** Khi thiếu mục provider có thể cấu hình, route không hoạt động, phép ghép ban đầu thất bại, bản triển khai ở chế độ chỉ đọc, hoặc capability settings/credential không phân giải được, bước đó sẽ hoàn tất luôn mà không render, vì phần dẫn dắt lần đầu không thể sửa các trạng thái này. Trang Models vẫn là giao diện chẩn đoán và thử lại cho bản triển khai. "Cấu hình sau" chỉ hoàn tất đúng một bước thiếu credential hiện tại của bộ điều phối, và không ghi trạng thái hoàn tất nào. Các sự kiện vô hiệu hóa của settings, credential, tô-pô provider và kết nối đều làm mới phép ghép dùng chung, nên cập nhật credential từ bên ngoài có thể hoàn tất bước đang mở mà không cần tải lại trang.

## Các phương án đã cân nhắc

**Lập riêng store và chuỗi lời gọi RPC trạng thái sẵn sàng cho phần dẫn dắt lần đầu**: không áp dụng, vì như vậy sẽ dựng thêm một bộ diễn giải phía client, tách khỏi trang Models, để xác định danh tính provider, đường dẫn settings, thông tin đi kèm của secret slot, credential reference và thứ tự các sự kiện vô hiệu hóa.

**Tự làm riêng form API key trong phần dẫn dắt lần đầu**: không áp dụng, vì như vậy sẽ nhân bản phần bản nháp secret, kiểm tra hợp lệ, lỗi và hội tụ trạng thái đã cấu hình của trình soạn Models. Thay vào đó, popup render `ProviderEditor` sẵn có ở chế độ hạn chế.

**Ghi API key vào settings của provider**: không áp dụng, vì secret dạng chuỗi nguyên văn sẽ đi vào đường thay đổi settings, mà việc thay thế trọn cả phân đoạn thì không thể tái dựng an toàn giá trị đã che giấu. Kho credential vốn đã là seam của sản phẩm và có thể phát sự kiện vô hiệu hóa ngay lập tức.

**Vẫn hiển thị lớp phủ khi thiếu `llm-deepseek`**: không áp dụng, vì điều hướng trong trình duyệt không có thao tác nào được hỗ trợ để mount một Cordis plugin còn thiếu.

## Hệ quả

Luồng có thứ tự bắt đầu từ trang tuyên bố sản phẩm và đi thẳng vào form nhập khóa inline mà không cần khởi động lại: test trình duyệt không cần khóa sẽ khởi chạy bản composition Web thật dưới một thư mục home harness biệt lập, xác nhận tuyên bố rồi lưu khóa được sinh ra vào `.credentials.yaml` của thư mục đó từ modal dùng chung, kiểm chứng rằng khóa không lọt vào DOM, ARIA hay đầu ra console của trình duyệt, và xác nhận trang Models thông thường báo cáo đã cấu hình. Bản phát lại Web không cần khóa đầy đủ cũng chốt rằng route phát lại không cấu hình được nhưng trùng id sẽ không chặn các luồng không liên quan. Các test thuần trạng thái sẵn sàng và test React cố định hóa credential từ file được quản lý lẫn credential từ biến môi trường process, trường hợp thiếu provider và capability, việc hủy, vô hiệu hóa từ bên ngoài và việc bàn giao của bộ điều phối. Luồng này kế thừa trực tiếp các giới hạn nền tảng đã ghi lại của mặt phẳng cấu hình, và không thêm bất kỳ giải pháp chắp vá cục bộ nào cho lưu trữ bí mật, che giấu hay thay thế settings.
