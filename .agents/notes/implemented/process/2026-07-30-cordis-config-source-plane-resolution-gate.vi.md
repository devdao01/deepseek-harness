# Agent Note: verify-cordis-config thực thi gate resolve mặt phẳng nguồn cho plugin trong cấu hình

Status: implemented

[English](2026-07-30-cordis-config-source-plane-resolution-gate.md) | Tiếng Việt

## Vấn đề

`apps/cli/config/tui.cordis.yml` thêm mục cấu hình `@deepseek-ai/dsh-tui/prompt` mới, nhưng không có ánh xạ tsconfig `paths` tương ứng. Wildcard chung `@deepseek-ai/dsh-*` sẽ thay `tui/prompt` toàn bộ vào các đường dẫn ứng viên `<group>/*/src` của nó, mà các đường dẫn này đều không tồn tại, nên [khởi chạy nguồn tsx](../architecture/2026-07-29-dsh-source-launch-tsx-esm.md) sẽ fallback về `exports` của package, resolve ra file mặt phẳng artifact `lib/prompt.js`. Bất kỳ môi trường nào có `lib/` đã build (cây thư mục dev sau khi chạy `pnpm build`) đều khởi động bình thường, còn luồng công việc e2e chạy smoke test PTY TUI không cần khóa ở chế độ `lib` (`DSH_EXAMPLE_MODE=lib`, bin artifact chạy dưới Node thông thường), nên CI hoàn toàn không đi qua vector khởi chạy nguồn — trong khi đó, `pnpm dsh` ở mọi môi trường checkout sạch đều thất bại khi khởi động, báo lỗi `plugin(s) failed to load: @deepseek-ai/dsh-tui/prompt`. Lúc đó không có gate nào kiểm tra mặt phẳng nguồn, nên sự cố này lọt vào bản phát hành mà không bị phát hiện, chỉ lộ ra ở worktree mới.

## Quyết định

`scripts/verify-cordis-config.ts` (`validateSourcePlaneResolution`) yêu cầu mọi module specifier trong cấu hình tham chiếu đến package workspace cục bộ (bao gồm cả package harness và Cordis đã nạp vào vendor) phải resolve được tới file nguồn `.ts`/`.tsx` thông qua lớp facade `paths` của `tsconfig.base.json`; việc resolve bắt đầu từ gốc repo, gọi `ts.resolveModuleName`. Resolve thất bại hoặc trúng `.d.ts` (tức là fallback qua `exports` tới `lib/types` đã build) đều khiến `verify-cordis-config` fail, và liệt kê file cấu hình cùng module specifier. Ánh xạ `@deepseek-ai/dsh-tui/prompt` còn thiếu đã được thêm cạnh các mục sub-path tường minh khác; xóa ánh xạ này sẽ tái tạo lại lỗi gate.

## Phương án thay thế

**Dựa vào smoke test PTY TUI không cần khóa.** Ở chế độ nguồn mặc định, test này khởi động cây thư mục thật qua vector nguồn, thực sự bắt được sự cố này, nhưng chỉ với cây thư mục sạch. Luồng công việc e2e của CI chỉ chạy nó ở chế độ `lib` (bin artifact resolve qua `exports` thật của package), nên không có bước CI nào thực thi vector nguồn, còn cây thư mục dev có `lib/` cũ vẫn bị che giấu cục bộ. Thêm một smoke test chế độ nguồn cho CI, mỗi lần cũng chỉ chứng minh được một tổ hợp; trong khi gate tĩnh bao phủ mọi cấu hình và ví dụ cấu hình đi kèm sản phẩm phát hành.

**Mở rộng test tương thích `dsh-source-launch-smoke` thành khởi chạy đầy đủ.** Smoke test node-compat chỉ assert việc từ chối TTY, mà việc từ chối này xảy ra trước khi plugin được nạp. Mỗi dòng phiên bản trong ma trận thực hiện một lần khởi chạy đầy đủ không cần khóa sẽ lặp lại smoke test PTY với chi phí cao hơn, và cũng chỉ xác minh được một tổ hợp, không bao phủ mọi cấu hình và ví dụ cấu hình đi kèm sản phẩm phát hành.

**Dùng ánh xạ wildcard kiểu `@deepseek-ai/dsh-*/prompt`.** Cách này sửa được sub-path hiện tại, nhưng không ngăn được cả lớp vấn đề; export sub-path một file kế tiếp (`/surface`, `/message`, v.v.) vẫn sẽ tái diễn theo cách tương tự. Gate tĩnh bao phủ mọi module specifier được tham chiếu trong cấu hình hiện tại lẫn tương lai.

## Kết quả

- Module specifier workspace trong cấu hình mà chỉ có thể resolve qua `lib/` đã build, giờ sẽ khiến gate `verify-cordis-config` fail (thực thi trong `hygiene` và CI), thay vì trở thành sự cố crash khởi động chỉ xuất hiện trong cây thư mục sạch.
- Khi cordis.yml tham chiếu export sub-path một file mới, phải đồng thời thêm mục `paths` tường minh vào `tsconfig.base.json`; thông báo của gate nêu rõ yêu cầu này.
- Gate chỉ dùng các tùy chọn của `tsconfig.base.json` để resolve; nếu một module specifier nào đó cần tùy chọn compiler chỉ dành cho client mới resolve được, gate sẽ fail. Điều này phù hợp với vị trí của lớp facade này là điểm resolve duy nhất cho cả tsx lẫn vitest.
