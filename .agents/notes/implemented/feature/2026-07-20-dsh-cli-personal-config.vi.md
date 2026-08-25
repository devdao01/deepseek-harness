# Agent Note: dsh CLI và personal config overlay từ Harness home

Status: implemented

[English](2026-07-20-dsh-cli-personal-config.md) | 中文

## Vấn đề

Sở thích riêng của developer — TUI dùng provider và model nào, credential cá nhân, routing adapter riêng tư — ngoài việc sửa các file đã commit thì không có chỗ nào để đặt. Để trỏ ví dụ TUI vào Anthropic proxy Opus route cá nhân, chỉ có thể sửa `examples/tui-agent/cordis.yml` và `.env` trong workspace, vừa có rủi ro commit nhầm key, vừa phải lặp lại việc này ở mỗi checkout. Cũng không có lệnh có thể cài đặt: muốn chạy agent (智能体) này trong bất kỳ thư mục dự án nào, phải quay về thư mục gốc repo để gọi script ví dụ. Loader metadata là tĩnh — ngoại trừ trường `disabled` của entry (xem [quyết định nội suy `disabled` của loader entry](../architecture/2026-08-11-loader-entry-disabled-interpolation.md)) — nên "tổ hợp cấu hình có điều kiện dùng overlay" (AGENTS.md); nhưng trước đây overlay chỉ tồn tại dưới dạng file cùng cấp đã commit, không có tầng máy-cục-bộ (machine-level).

## Quyết định

Các mẫu entry dưới đây, cùng tên và vị trí của file cá nhân, đã bị [quyết định profile plugin composition bundle](../architecture/2026-08-05-profile-plugin-bundles.md) thay thế: `dsh` khởi động profile, tầng cá nhân trở thành `cordis.patch.yml` theo từng profile và cấp home. Điều không đổi là nội dung cốt lõi của note này: dùng Harness home làm gốc của tầng máy-cục-bộ, dùng ngữ nghĩa patch trên nền composition đi kèm, và báo lỗi rõ ràng khi resolve thất bại.

Hai phần khớp nhau, đồng bộ với tầng lắp ráp `apps/` được đề xuất trong PR `dsh web` (#443):

**`dsh` CLI (command-line interface; `apps/cli`, tên npm `@deepseek-ai/dsh`).** `apps/*` là tầng lắp ráp sản phẩm nằm trên các thư viện `packages/*`. Một bin chịu trách nhiệm phân phối TUI tương tác mặc định, vòng lặp headless `-p`/`--prompt`, và giao diện `web`. TUI dùng thư mục gọi lệnh làm workspace, khởi động `examples/tui-agent/cordis.yml` (hoặc config được chỉ định qua `--config`). Trong source checkout, script `pnpm dsh` ở gốc không build mà chạy trực tiếp cùng entry point qua ESM hook của tsx; cách chạy này được quy định bởi [quyết định khởi động từ source](../architecture/2026-07-29-dsh-source-launch-tsx-esm.md), việc sinh artifact được quy định bởi [quyết định tách khởi động từ source khỏi build](../simplification/2026-08-12-separate-source-launch-from-build.md).

**Cấu hình cá nhân (`dsh-app-boot`).** Overlay cá nhân được lưu tại Harness home — `$DSH_HOME`, nếu không thì `~/.dsh` — được resolve bởi [`resolveDshHome`](../architecture/2026-07-24-single-harness-home-resolver.md) dùng chung (`@deepseek-ai/dsh-home-paths`), cùng gốc duy nhất mà skill (技能) và việc resolve AGENTS.md dựa vào. Giao diện TUI, Web và headless của dsh dùng hai file tùy chọn trong đó; các bin ví dụ vẫn khởi động y nguyên theo cây cấu hình đã commit:

- `.env` — được load sau `.env` của thư mục gọi lệnh; `process.loadEnvFile` không bao giờ ghi đè giá trị đã có, nên thứ tự ưu tiên là biến môi trường > `.env` của project > `.env` cá nhân.
- `config.yaml` — một mảng YAML cấp cao nhất, các phần tử là `PatchOptions` của `@cordisjs/plugin-include`, được parse bằng phương ngữ `!!js` riêng của include (`loadPersonalPatches`) và truyền cho `boot()`, nơi nó được chuyển tiếp làm `patches` của include gốc. Ngữ nghĩa patch nhất quán với overlay surface được giao: patch theo id sẽ thay toàn bộ `config` của entry đó, `insert` thêm entry mới, id không khớp thì lặng lẽ không làm gì. Các package bên ngoài được cài đặt dưới dạng [profile composition bundle](../simplification/2026-08-09-remove-repository-plugin.md); tầng cá nhân này chịu trách nhiệm cấu hình các entry Loader mà những bundle đó cung cấp.
- File không tồn tại nghĩa là không có overlay; file tồn tại nhưng không đọc được, không parse được hoặc không phải mảng thì sẽ ném lỗi khi khởi động (lỗi cấu hình báo rõ ràng, không bao giờ lặng lẽ bỏ qua).

Launcher của PTY smoke test cô lập `$DSH_HOME` vào thư mục riêng của mỗi test, giống hệt cách nó đã cô lập `DSH_AGENTS_HOME`; overlay cá nhân thật của developer không thể rò rỉ vào fixture (dữ liệu tiền đề của test); chỉ dsh CLI đọc cấu hình cá nhân, nên các launcher test khác không cần thay đổi.

TUI và Web sau khi khởi động sẽ đăng ký đường dẫn cấu hình cá nhân chính xác qua Cordis HMR (hot module replacement). Mỗi lần thêm, sửa hoặc xóa đều tái tổ hợp toàn bộ danh sách patch theo kiểu transaction thông qua closure composition riêng của launcher, nên patch cá nhân mới sẽ nằm đúng vị trí tầng như lúc khởi động. Khi YAML không hợp lệ hoặc Loader candidate bị từ chối, cây khả dụng cuối cùng vẫn giữ active, và phát broadcast `hmr/config-update-failed(filename, Error)`; giao diện headless chỉ đọc file này lúc khởi động. Include cũng áp dụng lại patch của nó khi file cấu hình đã commit được refresh (xem [Agent Note về khả năng phục hồi hot-reload cấu hình](../bug-fix/2026-07-20-config-hot-reload-resilience.md)).

## Phương án đã cân nhắc

**Thêm một script wrapper `bin/dsh` riêng và để nó chiếm tên `dsh`.** Bị từ chối, vì `apps/cli` là CLI sản phẩm thống nhất, chịu trách nhiệm phân phối TUI mặc định, headless và giao diện Web. Hai entry cạnh tranh nhau sẽ xung đột về `$PATH` và định danh sản phẩm.

**File setting kiểu pi có type (`defaultProvider`/`defaultModel`/`providers`).** Bị từ chối, chọn ngữ nghĩa patch (quyết định của product lead): file cá nhân là overlay cordis chồng lên trên default do repo cung cấp, chứ không phải một bộ từ vựng cấu hình thứ hai cần sở hữu và dịch riêng.

**`cordis.yml` đầy đủ cá nhân để include ghi đè cấu hình yêu cầu.** Bị từ chối: file cá nhân sẽ phải hard-code đường dẫn của leaf config, mà đường dẫn này thay đổi theo checkout; patch đảo ngược chiều phụ thuộc, bin vẫn chọn cây cấu hình, tầng cá nhân chỉ điều chỉnh.

**Deep-merge patch cá nhân vào entry config.** Bị từ chối: sẽ làm ngữ nghĩa patch phân nhánh khỏi overlay đã commit và include của vendor; việc thay thế toàn bộ `config` đã là quy ước thành văn.

**Dùng biến môi trường bật/tắt thay vì kiểm tra sự tồn tại.** Bị từ chối: cấu hình cá nhân mặc định tắt sẽ không bao giờ được dùng đến; tồn tại là có hiệu lực, cộng với cô lập rõ ràng cho từng test, giúp lần chạy thật nhận được overlay còn test nhận được tính khép kín.

## Hệ quả

- Lệnh `dsh` đã cài đặt có thể chạy từ bất kỳ thư mục nào, người dùng source thì gọi `pnpm dsh` từ checkout; cả hai đều không cần sửa checkout mà vẫn áp dụng được entry provider, model, bundle đã cài và các entry Loader khác theo cấu hình cá nhân. Hành vi này đã được xác thực end-to-end với Anthropic proxy cá nhân và Opus 4.8, bao gồm một vòng round-trip bash tool.
- Vì patch theo id thay toàn bộ `config`, override cá nhân phải lặp lại các trường nền mà nó muốn giữ, và có thể lệch dần khi hình dạng config nền thay đổi; công cụ chẩn đoán là cảnh báo "config not found/name mismatch" của loader và [`dsh --dump-config`](../../../../apps/cli/README.md#profiles) (in ra cây cấu hình được tổng hợp từ các patch này).
- Patch cá nhân chỉ resolve id trong cây của chính file được khởi động, nên overlay của include lồng nhau (Code Mode) sẽ không được cá nhân hóa; tính tương đương thực thi của các leaf này tạm gác lại.
- `dsh-app-boot` phụ thuộc `js-yaml`, và import trực tiếp phương ngữ YAML `!!js` của include (`entryListSchema`); giống `apps/cli`, nó phụ thuộc `@deepseek-ai/dsh-home-paths` để lấy `resolveDshHome`.
- Chỉ có tiến trình TUI và Web chạy lâu dài mới thực hiện theo dõi real-time. Automation headless dùng cấu hình khởi động xác định (deterministic), không giữ watcher khi thoát.

## Kiểm thử

`packages/boot/app-boot/tests/user-patches.spec.ts` chốt (pin) việc parse, áp dụng lúc khởi động, thêm mới theo đường dẫn chính xác, thất bại, phục hồi, xóa, rollback về trạng thái khả dụng cuối cùng, broadcast thất bại, và bảo toàn việc áp dụng patch của chính nó. `apps/cli/tests/built-bin.e2e.ts` khởi động bin dsh thật và xác thực tầng patch real-time end-to-end dựa trên profile. Launcher test cô lập `$DSH_HOME`, nên overlay thật của developer không rò rỉ vào fixture.
