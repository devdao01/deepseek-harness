# Agent Note: Pipeline khôi phục JSONL cho session lớn

Status: implemented

[English](2026-08-05-large-session-jsonl-restore-pipeline.md) | Tiếng Việt

## Vấn đề

Khôi phục một session đã lưu trữ sẽ kích hoạt session đó và vật chất hóa nhật ký sự kiện đầy đủ, có thẩm quyền trước khi agent chạy. Khi xử lý các artifact JSONL lớn, thao tác một lần này phát sinh vài khoản chi phí không cần thiết: mỗi frame Zstandard độc lập đều tạo rồi đóng một decode context; phần plaintext sau khi giải mã được gộp thành buffer và chuỗi của toàn bộ nhật ký, rồi bị quét lại nhiều lần; các sự kiện vừa được parse còn đi qua các đường snapshot và deep freeze tổng quát vốn được thiết kế cho giá trị mượn hoặc giá trị có tham chiếu vòng.

Một hồ sơ hiệu năng tiêu biểu gồm 61,8 MiB dữ liệu Zstandard, 97,1 MiB plaintext và 1.307.073 sự kiện. Đường khôi phục phải giảm chi phí CPU và bộ nhớ, đồng thời vẫn giữ việc xác minh checksum, phát hiện hỏng dữ liệu ở vùng đã commit, khôi phục phần đuôi bị rách, kiểm tra thứ tự và `surface`, cùng tính bất biến của nhật ký session.

## Quyết định

Quá trình khôi phục là một pipeline chuyển giao quyền sở hữu, đi từ artifact được lưu trữ vào `Session.fromRestore`. Artifact nén vẫn nằm lại làm buffer nguồn, nhưng các giai đoạn giải mã và quét sẽ tiêu thụ tăng dần đầu ra của giai đoạn trước, không giữ lại plaintext hay bản sao đã parse của toàn bộ nhật ký; mảng sự kiện cuối cùng là biểu diễn đã giải mã đầy đủ duy nhất.

### Giải mã frame

Bộ quét cấu trúc Zstandard sẽ nhận diện phạm vi các frame hoàn chỉnh trước khi giải mã. Hệ thống giải mã riêng frame đầu tiên chuyên dụng và parse nó thành phần header của session, còn các frame plaintext tiếp theo được sinh ra theo thứ tự và đưa vào bộ quét JSONL.

`ZstdFrameDecoder` cung cấp một vòng đời thống nhất cho các hiện thực đồng bộ có thể hoán đổi cho nhau. Hiện thực được ưu tiên sẽ dò cấu trúc luồng của Node 22, 24 và 26 được hỗ trợ, tái sử dụng một decode context native riêng tư cùng buffer tạm cho tất cả các frame hoàn chỉnh, và cuối cùng chỉ đóng một lần. Nếu cấu trúc riêng tư không khả dụng, factory sẽ chọn hiện thực dùng `zstdDecompressSync` công khai và giữ nguyên các quy ước về iterator cùng lỗi checksum. Các view tạm do iterator sinh ra sẽ được tiêu thụ trước khi bước sang vòng lặp kế tiếp.

Sau khi tổng thời gian xử lý frame đạt khoảng 500 ms, bộ đọc bất đồng bộ sẽ nhường event loop tại ranh giới frame kế tiếp và quan sát tín hiệu hủy trước khi tiếp tục. Từng frame riêng lẻ vẫn là một thao tác đồng bộ không thể chia nhỏ. Frame hoàn chỉnh phải vượt qua kiểm tra kết thúc frame và checksum; chỉ frame cuối cùng không hoàn chỉnh về mặt cấu trúc mới dùng bộ giải mã tiền tố sẵn có để khôi phục.

### Quét JSONL tăng dần

`SessionLogScanner` dùng `Buffer.indexOf(0x0A)` để tìm ký tự xuống dòng trong buffer thô, chỉ chuyển các bản ghi hoàn chỉnh sang UTF-8 rồi giao cho `JSON.parse`. Bộ quét giữ lại bản ghi chưa hoàn chỉnh xuyên qua các lần ghi giải mã; vì bộ giải mã riêng tư có thể tái sử dụng buffer đầu ra, nó chỉ sao chép đúng đoạn này. Quá trình quét không dựng buffer hay chuỗi plaintext của toàn bộ nhật ký, cũng không dựng mảng dòng hay mảng bản ghi đã parse thứ hai.

Bộ quét dừng giữ lại sự kiện sau khi gặp bản ghi đầu tiên không parse được hoặc gặp lỗ hổng thứ tự, nhưng vẫn tiếp tục kiểm tra các bản ghi hoàn chỉnh phía sau. Nếu sau đó xuất hiện `turn/end`, điều đó cho thấy vấn đề nằm trong vùng đã commit và hệ thống sẽ từ chối nhật ký này. Sau khi xử lý xong tất cả frame hoàn chỉnh, nếu vẫn còn lỗi parse, lỗi thứ tự hoặc bản ghi dở dang chưa được giải quyết, bộ đọc Zstandard cũng sẽ từ chối nhật ký; chỉ frame cuối cùng bị rách về mặt cấu trúc mới có thể cung cấp phần hậu tố khôi phục được. Các bản ghi hoàn chỉnh sinh ra từ frame bị rách đó vẫn đi qua chính bộ quét này và giữ nguyên ngữ nghĩa về offset sửa chữa cùng sự kiện khôi phục sẵn có.

### Điều kiện nạp khi khôi phục

Lớp persistence chuyển giao các giá trị JSON vừa được vật chất hóa cho `Session.fromRestore`. Đây là những cây đã tách rời và không có vòng, còn các dòng phân mảnh được đóng gói cũng được bung ra thành sự kiện được cấp phát mới. Vì vậy, đường chuyên dụng cho khôi phục dùng một lần `for...in` cùng `switch` để kiểm tra phong bì sự kiện cố định, thực hiện kiểm tra hình dạng dữ liệu hiện tại theo trường phân biệt của sự kiện, và đóng băng đồ thị đối tượng thuộc sở hữu bằng cách duyệt qua mảng `pending` tường minh, không dùng tập hợp theo dõi vòng lặp. Việc kiểm tra `surface` ghi lại một kế hoạch chuyển đổi duy nhất; khi chính sự kiện ứng viên đó đi vào nhật ký, hệ thống commit thẳng kế hoạch ấy, không lập kế hoạch hai lần cho cùng một sự kiện.

Giá trị `seed` được mượn ở đường tạo mới thông thường và đường fork vẫn tạo snapshot JSON, và vẫn dùng deep freeze tổng quát có hỗ trợ phát hiện vòng. Do đó, chuyên biệt hóa này chỉ thay đổi việc khôi phục từ dữ liệu bền vững, không nới lỏng yêu cầu nạp cho mọi giá trị của phía gọi.

## Các phương án đã cân nhắc

- **Thực hiện một thao tác native bất đồng bộ cho mỗi frame**: không áp dụng, vì với những nhật ký gồm nhiều lô persistence nhỏ, chi phí lập lịch và callback sẽ chiếm phần chủ đạo. Giải mã đồng bộ có tính hợp tác chỉ trả loại chi phí này tại các ranh giới nhường định kỳ.
- **Xử lý đồng bộ toàn bộ nhật ký mà không nhường event loop**: không áp dụng, vì trong suốt quá trình khôi phục sẽ không thể phản hồi lệnh hủy hay đẩy event loop tiến lên. Cơ chế nhường tại ranh giới frame giữ được các điểm quan sát có giới hạn mà không cần chia nhỏ thao tác codec.
- **Nối toàn bộ plaintext trước khi quét**: không áp dụng, vì phương án này sẽ đồng thời giữ đầu vào đã nén, plaintext đầy đủ, chuỗi UTF-8 của toàn bộ nhật ký, metadata dòng và các bản ghi đã parse, đồng thời quét lại phần tiền tố của frame bị rách.
- **Tự viết một bộ parse JSON dạng streaming**: không áp dụng, vì JSONL đã cung cấp sẵn ranh giới bản ghi; dùng tìm kiếm ký tự xuống dòng native cùng `JSON.parse` là đủ để loại bỏ các cấu trúc trung gian lớn, không cần tự bảo trì thêm một bộ parse khác hay thay đổi ngữ nghĩa JSON.
- **Dùng chung một `WeakSet` khi đóng băng sự kiện khôi phục**: không áp dụng, vì việc vật chất hóa JSON không thể sinh ra tham chiếu vòng, trong khi tập hợp này thêm một lần tra cứu cho mỗi đối tượng và giữ toàn bộ đồ thị đối tượng trong suốt quá trình duyệt.
- **Bỏ qua kiểm tra hoặc đóng băng giá trị khôi phục**: không áp dụng, vì lưu trữ bền vững là một ranh giới runtime, còn `Session.events` cam kết lịch sử đã tiếp nhận là bất biến. Đường tối ưu chuyên biệt hóa các thao tác này dựa trên những dữ kiện sở hữu mạnh hơn, chứ không loại bỏ chúng.

## Hệ quả

Trên hồ sơ hiệu năng tiêu biểu, việc quét tăng dần giảm thời gian quét JSONL từ khoảng 598 ms xuống 397 ms, và giảm RSS đỉnh từ khoảng 1.494 MiB xuống 1.060 MiB. Điều kiện nạp khi khôi phục giảm `Session.fromRestore` từ 604–608 ms xuống khoảng 263 ms, trong đó `assertSessionEventEnvelope` giảm từ khoảng 77 ms xuống 13 ms. Những số liệu này dùng để mô tả đầu vào tối ưu, không phải giới hạn trên tại runtime.

Bộ giải mã nhanh phụ thuộc vào các interface nội bộ của Node được dò tại runtime, nhưng khi interface không tương thích, nó sẽ chuyển sang hiện thực công khai mà không làm thay đổi tính đúng đắn. Hệ thống quan sát tín hiệu hủy tại các điểm nhường ở ranh giới frame theo cơ chế hợp tác; deadline không phải là giới hạn thời gian thực nghiêm ngặt bên trong một frame. Mảng sự kiện đầy đủ vẫn nằm trong bộ nhớ vì đó là nhật ký có thẩm quyền của session đang hoạt động; pipeline này loại bỏ các biểu diễn trùng lặp chứ không phân trang trạng thái đó.

Các bài test buộc phải chạy cả hai hiện thực bộ giải mã, đối chiếu thứ tự frame và hành vi xử lý dữ liệu hỏng, phủ cả việc hủy theo cơ chế hợp tác lẫn khôi phục phần đuôi bị rách, đồng thời giữ nguyên các quy ước sẵn có về phong bì session, `surface` và tính bất biến.
