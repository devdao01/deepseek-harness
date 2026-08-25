# Agent Note: Gỡ khối nội dung `image` cho đến khi có đường dẫn thực sự xử lý được nó

Status: implemented

[English](2026-07-04-drop-image-content-block.md) | Tiếng Việt

## Vấn đề

`ImageBlock` (`packages/llm/llm/src/types.ts`) không có bên tạo ra nào trong môi trường production, còn mọi bên tiêu thụ trên mọi đường dẫn đều vứt bỏ nó: bộ tuần tự hóa của adapter DeepSeek bỏ qua khối image (đây là giới hạn MVP đã ghi trong tài liệu); bộ chuyển đổi pi-ai bỏ qua vì không biểu diễn được; bộ ước lượng nén (compaction) tính token cho nó theo một hằng số cố định và render thành `[image]`. ACP (Agent Client Protocol) thì từ chối nội dung prompt dạng ảnh một cách độc lập. Một `ImageBlock` được dựng lên ở thời điểm này sẽ biến mất lặng lẽ khỏi định dạng giao thức của provider (wire format) — từ vựng tuyên bố một năng lực mà không đường dẫn nào thực hiện, và đây đúng là dạng mất dữ liệu âm thầm mà các mẫu phòng thủ trong AGENTS.md cảnh báo. Lời gọi dựng duy nhất xuất hiện trong test, nhằm bao phủ các nhánh skip/drop/estimate.

## Quyết định

Gỡ `ImageBlock`, mục map của nó, cùng các nhánh dành riêng cho image trong adapter và nén. Trong cùng một thay đổi, cập nhật tài liệu từ vựng sở hữu nó và tài liệu tham chiếu được sinh ra. Các khối mở rộng chưa biết vẫn được nhánh mặc định bao phủ, và ACP tiếp tục từ chối nội dung prompt dạng ảnh đến từ bên ngoài, độc lập với từ vựng của harness.

## Các phương án đã cân nhắc

### Vì sao không giữ lại?

Khi adapter và nén hỗ trợ image, `ContentBlockMap` có thể đưa lại khối nội dung image. ACP có thể tiếp tục là một giao thức tự động hóa thuần văn bản. Giữ một kiểu cốt lõi mà bản cài đặt duy nhất của nó là từ chối, chẳng khác nào tuyên bố một giao diện dịch vụ đối ngoại không dùng được; sau khi gỡ, bên tạo ra sẽ nhận lỗi ngay tại thời điểm biên dịch.

Phương án dự phòng đã ghi tài liệu (phòng khi mục từ vựng này quay lại trước khi tính năng hoàn chỉnh sẵn sàng): giữ `ImageBlock`, nhưng thay mọi lần bỏ qua âm thầm bằng từ chối tường minh, và ghi lại chính sách đó trong tài liệu từ vựng — bỏ rơi âm thầm là trạng thái duy nhất không ai chủ trương giữ.

## Kiểm chứng

Ngoài Agent Note ra, không nơi nào dựng `ImageBlock` của harness. Đường dẫn từ chối ảnh đến từ bên ngoài của ACP vẫn có test riêng; còn các nhánh mặc định của adapter, codec và nén thì được bao phủ bằng các kiểu khối do plugin định nghĩa.

## Hệ quả

Việc thêm lại một kiểu từ vựng cốt lõi về sau sẽ cần sửa đồng thời nhiều gói — nhưng thay đổi phối hợp như vậy vốn chính là hình dạng mà một tính năng đa phương thức thực thụ đòi hỏi (ánh xạ adapter và định giá nén), trong khi hiện tại không tồn tại bản cài đặt nào đáng giữ lại.
