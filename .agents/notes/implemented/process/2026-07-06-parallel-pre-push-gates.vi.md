# Agent Note: Gate pre-push song song

Status: implemented

[English](2026-07-06-parallel-pre-push-gates.md) | 中文

Phần hook cục bộ trong note này đã được thay thế bởi [Git hook cục bộ nhanh](2026-07-22-fast-local-git-hooks.md). Bộ lập lịch gate có giới hạn và cơ chế song song `publint` theo từng package vẫn được dùng cho CI, `doc-sync` và các lệnh cục bộ tường minh.

## Vấn đề

Các tác vụ tổng hợp như đồng bộ tài liệu ẩn đi một chuỗi nối tiếp rất dài, trong đó mỗi kiểm tra chỉ đọc và độc lập với nhau. Việc lặp lại danh sách lá này trong workflow YAML sẽ tạo nhiều vị trí có thể trôi dạt khi script tương lai thay đổi; còn chạy nối tiếp các kiểm tra phát hành package sẽ khiến thời gian của một gate tỷ lệ thuận với số lượng package.

## Quyết định

[scripts/run-gates.ts](../../../../scripts/run-gates.ts) sở hữu bộ lập lịch có giới hạn dùng cho CI, `doc-sync` và lệnh `check:all` bật theo yêu cầu. Nó mở rộng các mẫu (pattern) được đặt tên thành gate lá, từ chối đồ thị phụ thuộc rỗng hoặc mập mờ trước khi khởi động tiến trình con, tuân thủ phụ thuộc sản phẩm (artifact), đệm output có thể quy trách nhiệm, báo cáo riêng kết quả thoát tiến trình và kết thúc do tín hiệu, và chấp nhận `DSH_GATE_CONCURRENCY` khi bên gọi cần trần worker khác.

Tác vụ tiêu thụ Node 24 dùng một mẫu duy nhất gồm bảy gate, thay vì một pool tiến trình do shell quản lý. Số worker mặc định của nó bằng số gate, nhưng gate nào sẵn sàng lại do quan hệ phụ thuộc kiểm soát: `publint` chạy trước khi xác thực invariant package đã build; replay snapshot, type check NodeNext, smoke test built-bin và lint đều chờ việc xác thực đó hoàn tất. Lint phải chờ vì bộ xác thực invariant tạm thời stage view package, và linter không được duyệt qua các view đó; kiểm tra tương thích mã nguồn có thể chạy chồng lấn với chuỗi xác thực này.

[scripts/publint-all.ts](../../../../scripts/publint-all.ts) phát hiện package từ `packages/<group>/<pkg>`, và chạy `publint` với pool worker có kích thước xác định theo `availableParallelism()`. `DSH_PUBLINT_CONCURRENCY` có thể giới hạn hoặc tăng số worker để phù hợp với cấu hình tài nguyên khác nhau giữa máy cục bộ và CI runner. Kết quả được đệm theo từng package và in theo thứ tự package xác định, do đó việc thực thi song song không làm xáo trộn khối log của từng package.

Script package của từng gate vẫn là điểm vào lệnh dùng cho việc chạy cục bộ tạm thời. `hygiene` tiếp tục là chuỗi tổng hợp `&&`, còn danh sách thành viên của `doc-sync` do bộ lập lịch quản lý ([chạy doc-sync qua bộ lập lịch gate](../../archived/process/2026-07-21-doc-sync-through-gate-scheduler.md)).

## Kiểm chứng

[scripts/run-gates.spec.ts](../../../../scripts/run-gates.spec.ts) từ chối đồ thị không hợp lệ trước khi executor chạy, chốt danh sách tiêu thụ và cạnh phụ thuộc, và xác thực việc kết thúc do tín hiệu qua tiến trình con thật. [scripts/publint-all.spec.ts](../../../../scripts/publint-all.spec.ts) từ chối export công khai bị thiếu trước khi bên tiêu thụ sản phẩm hạ nguồn chạy.

## Phương án thay thế đã từng cân nhắc

- **Giữ job tổng hợp chạy nối tiếp**: thực thi đơn giản hơn, nhưng thời gian thực tế bằng tổng của từng kiểm tra độc lập, và lặp lại việc khởi động wrapper lệnh.
- **Mỗi gate lá khai báo một job CI**: phơi bày mức song song workflow tối đa, nhưng lặp lại chi phí checkout, setup và cài đặt, và sao chép danh sách bộ lập lịch trong YAML.
- **Chạy sub-command nền trong script shell**: có thể xử lý song song, nhưng mất khả năng đo thời gian từng gate, phân nhóm lỗi tất định, và xử lý tín hiệu trực tiếp.
- **Mỗi package khai báo một job `publint`**: phơi bày mức song song cấp package tối đa, nhưng tạo ra danh sách package phải bảo trì thủ công, trôi dạt khi package thay đổi.
- **Chạy `publint` với concurrency không giới hạn**: dù có thể rút ngắn tối đa thời gian cho repo nhỏ, nhưng đánh cược vào số lượng tiến trình, áp lực bộ nhớ, chi phí tạo tarball package và khả năng đọc log.

## Hệ quả

Thời gian của lệnh được bộ lập lịch hỗ trợ phụ thuộc vào chuỗi phụ thuộc chậm nhất, chứ không phải tổng của từng gate độc lập, và sẽ báo cáo gate quyết định tổng thời gian. Đồ thị không hợp lệ sẽ thất bại ngay, không chạy một phần trước. Cái giá phải trả là duy trì một bộ lập lịch tùy chỉnh với danh sách mẫu tường minh.

Chuỗi xác thực này khiến bên tiêu thụ hạ nguồn dùng sản phẩm đã khôi phục và lint bị trì hoãn khởi động cho đến khi view sản phẩm dùng chung được xác nhận hợp lệ và việc stage tạm thời đã dọn sạch; các gate hạ nguồn này vẫn có thể chồng lấn nhau khi chạy.

`publint-all.ts` dùng thực thi bất đồng bộ và đệm output lệnh, thay vì kế thừa stdio thời gian thực. Đổi lại là song song cấp package với thứ tự output ổn định, và một biến môi trường duy nhất để điều chỉnh tài nguyên.
