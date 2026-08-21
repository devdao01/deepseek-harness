# Agent Note: Preset-conventional default workspaces

Status: implemented

[English](2026-08-21-preset-conventional-default-workspaces.md) | 中文

## Problem

用 `agentPreset.copy` 创作一个 preset 会创建组装，但把为它建立并注册工作区的活留给用户手动完成，之后会话才能落在合理的位置。此前没有把 preset 绑定到目录的约定，因此刚复制出的 `accounting` preset 会像其他未命名 create 一样在宿主进程 cwd 中启动会话。用户故事很直接：创建 preset `accounting` 时应一并给它一个位于 `~/workspace/accounting` 的默认工作区，并且在该 preset 下启动会话应落在那里，而无需客户端命名工作区。

## Decision

一个约定映射——preset `<id>` ⇄ `<presetWorkspacesRoot>/<id>`——在 copy 时 provision，并在 session-create 时被采纳。

**配置与解析。** 新增的 `ApiProxyService` 配置字段 `presetWorkspacesRoot?: string`（schemastery `z.string()`，可经 cordis 更改）命名该根。解析是一个显式的加载期步骤，而非隐藏的 `??`：`resolvePresetWorkspacesRoot(configured, os.homedir())` 把缺省 → `<home>/workspace`，`~/` 前缀 → 相对于 home，其余任何值必须是绝对路径，遇相对值即抛出，使配置错误在构造时高声失败，而非悄悄把工作区扎根于进程 cwd。纯解析、id 安全检查以及 id→路径拼接都在受门控的 `src/preset-workspace.ts` 中（逐文件 100% 覆盖）；`createApiProxy` 在构造时调用一次解析器，且该解析器对已是绝对路径的值是幂等的，因此对插件已解析的根再解析是无操作。

**`agentPreset.copy` 进行 provision 并持久化。** preset 复制成功后，处理器计算 `<root>/<agentPreset>`，对其 `mkdir -p`，通过与 `workspace.create` 相同的 `ensureWorkspace` 链创建或采纳一个工作区（幂等：重复复制或已存在目录会采纳而非失败），并经 `AgentPresets.setWorkspacePath` 把该工作区的规范路径 stamp 到新 preset 的元数据上。响应从 `{ agentPreset }` 扩展为 `{ agentPreset, workspace: WorkspaceView }`。id 会用 `isPresetWorkspaceIdSafe` 检查——分隔符或 `.`/`..` 段以 `agent-preset-invalid` 拒绝——在复制任何东西之前，因此危险 id 绝不会到达名单或某个 `join`。复制—provision—stamp 是一个操作：若 provision 或 stamp 在 preset 已复制之后失败，刚复制的 preset 会被移除（经创作 `remove` 路径回滚），且该调用以 `directory-create-failed` 回答并指明路径。

**该关联被持久化，而非仅是约定。** preset 目录的元数据文件（`preset.yml`）新增一个可选 `workspacePath`（绝对；相对或格式错误的值读为缺失，与展示字段相同的非致命退化）。`AgentPreset` 与 wire 的 `AgentPresetEntry` 携带它，`agentPreset.list` 返回它，而 `AgentPresets.setWorkspacePath(id, path)`（`dsh-agent-presets` 中一个狭窄的创作写入，像 `remove` 一样限定于可写根下的 `user` preset）在保留 preset 既有展示文本的同时 stamp 它。discovery 已把元数据 spread 到 `AgentPreset` 上，因此一旦元数据读取器与类型声明该字段，它便自然流通。

**`session.create` 的 preset 默认优先使用存储路径。** cwd 链在 `workspace?.path ?? cwd ?? defaults.cwd` 之前新增一步：当一个 create 既不命名 `workspaceId` 也不命名 `cwd`，但命名了 `agentPreset` 时，处理器解析一个查找路径——preset 发布了 `workspacePath` 时用它，否则用重新计算的 `<root>/<agentPreset>` 约定（仅对 `isPresetWorkspaceIdSafe` 的 id）——并在注册表中查找该规范路径上的工作区。找到时就把它当作被命名的工作区：会话附着其上并以其路径作为 cwd，复用既有的附着路径而非仅设置 cwd。缺失的注册（或不再存在的目录——`resolveByPath` 在 `realpath` ENOENT 时拒绝，会被捕获）回落到 `defaults.cwd`；只有 `copy` 会 provision，因此被删除的注册保持为用户的选择、绝不自动创建。不带 `agentPreset` 的 create（DEFAULT preset）不做查找。注册表读取由 `ctx.get('workspaceRegistry')` 守卫、存储路径读取由 `ctx.get('agentPresets')` 守卫，因此未挂载二者之一的部署或测试会直接跳过该步。

## Alternatives considered

**在 `session.create` 中当约定目录缺失时自动 mkdir。** 被否决：一个悄悄重建用户已删除目录的 session-create 会与用户意图相抵触，而注册表是工作区存在与否的记录。只有 `copy`——显式的创作行为——进行 provision；`session.create` 只读取。

**在 `run()` 内用隐藏的 `?? join(homedir(), 'workspace')` 解析 `presetWorkspacesRoot`。** 依据仓库的"defaulting 是显式解析步骤，绝非 run 内隐藏的 `??`"规则被否决，也因为相对配置错误会因此悄悄把工作区扎根于进程 cwd。显式解析器改为在加载时抛出。

**只返回 `{ agentPreset }`，让客户端经 `workspace.list` 获取工作区。** 被否决：copy 是知晓所 provision 工作区的提交点，回显它让客户端无需再一次往返即可对新 preset 的工作区分组——这正是 `session.create` 已用来回显所解析 preset 的同一理由。

**只通过创作自身的 preset-id 规则校验 id。** 对路径 `join` 而言不足以为凭：约束守卫不得信任创作会禁止分隔符或 `..`，因此 `isPresetWorkspaceIdSafe` 在构建任何文件系统路径之前重新检查。

**把 workspace-path stamp 折叠进 `copy` 调用以实现单次原子写入。** 有诱惑力——不存在 preset 已存在却尚无 `workspacePath` 的窗口——但规范路径只有在 provision 之后才可知（`ensureWorkspace` 返回 realpath 后的目录），因此 stamp 必须跟在 copy 之后。故 `setWorkspacePath` 是一次独立的创作写入，stamp 失败与 provision 失败共用回滚路径。中间窗口是良性的：已复制但尚未 stamp 的 preset 经约定回落解析，指向同一目录。

**存储 `realpath` 之前的约定路径，好让 `copy` 在 provision 前 stamp。** 被否决：`session.create` 是与注册表的规范（realpath 后）路径比较的，而存储约定拼写在符号链接根上会读出不同结果（macOS `/tmp` → `/private/tmp`）。stamp 所 provision 工作区自身的 `path` 使存储值恰好等于后续查找所解析到的值。

## Consequences

创建一个 preset 现在会产出一个就绪的工作区，该关联被持久化在 preset 上，而只命名 preset 的会话会落在其中——端到端实现了该用户故事。`presetWorkspacesRoot` 是唯一的新旋钮；其默认值使零配置部署保持在 `~/workspace/<preset>`。wire 变更是 copy 响应（`{ agentPreset, workspace }`）与新增的 `AgentPresetEntry.workspacePath`；`dsh-client-connection` 的 fixture 对两者都做了镜像（其 `copy` stamp 一个假路径、`list` 呈现它），apiproxy 载体测试桩也已更新。`preset.yml` 新增一个 `workspacePath` 键，但元数据读取器忽略未知/格式错误的值，因此不涉及任何磁盘格式版本；该特性非模型可见且不发出会话事件，因此也不涉及快照 fixture 或 `SESSION_FORMAT_VERSION` 提升。`agentPreset.copy` 现在依赖一个已挂载的 `workspaceRegistry`（生产中始终存在，位于服务 inject 列表）与名单的 `setWorkspacePath`；只命名 preset 的单元测试仅在演练 copy 之处才把注册表接入。provision 为每次 copy 增加一次 `mkdir`、一次注册表写入与一次元数据写入，回滚为罕见的失败路径增加一次 preset 移除；全部有界且局部。stamp 是一次元数据文件重写，读取并重新渲染 preset 的 `preset.yml`，保留其名称与描述。
