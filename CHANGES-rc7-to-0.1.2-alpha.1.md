# DeepSeek Harness — Báo cáo thay đổi `v0.1.0-rc.7` → `v0.1.2-alpha.1`

> **Đối tượng đọc:** AI agent hoặc developer cần nắm nhanh những gì đã thay đổi giữa hai phiên bản, để định vị code, tránh dùng API đã bị xóa, và biết chỗ nào cần cập nhật.
> **Ngày tạo báo cáo:** 2026-08-28

---

## 0. Metadata — hai mốc so sánh

| | `deepseek-harness-fork` (CŨ) | `deepseek-harness` (MỚI) |
|---|---|---|
| Tag | `dsh-v0.1.0-rc.7` | `dsh-v0.1.2-alpha.1` |
| Commit | `99f6f02fec` | `cd5ef81481` |
| Ngày commit | 2026-08-17 19:03 +0800 | 2026-08-28 00:57 +0800 |
| Tổng commit | 12.404 | 14.226 |
| Package workspace | 247 | 271 |
| Đường dẫn local | `/Users/nguyencu/Desktop/Other/compare/deepseek-harness-fork` | `/Users/nguyencu/Desktop/Other/compare/deepseek-harness` |

**Quan hệ:** `99f6f02fec` là tổ tiên trực tiếp của `cd5ef81481` (đã xác minh bằng `git merge-base --is-ancestor`). Các tag trung gian: `rc.7 → rc.8 → 0.1.1-rc.1 → 0.1.1-rc.2 → 0.1.2-alpha.1`.

**Quy mô diff:** 1.822 commit · 7.316 file · **+393.771 / −135.304 dòng**
Phân loại: 126 × `feat:`, ~60 × `refactor:`, 30 × `perf:`, 424 commit chạm tầng client/web.

### Cách tự xác minh

```sh
cd /Users/nguyencu/Desktop/Other/compare/deepseek-harness

# Toàn bộ commit giữa hai bản
git log --oneline --no-merges 99f6f02fec..HEAD

# Chỉ commit tính năng
git log --oneline --no-merges 99f6f02fec..HEAD --grep='^feat' -E

# Diff một package cụ thể
git diff 99f6f02fec..HEAD -- packages/client/ui-conversation/

# Package thêm/bớt
git diff --name-status --diff-filter=A 99f6f02fec..HEAD -- '*/package.json'
git diff --name-status --diff-filter=D 99f6f02fec..HEAD -- '*/package.json'
```

> ⚠️ **Không dùng `diff -r` giữa hai thư mục.** Cả hai repo còn `lib/`, `node_modules/`, và thư mục rác từ lần checkout trước; kết quả sẽ sai lệch. Luôn dùng `git diff` trong repo mới.

---

## 1. BREAKING CHANGES — đọc mục này trước

### 1.1 Xóa `packages/host/apiproxy` → thay bằng Remote Controllers

Đây là thay đổi lan tỏa rộng nhất, chiếm phần lớn diff.

| Commit | Nội dung |
|---|---|
| `fd7f2065b2` | `refactor(apiproxy)!: remove settings and credentials RPCs` |
| `6e4087626d` | `refactor(apiproxy)!: remove directory-picker RPCs` |
| `243f6629ef` | `refactor(apiproxy): delete the goal unary domain` |
| `ce3391e280` | `refactor(apiproxy): retire migrated unary routes` |
| `4f00a8b82a` | `refactor(api): remove ApiProxy package` |

**Trước:** client gọi RPC qua ApiProxy.
**Sau:** client gọi `ctx.remote.<namespace>.<method>()` (sinh tự động từ Typert Remote decorator ở Host) hoặc `agentCtx.remote.<namespace>` cho scope Session. Download đăng ký Fetch route chính xác qua `connection`.

**Package thay thế:**
- `packages/api/session-controller` — list/search/create/prompt/queue/cancel/pagination + follow & control stream
- `packages/api/workspace-controller` — mutation policy + follow feed của Workspace
- `packages/api/settings-controller` — settings qua Remote

### 1.2 Đổi tên `code mode` → `ptc` (PTC mode)

Commit `3ca9c7d489` `rename code-mode to ptc (PTC mode), except session-persistent vocabulary`.
Ảnh hưởng: giá trị config, tài liệu, prose. Từ vựng `session-persistent` **không** đổi.

### 1.3 Package client bị xóa

| Package bị xóa | Thay thế / ghi chú |
|---|---|
| `packages/client/runtime` | `refactor(client): migrate consumers and remove Runtime` (`be531688f3`) |
| `packages/client/web-react` | Thay bằng `packages/client/ui-renderer` |
| `packages/client/schema-form` | Không còn |

> Lưu ý: thư mục `packages/client/{runtime,schema-form,web-react}` **vẫn tồn tại trên đĩa** ở repo mới — đó là rác build không được git track. Kiểm tra bằng `git ls-files` chứ đừng bằng `ls`.

---

## 2. Kiến trúc tầng Client được tách lại

Trước đây `ui-conversation` ôm cả: assembly + Chat + Trajectory + Approval + Question. Nay nó chỉ còn là **shell trung lập**; mỗi target là package độc lập tự đăng ký Definition / View / renderer.

### Package client MỚI (7)

| Package | Vai trò |
|---|---|
| `client/store` | Observable & snapshot store **không phụ thuộc React** (Immer, shallow equality, sync + rAF publication, browser persistence tùy chọn) |
| `client/ui-renderer` | Mount app React; `ctx.uiRenderer.mount(container)` hydrate boot DOM rồi chuyển sang React app. Bind observable → selector hook tại slot outlet. Business plugin chỉ là React component nhận props typed |
| `client/ui-session` | Adapter React/Slot cho Session Controller: hook danh sách Session, pending interaction, per-Session props, `SessionProvider` |
| `client/ui-chat` | Target Chat: transcript node, detail, ảnh lịch sử, action, localization, scroll restoration. Fold packed historical assistant run |
| `client/ui-approval` | UI phê duyệt permission qua Agent-scoped Remote Event waterfall; chiếm quyền composer khi cần |
| `client/ui-reference` | Nguồn `@file` + `@session` hợp nhất cho composer |
| `client/ui-brand-official` | Điền `sidebar.brand.mark`, `sidebar.brand.name`, `conversation.hero.brand.mark`. **Chỉ đăng ký khi build profile `official`**; build khác → fallback của shell |

### Chuỗi sở hữu (từ `docs/subsystems/web-client.md`)

```
Host state → Remote transport → Client model → UI adapter → Conversation/presentation → Slots → React
```

| Layer | Owner | Trách nhiệm |
|---|---|---|
| Host application | business service + `packages/api/*-controller` Host entry | State thẩm quyền, persistence, thứ tự mutation, access policy, stream |
| Transport & API | `client/connection`, `api/gateway`, `api/remotes` | Client generation, `ctx.remote` methods/streams, forward Cordis event, cancel/result |
| Client models | `api/session-controller/client`, `api/workspace-controller/client` | Mirror React-free của Host state, giải race stream/unary, identity ổn định |
| UI adapters | `client/ui-session`, `client/ui-workspace` | Chuyển observable → Slot source root/Session-scoped |
| Conversation data | `client/ui-conversation`, target (`ui-chat`, `ui-trajectory`) | Assembly event → snapshot theo target |
| Composition & render | `client/ui-slots`, `ui-renderer`, `ui-layout`, feature UI | Slot, props, hook binding, mount |

**Quy tắc:** presentation component **không bao giờ** nhận Cordis `ctx`, transport object, hay implementation của plugin khác.

**Tài liệu kiến trúc mới:** `docs/subsystems/web-client.md`, `docs/subsystems/slots.md`, `docs/subsystems/agent-team.md`, `docs/subsystems/webhook.md`, `docs/subsystems/todo.md`.

---

## 3. Thay đổi UI/UX chi tiết

### 3.1 Composer — viết lại bằng Lexical

Commit chính: `b519cb87b0 feat(ui-conversation): lexical composer replaces the textarea stack`, `477615162a feat(ui-conversation): lexical chip node, projections, span map`.

- Bỏ `<textarea>`, chuyển sang **Lexical editor** do shell sở hữu.
- **Reference chip là atomic decorator node**: `@file` / `@folder` / `@session` chèn vào là một khối nguyên tử, mang serialization identity của owner; submit thì expand qua owner codec. Con trỏ nhảy qua nguyên chip (`c8b4ec73a0 fix: step across chips without a keyboard-selected state`).
- Slash command đã claim → style thành leading text.
- Folder reference mang icon prefix glyph thư mục (`73792a81b1`).
- Clipboard projection của draft mirror vào per-Session Conversation store.
- Composer **thường trú** qua trạng thái không-Session và chuyển Session (mounted nhưng inert khi chưa có Session).

**Gửi lạc quan (optimistic send)** — 3 commit:
- `98da332260 feat(session-controller): 客户端本地提交回显与 rpcId 关联`
- `390dad6138 feat(ui-conversation): 默认发送改为乐观提交并接入提交回显`
- `cf47b7e059 feat(web): 提交回显在 Chat 流尾即时渲染`

Cơ chế: Enter xóa draft + occurrence table + undo history trong **một transaction**, giữ composer ở `plain`, chạy send như detached attempt. `sendSession` đăng ký `session.beginSubmission` trước khi serialize, nhường một paint để echo render ngay trên frame của cú click. Khi bản durable về, node echo bị ẩn theo `rpcId` → swap nguyên tử. Ảnh encode qua `FileReader` data-URL. Lỗi đồng thời được restore cùng nhau theo thứ tự submit cho tới khi user sửa nội dung.

> Subagent continuation trực tiếp **không** có echo local vì transport không giữ browser request id.

**Nút chính khi đang chạy** (`e06625d202`, `d61ba08685`):
- Draft rỗng hoặc input không khả dụng → **Stop**
- Có text/attachment → **Queue Send**
- Xóa draft hoặc submit thành công → về **Stop**
- Subagent continuable giữ Send và Stop tách riêng

### 3.2 Điều khiển hiển thị mới — cỡ chữ & bề rộng

| Commit | Nội dung |
|---|---|
| `6d6f8f044c` | `feat(ui): adaptive content width and font-size control` |
| `9ecd18e986` | `feat(ui): extend the content font-size axis to flow chrome` |
| `a77e23a975` | `feat(ui): unify the flow-row secondary font tier and scale tables` |
| `5720917ea7` | `polish(ui): trim the width handle and describe the font-size scope` |

- Stepper **12–17 px**, mặc định **14 px**, ở Settings → General (owner: `client/ui-theme`).
- Thang bậc: heading + base text đổi đúng bước; **flow-row title/summary/table thấp hơn body một bậc** (`--dsh-content-font-size-secondary`: setting −1 khi ≤14, −2 khi >14 → 13px ở mặc định); small text và code **cố định**.
- User bubble và composer draft đọc thẳng body pair.
- CSS: `gradient-shadow-text.css` derive `--dsh-content-font-delta` từ `--dsh-content-font-size`.
- Persist qua Host settings API (`$DSH_HOME/settings.yaml`, namespace `ui-theme`). Thay đổi nhanh liên tiếp được serialize theo thứ tự gesture với namespace revision; write mới nhất bị từ chối → reload giá trị durable. Trang non-loopback giữ process-local.
- **Bootstrap đồng bộ**: host nhúng settings `ui-theme` vào mỗi index response; browser set `color-scheme`, `body[data-ds-dark-theme]`, `--dsh-content-font-size` **trước khi trang loading render** → first paint đã đúng.
- Thêm **width handle** chỉnh bề rộng vùng nội dung.

### 3.3 Chat transcript

| Tính năng | Commit | Mô tả |
|---|---|---|
| Turn rail | `d38ff54150`, `1272c7d0df` | Thanh rail dọc compact để nhảy giữa các Turn đã load; accumulate thay vì scan lại window mỗi render |
| Fold turn process | `8b09a0be52` | Gấp phần "quá trình" của turn, chỉ lộ câu trả lời cuối |
| Token usage per-turn | `b565df3442` | Hiển thị token usage chính xác từng turn |
| System prompt row | `61b65d3147` | Hàng `System prompt` thu gọn cho mỗi request khởi tạo/resume, message-series start, hoặc system field đổi thật. Bung ra = đúng text model thấy, giữ nguyên line break. Không lặp cho thay đổi config-only/tool-only cùng series |
| Streaming fence highlight | `1825cb4657` | Syntax highlight code block **trong lúc stream** |
| Ảnh trong Trajectory | `c27de594fd` | Trajectory hiển thị image attachment |
| Bảng markdown | `000ab970f3`, `c9ce61136d` | Size theo số cột, bảng rộng tràn ra ngoài cột; scrollbar chỉ hiện khi hover |
| Bash card | `9b6729d505` | Card kết quả Bash persistent tự mở rộng |
| CJK/Latin spacing | `1c808341ec` | Auto-spacing toàn cục qua `text-autospace` |
| Ask-user transcript | `94db8e881b`, `94d06e23d2` | Render đọc được, giữ kết quả hỗn hợp |

Ảnh lịch sử resolve qua cache per-session `ctx.uiConversation.imageUrl(sessionId, attachment)` — một browser URL có phân quyền session cho mỗi attachment, revoke cùng Session binding.

### 3.4 Sidebar (`client/ui-sidebar`)

- Brand row tách thành hai slot độc lập: `sidebar.brand.mark`, `sidebar.brand.name`; rail thu gọn render lại slot mark. Không có occupant → fish mark + nhãn local-build đã localize.
- **Local build badge**: `version[-commit][-dirty]` từ `DSH_CLIENT_VERSION`, `DSH_CLIENT_COMMIT_HASH` (7 ký tự), `DSH_CLIENT_GIT_DIRTY=true`. Thiếu version → bỏ badge. (`65a8d6be1b`, `17bde3f5be`, `1a36d5c6f5`)
- **Animation collapse**: nội dung expanded fade out tại width hiện tại; control phía trên fade + translate sang trái vào rail 56px; column slide của layout kết thúc chuyển động. Trang khởi động ở trạng thái collapsed → render rail tĩnh. `prefers-reduced-motion` tắt cả hai.
- **Scrollbar là pointer affordance**: rebind về `transparent` khi con trỏ ra khỏi cột, giữ thumb 2s sau khi rời. Reservation giữ hàng không nhảy thuộc về `ui-workspace` → hiện thumb không gây reflow.
- New Session nhắm Workspace: explicit (scoped action) → Workspace của Session hiện tại → Workspace hoạt động gần nhất → không có thì về trang New Session trắng.

### 3.5 Layout (`client/ui-layout`)

- AppFrame ba cột, resize sidebar bằng invisible hit strip, resize details bằng floating pill.
- Concession chain: chỉ details co lại rồi auto-close; sidebar đóng vẫn giữ rail 56px, details đóng về 0.
- Slot con đổi: `sidebar`, `conversation`, `details`, **`shell.overlay`** (trước là `conversation.empty`).
- Theme presenter giờ áp cả `--dsh-content-font-size` cùng alias token; đo background sau khi apply palette + token làm nguồn màu duy nhất cho `<meta name="theme-color">`.
- Panel geometry **transient** — reload là reset; đổi Session id cũng đóng details và quên width đã kéo.

### 3.6 `@` reference hợp nhất (`client/ui-reference` — package MỚI)

- Gõ `@` → file **và** session trong cùng một danh sách; file xếp trước session; section có nhãn từ locale.
- Hai domain candidate fail độc lập, không chặn nhau.
- Mỗi hàng chỉ mang thông tin phân biệt: file ghi thư mục cha (root workspace → không ghi gì), session ghi workspace **chỉ khi** khác workspace hiện tại, directory listing đã drill thì không ghi (breadcrumb đã nói).
- Pick chèn **atomic inline reference**; dạng serialize/clipboard ẩn là text tự nhiên theo grammar `@path` dùng chung.
- Directory row có **drill verb** (Tab hoặc chevron): giữ text path editable và menu active tại dấu `/` cuối để đi sâu thêm cấp.
- `@"…` → chỉ tìm file.
- Chọn session đi qua session-reference service: validate mention, capture model context tại pre-step boundary.
- Liên quan: `dad39c8c18 feat(web): settle folder references on pick and move descent to a drill verb`, `97e0299f74 feat(web): trim @ mention rows and cut their discovery cost`, `c8e8f8249f fix(web): date @ session rows by last activity, not creation`.

### 3.7 Settings

| Thay đổi | Commit |
|---|---|
| Bulk selection trong model picker | `3e1915a3b2` |
| Slot mở rộng cho provider card + footer (`ui-settings-models`) | `855461c2e8` |
| Chuyển chọn model subagent sang tab **Plugins** | `f887a8f907` |
| Card Subagent xếp sau Agent loop, layout nới lỏng | `cbacceca4b`, `4cc1f5e0ff`, `0b2f476071` |
| Gate chọn model bằng allowlist tường minh | `7c626fb5d2`, `aefc083be7` |
| Ẩn description của model selector | `b6c5aa7516` |
| `SettingsDescribeMirror` — nguồn describe duy nhất | `29d6066870` |
| Retry model mặc định = 5 | `2d2beda196` |
| Đăng ký ngôn ngữ ngoài | `bbe00b0db2`, `45b9f2db44` |
| Progress load plugin | `2f974ca9b0` |
| Trả lời `ask_user_question` nhiều dòng | `9616790b6c` |
| Feedback note editor nổi popover thay vì inline | `e2ee5c0f5d` |
| Menu input trigger được polish | `0114dc1f81` |

**Open configuration file**: chỉ render khi loopback + Host xác nhận có local document; gọi Remote `settings/openSettingsDocument` (pathless, browser-authenticated). macOS dùng `open -t` (bypass file association), Linux/Windows dùng desktop association, WSL dịch qua `wslpath -w`. Browser remote **không bao giờ** đăng ký action này.

### 3.8 Khởi động

- `d66841ea3f feat(web,cli): open the ready Web UI by default` — `dsh web` **tự mở trình duyệt mặc định** sau khi Loader tree settle. Launch qua SSH (`SSH_CONNECTION`/`SSH_TTY`) → chỉ in URL. Cờ mới `--no-open`. Config mới `openBrowser: boolean` (default `true`) trong `packages/bundle/web-app`.
- Opener chạy trong child process với `scrubbedParentEnv()` — **không forward credential của Harness**.
- `50bfb00985 feat(web): single-build preview page`, `fd3112a23f feat(web): unify served and preview startup behind a boot-ready seam`.
- Web authentication: launch token giữ qua reload (`3b3b493a96`), browser Host API được authenticate (`3e24087bfa`), authenticate đồng bộ (`9c964848cd`).

---

## 4. Tính năng mới ngoài UI

| Tính năng | Package / Docs | Ghi chú |
|---|---|---|
| **GitHub webhook review** | `packages/webhook`, `packages/webhook/webhook-github`, `docs/user/guide/github-review.md` | Opt-in overlay thêm signed endpoint vào `dsh web`. PR chuyển draft→ready ⇒ tạo root Session có tiêu đề dưới Web Workspace của repo, chạy prompt review read-only. Cần `DSH_GITHUB_WEBHOOK_SECRET`, mặc định listener `127.0.0.1:3081`, override bằng `DSH_GITHUB_REVIEW_WORKSPACE` / `DSH_GITHUB_WEBHOOK_PORT` |
| **Schedule reminder** | `docs/user/guide/schedule.md`, overlay `apps/cli/config/examples/schedule/cordis.yml` | Tool `schedule_create` / `schedule_list` / `schedule_delete`. Hỗ trợ `after_seconds` (số nguyên dương), `at` (RFC 3339 với `Z`/offset, hoặc `{date,time,time_zone}`), `every_seconds` ≥ 300. Giao hàng `session-local`. Browser gắn IANA zone vào mỗi prompt. DST gap bị từ chối, overlap chọn instant đầu |
| **MCP memory** | `docs/user/guide/mcp-memory.md` | 3 cấu hình tham chiếu **default-off** nối memory MCP server qua `dsh-mcp-client`. Tool lộ ra dạng `mcp__<serverName>__<tool>`. stdio bridge xóa biến môi trường có tên giống credential và mọi `DSH_*` trước khi spawn child |
| **Multimodal / ảnh** | `packages/llm/*`, `packages/fs/tool-fs` | `7078918b30 feat(llm-deepseek): support multimodal requests`, `4fa38d6a23` publish vision model. Upload ảnh qua composer và slash command (`8d9fee19f9`). `read_image` báo kích thước đã downscale + hệ số scale (`6e17c20804`). Encode canonical deterministic (`83a526eea1`). Tính phí ảnh theo route trong compaction (`42164508c8`) |
| **Agent Teams** (experimental) | `packages/experimental/agent-team`, `tool-agent-team`, `client-ui-agent-team`, `agent-team-profile`, `agent-team-web-profile`, `docs/subsystems/agent-team.md` | Runtime bền vững cho team agent, có profile CLI và Web riêng |
| **Inspector** (experimental) | `packages/experimental/inspector` | Debug qua Chrome DevTools Protocol: Cordis tree qua CDP DOM, Host fetch qua CDP Network, Runtime qua CDP Worker, có development mount overlay + demo script (6 commit `feat(inspector)`) |
| **WebWorker runtime** (experimental) | `packages/experimental/webworker-runtime`, `webworker-packer` | Chạy harness trong browser worker; VFS image packer; shell chạy qua nested worker process; fs watch + confinement; preview fixture chọn được; đặt tên packed module cho debugger |
| **Windows** | `packages/shell/tool-pwsh-persistent`, `packages/subprocess/win32-process` | Persistent pwsh tool + minimal-preset Windows stack (`0441312768`); shell dialect cho Windows pwsh (`557c21cd6c`); terminal inspection + signalling (`da403d6086`); đóng gói `dsh.exe` x64 (`ca0b21661e`) |
| **Python** | `packages/code-runtime/code-runtime-python`, `python/sdk` | fd-3 frame protocol (`e0f22aeaad`); TypedDict wire mirror thành executable gate (`8a60b5f005`); SDK launch profile từ home tường minh (`56e038b2e3`); đóng gói CLI + profile asset (`be7b064504`); bundled preset runtime dependency (`e20f560992`) |
| **Credentials** | `packages/credentials/authorization` | Xin credential từ người dùng thay vì từ chối im lặng (`732a7361f5`); lưu credential record durable bên cạnh reference (`86a9f8c862`); upgrade pre-release flat document lúc boot (`933d1f2ab2`); `llm-pi-ai` sign in vào provider thay vì withhold (`57c5f017ac`) |
| **Subagent providers** | `packages/subagent/subagent-{codex,claude-code}` | Named instance (`db52686a96`, `49351cbf0e`); cài trực tiếp (`b2178ade80`, `b4366e711d`, `d1629eed45`); non-interactive permission mode (`7eb203069c`, `4d03472cd0`); cấu hình model (`fe8a961348`, `a043395c2d`); model routing qua DSH SDK (`1044db218d`); browser control chuyển sang Remote (`377f3b4f1d`) |
| **Session model persistence** | `packages/session/*` | `822d735356 feat(session): persist model selection and share its catalog` |
| **Session log upload** | `packages/session/session-log-deepseek`, `packages/llm/plugin-package-inventory-deepseek` | Upload incremental session log (`fe72ab42d1`), upload plugin package metadata (`ea6f61f144`), telemetry mặc định feedback-gated sharing (`106e5ce0bc`) |
| **Headless** | — | `937d2b3513 feat(headless): stream reasoning progress to stderr` |
| **ACP** | `packages/bundle/acp-app` | `511181684c feat(acp): complete standard v1 automation controls` |
| **Workflow** | `packages/client/ui-workflow-run` | `941e5c5061 feat(workflow): let users control run and phase disclosures` |

### Provider compatibility — cấu hình `compat` mới

Trong `$DSH_HOME/settings.yaml`, route `llm-pi-ai` giờ nhận block `compat` (`PiAiCompatProfile`):

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      compat:
        supportsDeveloperRole: false   # gateway từ chối role: "developer"
        maxTokensField: max_tokens     # gateway chỉ biết max_tokens
      models:
        - id: my-model
        - id: my-reasoner
          compat:
            thinkingFormat: deepseek   # model-level thắng route-level theo từng field
```

Quy tắc: `compat` của model thắng của route theo từng field; field không set giữ giá trị catalog; catalog không mô tả thì rơi về detection của pi-ai. **Key để trống (`supportsDeveloperRole:`) bị từ chối**, không bị bỏ qua. Switch không hợp lệ với `api` đó cũng bị từ chối kèm danh sách switch hợp lệ. Tham chiếu đầy đủ: `docs/config-catalog.md#deepseek-aidsh-llm-pi-ai`.

---

## 5. Chức năng / thành phần BỊ LOẠI BỎ

| Bị xóa | Commit | Ghi chú |
|---|---|---|
| `packages/host/apiproxy` | `4f00a8b82a` | **Breaking** — xem §1.1 |
| `packages/client/runtime` | `be531688f3` | Consumer đã migrate sang controller client |
| `packages/client/web-react` | — | Thay bằng `ui-renderer` |
| `packages/client/schema-form` | — | — |
| `examples/` ở root (`acp-agent`, `headless-agent`, `jsonrpc-agent`) | `4125514a08` | `refactor(repo): retire top-level examples` — chuyển vào `apps/` hoặc bỏ |
| `packages/examples/acp-demo`, `packages/examples/jsonrpc-demo` | — | — |
| `packages/test-support/acp-snapshot` | `30762b63c9`, `5c67cf898c` | Đổi thành `packages/test-support/session-snapshot`; snapshot trung lập transport |
| **Fetch approval policy** | `797c711e11` | Từng được thêm ở `9fbcea099b feat(web): require one-shot fetch approval` rồi gỡ trong cùng khoảng này |
| **Image region reads** | `724783b024`, `cbc830aded` | Tool đọc vùng ảnh bị bỏ, fixture liên quan cũng gỡ |
| OpenAI skill metadata | `8c420de301` | — |
| `complete-persona` config | `43f0f07f9b` | Không dùng |
| Root tool filter của SDK | `d35459e3c1` | Không dùng |
| Private direct-config carrier (Python) | `1d4dcf3b57` | — |
| Directory error re-export (client) | `e5395b36af` | — |
| Compatibility imports (client) | `997ad27a60` | — |
| Feature module externals (client) | `81c922c7be` | — |
| ACP cancel classification không dùng | `0dcb514fc6` | — |
| Synchronous release runner | `b342b09401` | — |

---

## 6. Bảng package thêm/bớt đầy đủ

### Thêm (35)

```
packages/api/session-controller
packages/api/settings-controller
packages/api/workspace-controller
packages/bundle/acp-app
packages/bundle/sdk-app
packages/bundle/sdk-minimal
packages/client/store
packages/client/ui-approval
packages/client/ui-brand-official
packages/client/ui-chat
packages/client/ui-reference
packages/client/ui-renderer
packages/client/ui-session
packages/code-runtime/code-runtime-python
packages/context/file-reference
packages/context/file-reference-local
packages/credentials/authorization
packages/experimental/agent-team
packages/experimental/agent-team-profile
packages/experimental/agent-team-web-profile
packages/experimental/client-ui-agent-team
packages/experimental/inspector
packages/experimental/tool-agent-team
packages/experimental/webworker-packer
packages/experimental/webworker-runtime
packages/llm/deepseek-llm-api-extensions
packages/llm/plugin-package-inventory-deepseek
packages/session/session-log-deepseek
packages/shell/tool-pwsh-persistent
packages/subprocess/win32-process
packages/test-support/session-snapshot
packages/util/crypto
packages/util/workspace-path
packages/webhook/webhook
packages/webhook/webhook-github
```

### Bớt (11)

```
examples
examples/acp-agent
examples/headless-agent
examples/jsonrpc-agent
packages/client/runtime
packages/client/schema-form
packages/client/web-react
packages/examples/acp-demo
packages/examples/jsonrpc-demo
packages/host/apiproxy
packages/test-support/acp-snapshot
```

---

## 7. Hiệu năng

| Vùng | Commit | Nội dung |
|---|---|---|
| Packed history | `f2ca913756`, `1ec75c9082`, `f37bb35a97` | Client giữ record đã nén, fold packed assistant history mà không expand member |
| Turn rail | `1272c7d0df` | Accumulate thay vì scan lại loaded window |
| Session state | `69fad4b8db` | `serve cache-first session state` |
| Projection cache | `cdb4cc3c68`, `84db39cec4` | Một file `projection_cache.json` mỗi session; cold read seed từ cache rồi write back |
| SQLite | `93b4b98ef3`, `df76bc695b` | Tối ưu layout persistence, giảm dung lượng lưu trữ |
| Storage JSON | `501f387b46`, `83459fa476`, `08e546eff1` | Layout per-record; load file record song song; migrate một lần từ file whole-unit legacy |
| Client modules | `5bbaf168d9`, `9c3a0893f6` | Batch script plugin lúc startup; defer per-plugin revision hashing |
| API Gateway | `2d974b187e` | Skip decode output của Remote |
| Session projection | `265f02fbf5`, `a216756222` | Index restore tail liên tục, tránh copy |
| HMR | `1429737a52` | Chỉ poll client bundle |
| Token meter | `58a0e450b3` | Commit surface fold tại chỗ qua cặp plan/commit |

---

## 8. Thay đổi hạ tầng dev / test

- **Snapshot corpus tổ chức lại**: `snapshots/{acp,sdk,session,web}` — thêm mới ~519 file, +41k dòng. Snapshot dành riêng cho session recording (`1cfe0f9942`), tách khỏi golden (`6189e4a374`), trung lập transport (`30762b63c9`), drive qua owning profile (`6ca682733f`).
- **Script verify mới**: `verify-client-ui-i18n.ts` (+342), `verify-subsystem-pages.ts` (+139), `verify-runtime-closure.spec.ts` (+170), `verify-cordis-config.spec.ts` (+117) — kèm spec riêng cho từng script.
- **Vitest**: `vitest.expected.config.ts` mới; `vitest.config.ts` +102/−23.
- **TypeScript**: `tsconfig.base.json` +398/−106 — `perf(infra): map each workspace package to an explicit path alias` (`12c161e1a7`).
- **Website**: `build.ts` mới (+86); phục vụ mọi trang dưới dạng raw Markdown kèm index `llms.txt` (`f3ce8218cc`), index route ở địa chỉ clean-URL `.md` (`17c85209a0`).
- **Docs**: audit và purge chain-of-thought leakage khỏi prose (`934976732d`, `d72ff1f49a`, `17f85bdbcd`, `6b3e971805`, `750c7f7535`).
- Mọi README package chuyển sang format mới có frontmatter (`description`, `kind`) + mục chuẩn: Summary / Use this package / Understand the implementation / Further Exploration / Model Experience / Known Limitations / Dev Note.

---

## 9. Checklist cho agent khi làm việc trên bản mới

- [ ] **Không** import bất cứ thứ gì từ `@deepseek-ai/dsh-host-apiproxy` — package đã bị xóa. Dùng `ctx.remote.<namespace>`.
- [ ] **Không** import `dsh-client-runtime`, `dsh-client-web-react`, `dsh-client-schema-form`. Dùng `dsh-client-store` + `dsh-client-ui-renderer` + `dsh-client-ui-session`.
- [ ] Tìm code Chat trong `packages/client/ui-chat`, **không** phải `ui-conversation` (nay chỉ là shell trung lập).
- [ ] Tìm code approval trong `packages/client/ui-approval`.
- [ ] Tìm code `@file`/`@session` trong `packages/client/ui-reference`.
- [ ] Config nào còn ghi `code mode` → đổi sang `ptc`.
- [ ] Kiểm tra package tồn tại bằng `git ls-files`, **không** bằng `ls` — cả hai thư mục còn rác build.
- [ ] Test session dùng `packages/test-support/session-snapshot`, không phải `acp-snapshot`.
- [ ] Composer là Lexical editor — test phải target `[contenteditable]`, không phải `textarea` (xem `6f17d10102 test(web): finish the textarea-locator sweep`).

---

## 10. Trạng thái thư mục local — cần dọn

Thư mục `deepseek-harness-fork` (rc.7) còn lẫn artifact từ lần checkout v0.1.2 trước đó:

- `apps/frontend/` — untracked, không thuộc rc.7
- `packages/identity/user-ticket/`, `packages/session/session-access/` — thư mục rác
- Nhiều `lib/` là build của v0.1.2 chứ không phải rc.7
- `tmp/`, `.sessions/`, `tsconfig.tsbuildinfo`

Muốn trạng thái sạch:

```sh
git -C /Users/nguyencu/Desktop/Other/compare/deepseek-harness-fork clean -xdf
```

> ⚠️ Lệnh này xóa cả `node_modules/` và `.codegraph/`. Chạy `git clean -xdn` trước để xem danh sách sẽ bị xóa.
