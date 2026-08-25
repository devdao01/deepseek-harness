# Agent Note: Để jsdom quản lý Web Storage của trình duyệt trong Vitest

Status: implemented

[English](2026-07-30-vitest-jsdom-webstorage-ownership.md) | 中文

## Vấn đề

Dải phiên bản Node được hỗ trợ bao gồm những phiên bản dành sẵn (reserve) `globalThis.localStorage` ở cấp tiến trình. Khi không đặt `--localstorage-file`, Node 26 phơi bày thuộc tính này là `undefined`; sau khi Vitest phát hiện key được dành sẵn đó, nó sẽ không ghi đè thuộc tính bằng đối tượng `Storage` cô lập của jsdom. Do đó, bộ test component chưa kịp xác minh hành vi sản phẩm đã thất bại, trong khi kênh coverage chính trên Node 24 vẫn pass, vì runtime đó mặc định không dành sẵn key này.

## Quyết định

Khi runtime khai báo hỗ trợ cờ `--webstorage`, Vitest worker sẽ tắt Web Storage cấp tiến trình của Node. Cấu hình được truyền qua `execArgv` cho từng project test dưới dạng `--no-webstorage`; những runtime không khai báo cờ này thì không truyền tham số đó. Do vậy, bộ test theo môi trường Node không tải môi trường trình duyệt, còn các file chọn `@vitest-environment jsdom` sẽ nhận `localStorage` cô lập của jsdom.

Tác vụ tổng hợp khả năng tương thích Node chạy một smoke test jsdom chuyên biệt trên mỗi dòng phiên bản tương thích đã khai báo. Test này đồng thời khẳng định tham số worker được truyền có điều kiện và storage khả dụng, nên các thay đổi tương lai của Node hoặc Vitest sẽ không khiến bộ test chính trên Node 24 trở thành tín hiệu phát hiện duy nhất.

## Các phương án thay thế đã cân nhắc

- **Đặt `NODE_OPTIONS=--no-webstorage` trong script gói hoặc CI.** Bác bỏ: việc này sẽ lan truyền chính sách của test runner sang tiến trình con, và cũng không bao phủ được trường hợp gọi trực tiếp `pnpm exec vitest`.
- **Truyền `--localstorage-file` cho Node.** Bác bỏ: một storage bền vững duy nhất ở cấp tiến trình có ngữ nghĩa sở hữu và cô lập khác với storage trình duyệt được tạo riêng cho từng môi trường jsdom.
- **Sửa `globalThis.localStorage` trong code khởi tạo, hoặc thêm logic bảo vệ cho từng test component.** Bác bỏ: logic khởi tạo sẽ phụ thuộc vào chi tiết ánh xạ jsdom riêng tư của Vitest, còn logic bảo vệ thêm cho từng test sẽ che giấu việc môi trường trình duyệt bị hỏng, và lặp lại chính sách này trên nhiều bộ test.
- **Cố định test ở Node 24.** Bác bỏ: khai báo dải engine của gói hỗ trợ các dòng phiên bản Node chẵn mới hơn, còn ma trận tương thích chính là để bộc lộ các thay đổi runtime ở những phiên bản đó.

## Hệ quả

Cùng một lệnh `pnpm test` chạy được trên cả phiên bản Node có và không có Web Storage tích hợp sẵn. Test worker bị chủ đích cấm dùng Web Storage cấp tiến trình của Node; nếu tương lai sản phẩm cần API này, phải dùng cấu hình test riêng biệt và tường minh, không được làm suy yếu sự cô lập của jsdom. Kênh tương thích chỉ thêm một tiến trình Vitest chuyên biệt, không cần lặp lại toàn bộ test đơn vị trên mỗi phiên bản Node.
