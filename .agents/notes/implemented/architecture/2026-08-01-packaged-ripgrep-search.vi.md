# Agent Note: glob/grep chuyển sang spawn trực tiếp binary ripgrep được đóng gói

Status: implemented

[English](2026-08-01-packaged-ripgrep-search.md) | Tiếng Việt

> Thay thế [công cụ khám phá grep/glob chạy trên bash](../../archived/feature/2026-07-09-bash-backed-grep-glob-discovery.md): phương án được nêu rõ là hoãn lại trong quyết định v1 — spawn ripgrep trực tiếp — nay trở thành phần triển khai thực sự được bàn giao.

## Vấn đề

Công cụ `glob`/`grep` chạy qua seam của bộ thực thi bash, khiến việc cài `rg` ở hệ thống trở thành một phụ thuộc của máy chủ. `PATH` mặc định trên Windows và trong image container không có `rg`, nên công cụ biến mất trong im lặng ở đó; bên triển khai chỉ phát hiện điều này qua cảnh báo của bộ dò lúc nạp. Seam bash còn buộc toàn bộ bề mặt tham số mà mô hình thấy được phải đi qua một tiện ích trích dẫn shell, vì giữa công cụ và ripgrep còn xen một lớp shell — [quyết định chạy trên bash](../../archived/feature/2026-07-09-bash-backed-grep-glob-discovery.md) đã ghi nhận sự ràng buộc này như một đánh đổi của v1, và liệt kê spawn trực tiếp là bước tiếp theo hợp lý một khi miền chuỗi shell được chứng minh là quá nhạy cảm. Và điều đó đã được chứng minh: mọi giá trị của mô hình đều phải chịu escape dấu nháy đơn POSIX, bộ dò phải được script hóa trong test, còn việc phân loại timeout của chính bộ thực thi lại trùng trách nhiệm với chính sách timeout công cụ theo kiểu hợp tác đã có sẵn.

## Quyết định

`@deepseek-ai/dsh-tool-fs-search` nay chạy binary ripgrep PACKAGED (được đóng gói) (`@vscode/ripgrep`, một phụ thuộc npm với các package nền tảng tùy chọn kèm sẵn binary), thông qua seam `ctx.subprocess`: `runRipgrep()` spawn `rgPath` bằng một vector argv thuần, có tiền tố `--no-config`, kèm stdout/stderr ở chế độ collect, `graceMs` và `exec.signal` được chuyển tiếp. `rgPath` được phân giải lười ở lần gọi đầu tiên (memoize trong tiến trình): `@vscode/ripgrep` phân giải package nền tảng của nó ngay khi module được lượng giá, nên import tĩnh sẽ biến việc thiếu/hỏng package nền tảng (`--omit=optional`, cài đặt không đầy đủ) thành lỗi nạp tổ hợp của Loader — và đây đúng là chế độ hỏng lúc nạp mà thay đổi lần này muốn loại bỏ. Không còn lớp shell, nên ranh giới trích dẫn shell trên đường thực thi cũng biến mất; tiện ích `singleQuote` bị xóa cùng với các test spawn shell của nó. Luồng thô dùng dạng collect phần đuôi chẩn đoán của seam (không có file spill — công cụ không bao giờ đọc đường dẫn spill thô; đọc stdout mất mát sẽ thất bại với `SEARCH_RAW_OUTPUT_OVERFLOW`). Thời gian ân hạn khi kết thúc và ngân sách phần đuôi stderr trở thành các trường `Config` được kiểm tra (`graceMs` mặc định 3000, `stderrMaxBytes` mặc định 64 KiB), không còn kế thừa từ cấu hình bash-local. Việc đăng ký trở thành vô điều kiện — bộ dò `command -v rg` lúc nạp và quyết định đăng ký có điều kiện đã bị xóa, cùng với cảnh báo "rg not found". Package này inject `tools`, `systemPrompt` và `subprocess`.

Ngữ nghĩa thoát vẫn do công cụ sở hữu: mã thoát 0 là thành công có kết quả, 1 là tìm kiếm thành công nhưng rỗng, phần còn lại quy về bộ từ vựng `SEARCH_*` có sẵn (pattern không hợp lệ, khởi động thất bại, bị tín hiệu giết, tràn đầu ra thô). Timeout là ngân sách gọi công cụ theo kiểu hợp tác gắn trên định nghĩa công cụ: `@deepseek-ai/dsh-tool-call-timeout-policy` hủy `exec.signal`, phần leo thang kết thúc của seam subprocess cung cấp việc kết thúc cứng, và công cụ báo `SEARCH_ABORTED`. Thư mục làm việc là cwd trong header của session (khi có), nếu không thì là `process.cwd()` — không còn cấu hình bộ thực thi nào để đặt mặc định, nên công cụ tự sở hữu phương án dự phòng.

Kịch bản snapshot ACP (Agent Client Protocol) `fs-glob-sampling` chuyển sang chạy binary đóng gói thật, tác động lên một workspace dựng sẵn có mtime cố định để ghim thứ tự `--sort=modified`, thay cho bản `rg` giả được tiêm vào PATH (chỉ POSIX: đường dẫn hiển thị mang dấu phân tách `/`, việc so sánh session log không thể chuẩn hóa được).

## Phương án thay thế

**Giữ seam bash và bộ dò, chỉ ghi nhận `rg` là phụ thuộc bắt buộc của máy chủ.** Bị bác: phụ thuộc vào máy chủ chính là chế độ hỏng mà thay đổi lần này muốn loại bỏ, còn mục đích của việc này chính là để công cụ khám phá hỗ trợ Windows; một phụ thuộc được ghi vào tài liệu thì vẫn là phụ thuộc.

**Cho phép inject `rgPath` (trường cấu hình hoặc biến môi trường ghi đè), để test và snapshot tiếp tục dùng binary giả.** Bị bác: cách này thêm một bề mặt triển khai công khai mà chỉ có hook test tiêu thụ, trong khi bản binary thật vốn đã đủ tất định — chỉ cần ghim qua mtime của fixture (dữ liệu chuẩn bị cho test) là được; binary đóng gói chính là hình thái triển khai, và test nên kiểm thử chính nó.

**Chuyển sang engine glob/tìm kiếm thuần JS (như `picomatch`/`tinyglobby`).** Bị bác: [đợt kiểm toán thay thế phụ thuộc](../../rejected/simplification/2026-07-26-dependency-swaps-rejected-by-nih-audit.md) đã bác hướng này dựa trên bằng chứng «không tồn tại engine glob nào tương đương»; ngữ nghĩa của ripgrep (`--sort=modified`, cắt tỉa theo VCS, truyền tải JSON, phương ngữ regex) chính là quy ước của công cụ.

## Hệ quả

- Công cụ khám phá chạy được ngay trên mọi nền tảng mà binary đóng gói bao phủ (darwin/linux/win32, x64/arm64), không cần cài đặt trên máy chủ; danh sách công cụ TUI/Web được bàn giao đưa `glob`/`grep` thành thành viên cố định (xem [san bằng danh sách công cụ được bàn giao](../feature/2026-07-31-even-out-shipped-tool-rosters.md)).
- Bề mặt tấn công qua chuỗi shell biến mất: pattern độc hại chỉ còn là phần tử argv không có khả năng thực thi, và điều này được bộ test tích hợp ghim lại; bộ test đó nay cũng chạy trên Windows (trước đây nó tự bỏ qua khi không có `rg` hệ thống).
- Việc spawn không bị ràng buộc bởi sandbox (chỉ là lời gọi `ctx.subprocess` thông thường), nên phải có tiền tố `--no-config`: nếu không, `RIPGREP_CONFIG_PATH` của máy chủ (hoặc file `rg.conf` nằm cạnh binary) có thể tiêm bộ tiền xử lý `--pre`, thực thi lệnh tùy ý trên mỗi file khớp. Khi có `--no-config`, không file cấu hình nào — và do đó không bộ tiền xử lý nào — chạm được tới việc tìm kiếm.
- Hình thái của đường tràn đầu ra thô thay đổi: đường chạy trên bash cũ kế thừa cơ chế spill luôn bật của bash-local, có thể để lại các file tạm nhiều MB mà không ai đọc; seam subprocess nay thu thập không spill, và tràn là lỗi thuần túy (`SEARCH_RAW_OUTPUT_OVERFLOW`, "narrow pattern, path, or include and retry"), không trả về nội dung nào.
- Chế độ hỏng lúc nạp thay đổi: seam subprocess bị hỏng nay làm lời gọi tìm kiếm đầu tiên thất bại (`SEARCH_FAILED`), thay vì làm plugin không nạp được thông qua bộ dò; thiếu binary là lỗi khởi động kèm đường dẫn đóng gói, chứ không phải vấn đề PATH.
- Fixture của bộ test tích hợp đã bỏ các tên file mà Windows không biểu diễn được (tên chứa `"`), đảm bảo bộ test phát lại được trên mọi nền tảng.
- Việc sinh lại `THIRD_PARTY_NOTICES.md` đã phơi bày một bug tiềm ẩn của bộ sinh do phụ thuộc mới kéo ra: `fs.globSync` của Node trả về dấu phân tách gốc của hệ điều hành, nên trên Windows các tiền tố khu vực dev có hậu tố `/` trong phân tầng notices không bao giờ khớp, khiến các package chỉ dùng cho dev (công cụ test, các leaf support) bị phân loại nhầm thành runtime. Bộ sinh nay chuẩn hóa đường dẫn manifest (bản kê siêu dữ liệu) ngay tại điểm vào, và notices trở nên độc lập nền tảng.
- Phụ thuộc `@vscode/ripgrep` bổ sung dòng MIT của nó vào tầng runtime; tên thư mục virtual store bị pnpm 11 cắt ngắn đòi hỏi thêm một phương án dự phòng quét nội dung trong bước tra cứu siêu dữ liệu của bộ sinh notices.
