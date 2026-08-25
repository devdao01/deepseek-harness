# Agent Note: Gộp backend nén duy nhất vào gói dịch vụ

Status: rejected — có kế hoạch bổ sung thêm backend nén, vì vậy gói Service Definition và gói nhà cung cấp basic tiếp tục tách rời.

[English](2026-07-19-fold-compaction-package-split.md) | Tiếng Việt

## Vấn đề

Nén (compaction) hiện đang được tách thành hai gói: `@deepseek-ai/dsh-compaction` sở hữu một dịch vụ trừu tượng gồm hai phương thức cùng các kiểu dùng chung, còn `@deepseek-ai/dsh-compaction-basic` sở hữu nhà cung cấp hoàn chỉnh duy nhất. Cấu hình bàn giao chỉ nạp gói basic, và ngoài nhà cung cấp đó ra, không có gói production nào tiêu thụ gói Service Definition một cách độc lập.

Việc tách này làm phát sinh thêm một package manifest (bản kê metadata), README, ranh giới dự án, cạnh phụ thuộc, lớp chuyển tiếp trừu tượng, mục catalog được sinh ra và phần đấu nối tổ hợp, mà không có ca sử dụng thay thế backend thực tế nào. [Quyết định về capability seam](../../implemented/architecture/2026-06-13-capability-seams.md) yêu cầu giao diện, phần cài đặt và phía tiêu thụ đều phải tồn tại thực sự, chứ không được tách trước; [quyết định về nén](../../implemented/feature/2026-06-18-compaction-capability-seam.md) cũng ghi nhận rằng việc triển khai phía tiêu thụ độc lập vẫn đang bị hoãn.

## Đề xuất

Chuyển phần cài đặt basic vào `@deepseek-ai/dsh-compaction` và xóa `@deepseek-ai/dsh-compaction-basic`. `ctx.compaction`, `CompactionResult`, transcript (bản ghi văn bản) dùng chung cùng các phương thức trợ giúp ghép cặp công cụ, cấu hình hiện có và thuật toán nén cụ thể đều do một gói duy nhất phụ trách.

Giữ `summarize()` như một hook tùy biến được bảo vệ. Bộ tóm tắt chuyên biệt cho từng lần triển khai có thể tùy biến bằng cách kế thừa hoặc chặn lời gọi LLM (mô hình ngôn ngữ lớn) hiện có, không cần đến gói năng lực thứ hai. Chỉ khi nào backend hoàn chỉnh thứ hai cùng phía tiêu thụ độc lập thực sự cần thay thế phần cài đặt thì mới đưa lại gói Service Definition riêng.

Nếu đề xuất này được chấp thuận, cần đồng thời sửa lại quyết định về nén đã triển khai và [đề xuất nén có thể hồi tưởng](../../proposed/feature/2026-07-06-recallable-compaction.md), sao cho quyền sở hữu gói chỉ có một nơi mô tả bền vững duy nhất.

## Phương án thay thế

**Giữ lại việc tách gói cho backend từ xa hoặc backend hồi tưởng có thể xuất hiện.** Một phần cài đặt có thể có trong tương lai không đủ để biện minh cho ranh giới gói ở hiện tại. Tính năng hồi tưởng sẽ làm tăng số phía tiêu thụ kết quả nén, nhưng không nhất thiết làm tăng thêm một phần cài đặt khác; bộ tóm tắt từ xa cũng có thể dùng hook được bảo vệ.

**Dùng tên gói nhà cung cấp cho gói Service Definition.** Nếu giữ `compaction-basic` làm tên cuối cùng, dịch vụ sản phẩm sẽ trông như một backend tùy chọn. `compact` vốn đã là định danh dịch vụ ổn định mà `ctx.compaction` sử dụng, nên phù hợp hơn để làm chủ sở hữu gói duy nhất.

## Tiêu chí nghiệm thu

- Xóa `@deepseek-ai/dsh-compaction-basic` cùng workspace và metadata gói của nó.
- `@deepseek-ai/dsh-compaction` sở hữu cấu hình, lớp plugin, thuật toán, kiểu, sự kiện và các phương thức trợ giúp dùng chung hiện tại.
- Các lần triển khai hiện có có thể nạp gói được giữ lại bằng cấu hình tương đương, với hành vi nhìn thấy được từ phía mô hình là tương đương.
- Nén tự động và nén thủ công vẫn giữ hành vi hủy, khóa, mức dùng token, ghép cặp công cụ, sự kiện bền vững, seq của sự kiện nguồn được tham chiếu, hội tụ khi thử lại và kết xuất transcript.
- Các test về tổ hợp loader, unit, vòng lặp mất kiểm soát, hủy, snapshot và nén với mô hình thật đều vượt qua; catalog được sinh ra và đồ thị module luôn được cập nhật.

## Rủi ro

Đây là một đợt thu gọn tên gói tiền phát hành được thực hiện có chủ đích. Bên nhúng đang nạp `@deepseek-ai/dsh-compaction-basic` sẽ phải đổi gói, và việc thay thế backend trong tương lai cũng cần trích xuất lại ranh giới. Cái giá này chỉ chấp nhận được chừng nào vẫn chỉ có một phần cài đặt hoàn chỉnh duy nhất; nếu backend thứ hai xuất hiện trước, cần đánh giá lại xem có nên chấp nhận đề xuất này hay không.
