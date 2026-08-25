# Agent Note: Cập nhật gia tăng nhánh base của PR

Status: implemented

[English](2026-07-26-incremental-pr-base-retargeting.md) | Tiếng Việt

## Vấn đề

Trong quá trình merge commit đầu nhánh base hiện tại của PR (Pull Request) vào nhánh PR, nhánh base có thể tiếp tục tiến lên phía trước. Nếu bắt đầu lại từ đầu với commit đầu nhánh mới, công sức giải quyết xung đột và xác thực đã hoàn thành sẽ bị bỏ đi. Việc viết lại một merge đã được push cũng sẽ xóa mất lịch sử có thể review.

## Quyết định

Khi chọn merge-forward, mỗi commit đầu nhánh base quan sát được sẽ được giữ lại như một checkpoint merge độc lập. Nếu nhánh base tiếp tục tiến lên trong lúc xử lý, hãy hoàn thành và xác thực merge đang thực hiện trước, rồi mới commit nó; nếu task được ủy quyền push, cũng phải hoàn thành bước push. Chỉ sau khi hoàn thành các bước này mới lấy base mới hơn, và merge nó vào bằng một merge commit riêng. Trong chuỗi merge-forward này, không được bỏ đi hay viết lại bất kỳ checkpoint nào.

[Quyết định về stack gốc và rebase tùy chọn](2026-08-02-native-github-stacks-and-optional-rebases.md) cũng cho phép PR độc lập hoặc PR trong stack dùng rebase được bảo vệ bởi lease, kể cả sau khi đã review. Bài viết này chỉ phụ trách đường đi merge-forward. [Skill (kỹ năng) landing stacked PR](../../../skills/dsh-merging-stacked-prs/SKILL.md) chọn một trong các cách cập nhật lịch sử này dựa theo [AGENTS.md](../../../../AGENTS.md) ở gốc repo, còn [hướng dẫn review stacked PR](../../../../docs/cookbook/responding-to-pr-review-on-a-stack.md) phụ trách việc lan truyền bản fix giữa các tầng phụ thuộc.

## Phương án thay thế đã cân nhắc

**Hủy công việc hiện tại, bắt đầu lại từ base mới nhất.** Điều này sẽ bỏ đi xung đột đã được giải quyết và quá trình xác thực đã hoàn thành, lặp lại công sức, và mất đi một điểm khôi phục hữu ích.

**Viết lại thành một merge duy nhất gồm cả hai commit đầu nhánh base.** Điều này sẽ che khuất thứ tự giải quyết xung đột; nếu lần merge đầu tiên đã được push, còn phải viết lại lịch sử remote.

## Hệ quả

- Khi base của PR tiến lên nhiều lần, PR này có thể chứa nhiều commit dùng để merge base.
- Công việc đã hoàn thành không bị bỏ đi, mà vẫn giữ được khả năng review và khôi phục.
- Việc merge base mới hơn sẽ thay đổi cây file sau khi merge, nên các kiểm tra liên quan sẽ chạy lại trước lần push tiếp theo.
