# Agent Note: Footer TUI hiển thị tỷ lệ cache hit của session

Status: implemented

Archived: 2026-07-26

[English](2026-07-21-tui-footer-cache-hit-rate.md) | 中文

## Problem

Footer trước đây tổng hợp lượng token đã dùng của session thành `↑<input> ↓<output>`, trong đó `↑` là input chưa được cache mà model báo cáo. Các mục đếm của `TokenUsage` không chồng lấn nhau: token input tính phí bao gồm `inputTokens` (chưa cache) cộng với `cacheReadTokens` và `cacheWriteTokens`. Chỉ hiển thị con số chưa cache khiến người dùng không thể biết mỗi lượt prompt có bao nhiêu phần được nhà cung cấp cache đảm nhận — mà đây chính là tín hiệu phản ánh rõ nhất việc prefix request được tái sử dụng có hiệu quả hay không. Trong các session dài chủ yếu là cache read, `↑` luôn nhỏ, che giấu sự thật rằng prompt thực ra rất lớn nhưng rẻ.

## Decision

Footer thêm `cache <rate>%` sau `↑<input> ↓<output>`, tỷ lệ này là phần token input tính phí do nhà cung cấp cache đảm nhận.

- `TokenTotals` cộng dồn bốn nhóm không chồng lấn (`input`, `output`, `cacheRead`, `cacheWrite`). `addUsage` gộp `TokenUsage` của một lần gọi vào tổng, `cacheReadTokens`/`cacheWriteTokens` bị thiếu được coi là zero.
- `cacheHitRate(totals)` là `round(cacheRead / (input + cacheRead + cacheWrite) * 100)`, trả về `undefined` khi chưa có input tính phí nào. Khi tỷ lệ là `undefined`, `FooterComponent` sẽ bỏ hẳn đoạn `  cache N%`, do đó session rỗng sẽ không hiển thị số 0 vô nghĩa.
- `↑` vẫn thể hiện input chưa cache, không phải input tính phí: footer tuân thủ nhất quán quy ước các nhóm không chồng lấn trong suốt, tín hiệu tái sử dụng còn thiếu được bù đắp bởi phần trăm cache.
- Khi mount, tổng được xây dựng lại từ `sessionTokens`, hàm này cộng dồn các sự kiện `assistant/message` có usage (không bao giờ dùng `assistant/chunk`, để tránh đếm trùng); sau đó mỗi sự kiện `assistant/message` mang usage sẽ cập nhật theo thời gian thực.

## Alternatives considered

**Dùng input tính phí (`input + cacheRead + cacheWrite`) làm `↑`, không tách riêng phần trăm.** Từ chối: điều này sẽ làm `↑` lệch khỏi nhóm `inputTokens` không chồng lấn mà phần còn lại của harness báo cáo, và vẫn giấu đi tỷ lệ tái sử dụng mà người dùng thực sự muốn biết; suy ra một tỷ lệ phần trăm vừa bổ sung tín hiệu, vừa không thêm ý nghĩa vào số đếm.

**Dùng tổng toàn bộ token (`input + output + cache`) làm mẫu số để tính tỷ lệ.** Từ chối: output token không bao giờ được cache đảm nhận, đưa nó vào mẫu số chỉ vô nghĩa kéo thấp tỷ lệ; tỷ lệ cache hit là thuộc tính của prompt.

**Bỏ `cacheWrite` khỏi mẫu số.** Từ chối: cache write là input tính phí mà nhà cung cấp phải trả để lấp đầy cache, loại bỏ nó sẽ làm tăng ảo tỷ lệ hit trong lượt ghi. DeepSeek hiện chưa báo cáo chỉ số cache write, nhưng công thức vẫn giữ tính tổng quát, đường ghi cũng có bao phủ.

**Render `cache 0%` trên session rỗng.** Từ chối: lúc này input tính phí là `0`, tỷ số là `0/0`, hiển thị `0%` trên một session hoàn toàn mới là nói dối về một giá trị chưa tồn tại; đoạn này luôn ẩn cho đến khi có input tính phí.

**Cho chỉ số này một phần tử footer căn phải riêng, đặt sát `tools:`.** Từ chối: nó được suy ra từ số đếm token liền kề, đọc theo thứ tự `input → output → cache` là mượt nhất; nhóm bên trái cũng giúp chỉ báo `tools:` có độ ưu tiên thấp hơn trở thành phần tử bị cắt bỏ đầu tiên khi thiếu chiều rộng, nhất quán với thứ tự ưu tiên bố cục sẵn có của footer.

## Consequences

- Đoạn bên trái có thêm `  cache N%`, do đó trên terminal hẹp, trạng thái `tools:` bên phải bị cắt sớm hơn. Điều này tuân theo chiến lược cắt ưu tiên đoạn trái sẵn có của footer, là một đánh đổi chấp nhận được.
- Chỉ số này là trạng thái UI thời gian thực dạng "cố gắng hết sức" (best-effort), được suy ra từ usage của `assistant/message`: được xây dựng lại từ session khi mount, sau đó cập nhật theo thời gian thực, không bao giờ được lưu bền vững.
- `packages/ui/tui/src/index.ts` giữ mức bao phủ 100% cho một file duy nhất.
- Snapshot terminal của `examples/tui-agent` có đoạn này: lượt có cache read được render như `cache 49%`, lượt cold-start đầu tiên được render là `cache 0%`.

## Testing

`packages/ui/tui/tests/tui.spec.ts` chạy footer thông qua `createTuiChat` thật: session rỗng render `↑0 ↓0` và không có đoạn cache (đường ẩn), lượt cold-start (chỉ có `inputTokens`) render `cache 0%`, sau đó lượt hot thời gian thực mang `cacheReadTokens` và `cacheWriteTokens`, cập nhật thành `cache 60%` và không còn hiển thị `cache 0%`. Bộ snapshot của `examples/tui-agent` phát lại theo output kỳ vọng đã ghi hình và pass.
