# Agent Note: Đường dẫn duy nhất để thêm Workspace

Status: implemented

[English](2026-07-31-one-route-to-add-a-workspace.md) | Tiếng Việt

## Vấn đề

Hai lớp bề mặt Workspace — nút `+` ở đầu khu vực sidebar và chip ở vùng hero của session — đều cung cấp hai đường dẫn để có được một Workspace: **Mở thư mục cục bộ…** khởi động luồng directory tổng hợp, **Tạo workspace mới** nhận một cái tên và tạo `<workspaceRoot>/<name>`. Hai đường dẫn này chồng lấn nhau: bộ chọn (picker) sẵn có khả năng **Tạo thư mục mới**, do đó "chọn một thư mục" vốn đã bao trùm "tạo một thư mục". Hai điểm vào nghĩa là cùng một kết quả có hai bộ từ vựng, một hộp thoại đặt tên đi kèm quy tắc trùng tên riêng, và một vị trí tạo mà người thao tác không nhìn thấy cũng không chọn được.

Sau khi loại bỏ điểm vào yếu hơn, đầu khu vực sidebar chỉ còn một hành động, từ đó nảy sinh vấn đề hiển thị mà quyết định này giải quyết luôn: một overlay chỉ có một dòng thì nên trông như thế nào.

## Quyết định

Thêm Workspace chỉ có một đường dẫn duy nhất: chọn một thư mục trên máy host thông qua luồng directory tổng hợp, dù thư mục đó mới tạo hay đã tồn tại. Điểm vào là `menu.addWorkspace` ("Thêm workspace…" / "Add workspace…"); hộp thoại tạo theo tên cùng văn bản `create.*`／`menu.createWorkspace`／`workspace.new` của nó đều bị xóa hoàn toàn. Nhãn đặt tên theo kết quả chứ không theo cơ chế, vì giờ đây nó là cánh cửa duy nhất dẫn tới kết quả đó — người dùng tìm "Tạo mới" phải tìm thấy được nó.

**Menu tồn tại để phân biệt (disambiguate) giữa nhiều mục tiêu.** Khi chỉ còn lại một điểm vào duy nhất là "thêm" — dù ở lớp bề mặt sidebar chỉ-thêm, hay ở vùng hero khi danh sách rỗng — thì cử chỉ chạm vào anchor (điểm neo) *chính là* hành động đó: khởi động luồng ngay lập tức, không render overlay. Một overlay chỉ có một dòng tốn thêm một cú click mà không mang lại lựa chọn nào. Quy tắc này là một vị từ (`addIsTheOnlyEntry`) áp dụng cho cả hai lớp bề mặt, thay vì xử lý đặc biệt cho từng lớp riêng lẻ.

Từ quy tắc này suy ra hai ranh giới, cả hai đều thuộc quyết định này:

- **Danh sách rỗng chỉ được coi là kết quả cuối cùng sau khi baseline đã ổn định.** Khi `phase` vẫn là `pending`, vùng hero giữ nguyên menu và trạng thái loading, thay vì nhảy vào một luồng mà workspace sắp đến sẽ khiến nó trở nên thừa thãi. Lớp bề mặt sidebar chỉ-thêm không liệt kê bất cứ thứ gì, nên không bao giờ phải chờ.
- **Khi lỗ hổng (hole) của luồng directory không có bên chiếm giữ (occupant), thì không có cách nào để thêm.** Lúc này, đầu khu vực sidebar đơn giản là không render nút, thay vì để lại một nút mà bấm vào không có phản hồi; menu ở vùng hero vẫn hoạt động như một bộ chọn, liệt kê nội dung đã có — và khi cũng không có gì để liệt kê, nó không mở ra gì cả: một overlay rỗng sẽ tuyên bố một lựa chọn không hề tồn tại. Đây là hành vi mặc định "không có luồng" đã được tài liệu hóa trong seam đi đến kết luận của nó: bên chiếm giữ không có, năng lực tạo duy nhất cũng không có. Chip anchor ở vùng hero thuộc quyền sở hữu của ui-conversation, nên package này có thể chặn overlay, nhưng không thể ẩn chip đó.

Đường dẫn khởi động trực tiếp cũng tuân theo quy tắc busy mà mục menu đã khai báo: khi một lượt chọn vẫn đang được tiếp nhận (`flowBusy`), cử chỉ chạm vào anchor sẽ bị chặn, hiệu ứng hoàn toàn giống với việc vô hiệu hóa mục menu đó, nhờ vậy tránh được việc kết quả đến muộn chạy đua với một luồng thứ hai.

`WorkspaceCreateFlow` được đổi tên thành `WorkspacePickFlow`, prop `createOnly` của nó đổi tên thành `addOnly`; `createWorkspace` được tiêm vào thu hẹp từ `{ name } | { path }` xuống còn `{ path }`.

## Lớp bề mặt Wire và CLI (giao diện dòng lệnh)

`workspace.create` chỉ nhận `{ path }`; wire schema và `WorkspaceApi` không có thành viên `name`. Gateway không có cấu hình `workspaceRoot`; quy ước client chỉ cung cấp việc tiếp nhận theo path thông qua `WorkspaceCreateInput`, `WorkspaceRuntime.create` và `intentName`, `dsh web` không có flag `--workspace-root`. `workspace-name-conflict` vẫn được giữ trên wire, như một lỗi trùng tiêu đề của `workspace.rename`.

## Kiểm thử

`connectFreshWorkspace` — hàm hỗ trợ mà mọi kịch bản web e2e đều chạy qua lúc khởi động — sẽ chuẩn bị sẵn `<root>/workspace`, rồi tiếp nhận nó qua bộ chỉnh sửa path của hộp thoại, do đó cwd của session tạo ra hoàn toàn giống với khi tạo theo tên, và các golden của kịch bản vẫn còn hiệu lực. Việc chọn thư mục đã chuẩn bị sẵn thay vì tạo mới bên trong hộp thoại là để giữ cho hàm hỗ trợ này idempotent (bất biến khi lặp lại) qua nhiều lần connect có thể xảy ra trong một kịch bản (lần tạo thứ hai với cùng một thư mục sẽ thất bại, và hộp thoại tạo sẽ dừng luồng lại khi thất bại). Việc tạo thư mục mới bên trong picker — nửa còn lại của cùng một đường dẫn — được bao phủ bởi `workspace-management.e2e.ts`, đảm nhận các bao phủ có mục tiêu: thêm hai workspace trên một thư mục do hộp thoại tự tạo, tiếp nhận các thư mục khác nhau có cùng basename và giữ chúng độc lập với nhau, tái sử dụng một tiêu đề đã bị xóa trên một thư mục khác, và golden aria của hộp thoại duyệt.

`smoke-real.e2e.ts` là kịch bản duy nhất khởi động cây cấu hình gốc chưa được patch, trong đó dòng `-auto` sẽ resolve theo máy host; giờ đây nó dùng overlay `--config` để cố định `-browse`, khiến môi trường hiển thị của máy dev không thể quyết định picker có điều khiển được hay không.

## Các phương án thay thế đã cân nhắc

**Giữ `Mở thư mục cục bộ…` làm nhãn.** Từ chối: sau khi hợp nhất, điểm vào này vừa có thể mở vừa có thể tạo, việc đặt tên theo cơ chế sẽ vô tình che giấu nửa "tạo" khỏi những người dùng mà điểm vào của họ đã bị xóa. Lý do phản bác — chữ "cục bộ" phân biệt hiệu quả giữa máy chứa trình duyệt và máy chứa harness — đã được chính tiêu đề và breadcrumb của hộp thoại trả lời ở bước tiếp theo.

**Giữ menu hai điểm vào, để `Tạo workspace mới` cũng mở cùng luồng đó.** Từ chối: cùng một hành động có hai nhãn chính là sự nhầm lẫn mà thay đổi này loại bỏ, chứ không phải là phiên bản thu nhỏ của nó.

**Giữ overlay chỉ có một dòng để nhất quán với menu ở vùng hero.** Từ chối: một overlay không cung cấp lựa chọn nào là một cú click lãng phí, đọc lên giống như sản phẩm dở dang. Điều cần nhất quán ở đây là *quy tắc* (có menu ⇔ có lựa chọn), không phải control.

**Giữ khung menu cho các điểm vào có thể được thêm trong tương lai (clone repo, thư mục từ xa).** Từ chối, dựa trên nguyên tắc "require a current owner and need" (chỉ giữ khi có chủ sở hữu và nhu cầu hiện tại): các điểm vào như vậy hiện không tồn tại, và khi chúng xuất hiện, việc khôi phục menu khi đó sẽ là một thay đổi nhỏ hơn so với việc phát hành một khung rỗng ngay bây giờ.

**Xóa nhánh tạo theo tên trên wire trong cùng thay đổi này.** Từ chối, vì quyết định UI không phụ thuộc vào việc xóa backend và CLI, và hai bên đó có quy ước cùng test riêng, tạo thành một thay đổi có thể được đánh giá độc lập.

**Đăng ký workspace qua host trong e2e scaffold, thay vì điều khiển hộp thoại.** Từ chối: cách đó sẽ khiến toàn bộ 15 kịch bản tách rời khỏi picker, và cả lane sẽ không thể chứng minh rằng đường dẫn còn sót lại có thể đi tới một composer khả dụng. Hiện tại, mỗi kịch bản đều đi qua hộp thoại thật để tiếp nhận thư mục của chính nó; chỉ riêng nửa "tạo thư mục mới" được tập trung vào một kịch bản, vì lặp lại ở mọi nơi chỉ khiến hàm hỗ trợ dùng chung mất tính idempotent mà không đổi lại tín hiệu bổ sung nào.

## Hệ quả

- UI chỉ tạo thư mục Workspace trong thư mục do người thao tác chọn. Không có cấu hình phía server nào ràng buộc vị trí đó; triển khai nào cần ràng buộc đó phải thêm nó một cách tường minh.
- Phạm vi tiếp cận được của cấu hình picker quyết định hệ thống file host mà đường dẫn còn lại có thể tới; không còn thư mục cha nào được cấu hình sẵn khác.
- Tổ hợp có mount `ui-workspace` nhưng không có package directory-picker sẽ không thể thêm Workspace, và cũng không render nút.
- Chip ở vùng hero vẫn khai báo `aria-haspopup="menu"`, trong khi đường dẫn khởi động trực tiếp thực tế lại mở ra hộp thoại. Để khai báo đó phản ánh đúng hành vi thực tế, cần báo cáo cách luồng hiển thị thông qua quy ước owner của `conversation.hero.workspace` — quyền quyết định thuộc về luồng, quyền phát tín hiệu thuộc về chip, và hai điều này thuộc về hai package khác nhau — do đó việc này được liệt kê như một công việc tiếp theo có tên cụ thể, chứ không phải một sự không nhất quán âm thầm. Nút sidebar mới thêm trong thay đổi này hoàn toàn không khai báo popup nào.
