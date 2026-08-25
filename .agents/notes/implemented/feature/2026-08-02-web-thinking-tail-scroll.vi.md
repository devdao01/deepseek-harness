# Agent Note: Cuộn đuôi phần thinking trên Web — reasoning ở trạng thái thu gọn bám theo output thời gian thực

Status: implemented

[English](2026-08-02-web-thinking-tail-scroll.md) | Tiếng Việt

## Vấn đề

Dòng Think trên Web render dòng đầu tiên của reasoning thành phần tóm tắt thu gọn, cả ở block đã quyết toán lẫn block đang stream. Một khi dòng đầu xuất hiện, mọi delta reasoning về sau chỉ làm thay đổi phần thân bị ẩn. Vì vậy, model nhanh trông như đứng yên khi đang suy nghĩ, và người dùng phải mở toàn bộ chuỗi suy luận mới xác nhận được rằng output vẫn đang tiến triển. Bảng hạng mục sản phẩm vốn đã yêu cầu "thinking: cuộn hiển thị cập nhật chuỗi suy luận, có thể mở rộng"; dòng hiện tại mới chỉ đáp ứng nửa sau.

## Quyết định

Chỉ dòng Think có block reasoning là đuôi stream hiện tại và vẫn đang ở trạng thái thu gọn mới bám theo output thời gian thực. Phần tóm tắt của nó dùng dòng không rỗng mới nhất, thay vì dòng đầu tiên sau khi quyết toán; phần tử tóm tắt một dòng sẵn có trở thành vùng cuộn ngang được điều khiển bằng chương trình, ghim tại `scrollWidth - clientWidth` sau mỗi lần văn bản cập nhật. Ở đây cố ý gán trực tiếp `scrollLeft`, để chuyển động được đẩy đi bằng delta thật chứ không bịa ra một tốc độ marquee độc lập: token nhanh thì di chuyển nhanh, model dừng thì đứng lại, và văn bản ngắn thì đứng yên vì phạm vi cuộn bằng không.

Hành vi này thuộc quyền sở hữu của các component trình bày sẵn có. `AssistantMarkdown` chỉ chọn dòng mới nhất khi chạy trong dòng Think; `ToolRow` vốn đã sở hữu trạng thái thu gọn/mở rộng, nên nó quyết định phần tóm tắt có bám theo đầu mút trong dòng hay không. Không thay đổi session, wire, sự kiện bền vững hay quy ước mà model nhìn thấy. Việc mở rộng sẽ gỡ bỏ phần tóm tắt thu gọn và đưa toàn bộ thân reasoning vào luồng trang thông thường. Sau khi dòng đó quyết toán, nó khôi phục dòng đầu ổn định, đồng thời đưa phần tóm tắt về sát mép trái. Các phần tóm tắt tool khác và các dòng Think đã quyết toán vẫn giữ hành vi dấu ba chấm như cũ.

## Các phương án thay thế đã cân nhắc

**Chạy một marquee CSS không liên quan gì đến output đang stream.** Bác bỏ: nó sẽ tiếp tục di chuyển khi provider dừng lại, khiến model chậm trông như nhanh, phá hỏng đúng tín hiệu thông lượng mà tương tác này lẽ ra phải bộc lộ.

**Luôn hiển thị một hậu tố cố định của toàn bộ chuỗi reasoning.** Bác bỏ: cắt theo ký tự có thể cắt đứt từ hoặc grapheme, làm mất phần đầu của dòng hiện tại trước khi nội dung thực sự tràn, và nó chỉ nhảy giật chứ không di chuyển theo từng delta.

**Tự động cuộn phần thân reasoning đã mở rộng hoặc cuộn trang hội thoại.** Bác bỏ: nội dung đã mở rộng là giao diện để đọc, việc ép bám theo sẽ tranh chấp cuộn với người dùng đang xem ngược lên trên; bộ bám theo chỉ thuộc về phần tóm tắt một dòng ở trạng thái thu gọn.

## Hệ quả

Dòng thu gọn giờ truyền đạt nhịp độ của provider bằng cả chuyển động nội dung lẫn hiệu ứng quét sáng sẵn có, trong khi transcript sau khi quyết toán vẫn ổn định đến từng byte. Cập nhật cuộn chỉ diễn ra trong các lần render React mà bộ tích lũy stream vốn đã kích hoạt; không thêm timer, vòng lặp animation, subscription, trạng thái bền vững hay lưu lượng truyền tải nào. Dòng reasoning hiện tại dài hơn vẫn giữ nguyên toàn bộ văn bản trong DOM, chỉ cắt bỏ phần tiền tố đã tràn bằng chương trình, nên việc mở rộng vẫn hiển thị đầy đủ block, và công nghệ trợ giúp vẫn đọc đúng phần văn bản tóm tắt hiện tại đó.

## Kiểm thử

`packages/client/ui-conversation/tests/reasoning-row.client.spec.tsx` cố định việc chọn dòng mới nhất, vị trí cuộn mép phải được tính ra, cùng việc khôi phục dòng đầu và `scrollLeft = 0` sau khi quyết toán. Kịch bản Chromium ở trạng thái đã lắp ráp, không cần khóa, trong `apps/web/tests/lifecycle-chrome.e2e.ts` phát lại các chunk reasoning ghi thật với nhịp độ quan sát được, thu hẹp viewport đến mức phần tóm tắt bị tràn, và khẳng định dòng Think thu gọn thời gian thực chạm tới biên cuộn của trình duyệt thật. Golden replay ở trạng thái đã quyết toán của nó giữ nguyên, chứng minh quy ước tóm tắt lịch sử vẫn ổn định.
