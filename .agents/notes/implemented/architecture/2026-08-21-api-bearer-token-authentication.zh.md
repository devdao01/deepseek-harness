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

**配置，高声失败。** `auth: { tokens: [{ name, token }], unpinned: [<钉住方法>, …] }`。`prepareApiAuth` 在 token 短于 `MIN_API_TOKEN_LENGTH`（16；文档推荐 ≥32 个随机字符）或 `unpinned` 条目不在 `PRIVILEGED_METHODS` 中时于加载期抛出。`unpinned` 的代码默认为空；部署的初始选择——`agentPreset.read/copy/openDocument/remove`——位于其 cordis.yml 覆盖层，而非代码。token 由环境提供（`token: !!js process.env.DSH_API_TOKEN`）。

## Alternatives considered

**HMAC 签名请求（共享密钥、每请求签名）。** 于此步被否决：它防御 bearer token 所不防的重放与篡改，但每个客户端（首先是一个 Odoo 模块）都需实现规范请求签名，而传输本就可在回环/LAN 上做 TLS 终结。bearer token 是服务端客户端可发送的最低摩擦凭据，且 Postman／任意 HTTP 客户端原生支持。若日后需要重放保护，HMAC 仍是可选项。

**mTLS（客户端证书）。** 现在被否决：很强，但它把信任移入证书签发与 webserver 的 TLS 配置，而本插件并不拥有它，且为单个 Odoo 集成来供给过重。若部署已运行 PKI，它仍是正确答案。

**来自身份提供方的 OIDC / bearer JWT。** 作为过早被否决：这是一个无用户目录的单租户本地/LAN 服务。JWT 会为尚不存在的多用户收益增加签名校验、密钥轮换与时钟处理。`tokens[].name` 字段为将来向按客户端身份演进留了余地，且无需改动线格式。

**把 `isTrustedApiRequest` 拆成 host-reachable 与 markers-ok 两半并组合 `markersOk && (host || authenticated)`。** 为更小表面的等价方案被否决：`!requestHasBrowserMarker` 旁路保持既有栅栏不变（无需重新覆盖其 host/marker 分支），并给出同样保证——带浏览器标记的请求绝不由 token 放行。发送多余标记头的服务端客户端会被 Host 栅栏约束，这是安全方向。

**在 `isTrustedApiRequest` 内部强制 token。** 被否决，以保持该模块为纯可达性策略（其自身 note 称它"不是认证层"）；认证是由载体叠加的、单独且单独测试的关注点。

## Consequences

部署现在可以用 token 向一个具名服务端客户端暴露 API，同时浏览器 SPA 仍不带 token 工作，并可把否则只限回环的方法的一个受控子集交给该客户端。可达性栅栏及其 ADR 不变；本 note 拥有其上的认证层。受门控逻辑位于 `api-auth.ts`（逐文件 100% 覆盖）；接线位于覆盖排除的 `index.ts`，由 node-half 集成测试演练（有效 token 从不受信 Host 通过、未知 token 401、已列出钉住方法允许、未列出钉住方法拒绝、未认证钉住方法不变、带浏览器标记的请求绝不被旁路、WS 拒绝/接受、加载期失败）。在 `unpinned` 中列出 `settings.*` 或 `credentials.*` 会把配置与 API-key 材料暴露给任何 token 持有者——已记录为部署的明确风险。无会话事件、无模型可见项，因此不涉及快照 fixture 或格式版本提升。轮换是叠加式的：把新 token 列在旧的旁边、迁移客户端、再移除旧的；二者同时列出时都可认证。被吊销的 token 在下次配置加载时生效。`!!js process.env.DSH_API_TOKEN` 覆盖层使密钥不进入提交的 cordis.yml。
