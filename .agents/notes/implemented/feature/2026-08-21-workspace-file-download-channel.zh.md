# Agent Note: Workspace-file GET download channel

Status: implemented

[English](2026-08-21-workspace-file-download-channel.md) | 中文

## Problem

SPA 中的工具卡片带有 `locations`——某个工具在会话工作区内读取或写入的文件路径。查看会话记录的用户希望下载其中某个文件以便在本地查看，但该 API 没有任何方式把工作区文件交给浏览器。现有的下载面 `GET /api/session.export` 只流式返回会话日志 ZIP；其余每个 API 方法都是带 JSON 信封的 POST RPC，不适合原生下载管理器可直接消费的普通浏览器下载。工作区文件还带有会话日志导出所没有的安全维度：路径来自客户端，因此一次天真的读取只需一个 `../` 或符号链接就会流式返回宿主上的任意文件。

## Decision

第二个宿主侧下载通道，与 `session.export` 对称：`GET /api/workspace.file?sessionId=…&path=…` 把指定会话工作区目录中的一个常规文件流式返回为 `application/octet-stream` 附件（`content-length` 取自 stat；`content-disposition` 以文件的 basename 命名，同时给出 ASCII `filename` 回退与 RFC 5987 `filename*=UTF-8''…` ext-value，使非 ASCII 名称得以在响应头中保留）。`HEAD` 返回相同的状态与响应头并取消 body，与 `session.export` 的预检形状一致。载体路由（`toFetchHandler`）通过 `workspaceFileQuerySchema`（`{ sessionId, path: min(1) }`，该 domain 唯一的 `sessionIdSchema` brand 转换点）解析查询参数，查询非法时应答 400；`ApiProxy.downloads.workspaceFile` 实现读取。

**约束（containment）是安全核心。** 会话自身的 cwd 为根，由 `resolveSessionCwd` 在不创建或恢复 Agent 的前提下解析——已挂载时取实时会话 header（`ctx.get('sessions')?.get(id)?.header.cwd`），否则取持久化 header 的 `sessionPersistence.inspect(id).meta.cwd`，即 skills domain 与 `ensureSession` 已在使用的同两个来源。未知或不可读的会话，或未记录 cwd 的会话，在任何文件系统访问之前应答 404。随后 `streamWorkspaceFile` 解析被请求路径（绝对路径按原样使用，相对路径拼到根上），并对根与被请求文件都做 `realpath` 规范化，使工作区内的符号链接无法逃逸；规范化后的文件必须等于规范化后的根，或以 `canonicalRoot + sep` 开头。位于其外 → 403。缺失文件（realpath/stat ENOENT）或非常规文件（目录、fifo……）→ 404。只有到此才会流式返回字节，经 `node:fs` 的 `createReadStream(path, { signal })` 通过 `Readable.toWeb` 桥接为 web `ReadableStream`，因此请求中止与 Consumer 取消都会销毁该读取。

**为何无鉴权也安全。** 可达性即部署的信任边界：该 API 不带鉴权，且可达的客户端已能通过提示 Agent 去读取而泄露任意工作区文件。因此一次受约束的工作区下载不会扩大客户端本已可获得的任何东西；约束检查的存在只是为了阻止这个新通道变成工作区之外的任意宿主文件读取。

## Alternatives considered

**返回文件字节的、带 JSON 信封的 POST RPC 方法。** 其余每个 domain 方法都是一元 POST RPC，所以这是默认形状。被否决：浏览器下载需要原生下载管理器可跟随到 `content-disposition` 附件的普通 GET；base64-in-JSON 会膨胀传输、把整个文件放进单个 V8 字符串，并且仍需一个客户端步骤把它还原为下载。`session.export` 正是出于同样原因确立了无信封 GET 下载先例，新通道复用了它。

**像 `session.export` 净化其文件名那样净化 basename。** `sessionLogZipFilename` 把会话 id 净化为安全片段（`[^A-Za-z0-9_-]` → `_`），因为会话 id 没有有意义的非 ASCII 内容。真实的工作区文件名则有：把 `résumé.pdf` 弄成 `r_sum_.pdf` 会降低下载质量。被否决，改用一个正规的 `content-disposition` 构造器——ASCII `filename` 回退加 RFC 5987 `filename*`——在保持响应头安全的同时为现代客户端保留确切名称，即净化器只完成了一半的“非 ASCII 不得破坏响应头”目标。

**像 `session.export` 那样通过 `readRaw` 解析 cwd。** 日志导出读取工件并要求 `supportsRawArtifacts`。工作区文件读取只需要 cwd，而每个被服务的会话都在其 header 中记录了它；复用更轻的 `sessions`/`inspect` cwd 来源，避免把文件下载耦合到它并不使用的持久化能力，使 SQLite 后端部署（无原始工件）仍能提供工作区文件。

## Consequences

SPA 可以把工具卡片的 location 直接链接到 `GET /api/workspace.file`，浏览器即以其真实名称下载文件。该通道非模型可见且不发出会话事件，因此不涉及快照 fixture，也不涉及 `SESSION_FORMAT_VERSION` 提升。它的代价是载体必须与 RPC 边界保持一致地维护的第二个无信封路由（两个 GET 下载路由都位于仅 POST 的守卫之上），以及对一个已 `realpath` 的越界文件在 403 之前会先做一次 `stat`——这可以接受，因为 `realpath` 已经触碰过该路径，且在证明约束之前只读取元数据、绝不读取内容。
