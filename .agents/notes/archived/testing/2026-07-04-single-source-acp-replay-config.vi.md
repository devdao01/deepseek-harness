# Agent Note: Chuyển cấu hình replay của acp-agent về một nguồn duy nhất

Status: implemented
Archived: 2026-07-26

[English](2026-07-04-single-source-acp-replay-config.md) | Tiếng Việt

## Vấn đề

`examples/acp-agent` phát hành hai bản cấu hình được bảo trì thủ công: `cordis.yml` (cây chạy thật) và `cordis.snapshot.yml` sao chép nó từng dòng một, chỉ thay backend llm — sau khi bỏ chú thích, toàn bộ khác biệt giữa hai file chỉ là tám dòng stanza `llm-deepseek` và hai dòng stanza `llm-replay`. Mỗi thay đổi về hình dạng ứng dụng đều phải sửa hai lần, mà cũng không có cơ chế nào ràng buộc tính đối xứng: nếu bản sao trôi lệch, lớp snapshot sẽ âm thầm phủ lên một ứng dụng khác với ứng dụng đã phát hành — trong khi lớp snapshot vốn sinh ra để bịt đúng [khoảng trống kiểu "unit test xanh, sản phẩm hỏng"](../../../../docs/postmortem/0001-acp-default-export-drops-inject.md); nay khoảng trống cùng loại lại xuất hiện ở tầng trên, và chỉ còn trông cậy vào sự cảnh giác của người review.

## Quyết định

`cordis.snapshot.yml` include cấu hình chính thức, vô hiệu hóa adapter DeepSeek chỉ định thông qua id và name, rồi chèn adapter replay vào. Nhờ vậy mọi mục còn lại đều đến từ cây chạy chính thức. Khi replay thì chọn overlay; khi record vẫn khởi động `cordis.yml`, và loader guard cho phép những mục bị vô hiệu hóa có chủ đích.

Overlay chủ ý dựa vào một đặc tính của plugin vendored: khi include nạp file thì `patches` được áp dụng, còn đường đi `refresh()`/`internal/update` chỉ đọc lại chứ không vá lại — vừa đủ cho một lần khởi động replay dùng một lần (ứng dụng replay không nạp `hmr`, và trong lúc chạy cũng không có gì ghi đè cấu hình). Bộ snapshot chính là bằng chứng: mọi kịch bản đều chạy nguyên vẹn trên overlay, kể cả expected output giống nhau đến từng byte.

## Các phương án từng cân nhắc

### Vì sao không chọn các phương án này?

Giữ nguyên hai bản sao đầy đủ và thêm một cổng kiểm tra tính đối xứng là lối lùi đã được ghi nhận — nó loại bỏ được loại vấn đề trôi lệch âm thầm, nhưng vẫn để lại một bản gần như sao chép dài 125 dòng mà toàn bộ nội dung chỉ khác nhau ở một mục, và còn phình to theo từng plugin mới thêm vào ứng dụng. Thay thế ở phía bin (phân tích cấu hình, thay mục, xóa file) thì lại đưa phẫu thuật YAML vào sản phẩm phát hành và giấu khác biệt replay khỏi tầm mắt; overlay giữ cho khác biệt ở dạng khai báo, dễ đọc và nằm ngay cạnh cấu hình gốc — đúng giá trị sư phạm mà những người ủng hộ phương án hai bản sao thực sự coi trọng.

## Hệ quả

- Thêm plugin vào `cordis.yml` là tự động vào cây replay, không cần sửa lần thứ hai; loại vấn đề trôi lệch biến mất về mặt cấu trúc, chứ không phải bị cổng kiểm tra chặn lại.
- Overlay dựa vào việc các mục mang `id:` ổn định. Khẳng định `name` trên patch vô hiệu hóa giúp tránh trỏ nhầm (khi id bị dùng lại thì patch bỏ qua chứ không vô hiệu hóa nhầm plugin). Nếu id bị đổi tên, patch suy biến thành bỏ qua, và cảnh báo của nó cần một logger mà ứng dụng replay cố ý không có — kết quả quan sát được là một mục `llm-deepseek` vô hiệu, không key, tồn tại song song với `llm-replay`, còn output replay vẫn đúng (`llm-replay` nắm quyền chặn sớm luồng); đây là dạng mục rữa cấu hình, để review phát hiện, chứ không tạo ra snapshot sai. Khi chèn ở tầng trên cùng một mục mới có id trùng với mục sẵn có, id map của loader lấy mục sau làm chuẩn; cấu hình hiện tại không có xung đột, và dòng patch mới thêm chính là chỗ có thể sinh ra xung đột.
- Nếu về sau cây replay cần thêm điểm khác biệt thứ hai (một backend khác bị thay), chỉ cần thêm một dòng patch, chứ không phải fork thêm một file nữa.
