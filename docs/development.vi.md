# Hướng dẫn phát triển

[English](development.md) | Tiếng Việt

Hướng dẫn thiết lập dẫn dắt người đóng góp mới từ bước chuẩn bị điều kiện tiên quyết cho tới khi thư mục checkout vượt qua các kiểm tra. Phần tham khảo dành cho người đóng góp ở sau giới thiệu bố cục repo, quy trình làm việc hằng ngày và cách CI được tổ chức. Căn cứ thiết kế và chi tiết hiện thực thuộc về các Agent Note và script được liên kết.

## Hướng dẫn thiết lập

### Điều kiện tiên quyết

- Node.js hỗ trợ 22.19+ và 24+. CI bao phủ 22.19, 24 và 26; xem [Agent Note về mức sàn engine Node](../.agents/notes/implemented/process/2026-07-06-node-engine-floor.md).
- pnpm với Corepack đã bật. Repo ghim `pnpm@11.7.0` trong `package.json`; nếu `pnpm --version` không phân giải được qua Corepack, hãy chạy `corepack enable` trước.
- Git 2.26 trở lên; thiết lập hook bật phần mở rộng cấu hình riêng cho worktree của Git.
- Tùy chọn: một DeepSeek API key, dùng cho các demo agent (tác tử) tự động Web, headless và ACP (Agent Client Protocol) cũng như các bài kiểm thử e2e gọi API thật.

### Thiết lập lần đầu

Cài đặt phụ thuộc tại thư mục gốc của repo:

```sh
pnpm install
```

Quá trình cài đặt còn cấu hình các hook Lefthook cục bộ theo worktree và driver hợp nhất Git `dsh-translation-pairing` thông qua `scripts/install-lefthook.mjs`. [Agent Note về hook cục bộ theo worktree](../.agents/notes/implemented/process/2026-07-27-worktree-local-lefthook.md) phụ trách quy ước an toàn cho đường dẫn hook; [Agent Note về hợp nhất cặp bản dịch tự động](../.agents/notes/implemented/process/2026-08-08-automatic-translation-pairing-merges.md) phụ trách driver hợp nhất.

Nếu phụ thuộc được khôi phục từ cache hoặc `postinstall` bị bỏ qua khiến một trong các tích hợp bị thiếu, hãy cài thủ công:

```sh
node scripts/install-lefthook.mjs
```

Nếu script bao bọc từ chối cấu hình Git hiện có hoặc báo có khóa cũ, hãy làm theo phần chẩn đoán của nó và các Agent Note được liên kết, đừng đoán mò mà sửa metadata của worktree. Sau khi di chuyển thư mục checkout, hãy chạy lại script bao bọc để sinh lại các đường dẫn thuộc sở hữu của nó.

Sau khi clone mới, hãy chạy kiểm tra kiểu một lần trước tiên:

```sh
pnpm run typecheck
```

`pnpm run typecheck` thoát thành công nghĩa là việc thiết lập đã hoàn tất.

## Tham khảo dành cho người đóng góp

### Bố cục dự án TypeScript

Repo dùng hai aggregate Host và Client cô lập lẫn nhau. Package thông thường chỉ đăng ký vào một trong hai aggregate; package Host vào `tsconfig.host.json`, package Client vào `tsconfig.client.json`.

| Tệp | Vai trò | Có tạo thành program không? |
|---|---|---|
| `tsconfig.json` | Gốc solution: `extends` base, `files: []`, tham chiếu cả hai aggregate. Đây là điểm vào để tsserver phát hiện, đồng thời là điểm vào khi thực thi tường minh toàn bộ đồ thị Project Reference; phần `paths` được kế thừa đóng vai trò cấu hình phân giải khi tsx chạy `examples/` và `scripts/`. | Không |
| `tsconfig.host.json` | Aggregate Host: các package Host, ví dụ, kiểm thử, script và website, cùng project đặc thù Host của `api/remotes`. | Có |
| `tsconfig.client.json` | Aggregate Client: các package `packages/client/*` và kiểm thử của chúng, `apps/web`, cùng project đặc thù Client của `api/remotes`. | Có |
| `tsconfig.base.json` | compilerOptions dùng chung và ánh xạ `paths` tới mã nguồn. Đồng thời là mặt tiền phân giải mà các cấu hình vitest trỏ vite-tsconfig-paths tới: nó không có `include`, nên `paths` của nó áp dụng cho mọi importer. | Không |
| `tsconfig.base.client.json` | Thiết lập biên dịch cho trình duyệt (`jsx`, DOM lib, `types: []`), được aggregate Client và từng package `packages/client/*` extends. | Không |

Host và Client giữ hai aggregate program vì hai phía hợp nhất khai báo interface `Context` của cordis bằng những service khác nhau dưới cùng một khóa; một program duy nhất thấy cả hai phép hợp nhất sẽ báo xung đột. Xung đột này chỉ tồn tại bên trong `ts.Program` — việc phân giải module không bao giờ kích hoạt nó — nên solution có thể tham chiếu đồng thời cả hai aggregate, và một mặt tiền paths cũng có thể trải qua cả hai phía. Từ đó rút ra ba kỷ luật:

- `tsconfig.base.json` không bao giờ được thêm `include` hay `files`: chúng sẽ rò rỉ vào mọi project package extends nó và thu hẹp phạm vi khớp toàn bộ của mặt tiền.
- Script dựng `ts.Program` toàn repo phải lấy tường minh `tsconfig.host.json` hoặc `tsconfig.client.json` làm hạt giống — không bao giờ lấy gốc solution làm hạt giống, vì làm phẳng hai aggregate vào một program sẽ đụng xung đột hợp nhất `Context`.
- Package mới chỉ đăng ký vào một aggregate. Việc một package vừa có điểm vào Node loader vừa có điểm vào browser không phải là lý do để tách; cả hai sản phẩm runtime của một plugin Client thông thường đều được sinh ra ở giai đoạn build Client.

`api/remotes` là ngoại lệ duy nhất trong repo có tsconfig tách Host/Client. Điểm vào Host của nó bắt buộc phải nằm trong đồ thị Typert của Host, còn điểm vào Client thì import khai báo `/remote` vốn chỉ được sinh bởi tsdown của Host, vì vậy `tsconfig.json` ở gốc package này chỉ đóng vai trò solution, còn hai aggregate và các bên tiêu thụ trực tiếp lần lượt tham chiếu `tsconfig.host.json` hoặc `tsconfig.client.json`. Cổng kiểm tra `constraints` của workspace duyệt đồ thị Project Reference tiếp cận được và kiểm tra theo compiler face của chính từng project được tham chiếu: mục tiêu chỉ có một cấu hình thì face nào cũng tham chiếu được, còn mục tiêu tách cấu hình thì bắt buộc phải tham chiếu leaf khớp, không được tham chiếu gốc solution hay leaf phía bên kia; cổng kiểm tra này tự phát hiện package tách theo dấu hiệu "cả hai cấu hình leaf cùng tồn tại", nên package mới tách sẽ tự động nằm trong phạm vi quản lý. Đừng nhân rộng cấu trúc này sang các package khác; [README của `api-remotes`](../packages/api/remotes/README.md) giải thích việc tách Host/Client và thứ tự build.

Build ở gốc được sắp thứ tự theo phụ thuộc sinh mã:

```sh
tsc -b tsconfig.host.json
tsdown --env.DSH_BUILD_FACE host
tsc -b tsconfig.client.json
tsdown --env.DSH_BUILD_FACE client
pnpm run build:web
```

Cả hai lần chạy tsdown đều dùng cùng một bộ mẫu khớp workspace đầy đủ, không quét sản phẩm build để phát hiện package Client, cũng không duy trì bảng lọc package Host/Client. Cấu hình tsdown trong package quyết định điểm vào của giai đoạn hiện tại dựa trên `DSH_BUILD_FACE`: plugin Client thông thường sinh đồng thời Node loader và bundle browser ở giai đoạn Client; `api-remotes` thì sinh sớm điểm vào Host qua `hostPhase: true`, rồi ở giai đoạn Client chỉ sinh bundle browser. tsdown chỉ tiêu thụ JavaScript do tsc phía trước phát ra trong `lib/types`.

Typert chỉ chạy trong tsdown của Host với hạt giống là `tsconfig.host.json`. Nó phân tích kiểu của Host rồi sinh sản phẩm phản chiếu của Host cùng phép chiếu Remote Host-for-Client; tsdown của Client không khởi động Typert. Do đó `pnpm run typecheck` thực thi trọn giai đoạn lib của Host trước, rồi mới chạy tsc của Client; `pnpm run build` tiếp tục thực thi tsdown của Client và build Web. Bản ghi quyết định về thứ tự này nằm ở [Note về build theo hợp đồng sinh mã của API Remotes](../.agents/notes/implemented/process/2026-08-08-api-remotes-generated-contract-build.md).

Phân tích tĩnh và kiểm thử phân giải các import workspace về `src` thông qua ánh xạ `paths` của base, và bắt buộc phải vượt qua trên cây sạch; các cổng kiểm tra tiêu thụ sản phẩm build `lib/` phải khai báo tường minh phụ thuộc đó. Các khai báo Remote Host-for-Client được sinh ra là ngoại lệ có chủ ý: các lệnh công khai `typecheck`, `lint` và `doc-typecheck` sẽ sinh những khai báo này trước, còn script nội bộ `*:contracts-ready` thì giả định rằng lệnh công khai hoặc cổng kiểm tra điều phối gọi nó đã phụ thuộc vào giai đoạn sinh hợp đồng Typert hoặc một bản build đầy đủ. Thiết lập hai aggregate xem [Note về gốc solution](../.agents/notes/implemented/process/2026-07-22-tsconfig-solution-root-two-aggregates.md), trách nhiệm phát mã theo lối tsc-first xem [Note ts-build-config](../.agents/notes/implemented/process/2026-06-17-ts-build-config.md), quy ước chuẩn bị cho cổng kiểm tra xem [Agent Note về Typert Remote](../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.md).

Service nghiệp vụ khai báo các phương thức có thể gọi ở Host bằng `@Remote` hoặc `@RemoteScope`; build Host sinh ra kiểu Host-for-Client và phần đóng góp lúc chạy, còn bộ kết hợp `api-remotes` phía Client nạp các đóng góp này và gắn chúng vào `ctx.remote` cùng namespace `agentCtx.remote` theo phạm vi. Sản phẩm sinh mã ở cả hai phía, quan hệ lắp ráp, phương án dự phòng phát triển SRC và thứ tự build Web xem [API Gateway](api-gateway.md).

Nếu kiểm tra cục bộ liên quan cần dùng tới sản phẩm package sau khi build, hãy build một lần trước:

```sh
pnpm run build
```

`pnpm run hygiene` bao gồm `publint` (kiểm tra điểm vào của package bằng các tệp `lib/*.js` đã build) và `verify-node-next-types` (kiểm tra các tệp khai báo đã build bằng một bên tiêu thụ NodeNext tạm thời). Worktree mới chưa có JS đã đóng gói và tệp khai báo cho tới khi `pnpm run build` chạy; commit và push thông thường không cần build, trừ khi kiểm tra được chọn có dùng tới các sản phẩm đó.

### Biến môi trường

Bộ chuyển tiếp DeepSeek thật và các demo agent cần khóa sẽ đọc thông tin xác thực từ biến môi trường hoặc từ tệp `.env` bị gitignore ở thư mục gốc repo:

```sh
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://... # optional
```

`DEEPSEEK_BASE_URL` là tùy chọn, mặc định trỏ tới API công khai. Đừng commit thông tin xác thực thật. Khi `DEEPSEEK_API_KEY` không được đặt, bộ kiểm thử e2e gọi API thật sẽ tự bỏ qua.

### Tích hợp Git

Khi tệp ở cả hai ngôn ngữ đều dùng chính sách văn bản mặc định của Git và hợp nhất sạch, driver hợp nhất cặp bản dịch sẽ suy ra bản ghi `.i18n.yaml` bị xung đột từ các blob tài liệu cặp đôi ở phía tổ tiên, phía hiện tại và phía kia đã được xác nhận. Khi tài liệu cặp đôi xảy ra xung đột, tồn tại cấu hình hợp nhất phi văn bản hoặc bản ghi không hợp lệ, nó sẽ từ chối xử lý và giữ nguyên xung đột; nếu quá trình hợp nhất đã dừng vì xung đột, hãy chạy `pnpm run resolve-translation-pairing-conflicts`, lệnh này sẽ đưa vào vùng staging mọi bản ghi cặp đôi có thể sinh an toàn; nếu vẫn còn xung đột cặp đôi khác cần xử lý thủ công, nó thoát với trạng thái khác không. [Quy ước tài liệu song ngữ](i18n/README.md#the-pairing-contract) liệt kê chính xác những tệp và trạng thái mà driver này chấp nhận.

Trước khi phát hành cấu hình worktree, script cài đặt sẽ dò chính xác điểm vào driver Node/tsx. Nếu runtime đó về sau không còn khả dụng, bộ khởi động không phụ thuộc Node sẽ ghi kết quả hợp nhất văn bản thông thường của Git, để tệp đi kèm ở trạng thái chưa giải quyết và in ra đường dẫn khôi phục; hãy khôi phục phụ thuộc rồi chạy `pnpm run resolve-translation-pairing-conflicts`, hoặc chạy `git merge --abort`. Nếu `pre-merge-commit` từ chối một lần hợp nhất vốn có thể hoàn tất sạch, Git sẽ để toàn bộ kết quả trong vùng staging nhưng không tạo commit; hãy sửa lỗi rồi chạy `git commit`, hoặc hủy bỏ việc hợp nhất. Trạng thái chính xác của index và `MERGE_HEAD` được ghi lại bởi [Agent Note về hợp nhất cặp bản dịch tự động](../.agents/notes/implemented/process/2026-08-08-automatic-translation-pairing-merges.md#failure-contract).

lefthook được cấu hình trong `lefthook.yml`, đóng vai trò điểm kiểm tra cục bộ nhanh:

- `pre-commit` kiểm tra bản ghi cặp đôi đã staging đối chiếu với blob tài liệu cặp đôi đã staging, dùng cấu hình `.oxlintrc.staged.json` không nạp project để kiểm tra tệp đã staging và áp dụng bản sửa của Oxlint qua một lần thử lại có giới hạn, sinh lại `THIRD_PARTY_NOTICES.md` khi tệp đã staging là đầu vào của tệp đó, sau đó kiểm tra lỗi khoảng trắng trong diff đã staging và chạy bộ bảo vệ vendor manifest (bản kê metadata);
- `pre-merge-commit` thực hiện đúng những kiểm tra cặp đôi lấy index làm chuẩn đó trước khi Git tạo commit hợp nhất tự động;
- `pre-push` chạy `pnpm run typecheck`; lệnh này hoàn tất trọn giai đoạn lib của Host bao gồm việc sinh hợp đồng Typert trước, rồi mới chạy kiểm tra TypeScript của Client.

Bộ bảo vệ vendor manifest kiểm tra xem thay đổi dưới `vendor/*/src` có được staging cùng với bản cập nhật manifest `vendor/README.md` tương ứng hay không. Hãy đọc `vendor/README.md` trước khi sửa mã vendor.

Ngoài phần kiểm tra bản ghi đã staging trong phạm vi giới hạn, các hook này cố ý không chạy kiểm thử, snapshot, kiểm tra tài liệu, build hay `hygiene`. Người đóng góp chỉ chạy một lần [những kiểm tra liên quan tới hành vi đã thay đổi](../AGENTS.md#run-relevant-checks-locally); CI chịu trách nhiệm cổng kiểm tra độ phủ toàn phần, kiểm thử khói trên sản phẩm build, cùng ma trận tương thích Node 22.19, 24 và 26.

Người đóng góp có thể chọn chạy `pnpm run check:all` để thực thi bộ cổng kiểm tra cục bộ toàn diện. Lệnh này độc lập với hook Git và cũng không phải là chỉ thị dành cho agent.

### Cổng kiểm tra CI

[Workflow CI](../.github/workflows/ci.yml) không cần khóa gom các cổng kiểm tra độc lập vào một số lane thô, và chạy một nhóm kiểm tra tương thích nhỏ hơn trên các phiên bản Node được hỗ trợ. Bên tiêu thụ sản phẩm chờ một lần build trong lane của mình. Một workflow gọi API thật riêng biệt chạy `pnpm run test:e2e` theo giới hạn worker được cấu hình của nó. Danh sách cổng kiểm tra và job hiện hành lấy [scripts/run-gates.ts](../scripts/run-gates.ts) cùng tệp workflow làm chuẩn.

### Lệnh dùng hằng ngày

[Hướng dẫn cho người đóng góp](../AGENTS.md#commands) ở thư mục gốc tóm lược các lệnh thường dùng, còn [`package.json`](../package.json) và [scripts/run-gates.ts](../scripts/run-gates.ts) phụ trách danh sách script và cổng kiểm tra hiện hành. Hãy chọn bộ kiểm tra nhỏ nhất bao phủ bề mặt đã thay đổi. Thay đổi tài liệu thì dùng `pnpm run doc-sync`; thay đổi hành vi công khai của package còn cần cập nhật README hoặc JSDoc tương ứng, còn các kiểm tra dựa trên sản phẩm build thì cần chạy `pnpm run build` trước.

### Demo

Trước khi chạy các demo này từ mã nguồn đã checkout, hãy thực thi build repo riêng:

```sh
pnpm run build
```

Coding agent chạy headless một lần cần `DEEPSEEK_API_KEY` từ biến môi trường hoặc từ `.env` ở gốc repo:

```sh
pnpm dsh --profile headless "summarize this workspace"
```

Demo cordis tự quy chiếu có thể kiểm tra và sửa đổi runtime plugin đang chạy của chính nó, và cần cùng thông tin xác thực đó (mặc định `web`, cũng có thể dùng `acp`):

```sh
pnpm run demo:cordis
```

Máy chủ tự động hóa ACP cung cấp phiên agent hoàn toàn mới qua JSON-RPC stdio, cũng cần `DEEPSEEK_API_KEY`:

```sh
pnpm run demo:acp
```

### Nhãn TODO

Hãy dùng một trong ba nhãn chú thích sau để đánh dấu vấn đề đã biết trong mã, xếp theo mức độ khẩn cấp:

- `FIXME`: vấn đề phải chặn việc phát hành phiên bản mới. Trừ khi người đánh giá đồng ý rõ ràng rằng thay đổi đó có thể merge, bản phát hành không được chứa `FIXME` chưa giải quyết;
- `TODO`: vấn đề nên sửa sớm nhất có thể, cứ có nguồn lực là xử lý;
- `XXX`: vấn đề có lẽ một ngày nào đó sẽ sửa, ưu tiên thấp nhất, không cam kết gì.

Hãy chọn nhãn khớp với mức độ khẩn cấp, để người đọc mã phân biệt được ngay đâu là "chặn phát hành" và đâu là "rảnh thì tính".

### Định nghĩa kiểu chép nguyên văn (`ts type-equiv`)

Các trang [subsystem](subsystems/README.md) dán kèm cả khai báo tương đương mã nguồn lẫn JSDoc gốc của nó, để người đọc thấy được định nghĩa kiểu chính xác và quy ước trong mã nguồn. Để nội dung dán không trôi lệch khi mã nguồn thay đổi, hãy rào nó bằng ` ```ts type-equiv ` (thay vì ` ```ts `) và đăng ký tệp nguồn cùng ký hiệu mà nó phản chiếu trong `scripts/type-equiv.manifest.json`:

```json
{ "doc": "docs/subsystems/session.md", "symbol": "SessionEvent", "source": "packages/core/session/src/types.ts" }
```

`pnpm run verify-type-equiv` (một mắt xích của `doc-sync`) sau đó dùng trình phân tích cú pháp TypeScript để trích khai báo của ký hiệu đó cùng JSDoc đi kèm từ mã nguồn, rồi khẳng định khối mã khớp cả hai. Với các lớp không nên đưa phần thân hiện thực vào tài liệu, hãy dùng ` ```ts public-api ` và đặt `"projection": "public-api"`; phép chiếu mà cổng kiểm tra dùng sẽ giữ lại trường công khai, hàm khởi tạo, accessor, phương thức cùng JSDoc gốc của lớp và thành viên, đồng thời lược bỏ phần thân hiện thực và các thành viên private hoặc protected. Việc so sánh bỏ qua khoảng trắng và chú thích không phải JSDoc, nhưng yêu cầu giữ lại mọi JSDoc gốc (bao gồm tài liệu của thành viên), để người đọc thấy đồng thời quy ước trong mã nguồn và định nghĩa kiểu chính xác. Cổng kiểm tra này ép tương ứng 1:1 giữa khối chính và mục manifest theo tài liệu, ký hiệu và phép chiếu; chỉ khi toàn bộ chuỗi rào được theo dõi của khối `.zh.md` cặp đôi giống hệt từng byte và cùng thứ tự với tệp anh em không hậu tố thì nó mới dùng lại mục của tệp kia. `doc-typecheck` áp dụng cùng quy tắc suy dẫn đó cho các rào biên dịch được, đồng thời bỏ qua việc biên dịch hai loại rào tương đương mã nguồn và loại chúng khỏi phép tính tỷ lệ opt-out. Khi bạn thay đổi một khai báo kiểu đã được ghi nhận hoặc JSDoc của nó, cổng kiểm tra sẽ thất bại cho tới khi bạn cập nhật nội dung dán; khi bạn thêm hoặc bớt một khối chính, hãy cập nhật manifest trong cùng thay đổi đó.
