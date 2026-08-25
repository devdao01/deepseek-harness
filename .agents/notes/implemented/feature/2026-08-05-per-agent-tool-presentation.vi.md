# Agent Note: Cách trình bày công cụ theo từng agent, và preset `code`

Status: implemented

[English](2026-08-05-per-agent-tool-presentation.md) | 中文

## Vấn đề

agent preset đã có thể lắp ráp công cụ của một agent theo từng phiên, nhưng không kiểm soát được những công cụ này đến với model dưới **hình thái** nào. Code Mode — một công cụ `run_code` cộng với một SDK TypeScript sinh ra, dùng một đoạn chương trình để thay thế cho một chuỗi lời gọi — trước đây là trường `mode` cấp triển khai trên đúng một dòng của host `dsh-tools`. Một lần triển khai hoặc chạy Code Mode cho mọi phiên, hoặc không chạy cho phiên nào cả, nên hình thái sản phẩm hiển nhiên đó (bộ chọn preset có "chế độ mã" đứng cạnh chuẩn/tối giản/sáng tạo) không có chỗ để tồn tại.

Cách đọc theo nghĩa đen "hạ tools xuống mặt phẳng agent" không khả thi. `ctx.tools` có một loạt bên tiêu thụ ở mặt phẳng host không thể theo kịp: `dsh-agent-loop` đọc seam bộ lập lịch riêng của nó, `dsh-apiproxy` đọc presenter của nó để hiển thị thẻ công cụ, và mỗi plugin công cụ đều đăng ký vào đó. Theo chính quy tắc của stack này — chỉ khi **tất cả** bên tiêu thụ cùng hạ xuống thì dịch vụ mới hạ xuống — registry phải ở lại chỗ cũ.

## Quyết định

Tách registry và phần chiếu (projection) của nó ra riêng. Registry ở lại mặt phẳng host; **cách trình bày** trở thành trạng thái nội bộ theo scope của nó, song song với các giới hạn scope và guard vốn đã ở đó.

`ToolRuntime.presentAs(mode)` chỉ nhận ngữ cảnh có scope, hình thái sao chép từ `restrict()`: nó ghi một đơn vị lên `ToolLayer` của scope bên gọi thông qua `ScopedLayers.effect`, do đó sẽ được gỡ cùng với scope đã khai báo nó. Trong giao diện Web đi kèm, scope đó là điểm lắp thường trực của một agent preset — preset `code` mang theo dòng `tool-presentation` — nên một lần khai báo bao trùm mọi agent gia nhập preset đó, và `modeFor(scope)` lấy khai báo gần nhất trên chuỗi scope. Nó được giải quyết cùng `mode` của config, và giá trị này từ đó trở thành mặc định cho "scope chưa khai báo", chứ không còn là sự thật ở cấp tiến trình. Ba nơi đọc trước đây quyết định cách trình bày — wire schema, mục `run_code` trong view khả kiến, và đoạn SDK sinh ra — nay đổi sang đọc chế độ của scope đó, thay vì của dịch vụ.

Có hai hệ quả kéo theo, và cả hai đều mang tính chịu tải:

- **`run_code` được thêm theo scope.** Trước đây chỉ cần truyền tải tồn tại là nó vào mọi view. Sau khi theo-từng-agent, một native agent không thể thấy `run_code` trong bảng phân phối của chính mình chỉ vì một agent khác trong cùng tiến trình trình bày nó — vì vậy việc thêm này có điều kiện là chế độ của chính scope đó, và truyền tải cũng chuyển sang chỉ xây dựng khi cần lần đầu.
- **Tên dành riêng nay có hiệu lực vô điều kiện.** Trước đây `run_code` chỉ bị từ chối đăng ký khi Code Mode được cấu hình. Giờ đây bất kỳ agent nào cũng có thể chọn Code Mode, nên một cái tên có thể tùy ý dùng dưới triển khai native sẽ trở thành xung đột ngay thời điểm một preset lắp nó vào.

Đoạn prompt SDK được đăng ký toàn cục cấp triển khai bởi Code Mode (không đổi), và `presentAs` đăng ký thêm một bản theo scope, bản này che (shadow) bản kia theo tên. Nội dung của nó render rỗng cho scope native, và bộ render prompt bỏ qua đoạn rỗng — chính điều này giúp một agent "từ chối tham gia" dưới triển khai đã bật Code Mode không mang theo đoạn SDK.

Preset diễn đạt lựa chọn này bằng một dòng: `@deepseek-ai/dsh-agent-tool-presentation`, toàn bộ nội dung của nó là một lời gọi `presentAs`. Các chế độ thuộc nhóm code chờ `ctx.codeRuntime` qua `ctx.inject` thay vì giả định nó tồn tại: runtime nằm ở mặt phẳng host, và một dòng đang chờ (pending) chính là "điểm lắp không khả dụng" mà `dsh-agent-presets` đã báo cáo và sẽ chỉ đích danh dòng đó — vì vậy một preset chọn Code Mode trên một triển khai không có runtime sẽ thất bại ở nơi người vận hành có thể can thiệp.

## Phương án thay thế đã cân nhắc

**Dựng thêm một `ToolRuntime` trong isolate realm riêng của preset.** Bác bỏ: `dsh-agent-loop` giải quyết registry từ ngữ cảnh host một lần duy nhất qua một symbol riêng tư, nên registry theo-từng-agent sẽ không khả kiến với bộ lập lịch. Sửa loop để giải quyết registry theo từng agent là thay đổi lớn hơn nhiều so với biến một trường thành nhận biết scope.

**Thêm một khóa cấp cao nhất vào YAML riêng của preset.** Bác bỏ, lý do giống với việc metadata hiển thị của preset rơi vào `preset.yml` riêng: việc lắp ráp là một danh sách dòng plugin cấp cao nhất, không chứa được các khóa song song.

**Đặt tên gói là `dsh-tool-mode`.** Bị một gate bác bỏ, và gate đó đúng. `gen-tool-catalog` khớp mẫu `packages/*/tool-*` và yêu cầu mỗi kết quả khớp công bố một schema công cụ hướng tới model — vì trong repo này, tiền tố đó nghĩa là "có mang công cụ". Trong khi dòng này không mang công cụ nào.

**Đăng ký đoạn SDK vô điều kiện trong constructor.** Đã thử rồi bác bỏ: `renderPrompt` bỏ qua đoạn rỗng, nhưng `PromptAssembly.sections` vẫn giữ chúng, nên mỗi triển khai native sẽ mang theo một mục `tools:sdk` không render gì cả, và hai assertion sẵn có buộc phải nới lỏng vì điều này.

**Dùng include để chia sẻ phần lắp ráp của `standard`.** Bác bỏ theo đúng quy ước của stack này: `cordis` đã sao chép một bản `standard`, và giá trị của preset chính là ở chỗ toàn bộ phần lắp ráp có thể đọc hết trong một file. Cái giá — bản sao thứ ba khoảng 240 dòng, phải tiến hóa đồng bộ — là có thật, và chính là luận điểm mạnh nhất cho việc đưa cơ chế include vào trong tương lai.

## Hệ quả

Hai phiên trong cùng một tiến trình giờ có thể có cách trình bày khác nhau, nên "model thấy những công cụ nào" không còn trả lời được chỉ bằng cấu hình triển khai — phải kèm theo agent. Bất kỳ chẩn đoán nào tham chiếu chế độ giờ đều tham chiếu chế độ của scope đó, chứ không phải của dịch vụ.

`ctx.tools.schemas(agent)` vẫn là danh sách **năng lực** của agent đó, không bị ảnh hưởng bởi cách trình bày — chỉ có phần trong assembly là sụp lại (collapse). Các bài test khẳng định "model nhận được gì" phải đọc assembly; `web-agent-presets.spec.ts` khẳng định cả hai phía của sự phân biệt này trên preset `code` đi kèm.

Danh sách preset đi kèm trở thành bốn preset (chuẩn/mã/tối giản/sáng tạo), nên bất kỳ golden nào liệt kê chúng cũng sẽ thay đổi. Triển khai chưa lắp ráp runtime code không thể lắp ráp bất kỳ preset chế độ code nào; overlay Web đi kèm có mang một cái, còn phần lắp ráp cơ sở thì không.
