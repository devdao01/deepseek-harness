# util/: các công cụ dùng chung ở tầng thấp

[English](README.md) | Tiếng Việt

Các gói không phụ thuộc (zero-dependency) này cung cấp những nguyên thủy (primitive) nhỏ được nhiều họ năng lực (capability family) dùng chung. Ngữ nghĩa nghiệp vụ vẫn thuộc về từng năng lực tiêu thụ các nguyên thủy này.

| Gói | Trách nhiệm |
|---|---|
| [`brand/`](brand/README.md) | Cung cấp các kiểu có gắn nhãn danh nghĩa (nominal brand) |
| [`paths/`](home-paths/README.md) | Phân giải thư mục gốc dữ liệu Harness và các đường dẫn dùng chung |
| [`timeout/`](timeout/README.md) | Cung cấp nguyên thủy về deadline và phân loại timeout |
| [`retention/`](output-retention/README.md) | Giới hạn kích thước của văn bản và tập hợp mục được giữ lại |
| [`atomic-write/`](atomic-write/README.md) | Thay thế file theo cách nguyên tử (atomic) |
| [`native-command/`](native-command/README.md) | Chạy lệnh nguyên bản của hệ điều hành mà không qua shell |
