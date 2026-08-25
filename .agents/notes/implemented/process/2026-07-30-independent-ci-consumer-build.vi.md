# Agent Note: Build độc lập cho bên tiêu thụ CI

Status: implemented

[English](2026-07-30-independent-ci-consumer-build.md) | Tiếng Việt

## Vấn đề

[Cấu trúc topology runner lớn](2026-07-22-evidence-based-larger-hosted-runners.md) phân bổ danh sách gate tĩnh và danh sách bên tiêu thụ sau-build cho các job khác nhau, nhưng job tĩnh lại đảm nhiệm phần build mà cả hai bên cùng dùng. Job tĩnh phải đợi mọi gate tĩnh hoàn tất mới upload cây thư mục đã sinh, còn job tiêu thụ lại khai báo phụ thuộc cấp job trước khi khôi phục cây thư mục đó. Các bước snapshot và xác thực phát hành dựa trên output đã biên dịch thực sự cần một lần build đầy đủ, nhưng không phụ thuộc vào kiểm tra closure dependency runtime, sinh tài liệu, xác thực đồ thị module, hay Knip.

Sự phụ thuộc quá rộng này khiến khả năng sẵn sàng của runner trở thành một mắt xích bắt buộc trong chuỗi thiết yếu. Trong một lần chạy failover, job tĩnh đợi runner 8 phút 1 giây, sau đó chạy 1 phút 41 giây; chỉ đến lúc này job tiêu thụ mới được vào cùng pool chung, nó lại đợi 10 phút 34 giây, rồi chạy 1 phút 58 giây. Việc tái sử dụng build của job tĩnh tiết kiệm được một phần công việc trên repo, nhưng lại khiến hai lần phân bổ runner vốn độc lập với nhau phải chạy tuần tự.

## Quyết định

3 job Linux bắt buộc được phân bổ runner riêng biệt. Coverage vẫn chỉ tiêu thụ mã nguồn. Job tĩnh đảm nhiệm các kiểm tra mã nguồn và kiểm tra tài liệu không cần tiêu thụ output đã sinh. Job tiêu thụ đảm nhiệm lần build Linux duy nhất, cùng với typecheck tài liệu, snapshot dựa trên output đã biên dịch, xác thực phát hành, kiểm tra NodeNext và smoke test built-bin.

Đồ thị gate bên trong job tiêu thụ giữ nguyên các phụ thuộc thực tế. Build và kiểm tra tương thích Node chỉ tiêu thụ mã nguồn khởi động trước; publint đợi build hoàn tất, kiểm tra bất biến package đã build sẽ xác thực view phát hành đó, và mọi bên tiêu thụ output đã biên dịch đều đợi bước xác thực này hoàn tất. Nhờ đó, snapshot ví dụ và Web vẫn xác thực output `lib/` hiện tại dưới Node thông thường; đồng thời, không có job GitHub nào cần đợi một job không liên quan hay truyền artifact cây thư mục đã build.

Windows và luồng gộp tham chiếu tuần tự vẫn tự đảm nhiệm build riêng của mình. Thay đổi lần này chỉ liên quan đến topology Linux bắt buộc của pull request; `all checks passed` vẫn gộp cùng nhóm job có tên như cũ, và sẽ fail bất cứ khi nào một dependency không thành công.

## Các phương án đã cân nhắc

**Tiếp tục phát hành build của job tĩnh.** Phương án này chỉ cần build một lần, nhưng không thể biểu đạt phụ thuộc thực tế ở cấp bước: GitHub sẽ bắt bên tiêu thụ đợi đến khi toàn bộ job tĩnh kết thúc mới được yêu cầu runner. Khi pool failover bão hòa, độ trễ xếp hàng lại lần nữa vượt quá thời gian build tiết kiệm được.

**Build độc lập riêng ở cả hai job.** Giữ build trong job tĩnh đồng thời gỡ bỏ phụ thuộc cấp job có thể khôi phục việc phân bổ song song, nhưng mỗi pull request sẽ biên dịch cùng một cây thư mục hai lần. Chuyển trách nhiệm typecheck tài liệu và build sang bên tiêu thụ thì vẫn chỉ cần build một lần.

**Thêm job build chuyên dụng.** Một bên sản xuất trách nhiệm đơn lẻ sẽ khiến tên dependency khớp với quan hệ thực tế, nhưng sẽ thêm giai đoạn thứ 4 cần thiết lập và phân bổ runner trước bên tiêu thụ. Mọi tác vụ cần liên tục dùng output đã sinh đều đã do job tiêu thụ đảm nhiệm, nên việc lập riêng bên sản xuất cũng không tạo ra bên tiêu thụ độc lập thứ hai.

**Chỉ gộp job tĩnh và job tiêu thụ trong thời gian failover.** Một job dài duy nhất có thể tránh lần phân bổ thứ hai, nhưng danh sách job có nhánh điều kiện và việc gộp kết quả sẽ tạo ra một topology CI thứ hai. Các job độc lập cho phép pool hosted và pool failover dùng chung một đồ thị job.

## Hệ quả

Độ trễ xếp hàng của job tĩnh và job tiêu thụ sẽ chồng lấp lên nhau, không còn cộng dồn. Thời gian hoạt động của bên tiêu thụ bao gồm cả build; job tĩnh trở nên ngắn hơn, các bước upload, download, nén và giải nén artifact biến mất hoàn toàn. Tổng số lần build Linux vẫn là 1 lần.

Job tĩnh fail không còn ngăn danh sách bên tiêu thụ sinh ra bằng chứng riêng của nó; kết quả cuối cùng vẫn sẽ fail. Lỗi build và typecheck tài liệu sẽ được xếp vào `node 24 / snapshots and artifacts` thay vì `node 24 / static`, việc phân loại này khớp với việc output thực sự thuộc về bên nào.
