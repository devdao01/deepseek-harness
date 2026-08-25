# Agent Note: Quy trình sửa lỗi chỉ dùng Oxlint

Status: implemented

[English](2026-08-09-oxlint-only-fix-workflow.md) | Tiếng Việt

## Vấn đề

[Việc di chuyển linter của repo](2026-07-29-oxlint-linter.md) vẫn giữ lại một lần gọi ESLint chỉ dùng để định dạng, vì lúc đó cho rằng lớp cầu nối plugin JavaScript của Oxlint chỉ có thể dùng để kiểm tra (validate). Bộ công cụ Oxlint ở phiên bản cố định có thể thực thi các bản sửa an toàn do `@stylistic/eslint-plugin` cung cấp, do đó việc dùng riêng một formatter đã lặp lại ranh giới cấu hình, quá trình khởi chạy lệnh, và phụ thuộc trực tiếp vào `eslint` cùng `@typescript-eslint/parser`.

Chỉ gọi Oxlint một lần không tương đương thay thế được. Các bản sửa của những plugin chồng lấn nhau có thể áp dụng một thay đổi trước, nhưng lại để lộ ra chẩn đoán mới phát sinh; fixture (dữ liệu chuẩn bị sẵn cho test) trong repo chứa các vi phạm `semi` và `object-curly-spacing` cần chạy vòng thứ hai mới sửa xong hoàn toàn. Quy trình phải thử lại trong trường hợp này, đồng thời không được in ra chẩn đoán đã mất hiệu lực từ vòng đầu.

## Quyết định

Tất cả quy trình lint và fix của repo đều gọi Oxlint thông qua [`scripts/run-oxlint.ts`](../../../../scripts/run-oxlint.ts). Kiểm tra thông thường vẫn do một tiến trình đơn thực hiện và kế thừa trực tiếp output. Các lệnh gọi có `--fix`, `--fix-suggestions` hoặc `--fix-dangerously` sẽ bắt lại kết quả của lần chạy Oxlint đầu tiên; nếu thành công, sẽ xuất stdout và stderr qua kênh gốc; nếu tiến trình kết thúc bình thường nhưng trạng thái khác không, thì bỏ đi những chẩn đoán có thể đã mất hiệu lực trong đó, sau đó chạy lại cùng lệnh đó một lần nữa theo kiểu kế thừa output. Khi tiến trình con bị tín hiệu (signal) chấm dứt, runner sẽ kích hoạt lại tín hiệu đó, không thử lại và không chuyển nó thành mã thoát (exit code); kết quả kết thúc của tiến trình thứ hai là kết quả cuối cùng.

Script package `lint:fix` và job lefthook xử lý file staged đều dùng trực tiếp runner này. Cấu hình gốc có nhận biết kiểu (type-aware) vẫn bỏ qua fixture TypeGraph mà `oxlint-tsgolint` không thể phân tích và cần giữ nguyên hình dạng gốc; cấu hình staged không tải project sẽ đưa lại thư mục đó vào, giữ lại các ngoại lệ quy tắc `any` và dấu ngoặc kép đã được cố ý thiết lập trong đó, và áp dụng bản sửa style của nó trước vòng sửa nhận biết kiểu đầy đủ. Trong repo không còn tồn tại cấu hình ESLint chỉ dùng để định dạng, cũng không còn phụ thuộc trực tiếp vào hai dev dependency `eslint` và `@typescript-eslint/parser`. `@stylistic/eslint-plugin` và `eslint-plugin-sonarjs` vẫn được giữ lại làm plugin JavaScript của Oxlint vì chúng mang theo các quy tắc đã bị buộc thực thi; pnpm vẫn cài ESLint như một peer dependency mà các plugin này khai báo, nhưng cấu hình và quy trình trong repo đều không gọi đến nó.

## Xác minh

Quy ước lint có thể thực thi giao một vi phạm style được cố ý dựng lên, sẽ kích hoạt các bản sửa chồng lấn nhau, cho runner của repo xử lý, và yêu cầu runner thoát thành công với byte cuối cùng hoàn toàn khớp nhau. Cùng quy ước đó cũng cố định toàn bộ bộ quy tắc Stylistic, việc override fixture TypeGraph khi không tải project, script package, lệnh hook file staged, cấu hình formatter đã bị xóa, và thực tế là parser cùng runner của ESLint không tồn tại phụ thuộc trực tiếp. Các probe có thể thực thi hiện có tiếp tục bao phủ plugin tương thích Stylistic và SonarJS, việc kiểm tra file staged khi không tải project, và việc phát hiện project nhận biết kiểu.

## Các phương án thay thế đã cân nhắc

**Giữ lại vòng ESLint chỉ dùng để định dạng.** Cách này giữ được hành vi sửa nhiều vòng có sẵn của ESLint, nhưng trong khi Oxlint đã có thể thực thi cùng các bản sửa của plugin đó, vẫn phải duy trì thêm một runner thứ hai, cấu hình định dạng trùng lặp và phụ thuộc trực tiếp.

**Chỉ chạy Oxlint một lần với `--fix`.** Cách này đơn giản hơn, nhưng các bản sửa an toàn chồng lấn nhau có thể khiến lệnh chỉ hoàn thành một phần định dạng rồi thoát với trạng thái khác không, dù chỉ cần chạy lại cùng lệnh đó là có thể sửa xong.

**Dùng Oxfmt.** Việc di chuyển formatter sẽ thay đổi quy ước output của repo và tạo ra diff định dạng không liên quan. Đây là một quyết định độc lập với việc loại bỏ đường dẫn thực thi ESLint dư thừa.

**Loại bỏ các plugin tương thích JavaScript.** Cách này sẽ xóa bỏ đồ thị peer dependency ESLint do các plugin này mang lại, nhưng cũng sẽ xóa luôn các quy tắc Stylistic và SonarJS đã bị buộc thực thi. Theo đuổi cây phụ thuộc "sạch" không thể là lý do để làm suy yếu quy ước chất lượng.

## Kết quả

Người đóng góp, script package, hook và CI đều thống nhất dùng một runner lint và một bộ cấu hình quy tắc. Cấu hình staged lặp lại danh sách bỏ qua của cấu hình gốc, để đưa lại fixture chỉ dùng để định dạng vào, đồng thời tránh đưa file vendor hoặc file được sinh ra vào kiểm tra. Khi tiến trình sửa kết thúc bình thường nhưng trạng thái khác không, luôn thực hiện thêm một lần thử lại, kể cả với lỗi tồn tại ổn định và không thể sửa được. Mỗi luồng output của vòng đầu được đệm tối đa 64 MiB, nên khi lần thử lại thành công sẽ không in ra chẩn đoán đã mất hiệu lực; khi tạo tiến trình hoặc bắt output thất bại (kể cả vượt quá giới hạn này) sẽ báo lỗi ngay lập tức, không thử lại.

Trong lockfile phụ thuộc vẫn có thể chứa ESLint do việc giải quyết peer dependency của plugin. Để loại bỏ phụ thuộc bắc cầu này, cần dùng phương án thay thế native, hoặc quyết định riêng dùng một formatter có thể thay thế đồng thời các plugin tương thích; điều này không nằm trong phạm vi đơn giản hóa quy trình lần này.
