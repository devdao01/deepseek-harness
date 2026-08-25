# Agent Note: Loại bỏ package mock subagent độc lập

Status: implemented

Archived: 2026-07-26

[English](2026-07-19-retire-subagent-mock-package.md) | 中文

## Vấn đề

`@deepseek-ai/dsh-subagent-mock` từng là một test double có thể cấu hình được phát hành dưới dạng plugin workspace. Nó chỉ có hai bên tiêu thụ bên ngoài: unit test `tool-subagent` và bộ sinh danh mục tool; package runtime, example, cấu hình snapshot và provider thật đều không load nó.

Fixture (dữ liệu chuẩn bị trước cho test) mục đích hẹp này cần duy trì manifest (danh sách khai báo siêu dữ liệu), export, peer dependency (dependency ngang hàng) và dev dependency, tham chiếu project, hợp đồng README của package, test hợp thành Loader, quan hệ thành viên đồ thị module, và ngoại lệ tài liệu. Bộ sinh danh mục tool mount nó chỉ để bên tiêu thụ sản xuất đăng ký schema, không thực thi sub agent nào.

## Quyết định

Xóa package độc lập. Hành vi sub agent theo kịch bản giờ nằm ở `packages/subagent/tool-subagent/tests/scripted-provider.ts`; test mount `SubagentService` thật, registry provider, hiện thực tool và task runtime thật, chỉ thay thế ranh giới sub agent mang tính bất định.

Fixture local giữ lại phản hồi xác định, kết quả có cấu trúc, lý do dừng, hủy trước/sau khi publish, mô tả kế thừa hội thoại và override dispose (giải phóng tài nguyên) theo phạm vi. Vì fixture không còn là plugin có thể triển khai, xóa test Schemastery và export Loader chuyên dụng cho package.

Bộ sinh danh mục tool đăng ký một mô tả `SubagentProvider` local tối giản trước khi mount `ToolSubagent` hoặc workflow engine. Mô tả này không thể khởi động sub agent; nó chỉ dùng để thỏa mãn dependency lúc load của bên tiêu thụ sản xuất, đồng thời trích xuất schema từ bên tiêu thụ thật.

Tham chiếu project workspace, dependency package, entry lockfile, metadata đồ thị, mô tả package hỗ trợ, entry danh mục cấu hình và ngoại lệ gate README không còn nhắc tới package đã loại bỏ.

## Phương án thay thế

**Giữ package mock có thể tái sử dụng cho test tương lai.** Ngoài một file test và một bộ sinh, nhu cầu tái sử dụng chưa từng xuất hiện. Khi tương lai có bên tiêu thụ hành vi thứ hai xuất hiện, có thể trích xuất fixture sau khi hợp đồng chung đã rõ ràng; đóng gói trước sẽ khiến hạ tầng test trông giống một backend được hỗ trợ chính thức.

**Sinh schema subagent trực tiếp mà không mount bên tiêu thụ sản xuất.** Xây dựng thủ công hoặc import trực tiếp schema sẽ làm suy yếu việc gate danh mục kiểm chứng registry thật và hợp thành tool có phơi bày đúng cấu trúc tài liệu hay không. Mô tả provider tối giản giữ được việc kiểm chứng đó, mà không cần mang theo hành vi backend giả có thể thực thi.

## Ảnh hưởng

- Workspace giảm một package có thể triển khai, đồ thị capability và đồ thị module không còn node chỉ dùng cho test.
- Test `tool-subagent` tiếp tục pass, bao phủ task foreground, background, vòng đời, hủy, phản hồi, lý do dừng và kết quả có cấu trúc qua service sản xuất.
- Output danh mục tool vẫn được sinh dựa trên đăng ký sản xuất, và giữ nhất quán tới từng byte.
- Cả package runtime lẫn package example đều không phụ thuộc vào fixture test.
