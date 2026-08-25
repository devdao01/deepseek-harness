# Agent Note: Gradient thương hiệu cho banner khởi động TUI

Status: implemented
Archived: 2026-07-26

[English](2026-07-21-tui-banner-brand-gradient.md) | 中文

## Vấn đề

Banner khởi động của TUI ban đầu render tên sản phẩm `DEEPSEEK` bằng một màu nhấn (accent) phẳng lấy từ bảng màu, nó không mang bất kỳ dấu ấn thương hiệu nào, cũng không giống wordmark trên deepseek.com. Yêu cầu rất rõ ràng: làm cho banner khớp với gradient xanh của logo trang web — chứ không phải tô lại màu cho toàn bộ coding harness.

Banner là giao diện duy nhất quan tâm đến điều này, và nó xung đột với một bất biến (invariant) mang tính chịu tải: bảng màu của TUI được thiết kế có chủ đích để không phụ thuộc theme (theme-agnostic). Nó chỉ dùng 16 mã màu ANSI (SGR) chuẩn và các thuộc tính, để bảng phối màu của terminal người dùng có thể remap từng màu. Cổng kiểm soát (gate) snapshot `themeViolations()` sẽ từ chối bất kỳ ô nào dùng RGB, bảng màu mở rộng, hoặc màu nền tường minh. Không thể dùng 16 màu của bảng để tạo ra một gradient mượt, nhất quán với logo, do đó việc tái tạo nó cần true color (màu thật) 24-bit, và cổng kiểm soát theo thiết kế sẽ đánh dấu nó.

## Quyết định

Banner render `DEEPSEEK` bằng màu chữ (foreground) true color 24-bit theo từng chữ cái, dọc theo gradient thương hiệu của deepseek.com — `#4D6BFE` → `#3982FF` → `#2498FF` — nội suy tuyến tính từng đoạn giữa ba mốc màu này; `HARNESS` giữ nguyên đậm (bold) và dùng màu chữ mặc định. Gradient chỉ áp dụng cho màu chữ, do đó vẫn đọc được trên mọi màu nền terminal, và bị giới hạn trong phạm vi tên sản phẩm của banner. Đây là ngoại lệ duy nhất được chấp thuận cho bảng màu không phụ thuộc theme; mọi giao diện còn lại vẫn giữ ANSI chuẩn và tự thích ứng theo theme.

Gradient được bật/tắt theo `resolved.color && resolved.truecolor`. Khi true color không khả dụng, banner sẽ fallback về màu nhấn xanh sáng phẳng như trước, do đó trừ khi true color được bật tường minh, cả bảo đảm không phụ thuộc theme lẫn các snapshot đã ghi đều không thay đổi.

`truecolor` là một trường `Config` đã qua kiểm chứng (validated), schema không đặt giá trị mặc định. Khi nó chưa được thiết lập, `apply()` sẽ tự động dò từ `COLORTERM` (`truecolor` hoặc `24bit`) ở ranh giới process; giá trị cấu hình tường minh luôn được ưu tiên. Việc dò chỉ đọc `process.env` bên trong `apply()` — không bao giờ trong resolver `resolveTuiConfig` thuần túy — nhờ đó giữ cho resolver là một hàm thuần túy của đầu vào của nó.

Các mốc màu gradient là dấu ấn thương hiệu cố định, được coi như hằng số giao thức, do đó được hardcode trong plugin, chứ không phơi ra như một tùy chọn có thể chỉnh. Việc có *bật* true color hay không thì thay đổi theo terminal và deployment, nên đó mới là trường `Config` đã qua kiểm chứng. Văn bản banner chỉ hướng tới giao diện, không bao giờ vào bất kỳ request model nào, do đó không cần sự kiện session.

## Testing

Một snapshot terminal chuyên biệt `banner-gradient` ghim đầu ra RGB thật theo từng chữ cái trong bộ mô phỏng xterm (`fg=#4d6bfe`…`#2498ff`, mỗi chữ cái đậm). Helper `checkpoint()` dùng chung nhận một cờ `bannerGradient`: chỉ với checkpoint đó, nó khẳng định danh sách vi phạm theme không rỗng, và mọi mục đều kết thúc bằng `rgb-fg` — nghĩa là true color thực sự tồn tại, nhưng bị giới hạn ở màu chữ của banner, không có màu nền hay rò rỉ bảng màu mở rộng. Mọi checkpoint còn lại vẫn giữ assertion nghiêm ngặt `themeViolations()` `.toEqual([])`, do đó rào chắn này được thực thi một cách máy móc. Một unit test `tui.spec.ts` mount đồng thời cả `color` và `truecolor` để bao phủ nhánh gradient của header cũng như các helper `gradientText`/`brandColorAt`.

## Các phương án đã cân nhắc

**Gradient bậc thang an toàn với theme, ghép từ bảng 16 màu.** Xấp xỉ gradient này bằng biến thể xanh sáng của bảng màu sẽ giữ cho banner hoàn toàn không phụ thuộc theme và tránh chạm vào cổng kiểm soát. Nó bị bên yêu cầu từ chối: 16 màu cố định không thể tái tạo một gradient mượt như logo, và yêu cầu rõ ràng là khớp với wordmark của trang web.

**Tô lại toàn bộ bảng màu harness sang xanh.** Yêu cầu ban đầu là "đổi màu harness sang xanh". Nó được thu hẹp lại chỉ còn thay đổi banner; một bảng màu xanh toàn cục sẽ phá vỡ tính không phụ thuộc theme ở khắp nơi chứ không chỉ một giao diện thương hiệu.

**Luôn phát true color.** Nhiều terminal không hỗ trợ 24-bit, sẽ render ra mã thô hoặc mã đã hạ cấp. Dùng cơ chế dò để bật/tắt kèm fallback ANSI giúp banner luôn đúng ở mọi nơi, đồng thời vẫn hiển thị gradient ở nơi được hỗ trợ.

**Dò true color bên trong `resolveTuiConfig`.** Resolver này là một bước điền giá trị mặc định thuần túy, không bao giờ được đọc `process.env`. Việc dò môi trường thuộc về ranh giới process trong `apply()`, nhờ đó giữ cho `mountTui`/`createTuiChat` hoàn toàn được điều khiển bởi đầu vào cấu hình của chúng, và vẫn có thể test đầy đủ khi dùng terminal giả.

## Hệ quả

Giờ đây banner sẽ mang dấu ấn thương hiệu DeepSeek trên các terminal hỗ trợ true color, trong khi bảo đảm không phụ thuộc theme vẫn đúng ở mọi nơi khác — thậm chí ngay trên chính banner khi true color không khả dụng. Cái giá phải trả là một vết nứt hẹp, có ghi chép, trong bất biến không phụ thuộc theme: một giao diện màu cố định không tự thích ứng theo bảng phối màu terminal của người dùng, được chấp nhận vì nó là dấu ấn thương hiệu và chỉ áp dụng cho màu chữ, nhờ đó vẫn đọc được trên cả nền sáng lẫn nền tối. Vết nứt này được canh giữ bởi assertion snapshot `banner-gradient`, nó giới hạn true color ở màu chữ của banner, và sẽ fail ngay khi xuất hiện bất kỳ RGB, bảng màu mở rộng, hay màu nền nào khác.
