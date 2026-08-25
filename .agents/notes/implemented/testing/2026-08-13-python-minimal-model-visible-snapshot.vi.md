# Agent Note: Snapshot model-visible cho bản lắp ráp tối giản của Python

Status: implemented

[English](2026-08-13-python-minimal-model-visible-snapshot.md) | Tiếng Việt

## Vấn đề

Kênh Python chưa bao giờ đối chiếu với đúng những gì bản lắp ráp tối giản thực sự phơi bày cho mô hình. Ngữ cảnh runtime động đi vào lịch sử dưới dạng message user, nên khẳng định "message vai trò system bằng đúng persona được triển khai" của mô hình mock không nhìn thấy nó; còn snapshot tệp thực thi nâng cao lại thay system prompt đã lắp ráp trong header của mỗi request bằng placeholder và thay mỗi tool schema bằng tên của nó. Kết quả là message ngữ cảnh runtime của sandbox-policy cứ thế đi ké trong [bản lắp ráp tối giản](../../../../examples/jsonrpc-agent/minimal.cordis.yml) đã check in, còn `python-runtime` thì luôn xanh; bất kỳ plugin nào thêm phân đoạn system, tool hay message ngữ cảnh khác cũng đều lọt qua theo cách đó.

## Quyết định

Kịch bản `sdk-minimal` của [smoke test runtime đã đóng gói](../../../../scripts/smoke-python-runtime.py) ghi lại `scripts/snapshots/python-sdk-single-exe/minimal/model-visible.json`: với mỗi request tới mô hình trong lượt đó, ghi nguyên văn tool schema được công bố ra ngoài và danh sách message. Message system và user giữ nguyên toàn văn, chỉ thay thư mục tạm của kịch bản bằng placeholder; message assistant và tool chỉ giữ định danh lời gọi, vì phần văn bản PTY và hệ thống tệp của chúng không giống nhau trên các nền tảng mà expected output phải replay được.

Có một message model-visible bị loại trừ: snapshot ngữ cảnh runtime động của agent loop. Cùng một bản lắp ráp nhưng trên macOS thì phát ra nó, còn trên Linux — nền tảng mà làn bắt buộc sử dụng — thì không, nên không expected output đơn lẻ nào chứa nổi nó. Bản thân khác biệt đó là một khiếm khuyết ([#2488](https://github.com/deepseek-harness/deepseek-harness/issues/2488)) — expected output này bao phủ toàn bộ những message model-visible còn lại, thay vì chờ khiếm khuyết đó được sửa trước.

Mô hình mock không còn khẳng định về tool và system prompt của kịch bản tối giản nữa — mặt đó do snapshot sở hữu, và nó đưa ra khác biệt đầy đủ chứ không phải chỉ điểm không khớp đầu tiên. Việc so sánh snapshot nhận tham số là thư mục và tập tệp, nên hai expected output `minimal` và `advanced` dùng chung một phần hiện thực, và `--update-snapshots` chấp nhận `sdk-minimal`.

## Các phương án đã cân nhắc

**Chụp snapshot session log của bản tối giản giống như kịch bản nâng cao.** Lượt chạy tối giản điều khiển PTY và trình soạn thảo thật, nên kết quả tool được lưu bền mang văn bản phụ thuộc nền tảng. Expected output sẽ đỏ vì những lý do chẳng liên quan gì đến phần lắp ráp model-visible; mà sau khi chuẩn hóa hết các đoạn văn bản đó thì log cũng chẳng còn mang theo bao nhiêu.

**Mở rộng các khẳng định nội tuyến trong mô hình mock.** Cứ thêm một đóng góp model-visible là lại phải viết tay thêm một kỳ vọng, và khi thất bại thì chỉ chỉ ra được một chỗ không khớp chứ không phải cả mặt. Phần mô tả tool còn bị sao chép từ bản lắp ráp vào script, tạo ra trùng lặp.

**Dựa vào snapshot của TypeScript SDK.** Kịch bản `persistent-tools` của nó cố định system prompt, tool schema và ngữ cảnh runtime của cùng bản lắp ráp, nhưng lại đi qua phản hồi mô hình được replay cùng runtime source hoặc `lib`, và nằm trong một tác vụ bắt buộc khác. Nó không thể hiện được closure của tệp thực thi đã triển khai lắp ráp ra những gì cho bên gọi Python.

## Hệ quả

Thay đổi trên mặt model-visible của bản lắp ráp tối giản — phân đoạn system, tool, mô tả tool hay message user mới thêm — giờ đây sẽ khiến `python-runtime` thất bại kèm khác biệt chính xác; muốn nó vào được thì phải chạy lại `--scenario sdk-minimal --update-snapshots` và review khác biệt đó. Nhờ vậy, phần mô tả tool của bản lắp ráp tối giản trở thành expected output đã qua review.

Văn bản của message assistant và tool không còn tham gia so sánh, còn snapshot ngữ cảnh runtime thì hoàn toàn không tham gia. Trạng thái shell bền, output của trình soạn thảo và phản hồi cuối cùng vẫn do các khẳng định của chính kịch bản đó sở hữu; message bị loại trừ thuộc trách nhiệm của [#2488](https://github.com/deepseek-harness/deepseek-harness/issues/2488) cho tới khi khác biệt nền tảng của nó được giải quyết.

[AGENTS.md](../../../../AGENTS.md) và [chính sách kiểm thử](../../../../docs/testing.md) nay đã nêu rõ rằng cả hai SDK đều là projection độc lập của agent loop, vòng đời session và `SessionEventMap`, nên thay đổi bất kỳ mục nào trong số đó đều phải cập nhật expected output ở cả hai phía, chứ không chỉ phía mà người đóng góp tình cờ chạy tới.
