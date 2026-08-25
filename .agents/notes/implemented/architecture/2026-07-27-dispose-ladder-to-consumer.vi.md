# Agent Note: Thang dispose thuộc về phía tiêu thụ nó, không thuộc subprocess seam

Status: implemented

[English](2026-07-27-dispose-ladder-to-consumer.md) | Tiếng Việt

## Vấn đề

`SubprocessHandle.dispose(graces)` và `SubprocessDisposeGraces` đặt cả một *chính sách* tháo dỡ — chờ stdin EOF, rồi SIGTERM, rồi SIGKILL, mỗi tầng bị ràng buộc bởi một cửa sổ thời gian do phía gọi cung cấp — lên một seam mà mọi động từ còn lại đều là cơ chế đơn thuần. Nó luôn chỉ có đúng một phía tiêu thụ (backend subagent ACP (Agent Client Protocol)); bash đi theo `terminate()` và tháo dỡ dịch vụ, còn host LSP chạy quy trình đóng ưu tiên giao thức của riêng nó. Thế nhưng mọi backend tương lai đều phải hiện thực cái thang đó mới thỏa mãn được interface, và các package hiện thực cũng phải gánh thêm phụ thuộc `dsh-timeout` chỉ vì hạn thời gian theo tầng của cái thang.

## Quyết định

Cái thang được chuyển vào phía tiêu thụ duy nhất của nó. `dsh-subagent-acp` sở hữu `disposeAcpChild(child, eofGraceMs)`, được xây hoàn toàn trên các động từ công khai của seam: đóng `stdin`, ràng buộc một lần `waitForExit` bằng `eofGraceMs`, sau đó gọi `terminate()` (việc leo thang SIGTERM→hạn ân xá theo spec→SIGKILL của nó đã tự sở hữu bộ định thời tín hiệu), rồi chờ `waitForExit()` không giới hạn, để bên chịu trách nhiệm tiến trình con chứng minh cả cây tiến trình đã thoát. Seam giữ lại `kill`／`terminate`／`waitForExit` — cơ chế chứ không phải chính sách — và `waitForExit(signal?)` chính là đầu dò dừng hẳn đầy đủ mà cái thang ở phía tiêu thụ cần để xác nhận ở tầng cộng tác rằng cây tiến trình đã thực sự thoát, không phải phái sinh thêm một bộ định thời từ hạn ân xá kết thúc. Handle của seam bớt đi một phương thức và một interface được export.

## Các phương án thay thế đã cân nhắc

**Giữ cái thang trên handle như một phương thức tiện lợi.** Bác bỏ: một phương thức Service Definition mà mọi Service Provider đều buộc phải hiện thực thì không phải tiện lợi, mà là một phần của giao ước — và cái này lại mã hóa mô hình cộng tác của một phía tiêu thụ cụ thể (mở màn bằng stdin EOF) thành từ vựng tiến trình. Chính README của seam đã phải chú thêm rằng "tiến trình con cần tín hiệu khác mới dừng hẳn thì phải tự lo tầng đầu tiên của mình", bản thân điều đó đã thừa nhận cái thang là chính sách.

**Chuyển cái thang sang một package trợ giúp dùng chung.** Bác bỏ: chỉ có một phía tiêu thụ. Khi xuất hiện backend ngoài tiến trình thứ hai có cùng mô hình cộng tác stdin EOF thì lúc đó hãy nâng `disposeAcpChild` thành mã dùng chung; trích xuất ngay bây giờ chỉ tái tạo `dsh-subagent-subprocess` — chính thư viện dùng-một-lần mà thay đổi này xóa đi.

## Hệ quả

Cái thu được: Service Definition bớt một phương thức và một kiểu; Service Provider chỉ nợ bốn động từ, không nợ chính sách tháo dỡ; cửa sổ thời gian EOF cộng tác nằm chung chỗ với trường cấu hình ACP điều chỉnh nó, còn cửa sổ thời gian kết thúc và lần chờ cây tiến trình thoát cuối cùng chỉ do bên chịu trách nhiệm tiến trình con sở hữu. Cái giá: backend tương lai muốn tháo dỡ mở màn bằng EOF sẽ phải viết khoảng 20 dòng dựa trên các động từ này (hoặc bê thẳng hàm trợ giúp của ACP); test theo tầng của cái thang nằm ở bộ test ACP, còn bộ test của Service Definition chuyển sang cố định các động từ mà cái thang kết hợp (trước khi leo thang, `waitForExit` có giới hạn trả về sai; sau khi leo thang, chờ không giới hạn cho cả cây tiến trình thoát), chứ không phải chính sách sau khi kết hợp.
