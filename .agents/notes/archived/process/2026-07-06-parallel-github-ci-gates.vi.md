# Agent Note: Các gate CI GitHub song song

Status: implemented

Archived: 2026-07-26

[English](2026-07-06-parallel-github-ci-gates.md) | 中文

## Vấn đề

Các gate CI GitHub không cần khóa (no-secret) phần lớn trực giao với nhau: type-check, lint, độ mới của tài liệu, coverage, replay snapshot, build, kiểm tra vệ sinh phát hành (publish hygiene) của package, smoke demo và smoke của binary đã build đều thất bại vì các lý do khác nhau, và cũng không cần trạng thái runtime của nhau. Chạy chúng như một chuỗi lệnh tuần tự khiến thời gian workflow theo đồng hồ tường bằng tổng thời gian của tất cả các gate; còn tách mỗi leaf nhỏ thành một GitHub job riêng lại lặp đi lặp lại checkout, setup Node, khôi phục và cài đặt pnpm, cho tới khi overhead điều phối trở thành nút thắt cổ chai.

Khi workspace lớn dần, cách chia làn rộng (wide lane) ban đầu không còn giữ được cân bằng này. Khi PR (Pull Request) #404 được merge, các job static, coverage, snapshot và artifact trên Linux lần lượt mất 148, 195, 94 và 230 giây; job static và artifact trên Windows lần lượt mất 251 và 482 giây. Mỗi package đều gọi một lượt đóng gói bằng package manager, chiếm phần lớn thời gian của hai bộ kiểm chứng artifact; coverage rebuild output một cách vô ích trước khi chỉ chạy bộ test nguồn; các gate nặng CPU thì tranh chấp tài nguyên trong cùng làn static và coverage.

Ranh giới artifact vẫn mang các ràng buộc then chốt. `publint`, `verify-node-next-types`, việc load bất biến đã biên dịch, và smoke test binary đã build đều cần output `lib/` đã sinh ra. Việc phân mảnh (sharding) không được để các bên tiêu thụ này chạy trước build, cũng không được thay tín hiệu của chúng đối với artifact đã phát hành bằng việc thực thi từ mã nguồn.

## Quyết định

Cấu trúc topology sản xuất mô tả dưới đây giờ đã thuộc về lịch sử, và đã được thay thế bởi [quyết định áp dụng runner được quản lý lớn hơn dựa trên bằng chứng](2026-07-22-evidence-based-larger-hosted-runners.md). Quyết định dùng runner lớn hơn đã loại bỏ bộ chọn phân mảnh (sharding selector) và các workflow job của nó; tài liệu này lưu lại lý do topology ban đầu từng được triển khai.

[CI](../../../../.github/workflows/ci.yml) coi một phút cho job không phải Windows và ba phút cho job Windows là mục tiêu hiệu năng quan sát được, chứ không phải deadline hủy bỏ. Sự dao động của runner được host nên để lại đầy đủ bằng chứng đo thời gian và log lỗi hữu ích, thay vì hủy một gate vốn dĩ đúng đắn. [Tài liệu tham chiếu CI tuần tự đa nền tảng](2026-07-21-serial-cross-platform-ci-reference.md) chạy độc lập bộ tổng hợp Node chính đầy đủ, không phân mảnh, trên Linux, macOS và Windows, để danh sách làn đã tối ưu không trở thành thước đo duy nhất cho tính toàn vẹn của chính nó.

Trong topology đó, [scripts/run-gates.ts](../../../../scripts/run-gates.ts) là bộ điều phối có giới hạn (bounded scheduler) tổng quát, còn GitHub cung cấp tên phân mảnh tường minh cho các họ gate tốn kém. `scripts/static-shards.ts` chia các gate static thành các nhóm sở hữu: cơ bản, kiểu tài liệu, hợp đồng API, danh mục, nội dung, chiếu tài liệu (projection) và build tài liệu, đồng thời từ chối các phân bổ gate bị thiếu hoặc trùng lặp. Lint Linux dùng các làn nguồn và test package A-C, D-M, N-S, T-Z không chồng lấn, còn Windows dùng làn nguồn và test package đầy đủ; cả hai đều bao gồm phần bù của repo bắt đầu từ `.`, khiến target cấp cao nhất mới thêm vào không thể biến mất giữa các phân mảnh, và chịu trách nhiệm cho lần kiểm tra trùng lặp xuyên file duy nhất. `scripts/coverage-shards.ts` gán mỗi package workspace vào đúng một làn coverage nguồn. Bộ lọc thư mục giữ lại dấu phân cách cuối, vì bộ lọc vị trí của Vitest khớp theo substring, nếu không sẽ vô tình bao gồm cả các mục lân cận có cùng tiền tố tên. Mỗi làn coverage chỉ chứa các file nguồn mà nó sở hữu, việc chạy lặp lại vét cạn topology test đi kèm, và không build trước, vì bắt đầu từ một cây đã xóa hết mọi `lib/` sinh tự động, bộ coverage đầy đủ vẫn có thể pass.

Replay snapshot dùng hai làn nhiều file tường minh, cùng tám phân vùng theo kịch bản (scenario) cho file ACP (Agent Client Protocol) lớn. `scripts/snapshot-shards.ts` sở hữu danh sách này, và test của nó phát hiện mọi file mà cấu hình snapshot cho phép. Mỗi job snapshot cài đặt dependency trong khi runner Linux của nó chuẩn bị Bubblewrap, sau đó build runtime đã phát hành, và chỉ chạy bề mặt replay được gán cho nó. Bộ test này giữ giới hạn năm subprocess đồng thời, vì phần lớn thời gian replay là chờ I/O giao thức subprocess. Bộ bảo vệ fixture (dữ liệu chuẩn bị trước cho test) vẫn kiểm tra toàn bộ bảng kịch bản ACP trong mỗi phân vùng.

Kiểm tra kiểu tài liệu độc lập ở trạng thái cold-start dựng lại toàn bộ đồ thị tham chiếu project, nên làn kiểu tài liệu chuyên dụng chỉ build một lần, rồi dùng các khai báo đó để kiểm tra khối Markdown. Làn tài liệu Linux dùng build MPA của VitePress, giữ việc render trang và kiểm tra liên kết chết trong mục tiêu không phải Windows quan sát được; build Windows chặn (blocking) riêng biệt và làn site sản xuất giữ việc kiểm tra package đã sinh và site đã phát hành, đồng thời tránh đặt hai đường găng (critical path) này vào cùng một job.

Artifact dùng hai làn: một làn metadata đảm nhiệm `publint`, khai báo NodeNext, và việc load bất biến đã biên dịch; làn còn lại đảm nhiệm smoke của binary đã build. Mỗi làn tự build trước khi tới các bên tiêu thụ của nó. Việc build ngắn lặp lại tiêu tốn phút runner, nhưng tránh được việc upload/download dependency, và giữ đường găng mỗi job có giới hạn.

[scripts/publint-all.ts](../../../../scripts/publint-all.ts) gọi API mà publint hỗ trợ ngay trong tiến trình, nhắm vào view phát hành trong bộ nhớ; view này được cấu thành từ các file mà mỗi manifest khai báo cộng các file metadata bắt buộc của npm. Nhờ vậy không cần sinh 103 lệnh đóng gói package manager, mà vẫn giữ được sự khác biệt giữa file workspace và file đã phát hành. [scripts/verify-built-package-invariants.mjs](../../../../scripts/verify-built-package-invariants.mjs) stage các file `lib/` đã được manifest khai báo và kiểm chứng cấu trúc này dưới package thật, rồi chuẩn hóa việc import các tham chiếu tự thân đã biên dịch thông qua Node thuần và Cordis Loader. Nếu bên đi kèm chạm vào phân mảnh runtime chưa được khai báo, vẫn sẽ thất bại.

Làn tương thích chạy worker nguồn và smoke runtime Zstandard trên mỗi dòng phiên bản Node được khai báo hỗ trợ. TypeScript chỉ kiểm tra đồ thị nguồn một lần trong làn Node 24 chính chuyên dụng; lặp lại cùng một phân tích compiler trong job tương thích runtime chỉ làm tăng thời gian mà không cung cấp thêm tín hiệu đặc thù runtime.

Workflow cache pnpm store, gắn mỗi khóa cache ESLint bất biến với phân mảnh lint mà nó thuộc về, giữ PowerShell gốc cho các phép đo Windows, và giữ một trạng thái tổng hợp `all checks passed` dùng cho bảo vệ nhánh (branch protection). Windows tái sử dụng ba phân vùng lint vét cạn, và kết hợp các gate cơ bản/danh mục/nội dung cùng gate kiểu tài liệu/hợp đồng API sau khi setup runner chung; chỉ có cách lập lịch là khác so với phân vùng Linux. Build Windows và kiểm chứng site sản xuất tiếp tục chặn (blocking), trong khi ma trận static, lint và artifact rộng hơn của Windows vẫn là kiểm tra mang tính quan sát.

## Các phương án thay thế đã cân nhắc

- **Giữ làn rộng**: giảm thiểu tối đa YAML workflow, nhưng vẫn giữ chu kỳ phản hồi vài phút đã quan sát được.
- **Biến mỗi gate leaf thành một GitHub job riêng**: tối đa hóa fan-out, nhưng thời gian chuẩn bị runner cho các bộ sinh và kiểm tra nội dung nhỏ sẽ vượt quá thời gian kiểm tra repo.
- **Upload một bản build duy nhất cho các bên tiêu thụ artifact**: tránh biên dịch lặp lại, nhưng việc upload/download và lập lịch dependency sẽ kéo dài thời gian đồng hồ tường; build sạch đủ ngắn để có thể lặp lại trong làn có giới hạn.
- **Giữ việc đóng gói bằng package manager trong hai gate phát hành**: giao việc chọn manifest cho pnpm, nhưng sẽ lặp lại việc khởi động hơn 200 tiến trình package manager. Gate cấu trúc manifest cộng fixture view phát hành làm hợp đồng manifest đã tối ưu trở nên tường minh, và sẽ thất bại khi có dependency tồn tại trên đĩa nhưng chưa được phát hành.
- **Giữ build trước coverage**: cung cấp output sinh tự động mà bộ test nguồn không còn tiêu thụ nữa; bằng chứng coverage trên cây sạch cho thấy đây chỉ là độ trễ thuần túy.
- **Thực hiện type-check trên mỗi phiên bản Node**: lặp lại công việc compiler, trong khi smoke tương thích đã kiểm chứng hành vi load và nén đặc thù Node thực tế.

## Hệ quả

Danh sách phân mảnh và ma trận job nêu trên không còn thuộc hợp đồng repo hiện tại. Thay vào đó, quyết định dùng runner lớn hơn giữ toàn bộ danh sách chính trong một tiến trình duy nhất, và dùng bộ test tuần tự làm thước đo toàn vẹn độc lập.

Bộ kiểm chứng phát hành đã tối ưu phụ thuộc vào hợp đồng `files` của manifest được `verify-package-invariants` cưỡng chế. Nếu quy tắc phát hành vượt ra ngoài hợp đồng đó, gate cấu trúc và hai view staging phải thay đổi cùng nhau.

Job tương thích không còn tuyên bố rằng bản thân TypeScript đã được thực thi trên mỗi runtime Node. Chúng chứng minh việc load nguồn nhạy cảm với runtime trên Node 22, 24 và 26, còn runtime chính chịu trách nhiệm cho lần type-check đồ thị nguồn duy nhất.
