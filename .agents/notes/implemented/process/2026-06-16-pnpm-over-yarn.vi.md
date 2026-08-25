# Agent Note: Dùng pnpm thay cho Yarn 4 làm package manager

Status: implemented

[English](2026-06-16-pnpm-over-yarn.md) | 中文

## Vấn đề

Repo này ban đầu dùng **Yarn 4** cùng linker `node-modules`. Đây là một lựa chọn cố ý thận trọng: hành vi giống layout phẳng của npm, đồng thời hưởng được workspaces và `yarn constraints` của Yarn. Nó hoạt động tốt. Nhưng Yarn 4 có nguồn gốc từ dòng máu Plug'n'Play, khiến linker `node-modules` trở thành chế độ không chính thống; trong khi hệ sinh thái JS rộng lớn hơn — giá trị mặc định của công cụ, CI action, ví dụ Corepack, sự quen thuộc của người đóng góp — đang ngày càng lấy pnpm làm trung tâm. Với một repo chủ yếu do agent xây dựng, thỉnh thoảng có người đọc, thì "package manager mà đa số công cụ và con người mong đợi" mang lại giá trị thực tế: ít bất ngờ hơn, đường xử lý lỗi trưởng thành hơn, nhiều câu trả lời có thể tái sử dụng trực tiếp hơn.

Chi phí chuyển đổi hiện đang ở mức thấp nhất. Repo này chưa phát hành package nào (mỗi package đều `private: true`); quy trình phát triển, test và demo chế độ source code đều chạy qua launcher TypeScript tự khai báo riêng, còn kiểm tra artifact thì build tường minh. Do đó, package manager chỉ cần làm được: (a) giải quyết và liên kết `node_modules`, (b) chạy script workspace, (c) cưỡng chế ràng buộc workspace. Tài sản đặc thù Yarn duy nhất là `yarn.config.cjs` (engine ràng buộc `@yarnpkg/types`), quy mô nhỏ và có thể diễn đạt lại một cách máy móc. Điều này nhất quán với logic của [quyết định tsdown](../../archived/process/2026-06-11-tsdown-over-dumble.md): thay công cụ chịu tải bằng lựa chọn có hệ sinh thái lành mạnh hơn khi bán kính ảnh hưởng còn nhỏ.

## Quyết định

Áp dụng **pnpm 11.7.0**, ghim phiên bản qua field `packageManager`, cài đặt qua Corepack (cùng cơ chế mà Yarn dùng):

- **Workspaces** được di chuyển từ mảng `workspaces` của `package.json` + `.yarnrc.yml` sang `pnpm-workspace.yaml` (`vendor/*`, `packages/*` — cùng glob; `examples/*` vẫn không phải workspace, nhất quán với thiết lập trước đó và glob tường minh của tsdown).
- **Linker symlink nghiêm ngặt** (mặc định của pnpm) thay thế linker `node-modules` kiểu nâng lên (hoisted) của Yarn. Chúng ta cố ý **không** thêm lối thoát `node-linker=hoisted` / `shamefully-hoist`: `node_modules` không phẳng của pnpm sẽ khiến dependency ma (tham chiếu tới dependency bắc cầu chưa khai báo) báo lỗi rõ ràng, đây là một *lợi thế* cho một repo lấy gate máy móc làm cốt lõi đảm bảo chất lượng (xem [Gate chất lượng máy móc](2026-06-11-quality-gates.md)). Bộ gate (kiểm tra kiểu, lint, test, build, knip) là lưới an toàn chứng minh không tồn tại loại import ma này.
- **Danh sách trắng build script.** pnpm 10+ không chạy lifecycle script của dependency trừ khi được đưa vào danh sách trắng. `pnpm-workspace.yaml` mang một ánh xạ `allowBuilds` tường minh (`esbuild`, `lefthook`, `@google/genai`, `protobufjs`) — nhất quán với lập trường siết chặt chuỗi cung ứng sẵn có của repo này đối với output model/tool, giờ cũng áp dụng cho việc thực thi code lúc cài đặt. `peerDependencyRules.allowedVersions.typescript: '>=5 <7'` loại bỏ cảnh báo dải peer TypeScript vô hại trong repo.
- **Ràng buộc trở nên độc lập với package manager.** `yarn.config.cjs` (import `@yarnpkg/types`, dùng `Yarn.workspaces()` / `workspace.set()`) được thay thế bởi `scripts/check-workspace-constraints.ts` — một script tsx thuần túy, chạy qua `pnpm run constraints`. Nó cưỡng chế đúng cùng những invariant trên cùng phạm vi `vendor` + `packages`: mỗi package `private: true`; package `@deepseek-ai/dsh-*` khai báo `cordis` vừa là peer dependency vừa là dev dependency với dải nhất quán, dùng phiên bản của `package.json` gốc, đặt `type: module`; package vendor chỉ kiểm tra có phải private hay không.
- Mọi động từ `yarn …` trong CI, hook lefthook, script `package.json` và tài liệu chuyển thành `pnpm …` / `pnpm run …`. `yarn.lock` → `pnpm-lock.yaml` (lockfile v9). `.gitignore` đổi `.yarn/` thành `.pnpm-store/`. README vendor (như `vendor/cordis/README.md`) theo Vendoring Policy giữ nguyên ví dụ `yarn` thượng nguồn của chúng không đổi.

## Phương án khác đã cân nhắc

- **Giữ Yarn 4** — không thay đổi gì, nhưng đặt cược vào chế độ linker ít được dùng hơn và một engine ràng buộc gắn chặt với một package manager duy nhất.
- **npm workspaces** — phổ biến khắp nơi, nhưng không có giải pháp ràng buộc, trải nghiệm phát triển monorepo cũng kém hơn.
- **pnpm kèm linker kiểu nâng lên (hoisted)** — di chuyển mượt hơn, nhưng từ bỏ tính an toàn chống dependency ma, vốn chính là lý do đúng đắn cốt lõi cho việc di chuyển.

## Hệ quả

Việc kiểm tra ràng buộc mất khả năng tự động **sửa** của Yarn (`workspace.set()` có thể viết lại manifest tại chỗ); script tsx chỉ kiểm tra, không qua thì thoát với mã khác 0 kèm thông báo. Điều này chấp nhận được: CI chưa bao giờ chạy `--fix`, và trường hợp cần sửa thủ công rất hiếm. Người đóng góp giờ chạy `corepack enable` cho pnpm thay vì Yarn; `pnpm exec lefthook install` thay thế `yarn lefthook install` (hook `postinstall` vẫn chạy `lefthook install`).

Hiệu năng (đo lúc di chuyển trên hệ thống file NFS phát triển; mẫu chỉ vài lần chạy, phương sai lớn — chỉ mang tính định hướng, không phải bộ benchmark):

| Kịch bản | Yarn 4 | pnpm 11 |
|---|---|---|
| Khởi động lạnh (cache/store rỗng, không có `node_modules`) | ~14 s | ~16 s |
| Liên kết lại nóng (cache/store đã nóng, `node_modules` đã bị xóa) | ~12–14 s | ~15–22 s |
| Cài đặt đông cứng (frozen), `node_modules` tồn tại (xác thực lại không thao tác gì) | ~2–8 s | ~0.5–7 s |

Trên đĩa cục bộ nhanh, store định vị theo nội dung (content-addressed) của pnpm thường thắng ở cả cài đặt lạnh/nóng, đặc biệt có lợi thế rõ rệt về **dung lượng đĩa** giữa nhiều lần checkout (một store toàn cục kết nối vào mỗi `node_modules` qua hard link, trong khi Yarn copy khoảng 279 MB cho mỗi worktree — một số nhà phát triển thường xuyên giữ khoảng 10 worktree trở lên cho repo này). Lợi thế khử trùng lặp này **không** thể hiện được trong dữ liệu lúc di chuyển ở trên, vì store test và `node_modules` nằm trên hệ thống file khác nhau, hard link không hoạt động; nó áp dụng được trên máy phát triển hoặc cache CI cùng một hệ thống file. Tổng kết trung thực: trên hệ thống file phát triển NFS của chúng ta, tốc độ cài đặt tương đương nhau trong phạm vi nhiễu; lý do di chuyển là sự nhất quán với hệ sinh thái, an toàn chống dependency ma và khử trùng lặp đĩa xuyên checkout, chứ không phải thắng về thời gian cài đặt thô.

Mọi gate chất lượng (constraints, kiểm tra kiểu, lint, doc-sync, test:coverage đạt 100%, build, knip, publint và smoke test ứng dụng đã build) đều pass dưới pnpm, chứng minh việc đổi linker không đưa vào lỗi dependency ma nào.
