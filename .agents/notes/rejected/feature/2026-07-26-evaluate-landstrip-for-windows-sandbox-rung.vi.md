# Agent Note: Đánh giá landstrip trước khi xây launcher sandbox cho Windows

Status: rejected — landstrip chưa được kiểm chứng qua thực chiến (tại thời điểm bác bỏ mới ra mắt vài ngày, chỉ có một maintainer, khoảng 48 sao trên GitHub); phụ thuộc liên quan đến bất biến an toàn (security invariant) phải được xác minh qua mức độ áp dụng rộng rãi, do đó kế hoạch ban đầu — tự xây launcher cho tầng win32 — vẫn được giữ nguyên

[English](2026-07-26-evaluate-landstrip-for-windows-sandbox-rung.md) | Tiếng Việt

## Vấn đề

[Quyết định sandbox](../../implemented/feature/2026-07-06-sandbox.md) để trống `PLATFORM_CHAINS.win32`, và dự định lấp đầy bằng "một runner giới hạn thuộc họ AppContainer/restricted-token, phát hành theo khuôn mẫu `node-addon-landlock-run` từ repo riêng của nó" — một repo mới ước tính khoảng 1.500 dòng, cần tự viết và tự bảo trì (subtree landlock-run hiện khoảng 1.460 dòng C/TS/script/test, chưa kể tài liệu và CI).

Kể từ khi bản ghi quyết định đó được viết ra, đã xuất hiện một runner bên thứ ba được duy trì liên tục: `@landstrip/landstrip` (package npm, đang phát triển tích cực, lõi Rust, kèm `optionalDependencies` được build sẵn theo từng nền tảng) bao phủ Landlock + seccomp trên Linux, Seatbelt trên macOS, và AppContainer/restricted user trên Windows, hỗ trợ đầu vào policy dạng JSON/YAML cùng kênh báo cáo từ chối dựa trên trap-fd. Nó dùng cách bọc exec giống bwrap, nên khớp với hình dạng `confine(argv)` của chain mà không cần đụng đến tầng Linux/macOS.

## Đề xuất

Khi giai đoạn sandbox cho Windows khởi động, trước khi bắt tay viết repo launcher AppContainer tự xây, hãy đánh giá việc bọc backend Windows của landstrip thành một runner chain `win32`. Đánh giá phải trả lời được:

- **Tổng hợp probe.** landstrip không có `--probe`; quy ước dò tính năng mà chain yêu cầu phải được tổng hợp từ một lần chạy trap.
- **Ánh xạ phương ngữ.** Hai loại phương ngữ stderr — từ chối và lỗi runner — cùng cách phân loại exit code khi fail-closed, đều cần được ánh xạ tường minh sang từ vựng của chain.
- **Giấy phép.** File nhị phân của nó dùng giấy phép LGPL-2.1-or-later; cần rà soát phân phối trước khi đưa vào closure phụ thuộc đi kèm sản phẩm phát hành.
- **Mã nguồn và hồ sơ build.** Mỗi file nhị phân launcher tự xây đều được khóa từng byte với một file C khoảng 300 dòng có thể rà soát toàn bộ, build bằng CI gốc; trong khi landstrip là một tập hợp file nhị phân Rust trong tay một maintainer duy nhất. Với *tầng Linux hiện có*, sự đánh đổi này đã có kết luận từ lâu — không thay thế nó (xem [Agent Note về sandbox](../../implemented/feature/2026-07-06-sandbox.md) và bản ghi di trú của chính launcher đó khi loại bỏ phụ thuộc Rust). Nhưng với một tầng ta chưa xây, việc chọn giữa duy trì bởi bên thứ ba và một repo native tự xây thứ hai vẫn là câu hỏi thực sự còn bỏ ngỏ.

## Phương án thay thế đã cân nhắc

- **Xây launcher AppContainer tự viết theo đúng kế hoạch ban đầu.** Nếu đánh giá không đạt về giấy phép, khả năng rà soát mã nguồn/build, hoặc mức độ khớp probe, đây vẫn là lựa chọn mặc định; cái giá phải trả là duy trì lâu dài một repo launcher an toàn native thứ hai.
- **Đổi cả tầng Linux Landlock sang dùng landstrip.** Bị bác bỏ trực tiếp: tính đúng đắn của sandbox là một bất biến an toàn, launcher hiện tại có mã nguồn C có thể rà soát, file nhị phân của nó được khóa từng byte với build từ CI gốc, và chính vì lý do đó nó đã được di trú để thoát khỏi phụ thuộc Rust.

## Tiêu chí nghiệm thu

- Trước khi bất kỳ hiện thực nào cho tầng Windows bắt đầu, phải có một bản đánh giá ghi lại câu trả lời cho các vấn đề về probe, phương ngữ, giấy phép, repo mã nguồn, quy trình phát hành và build nhị phân, đồng thời đưa kết luận "áp dụng/không áp dụng" (go/no-go) vào kế hoạch giai đoạn hoãn lại của Agent Note về sandbox.

## Rủi ro

- Chuỗi cung ứng chỉ có một maintainer duy nhất, ở vị trí liên quan an toàn then chốt — đây chính là lý do đề xuất này được đặt thành một cổng đánh giá, chứ không phải một quyết định áp dụng.
- Package này còn khá non trẻ; API và cách đóng gói của nó có thể còn thay đổi nhiều trước khi giai đoạn Windows khởi động, khi đó cần đối chiếu lại với registry trực tuyến.
