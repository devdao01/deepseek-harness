# Mổ xẻ sự cố (postmortem) 0004: thông báo thực thi từng phần của Landlock khiến thất bại của tiến trình con bị phân loại sai

[English](0004-landlock-partial-notice-misclassified-child-failures.md) | Tiếng Việt

Status: resolved

## Tóm tắt

Trên các kernel có ABI Landlock cũ hơn, launcher sẽ in ra một thông báo vô hại về việc thực thi từng phần trước khi chạy mỗi tiến trình con. harness đã kết hợp tiền tố `landlock-run:` dùng chung với bất kỳ mã thoát khác 0 nào của tiến trình con để phán định đó là lỗi launcher, do đó những kết quả bình thường như ripgrep thoát với mã 1 khi không có kết quả khớp lại bị hiển thị thành `SANDBOX_UNAVAILABLE`; lúc đó, phần tìm kiếm hệ thống tệp vẫn còn dựa trên bash sẽ che khuất lỗi có cấu trúc này bằng `SEARCH_FAILED`. Các quy tắc nhận dạng quá rộng, cùng với việc thiếu bộ test tổ hợp bao phủ trường hợp thực thi từng phần trên ABI cũ hơn, đã để lỗi này lọt qua. Việc phân loại của runner giờ đây sẽ loại trừ chính xác các dòng mang tính thông tin trước, sau đó mới yêu cầu bằng chứng gây tử vong được cổng hóa (gated) bởi trạng thái thoát, và một kịch bản không cần khóa (keyless) đã lắp ráp xong sẽ cố định đường dẫn bash vẫn còn tồn tại. Tìm kiếm hệ thống tệp chạy ripgrep đã đóng gói qua subprocess seam, không đi qua bash đã sandbox hóa.

## Tổng quan

Quy ước launcher gốc phân biệt hai loại dòng stderr. Khi kernel chỉ có thể thực thi từng phần, nó sẽ in chính xác dòng `landlock-run: partial enforcement (older Landlock ABI)`, sau đó tiếp tục chạy tiến trình con. Khi launcher thất bại, nó in một dòng chẩn đoán `landlock-run:` khác, thoát với mã 125 mà không chạy tiến trình con.

harness biểu diễn cả hai trường hợp bằng một chuỗi con `landlock-run: ` không phân biệt hoa thường. Bên tiêu thụ chỉ cần thấy mã thoát khác 0 kèm chuỗi con đó là phân loại thành lỗi runner. Do đó, trạng thái thoát của tiến trình con đã bị gắn nhầm với dòng mang tính thông tin của launcher: `false`, mã thoát 1 của ripgrep khi không khớp, mã thoát 2 khi pattern không hợp lệ, thậm chí mã thoát 125 do chính tiến trình con lựa chọn, đều có thể bị quy nhầm thành lỗi sandbox trong khi cả việc ràng buộc lẫn việc thực thi đều thành công.

Khi sự cố xảy ra, tìm kiếm hệ thống tệp còn gây ra một lỗi quy nhầm thứ hai. Lúc đó, `runRipgrep()` dựa trên bash sẽ bắt mọi lỗi mà executor bash ném ra ngoại trừ hủy bỏ (abort), và thay bằng một `SEARCH_FAILED` chung chung nói về cwd hay việc khởi động shell, bao gồm cả lỗi `SandboxUnavailableError` có cấu trúc do executor sandbox tạo ra.

## Ảnh hưởng

Trên các máy chủ mà ABI Landlock chỉ có thể thực thi từng phần, kết quả hợp lệ khác 0 của tiến trình con có thể biểu hiện như lỗi hạ tầng sandbox. `glob` và `grep` đặc biệt dễ lộ vấn đề này, vì ripgrep dùng mã thoát 1 để biểu thị tìm kiếm rỗng thành công. Khi lỗi sandbox thực sự xảy ra trong tìm kiếm hệ thống tệp, bên gọi cũng mất đi mã lỗi `SANDBOX_UNAVAILABLE` của mình, thay vào đó nhận một chẩn đoán khởi động sai.

Lỗi này không làm suy yếu việc ràng buộc, cũng không khiến lệnh chạy ở trạng thái không bị ràng buộc. Ảnh hưởng an toàn của nó nằm ở tính khả dụng và tính toàn vẹn của chẩn đoán: kết quả bị giới hạn hợp lệ bị từ chối hoặc gắn nhãn sai.

## Dòng thời gian

- Quy ước launcher gốc quy định: launcher thất bại dùng mã thoát 125, mỗi lần thất bại như vậy in một dòng chẩn đoán `landlock-run:` mang tính gây tử vong; khi chạy tiến trình con thành công thì in đúng thông báo thực thi từng phần.
- Bên cung cấp sandbox đã đơn giản hóa quy ước đó thành `runnerFailureSignatures: ['landlock-run: ']`; bên tiêu thụ bash kết hợp tiền tố này với bất kỳ mã thoát khác 0 nào, và báo cáo dòng đầu tiên của stderr.
- Test đơn vị đã bao phủ trường hợp thành công không có chẩn đoán, chẩn đoán bị từ chối và tiền tố runner gây tử vong. Test runner thật tự bỏ qua khi không có kernel khả dụng, và cũng không ép buộc dựng trường hợp "thông báo thực thi từng phần theo sau bởi mã thoát khác 0 của tiến trình con".
- Một script bọc POSIX tối giản sẽ in thông báo đó rồi `exec` payload của nó; nó tái hiện lỗi qua trường hợp `false` và trường hợp ripgrep không khớp.
- Quy tắc có cấu trúc, logic phân loại dùng chung giữa tiền cảnh và hậu cảnh, cùng bộ phát lại (replay) đã lắp ráp đã cùng nhau vá lỗ hổng quy nhầm sandbox vẫn còn tồn tại. Tìm kiếm hệ thống tệp chạy ripgrep đã đóng gói qua `ctx.subprocess`; bản sửa lỗi này giữ cho đường dẫn đó tiếp tục nằm ngoài bash đã sandbox hóa.

## Nguyên nhân gốc

Kiểu kết quả sandbox công khai chỉ có thể biểu diễn một tập hợp chuỗi con. Nó không thể biểu diễn việc lỗi Landlock bắt buộc phải dùng mã thoát 125, bằng chứng phải xuất hiện trong một dòng chẩn đoán gây tử vong, hay việc một dòng văn bản chính xác dưới cùng tiền tố đó thuộc về thông báo mang tính thông tin. Logic phán định boolean của bên tiêu thụ do đó đã ghép các sự kiện đến từ những tiến trình khác nhau, không liên quan với nhau lại; ngay cả khi bằng chứng gây tử vong nằm ở dòng tiếp theo, nó vẫn chọn dòng đầu tiên của stderr làm chi tiết.

Ma trận test khớp với cách biểu diễn này. Bên cung cấp giả lập hoặc không xuất dòng runner nào, hoặc xuất tiền tố gây tử vong có nghĩa rõ ràng, chưa bao giờ xuất một dòng runner vô hại trước một mã thoát khác 0 do tiến trình con kiểm soát. Độ phủ Landlock thật phụ thuộc vào ABI của máy chủ, nên các máy chủ dùng ABI đầy đủ không thể bao phủ thông báo đó. Trong cách triển khai tìm kiếm tại thời điểm xảy ra sự cố, test tìm kiếm hệ thống tệp đã giả lập lỗi spawn gốc, nhưng chưa bao giờ bao phủ lỗi có cấu trúc thực sự bị ném ra bởi tổ hợp bash đã sandbox hóa thật.

stderr vẫn là kênh quy nhầm trong băng (in-band). Tiến trình con bị giới hạn có thể cố ý tái tạo dòng chẩn đoán gây tử vong được cổng hóa của runner cùng trạng thái thoát, gây ra quy nhầm về tính khả dụng hoặc chẩn đoán. Việc kết hợp chặt chẽ hơn nhiều bằng chứng độc lập có thể tránh được xung đột ngoài ý muốn trong sự cố lần này, nhưng không thể xác minh danh tính người viết; giao thức trạng thái ngoài băng (out-of-band) vẫn thuộc về một công việc gia cố độc lập, chứ không phải bản sửa lỗi vượt sandbox.

## Các biện pháp phòng vệ đã bổ sung

- [`RunnerFailureRule`](../subsystems/sandbox.md#wrapped-argv-and-classification-dialects) mang theo danh sách mã thoát được phép tùy chọn, chữ ký gây tử vong theo từng dòng không phân biệt hoa thường, cùng các dòng mang tính thông tin bị loại trừ theo khớp nguyên dòng chính xác không phân biệt hoa thường.
- [`dsh-sandbox-local`](../../packages/sandbox/sandbox-local/) ánh xạ Landlock thành mã thoát 125 cộng một dòng chẩn đoán `landlock-run:` không phải thông báo, trong khi bwrap, Seatbelt và runner tùy biến vẫn chỉ dựa vào chữ ký.
- [`dsh-bash-sandbox`](../../packages/shell/bash-sandbox/) spawn trực tiếp argv của bên cung cấp, nên khi bị từ chối trước khi khởi động sẽ dùng kênh lỗi spawn, thay vì chẩn đoán shell nội bộ hóa. Việc thực thi tiền cảnh và hậu cảnh đã hoàn tất dùng chung một bộ phân loại trả về bằng chứng; bằng chứng gây tử vong được ưu tiên hơn từ chối, lỗi tiền cảnh sẽ báo cáo dòng gây tử vong đã khớp, đồng thời giữ nguyên stderr đã bắt được.
- [`dsh-tool-fs-search`](../../packages/fs/tool-fs-search/) chạy ripgrep đã đóng gói qua `ctx.subprocess`, và tiếp tục nằm ngoài bash sandbox seam.
- Test hồi quy ở biên gốc nằm tại [`partial-landlock.spec.ts`](../../packages/shell/bash-sandbox/tests/partial-landlock.spec.ts), bao gồm thông báo mang tính thông tin, bằng chứng gây tử vong, và phân loại tiền cảnh/hậu cảnh.
- Đường dẫn sản phẩm đã lắp ráp được cố định bởi [tổ hợp snapshot `partial-landlock`](../../examples/acp-agent/partial-landlock.cordis.snapshot.yml), độc lập với lựa chọn triển khai của tìm kiếm hệ thống tệp.

## Bài học

- Việc quy nhầm tiến trình cần nhiều bằng chứng độc lập cùng thỏa mãn; một tiền tố dùng chung không phải là giao thức.
- Chẩn đoán mang tính thông tin và chẩn đoán gây tử vong có thể dùng chung một không gian tên, nên quy tắc loại trừ phải chính xác và phạm vi hẹp, đồng thời thất bại đóng (fail closed) với các dòng gây tử vong chưa biết.
- Adapter phải giữ nguyên lỗi có cấu trúc thuộc sở hữu của seam bên dưới, chứ không được thay thế nó bằng loại chung chung gần nhất của chính mình.
- Hành vi phụ thuộc nền tảng cần có mô phỏng xác định (deterministic) đặt tại biên gốc, và bao phủ một đường dẫn sản phẩm đã lắp ráp; test kernel thật tự bỏ qua không thể một mình cố định lỗi hồi quy này.
