# `@deepseek-ai/dsh-loader-smoke`

[English](README.md) | 中文

Harness tiến trình con dùng chung để kiểm thử việc khởi động ứng dụng và `cordis.yml` qua Cordis Loader. `resolveExampleLaunch` chọn mode `src` cục bộ (tsx và đường dẫn tsconfig gốc) hoặc mode `lib` CI (Node thường và export của gói); việc chọn dựa trên mode tường minh hoặc `DSH_EXAMPLE_MODE`.

`runLoaderSmoke` nhận đường dẫn file thực thi và đường dẫn cấu hình, tham số file thực thi đầy đủ tùy chọn, override biến môi trường, standard input, chuẩn bị trước khi chạy và kiểm tra trước khi dọn dẹp. Nó chịu trách nhiệm cô lập thư mục làm việc, thư mục chính DSH, chẩn đoán, deadline, chấm dứt, EOF và dọn dẹp; sau khi tiến trình thoát với trạng thái bằng 0 sẽ trả về hai luồng, khi thất bại thì trả về reject kèm hai luồng.

`runFixtureTurn` điều khiển một tác vụ thông qua đúng một agent (agent thông minh) gốc đã cấu hình, chuyển tiếp sự kiện chuẩn sau khi tác vụ vào inbox bền vững, flush session, và trả về văn bản assistant cuối cùng cùng usage tích lũy. Driver cục bộ của ví dụ vẫn chịu trách nhiệm về cấu hình, render và assertion.

Đây là hạ tầng kiểm thử tầng hỗ trợ, không phải product API.

## Trải nghiệm model

Không có, vì harness kiểm thử này chỉ nộp tác vụ người dùng thông thường của bên gọi kiểm thử, và để việc lắp ráp prompt cùng tool cho cây đã nạp chịu trách nhiệm.

#### Ảnh hưởng KV Cache

Ngoài ảnh hưởng của chính cây đã nạp, không có ảnh hưởng nào khác; helper này không thay đổi tiền tố request, cũng không giữ trạng thái qua các lần chạy.

## Hạn chế đã biết và công việc hoãn lại

- **Mode build cần được build trước**: cấu hình còn phải có thể phân giải ngược từng gói được đặt tên qua `examples/node_modules`.
- **stdout và stderr đã thu thập chỉ bị ràng buộc bởi `maxBuffer` mặc định 100 MB của execa**: tiến trình con mất kiểm soát sẽ bị chấm dứt tại giới hạn đó, chứ không phải tại ngân sách tự chọn của smoke test.
- **Timeout chỉ chấm dứt tiến trình con trực tiếp**: cây tiến trình do fixture (dữ liệu tiền đề kiểm thử) lỗi spawn ra có thể sống lâu hơn smoke test, cần dọn dẹp bên ngoài.
