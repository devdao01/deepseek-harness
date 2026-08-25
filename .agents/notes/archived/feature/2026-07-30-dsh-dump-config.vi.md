# Agent Note: dsh --dump-config in ra cây cấu hình đã tổng hợp

Status: implemented

Archived: 2026-08-07

[English](2026-07-30-dsh-dump-config.md) | 中文

## Problem

Cây cấu hình khi khởi động là một kết quả tổng hợp mà người dùng chưa từng thấy: cấu hình nền tảng đã giao, lớp phủ (overlay) giao diện, và lớp phủ `--config` hoặc `~/.dsh/config.yaml` cá nhân được áp dụng tuần tự dưới dạng danh sách patch cùng cấp, trong đó mỗi patch nhắm theo id sẽ thay thế toàn bộ `config` của dòng mục tiêu, id không khớp chỉ sinh cảnh báo. Việc gỡ lỗi một lớp phủ cá nhân có hành vi bất thường (thiếu trường cần khai báo lại, gõ sai id dòng, patch áp dụng nhầm giao diện) đòi hỏi phải mô phỏng lại thuật toán patch trong đầu qua ba file. Không có cách nào để xem cây kết quả cuối cùng, cũng không có cách nào để diff nó với giá trị mặc định đã giao.

## Decision

`dsh --dump-config` và `dsh web --dump-config` in ra stdout dưới dạng YAML danh sách mục đã tổng hợp — cấu hình nền tảng, lớp phủ giao diện, rồi chồng thêm `--config` hoặc lớp phủ cá nhân — chính xác là các lớp được lắp ráp khi giao diện đó khởi động, rồi thoát mà không khởi động bất cứ thứ gì. `dsh --dump-default-config` / `dsh web --dump-default-config` dừng lại ở lớp phủ giao diện, do đó diff hai output này sẽ cho thấy chính xác lớp người dùng đã thay đổi gì.

Bản dump không thể lệch khỏi thực tế khởi động, vì nó tái sử dụng cùng code mount: include đã vendor xuất thuật toán patch dưới dạng hàm thuần túy `applyEntryPatches(data, patches, warn)` (phương thức `applyPatches` riêng tư giờ ủy quyền cho nó), và xuất phương ngữ (dialect) YAML `!!js` dưới dạng `entryListSchema`; `renderConfigDump()` của `dsh-app-boot` dùng cả hai để tổng hợp và render các lớp có gắn nhãn, `apps/cli/src/dump-config.ts` chỉ là một lớp bọc mỏng để chọn giao diện. Biểu thức `!!js` được in nguyên văn, không được evaluate — bản dump thể hiện kết quả tổng hợp, không phải môi trường của một tiến trình cụ thể — patch không có dòng mục tiêu sẽ báo lên stderr kèm nhãn lớp của nó, nhất quán với cảnh báo khi Loader khởi động. Các giá trị ngữ cảnh khởi động do launcher giữ (danh tính session, patch cờ CLI của web, đường dẫn frontend dist) là sự thật cho mỗi lần gọi, nằm ngoài cây cấu hình, sẽ không xuất hiện. Cờ dump từ chối các cờ chỉ dùng cho khởi động (`-p`, `--resume`, `--config-replace`) và hai cờ dump loại trừ lẫn nhau, `--dump-default-config` không nhận `--config`.

Mỗi đoạn dòng liên tiếp có cùng nguồn gốc đều có một comment `# ==` phía trước, ghi rõ file nào đóng góp các dòng này và lớp nào đã patch chúng (`# == base.cordis.yml, patched by tui.cordis.yml`), do đó output vừa cho thấy mỗi phần đến từ file nào, vừa vẫn là một tài liệu YAML có thể load được. Việc tổng hợp là một lệnh gọi `applyEntryPatches` duy nhất trên tất cả các lớp đã trải phẳng — có hình dạng lệnh gọi giống hệt lúc khởi động, do đó ngay cả các trường hợp biên về khả năng nhìn thấy patch (một lớp sau nhắm vào mục con trong nhóm được đưa vào bởi một lớp trước qua thay thế `config` thông thường, mà chỉ mục id một lượt (single-pass) không nhìn thấy) cũng khớp hoàn toàn với việc tổng hợp lúc khởi động; nếu gọi riêng cho mỗi lớp, chỉ mục sẽ bị xây dựng lại giữa các lớp, in ra một cây mà khởi động không bao giờ mount. Nguồn gốc được suy ra từ snapshot tiền tố (prefix) của một lệnh gọi duy nhất (nền tảng + lớp thứ 1..k) bằng cách diff theo vị trí: thuật toán patch chỉ ghi đè dòng tại chỗ hoặc thêm vào cuối, do đó chỉ mục cấp cao nhất định danh cùng một dòng giữa các snapshot; nếu dòng thay đổi sau khi thêm một lớp nào đó (thay `config`, disable, chèn trong nhóm) thì coi như lớp đó đã patch dòng này. Mỗi snapshot đều clone danh sách patch, vì `applyEntryPatches` sẽ đẩy các dòng `insert` theo tham chiếu vào kết quả từ danh sách patch.

`dsh-app-boot` trước đây đã sao chép kiểu YAML `!!js` của include để phân giải patch; giờ chuyển sang import `entryListSchema`, phương ngữ này giờ chỉ có một chủ sở hữu duy nhất.

## Alternatives considered

**Khởi động toàn bộ cây rồi dump `ctx.loader.entries()`.** Từ chối: khởi động sẽ evaluate biểu thức `!!js` (làm rò rỉ môi trường của một máy nào đó vào cấu hình được in ra), khởi động adapter và session dưới dạng side effect, cần đường dỡ bỏ (teardown) độc lập với TTY, và chậm. Bản dump dùng để gỡ lỗi việc tổng hợp, mà việc tổng hợp là một hàm thuần túy của các file đó.

**Triển khai lại việc gộp patch trong CLI.** Từ chối: một triển khai thứ hai của `applyPatches` sẽ âm thầm lệch khỏi include đã vendor — đây chính xác là kiểu lỗi mà tính năng này cần gỡ. Xuất thuật toán riêng của include chỉ tốn một sửa đổi vendor được ghi lại, nhưng đảm bảo tính đồng nhất.

**Dùng lệnh TUI `/dump-config` thay cho cờ.** Bị từ chối làm hình thức duy nhất: cách dùng chính là các luồng công việc dạng pipe như `dsh --dump-config | diff - <(dsh --dump-default-config)`, cần giao diện không khởi động, không TTY. Có thể thêm lệnh TUI trên cùng `renderConfigDump` này sau.

## Consequences

Việc gỡ lỗi cấu hình chuyển từ mô phỏng patch trong đầu thành một lệnh duy nhất, đội hỗ trợ cũng có thể yêu cầu trực tiếp output `--dump-config`. Include đã vendor có thêm một sửa đổi cục bộ được ghi lại (xuất `applyEntryPatches`/`entryListSchema`; không ảnh hưởng hành vi mount), cần áp dụng lại khi đồng bộ upstream. Việc truy vết nguồn gốc tổng hợp lại một snapshot tiền tố cho mỗi lớp và diff các dòng bằng JSON stringify, do đó bản dump có chi phí phụ thêm tỷ lệ thuận với bình phương số lớp × số dòng; chi phí này chỉ tồn tại trên đường dump không khởi động. Unit test của `renderConfigDump` bao phủ thứ tự chồng lớp, việc in nguyên văn `!!js` qua lại, việc phân tách và gom nhóm nguồn gốc, cảnh báo patch không khớp có gắn nhãn, và báo lỗi rõ ràng khi đọc／parse／hình dạng thất bại; test e2e trên built-bin dùng `lib/bin.js` để chạy đủ bốn dạng cờ, bao gồm lớp phủ cá nhân, nhãn nguồn gốc của nó và cảnh báo stderr của nó.
