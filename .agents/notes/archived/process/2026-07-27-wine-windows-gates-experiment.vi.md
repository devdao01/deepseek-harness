# Agent Note: Chạy gate chặn Windows bằng Wine trên runner Linux

Status: implemented

Archived: 2026-08-08

[English](2026-07-27-wine-windows-gates-experiment.md) | 中文

## Vấn đề

Kênh Windows của pull request nhằm kiểm chứng hai bề mặt win32 mang tính chặn (blocking), là build workspace và site sản xuất. Kênh này trước đây chạy trên `windows-2025` được host, là job chậm nhất trong ma trận bắt buộc: mất 7-9 phút, trong khi job Linux mất 1.5-2.5 phút, do đó overhead khởi động VM Windows, chuẩn bị và hệ thống file chiếm phần lớn đường găng (critical path) của mỗi pull request.

Câu hỏi mà thí nghiệm này trả lời là: liệu một runner Linux thông thường có thể tạo ra tín hiệu win32 tương đương cho các bề mặt chặn này trong khoảng thời gian đồng hồ tường của job Linux, để đường đi của pull request hoàn toàn không có VM Windows nào không?

## Quyết định

Job `windows` bắt buộc của pull request (`windows node 24 / wine blocking`) trong [ci.yml](../../../../.github/workflows/ci.yml) chạy trên `ubuntu-latest`, dùng Wine để chạy lệnh gate chặn với binary Windows thật: Node.js win-x64 đã kiểm chứng checksum thực thi `tsc -b`, `tsdown` và build sản xuất VitePress, do đó các nhánh win32 của toolchain — xử lý đường dẫn dấu gạch chéo ngược, ngữ nghĩa sinh tiến trình `CreateProcess`, việc load PE của `@esbuild/win32-x64`, và plugin `.node` MSVC của rolldown/rollup — đều thực sự được thực thi. Job `serial-windows` của master giữ nguyên không đổi: toàn bộ danh sách kernel gốc, bao gồm cả các gate tính di động (portability) mang tính quan sát mà kênh này không chạy, vẫn thực thi trên `windows-2025` thật ở mỗi lần push vào master.

Dependency được cài native trên Linux, `supportedArchitectures` mở rộng sang win32-x64, khiến package nền tảng Windows được vật chất hóa vào cùng một store; việc gọi trực tiếp entry point JavaScript của từng công cụ giúp bỏ qua lớp cmd-shim, đây chính là các tiến trình mà `run-gates` cuối cùng sinh ra. `nodeLinker: hoisted` mang tính chịu lực, không phải vấn đề phong cách: một nguyên mẫu độc lập giữ layout isolated mặc định của pnpm — bao gồm cả việc cài lại trung thực bằng Windows pnpm offline trên store đã prefetch trên Linux — nhưng Node Windows chạy dưới Wine vẫn không thể đi xuyên qua chuỗi symlink isolated để phân giải `@esbuild/win32-x64` hoặc load sản phẩm precompiled của koffi, thất bại trước khi bất kỳ gate nào của repo được chạy. Layout file thật dạng phẳng (flat) mới khiến gate trở nên khả thi; kênh này kế thừa việc pin checksum của nguyên mẫu đó, đồng thời từ bỏ rõ ràng mục tiêu "Windows pnpm cài cây dependency" của nó (hợp đồng cài đặt ở đây vẫn được kiểm chứng bởi phía Linux).

Kênh này giữ thời gian đồng hồ tường ở mức tương đương job CI Linux nhờ bốn đòn bẩy: cache pnpm store được làm mới từ master (chỉ khôi phục, dùng chung key với job Linux), cung cấp Wine (cài apt, tải Node Windows, `wineboot`) chạy song song với `pnpm install`, hai bề mặt chặn chạy song song — cùng hình dạng mà `run-gates` gán cho chúng trên Windows gốc — và cache kho lưu trữ apt theo key là image runner, được gieo (seed) bởi job `wine apt cache` của master, để mỗi pull request có thể khôi phục từ phạm vi nhánh mặc định.

Logic gate tập trung trong một script duy nhất, [scripts/wine-windows-gates.sh](../../../../scripts/wine-windows-gates.sh): job ci.yml chỉ cung cấp trạng thái runner (cache, apt Wine) rồi gọi script đó, gate local tùy chọn `pnpm run check:windows-wine` chạy cùng script đó trên máy dev đã cài Wine — một hiện thực duy nhất, nên việc tái tạo kênh CI đỏ ở local không cần bất kỳ chuyển dịch nào giữa các môi trường. Gate local này là công cụ chẩn đoán chứ không phải kiểm tra định kỳ: chỉ chạy khi đang điều tra lỗi liên quan Windows đã biết; tín hiệu win32 thường ngày thuộc về CI, [dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md) cũng không bao giờ chọn nó. Script không bao giờ thay đổi working tree: chụp snapshot file đã tracked và file chưa tracked nhưng không bị ignore vào một thư mục tạm, chỉ áp override pnpm đặc thù Wine lên bản snapshot, và cài đặt tại đó nhắm vào store dùng chung; Wine prefix và file zip Node Windows đã kiểm chứng checksum được lưu bền vững dưới `.cache/wine-windows/`, chạy lại ở local sẽ bỏ qua bước cung cấp, khi không truy cập được nodejs.org sẽ fallback về zip đã cache mới nhất.

Năm ràng buộc môi trường định hình việc thực thi CI và local, mỗi ràng buộc được phát hiện qua một lần chạy đỏ: package `wine64` của Ubuntu tự nó không đặt gì vào PATH (phải cài `wine` dispatcher); Node dưới Wine không thể gắn stdio vào pipe của bên gọi (`Socket open EBADF` lúc khởi động — mọi lệnh gọi đều chuyển tiếp stdio qua file); Wine không thực hiện realpath cho symlink Unix trong layout isolated của pnpm (tức layout hoisted nói trên); Wine trên macOS cũng để lộ liên kết workspace hoisted như thư mục thường, do đó bộ tổng hợp test client sẽ nạp khai báo CSS module riêng của từng package, thay vì dựa vào realpath project-reference; Wine không thể tạo symlink Windows (`linkVue` của VitePress báo `ENOTSUP` — liên kết `vue` được host chuẩn bị sẵn trước gate).

## Kết quả đo thực tế

Đo thực tế ngày 2026-07-27, cache nóng, kích hoạt bởi pull request, `ubuntu-latest` 2 lõi chuẩn: end-to-end 2 phút 46 giây — chuẩn bị và khôi phục cache khoảng 17 giây, cài đặt + cung cấp song song 33 giây, gate song song 110 giây — so với 1.5-2.5 phút của job CI Linux và 7-9 phút của job `windows-2025` bị thay thế. Cache nguội tốn thêm khoảng một phút. Trong thời gian thí nghiệm có định nghĩa một job benchmark 8 lõi, nhưng nó chưa bao giờ thoát khỏi hàng đợi của pool `dsh-ubuntu-*` bị giới hạn; con số của runner chuẩn đã đạt yêu cầu, nên không dùng máy lớn hơn.

## Các phương án thay thế đã cân nhắc

**Giữ job pull request dùng `windows-2025` được host (hiện trạng).** Tín hiệu của nó không có vấn đề gì, vấn đề chỉ nằm ở độ trễ: tốn 7-9 phút cho hai lệnh build, là job chậm nhất trong ma trận bắt buộc. Nó vẫn tồn tại như tham chiếu tuần tự của master — nơi tính toàn vẹn quan trọng hơn độ trễ.

**Chạy toàn bộ máy khách Windows bằng QEMU/KVM trong runner Linux.** Kernel NT thật, độ trung thực đầy đủ, bao gồm cả NTFS không phân biệt hoa thường và ConPTY — nhưng phải mất hàng chục phút tải image và cài đặt không giám sát trước khi gate đầu tiên chạy (nhánh thí nghiệm anh em `exp/kvm-windows-ci` đo thực tế end-to-end 40 phút 19 giây). Chỉ khả dụng khi kèm cache image đĩa, điều này sẽ chiếm dụng ngân sách cache của Actions.

**Chạy cài đặt bằng Windows pnpm dưới Wine.** Biến thể độ trung thực cao hơn của cùng ý tưởng: đặt MinGit và pnpm vào prefix, dùng prefetch từ Linux để lấp đầy store, rồi để Node Windows chạy `pnpm install --offline`, khiến chính hợp đồng cài đặt được thực thi với danh nghĩa win32. Nó tới được bước cài đặt nhưng không tới được gate — mạng của Wine không truy cập trực tiếp được registry, và layout `node_modules` isolated dù sau khi cài offline sạch vẫn cản trở việc phân giải package nền tảng Windows. Kênh này hy sinh độ trung thực đó (layout hoisted, cài đặt phía Linux) để đổi lấy khả năng gate chạy được; hai tài liệu là hai nửa bổ sung cho nhau của cùng một quyết định.

**Kênh ngữ nghĩa hệ thống file trên Linux (casefold ext4, lint tên file).** Bắt được nhóm lỗi Windows tần suất cao nhất với chi phí gần như bằng không, nhưng không chứng minh được gì về binary win32. Được khám phá dưới dạng nhánh thí nghiệm anh em `exp/casefold-windows-ci`; bổ sung cho kênh này chứ không cạnh tranh.

**Container Windows.** Không khả thi: container Windows cần kernel host Windows; runner Linux được host không chạy được.

**Bỏ hẳn kênh Windows.** Đã bác bỏ — win32 là mục tiêu sản phẩm hạng nhất: module DACL và namespace bền vững dựa trên koffi, session PTY dựa trên ConPTY, và chính sách đường dẫn Windows đều được phân phối trong `packages/`.

## Hệ quả

Phán quyết Windows cho mỗi pull request giờ có thể đạt được trong khoảng thời gian của job Linux, dùng dung lượng runner chuẩn miễn phí, không còn bất kỳ VM Windows nào được cấp phát trên đường găng của pull request; `all checks passed` vẫn tiêu thụ đúng id job `windows` cũ.

Cái giá của thỏa thuận này: Wine hiện thực lại Win32 trên nền ext4 phân biệt hoa thường — sự không phân biệt hoa thường của NTFS, DACL thật, ngữ nghĩa ConPTY và tính bền vững khi crash đều chưa được chứng minh ở đây, và danh sách tính di động mang tính quan sát (duplication, publint, kiểu node-next, bất biến của package đã build trên win32) hoàn toàn không còn chạy trên pull request nữa. Tất cả những điều này đều do tham chiếu `serial-windows` của master chịu trách nhiệm kiểm chứng: pull request đèn xanh với Wine vẫn có thể thất bại khi chạy trên kernel gốc của master, và dự án chấp nhận khả năng thất bại này chỉ xuất hiện sau khi merge. Kênh này cũng cố định các khác biệt đặc thù của Wine thành cấu trúc job vĩnh viễn — stdio chuyển tiếp qua file, liên kết `vue` phía host, layout hoisted — nên các thay đổi toolchain trong tương lai phụ thuộc vào ngữ nghĩa layout isolated hoặc tạo symlink trong tiến trình sẽ lộ ra ở đây trước dưới dạng lỗi Wine chứ không phải lỗi sản phẩm, và việc phân loại phải nhận diện đúng như vậy. Nếu đèn đỏ Wine lặp lại liên tục mà không có nguyên nhân sản phẩm, lối thoát đã ghi lại là khôi phục job `windows` về định nghĩa `windows-2025` trước-Wine đã lưu trong lịch sử git.
