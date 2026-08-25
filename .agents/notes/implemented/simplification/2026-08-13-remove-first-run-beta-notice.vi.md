# Agent Note: Bỏ thông báo bản thử nghiệm nội bộ ở lần khởi chạy đầu tiên

Status: implemented

[English](2026-08-13-remove-first-run-beta-notice.md) | Tiếng Việt

## Vấn đề

Mỗi lần khởi chạy đầu tiên, GUI đều hiển thị trước một thông báo bản thử nghiệm nội bộ chiếm trọn viewport: phần định vị sản phẩm là bản thử nghiệm nội bộ, cộng thêm hướng dẫn bật tải lên Session Log qua `DSH_TELEMETRY_MODE`. Telemetry của phiên đã được phân giải thành `DISABLED` khi mode không được đặt ([telemetry mặc định tắt](../feature/2026-08-10-telemetry-default-off.md)), nên toàn bộ nội dung về telemetry trong luồng giới thiệu chỉ còn là một đoạn hướng dẫn người dùng cách bật, còn phần định vị sản phẩm là bản thử nghiệm nội bộ thì bản thân nó cũng không nên xuất hiện trong bản phát hành.

## Quyết định

Quyết định này khi đó đã gỡ bỏ hoàn toàn thông báo lần khởi chạy đầu tiên khỏi sản phẩm sau khi lắp ráp, thay vì viết lại nó. `ui-settings-general` không còn đăng ký bất kỳ bước `settings.onboarding` nào; component thông báo, store xác nhận, tệp sở hữu nội dung và các khóa locale đều bị xóa, còn Host vẫn giữ namespace `ui-onboarding` để các tài liệu cài đặt sẵn có tiếp tục hợp lệ. [Phần giới thiệu sản phẩm bằng modal dùng chung](../feature/2026-08-13-shared-modal-product-onboarding.md) sau đó đã khôi phục trong `ui-settings-models` một thông báo giai đoạn thử nghiệm mới, ngắn gọn, tái sử dụng trường dữ liệu và contract phía backend đó, nhưng không khôi phục bố cục chiếm trọn màn hình đã bị gỡ, cũng không khôi phục phần hướng dẫn telemetry. Việc bật telemetry vẫn là một lựa chọn tường minh bằng biến môi trường khi triển khai, được ghi lại trong [CLI reference README](../../../../apps/cli/reference/README.md); thông báo sau khi khôi phục không đề cập cách bật telemetry.

## Các phương án đã cân nhắc

**Giữ thông báo, chỉ xóa đoạn nói về telemetry.** Không áp dụng: thứ mà bản phát hành không nên trình bày chính là phần định vị sản phẩm là bản thử nghiệm nội bộ, và một trang chen bắt buộc ở lần khởi chạy đầu tiên mà không còn nội dung thực chất thì chỉ còn là sự làm phiền.

**Chuyển sang hỏi đồng ý tải lên (bước đồng ý có đánh phiên bản).** Không áp dụng cho bản phát hành này: hỏi có bật tải lên hay không ở lần khởi chạy đầu tiên thì vẫn là một lời nhắc về telemetry. Luồng đồng ý trong tương lai có thể đăng ký qua seam `settings.onboarding` vốn giữ nguyên, và dùng một trường có đánh phiên bản mới để hỏi xác nhận lại.

**Hủy đăng ký luôn cả namespace `ui-onboarding`.** Không áp dụng: các tài liệu cài đặt sẵn có đã chứa phần này, và settings seam kiểm tra tài liệu lưu trữ dựa trên các namespace đã đăng ký; giữ lại phần đăng ký giúp các tài liệu đó tiếp tục hợp lệ mà không phát sinh chi phí gì thêm.

## Hệ quả

Việc gỡ bỏ này loại trừ thông báo chiếm trọn viewport cùng nội dung telemetry của nó. Phần khôi phục sau đó chủ ý dùng cách trình bày và phiên bản nội dung khác: modal dùng chung xuất hiện trước modal thông tin đăng nhập nội tuyến, tình huống remote lại phủ lên phần xác nhận trong tiến trình, và trường `welcomeNoticeVersion` sẵn có ghi nhận phiên bản nội dung mới. Lời nhắc telemetry trong lịch sử vẫn chưa được khôi phục.
