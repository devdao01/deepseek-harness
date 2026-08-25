# Agent Note: Dòng công cụ skill trên Web

Status: implemented

[English](2026-08-06-web-skill-tool-row.md) | Tiếng Việt

## Vấn đề

Web transcript (bản ghi văn bản) render lời gọi `skill` qua dòng dự phòng dùng chung, khiến tập chỉ dẫn đã nạp trông như một lời gọi công cụ không xác định, dù Skill (kỹ năng) vốn đã là khái niệm hạng nhất trong sản phẩm. Dòng dùng chung còn phơi bày lớp vỏ ngoài của tham số JSON bên cạnh kết quả, làm tăng nhiễu quanh định danh duy nhất mà người dùng thực sự cần: tên skill đã nạp.

## Quyết định

`ui-skill` đăng ký một component với key là `skill` dưới keyed slot `tool.call.toolview` của ui-tool. Component này tiêu thụ cam kết owner `ToolCallViewProps` công khai và tự hiện thực phần chrome của dòng, không import chi tiết trình bày nội bộ của ui-tool.

Dòng ở trạng thái thu gọn dùng bộ biểu tượng tài liệu kết hợp tia sáng cỡ 14 pixel, và kế thừa thang màu trung tính của dòng Bash: biểu tượng dùng màu cấp ba, tiêu đề `Skill` dùng màu cấp hai, dấu phân cách dùng màu caption, tên skill dùng màu cấp ba. Lời gọi đang chạy, thất bại và bị ngắt lần lượt kế thừa hiệu ứng quét sáng của transcript, chấm trạng thái lỗi kèm tóm tắt dòng đầu, và ngữ nghĩa chấm trạng thái cảnh báo. Lời gọi đã kết toán có thể mở rộng qua toàn bộ dòng tóm tắt thành một thẻ `Instructions` với chiều cao tối đa 260 pixel, trong đó văn bản kết quả đã lưu bền được trình bày nguyên trạng; lối vào `Inspect` hiện có để nhảy tới trajectory vẫn được giữ ở bên dưới thẻ.

Mọi giá trị hiển thị của dòng này đều dẫn xuất từ các mảnh lời gọi/kết quả đã ghép cặp trong cửa sổ runtime hiện tại. Tên skill đến từ tham số `name` đã ghi lại, chỉ dẫn đến từ nội dung kết quả đã lưu bền; dòng này tuyệt đối không liên hệ tới thư mục skill hiện tại để đọc mô tả hay metadata của bên cung cấp. Nếu phân trang khiến lời gọi nằm ngoài cửa sổ thì kết quả không có danh tính công cụ, và sẽ tiếp tục dùng đường dự phòng dùng chung, thay vì mở rộng cam kết giao thức history. Bản ghi `skill-load` của ACP (Agent Client Protocol) hiện có được ghi qua đường lưu bền và tổ hợp Web thật, phục vụ cho tương tác không cần khoá và snapshot trợ năng.

## Các phương án đã cân nhắc

- Giữ dòng công cụ dùng chung, chỉ thêm một bộ chọn màu `skill` và đặt nó trong `ui-conversation`. Phương án này vẫn giữ lại lớp vỏ đầu vào dư thừa và phần mở rộng dùng chung, đồng thời khiến gói conversation sở hữu các quy tắc thị giác riêng của một lĩnh vực.
- Thêm giá trị `skill` mới vào kiểu union biểu thị ý đồ render công cụ của host. Slot client có key vốn đã nhận diện được công cụ này khi lời gọi nằm trong cửa sổ runtime, nên một giá trị trình bày mới xuyên ranh giới chỉ làm tăng bề mặt giao thức và snapshot, mà không hỗ trợ thêm bên tiêu thụ nào khác.
- Xuất component `ToolRow` riêng tư của gói conversation để tái sử dụng. Các gói client cố ý phơi bày cam kết ra ngoài chứ không phơi bày component xuyên gói; xuất component đó sẽ khiến một gói tính năng độc lập bị ghép chặt vào chi tiết hiện thực của conversation.

## Hệ quả

Ngoài phụ thuộc tham chiếu source, `ui-skill` giờ còn phụ thuộc vào cam kết toolview công khai của conversation, gói locale, gói nguyên thuỷ và React. Nó tự giữ một phần nhỏ chrome dòng gập/mở, nên các thay đổi tương tác toàn cục trong tương lai phải cập nhật đồng bộ bên đăng ký này cùng với ví dụ Bash và dòng conversation.

Ngay cả khi thư mục skill đã cài đặt thay đổi, việc phát lại nguội vẫn giữ tính tất định; trước khi người dùng mở rộng chỉ dẫn một cách tường minh, transcript vẫn gọn gàng. Trang history chỉ chứa kết quả cố ý dùng đường dự phòng dùng chung; giữ trường hợp biên này ở cách trình bày dùng chung sẽ bảo toàn giao thức history hiện có và giới hạn tính năng này ở tầng trình bày phía client. Thẻ chuyên dụng cố ý hiển thị đầu ra được công cụ đóng gói đầy đủ, thay vì chỉ trích xuất `<skill_instructions>`, nhờ đó giữ nguyên trạng nội dung mà mô hình thực sự nhận được, đồng thời tránh phải đưa thêm một bộ phân tích nữa cho định dạng kết quả skill.
