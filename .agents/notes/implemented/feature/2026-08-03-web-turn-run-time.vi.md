# Agent Note: Thời lượng chạy của lượt Web và phần tử thời gian phụ hiển thị khi hover

Status: implemented

[English](2026-08-03-web-turn-run-time.md) | 中文

## Vấn đề

Giao diện chat Web hiển thị thời điểm đến của tin nhắn, nhưng không hiển thị agent (tác nhân thông minh) đã mất bao lâu để xử lý tin nhắn đó. Các lượt chạy dài không có tín hiệu tiến độ thời gian thực nào ngoài nhãn hoạt động tĩnh, và sau khi lượt kết thúc cũng không thể khôi phục lại thời gian thực tế đã dùng từ UI. Đồng thời, dòng đồng hồ luôn hiển thị lại tạo thêm nhiễu thị giác cho mỗi tin nhắn.

## Quyết định

Thời gian thực (wall time) của lượt dùng timestamp `turn/start` và `turn/end` đã có sẵn trong log, không thêm bất kỳ sự kiện session mới nào. Session phía client gộp mỗi cặp ranh giới trong cửa sổ đã tải vào `turnTimings`; sau khi lượt kết thúc, phần footer của assistant mang icon thao tác sẽ render `endTime - startTime` thành nhãn `Ran for {duration}` đã bản địa hóa. Đồng hồ `TurnStatus` đang chạy dùng bản ghi thời gian mới nhất chưa có thời điểm kết thúc, nên việc tải lại trang sẽ giữ nguyên thời lượng đã trôi qua, steering (dẫn dắt giữa chừng) không reset đồng hồ, còn retry thì bắt đầu từ ranh giới log riêng của nó. Cả hai chỗ đọc đều dùng chung một bộ định dạng bản địa hóa, và làm tròn xuống tới giây nguyên. Đồng hồ này chỉ xuất hiện sau 15 giây, và bị ẩn khỏi vùng live region, nên trình đọc màn hình sẽ thông báo trạng thái hoạt động chứ không lặp lại thông báo mỗi nhịp đồng hồ.

Các phần tử thời gian phụ (time chrome) như đồng hồ và thời lượng chạy chỉ hiển thị khi hover: container tin nhắn bật hành vi này tường minh qua thuộc tính `data-time-hover-root`, `MessageIconActions.module.css` hiển thị nhãn thời gian bằng hiệu ứng fade-in khi container ở trạng thái `:hover`/`:focus-within`. Quy tắc này giới hạn trong `@media (hover: hover)`, nên thiết bị cảm ứng vẫn giữ nhãn luôn hiển thị; việc ẩn/hiện dùng opacity (chứ không phải display), nên layout luôn ổn định. Icon copy và fork luôn hiển thị.

## Các phương án thay thế đã cân nhắc

**Suy ra thời gian từ node tin nhắn.** Có thể lấy timestamp gần nhất của user hoặc steering từ transcript (bản ghi văn bản) đã render, nhưng cách này tính sai các lượt retry, và khiến steering giữa lượt reset đồng hồ thời gian thực. Các sự kiện ranh giới lượt sẵn có cung cấp timestamp có thẩm quyền mà không cần thay đổi định dạng log.

**Neo đồng hồ thời gian thực vào thời điểm component mount.** Đơn giản hơn, nhưng tải lại trang giữa lúc lượt đang chạy sẽ khiến đồng hồ chạy lại từ đầu, và không khớp với nhãn footer cuối cùng. Chỉ khi `turn/start` nằm ngoài cửa sổ đã tải mới fallback về thời điểm mount.

**Ẩn toàn bộ dòng thao tác cho tới khi hover.** Copy và fork là các điểm truy cập thao tác đáng để người dùng khám phá, còn việc ẩn/hiện ở cấp toàn dòng có rủi ro gây dịch chuyển layout. Chỉ văn bản thời gian thụ động mới bị điều khiển ẩn/hiện bằng hover.

## Hệ quả

Thời lượng lượt hiển thị được cả khi đang chạy lẫn sau khi kết thúc, không cần sự kiện session mới; cả hai chỗ đọc dùng chung ranh giới log chính xác và cách định dạng. Thời lượng sau khi kết thúc bao gồm cả hoạt động sau đoạn văn bản assistant cuối cùng cho tới `turn/end`; nếu `turn/start` nằm ngoài cửa sổ đã tải, nhãn sẽ không hiển thị. Khi không tương tác, các phần tử thời gian phụ không còn tranh giành sự chú ý với nội dung tin nhắn, còn đồng hồ liên tục nhảy số cũng chỉ giữ hiệu ứng thị giác mà không bị thông báo lặp lại.
