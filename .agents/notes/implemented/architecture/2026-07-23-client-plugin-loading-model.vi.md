# Agent Note: Nạp plugin phía client — package thường, plugin dsh.client và boot hai giai đoạn

Status: implemented

[English](2026-07-23-client-plugin-loading-model.md) | Tiếng Việt

> Phạm vi: cỗ máy nạp plugin ở phía browser — plugin là gì, code đến bằng cách nào, hot reload được lắp vào mô hình này ra sao. Chuỗi nạp thuộc về tài liệu này; [Ghi chú kiến trúc Web client](2026-07-19-gui-web-client-architecture.md) coi tài liệu này là chuẩn cho vấn đề nạp, và tiếp tục sở hữu slot, tầng đối tượng dữ liệu và mặt React.

## Problem

Ở phía host, việc nạp plugin cordis đứng trên cơ chế module của Node — require cache và ESM loader nội bộ nắm giữ danh tính module và byte thực tế. `@cordisjs/plugin-loader` đã vendor thực hiện việc quản trị plugin và hot reload trên nền tảng này, hai bên chỉ gặp nhau tại đúng một ranh giới: `Loader.internal`.

Client chạy trên browser dùng cùng một cơ chế plugin cordis, nên bên dưới cần cùng một nền tảng — trong khi browser không có hệ thống module của Node.

Công trình frontend thông thường tiêu hóa toàn bộ dependency ngay lúc build: một bundle duy nhất, external được bundler giải quyết, runtime không có gì để quản lý. Việc quản lý module ở runtime chồng thêm lên trên đó chính là nhu cầu đặc thù ở đây. Vì vậy client được tách thành hai tầng: tầng trên là việc nạp plugin cordis qua cùng một Loader đã vendor, tầng dưới là quản lý dependency ở mức độ hạt module — `dsh-client-modules`.

Tầng dưới cung cấp bốn năng lực: external (danh sách nền tảng), đến từ xa (classic script bên ngoài cùng origin cộng đăng ký factory lười), phiên bản hóa (rev theo hash nội dung), cập nhật nóng (invalidate/prefetch).

Bundle plugin được build độc lập, nằm ngoài đồ thị module của Vite. Nếu nhét văn bản response vào inline script, browser chỉ thấy được đúng một lần thực thi mã nguồn động: không có chuỗi sourcemap chuẩn giữa network resource, bundle được sinh ra, và mã nguồn TypeScript/TSX; profile hiệu năng và stack trace chỉ có thể rơi về `client.js` đã được sinh ra; hệ thống module còn phải giữ toàn bộ văn bản mã nguồn, và tách cùng một trách nhiệm đến-đích thành hai ranh giới truyền tải fetch và execute.

Trên nền đó, plugin client và plugin host được đăng ký và nạp theo cùng một cách thức nhất quán: package khai báo `dsh.client` đúng một lần, host quét khai báo đó vào đồ thị boot, cùng một ngữ nghĩa Loader quản trị entry ở cả hai phía.

Thế hệ client loader đầu tiên (`createClientLoader`) đã viết tay gộp hai tầng này vào chung một hàm. Sự hợp nhất đó để lại: không có đường unload/reload (chỉ nạp một lần, thẻ style không bao giờ bị gỡ), một danh sách dependency phải chép tay giữa ba file và đã sớm bị lệch, một cửa hậu bảng module cho việc import xuyên plugin — vừa lặp lại cơ chế service của cordis, vừa biến thứ tự nạp thành một ràng buộc đúng-sai. Cấu trúc dưới đây thay thế nó.

## Decision

### Hai loại package; `dsh.client` chính là plugin, không có nghĩa nào khác

Điều gì khiến một package trở thành plugin? Chỉ có đúng một quy tắc: **một khi cách một package được tiêu thụ là dependency injection của cordis, nó là package plugin; trước đó nó là package thường.** Cách code đến được trang không thuộc về hệ thống phân loại — cách đến được suy ra từ loại của package, chứ không phải ngược lại định nghĩa loại.

- **Package thường** là nền tảng tuyệt đối mà bản thân hệ thống module cần, cộng thêm các thư viện chưa chuyển sang DI: họ react, cordis, `@deepseek-ai/dsh-client-modules` (chính hệ thống module — nó không bao giờ có thể là plugin, vì module có trước mọi module), phần lõi shell của web, và — tạm thời — ui-slots, web-react, ui-primitives. Package thường được đóng vào bundle shell, được gieo (seed) sẵn vào bảng module, và không nhìn thấy được từ đồ thị host.
- **Package plugin** là tất cả những gì còn lại. Mỗi package đều mang khai báo manifest (danh sách metadata) `dsh.client` (`{ platform, inject, immediately? }`) và cùng một hình thái thống nhất: preset tsdown dùng chung sinh ra `lib/client.js`, `exports["./client"]` trỏ tới bundle đó. Mỗi package đều là một entry được quản trị trong đồ thị do host viết. Hiện gồm: connection, runtime, ui-theme, i18n, hmr (chỉ vào đồ thị dev), ui-layout, ui-sidebar, ui-conversation, ui-model-selector, ui-user-questions, ui-trajectory.

manifest nắm giữ quy ước nạp của package: cạnh dependency `inject` của nó, cộng với cờ prefetch `immediately` tùy chọn (mặc định là lazy). App chịu trách nhiệm lắp ráp chỉ nắm giữ danh sách (roster).

Thêm một package plugin mới: khai báo `dsh.client`, sinh bundle `./client` qua preset dùng chung, thêm tên package vào danh sách của app chịu trách nhiệm lắp ráp. Ngoài ra không cần bàn giao gì thêm.

Khi nào package thường được nâng cấp thành plugin? Quy tắc nâng cấp được ghi lại để đường di trú luôn trung thực: **package thường chỉ được nâng cấp thành package plugin đúng vào lúc bên tiêu thụ nó chuyển sang dùng cordis DI, không bao giờ sớm hơn.** Ba lượt nâng cấp đang xếp hàng: ui-slots (hiện cỗ máy slots — SlotRegistry, quy ước renderer, root slot — đang ở trong runtime), web-react (việc cài đặt renderer chuyển vào `apply` của chính nó), ui-primitives (khi component được cung cấp qua slot/service). Trước lúc đó chúng vẫn giữ tư cách package thường, export ký hiệu vẫn là static import bình thường.

Bốn quy tắc về cạnh (edge) chi phối việc import xuyên qua hai loại package. Không quy tắc nào phụ thuộc vào bất kỳ cờ đánh dấu ở cấp một package đơn lẻ nào:

- **Import giá trị plugin ↔ plugin là lỗi build.** Không liên quan đến khai báo `immediately` ở cả hai phía — quy tắc không được phụ thuộc vào một cờ mà ai cũng có thể lật lại. Cộng tác đi qua inject/service của cordis. `import type` được miễn trừ; chuỗi kiểu không hề bị động chạm. Đây chính là lý do vì sao `scopeOf` là một method của `SessionRuntime`, và `transportError` nằm ở tầng wire của `dsh-host-apiproxy` (nhà gốc của `RpcResult`, inline an toàn).
- **Import giá trị plugin → package thường được đưa ra ngoài (external)**, xác định theo danh sách nền tảng. Danh sách là một hằng số trong shell (`platform.ts`: họ react, cordis, ui-slots, web-react, ui-primitives), cả preset tsdown (xác định external) lẫn `seed.ts` (làm nóng bảng module trước) đều import nó. Một hằng số, hai bên tiêu thụ — loại lỗi lệch do phải đồng bộ thủ công đã bị triệt tiêu hoàn toàn.
- **Cổng kiểm tra độ thuần khiết (purity gate) bao phủ mọi package plugin.** Ba nhánh của nó: import nền tảng được đưa ra ngoài thành external; tầng wire INLINE_SAFE được inline; bất kỳ rò rỉ workspace nào khác đều là lỗi build. Chính hình thái bundle thống nhất khiến sự bao phủ này không còn góc chết nào — mọi plugin đều được build qua cùng một preset, không package nào có thể đứng ngoài cổng kiểm tra.
- **Shell tự cấp.** Lõi (boot + trang loading) không có bất kỳ import giá trị nào tới bất kỳ package plugin nào; store trạng thái của nó được viết tay. Phần hiển thị thất bại lớn tiếng không được phụ thuộc vào chính hệ thống mà nó đang báo cáo lỗi.

### Một hệ thống module, một bộ quản trị plugin

Browser tái hiện lại sự phân công ở phía host. `dsh-client-modules` (`ClientModuleSystem`) ngồi vào ghế hệ thống module mà ở phía host do ESM loader nội bộ của Node chiếm giữ; cùng một `@cordisjs/plugin-loader` đã vendor ngồi vào ghế quản trị ở cả hai phía. Ranh giới giữa hai bên có thể nói gọn trong một câu: **hệ thống module nắm giữ danh tính module và byte thực tế — code đến bằng cách nào, đăng ký ra sao, biến thành nội dung export như thế nào; Loader nắm giữ vòng đời plugin — plugin gắn (mount) khi nào, chờ đợi cái gì, tháo dỡ ra sao.**

`ClientModuleSystem` là một bảng CJS lười (lazy). Thực thi một bundle chỉ **đăng ký** factory của nó — bundle gọi `window.__ModuleLoader__.load({ id, factory })`, ngoài ra không có gì khác xảy ra. Mọi side effect của thân module (kể cả việc inject CSS) đều nằm trong closure của factory, chạy lúc vật chất hóa (materialize): vật chất hóa chính là lần `require`/import đầu tiên của id đó, sau đó được ghi nhớ (memoize). Nếu factory require một "bạn đồng hành" đã đăng ký nhưng chưa vật chất hóa, nó sẽ đệ quy vật chất hóa bạn đó, vì vậy không có nơi nào tồn tại việc sắp thứ tự. Khi được yêu cầu import một id, bảng giải quyết theo thứ tự nhánh cố định: mục seed → bản ghi đã memoize → đăng ký tĩnh (module riêng của shell, như app-shell) → factory đã đăng ký → tải classic script bên ngoài theo dòng đồ thị → ném lỗi lớn tiếng. Cú ném cuối cùng này chính là hình ảnh phản chiếu lúc runtime của cổng kiểm tra độ thuần khiết ở thời điểm build. Hệ thống còn giữ sổ sách theo từng module — id thẻ `<style data-plugin>` thuộc về nó, các cạnh require quan sát được — và phơi ra hai động từ mà HMR (Hot Module Replacement) cần: `prefetch(id)` (tải script, chỉ đăng ký factory; các lời gọi đồng thời chia sẻ chung một tác vụ đang chạy) và `invalidate(id)` (bỏ factory và bản ghi, lần đến kế tiếp sẽ tải lại).

Loader đã vendor tiêu thụ hệ thống module qua quy ước `internal` của nó — điểm gọi duy nhất là `tree.import` — và nắm giữ mọi giao dịch về hình thái entry: tạo entry, kích hoạt fiber qua việc chờ service của cordis (service được inject chưa sẵn sàng thì giữ ở PENDING, service provide thì kích hoạt theo tầng), update/refresh, tháo dỡ. Code quản trị giống hệt từng byte với phía host, theo đúng chính sách vendor. Việc "browser hóa" là một ánh xạ ở thời điểm biên dịch trong cấu hình vite của shell: một alias stub `node:module` cộng với vài define `process.*`, khiến `ModuleLoader.fromInternal()` trả về undefined — đây chính là chỗ trống dành cho shell điền vào. Hệ thống module được gắn dưới tên `ctx.modules`.

### Việc đến từ script bên ngoài và ánh xạ mã nguồn

`url` của mỗi dòng đồ thị được giao cho một `<script src>` classic bên ngoài cùng origin, mang `async`. Browser nắm giữ network request và việc thực thi script; ngay sau khi `load` hoặc `error` quyết toán, node được gỡ bỏ ngay lập tức, tránh việc HMR tích tụ các node đã mất hiệu lực. Quyết toán thành công còn đòi hỏi id factory tương ứng của dòng đồ thị đã xuất hiện trong bảng module, nếu không việc đến từ được coi là thất bại; việc đăng ký vẫn không chạy factory, ranh giới side effect vẫn nằm ở lần vật chất hóa đầu tiên.

Preset tsdown dùng chung sinh ra `client.js.map` cho mỗi plugin, và viết lại đường dẫn mã nguồn thuộc bên thứ nhất thành hình dạng repo mà browser nhận diện được `/packages/<group>/<package>/src/...`. Mã nguồn workspace khác được inline vào bundle cũng quay về đúng chỗ `packages/` của nó, đường dẫn dependency package giữ nguyên; `sourcesContent` mang theo mã nguồn, nên host chỉ cần cung cấp map tại `/plugins/<id>/client.js.map`, không cần mở route mã nguồn. Vite shell cũng sinh sourcemap, để cả code shell lẫn plugin ngoài đồ thị đều có thể quay lại TypeScript/TSX từ stack trace và profile hiệu năng.

`rev` tiếp tục đóng vai trò tham số query của URL script và mỏ neo (anchor) nhất quán nội dung, cả bundle lẫn map đều được cung cấp với `no-cache`. Sự kiện `error` của script bên ngoài không cho biết response status và body, nên chẩn đoán thất bại chỉ có thể báo cáo URL; việc host cung cấp cùng origin và id bàn giao được ghi ở thời điểm build là ranh giới danh tính, việc kiểm tra sự tồn tại của factory sau `load` chịu trách nhiệm từ chối sản phẩm không đăng ký id kỳ vọng.

### Luồng nạp, từ đầu đến cuối

Điều gì xảy ra từ lúc `dsh web` khởi động đến khi UI xuất hiện? Ba giai đoạn: host lắp ráp và cung cấp một đồ thị, shell prefetch, rồi cordis điều phối.

**Phía host — lắp ráp đồ thị này.**

1. App chịu trách nhiệm lắp ráp (`apps/cli`) đặt danh sách như các dòng thường vào cây cấu hình `cordis.yml` của nó — package plugin client cũng là dòng entry giống như mọi plugin host, bao gồm cả dòng `client-hmr` được mount vô điều kiện. Lỗi import của dòng trong danh sách được `assertEntriesLoaded` bắt lấy; dòng có fiber bị reject thì `assertEntriesActivated` báo cáo stack gốc ([quyết định về host boot](2026-07-24-web-config-tree-boot-and-transport-layering.md)).
2. Nửa node của `dsh-client-modules` (package này có hai mặt: nửa browser chính là bảng module) quét khai báo `dsh.client` trong package.json của loader entry, lắp ráp ra `window.__DSH_BOOT__`: `{ rev, entries: [{ id, url, rev, inject?, immediately? }] }`. Cạnh `inject` và cờ `immediately` đều đến từ manifest, không bao giờ chép tay. Nó sẽ từ chối những plugin đã khai báo mà chưa có bundle `./client` được build, và quy dòng package/path của chúng về một yêu cầu build từ mã nguồn; trường khai báo bị hỏng cũng khiến việc kích hoạt thất bại, kiểm tra của host sẽ báo cáo cả hai loại lỗi này từ fiber FAILED.
3. Việc quét diễn ra theo từng package tăng dần — không tồn tại đường code quét lại toàn bộ. Mỗi lần cordis phát ra `internal/plugin` sẽ đánh dấu bẩn (dirty) tên entry của fiber đó (fiber không có entry bị bỏ với chi phí O(1)); việc flush microtask đối chiếu mỗi tên bẩn với các loader entry đang sống, metadata package (kể cả kết luận phủ định "không phải package client") được cache vĩnh viễn theo tên, việc rehash bundle chỉ có thể đạt tới qua `rebuilt(id)`. Lượt kích hoạt bơm cùng tập bẩn từ các entries hiện tại và flush đồng bộ, quét ban đầu và trạng thái ổn định dùng chung một cách triển khai. Hash nội dung của mỗi bundle chính là `rev` của nó (mỏ neo cho việc làm mất hiệu lực cache + diff HMR), hash tập hợp các dòng đi vào `graph.rev`, mỗi dòng đều được cung cấp như một tài nguyên script: `/plugins/<id>/client.js?rev=…`, sourcemap tương ứng nằm ở cùng đường dẫn cộng thêm `.map`. Nguồn duy nhất cho kiểu đồ thị nằm ở export `./client` của package modules — webserver không biết gì về đồ thị (nó là một plugin đăng ký route đơn giản; cả route bundle lẫn tap render index đều tự modules đăng ký lấy).

Vì sao danh sách là các dòng yml chứ không phải là quét? Vì việc plugin nào được lắp ráp vào một lần triển khai là quyết định lắp ráp, không phải thuộc tính của package — một package trong repo có khai báo dsh.client không có nghĩa là lần triển khai này phải mount nó, việc quét phát hiện không thể thay con người ra quyết định đó; nửa node chỉ quét những gì cây cấu hình thực sự đã mount.

**Giai đoạn một — mặt module.** Shell dựng hệ thống module lên trên đồ thị, rồi prefetch song song mỗi dòng `immediately`. Prefetch tức là tải script bên ngoài, chỉ đăng ký factory. Thất bại prefetch của một dòng đơn lẻ bị nuốt ở đây: khi import ở giai đoạn hai sẽ thử tải lại và nắm giữ đúng lần thất bại lớn tiếng đó, nên một dòng hỏng không thể giấu được các dòng khác. `immediately` là cờ prefetch — không phải rào chắn, không phải danh tính. Package khai báo nó, registry mang nó vào dòng đồ thị. Plugin hạ tầng (connection, runtime, ui-theme, i18n, cộng thêm hmr) khai báo nó; còn plugin UI thì đến thẳng theo nhu cầu.

**Giai đoạn hai — mặt plugin.**

1. Lõi gắn Loader đã vendor, inject hệ thống module thành `internal` ngay trước khi bất kỳ entry nào tồn tại. Thứ tự ở đây có ý nghĩa: nhánh dự phòng import trần của `tree.import` tuyệt đối không được chạy tới trong browser.
2. Nó tạo entry cho mỗi dòng trong đồ thị, cộng thêm một dòng giả app-shell. Entry lắp ráp là code riêng của shell mà lõi tự thêm vào — đăng ký tĩnh với hệ thống module, tuyệt đối không đi vào đồ thị host — nên nó cùng đi chung một vòng đời entry và cùng lớp phủ trạng thái với mọi thứ còn lại.
3. Thứ tự tạo không mang bất kỳ ngữ nghĩa nào; fiber được kích hoạt qua việc chờ service.
4. `settled` = mỗi entry đã được tạo + `loader.await()` đã dừng hẳn hoàn toàn + một lượt quét toàn ACTIVE. Lượt quét liệt kê mỗi fiber bị lỗi import, FAILED hoặc PENDING cùng với service còn thiếu của nó. Lý do nó tồn tại: việc chờ inject của cordis không có timeout — lượt quét này chính là tuyến phòng thủ cuối cho việc thất bại lớn tiếng.
5. Trạng thái khởi động của trang loading là một phép chiếu của trạng thái fiber thực qua `internal/status`. `settled` lật trạng thái là chuyển ngay một lần sang UI thật.

### Hot reload: một plugin điều khiển, bundle tự giám sát

Hot reload là một quyết định lắp ráp: package lắp ráp web mount vô điều kiện dòng `client-hmr` (một package plugin bình thường), nửa node của nó mang theo việc giám sát bundle và kênh SSE (Server-Sent Events); khi không có watcher rebuild ghi đè lên bundle của client, chuỗi liên kết vẫn ở trạng thái rảnh. Việc lắp ráp nào không nên phơi bày nó có thể tắt dòng đó.

Bundle vừa được rebuild biến thành tín hiệu reload bằng cách nào? Nửa node của hmr tự quan sát — không có builder nào thông báo cho nó. Nó đọc đường dẫn bundle của từng dòng trên đồ thị từ `ctx.clientModules.clientPath(id)`, dùng đúng một timer riêng của HMR để polling stat cho mỗi dòng trên đồ thị hiện tại. Khi thêm dòng đồ thị mới, thứ tự cố định là lấy baseline stat đồng bộ trước, rồi gọi ngay `clientModuleHost.rebuilt(id)`: việc ghi xảy ra sau khi module host tính xong hash đồ thị nhưng trước khi lấy baseline sẽ bị lượt rehash tức thời này bắt lấy; việc ghi xảy ra sau khi lấy baseline sẽ để lại chênh lệch stat, được bắt ở lượt polling kế tiếp. Cách này tránh dùng `fs.watchFile`: nó lập baseline bằng lần stat đầu tiên bất đồng bộ, có thể âm thầm hấp thụ việc rebuild đang diễn ra trong lúc dựng baseline vào chính baseline đó. Tập thành viên được giám sát cập nhật theo `onGraphChanged`; dòng biến mất thì bị gỡ giám sát, bundle thiếu lúc polling thì khiến dòng tương ứng giữ trạng thái đánh dấu bẩn, khi file xuất hiện trở lại thì bị buộc rehash dù metadata giống hệt. Khi mtime/size thay đổi hoặc dòng đang ở trạng thái bẩn, `clientModuleHost.rebuilt(id)` là điểm vào duy nhất cho việc rehash; chỉ khi `rev` thực sự đổi thì nửa node mới phát khung `rebuilt` trên `GET /plugins/events` — đây là một kênh SSE cấp hệ thống, kết nối là phát toàn bộ đồ thị, thay đổi thì phát khung `rebuilt`, chỉ dành cho việc hiển thị, không bao giờ đi vào session log. Polling là lựa chọn có chủ đích: inotify không kích hoạt trên các ổ mount mạng weka, watcher phía build cần `--poll` cũng vì cùng lý do đó; khoảng polling là một trường cấu hình đã được kiểm chứng (mặc định 500ms), dispose (giải phóng tài nguyên) sẽ dọn dẹp đúng cái timer đó. Việc rebuild bundle là việc của bất kỳ tiến trình tsdown watch nào — `scripts/dev-web.ts` vẫn được giữ lại làm điểm vào build watch, danh sách package của nó được quét lúc khởi động trong `packages/*/*/package.json` theo dsh.client — builder và host chia sẻ không giao thức nào. Việc đọc phải một bundle đang ghi dở dang (bị xé) sẽ tự lành: trong lúc ghi chưa xong stat vẫn liên tục thay đổi, nhịp polling kế tiếp sẽ rehash lại lần nữa và phát broadcast rev cuối cùng.

Phía browser, plugin điều khiển reload đúng một plugin mỗi khung (frame), thực thi tuần tự:

1. `invalidate` — bỏ factory và bản ghi đã cũ. Nếu factory vẫn còn sống thì bước tiếp theo sẽ trở thành no-op.
2. `prefetch` — tải script bên ngoài và đăng ký factory mới, fiber cũ vẫn đang phục vụ vào lúc này.
3. `registry.delete` — trước bất kỳ thao tác fiber nào. Nếu chỉ đơn thuần dispose fiber sẽ kích hoạt nhánh tự-dispose của Loader đã vendor, làm entry bị vô hiệu hóa vĩnh viễn.
4. Xả hết các disposer của fiber cũ.
5. Gỡ bỏ các thẻ `<style data-plugin>` thuộc về nó.
6. `entry.refresh()` — import lại, vật chất hóa factory mới. CSS được inject lại ở đây, dùng lại đúng cùng lô id thẻ ổn định.
7. `fiber.await()` — để lỗi được ném lại lớn tiếng.

Mọi plugin đều dùng chung một ngữ nghĩa; việc reload dòng `immediately` không khác một chút nào so với dòng lazy. Việc lan truyền theo tầng của dependency không tốn một dòng code client nào: epoch kích hoạt của fiber được nối chuỗi với uid của từng bên cung cấp service của nó, nên khi thay fiber của bên cung cấp, mọi bên phụ thuộc đều sẽ được nạp lại qua chính cordis. Reload connection hoặc runtime sẽ lan truyền theo tầng ra toàn bộ UI — đúng đắn, dù có nặng.

Trình bày trung thực về ranh giới hỗ trợ. Độ hạt của reload được cố ý làm thô: fiber hoàn toàn mới, component hoàn toàn mới, trạng thái React bị mất, tầng dữ liệu không đổi — việc giữ trạng thái ở cấp react-refresh xung đột với "thực thi lại bundle tức là chạy lại factory", nên bị cố ý không làm. Package thường (họ react, lõi shell, các thư viện chưa được nâng cấp) không phải là entry: sửa chúng đồng nghĩa với việc rebuild shell cộng với refresh toàn trang. v1 không có rollback: import thất bại khiến entry mất fiber, khung `rebuilt` kế tiếp sẽ thử lại từ đầu; apply thất bại để lại fiber FAILED cho phần chiếu trạng thái xử lý; cả hai đều được ghi lại lớn tiếng. Tự-reload là khả thi — lượt reload đang diễn ra chạy xong trong closure của bundle cũ, apply mới mở một kênh SSE mới — nhưng khung đến trong khoảng trống sẽ bị mất, lần rebuild sau sẽ thông báo lại. Có một race condition đã biết, chỉ giới hạn ở dev: khi khung `rebuilt` chồng lấp với việc boot vẫn đang trên đường tới, chúng chia sẻ chung tác vụ của lượt đến đó, có thể vật chất hóa các byte trước khi rebuild; khung tiếp theo sẽ tự lành.

## Kiểm kê package (hiện trạng → dài hạn)

| Package | Vai trò | Hiện trạng | Dài hạn |
|---|---|---|---|
| Họ react / cordis | Singleton nền tảng | Đóng vào shell, đã được gieo (seed) | Mãi mãi là package thường (nền tảng tuyệt đối) |
| Loader đã vendor `@cordisjs/plugin-loader` | Quản trị entry (cùng một code ở cả hai phía) | Được "browser hóa" lúc biên dịch, lõi gắn (mount) | Không thay đổi (chính sách vendor) |
| `dsh-client-modules` | Hệ thống module của client | Bảng module CJS lười; boot hai giai đoạn | Mãi mãi là package thường (module có trước mọi module) |
| `dsh-client-web` | Lõi shell + AppRoot + lắp ráp app-shell | Tự cấp (store trạng thái viết tay, không import giá trị plugin nào) | Tiếp tục thu nhỏ |
| `dsh-client-ui-slots` | Lõi registry slot | Package thường, đã được gieo | Nâng cấp thành plugin; tiếp nhận cỗ máy slots từ runtime |
| `dsh-client-web-react` | Keo dán ctx↔React | Package thường, đã được gieo | Nâng cấp thành plugin; việc cài đặt renderer chuyển vào `apply` của nó |
| `dsh-client-ui-primitives` | Component cơ bản | Package thường, đã được gieo | Nâng cấp thành plugin (component được cung cấp qua slot/service) |
| `dsh-client-connection` | Tầng wire | Plugin (dsh.client + bundle), khai báo `immediately` | Thay thế transport (giá mang Electron IPC) |
| `dsh-client-runtime` | Tầng đối tượng session + service slots + engine store | Plugin, khai báo `immediately` | Tiếp tục thu nhỏ về tầng đối tượng session thuần túy |
| `dsh-client-ui-theme` | Token/service theme | Plugin, khai báo `immediately`, cộng thêm kênh mã nguồn `./styles/*` | Theme Registry (quyết định riêng) |
| `dsh-client-i18n` | I18nService | Plugin, khai báo `immediately` | Lắp ráp gói ngôn ngữ theo từng lần triển khai |
| `dsh-client-hmr` | Điều khiển hot reload | Plugin, khai báo `immediately` | Rollback; bắt tay kết nối lại |
| ui-layout / ui-sidebar / ui-conversation / ui-trajectory | Tính năng UI | Plugin, đến theo nhu cầu | Tách domain conversation; triển khai thật cho trajectory |

## Consequences

Cả hai phía của wire chạy cùng một cách triển khai quản trị; tầng đặc thù của browser chỉ chứa một hệ thống module và một plugin reload. Package plugin chỉ có một hình thái duy nhất, nên cổng kiểm tra độ thuần khiết bao phủ toàn bộ plugin. Cạnh dependency và mức độ khởi động đều ở cùng nơi với chủ sở hữu của chúng — manifest — app chịu trách nhiệm lắp ráp chỉ nắm giữ danh sách. Từng loại lỗi lệch bị đóng chặt về mặt cấu trúc: đồng bộ thủ công danh sách dùng chung, ghép chặt thứ tự nạp, import xuyên plugin, ghi sổ kép danh sách/mức độ. Việc nạp script gốc của browser giữ cho network resource của plugin, bundle được sinh ra, và mã nguồn TypeScript/TSX luôn có ánh xạ chuẩn, hệ thống module cũng chỉ giữ lại một hook `loadBundle` có thể thay thế được.

Cái giá được chấp nhận: Loader đã vendor phải cõng theo cỗ máy nhàn rỗi khi ở trong browser (việc persist EntryTree là no-op, nhóm/cô lập không được dùng đến); mỗi lần sửa plugin trong lúc phát triển đều phải trả giá bằng một lần rebuild bundle cộng với remount fiber; dòng `inject` trong đồ thị chỉ là ghi chú mang tính thông tin — sự thật về kích hoạt nằm ở tầng service — nên độ lệch sẽ lộ ra ở lượt quét `settled`, chứ không bị chặn lại lúc kiểm tra đồ thị; ba thư viện chưa được nâng cấp giữ nguyên export dạng static import cho tới khi việc chuyển đổi DI của từng thư viện được triển khai xong; mỗi bundle phát sinh thêm một sản phẩm sourcemap, thất bại của script bên ngoài cũng chỉ có thể đưa ra chẩn đoán URL ở mức thô, không thể báo cáo HTTP status như fetch tường minh.

Danh sách: nằm trong cây cấu hình của package lắp ráp web (`packages/bundle/web-app/cordis.patch.yml`); hằng số `mountWebPlugins` và `CLIENT_PACKAGES` đã biến mất, tái tổ chức một lần triển khai tương đương với đổi yml/overlay. Bộ lắp ráp đồ thị đã di trú từ registry phía webserver sang nửa node của `dsh-client-modules` (package này được nâng cấp thành hai mặt theo đúng quy tắc nâng cấp của note này — bên tiêu thụ nó nay đến qua cordis DI), việc tách transport cũng đáp xuống trong cùng đợt: webserver trở thành một plugin đăng ký route đơn giản, binding `/api/*` di trú sang nửa node của connection, đi qua plugin `api-gateway` đã được nâng cấp (`dsh-host-apiproxy` cung cấp `ctx.apiProxy`), việc giám sát bundle và kênh SSE (Server-Sent Events) của dev di trú sang nửa node của hmr.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Hệ phân loại hai trục (entry × cách đến), package hạ tầng không mang dsh.client | Xóa mất cạnh dependency của manifest (inject rò rỉ ra bên lắp ráp), tách hình thái plugin thành hai loại, khiến cổng kiểm tra độ thuần khiết bị mù với một nửa số plugin |
| Tiếp tục tiến hóa loader viết tay thành bộ quản trị | Triển khai lại vòng đời entry/fiber mà Loader đã vendor đã có sẵn; HMR sẽ không chia sẻ bộ khung nào với phía host |
| Tái dùng `@cordisjs/plugin-hmr` trong browser | Khoảng 80% là giải quyết những vấn đề mà browser không có (giám sát fs, tô màu đồ thị theo độ sâu, cache kép của Node); chỉ mượn hình dạng bộ khung reload của nó |
| Module federation | Bundle từ xa được build độc lập chính là hình thái mà vite federation không hỗ trợ |
| import map | Đã bị loại trừ từ sớm; bảng require DI là cơ chế cuối cùng |
| Ctx hóa triệt để ngay bây giờ (react và thư viện đều đi qua service, không đặt bảng module) | Hình thái cực đoan trên trục module; tạm gác lại — quy tắc nâng cấp sẽ đưa từng package tiến tới đó một cách tuần tự |
| Bảng đóng băng + đến là khởi tạo ngay | Đòi hỏi phải sắp thứ tự theo thời điểm đến; đăng ký CJS lười để `require` đệ quy tự định thứ tự, và khớp với việc tách giai đoạn của bộ kéo (puller) đơn giản |
| Inject `<script>` inline sau khi fetch văn bản response | Hệ thống module buộc phải đệm toàn bộ mã nguồn và duy trì hai đường fetch/execute; thực thi mã nguồn động cũng cắt đứt mối liên kết gốc giữa network resource, sourcemap và profile của browser |
| Builder chủ động đẩy kênh rebuild (orchestrator POST `/plugins/rebuilt` trong `onSuccess`) | Ghép chặt reload vào một tiến trình builder được chỉ định cụ thể và một giao thức wire thứ hai; webserver vốn đã nắm giữ đường dẫn của mỗi bundle, việc polling stat (mỗi lần stat đổi là rehash) đã hứng trọn cái race condition ghi bị xé mà trước đây được dùng để biện minh cho cách đẩy |
