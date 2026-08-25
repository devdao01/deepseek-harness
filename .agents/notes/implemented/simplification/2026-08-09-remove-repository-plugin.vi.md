# Agent Note: Gỡ bỏ đường plugin repository chuyên dụng

Status: implemented

[English](2026-08-09-remove-repository-plugin.md) | Tiếng Việt

## Vấn đề

Đường plugin repository hiện thực trùng lặp việc cài đặt và tổ hợp gói bên thứ ba so với đường bundle profile. Nó thêm vào manifest `.dsh-plugin` (bản kê metadata), lớp bọc sinh tự động, file thực thi chuẩn bị, một bộ cache Git／gói thứ hai, mục built-in trong Loader, cùng adapter skill (kỹ năng) và MCP riêng cho repository. Bundle profile vốn đã có thể cài gói npm hoặc Git specifier qua trình quản lý gói của profile, giữ nguyên ngữ nghĩa phụ thuộc và vòng đời thông thường, đồng thời cung cấp một tầng `cordis.patch.yml` có thứ tự, nơi có thể mount plugin Cordis thông thường.

Đường trùng lặp này còn cấu hình được ít hơn bundle. Danh sách `repositories` của nó chọn chuỗi nguồn, nhưng lớp bọc sinh tự động lại không thể truyền cấu hình plugin do người dùng cung cấp khi mount điểm vào mã. Vì vậy, quy trình chuẩn bị riêng cho repository thêm rất nhiều mã và công việc CI, mà vẫn không trở thành cơ chế phân phối plugin ngoài mang tính tổng quát.

## Quyết định

DeepSeek Harness chỉ giữ một đường phân phối plugin ngoài độc lập: bundle profile có thể cài đặt. `dsh plugin --profile <name> add <package-or-git-spec>` ghi phụ thuộc vào gói profile, và gói được cài cung cấp tầng patch của riêng nó bằng cách khai báo `dsh.bundle.patch`. Trình quản lý gói chịu trách nhiệm lấy nguồn, quản lý phiên bản và phụ thuộc, chạy vòng đời build và duy trì lockfile. Patch của bundle chịu trách nhiệm chọn plugin Cordis và cung cấp cấu hình plugin đầy đủ.

Gỡ gói `@deepseek-ai/dsh-repository-plugin`, định dạng viết `.dsh-plugin`, file thực thi `dsh-plugin-prepare`, lớp bọc sinh tự động, cache repository bất biến, mục cấu hình `repository-plugins` trong base, cùng pipeline nghiệm thu GitHub chuyên dụng. Subpath `@cordisjs/plugin-loader/repository` không còn được dùng trong vendor và phụ thuộc pnpm đi kèm của nó cũng bị gỡ cùng bên tiêu thụ duy nhất. Thư mục cache repository hiện có chỉ còn là dữ liệu người dùng không còn tác dụng; DSH không đọc mà cũng không xóa những thư mục này.

Bundle tổ hợp trực tiếp các bên sở hữu sẵn có. Bundle cung cấp skill thì mount `@deepseek-ai/dsh-skill-filesystem`; bundle cung cấp MCP server thì mount `@deepseek-ai/dsh-mcp-client`; hành vi native thì mount plugin Cordis đã biên dịch thông thường. Các gói này tiếp tục giữ hợp đồng kiểm tra, vòng đời, đăng ký và teardown của riêng mình. Theo chính sách tương thích tiền phát hành, không giữ parser tương thích hay cơ chế migration cho `.dsh-plugin`.

Ghi chú này hợp nhất các quyết định đã bị gỡ về cache repository, định dạng tĩnh, tích hợp thuần cấu hình, quy trình chuẩn bị dựa trên npm và điểm vào mã được tin cậy. Động cơ ban đầu của chúng được giữ lại ở đây: người dùng độc lập cần cách tổ hợp bên ngoài do trình quản lý gói chịu trách nhiệm; phụ thuộc Git và npm có thể chạy mã vòng đời được tin cậy; đóng góp skill và MCP tĩnh nên tái dùng các bên sở hữu sẵn có; định danh nguồn nên nằm trong specifier phụ thuộc và lockfile của profile. Còn lớp bọc, generation cache và giao thức chuẩn bị đặc thù cho hiện thực đó thì không còn ràng buộc sản phẩm.

## Các phương án từng cân nhắc

**Giữ plugin repository làm lớp bọc tiện lợi cho bundle.** Không chấp nhận, vì như vậy sẽ giữ hai lệnh cài đặt, hai định dạng manifest cùng hai bộ định danh lỗi／cache cho cùng một gói. Nếu một lớp bọc tiện lợi không truyền được cấu hình plugin thông thường, năng lực của nó vẫn kém hơn cơ chế mà nó bọc.

**Để lớp bọc repository nạp patch của bundle.** Không chấp nhận, vì cache repository và giao thức chuẩn bị vẫn lặp lại việc cài phụ thuộc của profile. Bundle vốn đã có thể nhận specifier npm, Git, file và link qua pnpm.

**Giữ cache repository tổng quát của Loader cho những bên tiêu thụ có thể xuất hiện trong tương lai.** Không chấp nhận, vì sau khi gỡ các gói liên quan thì nó không còn bên tiêu thụ hiện tại, mà vẫn khiến một gói kề trình duyệt trong vendor phải mang theo runtime trình quản lý gói ghim phiên bản. Chỉ khi việc kích hoạt năng lực này ở giai đoạn cấu hình mà không cần cài tường minh trở thành nhu cầu sản phẩm mà phụ thuộc profile không đáp ứng được, thì mới có lý do đưa lại cache chuyên dụng; khi đó bên tiêu thụ ấy có thể chọn quy ước cache của riêng mình.

**Vô hiệu hóa plugin repository nhưng giữ định dạng trên đĩa để migrate.** Không chấp nhận, theo phương châm tiền phát hành. Giữ parser hay loader tương thích sẽ khiến một hợp đồng đã gỡ tiếp tục tồn tại trong khi không có nghĩa vụ tương thích với bên ngoài.

## Hệ quả

- Gói bên thứ ba thống nhất dùng một mô hình cài đặt và tổ hợp duy nhất, với khai báo phụ thuộc thông thường và cấu hình plugin đầy đủ ở tầng patch.
- Khi cài hoặc cập nhật bundle bên ngoài, phải thực hiện thao tác trình quản lý gói một cách tường minh qua `dsh plugin`, thay vì sửa danh sách nguồn đang được theo dõi. HMR (thay thế module nóng) của patch người dùng vẫn có thể cấu hình các mục cấu hình do bundle đã cài cung cấp.
- Khi cài profile, máy host phải có `pnpm` trong `PATH`. Với các thao tác quản lý gói tường minh, yêu cầu này là chấp nhận được, và tránh việc phải giao kèm sản phẩm một runtime trình quản lý gói ghim phiên bản chỉ để kích hoạt ở giai đoạn cấu hình như cache đã gỡ từng dùng.
- Gói `.dsh-plugin` và các patch danh sách nguồn repository hiện có ngừng hoạt động. Người dùng vẫn có thể tự xóa file cache của mình, nhưng hệ thống không migrate hay tự động xóa những file này.
- Runtime pnpm chuyên dụng, file thực thi chuẩn bị, bộ sinh lớp bọc, thiết lập CI cho thông tin xác thực Git, cache repository và test riêng cho repository đều biến mất.
- Tài nguyên tĩnh cần một dạng đường dẫn do bundle sở hữu và phân giải tương đối theo gói, để bundle khai báo có thể trỏ `dsh-skill-filesystem`, `dsh-mcp-client` hay plugin khác tới file mà nó giao kèm, mà không cần mã runtime tùy biến. Năng lực này thuộc về định dạng bundle, không phải adapter repository.

## Kiểm thử

Cổng tĩnh từ chối các tham chiếu gói, cấu hình, tài liệu, đồ thị và workspace còn sót lại. Test nghiệm thu CLI (giao diện dòng lệnh) đã build cho `dsh plugin` hiện có phủ việc khởi tạo profile, cài đặt bằng trình quản lý gói, phát hiện bundle và hòa giải tầng. Tài nguyên skill và MCP dạng khai báo, phân giải tương đối theo gói, vẫn là khoảng trống độ phủ đã được ghi nhận rõ ở tầng gỡ bỏ này.
