# Agent Note: Dùng Oxlint làm linter cho repo

Status: implemented

[English](2026-07-29-oxlint-linter.md) | Tiếng Việt

## Vấn đề

Mã nguồn tự có của repo cần các quy tắc đúng đắn TypeScript có nhận biết kiểu (type-aware), định dạng nhất quán, và kiểm tra logic trùng lặp trong file. ESLint cung cấp các kiểm tra này thông qua parser JavaScript, project service và nhiều plugin, nhưng trên baseline di trú cục bộ, một lần chạy lint không lỗi mất khoảng 1 phút, và cần 8 GiB heap Node, cache kết quả CI, và mức độ song song ESLint được tinh chỉnh riêng.

Không được đánh đổi mất quy tắc để lấy tốc độ chạy nhanh hơn. Việc di trú phải giữ lại preset kiểm tra kiểu nghiêm ngặt, cấu hình override của repo, chỉ thị suppress nội tuyến, các fix của @stylistic, kiểm tra SonarJS, cô lập TypeScript host/client, và quy tắc loại trừ vendor.

## Quyết định

[`.oxlintrc.json`](../../../../.oxlintrc.json) ở gốc là nguồn thẩm quyền cho cấu hình lint có nhận biết kiểu của repo. Cấu hình [`.oxlintrc.staged.json`](../../../../.oxlintrc.staged.json) không tải project kế thừa các quy tắc mã nguồn của nó, tắt phân tích kiểu cho đường dẫn pre-commit có giới hạn, và đưa lại vào các fixture (dữ liệu tiền đề kiểm thử) TypeGraph mà backend nhận biết kiểu không thể phân tích nhưng cần được giữ lại. Script package `lint` và `lint:fix`, bộ điều phối gate, CI và lefthook gọi Oxlint qua [`scripts/run-oxlint.ts`](../../../../scripts/run-oxlint.ts); [luồng công việc fix chỉ dùng Oxlint](2026-08-09-oxlint-only-fix-workflow.md) đảm nhiệm việc fix nhiều vòng bằng plugin và thay thế đường dẫn fallback định dạng riêng biệt.

`options.typeAware` bật `oxlint-tsgolint`. Backend của nó phát hiện project TypeScript theo từng file: mã nguồn package dùng project riêng của từng package, test host, ví dụ và website dùng `tsconfig.host.json`, test client và `scripts/client-bundle-purity.spec.ts` dùng `tsconfig.client.json`. Solution gốc không chứa program không bao giờ bị làm phẳng (flatten). Tùy chọn `--tsconfig` override của Oxlint ảnh hưởng đến resolve import, nhưng lint có nhận biết kiểu bỏ qua nó, nên repo này không đặt tùy chọn đó. Cấu hình này tải rõ ràng các quy tắc kiểm tra kiểu nghiêm ngặt đã di trú và cấu hình override của repo, mà không bật các danh mục Oxlint phạm vi rộng có nội dung có thể thay đổi. `typescript/no-unnecessary-condition` vẫn được bật từ tập quy tắc nursery của Oxlint, vì nó đã là quy tắc được repo bắt buộc trước khi di trú.

Lớp tương thích plugin JavaScript của Oxlint chạy `@stylistic/eslint-plugin` và `eslint-plugin-sonarjs`, nhờ đó tiếp tục thực thi các quy tắc định dạng và logic trùng lặp trong file hiện có. Lớp tương thích báo cáo vi phạm `@stylistic` và thực hiện fix an toàn của nó; `max-len` vẫn chỉ dùng để xác thực. Chỉ thị suppress trong mã nguồn tự có dùng chỉ thị `oxlint-*` và namespace `typescript/*`, chỉ thị không dùng đến vẫn được báo cáo dưới dạng cảnh báo; mã nguồn vendor giữ nguyên chỉ thị thượng nguồn của nó, vì Oxlint loại trừ `vendor/**`.

CI không khôi phục hay lưu cache kết quả lint. `DSH_OXLINT_THREADS` khiến runner dùng chung truyền cùng một mức trần cho cả tùy chọn `--threads` của Oxlint lẫn biến môi trường `GOMAXPROCS` của backend nhận biết kiểu; các lần chạy cục bộ thông thường dùng giá trị mặc định cho cả hai. Lần chạy pre-commit không tải xác thực Oxlint của project, áp dụng fix an toàn với một lần retry có giới hạn, chấp nhận lựa chọn file chỉ chứa các file đã bị bỏ qua, và tái stage kết quả qua lefthook. `lint` công khai và CI sẽ chuẩn bị khai báo được sinh ra trước, và giữ nguyên toàn bộ quy tắc nhận biết kiểu.

## Xác minh

Sau khi giải quyết hai khác biệt về analyzer, cấu hình đã di trú báo cáo baseline mã nguồn tự có không lỗi giống hệt trước khi di trú: đã gỡ một assertion test dư thừa, và một chuyển đổi kiểu có tính cấu trúc mà `tsc` yêu cầu dùng chỉ thị suppress Oxlint phạm vi hẹp. Một lần rà soát đối chiếu dựa trên blob chính xác của cấu hình ESLint đã bị xóa, sau khi hoàn tất việc ánh xạ tên quy tắc, xác nhận: mã nguồn 88 trên 88, ví dụ 87 trên 87, test 83 trên 83. Fingerprint đã commit khóa các cấu hình quy tắc Oxlint đã được rà soát này cùng toàn bộ cấu trúc override; nó không thực thi cấu hình đã xóa, cũng không nạp các thay đổi preset thượng nguồn về sau. Đánh giá `typescript-eslint@8.61.0` còn xác nhận rằng `strictTypeChecked` không bật `@typescript-eslint/no-empty-function`; mục `off` chỉ dùng cho test đã bị xóa không có tác dụng.

Các test hợp đồng có thể thực thi yêu cầu package, host và client project sinh ra chẩn đoán nhận biết kiểu, xác nhận project mà script chuyên dụng cho client sử dụng, từ chối phân tích fallback không khớp, và kiểm tra đường dẫn tương thích Stylistic, SonarJS và nursery. Chúng còn khóa việc cấu hình staged không tải hành vi kế thừa của project cùng override fixture TypeGraph, hành vi báo cáo chỉ thị suppress không dùng đến, trường hợp chỉ chọn các file staged đã bị bỏ qua, toàn bộ tập quy tắc Stylistic, và các byte định dạng cuối cùng sau khi hội tụ. Test runner khóa hai cơ chế kiểm soát worker thread, còn typecheck xác nhận rằng thay đổi mã nguồn do di trú gây ra không phá vỡ chương trình TypeScript.

## Các phương án đã cân nhắc

**Chạy đồng thời hai linter trên toàn repo.** Mọi quy tắc đúng đắn đều có thể đạt được qua quy tắc gốc của Oxlint, quy tắc nursery, hoặc lớp tương thích plugin JavaScript. Bật fallback ESLint trên toàn repo sẽ giữ lại việc khởi tạo project service chậm hơn và hai bộ cấu hình đúng đắn, mà không tăng thêm bất kỳ kiểm tra nào.

**Dùng một formatter riêng biệt.** Việc di trú giữ lại luồng ESLint phạm vi hẹp vì khi đó cho rằng lớp tương thích không thể thực hiện fix. Sau khi toolchain phiên bản cố định chứng minh có thể thực hiện cùng các fix đó, [luồng công việc fix chỉ dùng Oxlint](2026-08-09-oxlint-only-fix-workflow.md) đã thay thế phần quyết định đó bằng một lần retry có giới hạn.

**Xóa các quy tắc @stylistic hoặc SonarJS chưa có triển khai gốc.** Việc này sẽ xóa được dependency, nhưng cũng làm suy yếu ràng buộc chất lượng máy móc. Lớp tương thích giữ lại các quy tắc này cho đến khi có thể đánh giá quy tắc thay thế gốc qua một quyết định riêng.

**Thay @stylistic bằng Oxfmt trong quá trình di trú.** Di trú formatter sẽ tạo ra thay đổi output vượt ngoài ranh giới của engine lint, và mang lại diff định dạng trên toàn repo. Giữ nguyên quy tắc hiện có giúp thay đổi lần này dễ review hơn, và giữ cho lựa chọn formatter độc lập.

## Kết quả

Đo lường di trú cục bộ cho thấy, khi không dùng cache kết quả, một lần chạy lint nhận biết kiểu không lỗi giảm từ khoảng 61 giây xuống còn khoảng 8 giây. Tỷ lệ chính xác thay đổi theo máy host và không phải là bảo đảm về hiệu năng.

Chẩn đoán nhận biết kiểu giờ đến từ analyzer TypeScript Go được đóng gói qua `oxlint-tsgolint`, nên ngay cả khi `tsc` chấp nhận cùng một chương trình, việc suy luận kiểu ở các tình huống biên có thể khác với typescript-eslint. Lint và typecheck vẫn là hai bằng chứng cần thiết độc lập với nhau.

API tương thích plugin JavaScript và cấu hình staged là các ranh giới bổ sung cần bảo trì. Mỗi lần commit để lại chẩn đoán nhận biết kiểu cho lint công khai và CI, và tránh phụ thuộc vào khai báo được sinh ra. Xác thực toàn repo, fix, phân tích nhận biết kiểu, chính sách cache, kiểm soát worker thread và chỉ thị nội tuyến vẫn do Oxlint đảm nhiệm.
