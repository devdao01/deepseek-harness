# Agent Note: Khám phá mờ (fuzzy) lệnh gạch chéo trên Web

Status: implemented

[English](2026-08-04-web-slash-command-fuzzy-discovery.md) | Tiếng Việt

## Vấn đề

Menu lệnh của Web yêu cầu khớp theo tiền tố tên lệnh, nên khi người dùng chỉ nhớ các chữ cái then chốt mà không nhớ vị trí chính xác của chúng thì không thể khám phá ra lệnh. Mở rộng phạm vi khớp của menu giúp lệnh dễ tìm hơn, nhưng việc thực thi lệnh vẫn phải giữ khớp chính xác và tính tất định: một dòng nhập gần đúng tuyệt đối không được thực thi một lệnh na ná.

## Quyết định

Source của lệnh `/` xem chuỗi truy vấn đã gõ như một dãy con (subsequence) có thứ tự, không phân biệt hoa thường, rồi khớp mờ với tên lệnh. Tiền tố chính xác tạo thành nhóm khớp được xếp hạng cao nhất. Trong mỗi nhóm khớp, điểm căn chỉnh càng cao càng được ưu tiên: ranh giới dấu phân cách và các ký tự liền kề làm tăng điểm, còn ký tự dẫn đầu và khoảng ngắt quãng làm giảm điểm; điểm bằng nhau thì giữ nguyên thứ tự của thư mục host và contribution từ client. Bộ lọc theo vị trí vẫn loại bỏ khỏi menu inline những lệnh nhận tham số, trước khi xếp hạng.

Bộ chấm điểm dùng quy hoạch động cho từng ứng viên, với độ phức tạp thời gian `O(query length × name length)` và độ phức tạp không gian `O(name length)`. Việc chấm điểm ứng viên chỉ diễn ra ở phía client và chỉ xét tên lệnh; mô tả lệnh không ảnh hưởng đến việc khớp. Menu lựa chọn vẫn phân phối đúng tên chính xác đã chọn, còn logic phán định cho phím cách và phím Enter vẫn yêu cầu token lệnh khớp chính xác.

## Các phương án đã cân nhắc

**Giữ nguyên chỉ khớp theo tiền tố.** Bị bác bỏ, vì vấn đề mà tính năng này muốn giải quyết — người dùng không nhớ chính xác tiền tố — vẫn còn nguyên: `/cpt` không thể khám phá ra `/compact`.

**Khớp ký tự không theo thứ tự hoặc khớp theo mô tả.** Bị bác bỏ, vì khớp không theo thứ tự thì khó đoán trước, còn khớp theo mô tả tuy có thể hiển thị lệnh nhưng tên hiển thị của lệnh lại không giải thích được thứ hạng của nó.

**Dùng một dependency tìm kiếm mờ đa dụng.** Bị bác bỏ, vì giao diện này chỉ cần một quy tắc dãy con hạn chế áp dụng cho một thư mục lệnh nhỏ; một chỉ mục tìm kiếm cấu hình được sẽ làm tăng kích thước bundle và mang vào những hành vi xếp hạng mà sản phẩm không dùng đến.

## Hệ quả

Người dùng có thể khám phá lệnh bằng những chữ cái mà họ nhớ theo đúng thứ tự; miễn thư mục lệnh không đổi thì thứ hạng vẫn ổn định. Việc chấm điểm là heuristic một cách có chủ ý: một kết quả khớp căn theo dấu phân cách có thể xếp trên một kết quả có khoảng trải nguyên gốc ngắn hơn. Test của package cố định từng yếu tố xếp hạng cùng thứ tự ổn định khi điểm bằng nhau, còn snapshot phát lại Web sau khi lắp ráp cố định hành vi `/cpt` phân giải thành `/compact`. Ngữ nghĩa thực thi chính xác giữ nguyên không đổi.
