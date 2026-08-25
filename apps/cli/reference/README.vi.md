# Tham khảo hành vi CLI (giao diện dòng lệnh) `dsh`

[English](README.md) | Tiếng Việt

Tài liệu tham khảo này định nghĩa các mẫu lệnh cho khởi động profile, alias web, quản lý plugin và dump cấu hình. argv được [`src/args.ts`](../src/args.ts) phân tích thống nhất một lần, [`src/bin.ts`](../src/bin.ts) chỉ import động bộ runner được chọn.

## Khởi động Profile

`dsh --profile <name>` khởi động một profile nằm tại `$DSH_HOME/profiles/<name>`. Cây cấu hình hiệu lực bắt đầu từ một root node rỗng, rồi lần lượt xếp chồng các patch của từng bundle được liệt kê trong danh sách `dsh.profile.bundles` của manifest (tệp mô tả metadata) profile, `cordis.patch.yml` của chính profile, tệp cùng cấp home `$DSH_HOME/cordis.patch.yml` (đây là tùy chọn dùng chung ở cấp máy giữa các profile, nên có độ ưu tiên cao hơn tầng cấu hình theo từng profile), và cuối cùng là các overlay `--patch <path>` được chỉ định theo thứ tự trên argv. Với cùng một dòng cấu hình, tầng áp dụng sau sẽ ưu tiên hơn. Patch sẽ thay toàn bộ giá trị `config` của dòng đích, chứ không deep-merge các khóa bên trong; patch cũng có thể chèn dòng mới. Khi việc phân giải cấu hình, kiểm tra schema, phân giải module, hoặc khởi động plugin thất bại, hệ thống sẽ báo lỗi và thoát với trạng thái khác 0. Khi nhận SIGINT hoặc SIGTERM, root node đã mount sẽ dispose (giải phóng tài nguyên) trước khi thoát.

Tên bundle trước tiên được phân giải từ thư mục cài đặt dsh, sau đó từ thư mục profile. Do đó, các bundle tích hợp sẵn (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, `@deepseek-ai/dsh-headless`) luôn đến từ bản cài đặt của `dsh` đang chạy hiện tại; các bundle nằm ngoài cây thì đến từ `node_modules` do pnpm quản lý trong thư mục profile. Plugin `name` trần trong dòng patch sẽ được phân giải bắt đầu từ thư mục profile, đi theo quy tắc phân giải module của Node, tìm dần lên các thư mục cha, cho đến thư mục dự phòng `$DSH_HOME/profiles/node_modules` do dsh duy trì. Thư mục này giữ một symbolic link cho từng package mà các ứng dụng và bundle trong bản cài đặt dsh phụ thuộc, và sửa lại các liên kết này mỗi lần khởi động.

Profile `web` và `headless` khi dùng lần đầu sẽ tự khởi tạo từ template kèm theo (`web`: base + web-app; `headless`: base + headless). Các profile còn thiếu khác sẽ báo lỗi rõ ràng, và gợi ý chạy `dsh plugin --profile <name> add <package>`.

### Tham số ứng dụng

Các flag của bản thân launcher phải viết ở đầu, và kết thúc khi gặp token không nhận diện được đầu tiên; mọi thứ từ token đó trở đi sẽ được chuyển nguyên vẹn tới profile đã khởi động qua `ctx.cmdlineArgs`, để bất kỳ plugin ứng dụng nào được inject vào profile đó phân giải ([`dsh-cmdline`](../../../packages/boot/cmdline/README.md)). Do đó, `dsh --profile web --port 8080` sẽ giao `--port` cho ứng dụng web; `dsh --profile web --help` chỉ in ra thông tin trợ giúp của ứng dụng đó, không khởi động ứng dụng; `dsh --help` không có profile nào để giao tham số, nên sẽ in ra thông tin trợ giúp của chính launcher. `-V`/`--version` khi đứng trước ranh giới tham số ứng dụng sẽ in ra phiên bản của launcher.

Mỗi bộ tổ hợp chỉ mount một lần. Plugin thông thường inject `cmdlineArgs`, phân giải tham số của ứng dụng thuộc về nó, và cung cấp kết quả phân giải dưới dạng service. Mỗi dòng cấu hình lấy giá trị từ flag đều inject service đó; Loader sẽ đợi đến khi service được kích hoạt rồi mới đánh giá giá trị của dòng cấu hình đó (`port: !!js ctx.webStartup.port ?? 3080`), do đó flag có độ ưu tiên cao hơn giá trị đã ghi rõ trong dòng cấu hình. Để giữ được thứ tự ưu tiên này, dòng cấu hình phải giữ nguyên biểu thức đó; nếu người dùng patch thay toàn bộ `config` bằng một literal, việc đọc runtime cũng sẽ bị loại bỏ theo. Cả tham số trợ giúp và tham số bị từ chối đều yêu cầu thoát: khi tham số bị từ chối sẽ thoát với trạng thái khác 0, khi hiển thị trợ giúp sẽ thoát với trạng thái 0; các dòng cấu hình phụ thuộc vào service của provider đó sẽ không được kích hoạt. Khi chỉnh sửa `cordis.patch.yml` trực tuyến, hệ thống sẽ tính lại biểu thức dựa trên các service vẫn đang chạy, do đó sẽ không reset cổng đang được sử dụng hiện tại.

Flag của launcher phải viết trước tham số ứng dụng, và bộ phân tích của launcher sẽ tiêu thụ một `--`: tham số cần chuyển tới ứng dụng dưới dạng literal `--` phải viết thành `-- --`. Nếu tham số đầu tiên của ứng dụng trùng khớp với `web` hoặc `plugin`, subcommand tương ứng sẽ được chọn. `ctx.cmdlineArgs.get()` là một lượt đọc bất biến dùng chung: nhiều plugin có thể cùng phân giải một snapshot, còn profile không có bên đọc sẽ bỏ qua tham số ứng dụng của chính nó.

Ứng dụng kèm theo chấp nhận các tham số dòng lệnh sau:

| Profile | Tham số |
|---|---|
| `web` | `--host`, `--port`, `--trusted-host` (có thể lặp lại) |
| `headless` | Văn bản tác vụ, dưới dạng tham số vị trí (positional) |

Một tác vụ một lần (`dsh --profile headless "run the tests"`) sẽ thông qua registry lõi để tạo một Agent (tác tử) bền vững hoàn toàn mới, gửi tác vụ, đợi cho đến khi hoàn toàn ổn định và flush phiên, rồi suy ra văn bản assistant không rỗng cuối cùng cùng lý do `turn/end` cuối cùng từ khoảng sự kiện bền vững của nó. Nó in văn bản ra stdout, và thoát với trạng thái 0 khi lý do là `completed`, ngược lại thoát với trạng thái 1. Lệnh gọi không có tác vụ là lỗi sử dụng của ứng dụng đó. Profile headless kèm theo không mount ApiProxy, Host, HTTP server, runtime Web, hay client trình duyệt; một lần chạy thành công sẽ không ghi bất cứ gì vào stderr, cũng không mở cổng lắng nghe nào.

Có thể kiểm tra cây cấu hình đã tổ hợp mà không cần khởi động:

```sh
dsh --profile web --dump-default-config
dsh --profile web --patch ./extra.yml --dump-config
```

`--dump-default-config` chỉ in ra các tầng của bundle; `--dump-config` in thêm cả `cordis.patch.yml` của profile, `$DSH_HOME/cordis.patch.yml` ở cấp home, và overlay `--patch`. Cả hai đều in ra chú thích, ghi rõ mỗi dòng do tệp nào cung cấp, và overlay nào đã sửa nó; biểu thức `!!js` giữ nguyên chưa được đánh giá, patch không tìm thấy đích sẽ báo cáo ra stderr. Thao tác dump không chạy provider tham số dòng lệnh của ứng dụng, do đó hiển thị cây cấu hình tổ hợp trước khi phân giải bất kỳ tham số ứng dụng nào; nếu lệnh gọi có kèm tham số ứng dụng, dump sẽ từ chối lệnh gọi đó.

## Quản lý Plugin

`dsh plugin --profile <name> <args...>` sẽ khởi tạo profile trước nếu nó chưa tồn tại (dùng template nếu có, các tên khác chỉ cài `@deepseek-ai/dsh-base`), sau đó dùng thư mục profile làm working directory, chuyển tiếp `<args...>` cho `pnpm`: `add`, `remove`, `why`, `update` và mọi subcommand khác của pnpm đều dùng được như bình thường; pnpm phải có trên PATH. Spec đường dẫn tương đối (`.`, `../plugin` cùng các dạng `file:`/`link:` của chúng) sẽ được neo vào thư mục gọi lệnh trước, do đó chạy `add .` trong một checkout plugin sẽ cài đặt chính checkout đó, chứ không phải profile. Sau mỗi lần chạy thành công, hệ thống sẽ cập nhật `dsh.profile.bundles` dựa trên trạng thái cài đặt hiện tại: nếu một dependency được phân giải trỏ tới package khai báo `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` trong manifest, dependency đó sẽ được thêm vào ngăn xếp tầng cấu hình; nếu một dependency có được khai báo này sau `update`, nó cũng sẽ được kích hoạt ngay. Dependency không có khai báo bundle vẫn được giữ lại như dependency thông thường, và hiển thị một cảnh báo một lần; dependency đã gỡ bỏ sẽ bị xóa khỏi ngăn xếp tầng cấu hình.

```sh
dsh plugin --profile tui add github:deepseek-harness/turtle-ui
dsh plugin --profile tui remove turtle-ui
dsh --profile tui
```

Plugin phát hành kèm theo Git sẽ được build trong lúc cài đặt thông qua script `prepare`, còn pnpm ≥10 mặc định chặn script này cho đến khi bên sử dụng cho phép tường minh. Lần chạy `add` đầu tiên sẽ thất bại và hiển thị gợi ý `allowBuilds` của pnpm; dsh cũng sẽ gợi ý nên sửa `pnpm-workspace.yaml` của profile đó. Sau khi copy khóa được in ra vào tệp đó, chạy lại lệnh là được. Khi cài đặt tarball đã build sẵn hoặc checkout cục bộ thì không cần thêm vào `allowBuilds`.

## Alias Web

`dsh web` là alias hard-code của `--profile web`; các flag viết sau nó thuộc về ứng dụng web, được phân giải bởi các provider thông thường trong bundle. `--host` và `--port` ghi đè giá trị tổ hợp của các dòng chứa chúng, `--trusted-host` (có thể lặp lại) cung cấp authority cho lần gọi này qua `ctx.webRuntime.trustedHosts` (biểu thức deployment sẽ tự nối authority của mình), receiver HMR (Hot Module Replacement) của client plugin luôn được mount, và giữ trạng thái nhàn rỗi cho đến khi watcher `pnpm run dev:web` chạy riêng rebuild bundle client.

```sh
dsh web
dsh web --patch ./extra.cordis.yml
dsh web --dump-config
dsh web --help
```

Web runner production cần các package và sản phẩm frontend đã được build (`pnpm run build`). Địa chỉ phục vụ mặc định là `http://127.0.0.1:3080`. CLI hiện cố ý không hỗ trợ `--host 0.0.0.0`, và sẽ thoát với lỗi sử dụng; `--trusted-host` có thể thêm các authority được đặt tên mà hàng rào tin cậy trình duyệt `/api` chấp nhận.

Khi tiến trình tắt, cây plugin có tối đa 5 giây để hoàn tất dispose. Khi nhận `SIGINT` hoặc `SIGTERM` lần đầu, hệ thống bắt đầu xả (drain) một cách graceful: `SIGTERM` là yêu cầu dừng thông thường do tiến trình giám sát phát ra, thoát với trạng thái 0 ở mọi chế độ chạy; `SIGINT` thì báo cáo 130. Khi nhận tín hiệu lần thứ hai, hệ thống sẽ thoát cưỡng bức ngay lập tức. Nếu một lần chạy một lần bị kẹt ở giai đoạn dispose khi đang kết thúc bình thường, lần nhấn `Ctrl+C` đầu tiên sẽ trực tiếp nâng cấp thành thoát cưỡng bức, chứ không bị bỏ qua.

Mọi chế độ đều dùng thư mục nơi chạy lệnh làm workspace root mặc định, nạp `AGENTS.md` hoặc `CLAUDE.md` phù hợp với ngân sách render 65.536 byte, và dùng chỉ mục nội dung phiên SQLite trong bộ nhớ. Mỗi lần khởi động profile, hệ thống sẽ theo dõi các thay đổi hiệu lực trên cả hai tầng cấu hình `cordis.patch.yml` (profile và home), và áp dụng lại theo kiểu giao dịch (transaction); chế độ chạy một lần thoát qua một luồng tắt có giới hạn, luồng này sẽ dispose watcher trước.

Phiên mới mặc định dùng preset quyền `workspace-write`. Bash và các thay đổi hệ thống tệp chỉ giới hạn trong workspace của phiên và root tạm của nền tảng; đọc, truy cập mạng và khả năng nhìn thấy tiến trình không bị giới hạn. `DSH_PERMISSION_MODE` thay đổi giá trị dự phòng của tiến trình. Quyền lưu trong General settings ảnh hưởng đến các phiên Web sau đó, không thay đổi phiên đang mở.

`DSH_TOOLS_MODE` chọn `native`, `code`, hoặc `both` cho tiến trình; giá trị khác sẽ khiến khởi động thất bại. Agent preset `minimal` kèm theo sẽ giữ nguyên cách trình bày của deployment đó, cố định system prompt đầy đủ là `You are a helpful software engineer assistant.`, và chỉ tổ hợp `bash` bền vững cùng `str_replace_editor`. Khi tạo phiên Web hãy chọn chế độ minimal; agent đó không chứa bất kỳ đoạn prompt nào khác hoặc plugin hướng tới mô hình, còn trình duyệt, workspace, tính bền vững, sandbox và host quyền dùng chung vẫn giữ nguyên.

## Hành vi triển khai dùng chung

Bundle cơ sở mount bộ điều hợp DeepSeek gốc, provider settings và credentials, `web_search` ổn định, và telemetry phiên đã tắt. Credential của provider được phân giải lần lượt từ môi trường kế thừa, `$DSH_HOME/.credentials.yaml`, `.env` của thư mục gọi lệnh, và `$DSH_HOME/.env`; tài liệu được quản lý (managed document) không bao giờ được vật chất hóa vào `process.env`, còn hai tệp `.env` đều là các tầng môi trường khởi động thông thường. Search dùng `DEEPSEEK_API_KEY` và chấp nhận `DEEPSEEK_SEARCH_BASE_URL`; công cụ này chỉ khả dụng khi tầng patch chèn provider và bật `web_fetch`.

Telemetry phiên mặc định giữ ở cục bộ. `DSH_TELEMETRY_MODE=FULL` sẽ stream mọi sự kiện phiên đã projection dưới dạng log OTLP/HTTP, `DSH_TELEMETRY_MODE=FEEDBACK_ONLY` chỉ upload phần đuôi log phiên khi có ghi nhận phản hồi. `DSH_TELEMETRY_OTLP_URL` chọn collector khác. Bất kỳ `DSH_TELEMETRY_DISABLED` khác rỗng nào cũng là công tắc tắt telemetry có hiệu lực cuối cùng. Cấu hình cơ sở kèm theo không có quy tắc khử nhạy cảm (redaction) cho telemetry, do đó export được bật tường minh có thể chứa văn bản tin nhắn, tham số công cụ và kết quả, cùng đường dẫn workspace; quyết định triển khai liên quan xem tại [Agent Note mặc định tắt](../../../.agents/notes/implemented/feature/2026-08-10-telemetry-default-off.md).

Cài đặt bundle plugin bên ngoài qua `dsh plugin --profile <name> add <package-or-git-spec>`. Package đã cài sở hữu dependency của nó, và đóng góp tầng `cordis.patch.yml` mà nó khai báo. CLI cũng kèm theo `@deepseek-ai/dsh-mcp-client` như một dependency để tầng patch sử dụng, nhưng mặc định không bật MCP server, vì mỗi lệnh server đều là mã thực thi đáng tin cậy nằm ngoài sandbox của agent (tác tử).

## Chạy từ mã nguồn

Trong thư mục gốc repo, hãy chạy riêng `pnpm run build` sau một checkout hoàn toàn mới và mỗi khi sản phẩm cần cập nhật, sau đó dùng `pnpm dsh <args...>`. Script trong `package.json` không build, mà khởi động `apps/cli/src/bin.ts` qua `node --import tsx/esm`, và chuyển tiếp mọi tham số. Khi thiếu sản phẩm Typert Host, việc khởi động profile sẽ thất bại với lỗi phân giải module không kèm hướng dẫn build. Sau khi các sản phẩm Host này tồn tại, nếu bundle frontend hoặc Client plugin bị thiếu, khởi động sẽ thất bại và gợi ý chạy `pnpm run build`. Launcher không kiểm tra sản phẩm có mới nhất hay không, do đó một bundle cũ đã có từ trước có thể tiếp tục chạy code trình duyệt cũ cho đến khi build lại. Tiến trình này kế thừa môi trường khởi động; khi phiên bản Node hỗ trợ proxy môi trường phải tuân theo `HTTP_PROXY` và `HTTPS_PROXY`, hãy đặt `NODE_USE_ENV_PROXY=1`. Bản cài đặt sẽ trực tiếp khởi động `apps/cli/lib/bin.js` đã build, không build lại repo.
