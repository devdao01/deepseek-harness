# Agent Note: Cung cấp pnpm cho CI qua pnpm/action-setup

Status: implemented

[English](2026-07-26-pnpm-action-setup-for-symmetric-ci-caching.md) | Tiếng Việt

## Vấn đề

Ngoại trừ `landlock-run.yml`, mọi workflow cài đặt pnpm trước đây đều tự cung cấp pnpm thủ công bằng `corepack enable`, trong đó năm workflow còn lặp lại một bộ thiết lập cache tự viết tay (hand-rolled) riêng lẻ — `pnpm store path --silent >> $GITHUB_OUTPUT`, cộng với `actions/cache@v4` dùng `pnpm-lock.yaml` làm cache key: `e2e.yml`, `docs-pages.yml`, `pi-ai-provider-e2e.yml`, `build-exe-for-python-sdk.yml`, và các job node-compat, serial-linux, benchmark của `ci.yml`. Cách làm tương đương, do chính đội ngũ chính thức duy trì — `pnpm/action-setup@v4` (đọc `packageManager` từ package.json) cộng với `actions/setup-node` có `cache: pnpm` — khi đó đã được kiểm chứng ngay trong `landlock-run.yml` của repo, trong khi corepack đã bị loại khỏi các bản phát hành Node mới hơn, khiến mỗi chỗ dùng `corepack enable` trở thành một điểm sẽ hỏng trong tương lai đã biết trước.

## Quyết định

`pnpm/action-setup@v4` là cơ chế duy nhất để cung cấp pnpm trong CI: không có workflow nào chạy `corepack enable`. Dev dependency `@yarnpkg/cli-dist` ở gốc repo cung cấp riêng Yarn CLI (command-line interface) hiện đại mà e2e của generated-project chạy; nhờ vậy, Yarn dùng cho việc bao phủ package manager sẽ không phụ thuộc vào Yarn Classic sẵn có trong image của runner. Cache vẫn là chiến lược theo từng job, chồng lên trên cơ chế cung cấp pnpm, giữ lại ba hình thái được chọn có chủ đích:

- **Cache đối xứng** (vừa khôi phục vừa lưu): `actions/setup-node` có `cache: pnpm` — `e2e.yml`, `docs-pages.yml`, `pi-ai-provider-e2e.yml`, `build-exe-for-python-sdk.yml`, và job node-compat cùng hai job benchmark của `ci.yml`. Benchmark trên larger-runner giới hạn cache store chỉ trên Linux qua input `cache:` có điều kiện; benchmark consolidated bật cache trên cả hai nền tảng.
- **Chỉ khôi phục không upload / cặp producer** (bước `actions/cache` tự viết tay): ba job PR (Pull Request) trên enterprise runner và job Windows bắt buộc dựa trên Wine chỉ khôi phục không lưu, để việc nén/upload cache nằm ngoài đường đi nhạy cảm với độ trễ của chúng — sự bất đối xứng này không thể diễn đạt bằng cache của `setup-node`. Mỗi job cấu hình store nằm ngoài thư mục cài đặt có thể thay thế của action, và phân giải path đó, nhờ vậy khớp đúng path và key chính xác với producer serial-linux được kích hoạt bởi push vào master; job enterprise bỏ qua bước khôi phục trong quá trình failover self-hosted, vì store persistent của VM đó đã được làm ấm sẵn.
- **Không cache hoặc không persist** (không dùng action cache store): job Windows native độc lập, serial-windows và serial-macos native, cùng `sandbox.yml` đều cài đặt từ store lạnh hoặc store cục bộ của runner. Giải nén một pnpm store chứa nhiều file có chi phí cao hơn việc cài đặt hoàn toàn mới trên Windows; còn job self-hosted hot-standby và failover tái sử dụng pnpm store persistent của VM riêng, không truyền tải archive cache được quản lý.

## Phương án thay thế đã cân nhắc

- **Giữ nguyên các bước tự viết tay.** Chúng vẫn hoạt động được, nhưng đó là bản sao boilerplate thiết lập sẽ tự trôi dạt theo thời gian, và việc phụ thuộc vào corepack là một điểm sẽ hỏng trong tương lai đã biết trước.
- **Chuyển cả cache của job enterprise sang `cache: pnpm`.** Từ chối: sự bất đối xứng chỉ-khôi-phục-không-upload là một quyết định về độ trễ đã được ghi lại trong comment của `ci.yml`; xóa bỏ nó chỉ để thống nhất công cụ là đảo ngược thứ tự ưu tiên.
- **Chuyển đổi cache store của serial-linux.** Bị từ chối trong lúc thực hiện: đề xuất ban đầu từng tính gộp serial-linux vào thiết lập đối xứng, nhưng bước cache của nó là phía producer trong cặp chỉ-khôi-phục-không-upload của job enterprise — đổi nó sang định dạng key của `setup-node` tương đương với việc chuyển đổi job enterprise theo một đường path khác.
- **Chỉ chuyển đổi các workflow có cache, để nguyên những chỗ còn dùng `corepack enable`.** Từ chối: cung cấp pnpm và cache là hai mối quan tâm tách biệt được; để corepack lại trong các job không có cache chỉ giữ lại điểm sẽ hỏng trong tương lai và hai cơ chế cung cấp song song tồn tại, không mang lại lợi ích gì.
- **Dựa vào Yarn có sẵn trong image của runner.** Từ chối: sau khi Corepack bị loại bỏ, image được quản lý cung cấp Yarn 1.22, trong khi e2e của generated-project yêu cầu Yarn 2 trở lên. Dev dependency ở gốc repo với version khóa cứng giúp phần bao phủ này không còn phụ thuộc vào nội dung image của runner.
- **Đóng gói action-setup + setup-node vào một composite action.** Chưa chấp nhận: các khác biệt còn lại theo từng job (ma trận version node, cache có điều kiện theo nền tảng, cặp chỉ-khôi-phục-không-upload) là chiến lược có chủ đích chứ không phải boilerplate — lớp bọc sẽ buộc phải thêm input tương ứng với từng khác biệt đó, hoặc san phẳng một sự bất đối xứng có thật, trong khi tổ hợp hai dòng hiện tại đã gần chạm giới hạn dưới.

## Hệ quả

- Sự phụ thuộc vào corepack đã hoàn toàn biến mất khỏi CI; pnpm được cung cấp trong mọi workflow qua action chính thức của đội ngũ pnpm, việc khóa version tiếp tục chỉ có một nguồn duy nhất là trường `packageManager` trong `package.json`.
- e2e của generated-project chạy Yarn 4 CLI khóa cứng ở gốc repo, vừa không còn phụ thuộc theo version Yarn trong image của runner, cũng không bị âm thầm bỏ qua vì lý do đó.
- Định dạng cache key của các lane đã chuyển đổi thay đổi một lần; sau khi mỗi lane chạy một lượt cold run để dựng lại cache, tỷ lệ hit ngang bằng với bước cũ. Cache key tích hợp sẵn bao gồm nền tảng, kiến trúc và hash lockfile, nhưng không bao gồm version Node, nên các task ma trận khác nhau của node-compat dùng chung một bản ghi cache store — điều này an toàn, vì pnpm store không phụ thuộc vào version Node.
- Cache pnpm tích hợp sẵn của `setup-node` chỉ khôi phục theo key chính xác, không có cơ chế dự phòng tiền tố `restore-keys`: một khi `pnpm-lock.yaml` thay đổi, các lane đã chuyển đổi sẽ bắt đầu từ store lạnh, thay vì tận dụng bản ghi cache trước đó để tiền tải sẵn.
- `pnpm/action-setup` xóa thư mục cài đặt của nó mỗi lần chạy, và đặt store mặc định dưới `PNPM_HOME` phát sinh từ đó. Vì vậy, các job Linux cần cặp cache hoặc persist self-hosted sẽ đặt `PNPM_CONFIG_STORE_DIR` thành `$HOME/.local/share/pnpm/store`, nằm ngoài thư mục của action; job chỉ-khôi-phục-không-upload và serial-linux sẽ phân giải và chia sẻ chung path ổn định cùng key chính xác này.
