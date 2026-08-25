# Agent Note: doc-sync đi qua bộ điều phối gate

Status: implemented

Archived: 2026-07-26

[English](2026-07-21-doc-sync-through-gate-scheduler.md) | 中文

## Vấn đề

`pnpm run doc-sync` trước đây là một chuỗi 24 subcommand `pnpm run` nối với nhau bằng `&&`. Mỗi mắt xích đều phải trả trước một lượt khởi động đầy đủ lớp wrapper pnpm (phân giải workspace, tìm script, khởi động tsx) rồi mới tới bản thân script; đo thực tế trên máy dev, 24 script chạy tổng cộng khoảng 34 giây, còn dạng chuỗi mất khoảng 3 phút, và độ trễ của lớp wrapper cũng tái hiện y hệt trên đĩa local, nên mọi developer và mọi làn CI đều phải trả chi phí này, không chỉ riêng checkout trên hệ thống file mạng. Chuỗi này còn thực thi tuần tự, dù các gate thành viên đều chỉ đọc và độc lập với nhau; nó cũng đang âm thầm lệch khỏi [scripts/run-gates.ts](../../../../scripts/run-gates.ts): khi danh mục API runtime ra đời, `verify-cordis-api` được thêm vào chuỗi, nhưng chưa bao giờ được thêm vào `docSyncLeafGates`, khiến CI chưa bao giờ gác cổng độ mới của danh mục đó.

## Quyết định

`doc-sync` trong `package.json` giao lại cho bộ điều phối có giới hạn (bounded scheduler) sẵn có — `tsx scripts/run-gates.ts doc-sync` — nhất quán với cách làm của các script `check:ci:*` ([điều phối gate song song](2026-07-06-parallel-pre-push-gates.md), [topology CI hiện tại](2026-07-22-evidence-based-larger-hosted-runners.md)). Chế độ `doc-sync` mở rộng đúng thành `docSyncLeafGates()`, khiến danh sách leaf trong `run-gates.ts` trở thành nguồn sự thật duy nhất cho tập thành viên. Chế độ local đặt trần đồng thời mặc định là bốn worker, vì nhiều gate tài liệu đều tự build một `ts.Program` đầy đủ; `DSH_GATE_CONCURRENCY` vẫn có thể ghi đè.

`docSyncLeafGates` bao gồm `verify-cordis-api`, nên kiểm tra tài liệu local liên quan và CI sẽ cùng với các tài liệu sinh khác gác cổng danh mục API runtime đã sinh.

## Các phương án thay thế đã cân nhắc

- **Giữ chuỗi `&&`, chỉ bổ sung leaf còn thiếu** — sửa được độ lệch hiện tại, nhưng vẫn giữ hai danh sách thành viên sẽ tiếp tục lệch nhau, và vẫn giữ 24 lần khởi động wrapper pnpm tuần tự.
- **`scripts/doc-sync.ts` chuyên dụng import các module kiểm chứng trong một tiến trình duy nhất** — có thể tiết kiệm cả việc khởi động tsx cho từng gate, nhưng cần cải tạo toàn bộ 24 script từ import-tức-thực-thi thành entry có thể gọi được, và sẽ mất khả năng đo thời gian theo từng gate, cô lập và nhóm lỗi của bộ điều phối; trong khi việc tránh khởi động wrapper mà bộ điều phối đã làm được mới là phần chi phí lớn nhất.
- **Dùng vòng lặp shell chạy `tsx scripts/*.ts`** — tránh khởi động wrapper pnpm với chi phí thấp, nhưng lại thêm một bộ từ vựng thực thi thứ hai bên cạnh bộ điều phối mà CI đã dùng, và không có bất kỳ khả năng lập lịch hay báo cáo nào của nó.

## Kết quả

Chi phí của một lần `pnpm run doc-sync` chuyển từ 24 lần khởi động wrapper cộng tổng toàn bộ thành viên, thành một lần khởi động wrapper cộng chuỗi phụ thuộc chậm nhất trong các gate thành viên. Thêm gate tài liệu mới chỉ cần sửa một chỗ trong `docSyncLeafGates` (cộng thêm chính package script để có thể chạy thủ công riêng lẻ); `package.json` vẫn giữ các script `verify-*` làm từ vựng chạy thủ công từng gate riêng lẻ. Output của bộ điều phối đo thời gian theo từng gate, khi doc-sync chậm đi có thể chỉ thẳng vào gate chiếm phần lớn thời gian. Output của `pnpm run doc-sync` chuyển từ output tuần tự theo từng lệnh thành output xen kẽ của bộ điều phối; công cụ phân tích output này phải dựa vào dòng tóm tắt `run-gates:` làm chuẩn.
