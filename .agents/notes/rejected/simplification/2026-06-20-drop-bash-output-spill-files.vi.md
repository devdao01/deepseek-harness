# Agent Note: Gỡ bỏ file spill chứa output đầy đủ của bash

Status: rejected — Khôi phục output đầy đủ là hành vi bash có thật. Một dịch vụ artifact/blob trong tương lai có thể tổng quát hóa việc này, nhưng nếu xóa file spill trước khi có phương án thay thế thì sẽ mất output lệnh hữu ích.

[English](2026-06-20-drop-bash-output-spill-files.md) | Tiếng Việt

## Vấn đề

`dsh-bash-local` giữ output có giới hạn kích thước trong bộ nhớ, và ghi các luồng stdout/stderr dung lượng lớn ra file spill tạm thời riêng tư. Điều này đòi hỏi một thư mục riêng tư, tạo file chỉ chủ sở hữu mới truy cập được theo cách ngẫu nhiên, xử lý lỗi khi đóng file, đọc tăng dần theo offset byte, báo cáo đọc có mất mát (lossy), render đường dẫn trong văn bản hướng tới model, và kỷ luật dọn dẹp. Khi output bị cắt bớt, công cụ sẽ báo cho model biết để đọc một đường dẫn spill cục bộ.

Cách này giải quyết một vấn đề có thật, nhưng theo hướng hẹp và có rò rỉ. Đường dẫn spill là một artifact hệ thống file cục bộ của tiến trình, bị lộ ra cho model, chứ không phải một artifact bền vững của harness với kiểm soát truy cập theo phạm vi, chính sách lưu giữ, hay hỗ trợ UI. Nó còn khiến việc đọc từ background task phức tạp hơn, vì việc đọc tăng dần có mất mát phải trỏ tới một hoặc hai file spill.

## Đề xuất

Giữ lại việc cắt bớt phần đuôi (tail truncation), gỡ bỏ file spill chứa output đầy đủ. Kết quả bash chứa nội dung đuôi có giới hạn kích thước cộng với một dấu hiệu cắt bớt rõ ràng; không xuất đường dẫn. Nếu người dùng cần khôi phục output đầy đủ, hãy bổ sung một dịch vụ artifact/blob tổng quát (có quyền sở hữu, dọn dẹp và render UI rõ ràng), rồi để bash gắn (append) output dung lượng lớn vào dịch vụ đó.

Đề xuất này có thể triển khai độc lập với [generic long-running tool runtime](../../implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md). Nếu background task vẫn được giữ lại, `bash_output` vẫn nên báo rằng output đã bị loại bỏ, nhưng không còn cung cấp đường dẫn spill nữa.

## Tiêu chí nghiệm thu

- `CollectedOutput` không còn mang đường dẫn spill.
- `OutputCollector` chỉ giữ lại buffer có giới hạn kích thước, xóa cơ chế file tạm thời.
- `renderResult()` khi báo cáo cắt bớt không còn chứa đường dẫn hệ thống file.
- Test bao phủ việc cắt bớt phần đuôi, không còn assert nội dung của file output đầy đủ.
- Hướng dẫn an toàn trong [docs/defensive-patterns.md](../../../../docs/defensive-patterns.md) không còn coi file spill riêng tư là một interface hướng tới model.

## Năng lực bị từ bỏ

Model hoặc người dùng sẽ không còn khôi phục được phần đầu bị lược bỏ trong output lệnh dung lượng lớn từ file tạm thời. Trước khi có dịch vụ artifact thực sự, điều này là chấp nhận được. Đường dẫn spill hiện tại đưa vào quá nhiều cơ chế chuyên dụng cho một tính năng chưa được thiết kế rõ ràng về vòng đời và quyền truy cập.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
