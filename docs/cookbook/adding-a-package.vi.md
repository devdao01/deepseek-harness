# Thực hành: Thêm package workspace

[English](adding-a-package.md) | Tiếng Việt

Danh sách kiểm tra từng tệp để tạo mới một package `@deepseek-ai/dsh-<name>`. Danh sách này được kiểm chứng dựa trên hai package mẫu là bash và adapter; nếu danh sách khác với mẫu, hãy sửa lại tại đây.

## 1. Tạo package

```
packages/<group>/<pkg>/
  package.json     # copy from packages/core/tools, adjust name/description/deps
  tsconfig.json    # extends ../../../tsconfig.base.json, rootDir src,
                   # outDir lib/types, references: ../../../vendor/cosmokit,
                   # ../../../vendor/cordis (+ ../../../vendor/schemastery if
                   # you use Config, + ../../<group>/<dep> for each dsh dep)
  src/index.ts     # service default export or plugin (name/inject/apply/Config)
  README.md        # service API, events, extension points, design notes,
                   # + gated Model Experience context blocks or short form
                   # + the gated "Known Limitations and Deferred Work" section
                   # (or a whitelist entry in scripts/verify-package-readme-limitations.ts)
```

Khi đã có một nhóm phù hợp với vai trò của package, hãy chọn nhóm đó (`core`, `llm`, `bash`, `compact`, `subagent`, `todo`, `session-persistence`, `ui`, `util`, hoặc `support`). Được phép tạo nhóm mới, nhưng nhóm chỉ là một container thuần túy: không có `package.json`, không có file mã nguồn, package vẫn nằm chính xác ở cấp ngay bên dưới nó.

Các bất biến của package.json (được `pnpm run constraints` / `scripts/check-workspace-constraints.ts` cưỡng chế thực thi): `private: true`, `version` khớp với `package.json` gốc, `type: module`, `main: "lib/index.js"`, `types: "lib/types/index.d.ts"`, `exports["."].types: "./lib/types/index.d.ts"`, `exports["."].default: "./lib/index.js"`, `@deepseek-ai/cordis` phải xuất hiện đồng thời trong peerDependencies và devDependencies (cùng phạm vi phiên bản). Mỗi peer dependency dsh đều phải được mirror trong devDependencies. `@deepseek-ai/schemastery` đặt trong `dependencies` (vì nó là bộ kiểm tra runtime), nhất quán với agent-loop. Danh sách `files` chỉ chứa chính xác `lib/index.js`, `lib/invariant.js`, `lib/types/**/*.d.ts` cùng các sản phẩm runtime riêng của package đã được cổng gác chấp thuận; nếu export runtime của package trỏ vào cây output, phải bổ sung thêm `lib/types/**/*.js`. Không phát hành `src`, declaration map, JS map, hay declaration file gốc lỗi thời. Package ứng dụng CLI (giao diện dòng lệnh) có `bin` cần đặt `lib/bin.js` ngay sau `lib/index.js` trong `files`.

Import tương đối trong package dùng hậu tố `.ts` tường minh trong mã nguồn (ví dụ `export * from './types.ts'`). Compiler sẽ viết lại thành `.js` trong JS đầu ra, và giữ nguyên hậu tố `.ts` tường minh trong declaration file; các bên tiêu thụ TypeScript NodeNext/Node16 chuẩn sẽ phân giải nó tới tệp `.d.ts` cùng thư mục.

## 2. Đăng ký trong cấu hình gốc

| Tệp | Thay đổi |
|---|---|
| `tsconfig.base.json` | Nhóm đã có sẵn thì không cần sửa; nhóm mới cần thêm đường dẫn ứng viên `./packages/<group>/*/src` cho ký tự đại diện `@deepseek-ai/dsh-*` |
| `tsconfig.host.json` (package Host) hoặc `tsconfig.client.json` (package Client) | Thêm `{ "path": "./packages/<group>/<pkg>" }` vào `references` — package thông thường chỉ thuộc chính xác một aggregate, không bao giờ thêm cả hai. `api/remotes` dùng cách tách riêng cho repo này do có phụ thuộc thứ tự giữa quy ước sinh của Host và quy ước tiêu thụ của Client, package mới không được bắt chước theo cách này ([bố cục](../development.md#typescript-project-layout)) |
| `knip.json` | Chỉ cần khi package có điểm vào mà cơ chế phát hiện của repo chưa bao phủ |

Package `packages/client/*` đổi thành extends `tsconfig.base.client.json` (thay vì `tsconfig.base.json`); package plugin client còn cần khai báo `dsh.client` trong package.json, export `./client`, và gọi preset tsdown dùng chung (`packages/client/tsdown.client.ts`) — phía client xem [packages/client/AGENTS.md](../../packages/client/AGENTS.md).

Các nội dung sau được cơ chế phát hiện bằng glob hoặc manifest package tự động bao phủ, không cần chỉnh sửa thủ công: workspaces trong `package.json` gốc, `scripts/publint-all.ts`, `tsdown.config.ts`, `.oxlintrc.json`, `scripts/check-workspace-constraints.ts`.

## 3. Xác định cấu trúc topology của package

Với một capability có thể thay thế được, khi vai trò Service Definition/Service Provider/Consumer cần tiến hóa độc lập, hãy tách chúng thành các package riêng (xem docs/architecture.md § "Capability seams" — bộ ba shell là mẫu). Plugin dùng cho một mục đích duy nhất thì giữ nguyên trong một package.

### Dùng tên vai trò khớp với thực tế

Tên phải mô tả trách nhiệm ổn định hiện tại. Đừng đặt tên theo triển khai đầu tiên, khả năng mở rộng trong tương lai, hay theo lớp cơ sở của Cordis. Package interface dùng tên capability. Package triển khai thêm hậu tố phân biệt cơ chế, giao thức, môi trường hoặc nhà cung cấp. Chỉ dùng `local` khi việc thực thi trên cùng host là một quy ước.

Một engine, runtime, policy, controller, resolver, store, hoặc cấu hình hiện tại thì dùng key `ctx` số ít. Registry hoặc service có nhiều thành viên có tên thì dùng key số nhiều. Vai trò của class và số ít/số nhiều của key phải nhất quán với nhau. Không được để hai khai báo host và client không tương thích dùng chung một key `Context` của Cordis. Ngay cả khi hai bên dùng context runtime độc lập, declaration merging của TypeScript vẫn thấy cả hai kiểu cùng lúc. Nếu số nhiều tự nhiên đã thuộc về một face khác, hãy thêm hậu tố trách nhiệm.

| Từ | Điều kiện áp dụng | Điều kiện không áp dụng |
|---|---|---|
| `Controller` | Nhận lệnh hoặc ý định người dùng, và thay đổi một trạng thái domain hoặc trạng thái hiển thị đã có. | Thực hiện công việc tùy ý, sở hữu một tập provider, hoặc chỉ chuyển đổi giá trị thành hình thức hiển thị. |
| `Store` | Sở hữu một tập dữ liệu, chủ yếu cung cấp thao tác CRUD, snapshot, hoặc subscription cho dữ liệu đó. | Kiểm tra máy trạng thái, phán xử quyền, phân phối công việc, hoặc sở hữu độ ưu tiên của provider. Có map trong class không đồng nghĩa với store. |
| `Directory` | Phơi bày các mục cùng metadata của chúng để được phát hiện hoặc lựa chọn. | Producer đăng ký triển khai tùy ý vào đó, hoặc bên gọi dùng nó để thực hiện công việc. |
| `Presenter` | Chuyển đổi thuần túy giá trị domain hoặc tham số công cụ thành ý định render. | Thực hiện I/O, subscription, sửa trạng thái, hoặc sở hữu vòng đời. |
| `Registry` | Sở hữu một tập đăng ký có tên động, cùng quy tắc truy vấn, trùng lặp hoặc độ ưu tiên, vòng đời và giải phóng. | Quy ước chính là dispatch, thực thi, hủy, policy, hoặc điều phối. |
| `Runtime` | Chạy công việc thời gian thực, và sở hữu dispatch, hủy, phối hợp provider, hoặc vòng đời thao tác xuyên suốt các lệnh gọi. | Chỉ lưu bản ghi, trả về directory, phân giải một giá trị, hoặc lưu cấu hình. |
| `Resolver` | Tính toán hoặc định vị một câu trả lời dựa trên đầu vào, nhưng không sở hữu vòng đời của câu trả lời đó. | Sở hữu tập hợp có thể thay đổi hoặc quá trình thực thi chạy lâu dài. |
| `Binder` | Gắn một interface đã khai báo vào context hoặc vòng đời của bên gọi, và trả về giá trị đã gắn. | Giữ giá trị đó như một tập hợp, điều khiển trạng thái domain của nó, hoặc chỉ chuyển đổi dữ liệu. |
| `Engine` | Triển khai thuật toán domain hoặc mô hình thực thi có trạng thái. | Chỉ chọn provider hoặc chuyển tiếp request qua ranh giới giao thức. |
| `Policy` | Quyết định cho phép, lựa chọn, giới hạn, hoặc quan sát điều gì. | Thực hiện cơ chế mà quyết định đó cho phép. |
| `Executor` | Chạy một request rõ ràng hoặc spec đã phân giải trong một capability. | Sở hữu vòng đời áp dụng rộng hoặc danh mục provider. |
| `Gateway` | Điều hợp ranh giới tiến trình, mạng, RPC, hoặc API. | Chỉ đăng ký service cùng tiến trình hoặc lưu metadata. |
| `Provider` | Cung cấp một triển khai của một định nghĩa capability. Khi có nhiều triển khai, thêm hậu tố cơ chế hoặc nhà cung cấp. | Đại diện cho định nghĩa capability, registry provider, hoặc runtime của bên tiêu thụ. |
| `Backend` | Triển khai lưu trữ bền vững, truyền tải, hoặc thực thi có thể thay thế, đứng sau một interface đã định nghĩa. | Đại diện cho service hướng người dùng hoặc một tham chiếu tài nguyên thời gian thực đã trả về. |
| `Handle` | Tham chiếu một tài nguyên thời gian thực, và điều khiển hoặc quan sát tài nguyên đó. | Tạo và quản lý toàn bộ pool tài nguyên. |
| `Config` | Sở hữu một giá trị cấu hình đã phân giải, hoặc một bản ghi cấu hình có ranh giới rõ ràng cùng quy ước cập nhật của nó. | Lưu tập hợp chung, thực hiện công việc, hoặc phơi bày các thiết lập không liên quan. |
| `Service` | Sở hữu một service domain gắn kết mà không thể mô tả trung thực bằng vai trò chính xác hơn ở trên. | Chỉ vì class kế thừa `Service` của Cordis mà dùng tên này. |

Chỉ dùng `SDK` cho giao thức client/server JSON-RPC được dùng bởi các Python SDK và TypeScript SDK được hỗ trợ. Bản thân DeepSeek Harness là một agent harness, không phải một dự án SDK. Cách viết sản phẩm thống nhất dùng `Typert`, không dùng `TypeRT` hay `typeRT`.

## 4. Viết README của package

Đặt API service, cấu hình, sự kiện, điểm mở rộng và ghi chú thiết kế đặc thù của package lên trước. Phần limitations ghi lại các khoảng trống bên tiêu thụ còn tồn tại lâu dài và các ràng buộc bảo trì không hiển nhiên do package này sở hữu; việc dọn dẹp thường ngày để lại trong TODO mã nguồn hoặc Agent Note. Các câu Model Experience gián tiếp có thể nêu đích danh bên tiêu thụ phơi bày đóng góp của package này, nhưng không lặp lại cách triển khai của bên tiêu thụ đó. README của package kết thúc bằng chuỗi quy chuẩn sau:

````markdown
## Model Experience

### Request context and condition

#### What the model sees

The exact data-dependent fields, an anchored generated-catalog link, or an introduction to the verbatim literal below.

##### Verbatim text for this field, when needed

```markdown
Stable system-prompt prose of any length, or another long non-generated literal, copied exactly from source.
```

#### Token effect

Fixed, conditional, retained, replaced, capped, or zero-direct token effect.

#### KV Cache effect

Append-only, prefix-stable, replacing, or independent behavior, including the exact conditions that may invalidate reuse.

## Known Limitations and Deferred Work

- **Consumer-visible gap** — exact missing operation or case, its consequence, and any maintainer constraint.
````

Hãy điền phần Model Experience dựa theo triển khai thực tế. Mỗi mục ngữ cảnh mô hình trực tiếp, có điều kiện, có giới hạn trên, thuộc vòng đời, hoặc hỗ trợ đều dùng một H3, chứa ba trường H4 theo thứ tự nêu trên, mỗi trường có một đoạn văn bản bên dưới. Trích dẫn văn bản ổn định do package sở hữu: system prompt đặt dưới trường đã dẫn ra nó, thể hiện bằng H5 có tiêu đề cộng hàng rào ` ```markdown `, thường nằm trong `What the model sees`; các văn bản ngắn khác chèn nội tuyến bằng placeholder có tên, các văn bản dài khác dùng cùng hình thức lồng nhau này. Chỉ tóm lược phụ thuộc dữ liệu hoặc văn bản do provider sở hữu. Các mục tool schema liên kết tới chương mục neo tương ứng trong [danh mục công cụ](../tool-catalog.md) đã sinh ra, chỉ nêu rõ phần chênh lệch còn thiếu ở đó. Khi phạm vi có thể ẩn prompt hoặc schema mà không ảnh hưởng tới cái còn lại, hãy tách hai phần riêng. Khi điền `KV Cache effect`, cần phân biệt tăng trưởng chỉ-thêm, tiền tố lặp lại ổn định, thay thế token request đã có, và request mô hình độc lập, đồng thời liệt kê các thay đổi do package này sở hữu có thể làm mất hiệu lực việc dùng lại cache. "Không làm mất hiệu lực cache" chỉ có nghĩa là package này giữ nguyên tiền tố có thể dùng lại đã có; việc cache có khả dụng hay không và khi nào bị loại bỏ không thuộc quy ước của package này. [Chuẩn hành văn](../../.agents/skills/dsh-prose-standard/SKILL.md) ràng buộc tính đầy đủ và quy về nguồn; bộ kiểm tra cưỡng chế cấu trúc chương mục bắt buộc.

Package không có tác động ngữ cảnh hoặc chỉ có đường dẫn thuộc sở hữu của bên tiêu thụ dùng câu `None, as ` hoặc `Indirectly, through ` đã được kiểm duyệt trong [`SENTENCE_MODEL_EXPERIENCE`](../../scripts/verify-package-readme-model-experience.ts), sau đó thêm H4 `KV Cache effect` cùng một đoạn văn bản không rỗng. Package thông thường không liên quan tới mô hình có thể thay bằng cách thêm `NO_MODEL_EXPERIENCE_SECTION`. Cả hai trường hợp đều không được mở rộng thành mô tả về công việc của một package khác. [Danh sách cho phép (allowlist)](../../scripts/verify-package-readme-limitations.ts) của limitations được quản lý độc lập. [Agent Note về Model Experience](../../.agents/notes/implemented/process/2026-07-12-package-model-experience-contract.md) ghi lại động cơ thiết kế.

## 5. Xác minh

```sh
pnpm install        # registers the workspace
pnpm run doc-sync
pnpm run constraints && pnpm run typecheck && pnpm run lint
pnpm run build && pnpm run hygiene
```

Hãy tuân theo [chính sách kiểm thử của repo](../testing.md), thực hiện các kiểm tra hành vi chuyên biệt cần thiết cho package mới và đạt độ phủ tương ứng.
