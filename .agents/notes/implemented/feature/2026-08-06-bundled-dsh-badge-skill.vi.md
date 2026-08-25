# Agent Note: Skill huy hiệu dsh đóng gói sẵn

Status: implemented

[English](2026-08-06-bundled-dsh-badge-skill.md) | Tiếng Việt

## Vấn đề

Các trang của [Cordis tutorial](../../../../docs/cordis-tutorial/index.md) đều dùng huy hiệu chính thức "powered by dsh", nhưng CLI (command-line interface) được giao lại không có cả chỉ dẫn tái sử dụng để áp dụng cùng một ghi công ở nơi khác, lẫn một provider có thể chọn tham gia (opt-in) rõ ràng.

## Quyết định

`@deepseek-ai/dsh-skill-badge` là một plugin Cordis gốc, đăng ký một provider bất biến, đóng gói sẵn trên `ctx.skills`. Provider này chịu trách nhiệm về phần tóm tắt, nội dung chỉ dẫn và tài nguyên PNG nền cho `dsh-badge`; `dsh-tool-skill` vẫn là nơi sở hữu duy nhất của catalog hướng tới model và phần render của loader.

Tổ hợp CLI được giao khai báo `skill-badge` ở trạng thái disabled. Việc bật dòng cấu hình sẵn có này chính là hành động chọn tham gia rõ ràng; các bản cài đặt không bật nó sẽ không công khai bất kỳ skill (kỹ năng) huy hiệu nào, cũng không có nội dung nào hiển thị với model.

Provider này dùng rank đóng gói sẵn (built-in), đứng sau các nguồn dự án, tùy chỉnh và filesystem của người dùng, do đó định nghĩa `dsh-badge` riêng của người dùng có thể ghi đè nó theo quy ước ưu tiên thông thường của registry. Khi provider được giải phóng, effect do registry sở hữu sẽ gỡ bỏ đóng góp này.

## Các phương án thay thế đã cân nhắc

**Mount các file đi kèm gói thông qua `dsh-skill-filesystem`.** Bị bác bỏ, vì việc khám phá, phân giải và theo dõi filesystem sẽ kéo theo cơ chế vòng đời mà một provider skill bất biến, đơn lẻ không cần đến.

## Hệ quả

Chỉ dẫn huy hiệu và file PNG nguồn được quản lý phiên bản cùng với DSH, và được phân giải thông qua tài nguyên nền dựa trên thư mục đi kèm gói. Provider này không có bề mặt cấu hình. Test của gói cố định vòng đời của provider và nội dung byte của PNG chính thức; snapshot ứng dụng đã lắp ráp không cần khóa thì cố định catalog sau khi bật và nội dung skill đã tải.
