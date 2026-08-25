# Agent Note: Web agent nhận được runtime context tường minh

Status: implemented

[English](2026-07-28-web-agent-runtime-context.md) | 中文

## Vấn đề

CLI (command-line interface) chia sẻ base config với deployment persona rỗng, Web overlay không thay thế nó, còn Web launcher lại không thêm cả đoạn prompt về source code lẫn đoạn prompt về giao diện tương tác. Session header có ghi lại working directory để tools và persistence sử dụng, nhưng model prompt không nói rõ về thư mục đó, cũng không xác định đây là DeepSeek Harness Web GUI. Do đó, khi user đưa ra yêu cầu kiểu "sửa theme của trang này", ngay cả khi user đang nói về GUI đang chứa session hiện tại, agent (smart agent) vẫn sẽ tìm kiếm một trang không được nêu rõ trong project đã chọn.

## Quyết định

Web profile compose hai bundle `dsh-base` và `dsh-web-app`. Web bundle cung cấp một đoạn coding agent persona ngắn gọn, chứa `{{model}}` và session `{{cwd}}` đã được resolve; khi `surfaceContext` là true, plugin `web-runtime` của nó sẽ thêm đoạn prompt `app:web-surface`. Trước khi mount cây config của profile, alias `dsh web` sẽ đọc cùng một setting đã compose đó, và chỉ cài đặt đoạn prompt `harness:source` hiện có khi context giao diện được bật. Cả bundle headless lẫn profile có full prompt đều đặt `surfaceContext: false`, nhờ đó ngăn đoạn prompt Web và các fact về managed shell; Web alias cũng ngăn đoạn prompt source code mà không cần kiểm tra đường dẫn overlay. Mỗi đóng góp prompt đã mount vẫn sẽ được kích hoạt trước khi các consumer như agent loop (smart agent loop) phát ra request header. Cách diễn đạt của đoạn prompt source code, cùng lời cảnh báo trong đó rằng không được suy luận đường dẫn này từ đường dẫn kia, thuộc trách nhiệm của [quyết định phân biệt source code checkout và working directory](2026-07-30-source-checkout-workdir-distinction.md) được ghi lại riêng.

Đoạn prompt Web diễn giải các cụm chưa xác định rõ như "trang này", "GUI này" hay "app này" là DeepSeek Harness Web GUI. Đồng thời, nó nói rõ rằng browser không ngầm cung cấp DOM, route, hay screenshot context, giúp model nhận diện được sản phẩm nhưng không tự nhận là nắm được visual state chưa nhận được. Văn bản đã lắp ráp được ghi lại trong `request/header`, nhờ đó giữ đúng bất biến "nội dung model nhìn thấy phải có log ghi lại".

## Kiểm chứng

Unit test của Web runtime cố định hành vi khi bật và tắt `surfaceContext`, còn unit test của Web alias cố định hành vi bật mặc định và tắt tường minh của dòng config đã compose đối với đoạn prompt source code. Kịch bản Web fresh-round-trip không cần key sẽ khởi động bundle base và Web đã triển khai, chạy một session thật qua ứng dụng HTTP/SSE (Server-Sent Events), và chụp snapshot phần đầu system prompt sau khi chuẩn hóa đường dẫn source code và working directory. Snapshot này cố định thứ tự request gồm: harness identity, source code checkout, định vị giao diện Web, và coding agent persona đã resolve. Core Web snapshot áp dụng RL overlay và cố định toàn bộ system prompt không chứa đoạn prompt source code hay đoạn prompt Web.

## Các phương án đã cân nhắc

**Gửi URL, DOM, hoặc screenshot theo mỗi prompt.** Sự cố lần này chỉ cần một cách định vị sản phẩm ổn định; root URL hiện tại không thể xác định component đã chọn, và trong message convention cũng không có nội dung capture hình ảnh. Việc thêm dynamic page state cần một thiết kế riêng cho model input có thể ghi log, không thuộc phạm vi ngầm định của lần fix này.

**Yêu cầu session Workspace phải là harness checkout.** Workspace cwd là mục tiêu của task user, có thể hợp lý trỏ tới một project rỗng hoặc một repo khác. Gộp nó với vị trí source code của app sẽ phá vỡ ranh giới này, và vẫn không loại bỏ được sự mơ hồ ở các session khởi chạy từ bản đã cài đặt hoặc từ bên ngoài.

**Đưa nội dung Web vào harness identity toàn cục.** `dsh-system-prompt` còn phục vụ cả TUI, ACP (Agent Client Protocol), SDK, và các deployment tùy chỉnh không chạy trong browser. Fact về giao diện này nên do Web app lắp ráp chịu trách nhiệm.

**Sửa đoạn prompt vị trí source code hiện có cho mọi giao diện CLI.** TUI cũng dùng lại đoạn prompt vị trí source code, và đoạn đó chỉ nêu fact về checkout. Giữ riêng phần định vị giao diện Web giúp duy trì quy ước dùng chung này, tránh việc nói sai với headless hoặc terminal agent rằng chúng đang ở trong browser.

## Ảnh hưởng

Request Web thông thường sẽ có thêm một đoạn prompt prefix ngắn và ổn định; khi triển khai thay đổi này, prefix cache của model provider có thể mất hiệu lực một lần. Agent có thể phân biệt GUI source code checkout với Workspace đã chọn, và không cần thêm một vòng làm rõ để giải quyết chỉ dẫn chung về app hiện tại. Chỉ dẫn tới visual state cụ thể vẫn bị ràng buộc bởi giới hạn tường minh "không DOM/không route/không screenshot", vẫn cần user cung cấp đường dẫn, mô tả, hoặc file đính kèm khi cần. Profile có full prompt có thể opt-out qua setting compose của Web runtime mà không cần kiểm tra đường dẫn launcher.
