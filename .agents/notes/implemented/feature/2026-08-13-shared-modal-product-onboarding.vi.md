# Agent Note: Onboarding sản phẩm bằng modal dùng chung

Status: implemented

[English](2026-08-13-shared-modal-product-onboarding.md) | Tiếng Việt

## Vấn đề

Phần hướng dẫn dùng lần đầu trộn lẫn hai kiểu tương tác: giới thiệu bối cảnh sản phẩm chiếm trọn viewport, còn lời nhắc về credential thì trước tiên đưa người dùng vào «cài đặt», sau đó mới nhập được khóa. Một luồng tuần tự rất ngắn vì thế lại giống hai giao diện chẳng liên quan gì đến nhau, và quyền sở hữu phần UI hướng dẫn cũng phân tán qua nhiều gói. Sản phẩm vẫn cần hiển thị tuyên bố giai đoạn thử nghiệm có gắn phiên bản trước khi cấu hình nhà cung cấp, nhưng việc khôi phục nó không được thêm một lớp nổi độc lập thứ hai, cũng không được thay đổi ranh giới cài đặt và credential của Host.

## Quyết định

**Cùng một plugin Cordis phía client vốn đã có sẽ nắm giữ hai bước đã phát hành.** `ui-settings-models` đăng ký `welcome-notice` với thứ tự `-100` và `deepseek-official` với thứ tự `0` trong `settings.onboarding`. Lớp vỏ vẫn chỉ gắn mục chưa hoàn thành đầu tiên, nên hai modal sẽ không xếp chồng lên nhau. Không thêm gói client hay dòng cấu hình plugin nào mới.

**Hai bước dùng chung một component modal.** `OnboardingModal` bọc `Modal` sẵn có của ui-primitives, cung cấp bố cục tiêu đề và nội dung thống nhất, và chỉ giữ trạng thái inert của `#root` trong lúc modal hiển thị. Phím Escape và cú nhấp vào lớp phủ sẽ không âm thầm hoàn tất phần hướng dẫn bắt buộc; mỗi bước chỉ phơi ra thao tác tường minh của riêng nó. Bước nào đang nạp dữ kiện riêng tư thì vẫn trả về `null`, nên sẽ không vẽ ra hay chặn giao diện.

**Tuyên bố chào mừng tái sử dụng trường lưu trữ sẵn có.** Toàn bộ văn án và phiên bản do `onboarding-copy.ts` nắm giữ. Client loopback so sánh và ghi `ui-onboarding.welcomeNoticeVersion` qua API settings sẵn có, và chỉ khi người dùng nhấn «tiếp tục» thì phiên bản hiện tại mới được xác nhận. Client từ xa tiếp tục dùng cơ chế dự phòng trong tiến trình vốn đã có, vì settings namespace này chỉ cho phép truy cập qua loopback. Không thay đổi schema của Host, danh sách cho phép của API Proxy hay phần hiện thực lưu trữ.

**Modal credential tái sử dụng trình soạn thảo và ranh giới ghi sẵn có.** Phần nối Models vẫn chịu trách nhiệm xác định đã có nhà cung cấp khả dụng nào chưa. Khi tham chiếu chính thức của DeepSeek có thể ghi nhưng còn thiếu, `ProviderEditor` được render trong modal dùng chung ở chế độ chỉ nhập credential. Nó kiểm tra tính hợp lệ của khóa rồi gọi `credentials.set` sẵn có, và không sửa đổi thiết lập nhà cung cấp. «Lưu và tiếp tục» sẽ chờ thao tác ghi cùng lần làm mới trạng thái sẵn sàng; «cấu hình sau» chỉ kết thúc vòng hiện tại của bộ điều phối.

## Các phương án đã cân nhắc

**Tách bước tuyên bố và bước credential thành hai plugin client riêng.** Không chọn: sản phẩm yêu cầu chỉ dùng một plugin Cordis phía client, và hai giao diện này chia sẻ văn án, thứ tự, khung modal cùng quyền sở hữu việc làm mới khi dữ liệu hết hiệu lực.

**Chuyển phần logic xác nhận hoặc credential vào một API Host mới.** Không chọn: hai giao ước backend sẵn có đã đủ để diễn đạt trạng thái và thao tác ghi cần thiết; thêm endpoint mới chỉ mở rộng phạm vi chứ không tăng thêm năng lực nào cho người dùng.

**Tiếp tục nhảy từ bước credential sang Models.** Không chọn: thứ duy nhất bắt buộc phải nhập trong lần dùng đầu tiên là khóa, trình soạn thảo sẵn có có thể phơi ra thao tác ghi này một cách an toàn, không cần đẩy người dùng vào một hộp thoại thứ hai nữa.

**Giữ lại lớp trình bày chiếm trọn viewport như trước.** Không chọn: thứ cần lần này là hai modal phủ lên ứng dụng hiện tại, và modal ui-primitives sẵn có đã cung cấp portal, lớp phủ cùng các giao ước về khả năng tiếp cận phù hợp.

## Hệ quả

Profile loopback mới sẽ thấy trước tiên là tuyên bố bản dùng thử nội bộ đã chỉ định; chỉ khi chưa có bất kỳ nhà cung cấp khả dụng nào thì sau đó mới xuất hiện modal nhập khóa DeepSeek ngay trong dòng. Xác nhận vẫn được ghi vào `settings.yaml` theo phiên bản, secret vẫn được lưu vào `.credentials.yaml` theo kiểu chỉ ghi, và những triển khai đã sẵn sàng hoặc không thể khắc phục sẽ không render bất kỳ khung hướng dẫn nào trong lúc phán định việc nạp. Gói Models giờ nắm giữ đồng thời phần trình bày hướng dẫn sản phẩm lẫn phần cấu hình nhà cung cấp; README và phần bao phủ trình duyệt đã ghi rõ trách nhiệm mở rộng này. Quyết định này khôi phục một tuyên bố giai đoạn thử nghiệm gọn gàng sau lần [gỡ bỏ tuyên bố bản dùng thử nội bộ toàn màn hình](../simplification/2026-08-13-remove-first-run-beta-notice.md) trong quá khứ, nhưng sẽ không khôi phục phần văn án về telemetry hay bố cục chiếm quyền của tuyên bố đó.
