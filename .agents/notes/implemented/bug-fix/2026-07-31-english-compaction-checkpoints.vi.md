# Agent Note: Checkpoint nén dùng văn phong kỹ thuật tiếng Anh

Status: implemented

[English](2026-07-31-english-compaction-checkpoints.md) | Tiếng Việt

## Vấn đề

Checkpoint nén (compaction) sẽ trở thành phần tiền tố tồn tại lâu dài trong lần gọi model kế tiếp. Khi hội thoại đa ngôn ngữ khiến bộ nén giữ lại phần tư liệu tường thuật bằng ngôn ngữ của hội thoại, checkpoint có thể đưa vào một lượng lớn nội dung ngôn ngữ vốn không hề xuất hiện trong code, output của tool hay các tiền tố suy luận (reasoning) đã có. Ngôn ngữ đó sau đó tiếp tục tồn tại qua các chu kỳ nén kế tiếp và ảnh hưởng đến văn phong suy luận của model hội thoại.

## Quyết định

`COMPACTION_INSTRUCTION` yêu cầu sinh checkpoint kỹ thuật nội bộ bằng tiếng Anh. Nó yêu cầu model dịch tư liệu tường thuật gốc khi cần, đồng thời giữ nguyên các literal chính xác; bao gồm đường dẫn, lệnh, lỗi, identifier, signature, và cả cách diễn đạt trích dẫn khi độ chính xác là quan trọng. Tiêu đề của checkpoint cùng các gạch đầu dòng kỹ thuật súc tích vẫn theo định dạng có cấu trúc như trước.

Yêu cầu này được tích hợp vào câu đầu tiên của chỉ dẫn nén ở phần đuôi. System prompt, tool và lịch sử hội thoại được phát lại vẫn khớp từng byte với request đã được định tuyến, nên thay đổi này vẫn giữ được việc tái sử dụng cache tiền tố như đã xác lập trong [ghi chú về tái sử dụng cache tiền tố của bản tóm tắt nén](2026-07-21-compaction-summary-prefix-cache-reuse.md).

## Các phương án đã cân nhắc

- **Để hội thoại được phát lại quyết định ngôn ngữ của checkpoint** — không chọn: checkpoint là tiền tố prompt tồn tại lâu dài, việc giữ lại văn phong hội thoại nhất thời có thể khuếch đại ảnh hưởng đó trong các lần nén sau.
- **Ràng buộc ngôn ngữ của model hội thoại** — không chọn: chính sách này nhắm vào checkpoint nội bộ, không phải hội thoại mà người dùng nhìn thấy; áp quy tắc lên toàn bộ hội thoại sẽ thay đổi tương tác bình thường một cách không cần thiết.
- **Yêu cầu chỉ xuất ra ASCII** — không chọn: ASCII là ràng buộc về bộ ký tự, không phải ràng buộc về văn phong kỹ thuật, và sẽ bóp méo một cách không cần thiết các literal hợp lệ cũng như tư liệu kỹ thuật.
- **Thêm một câu yêu cầu chỉ-dùng-tiếng-Anh riêng ở cuối** — không chọn: nêu yêu cầu này trong phần quy ước output ở đầu chỉ dẫn thì gọn hơn, đồng thời gắn trực tiếp nó với checkpoint được yêu cầu.

## Hệ quả

- Checkpoint mới sẽ chuẩn hóa ngữ cảnh tường thuật sang tiếng Anh, đồng thời giữ nguyên các chuỗi chính xác mà công việc dùng tool và làm việc với code sau này phụ thuộc vào.
- Cấu trúc checkpoint hiện có, việc định tuyến nén và sự căn chỉnh cache đều không đổi; chỉ có chỉ dẫn user cuối cùng là khác.
- Lời gọi tóm tắt trực tiếp vẫn không được đưa vào snapshot transcript (bản ghi văn bản), vì nó không phát ra sự kiện `assistant/chunk`. Bài regression trên vòng lặp thật thay vào đó khẳng định chỉ dẫn cuối cùng chính xác mà request tóm tắt nhận được.
