# Agent Note: Báo cáo API extractor

Status: proposed

[English](2026-06-11-api-extractor-reports.md) | 中文

> Hai phần kiểm tra kiểu khối tài liệu và hệ thống phân loại sự kiện đã được triển khai ([bắt buộc bởi doc-sync (cổng đồng bộ tài liệu)](../../archived/process/2026-06-11-doc-sync-enforcement.md)); phần báo cáo API còn lại được hoãn lại như một đề xuất độc lập.

## Vấn đề

Thay đổi API công khai là vô hình: không có cơ chế nào biến "commit này đã thay đổi interface công khai" thành một sự thật tường minh, có thể review được. Người review khi đọc diff có thể bỏ sót việc một kiểu export nào đó được thêm field mới, hoặc chữ ký của một phương thức nào đó đã thay đổi.

## Đề xuất

Dùng api-extractor (hoặc `tsc --emitDeclarationOnly` cộng thêm một danh mục API công khai đã chuẩn hóa) để sinh cho mỗi gói một `etc/<pkg>.api.md` được commit vào repo; CI thất bại khi kết quả sinh lại không khớp với báo cáo đã commit. Nhờ vậy, mỗi lần thay đổi API công khai đều trở thành một dòng diff mà người review (hoặc agent (tác tử) review) bắt buộc phải nhìn thấy.

## Các phương án thay thế đã cân nhắc

**`tsc --emitDeclarationOnly` cộng thêm danh mục API công khai đã chuẩn hóa**: nếu api-extractor quá cồng kềnh, đây là cơ chế nhẹ hơn; cả hai đều thỏa mãn hình thái báo cáo "commit vào repo, có thể diff" mà đề xuất cần.

## Tiêu chí nghiệm thu

- Mỗi gói có một `etc/<pkg>.api.md` được commit vào repo; CI thất bại khi kết quả sinh lại không khớp với báo cáo đã commit.
- Thay đổi API công khai (thêm export mới, nới lỏng field, thay đổi chữ ký) có thể thấy được trong review dưới dạng dòng diff của báo cáo.

## Rủi ro

Phụ thuộc này cồng kềnh và khó điều chỉnh (đây chính là lý do nó bị hoãn lại), và định dạng báo cáo sẽ thay đổi theo mỗi lần nâng cấp compiler, tăng thêm một mặt phải bảo trì; ở giai đoạn các gói chưa được phát hành, lợi ích còn hạn chế.

## Lý do hoãn lại

Bị hoãn lại khi doc-sync được triển khai: đối với một monorepo nội bộ, người review đã có thể nhìn thấy diff source code, giá trị không cao; và phụ thuộc này cồng kềnh, khó điều chỉnh. Nếu các gói tương lai được phát hành ra ngoài, sẽ đánh giá lại — lúc đó một báo cáo interface công khai ổn định, có thể diff mới đáng để bỏ chi phí bảo trì.
