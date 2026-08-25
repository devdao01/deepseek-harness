# Agent Note: Mọi thay đổi thực chất đều phải đi kèm Agent Note

Status: implemented

[English](2026-07-19-require-agent-notes-for-non-trivial-changes.md) | 中文

## Vấn đề

Nếu chỉ ghi Agent Note khi quyết định được cho là lâu dài, gây tranh cãi và bất ngờ, thì các thay đổi thực chất có thể được triển khai mà không lưu lại căn cứ ra quyết định. Code và test có thể cho thấy nội dung thay đổi, nhưng không thể lưu giữ ổn định lý do vì sao một phương án được chọn, các phương án khác đã bị loại bỏ, và chi phí mà maintainer đã chấp nhận.

## Quyết định

Mỗi thay đổi thực chất đều thêm mới hoặc cập nhật ít nhất một Agent Note trong cùng một PR (Pull Request). Thay đổi thực chất bao gồm: hành vi, kiến trúc, quy ước xuyên file hoặc xuyên package, process hoặc tooling, chiến lược test, định dạng lưu trữ trên đĩa, định dạng protocol (wire format) hoặc định dạng cấu hình, và các quyết định khác mà maintainer có thể hợp lý muốn xem lại.

Cập nhật một Agent Note đã đang giữ quyết định đó là đủ để thỏa mãn quy tắc; chỉ thêm mới khi không có Agent Note nào đang giữ quyết định đó. Các chỉnh sửa hoàn toàn cơ giới hoặc cục bộ, không thay đổi hành vi, quy ước, cấu trúc, process hay căn cứ ra quyết định thì được miễn. [Agent Notes README](../../README.md#when-to-write-one) giữ ranh giới này, còn `AGENTS.md` ở thư mục gốc mang chỉ thị thường trực.

Chỉ khi bản ghi hiện đang giữ quyết định đó đã lưu giữ đầy đủ căn cứ ra quyết định riêng biệt, các phương án khác, ảnh hưởng, quy ước xác minh và khoảng trống bao phủ được nêu rõ, thì một Agent Note đã implemented bị thay thế hoàn toàn mới được gộp vào bản ghi đó rồi xoá đi. Cùng thay đổi đó cũng phải sửa các liên kết trỏ đến, và xoá file đối chiếu tiếng Trung cùng bản ghi đi kèm. Khi chỉ bị thay thế một phần, hai bản ghi vẫn cần liên kết với nhau và nhất quán với hiện trạng; việc gộp không viết lại quyết định cũ thành quyết định đối lập, cũng không để lịch sử git trở thành bản sao duy nhất của căn cứ ra quyết định.

Khi một quyết định sau này loại bỏ hoàn toàn một tính năng trước đó, chỉ khi tính năng đó đã biến mất khỏi code sản phẩm, cấu hình, schema, định dạng lưu trữ hoặc protocol, hành vi migration và tương thích, tài liệu hiện tại không còn mô tả nó là khả dụng, và không có test nào thực thi nó như một hành vi được hỗ trợ, thì bản ghi loại bỏ mới trở thành bản ghi hiện đang giữ quyết định. Căn cứ của quyết định loại bỏ và các test xác minh tính năng đó không còn tồn tại có thể được giữ lại. Bản ghi phải giữ lại động lực ban đầu của tính năng đó, vì sao động lực đó không còn đủ để tiếp tục giữ tính năng, các phương án khác ngoài việc loại bỏ hoàn toàn, năng lực đã từ bỏ, điều kiện để tái giới thiệu, và bằng chứng xác minh việc loại bỏ đã triệt để. Danh sách triển khai và test chỉ mô tả hành vi đã bị xoá thì đã lỗi thời, không thuộc về quy ước xác minh hiện hành. Chỉ loại bỏ một transport, một giá trị mặc định, một cách triển khai hoặc một cách hiển thị vẫn thuộc dạng bị thay thế một phần.

Review chịu trách nhiệm thực thi ranh giới ngữ nghĩa này. Automation gate không cố phân loại diff là tầm thường hay thực chất, vì vậy chính sách này không làm tăng thêm stage hay thời gian chạy gate.

## Phương án khác

**Chỉ yêu cầu Agent Note cho những quyết định được đánh giá là lâu dài, gây tranh cãi và bất ngờ.** Ngưỡng này quá chủ quan, thay đổi thực chất có thể bị coi là hiển nhiên hoặc cục bộ, từ đó làm mất căn cứ ra quyết định mà Agent Note lẽ ra phải lưu giữ.

**Mọi thay đổi đều phải thêm mới Agent Note.** Khi Agent Note hiện có đã giữ quyết định đó, cách này tạo ra bản ghi trùng lặp, và khiến các chỉnh sửa hoàn toàn cơ giới phải gánh một gánh nặng process rỗng.

**Giữ vĩnh viễn mọi Agent Note đã bị thay thế hoàn toàn.** Miễn là quyết định cũ vẫn còn áp dụng một phần thì cần giữ các bản ghi liên kết với nhau; nhưng một Agent Note đã implemented mà mất hiệu lực hoàn toàn thì mâu thuẫn với quy ước ghi lại trạng thái hiện hành, và lặp lại căn cứ ra quyết định vốn có thể chỉ cần một bản ghi giữ.

**Thêm lifecycle `superseded/`.** Thêm lifecycle mới vẫn giữ lại các bản ghi lỗi thời và mở rộng cây thư mục, gate định dạng và quy tắc bảo trì, nhưng không giảm được nội dung trùng lặp.

**Viết lại Agent Note cũ thành quyết định thay thế nó.** Cách này sẽ xoá bỏ ranh giới quyết định và các phương án đã bị nó phủ quyết. Cách gộp đúng là để bản ghi hiện đang giữ quyết định lưu lại các sự kiện này trước khi xoá file lỗi thời.

**Giữ lại mọi chi tiết triển khai và test của tính năng đã bị loại bỏ.** Cách này sẽ tái tạo bản ghi lỗi thời trong bản ghi thay thế. Bản ghi hiện đang giữ quyết định loại bỏ chỉ giữ căn cứ ra quyết định và xác minh cần thiết để hiểu hoặc xem lại trạng thái đã loại bỏ hiện tại, còn cơ chế đã bị xoá vẫn có thể xem qua lịch sử git.

**Thêm gate CI phân loại diff.** Kiểm tra cơ giới không thể tin cậy phán đoán một thay đổi ngữ nghĩa có tầm thường hay không, gate thêm vào còn làm tăng thời gian chạy, và tạo ra false positive hoặc tuân thủ hình thức.

## Ảnh hưởng

- Mỗi thay đổi thực chất đều lưu giữ căn cứ ra quyết định và các phương án đã bị loại bỏ ngay bên cạnh phần triển khai.
- Contributor bảo trì bản ghi hiện đang giữ quyết định thay vì tạo bản ghi trùng lặp.
- Các bản ghi đã bị thay thế hoàn toàn có thể được gộp vào một bản ghi hiện đang giữ quyết định, mà không mất căn cứ ra quyết định riêng biệt hay quy ước xác minh.
- Tính năng bị loại bỏ về sau có thể chỉ có một bản ghi hiện đang giữ quyết định, mà không cần tiếp tục giữ danh sách triển khai và test đã lỗi thời.
- Trường hợp chỉ bị thay thế một phần vẫn cần ghi rõ ràng và liên kết với nhau; xoá bản ghi thì phải dọn liên kết và cặp song ngữ trong cùng thay đổi.
- Các chỉnh sửa cơ giới vẫn nhẹ nhàng, topology gate và thời gian chạy vẫn không đổi.
