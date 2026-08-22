# Agent Note: Settable preset display metadata after a copy

Status: implemented

[English](2026-08-22-agent-preset-update-display.md) | 中文

## Problem

`agentPreset.copy` 把 SOURCE preset 的 description 留在新副本上，并从 id（或调用者给的 `name`）派生其名字，理由是"文件之后归作者自己去改"。但并没有"之后"：要改一个 `user` preset 的展示文字，唯一办法是通过 `openDocument` 手工编辑 `preset.yml`，或删除后重新 copy。一个让用户重命名 preset、或修正其一行 description 的界面，没有任何 RPC 可调。

## Decision

新增 `agentPreset.update`——一个特权授权 RPC，在本地 preset 的 `preset.yml` 中设置其展示用 `name` 和/或 `description`，并保留 `order` 与已 stamp 的 `workspacePath`。它精确镜像既有的 `writePresetWorkspacePath`/`setWorkspacePath` 缝，而非另立一套约定。

- **Package 缝。** `dsh-agent-presets/authoring` 中的 `writePresetDisplay(roots, preset, updates)` 施加与 `writePresetWorkspacePath` 相同的两道守卫：仅 `user` trust，且解析出的目录必须位于可写根之下。它读取当前 metadata，仅合并 `updates` 中 PRESENT 的键（`'name' in updates`），再经 `renderPresetMetadata` 渲染。当合并把一切都清空时，它 `rm`（force）掉 `METADATA_FILE`，让该 preset 什么都不发布而非发布一个空白文档；否则以 0o600 模式原子写入。服务方法是 `AgentPresets.setDisplay(id, updates)`。
- **Set / clear / keep。** 以非空字符串出现的字段被设置；以空串或纯空白出现的字段被清除（走的是文件本就往返的同一个 `text()` 归一化）；缺席的字段保留当前值。这正是该 wire 方法暴露的三态行为。
- **回报有效值。** 网关从 payload 中 present 的键构造 `updates`，调用 `setDisplay`，随后 RE-RESOLVE 该 preset 并返回其有效的 `name`/`description`（像 `read` 那样省略 undefined），因此清除了某字段的客户端会看到它已消失。
- **Composition 仍是 copy-only。** `update` 只携带展示文字——没有 plugin 行、没有 composition 文本、没有路径。它不授予任何 `copy` 尚未授予的能力；它只编辑 picker 所显示的内容。

强制点仍留在兄弟缝所在之处。Trust 与可写根守卫住在 `writePresetDisplay` 里，而非网关——正是 `writePresetWorkspacePath` 施加它们的地方。随部署出厂的 preset 以 `PresetNotWritableError`（"it ships with the deployment"）被拒，由网关映射为 `agent-preset-read-only`，与 `openDocument` 一致。`agentPreset.update` 与 `read`/`copy`/`openDocument`/`remove` 并列注册进 `PRIVILEGED_METHODS`（dsh-client-connection）与 `DEFAULT_UNPINNED_METHODS`（api-auth）：它被钉在回环，且在强制 web token 下仅对已认证客户端可达。

## Alternatives considered

- **把 name/description 折进一个加宽的 `setWorkspacePath`。** 否决：两种编辑在精神上有不同守卫（workspace stamp 是 copy-then-provision 的一部分；display 编辑是独立的），清除语义也不同，而一个吞下全部 metadata 字段的方法会诱使调用者覆盖它们从未打算触碰的 `order` 或 `workspacePath`。`'key' in updates` 的作用域把每次写入限定为它恰好命名的内容。
- **只让调用者通过 `openDocument` 编辑 `preset.yml`。** 否决：那是一个原生桌面能力、一个裸 YAML 表面，不是浏览器重命名对话框能驱动的；它也没有 set/clear/keep 契约。
- **允许重命名任意 preset，包括出厂的。** 否决：出厂安装属于部署、不属于用户——正是 `copy`/`remove`/`openDocument`/`setWorkspacePath` 已经画下的那条线。

## Consequences

`preset.yml` 未新增字段——`name` 与 `description` 本就存在、本就经 `renderPresetMetadata`/`readPresetMetadata` 往返——因此没有 `SESSION_FORMAT_VERSION` 变化：展示 metadata 不是 session event，而 `update` 是全 token 的会话管理，从不进入 agent loop，也不产生任何 model 可见输出。无需 keyless snapshot，理由与 `copy`/`remove` 无需相同。一个副本现在可事后编辑，于是 `copy` 当初据以写就的"文件之后归作者自己去改"这一前提，终于有了产品内路径。Composition 仍是 copy-only：此缝上没有任何方法接受 plugin 行。
