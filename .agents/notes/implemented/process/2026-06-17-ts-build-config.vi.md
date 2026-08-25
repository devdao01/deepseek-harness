# Agent Note: Build ưu tiên TSC và quyền sở hữu compiler duy nhất

Status: implemented

[English](2026-06-17-ts-build-config.md) | 中文

> Cấu trúc topology của project gốc được một file solution gốc thống lĩnh hai aggregate program; xem [Agent Note file solution gốc](2026-07-22-tsconfig-solution-root-two-aggregates.md). Thứ tự lệnh hiện tại — Host sinh convention Remote rồi mới biên dịch Client — xem [Agent Note build API Remotes](2026-08-08-api-remotes-generated-contract-build.md). Trách nhiệm tsc-first được xác lập trong bài này vẫn giữ nguyên.

## Vấn đề

Cấu hình build và kiểm tra kiểu TypeScript trước đây tồn tại các vấn đề sau:

- `build` dùng `tsc` để chuyển `.ts` dưới `packages/<group>/<pkg>` và `vendor/*` thành file `.d.ts`, sau đó dùng `tsdown` để chuyển `.ts` thành file `.js` đã đóng gói. Điều này khiến hai công cụ mỗi cái tự thực hiện việc chuyển đổi TypeScript.
- `typecheck` có xu hướng xác thực package, source code vendor, example, test và script qua một cấu hình kiểm tra kiểu ở thư mục gốc.

Build và kiểm tra kiểu dùng chung ranh giới tsconfig và hành vi giải quyết/chuyển đổi TypeScript nhất quán. Build sinh `.js`, `.d.ts`, `.js.map` và `.d.ts.map` qua một compiler và một cấu hình duy nhất, giúp artifact phát hành nhất quán với việc xác thực kiểu.

Các ràng buộc cụ thể:

- `tsdown` dùng `oxc` để chuyển đổi TypeScript, hành vi khác với `tsc`.
    - `.d.ts` đã đóng gói do `tsdown` xuất ra xung đột với cấu trúc module augmentation (mở rộng module) tương đối nội bộ của Cordis.
    - Output của tsc chịu ảnh hưởng của `allowImportingTsExtensions`: file `.js` sinh ra không được import file `.ts`, và file `.d.ts` sinh ra phải giữ lại specifier tương đối tường minh mà NodeNext/Node16 chấp nhận. Vì lý do này, import tương đối trong package dùng specifier `.ts` tường minh trong source code TypeScript, và được `rewriteRelativeImportExtensions` viết lại thành `.js` trong JS output.
    - `.js` đã đóng gói do `tsdown` xuất ra có hành vi khác với `.js` xuất theo từng file của `tsc -b`, ví dụ như hành vi chuyển đổi decorator.
- `vendor/*/src`, example, test và script không thể đưa hết vào một program nghiêm ngặt ở thư mục gốc theo kiểu plain-include.
    - Kiểm tra kiểu trực tiếp cho `vendor/*/src` dưới cấu hình nghiêm ngặt ở thư mục gốc sẽ kích hoạt rất nhiều lỗi kiểu không thuộc phạm vi sở hữu của project này.
    - Việc giải quyết dependency package của `packages/*/*` đối với `vendor` trỏ tới `vendor/*/lib`, để thích ứng với các mức độ nghiêm ngặt tsconfig khác nhau.


## Quyết định

Import tương đối trong package dùng specifier `.ts` tường minh.

`pnpm run build` thực thi tuần tự Host lib, Client lib và Web; mỗi giai đoạn lib đều giữ nguyên tắc tsc phát ra trước, tsdown đóng gói sau:

- Host tsc thực thi `tsc -b` trên `tsconfig.host.json`, xuất `.js`, `.d.ts`, `.js.map` và `.d.ts.map` theo từng module vào `lib/types` của mỗi package trong đồ thị Host; Host tsdown sau đó đọc các file JS này, sinh entry point phát hành và chạy Host Typert.
- Client tsc thực thi `tsc -b` trên `tsconfig.client.json` sau khi Host Typert đã sinh khai báo Remote Client; Client tsdown lại đọc JS được phát ra từ đồ thị Client, sinh entry point Node loader và browser bundle cho package Client.
- Web build chỉ khởi động sau khi cả hai giai đoạn lib hoàn tất.

`tsdown` không còn chịu trách nhiệm biên dịch TypeScript hay xuất file khai báo nữa.

`pnpm run typecheck` thực thi giai đoạn Host lib trước, để sinh khai báo Remote cần thiết cho việc kiểm tra kiểu Client, rồi thực thi `tsc -b` trên `tsconfig.client.json`. Cả hai aggregate tự kiểm tra example, test và script của riêng mình theo kiểu `noEmit`; project package và vendor được tham chiếu vẫn giữ hành vi phát ra giống như build.

Project hỗn hợp lưu thông tin build gia tăng trong output `lib/` cục bộ của từng project. `pnpm run clean` sẽ xác định thư mục output hiện đang có hiệu lực dựa trên đồ thị project-reference TypeScript gốc, xóa thông tin build gốc còn sót lại, và xóa các thư mục `packages/*/*` do package đã bị xóa để lại mà chỉ chứa tàn dư sinh ra đã biết. Trước khi xóa mục tiêu hiện có, lệnh này sẽ giải quyết đường dẫn thật của thư mục cha mục tiêu; nếu thư mục cha đã giải quyết nằm ngoài repo, nó sẽ từ chối xóa, ngăn việc dùng symlink trong project reference để chuyển hướng thao tác dọn dẹp ra ngoài bản sao làm việc. Với mỗi package vẫn còn `package.json`, lệnh này sẽ giữ lại `node_modules`; nếu trong thư mục không có `package.json` tồn tại file không xác định, nó sẽ từ chối xóa. Build không tự động gọi clean, do đó build thông thường sẽ giữ nguyên trạng thái gia tăng.

Cấu trúc điều phối lệnh như sau:

```sh
pnpm run build:
tsc -b tsconfig.host.json
tsdown --env.DSH_BUILD_FACE host
tsc -b tsconfig.client.json
tsdown --env.DSH_BUILD_FACE client
pnpm run build:web

pnpm run verify-node-next-types:
tsx scripts/verify-node-next-types.ts

pnpm run typecheck:
pnpm run build:lib:host
tsc -b tsconfig.client.json

pnpm run clean:
tsx scripts/clean.ts
```

Demo chế độ source code chạy qua launcher TypeScript tự khai báo riêng và path mapping ở thư mục gốc. Chuỗi TUI `dsh` dùng chuyển đổi gốc của Node và loader path riêng của ứng dụng, demo Web build artifact cần thiết trước khi vào cùng chuỗi source code CLI đó, các demo source code khác tiếp tục dùng tsx.

## Phương án khác đã cân nhắc

- **Tiếp tục dùng `tsdown`/oxc làm bộ chuyển đổi TypeScript**: hành vi chuyển đổi của oxc khác với `tsc` (khác biệt trong chuyển đổi decorator, JS đóng gói khác với output theo từng file), và `.d.ts` đóng gói của nó xung đột với cấu trúc module augmentation tương đối nội bộ của Cordis.
- **Dùng một program nghiêm ngặt ở thư mục gốc để bao phủ package, vendor, example, test và script**: source code vendor dưới cờ nghiêm ngặt ở thư mục gốc sẽ kích hoạt lỗi kiểu không thuộc phạm vi sở hữu của project này; project reference với mức độ nghiêm ngặt theo từng project mới là ranh giới khả thi.
- **Chạy clean trước mỗi lần build**: dù layout workspace không thay đổi, việc này cũng sẽ loại bỏ trạng thái gia tăng thuộc sở hữu của `tsc` và bundler.
- **Xóa toàn bộ `node_modules` cấp package**: liên kết dependency package hợp lệ không gây ra lỗi phát hiện workspace, còn xóa các liên kết này sẽ biến việc dọn dẹp build thành cài lại dependency.

## Hệ quả

Trách nhiệm build rõ ràng hơn:

- Mỗi module thông thường dưới `packages/<group>/<pkg>` và `vendor/*` có một tsconfig cục bộ, đồng thời phục vụ build, kiểm tra kiểu và công cụ chạy trực tiếp source code (như loader source code `dsh`, `tsx` và `vitest`). `api/remotes` là ngoại lệ duy nhất, do thứ tự convention sinh ra nên dùng một solution và hai emitting project loại trừ lẫn nhau.
- Lệnh `build` chạy tuần tự đồ thị Project Reference của Host và Client. Mỗi giai đoạn đều do `tsc -b` chịu trách nhiệm output `.js` và `.d.ts` theo từng module có thể phát hành, bundler chỉ chịu trách nhiệm phát hành bundle runtime.
    - `lib/types/*.d.ts` là output khai báo dùng để phát hành; `.d.ts.map` chỉ được giữ lại như artifact biên dịch cục bộ.
    - `lib/types/*.d.ts` dùng specifier tương đối `.ts` tường minh, resolver NodeNext/Node16 của TypeScript sẽ ánh xạ chúng tới file `.d.ts` cùng cấp.
    - `lib/types/*.js` thường chỉ dùng làm input cho bundler. Các file này chỉ được phát hành khi có export runtime tường minh trỏ tới cây output đó.
    - `lib/index.*` là output runtime dùng để phát hành, do bundler (hiện là `tsdown`) sinh ra.
- `pnpm run verify-node-next-types` quét file khai báo đã build, kiểm tra xem có tồn tại specifier tương đối thiếu phần mở rộng file hay không, sau đó dùng `moduleResolution: "NodeNext"` để kiểm tra kiểu interface `types`/`exports` đã build cho một bên tiêu thụ ESM ngoại bộ tạm thời, đảm bảo hồi quy specifier khai báo được bắt trước khi phát hành.
- Lệnh `typecheck` dùng `tsconfig.json`. Example, test và script được kiểm tra bởi project no-emit ở thư mục gốc, module package và vendor giữ hành vi output giống với `build`. Source code package và vendor luôn nằm sau ranh giới project-reference.
- Sau khi chuyển nhánh hoặc cập nhật bản sao làm việc, nếu có package bị xóa trong đó, người đóng góp có thể chạy `pnpm run clean` trước khi build lại, để xóa thư mục package lỗi thời. Thư mục package không có `package.json`, nếu có file không xác định, phải xác định thủ công loại của nó, không được xóa trực tiếp.

Bản sao vendor của Cordis giờ có thêm một điểm khác biệt cấu trúc kiểu so với thượng nguồn. Khi đồng bộ thượng nguồn, khác biệt này phải được áp dụng lại hoặc bị bỏ đi một cách tường minh.
