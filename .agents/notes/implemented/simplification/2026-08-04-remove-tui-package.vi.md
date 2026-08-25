# Agent Note: Loại bỏ package TUI

Status: implemented

[English](2026-08-04-remove-tui-package.md) | Tiếng Việt

## Vấn đề

Sau khi loại bỏ ứng dụng terminal `dsh` ngầm định, `@deepseek-ai/dsh-tui` không còn thuộc về bất kỳ bundle được phát hành nào. Package này vẫn chứa terminal renderer, các adapter lệnh tương tác và hỏi-đáp, overlay mở rộng, fixture (dữ liệu chuẩn bị trước cho test) snapshot, dependency `pi-tui` đã được vá, và phần scaffold SDK vẫn tuyên bố TUI là một application interface được hỗ trợ. Giữ lại toàn bộ năng lực này đồng nghĩa với việc tiếp tục bảo trì một frontend quy mô sản phẩm, trong khi bên tiêu thụ duy nhất còn lại chỉ là chính bộ sinh dự án (project generator).

Package này còn khiến danh mục ứng dụng mà repo hỗ trợ trở nên gây hiểu lầm. Các sản phẩm đang chạy hiện tại dùng các điểm vào Web, ACP (Agent Client Protocol), JSON-RPC hoặc CLI (giao diện dòng lệnh) một lần, trong khi SDK vẫn cung cấp lựa chọn terminal mà không có ví dụ hay lệnh sản phẩm nào thực sự dùng đến.

## Quyết định

Xóa package `packages/ui/tui`, không cung cấp package tương thích hay alias thay thế. Source code, test package, snapshot terminal, khai báo dependency, sản phẩm `pi-tui` đã vá, tham chiếu workspace, mục danh mục dịch vụ được sinh ra và tài liệu liên quan đều bị xóa cùng lúc. Năng lực host tổng quát và năng lực agent loop (vòng lặp tác tử) không thay đổi.

Toolchain dự án SDK — bên tiêu thụ cuối cùng của package TUI — đã bị xóa bởi [quyết định loại bỏ toolchain](2026-08-11-remove-sdk-project-toolchain.md). Ứng dụng host vẫn có thể mount trực tiếp các dịch vụ độc lập với provider `dsh-user-questions`, `dsh-commands` và dịch vụ hiển thị (presentation).

Quyết định này thay thế quyết định giữ lại các package có thể tái sử dụng trong [quyết định điểm vào `dsh` cấu hình tường minh](../../archived/simplification/2026-08-03-explicit-config-dsh-entrypoint.md), đồng thời khiến các ghi chép triển khai TUI đã lưu trữ không còn áp dụng cho trạng thái hiện tại. Các ghi chép lịch sử này vẫn giữ nguyên trạng thái đóng băng, nhưng không còn là căn cứ cho danh mục package hay ứng dụng được hỗ trợ.

Ghi chú này tổng hợp các ghi chép chỉ liên quan riêng đến package này, vốn không thể tiếp tục có hiệu lực do việc loại bỏ package và nay đã bị xóa. Terminal UI trước đây từng giữ hiển thị danh tính session xuyên suốt các cuộc hội thoại dài, loại bỏ nhãn model trùng lặp, gắn thời gian và trạng thái giai đoạn vào thông điệp, hiển thị ngữ cảnh workspace và branch cạnh prompt, và phân tích cú pháp lớp bọc XML đầy đủ một cách thận trọng để tạo ra đầu ra dự phòng (fallback) dễ đọc cho con người. Các lựa chọn này cải thiện một terminal frontend, nhưng khi không có triển khai thực tế, chúng không đủ để biện minh cho việc giữ lại nó. Cơ chế fallback XML trong tương lai vẫn phải dùng một parser thực sự thay vì regular expression.

## Kiểm chứng

Kết quả tìm kiếm trong repo và danh mục dịch vụ được sinh ra không còn chứa package TUI, các bản vá dependency, khóa dịch vụ hay liên kết package liên quan. Build source code thông thường, type check, lint, hygiene, cổng kiểm tra tài liệu và phần còn lại của bộ test snapshot bundle đều chạy được mà không cần workspace đã bị xóa.

## Các phương án thay thế đã cân nhắc

**Giữ lại package không được phát hành.** Không được chấp nhận, vì cách này vẫn giữ chi phí bảo trì, và tiếp tục trình bày một terminal frontend không được hỗ trợ, không có bundle thực tế nào chứng minh vòng đời của nó, như một giao diện sản phẩm có thể tái sử dụng.

**Giữ lại lựa chọn SDK cho bên tiêu thụ bên ngoài.** Không được chấp nhận, vì bộ sinh sẽ trở thành bên tiêu thụ duy nhất của package này trong repo, và sẽ dựng lên một ứng dụng mà repo không còn kiểm chứng end-to-end. Lập trường tương thích tiền phát hành (pre-release) không yêu cầu giữ lại lựa chọn này.

**Chuyển package vào nhóm examples hoặc experimental.** Không được chấp nhận, vì việc di chuyển code không cung cấp được nhu cầu sản phẩm hiện tại, một triển khai được bảo trì, hay sự kiểm chứng bundle. Terminal frontend trong tương lai nên bắt đầu từ nhu cầu host và tương tác thực tế của nó, thay vì mặc định kế thừa triển khai này.

## Hệ quả

DeepSeek Harness không còn cung cấp package terminal UI. Các import hiện có và mục `cordis.yml` phụ thuộc vào package này sẽ thất bại trực tiếp, không có chuyển đổi tương thích nào được cung cấp. Web vẫn là giao diện tương tác được phát hành. ACP, JSON-RPC và CLI một lần vẫn là các điểm vào ngoài Web.

Các năng lực độc lập với provider như lệnh, tương tác người dùng, phê duyệt, hiển thị công cụ, PTY và projection session vẫn khả dụng cho các host khác. Khi tái giới thiệu một terminal frontend, nó phải có sản phẩm hoặc triển khai được đặt tên cụ thể, ranh giới package tường minh, provider tương tác cụ thể, và sự kiểm chứng vòng đời cùng transcript (bản ghi văn bản) sau khi bundle.
