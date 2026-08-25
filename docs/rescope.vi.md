# Đổi tên package vendored

[English](rescope.md) | Tiếng Việt

Framework Cordis và các thư viện nền của nó được vendored dưới dạng mã nguồn tại [`vendor/`](../vendor/README.md), và được phát hành dưới scope `@deepseek-ai`: mỗi package của harness đều khai báo framework là peer dependency, nên phát hành harness đồng nghĩa với phát hành kèm lớp này, và phát hành bằng tên upstream chẳng khác nào chiếm tên của người khác trên registry. Trang này là bảng ánh xạ tên; quyết định và ảnh hưởng xem [Agent Note về đổi tên](../.agents/notes/implemented/process/2026-08-10-vendor-package-rescope.md), commit upstream xem [`vendor/README.md`](../vendor/README.md).

## Ánh xạ tên

| Thư mục | Tên upstream | Tên phát hành | Phiên bản | Vai trò |
|---|---|---|---|---|
| `vendor/cordis/` | `cordis` | `@deepseek-ai/cordis` | 4.0.0-rc.7 | Lõi framework: `Context`, `Service`, `Fiber`, sự kiện |
| `vendor/cosmokit/` | `cosmokit` | `@deepseek-ai/cosmokit` | 1.8.1 | Tiện ích nền dùng chung giữa framework và Schemastery |
| `vendor/schemastery/` | `schemastery` | `@deepseek-ai/schemastery` | 3.18.0 | Schema cấu hình (`Schema`), `Config` của mỗi plugin đều dựa trên nó |
| `vendor/loader/` | `@cordisjs/plugin-loader` | `@deepseek-ai/cordis-plugin-loader` | 1.0.0-rc.5 | Nạp `cordis.yml`, phân giải plugin, cache repository |
| `vendor/include/` | `@cordisjs/plugin-include` | `@deepseek-ai/cordis-plugin-include` | 1.0.4 | Include cấu hình và xếp lớp patch |
| `vendor/group/` | `@cordisjs/plugin-group` | `@deepseek-ai/cordis-plugin-group` | 1.0.0 | Nhóm plugin lồng nhau |
| `vendor/timer/` | `@cordisjs/plugin-timer` | `@deepseek-ai/cordis-plugin-timer` | 1.1.2 | Timer trên `ctx`, được thu hồi theo disposal |
| `vendor/hmr/` | `@cordisjs/plugin-hmr` | `@deepseek-ai/cordis-plugin-hmr` | 1.0.15 | Thay nóng plugin và cấu hình |
| `vendor/logger-console/` | `@cordisjs/plugin-logger-console` | `@deepseek-ai/cordis-plugin-logger-console` | 1.0.0 | Xuất log ra console |

Các subpath export giữ nguyên đường dẫn gốc: `@cordisjs/plugin-loader/repository` trở thành `@deepseek-ai/cordis-plugin-loader/repository`.

## Việc đổi tên không đụng tới những gì

- **Tên thư mục và số phiên bản.** `vendor/hmr/` vẫn là `vendor/hmr/`, mỗi package giữ nguyên phiên bản upstream được ghi ở dòng tương ứng trong bảng kê khai, nên cây vendored vẫn đọc như một bản chụp của upstream.
- **Range phụ thuộc.** Mục phụ thuộc chỉ đổi khóa chứ không đổi phạm vi: `"cordis": "^4.0.0-rc.7"` trở thành `"@deepseek-ai/cordis": "^4.0.0-rc.7"`; `linkWorkspacePackages` dựa vào chính những phạm vi được giữ lại này để phân giải chúng về đúng workspace cố định.
- **Tiền tố nội bộ `cordis:` của Loader.** `cordis:include`, `cordis:group` là tiền tố giao thức, không phải tên package.
- **Họ tệp cấu hình `cordis.yml`**, gồm cả `*.cordis.yml`, `*.cordis.snapshot.yml`, `cordis.patch.yml`.
- **Các package harness có từ này trong tên**, ví dụ `@deepseek-ai/dsh-tool-cordis`.
- **Định danh runtime của upstream**, ví dụ `Symbol.for('schemastery')` của Schemastery và các trường metadata `vendor:` của nó.
- **Văn xuôi bên ngoài `docs/`.** `vendor/*/README.md`, README của từng package và Agent Note giữ nguyên tên tại thời điểm viết; chữ `cordis` trần trụi ở đó cũng có thể là tên tùy chọn của Python SDK hoặc id của một agent-preset nào đó. Bên trong `docs/`, văn xuôi và mọi khối mã Markdown đều đổi theo.

## Mã của bạn cần đổi những gì

| Vị trí | Trước khi đổi | Sau khi đổi |
|---|---|---|
| Module import | `import { Context } from 'cordis'` | `import { Context } from '@deepseek-ai/cordis'` |
| Khai báo hợp nhất sự kiện kiểu | `declare module 'cordis'` | `declare module '@deepseek-ai/cordis'` |
| Khóa phụ thuộc trong `package.json` | `"@cordisjs/plugin-hmr": "^1.0.15"` | `"@deepseek-ai/cordis-plugin-hmr": "^1.0.15"` |
| Mục plugin trong `cordis.yml` | `name: '@cordisjs/plugin-include'` | `name: '@deepseek-ai/cordis-plugin-include'` |

## Áp dụng, kiểm chứng và hoàn tác

Bảng ánh xạ trên do [`scripts/rescope-vendor.ts`](../scripts/rescope-vendor.ts) nắm giữ và thực thi việc đổi tên, không tham chiếu nào phải sửa tay:

```sh
pnpm run rescope-vendor            # report what would change
pnpm run rescope-vendor --apply    # rewrite every reference
pnpm run rescope-vendor:check      # assert the post-state; runs in the hygiene gate
pnpm run rescope-vendor --apply --reverse   # return to the upstream names
```

Sau khi sync upstream hãy chạy lại nó ([quy trình](../vendor/README.md)), và nối tiếp với các bước tái sinh mà nó in ra: `pnpm install` để tái sinh lockfile, `pnpm run gen-third-party-notices`, cùng với `pnpm run verify-translation-pairing --write` cho các cặp song ngữ mà nó chạm tới.
