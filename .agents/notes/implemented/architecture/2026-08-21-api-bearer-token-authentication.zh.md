# Agent Note: Bearer-token authentication for the /api surface

Status: implemented

[English](2026-08-21-api-bearer-token-authentication.md) | 中文

## Problem

/api 载体（[api-request-trust](../../../packages/client/connection/src/api-request-trust.ts)）一直是可达性栅栏，而非认证：当请求的 Host 为回环或已声明的 `trustedHosts` 权威、且其浏览器 CSRF 标记为同源时被接受，且一个特权子集（[浏览器信任边界 note](2026-07-28-api-browser-trust-boundary.md)）被钉在回环。这对同源 SPA 恰到好处，但它没有任何办法让某个特定的*服务端*客户端——部署自身的 Odoo 后端，从另一台机器通过 API 驱动 harness——触达该表面，或授予它对回环钉住方法的受控切片。信任栅栏刻意"不是认证层"，于是整个配置面因缺一层而只限回环本机。用户决定加上这一层：Bearer token，加一个配置驱动的、已认证客户端可调用的钉住方法清单。

## Decision

连接插件上一个选择性开启的 `auth` 配置，在可达性栅栏之上叠加 Bearer token 认证，位于新的受门控模块 [api-auth](../../../packages/client/connection/src/api-auth.ts)。默认与今天完全一致：未配置 token 时，`prepareApiAuth` 返回 undefined，每条路径原样运行。

**认证。** `authenticateApiRequest(headers, prepared)` 读取 `Authorization: Bearer <token>`（scheme 大小写不敏感），并分类为 `authenticated` / `invalid` / `absent`。比较在 SHA-256 摘要上做常量时间比较（固定 32 字节 `timingSafeEqual` 输入），且对每个已配置 token 都比较、无提前返回，因此 token 的值与位置都不会通过时间泄露。token `name` 仅用于日志与轮换，绝非 API 信任的身份。

**token 授予什么、不授予什么。** 载体应用的判定是 `reachable = isTrustedApiRequest(request, trustedHosts) || (authenticated && !requestHasBrowserMarker(request))`。有效 token 只绕过 Host 可达性检查，且仅对不带浏览器标记（无 `Origin`、无 `sec-fetch-site`）的请求：带标记的请求始终走完整栅栏，因此同源 SPA 不变，被盗 token 也无法从页面跨站重放。存在但未知的 token 在 HTTP 通道为 `401`（WS 上被拒绝），绝不悄悄降级为可达性。对回环钉住方法，已认证客户端可额外调用部署在 `auth.unpinned` 中列出的方法；未列出的钉住方法即便对已认证客户端也仍只限回环。钉住集合是固定常量（`PRIVILEGED_METHODS`）；`unpinned` 只把已有成员移入"已认证可调用"组，且每个条目必须是成员，否则加载失败。

**通道。** 该判定是一个共享闭包，应用于 HTTP `/api` route（unary POST、`/api/respond`、GET 下载、SSE-426 路径）与两个 WS upgrade。`http-bridge` 会把 `Authorization` 头转发进 Fetch 请求，因此钉住检查会一致地重新读取它。浏览器无法设置 WebSocket 请求头，因此 SPA 的 WS 路径保持同源回环且不带 token；服务端 WS 客户端用该头认证。

**配置，高声失败。** `auth: { tokens: [{ name, token }], unpinned: [<钉住方法>, …] }`。`prepareApiAuth` 在 token 短于 `MIN_API_TOKEN_LENGTH`（16；文档推荐 ≥32 个随机字符）或 `unpinned` 条目不在 `PRIVILEGED_METHODS` 中时于加载期抛出。`unpinned` 的代码默认为空；部署的初始选择——`agentPreset.read/copy/openDocument/remove`——位于其 cordis.yml 覆盖层，而非代码。

**对 Web 部署为强制。** `connection` 插件的 auth 保持通用的选择性开启（其他组合包不变），但 Web 表层（`dsh web`，`@deepseek-ai/dsh-web-app`）始终带 token 启动，使服务端客户端开箱即可认证。新的受门控模块 [`api-token.ts`](../../../packages/bundle/web-app/src/api-token.ts) 按以下顺序解析 token：设置了 `DSH_API_TOKEN` env 时用它（校验 ≥16，绝不持久化）→ 上一次启动持久化在 `$DSH_HOME/api-token`（默认 `~/.dsh/api-token`，与 harness 其余持久状态同一个根）的 token → 否则生成一个新的 32 字节十六进制 token，以 0600 原子持久化，并按文件路径（绝非值）记录一次日志：`dsh web: no API token found; generated one at <path> — read it with: cat <path>`。存在但不可读或格式错误（空/过短）的持久化文件会令启动失败，而非悄悄覆盖操作者的文件；可读但权限不对的文件保持原样。`web-runtime` 行解析它并发布 `webRuntime.apiToken`。因此 Web 认证始终激活，而回环 SPA 与 curl 通道不变。

**默认位于代码，而非 bundle patch。** 由于每个 Web 部署都用完全相同的设置，`apiTokenFile`、`trustedHosts` 与 `auth` 是代码默认，而非 cordis.patch.yml 表达式。`web-app` 的 `Config.apiTokenFile` 可选，缺省时解析为 `dshHomePath('api-token')`（web-app 现依赖 `@deepseek-ai/dsh-home-paths`），其 `Config.trustedHosts` 在为空时读取注入的 `webStartup` 服务。`connection` 插件通过 `ctx.get('webRuntime')` 读取可选的 `webRuntime`（绝非声明式 inject，因此没有 web-app 时仍可组合），当部署两者都未配置时，把 `trustedHosts` 默认为 `webRuntime.trustedHosts`、`auth` 默认为 `deriveWebRuntimeAuth(webRuntime.apiToken)`——一个授予 `DEFAULT_UNPINNED_METHODS`（`agentPreset.*` 创作面）的 `web` token。bundle patch 的 `connection` 行只保留 `inject: [webRuntime]` 用于启动排序（元数据，非配置），因此派生运行时 `webRuntime` 已存在。显式的 `trustedHosts`/`auth` 配置始终整体替换派生默认；schemastery 把缺省的数组/块物化为空，因此"空"即缺省信号。

## Alternatives considered

**HMAC 签名请求（共享密钥、每请求签名）。** 于此步被否决：它防御 bearer token 所不防的重放与篡改，但每个客户端（首先是一个 Odoo 模块）都需实现规范请求签名，而传输本就可在回环/LAN 上做 TLS 终结。bearer token 是服务端客户端可发送的最低摩擦凭据，且 Postman／任意 HTTP 客户端原生支持。若日后需要重放保护，HMAC 仍是可选项。

**mTLS（客户端证书）。** 现在被否决：很强，但它把信任移入证书签发与 webserver 的 TLS 配置，而本插件并不拥有它，且为单个 Odoo 集成来供给过重。若部署已运行 PKI，它仍是正确答案。

**来自身份提供方的 OIDC / bearer JWT。** 作为过早被否决：这是一个无用户目录的单租户本地/LAN 服务。JWT 会为尚不存在的多用户收益增加签名校验、密钥轮换与时钟处理。`tokens[].name` 字段为将来向按客户端身份演进留了余地，且无需改动线格式。

**把 `isTrustedApiRequest` 拆成 host-reachable 与 markers-ok 两半并组合 `markersOk && (host || authenticated)`。** 为更小表面的等价方案被否决：`!requestHasBrowserMarker` 旁路保持既有栅栏不变（无需重新覆盖其 host/marker 分支），并给出同样保证——带浏览器标记的请求绝不由 token 放行。发送多余标记头的服务端客户端会被 Host 栅栏约束，这是安全方向。

**在 `isTrustedApiRequest` 内部强制 token。** 被否决，以保持该模块为纯可达性策略（其自身 note 称它"不是认证层"）；认证是由载体叠加的、单独且单独测试的关注点。

## Consequences

部署现在可以用 token 向一个具名服务端客户端暴露 API，同时浏览器 SPA 仍不带 token 工作，并可把否则只限回环的方法的一个受控子集交给该客户端。可达性栅栏及其 ADR 不变；本 note 拥有其上的认证层。受门控逻辑位于 `api-auth.ts`（逐文件 100% 覆盖）；接线位于覆盖排除的 `index.ts`，由 node-half 集成测试演练（有效 token 从不受信 Host 通过、未知 token 401、已列出钉住方法允许、未列出钉住方法拒绝、未认证钉住方法不变、带浏览器标记的请求绝不被旁路、WS 拒绝/接受、加载期失败）。在 `unpinned` 中列出 `settings.*` 或 `credentials.*` 会把配置与 API-key 材料暴露给任何 token 持有者——已记录为部署的明确风险。无会话事件、无模型可见项，因此不涉及快照 fixture 或格式版本提升。轮换是叠加式的：把新 token 列在旧的旁边、迁移客户端、再移除旧的；二者同时列出时都可认证。被吊销的 token 在下次配置加载时生效。对强制的 Web token，轮换方式是删除 `$DSH_HOME/api-token`（下次启动会生成新的）或把 `DSH_API_TOKEN` 设为新值；生成的 token 绝不进入提交的 cordis.yml，也不记录任何密钥。Web token 的解析/持久化是其自身的受门控模块（`api-token.ts`，逐文件 100% 覆盖），带注入的 fs/env/clock；bundle 接线（其 `internals.resolveApiToken` 默认与 cordis.patch.yml 行）是薄的。

**代码默认的可接受后果。** 任何在提供 `webRuntime` 的行旁挂载 `dsh-client-connection` 的组合，现在默认即为强制认证，无需复述配置——这是用户所选的派生默认取舍，因为其所有部署都用此设置。它之所以安全，是因为默认 `unpinned` 集合只授予已认证客户端（无 token → 不可达），而 settings/credentials/host 钉住方法保持关闭。`deriveWebRuntimeAuth`/`DEFAULT_UNPINNED_METHODS` 逻辑受门控（`api-auth.ts`，100%）；`ctx.get('webRuntime')` 读取与"显式胜出"分支是被排除的 connection `index.ts` 接线，由 node-half 集成测试演练（派生 token 认证并触达四个钉住方法、未列出钉住方法被拒、无 webRuntime 即仅栅栏、显式配置整体覆盖）。`verify-cordis-config` 在精简后的 patch 上保持通过。
