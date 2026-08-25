# Agent Note: Render Markdown cho generic card của TUI

Status: implemented
Archived: 2026-08-04

[English](2026-07-23-tui-generic-card-markdown.md) | 中文

## Problem

Bộ hiển thị công cụ (tool presenter) có thể ghi Markdown vào nội dung generic card (thẻ dạng chung), trong đó bao gồm output `console` dạng fenced dùng cho việc xác nhận tác vụ nền và lỗi thực thi. Render các nội dung này như plain text sẽ để lộ ký hiệu fenced marker, và không nhất quán với nội dung assistant cũng như nội dung user trong cùng một transcript (bản ghi văn bản).

## Decision

TUI trước tiên render nội dung kết quả của generic card bằng theme Markdown dùng chung, sau đó mới áp dụng giới hạn số dòng đầu/cuối của card. Terminal card và diff card vẫn giữ renderer plain text chuyên biệt riêng; input thô của generic card vẫn hiển thị nguyên văn (literal), vì nó đại diện cho tham số của công cụ, chứ không phải văn bản do presenter soạn ra.

Theme dùng chung ẩn cú pháp fenced, giữ lại nhãn ngôn ngữ tùy chọn, và tô màu phần thân fenced theo màu code. Việc render diễn ra trước khi cắt bớt (truncation), vì vậy số dòng và mô tả biên của card ở trạng thái thu gọn phản ánh số dòng terminal hiển thị được, chứ không phải số dòng của mã nguồn Markdown.

## Alternatives considered

**Loại bỏ fenced marker trong bộ hiển thị Bash.** Cách này chỉ sửa cho một nơi sản sinh, các generic card Markdown do công cụ khác tạo ra vẫn không được render, đồng thời khiến presenter phụ thuộc vào hành vi của TUI.

**Render mọi loại thẻ công cụ theo Markdown.** Output terminal và diff có định dạng chuyên biệt riêng, có thể chứa dấu câu Markdown cần được giữ nguyên văn.

**Áp dụng giới hạn số dòng của card thu gọn trước khi render Markdown.** Cắt theo dòng của mã nguồn có thể cắt ngang giữa một khối fenced, và khiến số dòng hiển thị không khớp với số dòng mà card thực sự sử dụng.

## Consequences

Generic tool card giờ dùng chung một bộ từ vựng Markdown và luồng làm sạch (sanitize) với nội dung hội thoại. Dấu câu Markdown trong generic card sẽ được diễn giải, thay vì luôn hiển thị nguyên văn như trước; công cụ nào cần output terminal nguyên văn sẽ dùng ý định render (render intent) là terminal card.

Test TUI có trọng tâm cố định (pin) việc ẩn fenced marker, giữ nhãn ngôn ngữ, và văn bản phần thân. Snapshot trạng thái terminal không cần khóa (keyless) qua TUI transcript đã được lắp ráp bao phủ hành vi này.
