# Agent Note: Ghi hình GIF demo trình duyệt

Status: implemented

Archived: 2026-07-26

[English](2026-07-23-browser-demo-gif-recording.md) | 中文

## Vấn đề

Demo trình duyệt trước đây được tạo bằng các lệnh chụp và encode một lần, dùng xong bỏ. Cách này dẫn đến nhịp phát và kích thước output không nhất quán, dễ khiến người ghi hình chọn ghi liên tục, che lấp mất các thay đổi trạng thái hữu ích, và còn có thể làm mờ ranh giới giữa luồng server/API thật với fixture (dữ liệu chuẩn bị trước cho test). Gộp việc ghi hình local với việc upload đính kèm hoặc chỉnh sửa PR (Pull Request) trong cùng một tác vụ còn khiến một tác vụ vốn chỉ nên xử lý media lại có được quyền ghi từ xa không liên quan.

## Quyết định

Repo cung cấp skill (kỹ năng) [`record-browser-gif`](../../../skills/record-browser-gif/SKILL.md) để sinh ra sản phẩm demo trình duyệt local. Skill này dùng workflow điều khiển trình duyệt hiện có sẵn, trước tiên xác nhận luồng được yêu cầu là luồng thật, được fixture hỗ trợ, hay dùng cách mô phỏng khác, rồi chỉ chụp một tập hợp frame phân cảnh tinh gọn sau khi UI đạt tới trạng thái có thể quan sát được về mặt ngữ nghĩa. File frame được lưu trong thư mục `.playwright-mcp/` bị `.gitignore` bỏ qua của repo (công cụ trình duyệt chỉ có thể ghi vào thư mục gốc được phép của nó), không làm bẩn worktree.

Script hỗ trợ đi kèm `encode_gif.py` sắp xếp các frame theo thứ tự từ điển, đặt thời gian dừng rõ ràng cho mỗi frame, encode qua pipeline bảng màu (palette) của `ffmpeg`, và dùng `ffprobe` để kiểm chứng kích thước ảnh nguồn cũng như số frame, kích thước, thời lượng và giới hạn byte của kết quả encode. Việc ghi hình kết thúc sau khi trả về đường dẫn tuyệt đối của GIF đã được kiểm chứng; khi tác vụ bao gồm việc đính GIF vào PR, [Quyết định về bằng chứng GIF cho PR GUI](2026-07-26-gui-pr-gif-evidence-and-assets-branch.md) có chính sách bằng chứng bắt buộc cùng bước phát hành lên nhánh assets tiếp theo.

## Các phương án thay thế đã cân nhắc

**Ghi hình video liên tục rồi chuyển đổi.** Ghi liên tục giữ lại mọi lần di chuyển con trỏ và chuyển cảnh loading, nhưng tạo ra sản phẩm lớn hơn, nhiều nhiễu hơn, và khó giữ được thời gian phát xác định. Phân cảnh theo trạng thái phù hợp hơn cho demo tính năng ngắn gọn, vì bằng chứng có ý nghĩa chỉ là một vài thay đổi trạng thái có thể quan sát được.

**Giữ công thức `ffmpeg` nội tuyến trong skill.** Mỗi lần chạy đều phải lắp lại việc escape dấu ngoặc, danh sách thời gian, filter bảng màu, hành vi ghi đè và kiểm tra sau encode, dễ sai. Script hỗ trợ đi kèm giữ các cơ chế này luôn có thể thực thi, còn skill chỉ chịu trách nhiệm quyết định khi nào chụp hình.

**Đưa cả việc upload đính kèm GitHub và chỉnh sửa mô tả vào.** Upload và sửa đổi từ xa cần quy tắc xác thực, xác nhận và khôi phục độc lập riêng. Giữ việc ghi hình thuần local và có thể hoàn tác được duy trì ranh giới này; với các tác vụ thực sự cần đính GIF vào PR, [Quyết định về bằng chứng GIF cho PR GUI](2026-07-26-gui-pr-gif-evidence-and-assets-branch.md) có bước phát hành có ranh giới đó.

**Dùng fixture bất cứ khi nào dễ dàn dựng hơn.** Khi yêu cầu nói rõ demo cần được fixture hỗ trợ, dùng fixture là hợp lệ; nhưng nó không thể làm bằng chứng cho tuyên bố về server thật hoặc API thật. Skill này giữ nguồn demo theo đúng yêu cầu đã chỉ định, và báo lỗi khi thiếu điều kiện tiên quyết, không tự ý thay đổi nguồn.

## Hệ quả

Kết quả ghi hình trở thành sản phẩm local nhỏ gọn, có thể tái tạo lại được, ghi rõ nguồn demo, và giữ ranh giới rõ ràng với repo. Workflow này từ bỏ hiệu ứng động liên tục mượt mà, phụ thuộc vào `ffmpeg` và `ffprobe` có sẵn trên máy, và yêu cầu người ghi hình nhận diện được các thời điểm chụp có ý nghĩa ngữ nghĩa. Test dùng demo trình duyệt bốn trạng thái và input thời lượng không hợp lệ để kiểm tra script hỗ trợ; cấu trúc skill và liên kết repo được bao phủ bởi bộ kiểm chứng skill và gate tài liệu.
