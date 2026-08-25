# Agent Note: Build có thứ tự cho quy ước được sinh ra của API Remotes

Status: implemented

[English](2026-08-08-api-remotes-generated-contract-build.md) | Tiếng Việt

## Vấn đề

Phương thức `@Remote` của Host cần Typert sinh ra khai báo `/remote` và đóng góp runtime trước, thì `api-remotes/src/client/index.ts` của Client mới có thể qua typecheck và đóng gói các đóng góp này. Nếu build gốc đưa cả hai đồ thị Project Reference của Host và Client cho tsc cùng lúc, Client sẽ được biên dịch trước khi artifact được sinh ra tồn tại; nếu thêm bước tiền xử lý contracts độc lập, generator lại sẽ tách khỏi đồ thị Host bình thường để biên dịch lặp lại, và cho phép artifact cũ che giấu dependency sai.

Sự phụ thuộc thứ tự này không được thay đổi quy tắc package thông thường của repo. Package thông thường chỉ thuộc về một TypeScript face: package Host đăng ký trong `tsconfig.host.json`, package Client đăng ký trong `tsconfig.client.json`. Một plugin Client vừa có điểm vào Node loader vừa có điểm vào browser, đó chỉ là hình thái đóng gói, không phải lý do để tách project TypeScript.

## Quyết định

Build gốc hoàn tất tsc Host và tsdown Host trước, tsdown Host chạy Typert và sinh quy ước Remote Client; sau đó mới hoàn tất tsc Client, tsdown Client và build Web:

~~~text
tsc -b tsconfig.host.json
tsdown --env.DSH_BUILD_FACE host
tsc -b tsconfig.client.json
tsdown --env.DSH_BUILD_FACE client
Vite Web build
~~~

`build:lib:host` đảm nhiệm hai bước đầu, `build:lib:client` đảm nhiệm hai bước giữa, `build:web` chạy sau cùng. `typecheck` cũng phải chạy xong toàn bộ giai đoạn lib Host trước, vì tsc Client cần khai báo do tsdown Host sinh ra; nó không cần chạy tsdown Client hay build Web.

Mỗi giai đoạn tsc là đường dẫn TypeScript compiler duy nhất, đảm nhiệm việc emit JavaScript, khai báo và trạng thái tăng dần vào `lib/types`. tsdown chỉ đọc các JavaScript này và sinh bundle phát hành, không đọc mã nguồn, cũng không sinh khai báo.

## Ngoại lệ package duy nhất

`api/remotes` là package duy nhất vừa có composite project Host vừa có composite project Client. Project Host chứa chiến lược lookup Agent/Session, điểm vào plugin Host và invariant; project Client chỉ chứa `src/client/index.ts` vốn cần đợi quy ước được sinh ra:

~~~text
packages/api/remotes/
├─ tsconfig.json
├─ tsconfig.host.json
├─ tsconfig.client.json
└─ src/
   ├─ index.ts
   ├─ agent-lookup.ts
   ├─ invariant.ts
   └─ client/
      └─ index.ts
~~~

`tsconfig.json` gốc của package chỉ là solution tham chiếu hai project cụ thể, không đi vào đồ thị dependency của bất kỳ aggregate hay bên tiêu thụ trực tiếp nào. Aggregate Host gốc và `host/apiproxy` tham chiếu `api/remotes/tsconfig.host.json`; aggregate Client gốc và `client/ui-goal` tham chiếu `api/remotes/tsconfig.client.json`. Bản thân `ui-goal` vẫn là một project Client đơn thông thường. Gate workspace constraints duyệt qua đồ thị Project Reference có thể tiếp cận; bất kỳ project đã khai báo face nào tham chiếu solution gốc của package bị tách hoặc leaf ở phía đối diện đều bị gate từ chối, chỉ có đích `tsconfig.json` mới vẫn có thể được tham chiếu từ cả hai face.

Hai project dùng `files` không giao nhau và `.tsbuildinfo` khác nhau, nên có thể dùng chung `lib/types` mà không emit lặp bất kỳ mã nguồn nào. Nếu tương lai cần dùng chung một triển khai cho cả hai phía, nên chuyển triển khai vào một package trung lập, không được đưa cùng mã nguồn cho hai project emit cùng lúc.

Ngoại lệ này do quan hệ trước-sau thực tế của quy ước được sinh ra quyết định, không phải template để package thông thường lựa chọn. Package mới vẫn chỉ được đăng ký vào một aggregate; chỉ khi sửa đổi quyết định này và chứng minh tồn tại một dependency sinh khác không thể loại bỏ, mới được thêm ngoại lệ.

## Typert và tsdown

tsdown Host bật `typertPlugin({ mode: 'workspace', faces: ['host'] })` trong cấu hình gốc thông thường. generator chỉ dùng `tsconfig.host.json` làm hạt giống program, sinh `typert.host.*` cùng `typert.remote-client.*` được chiếu ra từ quy ước Host; tsdown Client không khởi động Typert, cũng không phân tích aggregate Client.

TypeScript compiler face và runtime artifact face của Typert là hai khái niệm khác lớp. Package `dshClient` thông thường dù chỉ có một compiler project, vẫn có thể đóng góp mô hình runtime cho cả Host lẫn Client theo subpath công khai; chỉ khi aggregate tham chiếu tường minh `tsconfig.host.json` hoặc `tsconfig.client.json`, analyzer mới giới hạn project đó vào face tương ứng. Do đó phân tích Host của `api-remotes` sẽ không đăng ký kèm điểm vào Client của nó, mô hình Host của package hai điểm vào thông thường cũng không bị mất.

Cả hai lượt tsdown Host và Client đều nhận toàn bộ workspace gồm `vendor/*`, `packages/*/*` và `apps/cli`. Cấu hình gốc không quét `lib/types/client/index.js`, không duy trì bảng phân loại package, cũng không dùng filter tsdown; cấu hình trong package trả về điểm vào của giai đoạn hiện tại dựa vào `DSH_BUILD_FACE`.

Plugin Client thông thường trả về cấu hình rỗng ở pass Host, và sinh cả điểm vào Node loader lẫn bundle browser ở pass Client. `clientBundle(..., { hostPhase: true })` của `api-remotes` là ngoại lệ giai đoạn duy nhất: pass Host sinh điểm vào Host của nó, pass Client chỉ sinh bundle browser. tsdown cục bộ theo package không chỉ định `DSH_BUILD_FACE` vẫn trả về đồng thời điểm vào bình thường của package đó, phục vụ phát triển đơn package cục bộ.

## Các phương án đã cân nhắc

**Giữ bước tiền xử lý contracts độc lập.** Cách này sẽ biên dịch generator bên ngoài đồ thị Project Reference Host bình thường, và để artifact còn sót lại che giấu vấn đề Client vào đồ thị Host quá sớm.

**Chạy `tsc -b tsconfig.json` gốc một lần rồi mới chạy tsdown.** tsc Client xảy ra trước tsdown Host, không thể lấy được khai báo `/remote` từ cây thư mục sạch.

**Tách mọi package chứa `src/client/index.ts`.** Hai điểm vào Node và browser là quy ước đóng gói của plugin Client thông thường, không tạo phụ thuộc thứ tự biên dịch; tách toàn bộ chỉ làm tăng chi phí bảo trì references và trạng thái tăng dần.

**Quét artifact biên dịch Client hoặc duy trì hai danh sách workspace.** Quét artifact sẽ khiến việc package có tham gia build hay không phụ thuộc vào file còn sót lại, danh sách thủ công và lọc theo tên package sẽ trôi dạt theo điều chỉnh thư mục. Toàn bộ workspace cộng với việc chọn face trong package đã cung cấp hành vi xác định.

**Chạy Typert lại ở pass Client.** Remote Client là hình chiếu của quy ước Host, không có nguồn reflection Client độc lập; program Typert thứ hai chỉ lặp lại công việc và tăng nguy cơ khai báo hai phía lẫn vào cùng một phân tích.

## Hệ quả

Build sạch trở thành xác minh thẩm quyền cho tính đúng đắn của thứ tự: khi không có artifact `/remote` sẵn có nào, tsc Host phải thành công trước, tsdown Host phải sinh ra quy ước, sau đó tsc Client, tsdown Client và build Web phải thành công. Không giai đoạn nào được ghi artifact vào `src`.

Trách nhiệm tsc-first do [Note cấu hình build TypeScript](2026-06-17-ts-build-config.md) xác định vẫn không đổi, nhưng hình dạng lệnh một lần tsc toàn đồ thị rồi mới đóng gói của nó được thay thế bằng các giai đoạn có thứ tự trong tài liệu này. Quy tắc một aggregate cho package thông thường do [Note solution hai aggregate](2026-07-22-tsconfig-solution-root-two-aggregates.md) xác định vẫn không đổi, tài liệu này chỉ thiết lập một ngoại lệ tường minh cho `api/remotes`.

Build độc lập của Client không còn là điểm vào tự đủ trên cây thư mục sạch; lệnh repo, CI và luồng phát hành phải chạy giai đoạn lib Host trước. Nhà phát triển của package thông thường không cần hiểu hay sao chép ngoại lệ này, vẫn chọn một aggregate theo môi trường chạy mà họ thuộc về.
