# Agent Note: Phát hành npm riêng tư theo ba chuỗi độc lập

Status: implemented

[English](2026-08-10-npm-release-sequences.md) | Tiếng Việt

## Vấn đề

Repo này có ba nhóm package có thể phát hành (publishable) không liên quan đến nhau, nhưng lại không có bất kỳ kênh phát hành nào đưa chúng lên registry.

`packages/*/*` cùng `apps/*` tạo thành mặt runtime của `@deepseek-ai/dsh`; `vendor/*` là chín package framework Cordis đã được rescope, mỗi package mang theo số phiên bản upstream riêng; `native/landlock-run/packages/*` là các package nền tảng Linux, có workflow riêng. Ba nhóm này khác nhau về baseline phiên bản, nhịp độ thay đổi và yêu cầu build: dsh thay đổi theo nhịp sản phẩm, vendor chỉ động khi đồng bộ upstream hoặc khi có thay đổi cục bộ, native cần toolchain musl và build theo từng kiến trúc. Nhét chúng vào một pipeline phát hành duy nhất đồng nghĩa với việc mỗi lần phát hành sản phẩm đều phải phát hành lại cả framework lẫn binary native.

Còn có hai cổng chặn cứng. Toàn bộ 217 workspace manifest đều là `private: true`, `npm publish` sẽ từ chối thẳng. Kín đáo hơn là 933 dòng `peerDependencies: "^0.0.1"` được viết cứng giữa các package anh em dsh: `pnpm pack` chỉ thay thế giao thức `workspace:`, không đụng đến phạm vi semver, mà `^0.0.1` tương đương `>=0.0.1 <0.0.2` — phát hành `0.0.2` sẽ không lọt vào phạm vi đó, phát hành `0.0.1-rc.1` cũng không lọt (semver quy định phạm vi không có đoạn prerelease sẽ loại trừ phiên bản prerelease). Những dòng này chưa từng gây sự cố, chỉ vì phiên bản luôn dừng ở `0.0.1`.

`scripts/publish-npm-baseline.ts` là script phát hành chạy trên máy local: nó gộp pack và publish vào cùng một tiến trình, cần con người xác thực và thử lại thủ công trên máy, và loại vendor ra khỏi tập phát hành. Nó không thể làm nền tảng cho việc phát hành từ CI, nhưng phần kiểm tra payload tarball và probe sản phẩm đã cài đặt trong đó là những thành phần đã được kiểm chứng.

## Quyết định

### Ba chuỗi độc lập

`packages/`, `vendor/`, `native/` mỗi cái có một chuỗi bump riêng, một lần phát hành riêng, không chia sẻ số phiên bản, không chia sẻ trigger, không chờ đợi lẫn nhau. Phát hành dsh không phát hành lại vendor, phát hành vendor không phát hành lại native.

| Chuỗi | Thành viên | Baseline phiên bản | tag | workflow |
|---|---|---|---|---|
| dsh | `packages/*/*` + `apps/*` (`@deepseek-ai/dsh` và `@deepseek-ai/dsh-web-frontend`) | Toàn bộ họ dùng chung một dòng `0.0.x` với gốc workspace | `dsh-v<phiên bản>` | `release.yml` |
| vendored framework | 9 package trong `vendor/*` | Mỗi package một dòng phiên bản riêng | `vendor-<tên package>-v<phiên bản>` (mỗi package một cái) | `release-vendor.yml` |
| native | `native/landlock-run/packages/*` | Dòng `0.0.x` riêng | `landlock-run-v<phiên bản>` | `landlock-run-release.yml` |

Cả ba nhóm đều phát hành lên scope `@deepseek-ai` trên npmjs.com, và access được phân biệt theo chuỗi chứ không theo scope: framework vendored và package native là `public`, họ dsh là `restricted` ([lý do](2026-08-13-public-vendor-and-native-sequences.md)). Không có đường phát hành nào truyền `--access` — một option duy nhất không thể phục vụ các chuỗi có mức truy cập khác nhau, và sẽ ghi đè lên manifest vốn đang thực sự sở hữu mức truy cập đó.

### Phiên bản được viết vào repo bởi lệnh local, CI chỉ kiểm tra và upload

Mỗi chuỗi có một lệnh bump-and-commit: tính ra phiên bản mục tiêu, ghi vào các manifest liên quan, chạy `pnpm install --lockfile-only`, rồi commit cả manifest lẫn lockfile. Vì vậy, phiên bản phát hành có thể tra được trong repo. Tag được con người gắn thủ công sau khi commit merge vào master; CI không ghi vào repo, cũng không cần quyền ghi.

`release:dsh` nhận `major`, `minor`, `patch` hoặc số phiên bản tường minh, ghi cùng một phiên bản vào toàn họ **và cả gốc workspace** — ràng buộc workspace yêu cầu phiên bản của mỗi thành viên bằng phiên bản gốc, nên gốc mang phiên bản của cả họ, còn kiểm tra ở gốc chấp nhận đoạn prerelease. Những số phiên bản prerelease như `0.0.1-rc.1` trước tiên chạy thử pack, probe sản phẩm đã cài đặt và một lần phát hành riêng tư thực sự; sau đó mới đến số phiên bản chính thức. dist-tag tuân theo phán định sẵn có trong `landlock-run-release.yml`: phiên bản có đoạn prerelease thì gắn `--tag next`, ngược lại vào `latest`.

### vendor: ai sửa thì người đó phát hành, tag chính là sổ cái

Chín package vendor sau khi thêm scope đã tách rời khỏi upstream, nhưng vẫn giữ dòng phiên bản riêng của mình. Phiên bản phát hành lấy giá trị lớn hơn giữa "phiên bản manifest" và "phiên bản phát hành trước đó", rồi tăng patch — bước này đồng thời bỏ đi đoạn prerelease của upstream. Phiên bản phát hành lần đầu:

| Package | Phiên bản upstream | Phiên bản phát hành lần đầu |
|---|---|---|
| `@deepseek-ai/cordis` | 4.0.0-rc.7 | 4.0.1 |
| `@deepseek-ai/cordis-plugin-loader` | 1.0.0-rc.5 | 1.0.1 |
| `@deepseek-ai/cosmokit` | 1.8.1 | 1.8.2 |
| `@deepseek-ai/schemastery` | 3.18.0 | 3.18.1 |
| `@deepseek-ai/cordis-plugin-hmr` | 1.0.15 | 1.0.16 |
| `@deepseek-ai/cordis-plugin-include` | 1.0.4 | 1.0.5 |
| `@deepseek-ai/cordis-plugin-timer` | 1.1.2 | 1.1.3 |
| `@deepseek-ai/cordis-plugin-group` | 1.0.0 | 1.0.1 |
| `@deepseek-ai/cordis-plugin-logger-console` | 1.0.0 | 1.0.1 |

Lấy "phiên bản phát hành trước đó" làm baseline mới chịu được việc đồng bộ lại: sau khi repo này phát hành `4.0.1`, upstream lại đưa phiên bản trở về `4.0.0-rc.8`, nếu chỉ nhìn vào manifest sẽ tính lại ra `4.0.1` và đụng phải phiên bản đã phát hành. Thêm `--prerelease rc.1` sẽ phát hành một phiên bản tổng duyệt: nó vào `--tag next`, và không chiếm dụng số phiên bản chính thức đó — độ ưu tiên của prerelease thấp hơn phiên bản chính thức mà nó đi trước, nên `4.0.1` vẫn đứng sau `4.0.1-rc.1`. Thứ tự này do chính script tự tính, không đọc `git tag --sort=v:refname` — vì git sẽ xếp prerelease trước phiên bản chính thức.

Chỉ phát hành những package đã thay đổi, và tiêu chí xác định thay đổi không đưa vào file trạng thái mới nào: **mỗi package một tag, tag chính là ghi chép "lần phát hành trước dừng ở commit nào".** Bump lấy tag `vendor-<tên package>-v*` mới nhất cho mỗi package, rồi diff với thư mục package đó. Một đường dẫn được tính là khớp nếu: nằm trong `files` của manifest, hoặc npm dù sao cũng sẽ phát hành nó (`package.json`, `README*`, `LICENSE*`), hoặc — khi `files` của package đó chọn `lib/` — nó là input build (`src/**`, `tsconfig*.json`, cấu hình build). Lý do tồn tại của quy tắc cuối cùng là vì sản phẩm build không nằm trong git: nếu thiếu nó, một thay đổi source code thực sự sẽ bị đọc thành "không có gì thay đổi", và lần phát hành tiếp theo sẽ thất bại trên một phiên bản đã đổi byte.

tag chỉ là con trỏ commit, không phải bằng chứng phát hành thành công. Bump sẽ kiểm tra lại với registry xem "phiên bản mà tag mới nhất trỏ tới có thực sự tồn tại không", nếu không tồn tại thì thất bại rõ ràng để con người xử lý — nếu không, một tag được đẩy cho một lần phát hành thất bại sẽ bị đọc thành "đã phát hành", và từ đó vĩnh viễn bỏ qua package đó. Truy vấn package riêng tư cần credential, nên máy chưa xác thực chỉ báo cáo bước kiểm tra này bị bỏ qua, không báo lỗi.

`vendor/cordis` giờ cũng phát hành `src`. Khai báo exports của nó có `"./src/*"`, nếu tarball không có các file này thì tương đương trỏ bên tiêu thụ đến một đường dẫn không tồn tại; còn `files` chỉ chọn sản phẩm build cũng khiến tiêu chí xác định thay đổi không có đường dẫn nào được git track để khớp.

### Chỉ phát hành trên GitHub, trạng thái registry quyết định phát hành gì

Việc phát hành chỉ thực hiện từ GitHub Actions, không có đường phát hành trên máy local. publish không đọc tag, không đọc bất kỳ danh sách nào kiểu "lần phát hành này gồm những package nào", mà so sánh phiên bản của từng tarball đã đóng gói với registry, chia thành ba trạng thái:

| Trạng thái | Xử lý |
|---|---|
| registry chưa có phiên bản này | Phát hành |
| Đã có phiên bản này, và sha512 của tarball bằng `dist.integrity` đã ghi | Bỏ qua: đây là lần chạy lại của cùng một lô sản phẩm |
| Đã có phiên bản này, nhưng integrity khác | Thoát lỗi, báo "nội dung đã đổi nhưng phiên bản chưa bump" |

Trạng thái thứ ba chặn lại việc "sửa code nhưng không bump phiên bản". Hai trạng thái đầu mang lại tính idempotent — chạy lại publish trên cùng một artifact sẽ không phát hành trùng lặp, cũng không cần con người chọn lọc thủ công. Cùng một quy tắc này còn giải quyết mâu thuẫn "một lần phát hành vendor mang nhiều tag, nhưng workflow chỉ có thể trigger từ một ref": workflow không bao giờ suy luận nên phát hành package nào từ tag đã kích hoạt nó.

Cả ba chuỗi đều theo phán định này, kể cả native: nó phát hành qua script riêng của mình, không phải vòng lặp shell — một chuỗi lệnh `npm publish` trần trụi không thể thử lại, registry trả lời "phát hành lại một phiên bản đã tồn tại" bằng thất bại vĩnh viễn, nên chỉ cần thất bại một lần giữa chừng là hết đường.

Hai hành vi của registry quyết định "cách thử một lần phát hành". Các lần ghi cách nhau ít nhất hai giây kèm retry có backoff, vì phát liên tiếp nhiều package sát nhau sẽ vượt quá tốc độ xử lý của chính registry, dẫn đến `E409 Failed to save packument`. Và mỗi lần thử lại đều truy vấn lại registry trước: thất bại được báo ra có thể tương ứng với một lần ghi thực ra đã thành công, nên "phiên bản này hiện tồn tại và integrity khớp với tarball này" được tính là đã phát hành, không phải một phiên bản còn đang chờ đặt lên.

### Tham chiếu nội bộ workspace dùng giao thức `workspace:`

Mọi tham chiếu trỏ đến thành viên workspace đều dùng `workspace:^`, được `pnpm pack` thay thế bằng phạm vi khớp với phiên bản mục tiêu: `peerDependencies` của package anh em theo phiên bản của cả họ, tham chiếu trỏ đến package vendored theo dòng phiên bản riêng của package đó. Package nền tảng Landlock giữ `workspace:*` (phát hành thành phiên bản chính xác), vì package nền tảng và entry của nó phải khớp phiên bản tuyệt đối.

`scripts/check-workspace-constraints.ts` yêu cầu giao thức này, nên package mới không thể viết cứng phạm vi nữa; tương tự, quy tắc invariant companion yêu cầu `@deepseek-ai/dsh-invariants` dùng `workspace:^`.

### Optional dependency tuyệt đối không được load ở phạm vi module

Dependency trong `optionalDependencies`, hoặc peer có `peerDependenciesMeta.<name>.optional`, có thể không tồn tại trong cây đã cài đặt — "có thể không tồn tại" chính là toàn bộ lời hứa của optional. Trong khi import tĩnh được đánh giá (evaluate) ngay khi module bên tiêu thụ được load, nên một package thiếu không còn thể hiện là "khả năng này không dùng được", mà trở thành lỗi load cho toàn bộ code có thể chạy tới module đó. Loại lỗi này chỉ xuất hiện trong "cây cài đặt thiếu package đó" — mà repo này không có bất kỳ test nào dựng ra cây như vậy: cài đặt workspace luôn cài mọi package, nên unit test, snapshot, probe cài đặt gói đều pass, còn bên tiêu thụ đã từ chối peer optional đó lại nhận được package hỏng.

[`verify-optional-dependency-imports`](../../../../scripts/verify-optional-dependency-imports.ts) bịt lỗ hổng này. Nó đọc từ manifest của từng package "package này cho phép ai thiếu", rồi quét các file sẽ được phát hành ra ngoài — `packages/*/*/src/` và `apps/*/src/` — và quét cả hai mặt biên dịch (compilation face). Việc phán định giá trị và kiểu dựa trên Program đã bind, không nhìn vào cách viết import, vì `verbatimModuleSyntax` đang tắt: compiler vốn sẽ loại bỏ import mà binding phân giải ra type, nên `import type {}`, `import {}`, specifier `type` inline, và binding có tên phân giải ra type đều không tạo sản phẩm, đều được cho qua, còn import trần, binding giá trị, re-export dấu sao sẽ được giữ lại, đều bị báo lỗi. Chỉ có phase type mới loại bỏ import: `import defer` vẫn phân giải và liên kết module của nó, chỉ trì hoãn việc đánh giá, nên cổng kiểm tra tính nó là một lần load.

Thông báo lỗi sẽ nêu tên package đó, nêu khai báo nào đánh dấu nó là optional, và đưa ra lối thoát theo thứ tự — đưa nó vào dưới dạng type import (đủ cho nhu cầu declaration merging), hoặc điều chỉnh cách viết để phạm vi module không còn cần package này nữa. `import()` động chỉ trì hoãn thất bại đến lần dùng đầu tiên, nó thuộc về loại bên gọi thực sự cần package này và tự xử lý việc thiếu; nghĩ đến nó thường có nghĩa là dependency này không thực sự optional, nên cổng kiểm tra không đưa nó ra như một giải pháp.

### Đối tượng họ phát hành

Thực thể trong lĩnh vực này là **họ phát hành (release family)**: một nhóm package chia sẻ baseline phiên bản và cách đặt tên tag, có thể phát hành như một khối. Thêm một họ mới tương đương với thêm một subclass và một lane workflow, không đụng đến core.

| Đối tượng | Trách nhiệm |
|---|---|
| `ReleaseFamily` | Danh tính của một họ: phát hiện thành viên, baseline phiên bản, tiền tố tag, quy tắc payload đóng gói, entry đã cài đặt |
| `ReleaseMember` | Một package có thể phát hành: thư mục, tên package, phiên bản, manifest |
| `publishOrder` | Sắp thứ tự tô pô (topological) theo đoạn dependency mà npm sẽ cài cộng khai báo peer, cùng tầng sắp theo tên package; dependency cài đặt tạo vòng lặp thì báo lỗi thay vì sắp thứ tự tùy tiện, cạnh peer nào không sắp được sẽ bị bỏ và nêu tên |
| `pack` | Đóng gói cả họ vào một thư mục và ghi lại thứ tự upload |
| `verify` | Baseline phiên bản của họ, in ra đầy đủ thứ tự phát hành; khi phát hành còn yêu cầu lần chạy này đến từ tag của họ đó, và thành viên có thể phát hành |
| `verify-packed-install` | Cài tarball từ một hoặc nhiều thư mục pack vào một consumer dùng một lần, và chạy thử entry thực thi đã cài đặt |
| `publish` | Ba trạng thái ở trên |
| `process` / `tarball` | Lệnh khởi động, nơi duy nhất đọc tarball đã đóng gói, với entry guard giúp mỗi script đều có thể được import |

Họ dsh áp dụng chính sách payload phát hành của repo (từ chối source code và declaration map). Họ vendored giữ payload upstream, vì các manifest đó export `./src/*`, bỏ `src` sẽ phát hành ra một package có exports map trỏ đến file không tồn tại.

### Hình dạng workflow: pack toàn bộ một lần, rồi publish thống nhất

Job `pack` duyệt qua toàn bộ tập phát hành một lượt, đóng gói mỗi thành viên vào cùng một thư mục, ghi ra thứ tự upload, upload cả thư mục như một artifact; job `publish` tải artifact đó về, phát hành lần lượt theo thứ tự. Tập phát hành là một khối thống nhất — không bao giờ xảy ra tình trạng một nửa package đã lên registry, nửa còn lại vẫn đang build.

`pack` không cần credential, chạy trên mỗi pull request và mỗi lần push lên master, nên một pull request là đủ để chứng minh tập phát hành vẫn có thể đóng gói hoàn chỉnh. `publish` là dispatch thủ công, nằm sau environment `npm-publish` chờ con người phê duyệt, và không build cũng không build lại — nó upload đúng những byte mà pack đã tạo ra. Các lần chạy pack được nhóm theo ref, các pull request chạy song song sẽ không đẩy lẫn nhau; việc nhóm toàn cục nằm ở job publish, vì dist-tag là trạng thái registry dùng chung.

Việc xác minh của dsh cũng cài luôn sản phẩm pack của họ vendored. Package harness khai báo framework vendored là peer, mà những package đó thuộc chuỗi khác, job không có credential không thể lấy từ registry riêng tư — nên `release.yml` đóng gói họ vendored chỉ để xác minh, còn phát hành thì vẫn chỉ phát hành phần của chính nó.

Việc xác minh còn đóng gói một tarball entry Landlock — `dsh-sandbox-local` khai báo nó như `dependencies` thông thường — đồng thời bỏ qua các optional dependency. Các package nền tảng đứng sau những optional đó cần toolchain musl và build riêng cho mỗi kiến trúc, một runner đơn không tạo ra được; mà bên tiêu thụ không cài được chúng cũng phải khởi động được, đây chính là ý nghĩa của "optional" ở đây. Vì vậy việc xác minh đọc tarball theo nội dung thư mục, không đọc theo thứ tự phát hành: một thư mục có thể chỉ chứa những package được đóng gói để thỏa mãn dependency xuyên chuỗi, mà bất kỳ thứ tự phát hành nào cũng không mô tả nó.

### Các thay đổi repo đi kèm lần này

| Mục | Nội dung |
|---|---|
| Manifest tập phát hành | Bỏ `private: true`; thêm `publishConfig.access` theo từng chuỗi và `repository` kèm `directory` riêng |
| Ranh giới tập phát hành | Toàn bộ thành viên của `packages/*/*`, `apps/*`, `vendor/*` |
| Giao thức dependency | Tham chiếu nội bộ workspace dùng `workspace:^`, được buộc thực thi bởi `check-workspace-constraints.ts` và quy tắc invariant companion |
| `AGENTS.md` gốc | Quy ước "package vendored là `private: true`" không còn đúng |
| `vendor/README.md` | Ghi lại thay đổi cục bộ "thêm `src` vào `files` của `cordis`" |
| 3 package native | `publishConfig.access: public`, và workflow của nó không truyền `--access` |

### Quan hệ với đề xuất trước đó

Agent Note này thay thế phương án phiên bản và ranh giới tập phát hành trong [Phát hành npm baseline lấy sản phẩm build làm trung tâm](../../proposed/process/2026-08-04-artifact-first-npm-baseline-publication.md): phiên bản prerelease `<base>-<timestamp>-<SHA rút gọn>` và dist-tag `dev-<base>` trong bài đó không còn được dùng, vendor cũng không còn bị loại khỏi tập phát hành. Phần thống nhất giữa hai bài được giữ lại: tách pack và publish, publish chỉ tiêu thụ tarball đã được xác minh, payload và probe sau khi cài đặt đóng vai trò cổng phát hành.

## Các phương án thay thế từng cân nhắc

**Số phiên bản `<base>-<timestamp>-<SHA rút gọn>`.** Từng dự định dùng cho phát hành dev liên tục. Nó xung đột với việc "giữ phiên bản phát hành trong repo": phiên bản nhúng SHA commit, mà việc ghi phiên bản lại tạo ra commit mới, nên SHA chỉ có thể trỏ đến commit cha đã được phát hành, chuỗi này phải dựa vào quy ước để giải thích. Sau khi chuyển sang số phiên bản, các số prerelease như `0.0.1-rc.1` đã bao phủ "xác minh trước rồi mới phát hành chính thức".

**Dùng sổ cái `vendor/published.json` ghi phiên bản và commit đã phát hành của từng package.** Đây là thiết kế trước phương án tag. Nó thêm một file trạng thái phải luôn khớp với registry, không được lệch; per-package tag cung cấp cùng một con trỏ commit, mà tag vốn dĩ phải được gắn, không đưa vào thêm một chỗ trạng thái thứ hai.

**Tag cấp sự kiện (`vendor-r1`, `vendor-r2`).** Chuẩn bị cho "một sự kiện phát hành mang nhiều phiên bản package". Vì registry đã quyết định phát hành gì, workflow không còn cần suy ra tập hợp từ tag, per-package tag là đủ, và mỗi tag mang theo phiên bản thực của package đó.

**Gộp chín package vendored vào một dòng phiên bản `4.0.x` thống nhất.** Sẽ bớt được việc phát hiện thay đổi, nhưng cosmokit sẽ nhảy từ `1.8.1` lên `4.0.1`, mất đi huyết thống upstream; các phạm vi upstream nội bộ trong chín package (kiểu `^1.8.1`) sẽ lập tức không còn khớp, phải viết lại manifest vendored.

**Mỗi lần phát hành vendor tăng patch+1 cho toàn bộ chín package, không phát hiện thay đổi.** Cơ chế đơn giản nhất, cái giá là package có nội dung giống hệt byte với phiên bản trước cũng nhận số phiên bản mới. Tag ép chi phí phát hiện thay đổi xuống còn "đọc một tag, chạy một lần diff", không đáng để làm phiên bản tăng ảo cho việc này.

**Chỉ dựa vào số phiên bản để phán định "đã phát hành chưa", không so sánh nội dung.** Quy trình tham chiếu hoàn toàn không truy vấn registry: publish upload từng cái, phiên bản trùng lặp bị npm từ chối. Chỉ bỏ qua theo số phiên bản sẽ để lọt "sửa code mà không bump", mà đây là lỗi duy nhất âm thầm để lại byte cũ trên registry. Cái giá là phải thêm một lần truy vấn registry và phụ thuộc vào khả năng tái tạo build (build reproducibility).

**Chỉ xác minh cài đặt sau khi đóng gói, không khởi động registry local.** Quy trình tham chiếu giải nén tarball thành một cây, chạy bằng Node thông thường, bước này bỏ qua việc phân giải phạm vi phiên bản. Từng đề xuất khởi động registry local trong CI để bù lớp này, đã bị từ chối: tính đúng đắn của sản phẩm đã được test hiện có bao phủ, đường phát hành được tổng duyệt (dress rehearsal) trên master bao phủ, còn pull request chỉ cần chứng minh tập phát hành có thể đóng gói được. Cài đặt bằng specifier `file:` vẫn đi qua một lượt phân giải phạm vi cho mỗi dependency nội bộ.

**Chọn một phần package để phát hành theo closure của entry.** Từ `@deepseek-ai/dsh` và `@deepseek-ai/dsh-web-frontend` bò theo `dependencies` sẽ được 156 package, ít hơn toàn bộ 61 package. Nhưng plugin của repo này được Loader mount theo tên trong `cordis.yml`, không phải được import: `vendor/cordis-plugin-group` và `vendor/cordis-plugin-logger-console` nằm ngoài closure dependency, nhưng lại cần thiết ở runtime. Hình thức thất bại của việc chọn theo dependency code là "bên tiêu thụ cài xong không chạy được", và còn phải liên tục chứng minh thêm "không bỏ sót mục mount nào". Package thêm ra trong scope riêng tư không nhìn thấy được từ bên ngoài tổ chức. `python/`, `examples/` gốc, `docs/` và `website/` không phải thành viên.

**Mở rộng trên `scripts/publish-npm-baseline.ts`.** Đây là script phát hành trên máy local, gộp pack và publish vào cùng một tiến trình, ngược lại với việc "pack không cần credential, publish được bảo vệ". Các thành phần đã được xác minh của nó — kiểm tra payload và probe sản phẩm đã cài đặt — được tái sử dụng, để tránh `pnpm run duplication` báo trùng lặp.

**Một workflow dùng input `family` để chọn chuỗi.** Nhét hai mô hình phiên bản vào một file sẽ khiến concurrency group, tiền tố tag, điều kiện trigger tổng duyệt đều rẽ nhánh thành biểu thức điều kiện. Mỗi họ một file thì ngắn hơn và dễ đọc hơn.

**Viết lại phạm vi dependency vào thời điểm phát hành.** So với giao thức, logic viết lại chỉ được thực thi trong CI, `pnpm install` trên máy local không thể kiểm tra nó có đúng hay không, và mỗi lần phát hành lại phải làm lại việc này.

**Thực hiện bump trong CI rồi đẩy phiên bản về repo.** Cần cấp quyền ghi repo cho workflow, và commit phiên bản trên nhánh phát hành sẽ cạnh tranh với commit của con người. Bump và commit vẫn để ở local, CI chỉ kiểm tra và upload.

## Hệ quả

Script phát hành là các module có thể import kèm entry guard, các phán định của nó đều có unit test bao phủ: cách đặt tên tag, thứ tự phát hành và báo cáo vòng lặp, tính toán baseline phiên bản, tiêu chí thay đổi payload, và chính sách payload của từng họ. Hai khiếm khuyết mà bản đầu tiên mang theo — lệnh publish thực thi lệnh pack ngay khi import, tiêu chí thay đổi mù trước thay đổi source code của `vendor/cordis` — chính là loại lỗi mà các test này có thể bắt được ở đúng mối nối tương ứng.

Một pull request sẽ chạy đầy đủ pack (không cần credential) cho cả hai chuỗi, và cài tarball dsh đã đóng gói vào một consumer dùng một lần, chạy `dsh --version` bằng Node thông thường. Probe này cố tình chỉ có một lệnh duy nhất: nó chứng minh `files` đã chọn ra payload đầy đủ, phạm vi được phát hành ra ngoài có thể phân giải được, không liên quan đến bất kỳ hành vi tương tác nào.

Cái giá phải trả:

- **Tag có thể lệch khỏi registry.** Tag được đẩy cho một lần phát hành thất bại bị chặn bởi bước kiểm tra registry của bump, nhưng chỉ ở nơi có credential; máy chưa xác thực chỉ báo cáo bước kiểm tra này bị bỏ qua.
- **Tiêu chí thay đổi phụ thuộc vào việc tag có nhìn thấy được.** Clone nông (shallow clone) hoặc chưa fetch tag sẽ làm tiêu chí của họ vendored thoái hóa thành "toàn bộ đều là phát hành lần đầu". `fetch-depth: 0` là tiền đề, không phải tối ưu hóa.
- **Việc viết lại giao thức chạm vào 1504 khai báo dependency.** Nó không thay đổi cách phân giải trên máy local (pnpm vốn đã phân giải từ workspace), nhưng thay đổi cách viết phạm vi được phát hành ra ngoài.
- **Package riêng tư cần credential mới cài được.** Bất kỳ bên tiêu thụ nào — CI, e2e sandbox, người dùng bên ngoài — đều phải có credential scope, cả ba package Landlock cũng nằm trong đó; chúng chưa từng được phát hành, nên không cắt đứt đường cài đặt ẩn danh sẵn có.
- **`repository` trỏ đến tổ chức khác với tổ chức chạy workflow.** Phát hành bằng token không bị ảnh hưởng; npm provenance (OIDC) yêu cầu hai bên khớp nhau, khi đó phải đổi `repository` trỏ sang, hoặc phát hành từ tổ chức mà nó trỏ tới.
- **Khả năng tái tạo byte chỉ là giả định, chưa được kiểm chứng thực tế.** Trạng thái "integrity giống nhau thì bỏ qua" dựa trên giả định "cùng một commit pack hai lần cho ra byte giống nhau". Hiện chưa có gì đo lường điều này: nếu build nhúng đường dẫn tuyệt đối hoặc thời gian, chạy lại sẽ báo thất bại nhầm. Cần kiểm chứng thực tế trước lần phát hành đầu tiên có thể bị chạy lại, nếu không đúng thì lùi về so sánh hash nội dung từng file trong tarball.
- **Chạy lại publish với artifact cũ hơn sẽ kéo `latest` về phiên bản cũ.** Việc phát hành được quyết định theo phiên bản, nên phát lại một lô cũ hơn sau một phiên bản mới hơn sẽ khiến dist-tag ổn định lại trỏ về phiên bản cũ. Bản tổng duyệt dùng phiên bản prerelease, nó không bao giờ chiếm `latest`.
- **Lần phát hành đầu tiên là một bước lớn.** Chín package vendored cùng toàn bộ tập dsh phát hành cùng một lúc, bất kỳ khiếm khuyết payload nào cũng sẽ lộ ra tập trung trong cùng một lần phát hành — đây chính là lý do để dùng phiên bản prerelease chạy thử toàn bộ chuỗi trước.
