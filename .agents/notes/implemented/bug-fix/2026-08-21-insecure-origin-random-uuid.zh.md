# Agent Note: crypto.randomUUID is secure-context-only in the browser client layer

Status: implemented

[English](2026-08-21-insecure-origin-random-uuid.md) | 中文

## Problem

从明文 HTTP 的 LAN 源（`http://192.168.60.16:3080`）打开的标准 Web UI 永远循环 `[web-runtime] connection lost, retry #N`。根因：`AbstractApiClient.mintRpcId`（`packages/host/apiproxy/src/fetch/client.ts`）调用了 `crypto.randomUUID()`。浏览器仅在安全上下文（HTTPS 或 `localhost`）暴露 `crypto.randomUUID`；在不安全源上它是 `undefined`，因此该调用在任何 fetch 之前于连接 generation 的就绪握手内同步抛出。catch 中止了该 generation，从而在两个 WebSocket 仍处于 `CONNECTING` 时关闭它们（"WebSocket is closed before the connection is established"），控制器便无限重试。在该源的真实浏览器中已验证：`isSecureContext:false`、`typeof crypto.randomUUID === 'undefined'`、`getRandomValues` 可用；到同一 URL 的原始 WS 正常工作（流的 rpcId 在宿主侧铸造，绝不在浏览器）。旧注释——"crypto.randomUUID 是 Web API（浏览器 + Node ≥19）：使该基类平台中立"——是错的：它在浏览器*源*之间并不中立。

## Decision

`mintRpcId` 现在使用基于 `getRandomValues` 的辅助函数 `randomUuid()`，它不带任何安全上下文要求，在每个源（以及 Node ≥19，其全局 `crypto` 暴露相同的 Web Crypto 表面）上都工作。该辅助是规范实现，位于 apiproxy 的浏览器安全客户端层：`packages/host/apiproxy/src/fetch/random-uuid.ts`，从 `fetch/client.ts` 重新导出，因此可达 `@deepseek-ai/dsh-host-apiproxy/client` 子路径（对客户端 bundle 为 INLINE_SAFE）。`mintRpcId` 无条件使用它，而非在 `crypto.randomUUID?.()` 上分支，因为该能力随源而非平台变化，分支会让最要紧的不安全路径基本无法被覆盖。

此前重复的副本 `packages/client/connection/src/client/random-uuid.ts` 已删除；其导入方（`client/rpc.ts`、`client/fixture.ts`）现从 apiproxy 导出导入，只留一份实现。对浏览器可达代码的排查发现另一处仅安全上下文的用法——`ui-conversation` 的 `browserDraftAttachment`（用 `crypto.randomUUID()` 生成草稿附件 id）——现经同一辅助路由（`ui-conversation` 新增 `@deepseek-ai/dsh-host-apiproxy` 依赖）。宿主侧的 `node:crypto` `randomUUID`（`api-proxy.ts`、`fetch/handler.ts`、WS 下行）仅在宿主，保持不变。

## Alternatives considered

**存在时优先 `crypto.randomUUID?.()`，否则回退到辅助。** 被否决：在其可用的源上原生调用毫无增益，而分支的不安全分支恰恰是最要紧却最难持续演练的。单一无条件路径更简单且可证明与源无关。

**把 `randomUUID` polyfill 赋到 `globalThis.crypto` 上。** 被否决：为修一个调用点而改动全局 Web API 表面，比一个局部辅助更广更诡异，且会为将来任何仅安全上下文的 API 掩盖同一陷阱。

**把辅助保留在 `dsh-client-connection` 让 apiproxy 导入它。** 因依赖方向被否决：`dsh-client-connection` 依赖 `dsh-host-apiproxy`，而非反之，因此规范的浏览器安全铸造辅助应在 `mintRpcId` 所在的 apiproxy 客户端层。

## Consequences

Web UI 在明文 HTTP 的 LAN 源上启动并保持连接，且在那里附加图片不再抛出。只有一个浏览器安全 UUID 辅助，从 `@deepseek-ai/dsh-host-apiproxy/client` 导出；`random-uuid.ts` 逐文件 100% 覆盖，一个 `mintRpcId` 测试钉住不安全上下文路径（stub 的 `crypto` 只含 `getRandomValues`）。更广的教训值得防范：**仅安全上下文的 Web API**（`crypto.randomUUID`、`crypto.subtle` 等）是浏览器客户端层的陷阱——它们通过每个 localhost/HTTPS 测试，只在明文 HTTP 的 LAN 源上失败，而那正是 token/LAN 工作所面向的部署。新的浏览器可达代码通过与源无关的原语（`getRandomValues`）或共享辅助铸造 id 与哈希，绝不用 `crypto.randomUUID`。宿主侧 `node:crypto` 不受影响。无 wire、格式或会话事件变更。
