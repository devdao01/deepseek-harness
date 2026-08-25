# Agent Note: Gộp module trợ giúp UI stdio vào ứng dụng stdio

Status: implemented
Archived: 2026-07-26

[English](2026-07-04-fold-stdio-ui-helper.md) | Tiếng Việt

Việc [gỡ bỏ agent (tác tử) dư thừa](2026-07-20-remove-stdio-and-echo-agents.md) về sau đã thay thế quyết định bố trí package này, và gỡ bỏ hoàn toàn package đã hợp nhất, ứng dụng cùng bề mặt hướng theo dòng.

## Vấn đề

UI readline từng là một package hoàn chỉnh (`@deepseek-ai/dsh-ui-stdio` nằm dưới `packages/support/`), và bên import lúc chạy duy nhất của nó là package ứng dụng `@deepseek-ai/dsh-stdio-demo`. Các ví dụ dùng UI readline bằng cách nạp ứng dụng, chứ không bao giờ tự lắp ráp module trợ giúp đó; mọi tham chiếu khác trong kho mã đều là bề mặt máy móc hoặc mô tả tồn tại chỉ vì ranh giới package tồn tại: các mục manifest (bản kê metadata) và tsconfig, dòng module-graph được sinh ra, dòng trong đồ thị phụ thuộc và README, cùng các chú thích tài liệu gọi tên package đó. README của nhóm ui ghi lại lý do đặt trong support ("chủ yếu tồn tại cho ví dụ và cổng kiểm độ bao phủ, còn `ui/` dành cho những giao diện được giao như sản phẩm"), điều này để lại một mâu thuẫn dai dẳng: một ứng dụng sản phẩm đã được giao lại phụ thuộc vào một package support được đánh dấu rõ ràng là bề mặt phi sản phẩm.

Cái giá đổi lấy ranh giới này là: metadata package, các tham chiếu workspace và tsconfig, dòng module-graph, mục README, cùng bề mặt publint — tất cả phục vụ một module trợ giúp vốn không thể thay thế độc lập: cụm cửa trước của ứng dụng stdio luôn bao gồm UI readline, và không consumer nào khác dùng nó một cách có ý nghĩa.

## Quyết định

Khi đó, hàm trợ giúp này chuyển vào `@deepseek-ai/dsh-stdio`, trở thành plugin kênh terminal. `createStdioChat`, seam kiểm thử `StdioRuntime` của nó cùng các bài kiểm thử đơn vị cũng di chuyển theo, khiến việc xử lý EOF, dựng hình, giải phóng và hành vi pipe/TTY tiếp tục chịu ràng buộc của cổng kiểm độ bao phủ theo từng tệp, mà không chiếm dụng các biến toàn cục của tiến trình. Module này giữ nguyên hình dạng export có tên `name`/`inject`/`Config`/`apply` mà phần gắn kết ứng dụng tiêu thụ; các bài smoke của Echo và REPL Loader khi đó chứng minh cây lắp ráp, còn bộ kiểm thử hình dạng plugin cố định hành vi `unwrapExports` tường minh. Bản ghi gỡ bỏ thay thế bài này ở phía trên chịu trách nhiệm về trạng thái package và ví dụ hiện tại.

Package trợ giúp support thời kỳ đầu đã bị gỡ: manifest, tham chiếu tsconfig, dòng đồ thị module và dòng README của nó đều biến mất, phần tài liệu còn lại chuyển sang mô tả module nằm trong package.

## Các phương án từng cân nhắc

### Vì sao không nâng nó lên `ui/` mà lại gộp vào?

Việc nâng lên có thể giải quyết sự lệch pha giữa support và product mà vẫn giữ ranh giới — chỉ đúng đắn khi UI readline là một tích hợp có thể thay thế độc lập hoặc khi có bên lắp ráp thứ hai, mà cuộc rà soát consumer cho thấy không có cả hai. Cầu nối ACP (Agent Client Protocol) có cấu trúc vẫn giữ là package riêng, vì nó là bề mặt giao thức tự động hóa với contract riêng và tầng snapshot riêng; còn module trợ giúp readline chỉ là giàn giáo cho cửa trước của một ứng dụng. Việc tách lại trước khi phát hành có chi phí thấp: nếu tương lai có ứng dụng sản phẩm thứ hai cần UI readline, khi đó hãy tách ra, và để chính consumer ấy định hình contract của package.

## Hệ quả

- Ứng dụng stdio sở hữu trọn vẹn cửa trước của mình; `cordis.yml` lá vẫn chỉ nạp một package ứng dụng, hình thái của bản demo không thay đổi.
- Nếu tương lai có một UI terminal độc lập cần dùng module trợ giúp này dưới dạng package, thì chính consumer thứ hai đó sẽ thúc đẩy việc đưa nó trở lại, chứ kho mã không giữ sẵn một ranh giới cho khả năng tái sử dụng giả định.
