# Agent Note: Loại bỏ toolchain dự án SDK

Status: implemented

[English](2026-08-11-remove-sdk-project-toolchain.md) | Tiếng Việt

## Vấn đề

Repo trước đây từng chứa một bộ sản phẩm dự án dành cho developer, chưa từng được phát hành và không có bên tiêu thụ nào. `@deepseek-ai/create-sdk` dùng để sinh ra các dự án Cordis có thể chỉnh sửa được; `@deepseek-ai/dsh-scripts` cung cấp các lệnh phát triển, build, khởi động, cấu hình và cài đặt plugin cho `dsh-sdk`; `@deepseek-ai/dsh-helper` điều phối định nghĩa tính năng và việc chỉnh sửa dự án nhiều file; `@deepseek-ai/dsh-telemetry` báo cáo hoạt động của launcher. Thiết kế này nhằm giữ cho các dự án được sinh ra vẫn có thể chỉnh sửa được, và làm cho việc tạo dự án cùng cấu hình sau đó dùng chung một bộ định nghĩa cho dependency, mục cấu hình Cordis, placeholder biến môi trường và file thuộc sở hữu.

Không có dự án nào từng được tạo thông qua bản phát hành công khai, và cả repo hiện tại lẫn bên tiêu thụ bên ngoài đều không cần đến vòng đời này. Giữ lại nó đồng nghĩa với việc tiếp tục bảo trì 4 package, 2 bộ sản phẩm lệnh tương tác, template dự án, adapter package manager, hòa giải cấu hình, telemetry launcher, 1 skill (kỹ năng) của repo cùng test và tài liệu của nó, mà không có bằng chứng nào cho thấy ranh giới sản phẩm này nên tồn tại.

Cùng nhóm `scaffold/` này còn chứa SDK protocol, TypeScript client và JSON-RPC server, mỗi thứ được sử dụng độc lập với nhau. Các package này hỗ trợ Python SDK, provider `dsh-sdk` subagent và ví dụ JSON-RPC; giao thức runtime của chúng không phụ thuộc vào dự án được sinh ra hay launcher đã bị loại bỏ.

## Quyết định

Xóa toolchain dự án SDK. Các package `@deepseek-ai/create-sdk`, `@deepseek-ai/dsh-scripts`, `@deepseek-ai/dsh-helper` và `@deepseek-ai/dsh-telemetry` cùng binary, test, template, danh mục tính năng, mô hình chỉnh sửa dự án, hỗ trợ package manager, telemetry launcher và skill tạo dự án của repo đều không cung cấp triển khai thay thế hay lớp tương thích nào. Workspace, build, test, đóng gói, bộ sinh tài liệu, việc viết lại vendor scope và bản ghi dependency tương ứng cũng bị loại bỏ theo.

Giữ lại SDK runtime. `@deepseek-ai/dsh-sdk-client`, `@deepseek-ai/dsh-sdk-protocol` và `@deepseek-ai/dsh-sdk-jsonrpc-server` được giữ nguyên, chuyển từ `packages/scaffold/` sang `packages/sdk/`; tên npm và hành vi tương tác giao thức của chúng không thay đổi. Bên tiêu thụ vẫn tiếp tục cung cấp một file thực thi và một `cordis.yml` đặt bên ngoài, JSON-RPC server vẫn là một plugin thông thường được chọn bởi cấu hình đó. [Quy ước đặt tên repo](../architecture/2026-08-11-repository-naming-contract-and-rename-ledger.md) chịu trách nhiệm quy định ý nghĩa duy nhất của `SDK` trong repo và tên package được giữ lại; ghi chú này chịu trách nhiệm ghi lại toolchain đã bị xóa.

Các đề xuất về dự án developer, chỉnh sửa dự án và năng lực tiếp theo đã bị hủy bỏ đều bị xóa, thay vì được giữ lại như bản ghi đang hoạt động hay đã bị bác bỏ. Agent Note này giữ lại động lực chung của các đề xuất đó, quyết định không phát hành sản phẩm này, các năng lực bị từ bỏ, và điều kiện để xem xét lại quyết định này. Agent Note đã được lưu trữ và đóng băng vẫn là snapshot lịch sử, không bị chỉnh sửa.

## Kiểm chứng

Trong workspace không còn tồn tại 4 tên package đã bị xóa nói trên, hay 2 bộ sản phẩm lệnh đã bị loại bỏ. Cấu hình tổng hợp package, path mapping source code, metadata package, cấu hình thu thập test, ràng buộc phát hành, thư mục sinh ra, file khai báo dependency và lockfile đều chỉ resolve 3 package SDK runtime dưới `packages/sdk/`. Test package SDK runtime, smoke test của server đã build, bên tiêu thụ TypeScript, cổng kiểm tra tài liệu của repo, build và kiểm tra hygiene cùng nhau cố định hành vi được giữ lại, và đảm bảo không còn đường dẫn package cũ nào sót lại.

## Các phương án thay thế đã cân nhắc

**Chỉ xóa initializer.** Không được chấp nhận, vì `dsh-sdk`, mô hình dự án dùng chung và telemetry launcher đều được tạo ra để vận hành các dự án do initializer đó tạo ra, mà các dự án hiện có không cần đến các năng lực này.

**Giữ lại package hoặc alias lệnh chỉ để báo lỗi.** Không được chấp nhận, vì các lệnh này chưa từng được phát hành công khai. Bia mộ (tombstone) sẽ giữ lại phạm vi interface của package và file thực thi mà không có nghĩa vụ tương thích nào tồn tại.

**Xóa cả stack SDK runtime.** Không được chấp nhận, vì Python SDK, provider subagent Harness chạy ngoài tiến trình, và ví dụ JSON-RPC hiện vẫn là bên tiêu thụ của protocol, client và server.

**Giữ stack runtime ở lại trong `packages/scaffold/`.** Không được chấp nhận, vì phần còn lại của nhóm này không còn chịu trách nhiệm dựng dự án nữa. `packages/sdk/` mô tả trực tiếp trách nhiệm của những gì được giữ lại, vì `SDK` trong repo chỉ có một ý nghĩa duy nhất: giao thức client/server JSON-RPC được các SDK Python và TypeScript được hỗ trợ chính thức sử dụng. Bản thân DeepSeek Harness không phải là một dự án SDK.

## Hệ quả

DeepSeek Harness không còn tạo hay quản lý các dự án SDK developer độc lập. Việc sinh dự án tự động, cấu hình cây tính năng, scaffold plugin cục bộ, các lệnh phát triển, build, khởi động cục bộ theo dự án, và telemetry launcher hướng tới chu kỳ phát triển đều cố ý không còn được cung cấp; các ứng dụng và bản phân phối runtime thông thường vẫn tổng hợp plugin thông qua các package thuộc sở hữu riêng và file `cordis.yml`.

Repo xóa hoàn toàn đồ thị hỗ trợ, thay vì tiếp tục giữ lại một abstraction đang ngủ đông. Việc tái giới thiệu toolchain dự án phải có bên tiêu thụ thực tế trước, và đề xuất mới phải dựa trên workflow của bên tiêu thụ đó; theo mặc định, các package này hay các định dạng đã bị xóa và không cam kết tương thích sẽ không được hồi sinh.
