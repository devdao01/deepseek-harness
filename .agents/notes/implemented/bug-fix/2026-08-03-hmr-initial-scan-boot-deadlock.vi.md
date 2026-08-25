# Agent Note: HMR initial scan biến deadlock khi khởi động thất bại thành exit 13 âm thầm

Status: implemented

[English](2026-08-03-hmr-initial-scan-boot-deadlock.md) | 中文

## Vấn đề

Khi `dsh` khởi động mà việc kiểm tra cây config thất bại, process thoát với 13 (top-level await chưa kết toán), không in bất kỳ chẩn đoán nào, và để lại trạng thái terminal của TUI sót lại trên shell — đây đúng là triệu chứng mà [fail-loud release](2026-07-31-fail-loud-releases-the-terminal.md) đã sửa, tái xuất hiện qua một cơ chế khác sau [transactional config hot reload](2026-07-20-config-hot-reload-resilience.md).

Hai lỗi chồng lên nhau:

1. **Việc apply Include đồng thời phá vỡ group update dạng transaction.** Initial scan của chokidar trong main watcher của HMR sẽ khai báo lại mỗi file đã tồn tại như một `add`. Trong đó, `add` của file config kích hoạt `Include.refresh()` khi lần apply đầu tiên của Include còn chưa kết thúc (dedup key nội dung `this.content` chỉ được commit sau khi apply hoàn tất). Hai lần `EntryGroup.update` đồng thời trên cùng một group sẽ đan xen create và rollback trên cùng các entry, khiến Include fiber không bao giờ kết toán được: `loader.create` treo, `boot()` không resolve cũng không reject, event loop drain hết rồi Node thoát với 13.
2. **Chỉ tuần tự hóa apply thôi thì rollback thất bại sẽ deadlock.** Sau khi xếp hàng các thay đổi của Include, rollback khi lần apply đầu tiên thất bại sẽ giải phóng mọi entry đã mount — bao gồm cả `hmr` — mà việc tháo dỡ nó lại chờ task refresh của chính nó drain hết. Task refresh do scan kích hoạt đang nằm trong hàng đợi của Include, ngay sau lần apply đang rollback: rollback chờ HMR, HMR chờ refresh, refresh chờ apply.

## Quyết định

Cả hai lần sửa đều nằm trong package vendored (ghi lại ở `vendor/README.md`):

- `include/src/index.ts` gộp mọi thay đổi subtree — lần apply đầu tiên, refresh, việc apply lại patch `internal/update` — vào một hàng đợi promise cho mỗi Include. `update` dạng transaction của group không thể tái nhập, nên việc tuần tự hóa là yêu cầu tính đúng đắn, không phải đánh đổi throughput. `refresh()` cũng đọc file bên trong hàng đợi, để việc xác định thay đổi nội dung của nó so sánh với trạng thái sau khi task trước đã commit.
- `hmr/src/index.ts` truyền `ignoreInitial: true` cho main watcher. Initial scan chỉ khai báo lại các file mà quá trình khởi động vừa tiêu thụ; ngăn nó lại đồng thời loại bỏ cả refresh trong lúc khởi động lẫn event `add` thừa cho module đã load. `registerConfig()` giữ nguyên watcher `ignoreInitial: false` của riêng nó, vì config cá nhân đã tồn tại tại thời điểm đăng ký bắt buộc phải được apply đúng một lần.

Khi cả hai đã có mặt, khởi động thất bại đi theo đúng đường dự kiến: đúng một lần apply thất bại, rollback và dispose (giải phóng tài nguyên) toàn bộ cây (thực hiện shutdown của chính TUI, khôi phục terminal), `loader.create` reject, `boot()` throw lại chẩn đoán có gắn nhãn và thoát với 1.

## Các phương án đã cân nhắc

**Chỉ thêm `ignoreInitial: true`.** Loại bỏ điều kiện kích hoạt, nhưng vẫn giữ nguyên sự phá vỡ: bất kỳ refresh đồng thời thực sự nào (chỉnh sửa config đua với một lần apply chậm) vẫn sẽ đan xen hai lần group update và khiến fiber treo lơ lửng.

**Chỉ tuần tự hóa.** Biến sự phá vỡ thành deadlock rollback nói trên; process vẫn thoát âm thầm với 13.

**Hủy refresh đang chờ trong hàng đợi khi HMR tháo dỡ.** Cần dựng cơ chế hủy trong cả vòng lặp task của `refreshConfig` lẫn hàng đợi Include, trong khi `ignoreInitial` đã loại bỏ kịch bản này khỏi mỗi lần khởi động; chưa đáng để đưa cơ chế này vào trước khi điều kiện kích hoạt thật sự xuất hiện.

## Hệ quả

Việc chỉnh sửa file config rơi vào đúng cửa sổ scan khởi động của watcher, giờ được bắt bởi event `change` tiếp theo thay vì bởi chính scan; hành vi reload ở trạng thái ổn định không đổi.

Vẫn còn một khoảng hở tiềm ẩn: việc chỉnh sửa config xảy ra trong lúc lần apply đầu tiên đang *thất bại* vẫn có thể xếp hàng một refresh mà một lần tháo dỡ HMR đang rollback đang chờ — cùng hình dạng deadlock, nhưng cửa sổ kích hoạt thu hẹp lại còn quy mô thao tác thủ công của một lần khởi động thất bại. Nếu điều này thực sự xảy ra, hướng sửa là hủy task refresh khi HMR tháo dỡ.

## Kiểm thử

Kịch bản PTY với provider không hợp lệ của `dsh` trong `apps/cli/tests/tui-keyless-smoke.e2e.ts` cố định thỏa thuận đầu-cuối: thoát với 1, chẩn đoán có gắn nhãn `dsh: plugin tree failed to load:` chỉ ra `$.providers`, và chuỗi reset bracketed-paste chứng minh toàn bộ cây đã được giải phóng. Trước khi sửa lỗi này, cùng kịch bản đó quan sát được exit 13 không có chẩn đoán. Hành vi reload vẫn được bao phủ bởi `packages/boot/app-boot/tests/config-reload.spec.ts` và `packages/boot/app-boot/tests/hmr-config.spec.ts`.
