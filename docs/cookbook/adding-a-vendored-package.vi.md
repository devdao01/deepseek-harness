# Thực hành: Thêm một package vendored

[English](adding-a-vendored-package.md) | Tiếng Việt

Khi harness cần đưa vào một package Cordis thượng nguồn (upstream) khác (ví dụ `@cordisjs/plugin-http`), hãy **vendor** nó dưới dạng mã nguồn cố định phiên bản vào `vendor/`, thay vì thêm như một dependency NPM — lý do xem tại [quyết định vendoring](../../.agents/notes/implemented/process/2026-06-11-vendor-cordis-as-source.md). [vendor/README.md](../../vendor/README.md) mô tả cách *cập nhật* một package vendored đã có sẵn; hướng dẫn này là danh sách kiểm tra từng tệp để thêm một package vendored **mới**. (Đã được kiểm chứng dựa trên tập package vendored hiện có; nếu có sai lệch, hãy sửa lại tại đây.)

## 1. Sao chép mã nguồn

```
vendor/<dir>/
  package.json     # from upstream; set "private": true, rescope the name, keep exports/type
  tsconfig.json    # extends ../../tsconfig.base.json (see configuration below)
  src/             # the upstream src/ verbatim
  README.md LICENSE # if upstream ships them
```

`tsconfig.json` nhất quán với các package vendored khác: `rootDir: src`, `outDir: lib/types`, các mục nới lỏng tính nghiêm ngặt (strictness) mà mã thượng nguồn cần, cùng mục `references` cho mỗi package vendored khác mà nó import:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src", "outDir": "lib/types",
    "noUncheckedIndexedAccess": false, "exactOptionalPropertyTypes": false,
    "noImplicitOverride": false, "noUnusedLocals": false, "noUnusedParameters": false
  },
  "include": ["src"],
  "references": [{ "path": "../cordis" }, { "path": "../cosmokit" }]
}
```

Các bất biến của `package.json`: `"private": true` (package vendored không bao giờ được publish); viết lại scope của `name` ([ánh xạ](../rescope.md)), giữ nguyên `version`/`exports`/`type` của thượng nguồn; khai báo declaration metadata trỏ tới `lib/types`; publish output declaration `.d.ts` cùng `.d.ts.map`; liệt kê dependency Cordis của nó trong `peerDependencies` (khớp với manifest (tệp mô tả metadata) thượng nguồn). Dependency thượng nguồn bắc cầu (transitive) cũng phải được vendor hoặc đã tồn tại sẵn trong repo — vendor một package thường đồng nghĩa với việc vendor toàn bộ cây dependency của nó (ví dụ `@cordisjs/plugin-http` sẽ kéo theo `@cordisjs/fetch-file`).

Import/export tương đối cục bộ trong mã nguồn TypeScript vendored dùng hậu tố `.ts` tường minh sau khi sao chép. Đây là khác biệt giữa build cục bộ của repo này với thượng nguồn: `rewriteRelativeImportExtensions` xuất ra import runtime `.js`, còn declaration file giữ nguyên hậu tố `.ts` tường minh, để bên tiêu thụ TypeScript NodeNext/Node16 có thể phân giải.

## 2. Đăng ký trong cấu hình gốc

| Tệp | Nội dung sửa đổi |
|---|---|
| `tsconfig.base.json` | Thêm `"<npm-name>": ["./vendor/<dir>/src"]` vào `paths` |
| `tsconfig.host.json` | Thêm `{ "path": "./vendor/<dir>" }` vào `references` (đặt trước các mục `packages/*`; mã vendored chỉ đi vào graph qua tổ hợp host) |
| `vendor/README.md` | Thêm một hàng bảng manifest (dir, npm name, version, upstream repo, commit SHA) và ghi lại mọi sửa đổi cục bộ |
| `scripts/publint-all.ts` | Chỉ cần khi chính package vendored đó được publish từ repo này (dependency vendored thường không publish — bỏ qua) |

Các nội dung sau được glob tự động bao phủ, không cần chỉnh sửa thủ công: workspaces (`vendor/*`) trong `package.json` gốc, `tsdown.config.ts`, `vitest.config.ts`, `.oxlintrc.json`. Chỉ khi cấu hình build khác với giá trị mặc định của gốc (dual ESM/CJS hoặc nhiều điểm vào — xem `vendor/schemastery` và `vendor/logger-console`) thì mới cần một `vendor/<dir>/tsdown.config.ts` riêng; điểm vào của nó nên đọc JS đầu ra dưới `lib/types`.

## 3. Chú ý guard của manifest

`scripts/check-vendor-manifest.sh` (pre-commit hook) sẽ thất bại khi có thay đổi đã staged dưới `vendor/*/src` nhưng `vendor/README.md` chưa được staged cùng. Hãy staging bản cập nhật manifest cùng với mã nguồn để vượt qua kiểm tra commit.

## 4. Xác minh

```sh
pnpm install        # registers the workspace
pnpm run typecheck
pnpm run build && pnpm run constraints
```

Hãy chạy các kiểm tra hành vi được chọn theo [chính sách kiểm thử](../testing.md). Ánh xạ `paths` mã nguồn chỉ có một bản duy nhất trong `tsconfig.base.json`, phục vụ mọi graph. Ranh giới cô lập quan trọng là graph project-reference: mã nguồn vendored phải được tham chiếu qua chính `vendor/<dir>/tsconfig.json` của nó, không được kéo vào một chương trình TypeScript tổng hợp bật kiểm tra nghiêm ngặt ([bố cục](../development.md#typescript-project-layout)).
