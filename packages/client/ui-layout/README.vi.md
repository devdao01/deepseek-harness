# @deepseek-ai/dsh-client-ui-layout

[English](README.md) | Tiếng Việt

Plugin vỏ ngoài: AppFrame ba cột (tay cầm kéo và chuỗi nhường chỗ) cộng với dịch vụ hình học panel `ctx.layout`; nó đăng ký vào slot `root` do runtime sở hữu và khai báo `sidebar`, `conversation`, `details` và `conversation.empty`. Ranh giới thay đổi kích thước của thanh bên là một dải bắt sự kiện vô hình, còn ranh giới cột chi tiết vẫn giữ viên nang nổi của nó; trong lúc nhường chỗ chỉ cột chi tiết co lại rồi tự động đóng. Thanh bên khi đóng vẫn giữ thanh điều khiển 56px, còn cột chi tiết đóng về chiều rộng bằng không. Gói này còn cung cấp bộ trình bày theme: nó tiêu thụ snapshot `ctx.theme` đã được phân giải và chiếu nó lên document (dùng `html { color-scheme }` để điều khiển các điều khiển UA gốc, đặt `body[data-ds-dark-theme]` theo hệ màu hiện hành, và đặt các token bí danh của theme thành biến nội tuyến trên body, đồng thời sở hữu một `<meta name="theme-color">` với nội dung cập nhật theo màu nền body sau khi tính toán). Việc đo đạc sau khi áp bảng màu và token bảo đảm nền đã render là căn cứ màu duy nhất; bộ trình bày sẽ gỡ node metadata của chính nó khi dispose (giải phóng tài nguyên) và xóa luôn các trạng thái toàn cục khác mà nó đã ghi.

AppFrame luôn gắn thanh phiên và cột chi tiết; Session đã kết nối được render qua `SessionProvider`. Store bố cục là trạng thái tạm thời, thanh bên khởi động với chiều rộng mặc định còn cột chi tiết giữ trạng thái đóng, và store đó không bao giờ đọc hay ghi `localStorage`. Trạng thái hero cùng các trạng thái chưa chọn khác cũng suy ra chiều rộng render của cột chi tiết bằng không, nhưng không thay đổi chiều rộng ưa thích đã lưu. AppFrame giữ lại id phiên non-blank cuối cùng xuyên qua các trạng thái này: phiên đầu tiên giữ trạng thái đóng; thao tác mở cột chi tiết một cách tường minh sẽ dùng chiều rộng mặc định theo quy ước; quay lại đúng phiên đó thì khôi phục chiều rộng không đổi của nó; chọn một phiên khác thì cột chi tiết đóng trước khi vẽ.

Owner share của phiên rỗng, còn owner share của thanh bên chỉ chứa `collapsed` và `width`; bên đăng ký lấy dữ liệu nghiệp vụ qua các hook tiêu chuẩn và lấy thao tác từ giao diện inject riêng của mình.

Bề mặt export `/client` gồm thân plugin (`apply`／`inject`), `LayoutController` và bốn giao diện owner-share. AppFrame, store panel và bộ giải chuỗi nhường chỗ vẫn nằm bên trong gói.

## Trải nghiệm mô hình

Không có. Vỏ bố cục quản lý trạng thái xem trên trình duyệt; không có nội dung nào ở đây đi vào yêu cầu gửi mô hình.

#### Ảnh hưởng KV Cache

Không có; gói này không lắp ráp cũng không gửi yêu cầu tới provider.

## Hạn chế đã biết và phần tạm hoãn

- **Thông tin hình học panel là trạng thái tạm thời**: tải lại sẽ khôi phục giá trị mặc định của thanh bên và giữ cột chi tiết đóng; chuyển giữa các id phiên khác nhau cũng đóng cột chi tiết và quên chiều rộng sau khi kéo, còn các bề mặt chưa chọn render cột chi tiết với chiều rộng bằng không nhưng không sửa thông tin hình học.
- **Chuỗi nhường chỗ tự động đóng bằng cách suy ra chiều rộng bằng không, không đụng tới chiều rộng ưa thích**: khi cửa sổ rộng ra, panel tự khôi phục; bên tiêu thụ không được coi chiều rộng chi tiết trong store là trạng thái render thực tế.
- **Không có neo cuộn trong lúc dồn ép sắp xếp lại**: thay đổi bố cục có thể làm dịch chuyển viewport của người đọc.
