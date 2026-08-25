# Agent Note: Seam settings người dùng (`ctx.settings`) và provider file

Status: implemented

[English](2026-07-28-user-settings-seam.md) | Tiếng Việt

> Phạm vi: họ năng lực `packages/settings/` — Service Definition, provider file, và ranh giới lắp ráp giữa settings người dùng và `cordis.yml`. [Ghi chú về config-tree của web](2026-07-24-web-config-tree-boot-and-transport-layering.md) trước đây từng ghi "đường ghi profile" là một mục hoãn lại; seam này chính là nơi thuộc về của đường ghi đó. Việc di trú consumer (theme, ngôn ngữ, định tuyến model mặc định) và mặt RPC `settings.*` của web là công việc tiếp theo, không nằm trong phạm vi đã giao của note này.

## Vấn đề

Cấu hình mà người dùng có thể chỉnh sửa không có nơi thuộc về: `dsh web` đọc profile json neo theo cwd qua whitelist tĩnh và không có đường ghi, TUI đọc patch loader trần từ `$DSH_HOME/config.yaml`, cả hai đều bị đóng băng lúc khởi động. Trang settings cá nhân (web GUI) cần một tầng người dùng xuyên suốt các surface, có kiểm tra schema, đường ghi và truyền dẫn nóng (hot) — các sản phẩm cùng loại (Codex, Claude Code, Kimi, OpenCode, Pi) cũng đều hội tụ về nguyên tắc "tách biệt sở thích người dùng khỏi việc lắp ráp mở rộng". Việc cập nhật cấu hình phản ứng (reactive) của Loader không gánh vác được việc này: `fiber.update` thay thế tại chỗ config của entry, plugin đã đọc config lúc khởi tạo hoàn toàn không hay biết, và cũng không có callback nào thông báo cho nó.

## Quyết định

**Hai mặt, một tiêu chí phán định.** `cordis.yml` (+ Include patches) vẫn là mặt lắp ráp: có những plugin nào, đấu nối ra sao, cấu hình triển khai — thuộc về orchestrator và được nâng cấp cùng sản phẩm. Namespace settings chỉ mang tập con mà người dùng có thể chỉnh sửa; tiêu chí phán định là "trang cấu hình cá nhân có nên sửa được nó hay không?". Giá trị có thể tồn tại đồng thời ở cả hai mặt mà không mơ hồ, vì việc phân lớp chính là quy ước: giá trị mặc định của schema, rồi tới `base` lắp ráp của bên đăng ký (tập con cấu hình entry của nó), cuối cùng là phần tài liệu của người dùng.

**Phản chiếu ranh giới ba package của `session-persistence/`.** `dsh-settings` sở hữu service `SettingsProvider` trừu tượng: registry namespace, việc resolve theo lớp, kiểm tra schema, phát hiện thay đổi bằng so sánh sâu (deep equal) theo namespace, và sự kiện commit `settings/updated`. Provider chỉ triển khai `writable`/`load()`/`persist(ns, section)`, và đẩy document quan sát được từ bên ngoài qua `publish(doc)` được bảo vệ — nên ngữ nghĩa cập nhật nóng nhất quán trên mọi provider, backend trung tâm cấu hình mạng (kiểu nacos, có thể chỉ đọc) chỉ cách một package ngang hàng. `dsh-settings-file` là provider file: YAML/JSON được định vị bởi `resolveSpec` (đường dẫn mặc định được đặt tường minh là `<DSH_HOME>/settings.yaml`), giám sát bằng chokidar, việc persist đọc-sửa-ghi commit nguyên tử bằng `0600` tmp+rename dưới khóa ghi xuyên tiến trình, việc vá diff ở cấp lá cho namespace bị ghi (comment ở những node không bị chạm tới được giữ nguyên), việc ức chế tự-ghi theo so sánh nội dung bằng nhau ([ghi chú về tính toàn vẹn đường ghi](2026-07-30-settings-write-path-integrity.md)).

**Đăng ký là một effect trên fiber của bên gọi.** `register()` được gọi qua service proxy, `this.ctx` chính là context của bên đăng ký, việc đăng ký được gắn vào `ctx.effect`: khi thực hiện dispose (giải phóng tài nguyên) cho bên đăng ký, tức là gỡ bỏ namespace và observer của nó (đã được chứng minh qua test dispose HMR — Hot Module Replacement), trong khi phần section của người dùng vẫn tiếp tục ở lại trong storage chờ owner kế tiếp.

**Tĩnh lặng thì báo lỗi lớn tiếng, đang chạy thì giữ giá trị khả dụng cuối cùng.** Kiểm tra lúc khởi động và lúc đăng ký sẽ ném lỗi trực tiếp (section tồn tại sẵn không hợp lệ sẽ làm plugin đang đăng ký thất bại; document tồn tại nhưng không parse được sẽ làm provider load thất bại). Chỉnh sửa bên ngoài bị hỏng trong lúc đang chạy chỉ cảnh báo và giữ trạng thái khả dụng cuối cùng theo từng namespace — hot reload tuyệt đối không được kéo sập tiến trình. Sự bất đối xứng này phản chiếu `Include.refresh()` và cách reload runtime an toàn của Kimi.

**Consumer vốn dĩ là tùy chọn.** Consumer đăng ký bên trong `ctx.inject(['settings'], …)`; khi không mount provider thì vẫn chỉ resolve theo entry config, nên mọi lắp ráp, demo, snapshot hiện có đều hoạt động nguyên trạng, việc di trú diễn ra dần dần theo từng plugin.

## Phương án thay thế

- **Dùng việc ghi ngược (write-back) của Include làm tầng người dùng** (kiểu cordis-webui ghi trang cấu hình theo từng plugin vào file loader entry): mục tiêu ghi ngược là các file theo từng lắp ráp, sẽ trói chặt sở thích người dùng vào một `cordis.yml` cụ thể; tầng người dùng phải sống sót qua các lần nâng cấp template, và phục vụ cả TUI lẫn web bằng cùng một document.
- **Dùng `fiber.update` phản ứng của Loader làm kênh truyền dẫn**: việc đọc lúc khởi tạo hoàn toàn không hay biết; `watch()` tường minh của seam biến việc cập nhật nóng thành một contract của consumer thay vì phép màu của framework.
- **Service settings theo domain** (getter theo từng domain sản phẩm): bị bác bỏ vì gây ghép chặt; service chỉ làm việc lưu trữ, kiểm tra, phát hành — ý nghĩa domain để lại cho bên đăng ký sở hữu schema.
- **Làm đa lớp ưu tiên ngay bây giờ** (kiểu phân cấp system/managed/project của Codex/Claude Code): hoãn lại tới khi lớp thứ hai thực sự xuất hiện; bước resolve là điểm mở rộng duy nhất cho việc phân lớp trong tương lai.
- **Áp dụng khóa xuyên tiến trình ngay bây giờ** (kiểu proper-lockfile của Pi): ban đầu bị hoãn lại với lý do "thay thế nguyên tử cộng với việc watcher hội tụ, khi nào có xung đột thực sự thì tính tiếp" — nhưng việc hội tụ sẽ làm mất các namespace ngang hàng chưa được quan sát, nên việc hoãn lại này đã bị thay thế bởi khóa ghi viết tay trong [ghi chú về tính toàn vẹn đường ghi](2026-07-30-settings-write-path-integrity.md).

## Hệ quả

Hoãn lại theo thứ tự dependency: mặt RPC `settings.raw`/`settings.describe`/`settings.update` của web (phải ẩn (redact) trường `role('secret')` trước khi phơi bày); di trú lứa consumer đầu tiên (`ui-theme`, ngôn ngữ, định tuyến mặc định của api-gateway) và loại bỏ `PROFILE_MAPPINGS` cùng profile json; tham chiếu gián tiếp giá trị `${env:VAR}` hướng tới secret; phân lớp phía provider. Nghĩa vụ snapshot keyless đáp xuống cùng với consumer đầu tiên mà model hoặc người dùng sản phẩm có thể nhìn thấy được, chứ không phải ở bước hạ tầng này.
