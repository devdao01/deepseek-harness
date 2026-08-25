# Agent Note: Render inline cho các trường một hàng của tool card

Status: implemented
Archived: 2026-08-04

[English](2026-07-27-tool-card-single-row-fields-inline.md) | 中文

## Problem

Tiêu đề, mô tả, cwd của tool card, cùng với phần echo lại lệnh sắp thực thi `$ <command>`, mỗi thứ đều là một hàng logic (logical line). Công cụ bash dùng trực tiếp lệnh và mô tả do model đưa ra để thiết lập tiêu đề (và mô tả) của card, và với script bash nhiều dòng, các nội dung này chứa ký tự xuống dòng thật. Trước đây các trường này được escape bằng `displayText`, hàm này cố ý giữ lại `\n` như một phần bố cục có cấu trúc (structural layout). Kết quả là tiêu đề nhiều dòng sẽ xuống dòng sang các dòng terminal bổ sung mà phần đếm số dòng của card không dự trù trước, khiến các dòng sau của tiêu đề đè lên mô tả, output, hoặc gợi ý steering của editor — card render thành văn bản chồng chéo lộn xộn. Sau khi loại bỏ gutter bar (xem [Agent Note về transcript có thể copy](../simplification/2026-07-27-copyable-transcript-no-gutter-bar.md)), các hàng này không còn nằm sau tiền tố từng dòng nữa, do đó xung đột này bị phơi bày ra.

## Decision

Các trường một hàng của card đổi sang dùng `displayInlineText` (escape `\n` thành `\x0a` theo nghĩa đen) thay vì `displayText`: bao gồm tiêu đề card, các dòng metadata `description` và `cwd` của terminal card, và phần echo lệnh sắp thực thi `$ <command>`. Mỗi trường đều được giữ nghiêm ngặt trong một hàng, vì vậy các lệnh nhiều dòng không còn xuống dòng và xung đột với các hàng liền kề nữa. Các trường thực sự nhiều dòng — output lệnh đã capture và phần thân kết quả `contentText` — vẫn giữ `displayText` kết hợp `split('\n')`, vì bản chất chúng vốn cần chiếm nhiều dòng.

## Alternatives considered

- **Loại bỏ ký tự xuống dòng trong output của presenter** (trong công cụ bash) — sẽ ẩn đi hình thái lệnh thật của model đối với mọi bên tiêu thụ view này, và nhét mối quan tâm về UI vào trong công cụ. Việc escape nên diễn ra ở nơi render một hàng.
- **Cho phép tiêu đề chủ động xuống nhiều dòng** — tiêu đề card là một định danh dạng một hàng; trừ khi bố cục lại toàn bộ card, tiêu đề nhiều dòng vẫn sẽ xung đột với các dòng metadata theo sau nó, đồng thời làm phình to transcript.

## Consequences

- Lệnh bash nhiều dòng render thành tiêu đề inline một hàng (`S=/tmp\x0aecho …`); phần mô tả, output và dòng exit code phía dưới vẫn giữ nguyên vẹn. Đã kiểm chứng thực tế trong tmux ở cả hai trạng thái sắp thực thi (`◌`) và đã hoàn tất (`✓`).
- `tui.spec.ts` đã thêm một case tool card `multilineTerminal`, khẳng định (assert) rằng tiêu đề và mô tả chứa ký tự xuống dòng sẽ xuất hiện dưới dạng đã escape inline.
