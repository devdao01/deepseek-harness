# Agent Note: Thu gọn workflow về phần lõi foreground đang được dùng

Status: rejected — tiến độ workflow là một giao diện quan sát được thiết kế có chủ đích; nên làm cho nó phát huy tác dụng thông qua phía tiêu thụ, chứ không phải xóa bỏ nó.

[English](2026-07-12-collapse-workflow-to-foreground-core.md) | Tiếng Việt

## Vấn đề

Năng lực workflow chạy JavaScript ở foreground để điều phối subagent, nhưng đồng thời nó cũng mang theo cả một hệ thống quan sát tiến độ mà không ai tiêu thụ. Không có listener nào trong môi trường production đăng ký bất kỳ sự kiện nào trong sáu sự kiện `workflow/*`; listener chỉ tồn tại trong các test của workflow. Dù vậy, seam vẫn định nghĩa payload outcome cho run/phase/agent, worker vẫn gửi các thông điệp giao thức vòng đời phase/log/agent, host vẫn chuyển tiếp chúng qua một sổ ghép cặp `liveAgents`, và engine vẫn duy trì run id chỉ để liên kết các thông báo này.

Bộ từ vựng tiến độ này không chỉ đơn thuần là không được dùng; nó còn không thể phục vụ phía tiêu thụ tương lai duy nhất được nêu tên nếu không thiết kế lại. `WorkflowRunInfo` chứa `{id, meta}` nhưng không có định danh agent cha, phiên làm việc hay lời gọi công cụ, còn công cụ hướng tới mô hình thì không bao giờ phơi bày run id. Một listener ACP (Agent Client Protocol) toàn cục không thể định tuyến sự kiện tới đúng phiên làm việc của client. `meta.phases` chưa bao giờ được truy vấn, `phase(title)` không kiểm tra nó, `detail`/`model` của phase và `label`/`phase` của agent chỉ dùng cho việc tiêu thụ sự kiện, còn `whenToUse` được kiểm tra và sao chép nhưng chưa bao giờ được kết xuất hay dùng để lựa chọn. `phase()` và `log()` vẫn vượt qua ranh giới worker dù không có bên nhận.

Sau khi loại bỏ những bên quan sát này, live handle vẫn mang theo trùng lặp dữ liệu mà cơ chế sự kiện cần. `WorkflowRun.id` không có phía tiêu thụ nào ngoài sự kiện, còn công cụ đọc `run.meta.name` chỉ để kết xuất một giá trị mà nó vốn đã nắm dưới dạng `args.meta.name`; cả hai đều không thuộc về một handle thực thi/hủy.

Cơ chế hủy cũng cấp hai kênh công khai cho một lần khởi động đồng bộ. `WorkflowStartRequest.signal` được truyền cho worker host, trong khi bên gọi production duy nhất lại nối chính signal đó sang `WorkflowRun.cancel()`. Vì `start()` trả về run trước khi nhường quyền điều khiển, không tồn tại cửa sổ sẵn sàng nào cần hủy ngay tại thời điểm yêu cầu; signal trùng lặp làm tăng trạng thái listener/disarm của host mà không bịt được cuộc đua nào.

`WorkflowError.fatal` là phiên bản thu nhỏ của cùng một kiểu nhánh mang tính suy đoán: mọi lời khởi tạo trong mã production đều dùng chế độ fatal, `fatal: false` chỉ tồn tại trong test, và các combinator đã phân biệt lỗi workflow bằng `instanceof`.

## Đề xuất

Giữ lại phần lõi đang được dùng: `agent(prompt, { schema, model })`, `parallel`, `pipeline`, `args`, giới hạn concurrency/agent, hủy, dispose (giải phóng tài nguyên) có giới hạn, kết quả có cấu trúc, cách ly worker và việc thu thập công cụ ở foreground. Loại bỏ toàn bộ sự kiện `workflow/*` cùng các kiểu info/outcome chỉ phục vụ sự kiện; loại bỏ `phase()`, `log()`, `label`/`phase` của agent, khai báo phase, `whenToUse` cùng các thông điệp worker/bên quan sát ở host của chúng; thu gọn metadata workflow về đúng name mà công cụ thực sự dùng; loại bỏ run id/ảnh chụp meta chỉ phục vụ sự kiện và sổ agent-end tổng hợp. Thu gọn `WorkflowRun` về `result`, `cancel()` và `dispose()`; công cụ kết xuất name vốn đã có sẵn trong request. Loại bỏ `WorkflowStartRequest.signal` cùng trạng thái listener/disarm cho input-signal của worker host, giữ lại cầu nối từ abort signal của bên gọi sang `run.cancel()`. Biến `WorkflowError` thành một lớp lỗi fatal duy nhất, không còn chế độ boolean hay hàm trợ giúp `isFatalWorkflowError()`.

Sửa lại Agent Note về workflow động đã triển khai, đồng thời cập nhật README của seam/công cụ/worker, schema công cụ, catalog được sinh ra và đồ thị phụ thuộc gói, bản ghi type-equiv của worker, unit test cũng như snapshot/header fixture (dữ liệu chuẩn bị cho test) của workflow. Nếu công việc về UI tiến độ được lập thành dự án, nó nên khởi đầu từ một quy ước liên kết có nêu tên agent cha/phiên làm việc/lời gọi công cụ, chứ không phải hồi sinh nguyên trạng bộ giao thức này.

## Các phương án đã cân nhắc

**Giữ lại bộ từ vựng quan sát dựng sẵn cho UI tương lai.** Hình thái hiện tại tương tự metadata workflow động của Claude Code, trong đó host cố ý ghép mỗi agent start được chuyển tiếp với một end từ worker hoặc một end kết thúc tổng hợp. Loại bỏ nó đồng nghĩa với việc từ bỏ tính tương thích hình thái, khiến UI tiến độ trở thành một bài toán thiết kế hoàn toàn mới; nhưng payload hiện tại vẫn thiếu thông tin quy thuộc có thể định tuyến, nên chỉ riêng vòng đời ghép cặp đầy đủ cũng không thể giúp phía tiêu thụ ACP đã nêu tên trở nên khả thi nếu không thiết kế lại.

## Tiêu chí nghiệm thu

- Quy ước công khai của workflow chỉ bao gồm các quy ước thực thi, hủy, kết quả và dispose có phía tiêu thụ trong production.
- Không còn giữ lại bất kỳ sự kiện workflow, thông điệp giao thức phase/log, bộ sinh run-id, metadata chỉ phục vụ tiến độ, sổ ghép cặp ở host hay nhánh chế độ fatal nào.
- Run handle không còn phản hồi lại id/meta, và việc hủy chỉ còn một kênh do bên nắm giữ sở hữu sau khi `start()` đồng bộ trả về.
- Hành vi parallel/pipeline, các giới hạn, việc dừng hẳn hoàn toàn sau khi hủy, cách ly worker, đầu ra có cấu trúc và các kịch bản workflow hướng tới mô hình vẫn được test bao phủ.
- Kiểm tra kiểu, độ bao phủ, snapshot, doc-sync (cổng đồng bộ tài liệu), kiểm tra module-graph, build và hygiene đều vượt qua.

## Rủi ro

Đây là một đợt thu gọn ở mức nhìn thấy được khi biên dịch đối với DSL workflow, hệ thống phân loại sự kiện, handle và start request. Các lời gọi workflow hiện đang cung cấp metadata mô tả, cũng như các script dùng `phase`, `log` hay label, đều phải được tinh giản tương ứng; bên gọi theo cách lập trình phải tự nối abort source vào handle được trả về; bên quan sát trong tương lai phải bổ sung một quy ước sự kiện có tính liên kết tốt hơn. Ngữ nghĩa thực thi vốn làm nên giá trị của workflow thì không thay đổi.
