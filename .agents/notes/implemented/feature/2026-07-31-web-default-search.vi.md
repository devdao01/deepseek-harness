# Agent Note: Web search mặc định trong bộ tổ hợp đã bàn giao

Status: implemented

[English](2026-07-31-web-default-search.md) | 中文

## Vấn đề

Harness này đã có sẵn hệ thống năng lực Web đầy đủ: registry nhà cung cấp, các nhà cung cấp tìm kiếm DeepSeek, Exa và Perplexity, fetch cục bộ, công cụ ổn định hướng tới model, và cách trình bày kết quả có cấu trúc, nhưng bộ tổ hợp `dsh web` đã bàn giao lại không mount bất kỳ thứ nào trong số đó. Trừ khi bản triển khai cung cấp một overlay tùy chỉnh, model không thể tìm ra thông tin mới nhất. Chỉ mount nhà cung cấp DeepSeek hiện có vẫn chưa thông suốt chuỗi WebUI: trang Models lưu `DEEPSEEK_API_KEY` qua `ctx.credentials`, còn nhà cung cấp tìm kiếm chỉ đọc cố định biến môi trường tiến trình tại thời điểm plugin nạp, do đó khóa nhập vào lúc UI đang chạy hay khóa được xoay vòng đều không dùng được cho tìm kiếm.

## Quyết định

`apps/cli/config/base.cordis.yml` mount rõ ràng `dsh-web`, cấu hình `searchProvider: deepseek-official`, đồng thời mount `dsh-web-search-deepseek`, và mount `dsh-tool-web` với `fetch: false` và `searchTimeoutMs: 60000`. File này không mount `dsh-web-fetch-http`, cũng không chọn nhà cung cấp fetch nào. Base dùng chung chỉ đặt `web_search` làm công cụ mặc định cho TUI, trình duyệt và phiên headless. Id nhà cung cấp tìm kiếm rõ ràng khiến việc chọn lựa không phụ thuộc vào thứ tự đăng ký, trong khi overlay cá nhân hoặc overlay `--config` vẫn có thể thay thế hoặc tắt các mục cấu hình này. Ngân sách một phút đã bàn giao dùng để bao phủ một yêu cầu DeepSeek Messages phụ trợ cùng việc truy xuất phía server, đồng thời giữ nguyên giá trị mặc định 30 giây không phụ thuộc nhà cung cấp của `dsh-tool-web` để dành cho các bộ tổ hợp tùy chỉnh.

Tìm kiếm DeepSeek dùng cùng tham chiếu credential `DEEPSEEK_API_KEY` với bộ chuyển đổi phiên chính thức. Nhà cung cấp phân giải tham chiếu này bên trong mỗi lần tìm kiếm thông qua dịch vụ `ctx.credentials` tùy chọn; chỉ bộ tổ hợp không mount seam này mới rơi về biến môi trường của tiến trình khởi động, còn giá trị literal `apiKey` không rỗng vẫn là phương án dự phòng cuối cùng cho cấu hình lập trình. Do đó, khóa được trang Models của Web lưu trữ hoặc xoay vòng có thể dùng ngay cho lần tìm kiếm tiếp theo mà không cần khởi động lại, và nhà cung cấp cũng không cần giữ lại giá trị đó. Vì `WebSearchProvider.available()` là phương thức đồng bộ, nó coi resolver đã cài đặt là khả dụng cục bộ; nếu thiếu credential động, thao tác sẽ thất bại với mã lỗi riêng của nhà cung cấp `WEB_PROVIDER_CREDENTIAL_MISSING`, trong khi schema công cụ ổn định vẫn giữ nguyên đăng ký.

Endpoint tìm kiếm tách biệt với chat completions: `DEEPSEEK_SEARCH_BASE_URL` ghi đè địa chỉ gốc tương thích Anthropic, còn `DEEPSEEK_BASE_URL` vẫn cấu hình yêu cầu phiên. Mỗi lần `web_search` sẽ phát sinh một lệnh gọi DeepSeek Messages phụ trợ, kèm theo công cụ server tìm kiếm gốc. Ngay trước khi gửi yêu cầu, nhà cung cấp sẽ thêm vào phiên agent gọi lệnh một sự kiện yêu cầu LLM chỉ dùng để ghi log `web/deepseek-search-llm-request`, chứa endpoint đã phân giải, phiên bản API, và nội dung yêu cầu JSON chính xác không kèm khóa. Việc kiểm tra trước credential vẫn nằm trong nội bộ nhà cung cấp, có điều kiện đua (race) với việc hủy từ phía gọi; cả hai mối quan tâm này đều không mở rộng seam Web chung hay seam credential.

Việc mount mặc định không tạo ra chính sách quyền hạn riêng cho Web. `web_search` thực thi ngoài sandbox bash/hệ thống file cũng như các preset phê duyệt, và tuân theo quy ước hiện có của `dsh-tool-web`. Bộ tổ hợp không mount `web_fetch` hay nhà cung cấp fetch cục bộ, do đó cấu hình mặc định không cho phép model tự chọn URL bất kỳ để fetch. Giá trị mặc định `workspace-write` đã bàn giao chỉ quản lý việc sửa file; nếu sản phẩm áp dụng chính sách mạng hạn chế, cần thêm chính sách `tools/pre-execute` hoặc giới hạn truy cập mạng theo năng lực, chứ không nên ngầm hiểu chế độ truy cập hệ thống file sẽ quản lý luôn lệnh gọi Web.

## Các phương án thay thế đã cân nhắc

**Chỉ mount `dsh-tool-web`.** Không áp dụng: schema ổn định nếu không có nhà cung cấp nào đã đăng ký thì mỗi lệnh gọi mặc định sẽ thất bại. Trạng thái bật và tính khả dụng của backend cố ý tách rời, nhưng cấu hình mặc định đã bàn giao phải cung cấp đúng phần hiện thực dự kiến của nó.

**Đọc `$DSH_HOME/.env` từ `cordis.yml`, hoặc đẩy nó lên `process.env`.** Không áp dụng: nhà cung cấp credential sở hữu file này, giá trị biến môi trường là ghi đè chỉ đọc; đẩy lên sẽ khiến khóa đã lưu không xoay vòng được nữa, đồng thời vượt qua biên khóa đã được kiểm toán.

**Đọc cố định `process.env.DEEPSEEK_API_KEY` khi nhà cung cấp nạp.** Không áp dụng: trang Web Models ghi khóa qua `ctx.credentials`; đường chạy lần đầu theo quy định tài liệu sản phẩm phải đảm bảo thao tác kế tiếp có hiệu lực mà không cần khởi động lại.

**Giữ công cụ Web trong `web.cordis.yml`.** Không áp dụng: cách này giữ lại sự khác biệt vô lý về danh sách công cụ giữa TUI và giao diện Web/headless. Các dòng cấu hình này không đặc thù cho từng giao diện, do đó nơi thuộc về duy nhất của chúng là `base.cordis.yml`; [quyết định về danh sách công cụ](2026-07-31-even-out-shipped-tool-rosters.md) đã ghi lại bộ tổ hợp dùng chung này.

**Tăng timeout không phụ thuộc nhà cung cấp của `dsh-tool-web`.** Không áp dụng: các nhà cung cấp và bản triển khai tùy chỉnh có kỳ vọng độ trễ khác nhau; ngân sách bản triển khai này thuộc về bộ tổ hợp DeepSeek đã bàn giao.

**Bật đồng thời cả tìm kiếm lẫn fetch.** Không áp dụng: bật `web_fetch` mặc định sẽ cho phép model tự chọn URL bất kỳ, thực hiện fetch HTTP(S) ẩn danh ra ngoài. Tìm kiếm chịu trách nhiệm phát hiện thông tin; bản triển khai chấp nhận phạm vi fetch rộng hơn có thể chọn bật `dsh-web-fetch-http` trong overlay, và đặt tùy chọn `fetch` của `dsh-tool-web` thành `true`.

## Hệ quả

Yêu cầu model gốc của mỗi giao diện đã bàn giao chỉ mang theo schema `web_search`, cùng chỉ dẫn prompt chỉ dành cho tìm kiếm; Code Mode của Web/headless phơi bày cùng năng lực tìm kiếm này qua `run_code`. Prompt yêu cầu model dùng snippet trả về, và tuyệt đối không đề cập với model về công cụ `web_fetch` đã bị tắt. Tìm kiếm sẽ tốn thêm một lệnh gọi model phụ trợ đầy đủ, và có thể dùng công cụ server gốc nhiều lần; log của phiên gọi lệnh vẫn có thể tái tạo chính xác yêu cầu không kèm khóa đó. Cấu hình mặc định cung cấp snippet kết quả tìm kiếm và metadata nguồn, nhưng không hỗ trợ fetch trang bất kỳ; bản triển khai cần fetch toàn trang phải tự chọn bật fetch. Kênh snapshot Web sẽ khởi động cây cấu hình đã bàn giao, dùng fixture Messages cục bộ, chạy qua nhà cung cấp DeepSeek thật để lái một lượt replay gọi `web_search`, khẳng định yêu cầu phụ trợ đã lưu và kết quả có cấu trúc, và cố định hiển thị cuối cùng trên trình duyệt. Smoke test tổ hợp TUI/Web cố định danh sách `web_search` dùng chung và sự thật rằng không cung cấp `web_fetch`; bản dump cấu hình tổ hợp sau khi build cố định ngân sách tìm kiếm một phút đã bàn giao; test nhà cung cấp cố định hành vi khi thiếu, đã lưu, và đã xoay vòng credential, cũng như khả năng tương thích giữa giá trị literal và biến môi trường.
