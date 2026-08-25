# Agent Note: Chạy từ mã nguồn mà không cần trình cài đặt được quản lý

Status: implemented

[English](2026-08-10-source-run-without-managed-installer.md) | Tiếng Việt

## Vấn đề

Trình cài đặt mã nguồn đi kèm kho mã có thể cung cấp launcher ổn định, các staging worktree cô lập lẫn nhau, nâng cấp nguyên tử, kho lưu rollback, cùng quy trình bảo trì dùng chung cho việc tùy biến cá nhân. Đồng thời, kho mã còn phải gánh một vòng đời thứ hai nằm ngoài trình quản lý gói: cài phụ thuộc trên host, nhắc nhập thông tin xác thực, tiếp quản checkout, quản lý quyền sở hữu symlink, điều phối nhánh staging, xử lý khôi phục sau nâng cấp, và liên tục giữ trình cài đặt tương thích với skill (kỹ năng) bảo trì đi kèm.

Việc chạy hay phát triển DeepSeek Harness từ một checkout mã nguồn không cần vòng đời này. Duy trì nó làm phình không gian trạng thái hệ thống file và Git cần hỗ trợ, mà không cải thiện đường thực thi vốn có của kho mã.

## Quyết định

Kho mã hỗ trợ chạy từ mã nguồn qua các script `pnpm` ở thư mục gốc. Mục `dsh` trong `package.json` khởi chạy trực tiếp `apps/cli/src/bin.ts` bằng `node --import tsx/esm`; việc sinh sản phẩm build là thao tác `pnpm run build` riêng biệt, do [quyết định tách khởi chạy mã nguồn khỏi build](2026-08-12-separate-source-launch-from-build.md) quy định. Script gói này chuyển tiếp tham số và kế thừa môi trường của bên gọi; khi phiên bản Node có hỗ trợ proxy từ môi trường cần tuân theo `HTTP_PROXY` và `HTTPS_PROXY`, bên gọi có thể đặt `NODE_USE_ENV_PROXY=1`. Người dùng chọn Web bằng `pnpm dsh web`, chọn chạy headless bằng `pnpm dsh --profile headless "task"`. Ví dụ ACP (Agent Client Protocol) độc lập vẫn chạy được qua `pnpm run demo:acp`.

Kho mã không phân phối trình cài đặt mã nguồn, bộ test của trình cài đặt, và cũng không phân phối skill vốn phụ thuộc vào symlink `current` được quản lý cùng staging worktree gắn dấu thời gian. Vị trí đặt checkout mã nguồn, việc cập nhật Git, cũng như bất kỳ launcher nào người dùng tự tạo bên ngoài kho mã đều do người dùng chịu trách nhiệm.

## Các phương án đã cân nhắc

**Giữ trình cài đặt, còn `pnpm run` chỉ ghi nhận như một đường khác.** Cách này giữ được launcher được quản lý và khả năng rollback, nhưng hai bộ quy ước vòng đời vẫn cùng có hiệu lực, bao gồm test của trình cài đặt và skill phụ thuộc vào bố cục staging.

**Giữ lại skill tùy biến và phát hành ngược lên thượng nguồn dạng tổng quát.** Các quy tắc an toàn trong đó cũng dùng được ngoài bố cục staging, nhưng những quy trình hiện có cùng tạo thành một hệ bảo trì bị ghép chặt: quy trình tùy biến tìm checkout staging đã cài, quy trình nâng cấp thực hiện chuyển đổi, còn quy trình phát hành ngược lên thượng nguồn thì chọn nội dung phát hành từ chính những sửa đổi cá nhân đó. Hướng dẫn đóng góp Git tổng quát vốn đã thuộc về chỉ dẫn của kho mã, nên không cần cung cấp dưới dạng skill giao kèm sản phẩm.

**Thay trình cài đặt bằng một script liên kết launcher nhỏ hơn.** Cách này đơn giản hóa quá trình thiết lập, nhưng kho mã vẫn phải gánh việc sửa PATH của host và quản lý quyền sở hữu launcher. Script mã nguồn cung cấp được điểm vào mà không cần đưa vào loại trạng thái này.

## Ảnh hưởng

Người dùng bản mã nguồn chạy chương trình qua script của kho mã, chứ không dùng lệnh `dsh` đã cài. Kho mã không cung cấp chuyển đổi nâng cấp nguyên tử, cũng không giữ checkout rollback dạng staging; kho mã cũng không tự động tích hợp hay phát hành ngược lên thượng nguồn các sửa đổi mã nguồn cá nhân. Cơ chế phân phối trong tương lai phải giải thích vì sao chính nó nên quản lý trạng thái cài đặt và nâng cấp, định nghĩa hành vi khôi phục, đồng thời bổ sung test và tài liệu người dùng, và không được khiến đường chạy từ mã nguồn phụ thuộc vào cơ chế đó. Mọi quy trình phát hành trong tương lai đều phải tách ra thành một tính năng đã được phê duyệt, và phải có phê duyệt rõ ràng trước lần push đầu tiên cùng việc tạo PR (Pull Request) nháp.

Phạm vi kiểm chứng bao gồm mọi tham chiếu trong kho mã tới các điểm vào đã gỡ, liên kết tài liệu, độ mới của file khai báo bên thứ ba sinh tự động, lệnh khởi chạy mã nguồn trực tiếp trong `package.json`, cùng smoke test cho CLI mã nguồn chạy đúng theo cách `node --import tsx/esm`.
