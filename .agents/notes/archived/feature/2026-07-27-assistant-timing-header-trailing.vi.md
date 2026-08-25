# Agent Note: Assistant timing line renders after the message body

Status: implemented

Archived: 2026-08-04

[English](2026-07-27-assistant-timing-header-trailing.md) | 中文

## Problem

Tin nhắn assistant của TUI trước đây bắt đầu bằng một dòng, ghép nhãn `Assistant` và chuỗi thời gian của bước lại với nhau (`Assistant · Model wait 0.0s · Completed …`). Thời gian đặt trước nội dung khiến dữ liệu thời lượng xa rời câu trả lời mà nó mô tả; sau khi hoàn tất, dòng đầu của câu trả lời còn bị đè xuống dưới bởi một dòng metadata mà người đọc thường bỏ qua.

## Decision

**Tách nhãn khỏi thời gian; thời gian render như dòng cuối cùng của tin nhắn.**

`AssistantMessageComponent` (packages/ui/tui/src/index.ts) nay đặt nhãn `Assistant` in đậm làm dòng đầu, và đặt chuỗi thời gian tối màu (vẫn được `StreamingAssistantComponent.rebuild()` lắp ráp thành `header`, khi settled có hậu tố `· Completed …`) làm node con cuối cùng, nối vào sau reasoning và nội dung. Nội dung thời gian, hành vi ẩn khoang giá trị bằng không, và thời điểm hoàn tất đều không thay đổi — chỉ có vị trí chuyển từ đầu xuống cuối tin nhắn.

## Alternatives considered

**Chuyển toàn bộ dòng tiêu đề (bao gồm nhãn) xuống cuối.** Bác bỏ: nhãn `Assistant` cho người đọc biết ai đang nói, nên đặt ở đầu giống nhãn `You`; chỉ có metadata kiểu thời gian mới được hưởng lợi từ việc đặt ở cuối.

**Thời gian vẫn nội tuyến, nhưng làm dòng thứ hai ở đầu, dưới nhãn.** Bác bỏ: điều này vẫn tách dữ liệu thời lượng khỏi câu trả lời đã hoàn tất, và giữ lại hai dòng metadata giữa gợi ý và câu trả lời.

## Consequences

Mỗi tin nhắn assistant được đọc theo thứ tự nhãn → reasoning → câu trả lời → thời gian, thời gian hoàn tất nằm sát ngay câu trả lời mà nó đo lường. Bộ bản chụp nhanh TUI không cần khóa đã được làm mới, cố định bố cục mới trong mỗi fixture; bốn chỗ trong `tui.spec.ts` trước đây khớp chuỗi nội tuyến cũ `Assistant · Model wait …` nay được đổi thành khẳng định riêng nhãn và thời gian, vì hai thứ này không còn được render liên tiếp nhau nữa.
