# Agent Note: Trang subsystem neo theo package và README nhóm gọn nhẹ

Status: implemented

[English](2026-08-03-package-anchored-subsystem-pages.md) | Tiếng Việt

## Vấn đề

[Mục lục subsystem](2026-06-20-core-data-structures-catalog.md) ban đầu xác định phạm vi trang chính bằng quy tắc trục chính (main trunk) so với seam: nếu một chu trình giữ, dẫn xuất, truyền luồng hoặc ghi log một kiểu nào đó ở mỗi vòng lặp, nó là "core". Quy tắc này chọn theo kiểu chứ không phải theo package, nên khi mục lục lớn lên hơn bốn mươi trang, trang chính trở thành một mớ hỗn tạp xuyên package: từ vựng hội thoại LLM (mô hình ngôn ngữ lớn) đứng trước quy ước agent (tác nhân), từ vựng tạo mới/sở hữu (`AgentHandle`, `CreateAgentOptions`, `ResumeAgentOptions`, `AgentFactory`) không được ghi ở đâu trong mục lục (generator miễn trừ chúng cho một README package nào đó), người đọc không thể dự đoán trang nào ghi lại một kiểu chỉ dựa trên vị trí của kiểu đó. Trong khi đó, các README nhóm package không có hình dạng thống nhất — có cái có bảng chia mục, bài viết thiết kế rời rạc, hoặc đoạn cuối lẽ ra nên thuộc về trang subsystem.

## Quyết định

Mỗi trang `docs/subsystems/` được neo vào package hoặc nhóm package khai báo từ vựng của nó, việc trang nào thuộc về đâu đi theo cấu trúc thư mục repo: [core.md](../../../../docs/subsystems/core.md) là trang của `packages/core` (tạo mới và sở hữu, handle `Agent` cùng quy ước gửi/hủy/chặn của nó, liên kết đến các trang chuyên biệt của nhóm đó), [llm-streaming.md](../../../../docs/subsystems/llm-streaming.md) bao phủ toàn bộ `packages/llm`, và tương tự. Các mẫu kiểu dùng chung toàn repo (`…Map → union dẫn xuất`, id có brand) được giữ trong một mục nhỏ cuối trang được đánh dấu rõ ràng trong core.md, thay vì đan xen với nội dung của package. Điều này thay thế quy tắc trục chính so với seam theo nghĩa *quy tắc xác định phạm vi trang*; heuristic đặt trang còn tồn tại đơn giản hơn: kiểu được ghi ở trang tương ứng với package khai báo nó, cơ chế triển khai liên quan vẫn được ghi tập trung ở trang nó thuộc về.

Mỗi kiểu được tham chiếu trong chữ ký được sinh ra đều phải resolve được ở đâu đó trong mục lục: từ vựng sở hữu agent đã được chuyển từ `TYPE_LINK_EXEMPTIONS` của generator sang `LINK_MAP → core.md`, nên miễn trừ giờ chỉ dành cho cấu trúc kiểu thực sự chỉ dùng nội bộ dịch vụ hoặc đến từ mã vendored. Mỗi khai báo được dán chỉ có một nhà (`SessionEvent` nằm ở [session.md](../../../../docs/subsystems/session.md); core.md tóm tắt và liên kết đến đó).

Mỗi cặp `packages/<group>/README.md` là một điểm vào gọn nhẹ có hình dạng thống nhất: một đoạn giới thiệu nói "vì sao" trước, một bảng package (package / vai trò / khóa ctx), một liên kết cuối trang trỏ đến trang subsystem tương ứng. Nếu phần nội dung chính mang thông tin then chốt vượt quá những gì cấu trúc này có thể chứa, hãy di chuyển nó sang trang subsystem tương ứng, chứ không xóa đi.

[README subsystem](../../../../docs/subsystems/README.md) lập chỉ mục từng trang trong mục lục ở cả hai phía tiếng Trung và tiếng Anh; `scripts/project-doc-site.spec.ts` bắt buộc mỗi trang phải tương ứng với một dòng bảng, nên các trang được thêm mới (hoặc gộp vào) ở các PR sau này không thể âm thầm thiếu vắng khỏi chỉ mục.

## Các phương án đã cân nhắc

**Giữ quy tắc phân định trục chính so với subsystem.** Nó trả lời từng kiểu một câu hỏi "kiểu này có phải core không?", đây chính là lý do trang chính đã tích lũy kiểu của bốn package, nhưng lại thiếu một nửa giao diện công khai của `packages/core/agent`. Phương án dự đoán được theo cấu trúc thư mục repo đã thắng.

**Mục lục phẳng, một tài liệu duy nhất.** Đã bị bác bỏ trong [Agent Note mục lục gốc](2026-06-20-core-data-structures-catalog.md); việc lớn lên đến bốn mươi mốt trang xác nhận kết luận đó.

**Chỉ ghi từ vựng sở hữu trong README của package (hiện trạng miễn trừ).** Điều này khiến `AgentHandle` cùng các tùy chọn tạo mới/khôi phục vô hình trong một mục lục tự nhận là tài liệu tham khảo kiểu, và footer `Types:` được sinh ra cũng không thể liên kết đến chúng.

## Hệ quả

- Trang nào ghi lại một kiểu có thể dự đoán được từ `packages/<group>/`; README subsystem là chỉ mục đầy đủ được test bắt buộc.
- Footer chữ ký được sinh ra liên kết đến từ vựng sở hữu agent, thay vì miễn trừ âm thầm.
- Manifest (tệp khai báo metadata) 1:1 của `verify-type-equiv` đảm bảo mỗi khai báo được dán chỉ có một chủ sở hữu; bản dán `SessionEvent` trùng lặp đã bị gỡ bỏ.
- [Agent Note mục lục gốc](2026-06-20-core-data-structures-catalog.md) vẫn nắm giữ cơ chế gate phát hiện drift `ts type-equiv`; ở đây chỉ thay thế quy tắc xác định phạm vi trang của nó.
