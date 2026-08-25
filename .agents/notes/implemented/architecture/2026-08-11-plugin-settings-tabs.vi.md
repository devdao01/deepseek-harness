# Agent Note: Các tab do chính tính năng sở hữu trong phần cài đặt "Plugin"

Status: implemented

[English](2026-08-11-plugin-settings-tabs.md) | Tiếng Việt

## Vấn đề

Phần cấu hình plugin và phần danh sách Loader chỉ đọc mỗi bên tự đăng ký một `settings.section` cấp cao nhất. Cả hai cùng mô tả một lĩnh vực "plugin", nhưng lại chiếm hai dòng điều hướng, xé tìm kiếm và cấu hình thành hai trang không liên quan tới nhau, đồng thời cũng không cho vỏ Settings một cách gộp có nguyên tắc. Nếu gộp thẳng component của cả hai, thì một plugin tính năng sẽ phải import và sở hữu vòng đời dữ liệu của một tính năng khác.

## Quyết định

`@deepseek-ai/dsh-client-ui-settings-plugins` sở hữu duy nhất một đóng góp `settings.section` với id là `plugins`. Nó render tiêu đề dùng chung và thanh tab gọn, khai báo slot danh sách ở cấp gốc `settings.plugins.tab`, rồi chiếu id, order và label bám theo ngôn ngữ trong bản ghi đó thành các tab. Kiểu chuẩn của slot này nằm trong `ui-settings`, nhờ vậy bên đóng góp tab phụ thuộc vào quy ước của lĩnh vực settings, chứ không phụ thuộc vào một plugin tính năng khác.

Bên sở hữu section đóng góp tab `configurable`, và chính nó khai báo danh sách lồng `settings.plugin.item` đã có sẵn. Ràng buộc namespace, trạng thái nháp, kiểm tra và ghi vốn có của thẻ cấu hình đều giữ nguyên. `@deepseek-ai/dsh-client-ui-settings-plugin-inventory` đóng góp tab `all` vào `settings.plugins.tab`; observer Host Loader, namespace Remote được sinh ra, DTO và ngữ nghĩa tìm kiếm của nó giữ nguyên. Các mục danh sách đã bị vô hiệu hóa sẽ bỏ đi trạng thái chạy "chưa mount" trùng lặp ở cả phần tóm tắt lẫn chi tiết, còn mục đã bật vẫn hiển thị pha Cordis của nó.

Mặc định chọn tab đầu tiên theo thứ tự. Một tab chỉ được mount vào lần đầu nó được chọn, sau đó trong suốt thời gian section "Plugin" còn mount thì nó chỉ bị ẩn chứ không unmount. Nhờ vậy RPC danh sách được hoãn đến khi người dùng mở **danh sách plugin**, và khi chuyển tab thì bản nháp, chuỗi tìm kiếm, trạng thái thu gọn và snapshot đã đọc đều được giữ lại. Đóng Settings sẽ unmount section đó, nên khi mở lại rồi chọn lại tab, nó sẽ lấy một snapshot danh sách mới.

Cả hai lượt đăng ký đều dùng `ctx.slots.inject()`. Khi bên khai báo section unmount, slot tab và toàn bộ đóng góp của nó cùng sụp theo; sau khi khai báo lại, mỗi tính năng đều đăng ký lại được mà không cần import tĩnh, cũng không phụ thuộc vào thứ tự kích hoạt.

## Phương án thay thế

**Giữ hai dòng điều hướng trong Settings, chỉ đổi tên.** Bị bác, vì trùng lặp là vấn đề cấu trúc chứ không phải vấn đề câu chữ: hai trang vẫn đại diện cho cùng một lĩnh vực "plugin" và vẫn tiếp tục tranh giành không gian điều hướng.

**Import component danh sách vào `ui-settings-plugins`.** Bị bác, vì như vậy plugin cấu hình sẽ sở hữu phụ thuộc Remote và vòng đời của một plugin khác, đồng thời biến một đóng góp trình duyệt tùy chọn thành phụ thuộc ở cấp package.

**Hardcode tên và component của hai tab ở bên sở hữu section.** Bị bác, vì tính năng thứ ba sẽ đòi phải sửa bên sở hữu, và teardown HMR cũng có thể để lại khung giao diện của những đóng góp không còn tồn tại. Bản ghi slot vốn đã cung cấp định danh, thứ tự, bản địa hóa và ngữ nghĩa xếp tầng.

**Chuyển phần gộp "plugin" vào `ui-settings-general`.** Bị bác, vì vỏ Settings sở hữu điều hướng chung và khung giao diện modal, chứ không sở hữu nội dung tính năng. Đặt tab riêng của "plugin" ở đó sẽ khiến mọi loại view "plugin" trong tương lai đều phải sửa vỏ.

## Ảnh hưởng

Settings chỉ có một dòng điều hướng "Plugin", xếp trước "Agent preset", chứa hai tab **cấu hình plugin** và **danh sách plugin**. "Agent preset" vẫn là một section riêng, vì nó chỉnh sửa việc lắp ráp agent cho từng session, chứ không phải cây Host Loader thời gian thực.

Quyền sở hữu theo tính năng vẫn rõ ràng: `ui-settings-plugins` sở hữu trang "Plugin" và các thẻ chỉnh sửa được, `ui-settings-plugin-inventory` sở hữu view danh sách chỉ đọc, đường đi Host／RPC không đổi. Một view "plugin" mới chỉ cần đăng ký một đóng góp `settings.plugins.tab` là tham gia được.

Phần gộp này phụ thuộc vào việc bên sở hữu section được lắp ráp: khi không có `ui-settings-plugins`, `ui-settings-plugin-inventory` sẽ chờ slot tab được khai báo và không render gì cả. Đây là phụ thuộc tổ hợp có chủ ý, được chuyển tải qua registry của slot, chứ không phải import package tĩnh.
