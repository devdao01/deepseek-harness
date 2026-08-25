# Agent Note: Kiểm thử đột biến như một đối trọng của độ phủ

Status: proposed

[English](2026-06-11-mutation-testing.md) | Tiếng Việt

## Vấn đề

Cổng gác độ phủ 100% theo từng tệp ([quyết định về cổng gác chất lượng](../../implemented/process/2026-06-11-quality-gates.md)) chứng minh mọi dòng mã đều *được thực thi* trong kiểm thử, nhưng không chứng minh được rằng nếu dòng đó sai thì có khẳng định nào nhận ra hay không. Trong bối cảnh agent (tác tử) viết kiểm thử, áp lực về độ phủ có thể sinh ra những kiểm thử "chạy nhưng không khẳng định". Kiểm thử đột biến đo đúng cái mà độ phủ không đo được: liệu bộ kiểm thử có *giết* được các khiếm khuyết được tiêm vào có chủ ý hay không.

## Đề xuất

Dùng Stryker (`@stryker-mutator/vitest-runner`) chạy kiểm thử đột biến trên `packages/*/src`:

- **Chạy gia tăng theo phạm vi PR (Pull Request)** (chỉ các tệp thay đổi), như một CI job. Sau khi tinh chỉnh thì đủ nhanh để làm cổng gác hợp nhất.
- **Chạy toàn bộ hằng đêm**, theo dõi điểm đột biến; ghi lại baseline trước, rồi đặt ngưỡng bằng baseline quan sát được và chỉ tăng không giảm (nhất quán với chính sách độ phủ: ngưỡng chỉ siết chặt).
- Các thể đột biến sống sót là việc cần làm: agent chọn một thể sống sót, viết kiểm thử giết nó, rồi lặp lại — một vòng khép kín phù hợp để thực thi tự chủ.
- Các thể đột biến tương đương (những thể chứng minh được là không đổi hành vi) được loại trừ bằng chú thích kèm lý do, nhất quán với chính sách `/* v8 ignore */`.

## Kế hoạch

1. Thêm cấu hình Stryker, giới hạn phạm vi ở một gói là llm (nhỏ nhất, mang tính thuật toán nhất), và đo thời gian chạy.
2. Mở rộng ra mọi gói; ghi lại điểm baseline trong cấu hình.
3. Đưa vào job hằng đêm; sau khi thời gian chạy chấp nhận được thì thêm job gia tăng theo phạm vi PR.

## Tiêu chí nghiệm thu

- Cấu hình Stryker chạy trên `packages/*/src` với vitest runner; job hằng đêm ghi lại điểm đột biến và dùng ngưỡng chỉ tăng không giảm, tác vụ thất bại khi điểm thấp hơn baseline đã ghi.
- Lần chạy gia tăng theo phạm vi PR trở thành cổng gác hợp nhất sau khi thời gian chạy chấp nhận được; nếu không thì quyết định rõ ràng chỉ giữ lần chạy hằng đêm, và ghi kết luận đó tại đây.
- Các thể đột biến tương đương có chú thích loại trừ kèm lý do, nhất quán với chính sách `/* v8 ignore */`.

## Rủi ro

Thời gian chạy: kiểm thử đột biến tốn kém; độ phủ 100% theo từng tệp có ích (mỗi thể đột biến ít nhất đều được thực thi tới). Nếu lần chạy theo phạm vi PR luôn quá chậm, thì giữ chế độ chỉ chạy hằng đêm, dựa vào cơ chế chỉ tăng không giảm của ngưỡng điểm đột biến.

<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
