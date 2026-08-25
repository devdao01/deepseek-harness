# Agent Note: Kiểm thử tất định, fixture bất biến khi replay và kiểm thử áp lực tranh chấp

Status: proposed

[English](2026-06-11-deterministic-and-stress-testing.md) | Tiếng Việt

## Vấn đề

Một số kiểm thử agent loop (vòng lặp tác tử) đồng bộ bằng cách ngủ với `setTimeout(30)` — đó là một khoản nợ về tính bất ổn, làm phí chu kỳ thử lại của agent, và còn có thể che giấu bug về thời điểm. Ngoài ra, cam kết kiến trúc cốt lõi của chúng ta (mọi session log sau khi replay đều cho ra cùng lịch sử dẫn xuất) hiện chỉ được khẳng định trong hai kiểm thử, trong khi việc khẳng định nó ở *tất cả* kiểm thử lại rất rẻ. Hơn nữa, tranh chấp đánh thức inbox mới chỉ được kiểm chứng thủ công một lần, không có cơ chế nào tái kiểm liên tục.

## Đề xuất

Ba biện pháp:

1. **Cấm ngủ theo đồng hồ treo tường trong kiểm thử.** Thay việc chờ bằng `setTimeout(N)` bằng chờ theo sự kiện (mẫu `waitForIdle` sẵn có, mở rộng thành `waitForStatus`, `waitForEvent(n)`), hoặc dùng fake timer của vitest khi cần kiểm thử chính thời gian. Cấm `setTimeout` bằng lint rule, phạm vi áp dụng là `packages/*/tests`, trừ các module hỗ trợ trong danh sách trắng.
2. **Fixture replay dùng chung (dữ liệu tiền đề của kiểm thử).** Một hàm hỗ trợ kiểm thử dùng chung bọc lấy harness của agent loop, sao cho sau mỗi kiểm thử, session log của agent được replay vào một Session hoàn toàn mới và tự động khẳng định `deriveMessages()` bằng nhau. Nhờ vậy bất biến đó được kiểm tra hàng trăm lần trong mỗi lần chạy CI trên mọi kịch bản mà bộ kiểm thử sinh ra, thay vì chỉ hai lần.
3. **Kiểm thử áp lực tranh chấp hằng đêm.** Một CI job chạy bộ kiểm thử agent-loop và inbox với `vitest --repeat=200` (kèm `--shuffle`) để phơi bày các thất bại phụ thuộc lịch trình; mọi hiện tượng bất ổn phát hiện được đều coi là bug cần sửa, tuyệt đối không che lấp bằng cách thử lại.

## Kế hoạch

Biện pháp 1 và 2 triển khai cùng nhau (chúng sửa cùng các module hỗ trợ); chỉ thêm job hằng đêm sau khi bộ kiểm thử đã loại bỏ hết các lần ngủ, để đảm bảo chạy lặp lại đủ nhanh.

## Tiêu chí nghiệm thu

- Không còn dùng `setTimeout`; lint rule cưỡng chế trong `packages/*/tests`, trừ các module hỗ trợ trong danh sách trắng.
- Harness dùng chung replay session log của mỗi kiểm thử vào một `Session` hoàn toàn mới và tự động khẳng định `deriveMessages()` bằng nhau, phủ toàn bộ bộ kiểm thử.
- Job hằng đêm chạy bộ kiểm thử agent-loop và inbox với `--repeat` và `--shuffle`; mọi hiện tượng bất ổn phát hiện được đều được phân loại như bug, tuyệt đối không loại bỏ bằng cách thử lại.

## Rủi ro

Fake timer có tương tác tinh tế với việc lập lịch Promise trong agent loop — ưu tiên chờ theo sự kiện; chỉ dùng fake timer khi kiểm thử chính hành vi của dịch vụ timer.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
