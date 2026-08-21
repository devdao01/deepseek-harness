# Agent Note: Preset-conventional default workspaces

Status: implemented

[English](2026-08-21-preset-conventional-default-workspaces.md) | 中文

## Problem

用 `agentPreset.copy` 创作一个 preset 会创建组装，但把为它建立并注册工作区的活留给用户手动完成，之后会话才能落在合理的位置。此前没有把 preset 绑定到目录的约定，因此刚复制出的 `accounting` preset 会像其他未命名 create 一样在宿主进程 cwd 中启动会话。用户故事很直接：创建 preset `accounting` 时应一并给它一个位于 `~/workspace/accounting` 的默认工作区，并且在该 preset 下启动会话应落在那里，而无需客户端命名工作区。

## Decision

一个约定映射——preset `<id>` ⇄ `<presetWorkspacesRoot>/<id>`——在 copy 时 provision，并在 session-create 时被采纳。

**配置与解析。** 新增的 `ApiProxyService` 配置字段 `presetWorkspacesRoot?: string`（schemastery `z.string()`，可经 cordis 更改）命名该根。解析是一个显式的加载期步骤，而非隐藏的 `??`：`resolvePresetWorkspacesRoot(configured, os.homedir())` 把缺省 → `<home>/workspace`，`~/` 前缀 → 相对于 home，其余任何值必须是绝对路径，遇相对值即抛出，使配置错误在构造时高声失败，而非悄悄把工作区扎根于进程 cwd。纯解析、id 安全检查以及 id→路径拼接都在受门控的 `src/preset-workspace.ts` 中（逐文件 100% 覆盖）；`createApiProxy` 在构造时调用一次解析器，且该解析器对已是绝对路径的值是幂等的，因此对插件已解析的根再解析是无操作。

**`agentPreset.copy` 进行 provision。** preset 复制成功后，处理器计算 `<root>/<agentPreset>`，对其 `mkdir -p`，并通过与 `workspace.create` 相同的 `ensureWorkspace` 链创建或采纳一个工作区（幂等：重复复制或已存在目录会采纳而非失败）。响应从 `{ agentPreset }` 扩展为 `{ agentPreset, workspace: WorkspaceView }`。id 会用 `isPresetWorkspaceIdSafe` 检查——分隔符或 `.`/`..` 段以 `agent-preset-invalid` 拒绝——在复制任何东西之前，因此危险 id 绝不会到达名单或某个 `join`。复制—provision 是一个操作：若 provision 在 preset 已复制之后失败，刚复制的 preset 会被移除（经创作 `remove` 路径回滚），且该调用以 `directory-create-failed` 回答并指明路径。

**`session.create` 约定默认。** cwd 链在 `workspace?.path ?? cwd ?? defaults.cwd` 之前新增一步：当一个 create 既不命名 `workspaceId` 也不命名 `cwd`，但命名了 `agentPreset` 时，处理器在注册表中查找规范路径等于 `<root>/<agentPreset>` 的工作区，找到时就把它当作被命名的工作区——会话附着其上并以其路径作为 cwd，复用既有的附着路径而非仅设置 cwd。缺失的注册（或不再存在的目录——`resolveByPath` 在 `realpath` ENOENT 时拒绝，会被捕获）回落到 `defaults.cwd`；只有 `copy` 会 provision，因此被删除的注册保持为用户的选择、绝不自动创建。不带 `agentPreset` 的 create（DEFAULT preset）不做约定查找。该查找由 `ctx.get('workspaceRegistry')` 守卫，因此未挂载注册表的部署或测试会直接跳过它。

## Alternatives considered

**在 `session.create` 中当约定目录缺失时自动 mkdir。** 被否决：一个悄悄重建用户已删除目录的 session-create 会与用户意图相抵触，而注册表是工作区存在与否的记录。只有 `copy`——显式的创作行为——进行 provision；`session.create` 只读取。

**在 `run()` 内用隐藏的 `?? join(homedir(), 'workspace')` 解析 `presetWorkspacesRoot`。** 依据仓库的"defaulting 是显式解析步骤，绝非 run 内隐藏的 `??`"规则被否决，也因为相对配置错误会因此悄悄把工作区扎根于进程 cwd。显式解析器改为在加载时抛出。

**只返回 `{ agentPreset }`，让客户端经 `workspace.list` 获取工作区。** 被否决：copy 是知晓所 provision 工作区的提交点，回显它让客户端无需再一次往返即可对新 preset 的工作区分组——这正是 `session.create` 已用来回显所解析 preset 的同一理由。

**只通过创作自身的 preset-id 规则校验 id。** 对路径 `join` 而言不足以为凭：约束守卫不得信任创作会禁止分隔符或 `..`，因此 `isPresetWorkspaceIdSafe` 在构建任何文件系统路径之前重新检查。

## Consequences

创建一个 preset 现在会产出一个就绪的工作区，而只命名 preset 的会话会落在其中——端到端实现了该用户故事。`presetWorkspacesRoot` 是唯一的新旋钮；其默认值使零配置部署保持在 `~/workspace/<preset>`。copy 响应是一处 wire 变更（`{ agentPreset, workspace }`）；`dsh-client-connection` 中的 fixture 与之对应，两个 apiproxy 载体测试桩也已更新。该特性非模型可见且不发出会话事件，因此不涉及快照 fixture，也不涉及 `SESSION_FORMAT_VERSION` 提升。`agentPreset.copy` 现在依赖一个已挂载的 `workspaceRegistry`（生产中始终存在，位于服务 inject 列表）；只命名 preset 的单元测试仅在演练 copy 之处才把注册表接入。provision 为每次 copy 增加一次 `mkdir` 与一次注册表写入，回滚为罕见的失败路径增加一次 preset 移除；二者都是有界且局部的。
