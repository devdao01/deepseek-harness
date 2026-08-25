# Agent Note: Entry point dsh với cấu hình tường minh

Status: implemented

Archived: 2026-08-08

[English](2026-08-03-explicit-config-dsh-entrypoint.md) | 中文

## Vấn đề

`dsh` trần (bare) sẽ ngầm định chọn TUI sản phẩm. Điều này khiến một lệnh duy nhất phải chịu trách nhiệm cho vòng đời terminal, định danh session và bàn giao khôi phục, onboarding, entry tắt cho workspace mã nguồn, session nâng cấp có hướng dẫn, theo dõi cấu hình cá nhân, và cả một bộ test snapshot PTY và transcript (bản ghi văn bản) cấp ứng dụng quy mô lớn. Hành vi mặc định này còn che giấu ranh giới hợp thành thật: `--config` là một tầng overlay thứ ba tùy chọn phía trên TUI, chứ không phải định nghĩa triển khai mà raw launcher cần.

Base dùng chung cố ý giữ trung tính: nó cung cấp các capability, nhưng không tạo ra agent (tác nhân) khởi động hay entry tương tác. Việc ghép base trung tính với ứng dụng ngầm định khiến việc hợp thành cấu hình raw thiếu ranh giới rõ ràng, và cũng khiến chính sách sản phẩm nằm trong CLI (giao diện dòng lệnh), thay vì được overlay do bên gọi chọn nắm giữ.

## Quyết định

Cách thực thi raw là `dsh --config <path>`. File được chỉ định phải là một danh sách patch Include, và được áp trực tiếp lên `apps/cli/config/base.cordis.yml` ở cùng tầng include. File này phải được cung cấp lúc khởi động; nó không phải là cây cấu hình thay thế hoàn chỉnh, cũng không kế thừa `apps/cli/config/web.cordis.yml` hay `$DSH_HOME/config.yaml`. Đường dẫn tương đối được phân giải từ thư mục gọi lệnh. Lỗi khởi động sẽ báo rõ ràng; SIGINT và SIGTERM sẽ thực hiện dispose (giải phóng tài nguyên) trên context gốc trước khi thoát.

Các hình thức chẩn đoán raw vẫn không cần khởi động: `dsh --dump-default-config` in ra base, `dsh --config <path> --dump-config` in ra kết quả hợp nhất giữa base và overlay bắt buộc. Quá trình dump dùng thuật toán patch và phương ngữ YAML mà Include đã hiện thực.

CLI không còn phát hành ứng dụng TUI. Overlay TUI, launcher, tài nguyên onboarding lần chạy đầu, fixture (dữ liệu chuẩn bị trước cho test) TUI cấp ứng dụng, harness PTY, luồng terminal và snapshot đều đã bị xóa. Subcommand `meta` và `upgrade`, gate tính năng thử nghiệm tương ứng, entry khôi phục surface mặc định, và đường `--config-replace` cho toàn bộ cây cấu hình cũng bị xóa cùng ứng dụng này. Installer không còn cung cấp bộ chọn giao diện, chỉ build và khởi động Web.

`dsh web` giữ lại base dùng chung, overlay Web và tầng người dùng cá nhân hoặc tường minh. `dsh -p` giữ lại tổ hợp Web/headless dùng một lần. Package TUI có thể tái sử dụng ban đầu vẫn được giữ lại sau thay đổi entry point này, sau đó [quyết định loại bỏ toàn bộ package](2026-08-04-remove-tui-package.md) đã xóa nó cùng interface SDK.

Quyết định này thay thế phần dành riêng cho `dsh` trong các bản ghi sau: [entry point TUI toàn màn hình chuyên dụng](../../archived/feature/2026-07-17-dedicated-full-screen-tui-front-door.md), [cấu hình cá nhân](../feature/2026-07-20-dsh-cli-personal-config.md), [lệnh session skill có hướng dẫn](../../archived/feature/2026-07-28-dsh-guided-skill-session-commands.md), [meta workspace](../../archived/feature/2026-07-28-dsh-meta-source-workspace.md), [overlay cấu hình base dùng chung](2026-07-29-shared-base-config-overlays.md), [dump cấu hình](../../archived/feature/2026-07-30-dsh-dump-config.md), [trang chào lần chạy đầu có phiên bản](../../archived/feature/2026-07-30-versioned-tui-first-run-welcome.md) và [gate subcommand thử nghiệm](../../archived/feature/2026-07-31-experimental-subcommand-gate.md). [Quyết định loại bỏ toàn bộ package](2026-08-04-remove-tui-package.md) sau đó thay thế phần quyết định về package có thể tái sử dụng trong các bản ghi này, và hợp nhất các bản ghi định danh launcher đã bị xóa.

## Kiểm chứng

Test parser yêu cầu khởi động raw phải cung cấp `--config`, và từ chối tên lệnh đã xóa cùng tổ hợp tùy chọn không tương thích. Test nghiệm thu binary đã build chạy entry point JavaScript đã phát hành mà không dùng tsx, kiểm tra dump chỉ-base và base-cộng-overlay, đồng thời truyền vào overlay provider raw không hợp lệ, để chứng minh lỗi khởi động có thể kết thúc và thoát, chứ không treo. Test tương thích khởi động từ mã nguồn kiểm tra cùng chẩn đoán thiếu cấu hình bắt buộc đó qua `bin/dsh`. `apps/cli` không còn chứa bất kỳ demo hay test TUI nào.

## Các phương án thay thế đã cân nhắc

**Giữ `dsh` trần làm TUI, và thêm subcommand cấu hình tường minh.** Không được chấp nhận, vì CLI vẫn phải giữ hai bộ chính sách ứng dụng không liên quan tới nhau, và giữ lại launcher, onboarding và hạ tầng test chỉ dùng cho TUI.

**Cho phép `dsh` trần khởi động base trung tính.** Không được chấp nhận, vì base không tạo ra agent hay entry tương tác. Tiến trình kết thúc khởi động thành công mà không có entry khả dụng sẽ che giấu quyết định triển khai còn thiếu.

**Giữ `--config-replace` để hỗ trợ toàn bộ cây cấu hình.** Không được chấp nhận, vì thực thi raw giờ chỉ có một hợp đồng hợp thành duy nhất: áp một overlay bắt buộc lên trên base sản phẩm. Triển khai cây cấu hình hoàn chỉnh có thể dùng loader Cordis tổng quát hoặc binary ứng dụng chuyên dụng, không cần thêm ý nghĩa thứ hai cho `dsh --config`.

**Xóa package TUI cùng lúc với entry point sản phẩm.** Ban đầu không được chấp nhận, vì chỉ xóa một ứng dụng đã phát hành tự nó không đòi hỏi phải xóa hiện thực UI có thể tái sử dụng. Sau khi cả tổ hợp đã phát hành lẫn bên tiêu thụ độc lập không còn tồn tại, [quyết định loại bỏ toàn bộ package](2026-08-04-remove-tui-package.md) đã chấp nhận phương án này.

## Hệ quả

Gọi `dsh` mà không chỉ định mode, cũng không cung cấp cấu hình raw, sẽ tạo ra lỗi sử dụng. Các lệnh gọi khởi động TUI hiện có, `meta`, `upgrade`, khôi phục và thay thế toàn bộ cây cấu hình sẽ ngừng hoạt động, và không cung cấp bí danh tương thích. Theo lập trường tương thích trước phát hành, điều này chấp nhận được, và giúp giữ cú pháp lệnh được hỗ trợ tinh gọn.

Triển khai raw phải khai báo mục cấu hình agent và entry trong overlay, khiến ranh giới ứng dụng có thể được review, và tiếp tục hấp thụ cập nhật từ base nền tảng. Chúng không ngầm nhận cấu hình cá nhân; triển khai cần chính sách đó phải tự hợp thành. Web vẫn là surface sản phẩm tương tác được cung cấp sau khi cài đặt, entry headless và tự động hóa vẫn giữ độc lập.

Việc đưa lại ứng dụng terminal đã phát hành cần có nhu cầu sản phẩm cụ thể, dùng mẫu entry có tên riêng thay vì giá trị mặc định raw ngầm định, và phải xây dựng bề mặt nghiệm thu snapshot và vòng đời hiệu lực hiện hành của riêng nó.
