# Agent Note: Web `/export` dùng chung tải xuống ZIP Session dạng stream

Status: implemented

[English](2026-08-11-web-export-command-and-dialog.md) | 中文

## Problem

Session export cần một lối vào hiển thị (surface) cấp Session ổn định, cùng một đường lệnh slash tương đương về ngữ nghĩa. Một bộ đọc backend thứ hai hoặc một bộ ghi đường dẫn phía Host thứ hai sẽ lặp lại hiện thực tải xuống, và tạo ra vấn đề quyền file cũng như lộ đường dẫn phụ thuộc nền tảng.

## Decision

`@deepseek-ai/dsh-session-log-export` đăng ký lệnh người dùng `/export` chuyên cho Web, và cung cấp controller `ctx.sessionLogDownload` phía trình duyệt. Lệnh này ghi lại `command/run` và `command/done` bình thường; sau khi `command.execute` trả kết quả thành công, `dsh-client-ui-commands` sẽ phát một xác nhận cục bộ, yêu cầu controller của trình duyệt hiện tại tải ZIP từ `GET /api/session.export` sẵn có của ApiProxy. Các client khác sẽ render node lệnh được broadcast, nhưng không lặp lại side effect phía trình duyệt. Nút viên nang `Session log` kích thước 111×32 trong Session Header gọi trực tiếp controller đó. Cả hai lối vào đều lấy lỗi ở giai đoạn chuẩn bị qua `HEAD` preflight, rồi giao URL GET cho trình quản lý tải xuống của trình duyệt, do đó JavaScript không buffer ZIP; cả hai lối vào dùng chung trạng thái đang xử lý và Modal.

Đóng góp Header chiếm danh sách `conversation.session.header.utilities` ở vị trí ngoài cùng bên phải, render capsule văn bản `Session log` kèm icon tải xuống ở cuối, cùng Modal dùng chung. Danh sách `conversation.session.header.actions` cạnh tiêu đề tiếp tục mang các mục cấu hình mode, Subagent và Task; việc gắn Session export không thay đổi thứ tự hay vị trí của chúng. Đóng góp export không quan sát lịch sử Session. Controller theo từng Session gộp các thao tác đồng thời, hủy preflight đang hoạt động khi plugin được giải phóng, bỏ qua request đến muộn sau khi giải phóng, và giữ nguyên trạng thái người dùng đã đóng popup nếu request hoàn tất muộn sau đó.

Endpoint ZIP và năng lực `readRaw` của persistence vẫn thuộc sở hữu của `dsh-host-apiproxy` và package persistence. Endpoint sẽ flush Session gốc đang hoạt động trước khi đọc artifact, do đó xác nhận cục bộ không xảy ra sớm hơn dòng vòng đời lệnh bền vững. Package này không serialize sự kiện Session, không ghi file phía Host, không giao đường dẫn phía Host, và cũng không hiện thực fallback SQLite.

Package này là một dự án tổng hợp Client bình thường. Một `tsconfig.json` duy nhất biên dịch cùng lúc entry point Node loader và đóng góp phía trình duyệt; test phía Host vẫn xác minh lệnh và invariant qua entry point mã nguồn.

## Alternatives considered

**Đặt lối vào hiển thị trong Trajectory.** Không dùng, vì export là thao tác cấp Session, người dùng không nên phải mở view chẩn đoán trước mới phát hiện ra nó.

**Cho `/export` ghi file JSONL phía Host.** Không dùng, vì điều này sẽ lệch khỏi ZIP chứa cả sub-Session và attachment, phải xử lý ACL của Windows, và trả về đường dẫn phía Host có thể vô nghĩa với trình duyệt từ xa.

**Giữ đồng thời cả nút Header và Trajectory.** Không dùng, vì hai control hiển thị cùng thực hiện một thao tác Session sẽ tạo ra sự trùng lặp về chủ sở hữu và vị trí không nhất quán.

## Consequences

Thao tác Header và `/export` tải cùng một ZIP, và hiển thị cùng phản hồi. Lệnh đã thực thi được giữ lại trong bản ghi văn bản bền vững, và không tạo ra lượt model nào. Preflight sẽ báo cáo lỗi phát hiện được trước khi bắt đầu stream; lỗi xảy ra khi trình duyệt tiêu thụ GET vẫn thuộc về lỗi tải xuống phía trình duyệt. Khi backend persistence không có artifact gốc theo từng Session, người dùng sẽ nhận lỗi sẵn có của endpoint; việc hỗ trợ SQLite để lại như công việc độc lập. Khả dụng của lệnh trước lượt Session đầu tiên là công việc độc lập.
