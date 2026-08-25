# Agent Note: Xuất vị trí chính xác chưa được bao phủ khi coverage không đạt

Status: implemented

[English](2026-08-06-coverage-uncovered-locations.md) | Tiếng Việt

## Vấn đề

Khi gate coverage per-file 100% fail, vitest chỉ xuất một dòng lỗi cấp file (`ERROR: Coverage for lines (…) does not meet global threshold (100%) for <file>`) — biết file nào không đạt, nhưng không biết thiếu ở dòng nào. Report `text` có sẵn tuy có cột Uncovered Line #s, nhưng đó là một bảng lớn cho hàng trăm file toàn repo: cột này bị cắt theo bề rộng bảng, chỉ có số dòng chứ không có số cột, không phân biệt statement/branch/function, và các file đạt chuẩn vẫn chiếm dòng. Kết quả là báo cáo coverage đỏ trên CI không thể xử lý trực tiếp, việc định vị khoảng trống cụ thể chỉ có thể làm bằng cách chạy lại report html cục bộ.

## Quyết định

`scripts/coverage-uncovered-locations.cjs` là một istanbul reporter tùy chỉnh (lớp con của `ReportBase`): với mỗi file dưới 100%, nó xuất một bản ghi một dòng tự chứa `<path>:<line>:<col> uncovered <kind> …` cho mỗi statement chưa được bao phủ, mỗi nhánh chưa đi qua, và mỗi function chưa được gọi — có thể click chuyển ngay trong terminal và log CI, cũng dễ grep. Không có output nào khi mọi file đều đạt chuẩn. Việc sinh report istanbul diễn ra trước khi xác thực threshold, nên bản ghi nằm ngay phía trên dòng ERROR sẵn có.

Việc gắn kết chỉ có một điểm duy nhất: khối coverage trong `vitest.config.ts` gốc là cấu hình coverage duy nhất toàn repo, lane CI (`run-gates ci-coverage`), `test:coverage` cục bộ và lần chạy tập trung (`--coverage.include`) đều dùng chung nó. Reporter này được thêm vào cả hai mảng reporter của CI và cục bộ bằng đường dẫn tuyệt đối (`fileURLToPath`) — `create()` của istanbul-reports fallback về `require(name)` trần cho tên không có sẵn, đường dẫn tương đối sẽ được resolve theo thư mục package riêng của istanbul.

Quy ước output:

- Số cột 0-based của istanbul được chuyển thành 1-based (quy ước liên kết của editor và terminal).
- v8 cho statement nguyên dòng `end.column = Infinity`: khi trải dài nhiều dòng sẽ hạ cấp thành hậu tố `(to <line>)` chỉ có số dòng, khi trên một dòng thì bỏ hậu tố.
- Nhánh ngầm định (như trường hợp thiếu else) có thể không có vị trí, reporter sẽ fallback về span của chính nhánh đó, đảm bảo bản ghi vẫn click được; bản ghi nhánh ghi chú loại và `path k/n`.
- Bản ghi trong cùng một file được sắp theo dòng, cột; không giới hạn số lượng.

Đi kèm hai chỗ: `package.json` gốc bổ sung devDependency `istanbul-lib-report` (bố cục strict của pnpm khiến `scripts/` không với tới dependency lồng); wildcard entry/project của workspace gốc trong `knip.json` thêm `scripts/**/*.cjs`, giúp file này cùng dependency của nó hiện diện với gate hygiene.

CJS là hình thái bị ép buộc, cũng là một ngoại lệ có căn cứ đối với kỷ luật ESM-everywhere: istanbul nạp reporter tùy chỉnh bằng `require()` trần ngoài pipeline tsx/Vite, TypeScript không thể tham gia; namespace object mà `require(esm)` trả về cũng không qua được `new Cons(cfg)` mà nó dùng để dựng, CommonJS là hình thái duy nhất đáng tin cậy.

## Các phương án đã cân nhắc

- **Dựa vào cột Uncovered Line #s của report `text` có sẵn.** Chính là hiện trạng của vấn đề: bảng lớn toàn repo, cột bị cắt theo bề rộng, chỉ có số dòng, không phân loại, file đạt chuẩn vẫn chiếm cột — không thể xử lý trực tiếp dựa trên log CI.
- **Thêm reporter `json`, viết script wrapper riêng đọc `coverage-final.json` để hậu xử lý khi fail.** Thuần ESM/TS khả thi, nhưng script wrapper phải bao cả hai điểm vào là `test:coverage` của `package.json` lẫn gate của run-gates, hình dạng lệnh sẽ thay đổi theo; hướng reporter tùy chỉnh chỉ động vào một chỗ cấu hình, cả hai điểm vào tự động có hiệu lực.
- **Viết reporter bằng TypeScript/ESM.** Cơ chế nạp của istanbul (`require` trần ngoài pipeline) khiến điều này không khả thi, như đã nêu ở trên; đổi cả cơ chế nạp chỉ vì một file report là cái giá không tương xứng.

## Xác minh

Ma trận cục bộ: cố ý tạo ra trường hợp không đạt chuẩn thì đủ cả ba loại bản ghi, vị trí khớp với điểm cài; chạy hỗn hợp chỉ xuất file không đạt chuẩn (file đạt 100% trong cùng lần chạy im lặng); chạy toàn xanh không có output, mã thoát 0. Thực chứng trên CI: tạm thời cài một statement/branch/function không thể tới được vào `clampTimeout`, lane coverage trong điều kiện toàn bộ test pass (632 file / 10326 case), chỉ threshold fail, in ra 4 bản ghi phía trên dòng ERROR; lỗi được cài vào không nằm trong cây mã đã commit.

## Hệ quả

- Báo cáo coverage đỏ tự đủ thông tin: log trực tiếp cho số dòng, cột chính xác và loại khoảng trống, không còn cần chạy lại report html cục bộ để định vị.
- Cái giá là một ngoại lệ kỷ luật CJS cho một file và một devDependency gốc; chạy toàn xanh không có output, không tăng nhiễu log.
- Khi cả file không có coverage nào, số bản ghi xuất ra tương đương số statement của file đó (cố tình không giới hạn): gate yêu cầu không khoảng trống nào, liệt kê toàn bộ chính là danh sách hành động, dòng ERROR gộp theo file của bản thân vitest vẫn là lưới an toàn cuối.
