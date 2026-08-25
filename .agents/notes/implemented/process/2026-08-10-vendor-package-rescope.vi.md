# Agent Note: Đổi tên vendored Cordis vào scope @deepseek-ai

Status: implemented

[English](2026-08-10-vendor-package-rescope.md) | 中文

## Vấn đề

Chín package dưới `vendor/` trước đây giữ nguyên tên npm upstream (`cordis`, `cosmokit`, `schemastery`, `@cordisjs/plugin-*`). Tiền đề này không còn đúng khi publish: mỗi package harness đều khai báo `cordis` là peer dependency, người dùng cài `@deepseek-ai/dsh-*` phải resolve được nó từ registry, nên publish harness ắt kéo theo publish luôn lớp framework này. Publish với tên upstream chính là chiếm dụng tên của người khác trên registry; nếu registry đó proxy ngược lên npmjs, entry trùng tên còn có thể che khuất package upstream thật, cài nhầm framework sai vào project không liên quan.

## Quyết định

Chín package thống nhất đổi tên vào scope `@deepseek-ai`. Tên thư mục, số phiên bản upstream, dependency range đều giữ nguyên không đổi, nên bảng liệt kê trong `vendor/README.md` vẫn đọc như một bản snapshot upstream. Bảng ánh xạ dành cho người dùng xem tại [docs/rescope.md](../../../../docs/rescope.md).

| Thư mục | Tên npm | Tên upstream |
|---|---|---|
| `cordis/` | `@deepseek-ai/cordis` | `cordis` |
| `cosmokit/` | `@deepseek-ai/cosmokit` | `cosmokit` |
| `schemastery/` | `@deepseek-ai/schemastery` | `schemastery` |
| `loader/` | `@deepseek-ai/cordis-plugin-loader` | `@cordisjs/plugin-loader` |
| `include/` | `@deepseek-ai/cordis-plugin-include` | `@cordisjs/plugin-include` |
| `group/` | `@deepseek-ai/cordis-plugin-group` | `@cordisjs/plugin-group` |
| `timer/` | `@deepseek-ai/cordis-plugin-timer` | `@cordisjs/plugin-timer` |
| `hmr/` | `@deepseek-ai/cordis-plugin-hmr` | `@cordisjs/plugin-hmr` |
| `logger-console/` | `@deepseek-ai/cordis-plugin-logger-console` | `@cordisjs/plugin-logger-console` |

Việc viết lại chỉ áp dụng lên **token tên package đầy đủ có dấu phân định**: specifier bọc trong dấu nháy hoặc backtick (có thể kèm `/subpath`), key `name` và dependency trong `package.json`, giá trị `name:` trong `cordis.yml`, key `paths` trong `tsconfig.base.json`. Do đó các chuỗi đồng hình sau đây đều không đổi, vì chúng không phải tên package: tên file `cordis.yml` và các file cùng họ, tiền tố built-in `cordis:` của Loader (`cordis:include`, `cordis:group`, xem `vendor/loader/src/config/tree.ts`), chuỗi kind như `cordis-config-entry`, `@deepseek-ai/dsh-tool-cordis`, `Symbol.for('schemastery')` của upstream Schemastery và metadata `vendor:`, tên thư mục `packages/<group>/` trong `GROUP_ORDER` của `scripts/gen-module-graph.ts` và `gen-doc-graphs.ts`, cùng hướng dẫn cài đặt upstream trong `vendor/*/README.md`.

Quy tắc token không nhìn thấy hai loại vị trí, chúng được sửa từng chỗ theo tên: một là truy cập thuộc tính `manifest.peerDependencies?.cordis` — TypeScript không bắt được key `Record<string, string>` đã lỗi thời; hai là hằng số coi tên như dữ liệu (tập hợp vendored trong `check-workspace-constraints.ts`, tên group/include trong `verify-cordis-config.ts`, chuỗi nhận diện đích `declare module` trong `cordis-walk.ts`, `gen-scoped-events.ts` và `analyzer.ts` của typert, `alwaysBundle` trong `app-boot/tsdown.config.ts`).

Markdown được chia làm hai theo "người đọc dùng nó để làm gì". Khối code luôn được sửa theo, bất kể info string — vì khối code là thứ người đọc sẽ chép nguyên văn hoặc dùng để mount cấu hình, bao gồm khối `yaml` ghi tên plugin của Loader và khối `ts ignore-check` nằm sát khối biên dịch. Văn xuôi chỉ được sửa theo trong `docs/`: câu trong tutorial nhắc đến một tên nào đó là đang dạy thứ mà repo này không còn phân giải được nữa. Văn xuôi ngoài `docs/` — `vendor/*/README.md`, README của từng package, `.agents/notes/` — giữ nguyên tên tại thời điểm viết: vừa vì nó ghi lại sự kiện tại thời điểm đó, vừa vì cùng một cách viết có thể chỉ đến thứ khác, ví dụ option `cordis` của Python SDK, `@cordisjs/plugin-http` mà chúng ta không vendor, hoặc id của một agent-preset nào đó.

## Ảnh hưởng

- Tập publish không còn tên upstream nào: `publish-npm-baseline.ts` giờ yêu cầu vô điều kiện mọi package chờ publish phải là `@deepseek-ai/*`, package vendored không còn được miễn trừ, việc đổi tên nếu bị revert sẽ fail trước khi đóng gói.
- Bảng liệt kê trong `vendor/README.md` có thêm cột "tên upstream", `gen-third-party-notices` theo đó phân giải sáu cột và đưa tên upstream vào `THIRD_PARTY_NOTICES.md`; ghi công MIT trỏ đến nguồn của fork, không phải scope của chúng ta.
- `minimumReleaseAgeExclude` trong `pnpm-workspace.yaml` xóa hai mục `cordis` và `@cordisjs/plugin-loader`: sau khi đổi tên, hai tên này sẽ vĩnh viễn không còn được lấy từ registry. Mẫu bỏ qua `@cordisjs/.+` trong `knip.json` cũng bị xóa tương tự, vì đã được `@deepseek-ai/.+` bao phủ.
- Sync upstream theo quy trình của `vendor/README.md`, bước 3 có thêm một mục: chạy lại `pnpm run rescope-vendor --apply` cho source vừa copy vào, ánh xạ trong script và hai cột tên trong bảng liệt kê phải khớp nhau.
- **Khi cần quay lại package upstream chính thức** thì chạy ánh xạ này theo chiều ngược lại — `pnpm run rescope-vendor --apply --reverse` — rồi bổ sung lại hai mục `minimumReleaseAgeExclude`, gỡ bỏ assertion `@deepseek-ai/*` trong tập publish. Khối lượng viết lại khoảng 1300 file, dùng script để replay chứ không sửa tay.

Việc đổi tên do `scripts/rescope-vendor.ts` đảm nhiệm: ánh xạ, quy tắc token có dấu phân định, ngoại lệ từng file khi tên thực ra là thư mục chứ không phải package, loạt viết lại chính xác nêu trên, và một chế độ `--check` khẳng định "không còn sót lại gì, mỗi lần viết lại chính xác đều đã áp dụng, idempotent" — được `hygiene` gate thực thi trên mỗi lần CI. Khi rebase thì replay lại script này, thay vì tự giải conflict trên 1300 file; nếu upstream thay đổi bất kỳ điểm nào đã bị cố định, script sẽ fail rõ ràng thay vì âm thầm bỏ sót.

## Phương án thay thế từng cân nhắc

**Giữ tên upstream, loại `vendor/` khỏi tập publish.** Bác bỏ: mỗi package harness đều khai báo `cordis` là peer dependency, `@deepseek-ai/dsh-*` sau khi cài sẽ không resolve được framework.

**Chỉ đổi tên lúc đóng gói.** Bác bỏ: tên được publish ra sẽ không khớp với cây source, mọi module specifier phải sửa ngay trong đường dẫn publish, và không có lần chạy local nào tái hiện được đúng thứ đã publish.

**Đổi luôn cả tên thư mục và số phiên bản.** Bác bỏ: tên thư mục không phải định danh publish, đổi nó sẽ kéo theo tham chiếu project, glob của tsdown và đường dẫn tài liệu, lợi ích bằng không; nếu gộp số phiên bản vào `0.0.1` thì sẽ không còn thỏa range `^4.0.0-rc.7` đang được giữ, pnpm sẽ quay sang tìm bản sao trên registry, `verify-vendored-links` sẽ báo đỏ ngay.

**Đổi luôn cả văn xuôi ngoài `docs/` và các Agent Note lịch sử.** Bác bỏ: chúng ghi lại sự kiện tại thời điểm viết, và `cordis` trần ở đó cũng có thể là tên option SDK hoặc id của một preset nào đó, chưa chắc là package; ánh xạ dành cho người đọc do `docs/rescope.md` đảm nhiệm.
