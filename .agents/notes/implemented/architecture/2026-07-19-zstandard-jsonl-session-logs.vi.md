# Agent Note: Session log JSONL nén Zstandard

Status: implemented

[English](2026-07-19-zstandard-jsonl-session-logs.md) | Tiếng Việt

## Vấn đề

Backend lưu trữ bền vững JSONL giữ nguyên từng ký tự mỗi `SessionEvent`, trong đó có số lượng lớn bản ghi `assistant/chunk`. Văn bản gốc dễ kiểm tra, nhưng key JSON lặp lại và văn bản mô hình làm tăng chi phí lưu trữ và I/O. Việc mã hóa nén phải giữ nguyên ranh giới commit append/fsync hiện có, việc phát hành không xung đột khi hiện thực hóa lần đầu, sửa chữa khi crash, và việc liệt kê chỉ dùng metadata; nếu mỗi vòng đều ghi lại toàn bộ file nén, sẽ mất các thuộc tính này.

Việc mã hóa cũng phải giữ tính tường minh ở ranh giới deployment. Fixture (dữ liệu tiền đặt cho test) snapshot và reader đọc theo dòng bên ngoài cần JSONL gốc, còn backend không thể đoán an toàn giữa sản phẩm đã nén và sản phẩm gốc trong cùng một thư mục gốc, cũng không thể âm thầm migrate dữ liệu session tiền phát hành.

## Quyết định

### Cấu hình và quyền sở hữu hậu tố

`dsh-session-persistence-jsonl` chấp nhận `compression?: 'zstd' | 'none'`, và resolve tường minh giá trị bị bỏ qua thành `'zstd'`. Sản phẩm Zstandard dùng hậu tố `.jsonl.zstd`; `'none'` giữ biểu diễn UTF-8 phân tách bằng dòng mới (newline-delimited) `.jsonl` hiện có. `SessionLocation.kind` vẫn là `'jsonl'`, vì hai cách mã hóa mang cùng định dạng bản ghi logic; theo chính sách từ chối tiền phát hành và không migrate của repo, `SESSION_FORMAT_VERSION` vẫn là `0`.

Mỗi thư mục gốc lưu trữ bền vững chỉ thuộc về một cách mã hóa. Một lần kiểm tra trước (precheck) discovery duy nhất sẽ từ chối bất kỳ hậu tố ngược nào; các đường load có mục tiêu, việc adopt đang hoạt động, liệt kê và hiện thực hóa sẽ kiểm tra lại hậu tố tương ứng sau precheck thư mục rỗng ban đầu. Lỗi sẽ chỉ ra sản phẩm không tương thích, và yêu cầu deployment chọn cấu hình khớp hoặc thư mục gốc riêng. Hệ thống không cung cấp migrate, đọc kép, ghi kép, hay dự phòng dựa trên phần mở rộng.

### Đường frame và ghi

Sản phẩm nén là chuỗi nối tiếp các [frame Zstandard](https://datatracker.ietf.org/doc/html/rfc8878) độc lập chuẩn: frame đầu tiên có checksum chỉ chứa dòng header, mỗi batch append bền vững tiếp theo chiếm một frame có checksum riêng. Batch agent loop (vòng lặp smart agent) thông thường chính là commit turn, do đó ranh giới frame giữ nguyên checkpoint bền vững hiện có, đồng thời không để tầng lưu trữ phụ thuộc vào loại event turn.

Việc nén dùng [`zstdCompress` và `zstdDecompress`](https://nodejs.org/download/release/v22.19.0/docs/api/zlib.html) tích hợp sẵn của Node, Node 22.19 — phiên bản tối thiểu được repo hỗ trợ — đã cung cấp các API này. Backend bật `ZSTD_c_checksumFlag`, còn lại dùng mặc định của Node, không công khai tùy chỉnh mức nén, cũng không thêm dependency. Node đánh dấu API này là thử nghiệm (experimental), do đó cổng kiểm tra tương thích Node 22.19, 24 và 26 sẽ chạy cùng một implementation hỗ trợ.

Lần hiện thực hóa đầu tiên sẽ nén hai frame ban đầu trước khi mở file tạm, sau đó ghi vào file đó và thực hiện `fsync`. POSIX phát hành file này qua hard link tránh xung đột và `fsync` thư mục; Windows phát hành qua `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)` mà không thay thế file đích. Batch tiếp theo cũng sẽ nén trước, rồi mở đích và append tại EOF. Khi bắt được lỗi ghi hoặc đồng bộ file, backend sẽ đóng handle append, mở lại log ở chế độ đọc-ghi, truncate về độ dài byte gốc, đồng bộ kết quả rollback, rồi ném lại lỗi, để bộ điều phối có thể retry batch chưa thay đổi trên cả hai nền tảng.

### Đọc, liệt kê và phục hồi sau crash

Bộ quét ranh giới frame sẽ đọc magic number chuẩn, trường header biến đổi, block header và độ dài payload, cùng đuôi checksum tùy chọn, nhưng không diễn giải block nén. Frame hoàn chỉnh sẽ xác thực checksum độc lập, rồi vào [pipeline phục hồi session lớn](2026-08-05-large-session-jsonl-restore-pipeline.md); pipeline này chịu trách nhiệm tái sử dụng decoder, nhường lượt event loop theo cách hợp tác, và quét gia tăng JSONL. Bất kỳ lỗi checksum hoặc giải nén của frame hoàn chỉnh nào, phần đuôi JSONL dị dạng trong frame hoàn chỉnh, hoặc cấu trúc frame không hợp lệ đều được coi là hỏng và từ chối load.

Việc liệt kê chỉ đọc theo lát cắt có giới hạn cho tới khi frame hoàn chỉnh đầu tiên khả dụng, xác thực và giải nén frame header đó, không bao giờ đọc frame event. Do đó, ngay cả khi session log rất lớn, frame header chuyên dụng vẫn giữ được việc liệt kê chỉ dùng metadata.

Việc gặp EOF bên trong frame cuối cùng là phần đuôi bị rách (torn tail) có thể phục hồi. Sau khi bộ quét xác định ranh giới đó, decoder tiền tố chuyên dụng sẽ dùng `finishFlush: ZSTD_e_flush`, để Node không cần chờ tới hết frame hay đọc đủ checksum vẫn có thể xuất ra plaintext đã có; mỗi event hoàn chỉnh và kết thúc bằng dòng mới trong đó đều được giữ lại. Việc sửa chữa sẽ truncate từ byte bắt đầu của frame đó, rồi append một frame mới có checksum, lần lượt chứa các event hoàn chỉnh đã phục hồi, cùng event đóng tool, step và turn do bộ điều phối tạo ra. Nếu vị trí rách chưa đủ để giải mã bất kỳ event hoàn chỉnh nào, việc sửa chữa sẽ loại bỏ frame chưa hoàn chỉnh đó và giữ lại toàn bộ frame hoàn chỉnh trước đó.

### Phía tiêu thụ và xác minh

Package ứng dụng CLI (Command-Line Interface), ACP (Agent Client Protocol) và stdio công khai cấu hình truyền qua đối xứng `persistenceCompression`. Việc lắp ráp host web và tổ hợp ứng dụng thông thường bỏ qua tùy chọn này và dùng giá trị mặc định nén. Tổ hợp ghi và replay snapshot chọn tường minh `'none'`, vì fixture đã commit là input JSONL gốc dùng cho quá trình replay và chuẩn hóa.

Quy ước lưu trữ bền vững dùng chung và quy ước bộ điều phối sẽ chạy cho cả hai cách mã hóa. Test backend bao phủ khả năng tương tác giữa frame chuẩn và checksum, liệt kê chỉ dùng header, rollback append, từ chối không khớp mã hóa, hỏng frame hoàn chỉnh, và phần đuôi frame cuối cùng bị rách trải dài qua header, block và đuôi checksum. Test smoke của runtime mặc định, binary sau build, headless, ACP và Python sẽ khẳng định hậu tố nén và magic number Zstandard, hoặc giải mã header; test đọc nội dung gốc thì tường minh tắt việc nén.

## Các phương án thay thế từng cân nhắc

- **Mỗi bản ghi JSONL một frame** — không chấp nhận, vì cách này khiến số lượng lớn event chunk mỗi cái phải gánh chi phí header frame và checksum riêng, và khiến ranh giới vật lý tách rời khỏi batch append bền vững.
- **Ghi lại toàn bộ luồng nén hoàn chỉnh mỗi lần append** — không chấp nhận, vì chi phí sẽ tăng theo kích thước log, và thao tác thay thế sẽ từ bỏ việc rollback append/fsync cùng cơ chế hiện thực hóa không xung đột hiện có.
- **Dùng bộ nén dạng streaming xuyên các lần append** — không chấp nhận, vì trạng thái encoder bị gián đoạn sẽ không để lại đơn vị append có thể xác thực độc lập, khiến việc liệt kê có giới hạn và sửa chữa từ điểm bắt đầu frame trở nên phức tạp hơn.
- **Thêm dependency Zstandard native bên ngoài** — không chấp nhận, vì phiên bản Node tối thiểu được hỗ trợ đã cung cấp codec cần thiết; một sản phẩm native khác sẽ tăng rủi ro cài đặt và đóng gói executable, mà không thêm hành vi cần thiết.
- **Công khai mức nén hoặc tiếp tục mặc định dùng JSONL gốc** — không chấp nhận, vì không có bằng chứng deployment ủng hộ chiến lược điều chỉnh thứ hai, còn `'none'` đã giữ lại đường cho fixture và tích hợp cần đọc theo dòng.

## Hệ quả

- Thư mục gốc session thông thường lưu trữ `.jsonl.zstd`, và giữ nguyên ngữ nghĩa chỉ-append, fsync, rollback và phục hồi turn bị gián đoạn.
- JSONL gốc vẫn là cấu hình tường minh, nhưng đổi cách mã hóa cần dùng thư mục gốc hoàn toàn mới hoặc riêng biệt, hoặc chọn mode khớp với sản phẩm hiện có.
- Mỗi batch bền vững một frame sẽ tăng thêm chi phí frame và checksum có giới hạn, đồng thời hỗ trợ liệt kê chỉ dùng header và sửa chữa từ đúng ranh giới append.
- Công cụ bên ngoài phải hiểu các frame Zstandard nối tiếp, hoặc tiêu thụ sản phẩm ở mode gốc; việc giải nén một lần thông dụng của Node chỉ đọc frame độc lập đầu tiên, do đó việc đọc ở backend sẽ duyệt qua từng frame thông qua [pipeline phục hồi](2026-08-05-large-session-jsonl-restore-pipeline.md).
- Implementation phụ thuộc vào API Zstandard tích hợp sẵn còn thử nghiệm của Node, nhưng không thêm dependency NPM; cổng kiểm tra tương thích phiên bản được hỗ trợ sẽ phơi bày việc API bị trôi (drift).
