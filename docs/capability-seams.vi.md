<!-- Tệp nguồn tiếng Anh do scripts/gen-doc-graphs.ts sinh ra; tệp tiếng Việt này là bản đối chiếu đã được rà soát, duy trì qua ghép cặp song ngữ.
     Khi cập nhật, trước tiên chạy `pnpm run gen-doc-graphs` để cập nhật bản tiếng Anh, sau đó cập nhật tệp này rồi chạy `pnpm run verify-translation-pairing --write docs/capability-seams.md` để ghi lại cặp ghép. -->

# Capability Seams và các service lõi

[English](capability-seams.md) | Tiếng Việt

Một service có thể là service trục chính lõi, một capability seam có thể thay thế được, hoặc một bundle/điểm tổ hợp. Sơ đồ dưới đây thể hiện các package sở hữu khai báo service, các package triển khai đã biết, và các package tiêu thụ trực tiếp service đó.

```mermaid
flowchart LR
  pkg_attachment["attachment"]
  svc_attachments["ctx.attachments<br/>Durable binary attachment storage"]
  pkg_attachment_local["attachment-local"]
  pkg_host_runtime["host-runtime"]
  pkg_llm_pi_ai["llm-pi-ai"]
  pkg_llm["llm"]
  svc_llm["ctx.llm<br/>LLM adapter registry"]
  pkg_llm_deepseek["llm-deepseek"]
  pkg_llm_replay["llm-replay"]
  pkg_agent_loop["agent-loop"]
  pkg_compaction_basic["compaction-basic"]
  pkg_token_meter["token-meter"]
  svc_tokenMeter["ctx.tokenMeter<br/>Replay token measurement"]
  pkg_compaction_tool_result_pruner["compaction-tool-result-pruner"]
  svc_toolResultPruner["ctx.toolResultPruner<br/>Model-free tool-result pruning"]
  pkg_session["session"]
  svc_sessions["ctx.sessions<br/>In-memory session store"]
  pkg_agent["agent"]
  pkg_session_persistence["session-persistence"]
  pkg_session_query["session-query"]
  pkg_session_query_sqlite["session-query-sqlite"]
  pkg_subagent_inprocess["subagent-inprocess"]
  pkg_invariants["invariants"]
  pkg_message_feedback["message-feedback"]
  svc_invariants["ctx.invariants<br/>Package-owned invariant registry"]
  pkg_scope["scope"]
  pkg_typert_registry["typert-registry"]
  svc_typert["ctx.typert<br/>Runtime type registry"]
  pkg_typert_loader["typert-loader"]
  pkg_api_gateway["api-gateway"]
  svc_typertGateway["ctx.typertGateway<br/>Typert Host invocation gateway"]
  svc_sessionPersistence["ctx.sessionPersistence<br/>Durable session persistence seam"]
  pkg_session_persistence_jsonl["session-persistence-jsonl"]
  pkg_session_persistence_sqlite["session-persistence-sqlite"]
  pkg_tool_bash["tool-bash"]
  pkg_hooks_claude_code["hooks-claude-code"]
  pkg_hooks_codex["hooks-codex"]
  pkg_settings["settings"]
  svc_settings["ctx.settings<br/>User-settings seam"]
  pkg_settings_file["settings-file"]
  pkg_apiproxy["apiproxy"]
  pkg_credentials["credentials"]
  svc_credentials["ctx.credentials<br/>Credential seam"]
  pkg_credentials_local["credentials-local"]
  pkg_session_telemetry["session-telemetry"]
  svc_sessionTelemetry["ctx.sessionTelemetry<br/>Session telemetry seam"]
  pkg_session_telemetry_otel["session-telemetry-otel"]
  pkg_storage["storage"]
  svc_storage["ctx.storage<br/>Non-session storage hub"]
  pkg_storage_json["storage-json"]
  pkg_storage_sqlite["storage-sqlite"]
  pkg_storage_domain["storage-domain"]
  svc_storageDomain["ctx.storageDomain<br/>Domain data facility"]
  pkg_workspace["workspace"]
  svc_messageFeedback["ctx.messageFeedback<br/>Lifecycle-bound message feedback"]
  svc_workspaceRegistry["ctx.workspaceRegistry<br/>Workspace entity registry"]
  pkg_session_access["session-access"]
  svc_sessionAccess["ctx.sessionAccess<br/>Per-session access-control list"]
  svc_sessionQuery["ctx.sessionQuery<br/>Session reads, traces, filters, and search"]
  pkg_session_reference["session-reference"]
  pkg_tool_session_query["tool-session-query"]
  svc_sessionReferenceResolver["ctx.sessionReferenceResolver<br/>Cross-session snapshot preparation"]
  pkg_session_title["session-title"]
  svc_sessionTitle["ctx.sessionTitle<br/>Log-backed session titles"]
  pkg_session_title_first_prompt_llm["session-title-first-prompt-llm"]
  pkg_session_title_all_prompts_llm["session-title-all-prompts-llm"]
  pkg_system_prompt["system-prompt"]
  svc_systemPrompt["ctx.systemPrompt<br/>System prompt assembly registry"]
  pkg_tools["tools"]
  pkg_tool_fs["tool-fs"]
  pkg_tool_terminal["tool-terminal"]
  pkg_tool_web["tool-web"]
  svc_tools["ctx.tools<br/>Tool registry and guarded execution pipeline"]
  pkg_tool_ask_user["tool-ask-user"]
  pkg_tool_cordis["tool-cordis"]
  pkg_tool_skill["tool-skill"]
  pkg_tool_subagent["tool-subagent"]
  pkg_tool_todo["tool-todo"]
  pkg_user_questions["user-questions"]
  svc_userQuestions["ctx.userQuestions<br/>Human question/answer seam"]
  pkg_plan_mode["plan-mode"]
  svc_planMode["ctx.planMode<br/>Plan collaboration state"]
  pkg_agent_presets["agent-presets"]
  svc_agentPresets["ctx.agentPresets<br/>Per-session agent composition"]
  pkg_commands["commands"]
  svc_commands["ctx.commands<br/>Human command registry"]
  pkg_session_projection["session-projection"]
  svc_sessionProjections["ctx.sessionProjections<br/>Session projection units"]
  pkg_host_apiproxy["host-apiproxy"]
  pkg_session_projection_cache["session-projection-cache"]
  svc_sessionProjectionCache["ctx.sessionProjectionCache<br/>Persisted projection cache"]
  pkg_skill["skill"]
  svc_skills["ctx.skills<br/>Skill provider registry"]
  pkg_skill_badge["skill-badge"]
  pkg_skill_filesystem["skill-filesystem"]
  svc_agents["ctx.agents<br/>Agent service"]
  pkg_acp["acp"]
  pkg_agent_default_model["agent-default-model"]
  svc_agentDefaultModel["ctx.agentDefaultModel<br/>Default Agent model selection"]
  pkg_headless["headless"]
  svc_agentLoop["ctx.agentLoop<br/>Concrete loop driver"]
  pkg_agent_spine_demo["agent-spine-demo"]
  pkg_goal["goal"]
  svc_goals["ctx.goals<br/>Same-session goal domain"]
  pkg_e2b["e2b"]
  svc_e2b["ctx.e2b<br/>E2B sandbox lifecycle owner"]
  pkg_fs_e2b["fs-e2b"]
  pkg_subprocess_e2b["subprocess-e2b"]
  pkg_subprocess["subprocess"]
  svc_subprocess["ctx.subprocess<br/>Subprocess seam"]
  pkg_subprocess_local["subprocess-local"]
  pkg_bash_local["bash-local"]
  pkg_bash_sandbox["bash-sandbox"]
  pkg_terminal_bash["terminal-bash"]
  pkg_lsp_stdio["lsp-stdio"]
  pkg_subagent_acp["subagent-acp"]
  pkg_subagent_codex["subagent-codex"]
  pkg_subagent_claude_code["subagent-claude-code"]
  pkg_shell["shell"]
  svc_shell["ctx.shell<br/>Bash executor seam"]
  pkg_pwsh_local["pwsh-local"]
  pkg_tool_pwsh["tool-pwsh"]
  pkg_shell_env["shell-env"]
  svc_shellEnv["ctx.shellEnv<br/>Managed bash environment registry"]
  pkg_terminal["terminal"]
  svc_terminals["ctx.terminals<br/>Persistent PTY session registry"]
  pkg_sandbox["sandbox"]
  svc_sandbox["ctx.sandbox<br/>Process-sandbox seam"]
  pkg_sandbox_local["sandbox-local"]
  pkg_sandbox_policy["sandbox-policy"]
  svc_sandboxPolicy["ctx.sandboxPolicy<br/>Sandbox policy home"]
  pkg_fs_sandbox["fs-sandbox"]
  pkg_approval["approval"]
  svc_approval["ctx.approval<br/>Approval seam"]
  pkg_permission_presets["permission-presets"]
  svc_permissionPresets["ctx.permissionPresets<br/>Permission presets"]
  pkg_code_runtime["code-runtime"]
  svc_codeRuntime["ctx.codeRuntime<br/>Code-execution seam"]
  pkg_code_runtime_worker["code-runtime-worker"]
  pkg_fs["fs"]
  svc_fs["ctx.fs<br/>Filesystem provider seam"]
  pkg_fs_local["fs-local"]
  pkg_fs_observation_policy["fs-observation-policy"]
  pkg_compaction["compaction"]
  svc_compaction["ctx.compaction<br/>Compaction seam"]
  pkg_subagent["subagent"]
  svc_subagents["ctx.subagents<br/>Subagent provider and continuation service"]
  pkg_subagent_spawn_in_process["subagent-spawn-in-process"]
  pkg_subagent_fork_in_process["subagent-fork-in-process"]
  pkg_subagent_dsh_sdk["subagent-dsh-sdk"]
  pkg_tool_subagent_control["tool-subagent-control"]
  pkg_tool_ralph["tool-ralph"]
  pkg_jobs["jobs"]
  svc_jobs["ctx.jobs<br/>Background job registry"]
  pkg_jobs_local["jobs-local"]
  pkg_tool_jobs["tool-jobs"]
  pkg_web["web"]
  svc_web["ctx.web<br/>Web access provider registry"]
  pkg_web_search_exa["web-search-exa"]
  pkg_web_search_perplexity["web-search-perplexity"]
  pkg_web_search_deepseek["web-search-deepseek"]
  pkg_web_fetch_http["web-fetch-http"]
  pkg_spill["spill"]
  svc_spillStore["ctx.spillStore<br/>Spill storage seam"]
  pkg_spill_local["spill-local"]
  pkg_spill_policy["spill-policy"]
  pkg_directory_picker["directory-picker"]
  svc_directoryPicker["ctx.directoryPicker<br/>Workspace-directory picking seam"]
  pkg_directory_picker_native["directory-picker-native"]
  pkg_directory_picker_browse["directory-picker-browse"]
  pkg_webserver["webserver"]
  svc_webServer["ctx.webServer<br/>HTTP route registration"]
  pkg_connection["connection"]
  pkg_modules["modules"]
  pkg_hmr["hmr"]
  svc_clientModules["ctx.clientModules<br/>Client plugin graph host"]
  pkg_workflow["workflow"]
  svc_workflowEngine["ctx.workflowEngine<br/>Workflow script engine"]
  pkg_workflow_worker_thread["workflow-worker-thread"]
  pkg_tool_workflow["tool-workflow"]
  pkg_lsp["lsp"]
  svc_lsp["ctx.lsp<br/>Language-server navigation seam"]
  pkg_lsp_local["lsp-local"]
  pkg_tool_lsp["tool-lsp"]
  svc_apiProxy["ctx.apiProxy<br/>Host API dispatch"]
  pkg_cordis_host_runner["cordis-host-runner"]
  svc_dynamicCordisRunner["ctx.dynamicCordisRunner<br/>Dynamic Cordis package host runner"]
  svc_cordisInspect["ctx.cordisInspect<br/>Dynamic Cordis inspect registry"]
  pkg_acp --> svc_approval
  pkg_agent --> svc_agents
  pkg_agent_default_model --> svc_agentDefaultModel
  pkg_agent_loop --> svc_agentLoop
  pkg_agent_presets --> svc_agentPresets
  pkg_api_gateway --> svc_typertGateway
  pkg_apiproxy --> svc_apiProxy
  pkg_approval --> svc_approval
  pkg_attachment --> svc_attachments
  pkg_attachment_local --> svc_attachments
  pkg_bash_local --> svc_shell
  pkg_bash_sandbox --> svc_shell
  pkg_code_runtime --> svc_codeRuntime
  pkg_code_runtime_worker --> svc_codeRuntime
  pkg_commands --> svc_commands
  pkg_compaction --> svc_compaction
  pkg_compaction_basic --> svc_compaction
  pkg_compaction_tool_result_pruner --> svc_toolResultPruner
  pkg_cordis_host_runner --> svc_cordisInspect
  pkg_cordis_host_runner --> svc_dynamicCordisRunner
  pkg_credentials --> svc_credentials
  pkg_credentials_local --> svc_credentials
  pkg_directory_picker --> svc_directoryPicker
  pkg_directory_picker_browse --> svc_directoryPicker
  pkg_directory_picker_native --> svc_directoryPicker
  pkg_e2b --> svc_e2b
  pkg_fs --> svc_fs
  pkg_fs_e2b --> svc_fs
  pkg_fs_local --> svc_fs
  pkg_fs_sandbox --> svc_fs
  pkg_goal --> svc_goals
  pkg_invariants --> svc_invariants
  pkg_jobs --> svc_jobs
  pkg_jobs_local --> svc_jobs
  pkg_llm --> svc_llm
  pkg_llm_deepseek --> svc_llm
  pkg_llm_pi_ai --> svc_llm
  pkg_llm_replay --> svc_llm
  pkg_lsp --> svc_lsp
  pkg_lsp_local --> svc_lsp
  pkg_message_feedback --> svc_messageFeedback
  pkg_modules --> svc_clientModules
  pkg_permission_presets --> svc_permissionPresets
  pkg_plan_mode --> svc_planMode
  pkg_pwsh_local --> svc_shell
  pkg_sandbox --> svc_sandbox
  pkg_sandbox_local --> svc_sandbox
  pkg_sandbox_policy --> svc_sandboxPolicy
  pkg_session --> svc_sessions
  pkg_session_access --> svc_sessionAccess
  pkg_session_persistence --> svc_sessionPersistence
  pkg_session_persistence_jsonl --> svc_sessionPersistence
  pkg_session_persistence_sqlite --> svc_sessionPersistence
  pkg_session_projection --> svc_sessionProjections
  pkg_session_projection_cache --> svc_sessionProjectionCache
  pkg_session_query --> svc_sessionQuery
  pkg_session_query_sqlite --> svc_sessionQuery
  pkg_session_reference --> svc_sessionReferenceResolver
  pkg_session_telemetry --> svc_sessionTelemetry
  pkg_session_telemetry_otel --> svc_sessionTelemetry
  pkg_session_title --> svc_sessionTitle
  pkg_session_title_all_prompts_llm --> svc_sessionTitle
  pkg_session_title_first_prompt_llm --> svc_sessionTitle
  pkg_settings --> svc_settings
  pkg_settings_file --> svc_settings
  pkg_shell --> svc_shell
  pkg_shell_env --> svc_shellEnv
  pkg_skill --> svc_skills
  pkg_skill_badge --> svc_skills
  pkg_skill_filesystem --> svc_skills
  pkg_spill --> svc_spillStore
  pkg_spill_local --> svc_spillStore
  pkg_storage --> svc_storage
  pkg_storage_domain --> svc_storageDomain
  pkg_storage_json --> svc_storage
  pkg_storage_sqlite --> svc_storage
  pkg_subagent --> svc_subagents
  pkg_subagent_acp --> svc_subagents
  pkg_subagent_claude_code --> svc_subagents
  pkg_subagent_codex --> svc_subagents
  pkg_subagent_dsh_sdk --> svc_subagents
  pkg_subagent_fork_in_process --> svc_subagents
  pkg_subagent_spawn_in_process --> svc_subagents
  pkg_subprocess --> svc_subprocess
  pkg_subprocess_e2b --> svc_subprocess
  pkg_subprocess_local --> svc_subprocess
  pkg_system_prompt --> svc_systemPrompt
  pkg_terminal --> svc_terminals
  pkg_terminal_bash --> svc_terminals
  pkg_token_meter --> svc_tokenMeter
  pkg_tools --> svc_tools
  pkg_typert_registry --> svc_typert
  pkg_user_questions --> svc_userQuestions
  pkg_web --> svc_web
  pkg_web_fetch_http --> svc_web
  pkg_web_search_deepseek --> svc_web
  pkg_web_search_exa --> svc_web
  pkg_web_search_perplexity --> svc_web
  pkg_webserver --> svc_webServer
  pkg_workflow --> svc_workflowEngine
  pkg_workflow_worker_thread --> svc_workflowEngine
  pkg_workspace --> svc_workspaceRegistry
  svc_agentDefaultModel --> pkg_headless
  svc_agentDefaultModel --> pkg_host_apiproxy
  svc_agentLoop --> pkg_agent_spine_demo
  svc_agents --> pkg_acp
  svc_agents --> pkg_agent_loop
  svc_agents --> pkg_subagent_inprocess
  svc_apiProxy --> pkg_connection
  svc_approval --> pkg_tool_bash
  svc_approval --> pkg_tools
  svc_attachments --> pkg_host_runtime
  svc_attachments --> pkg_llm_pi_ai
  svc_clientModules --> pkg_hmr
  svc_codeRuntime --> pkg_tools
  svc_compaction --> pkg_compaction_basic
  svc_cordisInspect --> pkg_tool_cordis
  svc_credentials --> pkg_apiproxy
  svc_credentials --> pkg_llm_deepseek
  svc_credentials --> pkg_llm_pi_ai
  svc_directoryPicker --> pkg_apiproxy
  svc_dynamicCordisRunner --> pkg_tool_cordis
  svc_e2b --> pkg_fs_e2b
  svc_e2b --> pkg_subprocess_e2b
  svc_fs --> pkg_tool_fs
  svc_invariants --> pkg_agent
  svc_invariants --> pkg_agent_loop
  svc_invariants --> pkg_scope
  svc_invariants --> pkg_session
  svc_jobs --> pkg_tool_bash
  svc_jobs --> pkg_tool_jobs
  svc_jobs --> pkg_tool_subagent
  svc_jobs --> pkg_tool_terminal
  svc_llm --> pkg_agent_loop
  svc_llm --> pkg_compaction_basic
  svc_lsp --> pkg_tool_lsp
  svc_sandbox --> pkg_bash_sandbox
  svc_sandbox --> pkg_terminal_bash
  svc_sandboxPolicy --> pkg_bash_sandbox
  svc_sandboxPolicy --> pkg_fs_sandbox
  svc_sandboxPolicy --> pkg_terminal_bash
  svc_sessionAccess --> pkg_apiproxy
  svc_sessionPersistence --> pkg_agent_loop
  svc_sessionPersistence --> pkg_hooks_claude_code
  svc_sessionPersistence --> pkg_hooks_codex
  svc_sessionPersistence --> pkg_message_feedback
  svc_sessionPersistence --> pkg_session_query
  svc_sessionPersistence --> pkg_session_query_sqlite
  svc_sessionPersistence --> pkg_tool_bash
  svc_sessionProjectionCache --> pkg_host_apiproxy
  svc_sessionProjections --> pkg_host_apiproxy
  svc_sessionProjections --> pkg_session_title
  svc_sessionProjections --> pkg_tool_todo
  svc_sessionQuery --> pkg_session_reference
  svc_sessionQuery --> pkg_tool_session_query
  svc_sessions --> pkg_agent
  svc_sessions --> pkg_agent_loop
  svc_sessions --> pkg_invariants
  svc_sessions --> pkg_message_feedback
  svc_sessions --> pkg_session_persistence
  svc_sessions --> pkg_session_query
  svc_sessions --> pkg_session_query_sqlite
  svc_sessions --> pkg_subagent_inprocess
  svc_settings --> pkg_apiproxy
  svc_settings --> pkg_llm_deepseek
  svc_settings --> pkg_llm_pi_ai
  svc_shell --> pkg_hooks_claude_code
  svc_shell --> pkg_hooks_codex
  svc_shell --> pkg_tool_bash
  svc_shell --> pkg_tool_pwsh
  svc_shellEnv --> pkg_tool_bash
  svc_shellEnv --> pkg_tool_pwsh
  svc_skills --> pkg_tool_skill
  svc_spillStore --> pkg_spill_policy
  svc_storage --> pkg_storage_domain
  svc_storageDomain --> pkg_message_feedback
  svc_storageDomain --> pkg_workspace
  svc_subagents --> pkg_tool_ralph
  svc_subagents --> pkg_tool_subagent
  svc_subagents --> pkg_tool_subagent_control
  svc_subprocess --> pkg_bash_local
  svc_subprocess --> pkg_bash_sandbox
  svc_subprocess --> pkg_lsp_stdio
  svc_subprocess --> pkg_subagent_acp
  svc_subprocess --> pkg_subagent_claude_code
  svc_subprocess --> pkg_subagent_codex
  svc_subprocess --> pkg_terminal_bash
  svc_systemPrompt --> pkg_agent_loop
  svc_systemPrompt --> pkg_tool_fs
  svc_systemPrompt --> pkg_tool_terminal
  svc_systemPrompt --> pkg_tool_web
  svc_systemPrompt --> pkg_tools
  svc_terminals --> pkg_tool_terminal
  svc_tokenMeter --> pkg_compaction_basic
  svc_toolResultPruner --> pkg_compaction_basic
  svc_tools --> pkg_agent_loop
  svc_tools --> pkg_tool_ask_user
  svc_tools --> pkg_tool_bash
  svc_tools --> pkg_tool_cordis
  svc_tools --> pkg_tool_fs
  svc_tools --> pkg_tool_skill
  svc_tools --> pkg_tool_subagent
  svc_tools --> pkg_tool_terminal
  svc_tools --> pkg_tool_todo
  svc_tools --> pkg_tool_web
  svc_typert --> pkg_api_gateway
  svc_typert --> pkg_typert_loader
  svc_userQuestions --> pkg_tool_ask_user
  svc_web --> pkg_tool_web
  svc_webServer --> pkg_connection
  svc_webServer --> pkg_hmr
  svc_webServer --> pkg_modules
  svc_workflowEngine --> pkg_tool_ralph
  svc_workflowEngine --> pkg_tool_workflow
  svc_workspaceRegistry --> pkg_apiproxy
  svc_fs -. event gate .-> pkg_fs_observation_policy
```

| Khóa ctx | Vai trò | Package sở hữu | Triển khai | Bên tiêu thụ trực tiếp | Plugin đi kèm | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| `ctx.attachments` | `seam` | [`attachment`](../packages/attachment/attachment) | [`attachment-local`](../packages/attachment/attachment-local) | `host-runtime`, [`llm-pi-ai`](../packages/llm/llm-pi-ai) | - | Host commit các hình ảnh đã được chấp nhận trước sự kiện phiên; bộ điều hợp provider phân giải tham chiếu bền vững đã được cấp quyền thành nội dung gốc của provider. |
| `ctx.llm` | `seam` | [`llm`](../packages/llm/llm) | [`llm-deepseek`](../packages/llm/llm-deepseek), [`llm-pi-ai`](../packages/llm/llm-pi-ai), [`llm-replay`](../packages/test-support/llm-replay) | [`agent-loop`](../packages/core/agent-loop), [`compaction-basic`](../packages/compaction/compaction-basic) | - | Bộ điều hợp đăng ký triển khai provider; agent loop (vòng lặp tác tử) và tính năng compaction gọi service stream không phụ thuộc vào provider cụ thể. |
| `ctx.tokenMeter` | `core` | [`token-meter`](../packages/llm/token-meter) | - | [`compaction-basic`](../packages/compaction/compaction-basic) | - | Sở hữu vùng gấp (fold) replay được cô lập theo từng phiên; các bên tiêu thụ áp lực dùng chung kết quả đo lường bất biến, có đánh số phiên bản. |
| `ctx.toolResultPruner` | `core` | [`compaction-tool-result-pruner`](../packages/compaction/compaction-tool-result-pruner) | - | [`compaction-basic`](../packages/compaction/compaction-basic) | - | Viết lại kết quả công cụ hiện tại quá lớn thông qua phép thay thế bề mặt (surface replacement) một-node có thể replay, trước khi nén tóm tắt. |
| `ctx.sessions` | `core` | [`session`](../packages/core/session) | - | [`agent-loop`](../packages/core/agent-loop), [`agent`](../packages/core/agent), [`session-persistence`](../packages/session/session-persistence), [`session-query`](../packages/session-query/session-query), [`session-query-sqlite`](../packages/session-query/session-query-sqlite), `subagent-inprocess`, [`invariants`](../packages/runtime-diagnostics/invariants), [`message-feedback`](../packages/feedback/message-feedback) | - | Sở hữu instance Session chỉ-thêm (append-only), và phát ra luồng sự kiện phiên bền vững. |
| `ctx.invariants` | `core` | [`invariants`](../packages/runtime-diagnostics/invariants) | - | [`session`](../packages/core/session), [`agent`](../packages/core/agent), [`scope`](../packages/core/scope), [`agent-loop`](../packages/core/agent-loop) | - | Subpath đi kèm đăng ký các kiểm tra cục bộ thuộc về package tương ứng; service này chịu trách nhiệm về lựa chọn, tính duy nhất, sub-fiber, và các lỗi có ghi rõ package sở hữu. |
| `ctx.typert` | `core` | [`typert-registry`](../packages/typert/registry) | - | [`typert-loader`](../packages/typert/loader), [`api-gateway`](../packages/api/gateway) | - | Plugin đăng ký đóng góp zod thời gian thực trực tiếp hoặc thông qua dsh-typert-loader; API gateway tiêu thụ mô tả (descriptor) lệnh gọi và provider, các bên tiêu thụ runtime khác truy vấn schema và metadata phản chiếu tại ranh giới riêng của họ. |
| `ctx.typertGateway` | `core` | [`api-gateway`](../packages/api/gateway) | - | - | - | Liên kết mô tả Remote đã sinh với service Cordis thời gian thực, phân giải danh tính đã đăng ký, và cung cấp lệnh gọi một chiều (unary) qua Connection RPC carrier dùng chung. |
| `ctx.sessionPersistence` | `seam` | [`session-persistence`](../packages/session/session-persistence) | [`session-persistence-jsonl`](../packages/session/session-persistence-jsonl), [`session-persistence-sqlite`](../packages/session/session-persistence-sqlite) | [`agent-loop`](../packages/core/agent-loop), [`tool-bash`](../packages/shell/tool-bash), [`hooks-claude-code`](../packages/hooks/hooks-claude-code), [`hooks-codex`](../packages/hooks/hooks-codex), [`session-query`](../packages/session-query/session-query), [`session-query-sqlite`](../packages/session-query/session-query-sqlite), [`message-feedback`](../packages/feedback/message-feedback) | - | Mỗi backend bền vững hóa cùng một bộ từ vựng SessionEvent; ứng dụng chọn backend tại thời điểm tổ hợp. |
| `ctx.settings` | `seam` | [`settings`](../packages/settings/settings) | [`settings-file`](../packages/settings/settings-file) | [`llm-deepseek`](../packages/llm/llm-deepseek), [`llm-pi-ai`](../packages/llm/llm-pi-ai), `apiproxy` | - | Plugin đăng ký schema theo namespace và phân giải giá trị theo tầng; provider lưu trữ tài liệu gốc. Bộ điều hợp LLM (mô hình ngôn ngữ lớn) đăng ký cấu hình entry của nó dưới phân vùng người dùng làm cơ sở tổ hợp; Web gateway cung cấp mô tả theo tầng đã được khử nhạy cảm, và ghi vào tầng người dùng. |
| `ctx.credentials` | `seam` | [`credentials`](../packages/credentials/credentials) | [`credentials-local`](../packages/credentials/credentials-local) | [`llm-deepseek`](../packages/llm/llm-deepseek), [`llm-pi-ai`](../packages/llm/llm-pi-ai), `apiproxy` | - | Cấu hình mang theo tham chiếu tới thông tin bí mật; provider sở hữu giá trị thực. Bên tiêu thụ phân giải theo từng thao tác, do đó credential đã xoay vòng (rotate) sẽ có hiệu lực ngay ở request tiếp theo; Web gateway cung cấp view không chứa giá trị thực và kho lưu chỉ-ghi. |
| `ctx.sessionTelemetry` | `seam` | [`session-telemetry`](../packages/session/session-telemetry) | [`session-telemetry-otel`](../packages/session/session-telemetry-otel) | - | - | Seam này thu thập bản ghi phiên, khử nhạy cảm, rồi giao cho một backend; không có thành phần nào khác tiêu thụ service này, đầu ra của nó rời khỏi tiến trình hiện tại. |
| `ctx.storage` | `seam` | [`storage`](../packages/storage/storage) | [`storage-json`](../packages/storage/storage-json), [`storage-sqlite`](../packages/storage/storage-sqlite) | [`storage-domain`](../packages/storage/storage-domain) | - | Mỗi backend đăng ký song song dưới tên khác nhau; hình thái dữ liệu (ưu tiên theo domain) mount lên hub, và chuyển đổi thao tác có kiểu thành nguyên thủy đơn vị KV mờ (opaque). |
| `ctx.storageDomain` | `core` | [`storage-domain`](../packages/storage/storage-domain) | - | [`workspace`](../packages/workspace/workspace), [`message-feedback`](../packages/feedback/message-feedback) | - | Đợi tất cả backend đã cấu hình sẵn sàng, rồi phát hành hình thái domain thành một service ràng buộc theo vòng đời, dùng cho trạng thái bền vững có kiểu. |
| `ctx.messageFeedback` | `core` | [`message-feedback`](../packages/feedback/message-feedback) | - | - | - | Sở hữu phản hồi cục bộ theo từng message assistant, kiểm tra vòng đời và mục tiêu, compare-and-set theo từng entry, và hợp đồng Remote một chiều của Host, không đi vào lịch sử Session hay telemetry. |
| `ctx.workspaceRegistry` | `core` | [`workspace`](../packages/workspace/workspace) | - | `apiproxy` | - | Sở hữu các bản ghi có kiểu WorkspaceId gắn nhãn (branded) thông qua facility domain; tài khoản sessionIds ổn định điều khiển Host RPC và projection GUI. |
| `ctx.sessionAccess` | `core` | [`session-access`](../packages/session/session-access) | - | `apiproxy` | - | Danh sách cấp quyền/thu hồi theo từng người dùng, bền vững hóa qua facility domain; bên gọi bằng ticket sẽ bị từ chối theo nguyên tắc fail-closed khi phiên không nằm trong danh sách, còn full token thì bỏ qua hoàn toàn danh sách này. |
| `ctx.sessionQuery` | `seam` | [`session-query`](../packages/session-query/session-query) | [`session-query-sqlite`](../packages/session-query/session-query-sqlite) | [`session-reference`](../packages/context/session-reference), [`tool-session-query`](../packages/session-query/tool-session-query) | - | Giao diện này cung cấp đọc, lọc và truy vết chính xác; backend cụ thể còn cung cấp phối hợp full-text, sắp xếp, đoạn tóm tắt (snippet) và thế hệ con trỏ (cursor generation), trong khi bên tiêu thụ mô hình chịu trách nhiệm về quyền workspace và việc render không chứa con trỏ. |
| `ctx.sessionReferenceResolver` | `core` | [`session-reference`](../packages/context/session-reference) | - | - | - | Chiếu (project) snapshot hội thoại có giới hạn tại bề mặt hiện tại thành ngữ cảnh message bền vững nhưng không đáng tin cậy; bộ điều hợp Host chịu trách nhiệm về cú pháp mention. |
| `ctx.sessionTitle` | `seam` | [`session-title`](../packages/session/session-title) | [`session-title-first-prompt-llm`](../packages/session/session-title-first-prompt-llm), [`session-title-all-prompts-llm`](../packages/session/session-title-all-prompts-llm) | - | - | Chịu trách nhiệm về fallback tất định, vùng gấp tiêu đề mới nhất, và đăng ký duy nhất một provider bất đồng bộ tùy chọn. |
| `ctx.systemPrompt` | `core` | [`system-prompt`](../packages/core/system-prompt) | - | [`agent-loop`](../packages/core/agent-loop), [`tools`](../packages/core/tools), [`tool-fs`](../packages/fs/tool-fs), [`tool-terminal`](../packages/terminal/tool-terminal), [`tool-web`](../packages/web/tool-web) | - | Thu thập từng phần của prompt và schema công cụ hướng tới mô hình cho mỗi bước. |
| `ctx.tools` | `core` | [`tools`](../packages/core/tools) | - | [`agent-loop`](../packages/core/agent-loop), [`tool-ask-user`](../packages/interaction/tool-ask-user), [`tool-bash`](../packages/shell/tool-bash), [`tool-cordis`](../packages/extensions/tool-cordis), [`tool-fs`](../packages/fs/tool-fs), [`tool-terminal`](../packages/terminal/tool-terminal), [`tool-skill`](../packages/skill/tool-skill), [`tool-subagent`](../packages/subagent/tool-subagent), [`tool-todo`](../packages/todo/tool-todo), [`tool-web`](../packages/web/tool-web) | - | Đăng ký capability, chịu trách nhiệm truyền tải cho Code Mode, và cho lệnh gọi lần lượt đi qua policy tiền xử lý, guard đơn điệu, dispatch bao quanh (around-dispatch), policy hậu xử lý, và quan sát kết quả cuối cùng. |
| `ctx.userQuestions` | `seam` | [`user-questions`](../packages/interaction/user-questions) | - | [`tool-ask-user`](../packages/interaction/tool-ask-user) | - | Frontend UI cung cấp provider trả lời thủ công đang có hiệu lực; tool-ask-user tạm dừng lệnh gọi công cụ trên một promise `ask()` không phụ thuộc provider. |
| `ctx.planMode` | `core` | [`plan-mode`](../packages/plan/plan-mode) | - | - | - | Gấp trạng thái kế hoạch/mode đã ghi nhận, làm mới lựa chọn người dùng tại ranh giới lượt, render thông tin hướng dẫn do bên triển khai sở hữu, đăng ký /plan, và giữ ổn định schema thoát kế hoạch trong quá trình chuyển trạng thái. |
| `ctx.agentPresets` | `core` | [`agent-presets`](../packages/preset/agent-presets) | - | - | - | Khám phá thư mục preset trên root đáng tin cậy và root do người dùng tạo, và mount một `cordis.yml` preset dưới phạm vi agent tại thời điểm tạo, từ chối các dòng luôn không kích hoạt hoặc phát hành service tới root service realm. |
| `ctx.commands` | `core` | [`commands`](../packages/interaction/commands) | - | - | - | Plugin đăng ký lệnh trực tiếp hướng tới người dùng, không gửi lệnh gọi tới mô hình. |
| `ctx.sessionProjections` | `core` | [`session-projection`](../packages/session/session-projection) | - | [`tool-todo`](../packages/todo/tool-todo), [`session-title`](../packages/session/session-title), [`host-apiproxy`](../packages/host/apiproxy) | - | Mỗi domain đăng ký một đơn vị gấp (fold) do trạng thái điều khiển; quy trình chủ động điều khiển duy trì trạng thái mực nước (watermark) cho từng phiên, api-proxy cung cấp baseline và đẩy các giá trị đã thay đổi. |
| `ctx.sessionProjectionCache` | `core` | [`session-projection-cache`](../packages/session/session-projection-cache) | - | [`host-apiproxy`](../packages/host/apiproxy) | - | Lưu bền vững checkpoint trạng thái đơn vị projection theo từng phiên (checkpoint có điều tiết, cộng checkpoint bắt buộc khi kết thúc lượt/kết thúc/tách rời), và cung cấp thang đọc lạnh: dòng cache cộng replay đuôi bền vững, do đó việc đọc danh sách không bao giờ cần nạp toàn bộ log. |
| `ctx.skills` | `seam` | [`skill`](../packages/skill/skill) | [`skill-badge`](../packages/skill/skill-badge), [`skill-filesystem`](../packages/skill/skill-filesystem) | [`tool-skill`](../packages/skill/tool-skill) | - | Gộp danh mục skill (kỹ năng) từ các provider; tool-skill render thư mục tiền tố phiên, và nạp toàn bộ nội dung skill. |
| `ctx.agents` | `core` | [`agent`](../packages/core/agent) | - | [`agent-loop`](../packages/core/agent-loop), [`acp`](../packages/acp/acp), `subagent-inprocess` | - | Sở hữu handle Agent thời gian thực, seam factory tạo/khôi phục, và lan truyền bên khởi tạo (initiator) cục bộ theo tiến trình. |
| `ctx.agentDefaultModel` | `core` | [`agent-default-model`](../packages/core/agent-default-model) | - | [`headless`](../packages/bundle/headless), [`host-apiproxy`](../packages/host/apiproxy) | - | Đặt `ModelSelection` mặc định qua tầng settings, để entry trực tiếp và entry Agent hỗ trợ bởi Host dùng chung một chủ sở hữu trạng thái. |
| `ctx.agentLoop` | `bundle` | [`agent-loop`](../packages/core/agent-loop) | - | [`agent-spine-demo`](../packages/examples/agent-spine-demo) | - | Plugin loop cụ thể duy nhất; bundle mở rộng phụ thuộc vào sự kiện và service của dsh-agent, không phụ thuộc vào package này. |
| `ctx.goals` | `core` | [`goal`](../packages/goal/goal) | - | - | - | Gấp trạng thái mục tiêu có đánh số phiên bản từ log phiên, và giữ việc kích hoạt tiếp tục thời gian thực cục bộ theo tiến trình. |
| `ctx.e2b` | `core` | [`e2b`](../packages/e2b/e2b) | - | [`fs-e2b`](../packages/e2b/fs-e2b), [`subprocess-e2b`](../packages/e2b/subprocess-e2b) | - | Sở hữu một handle SDK E2B dùng chung, thư mục làm việc từ xa, và xử lý sandbox cuối cùng, giúp hai provider E2B nền tảng cùng nằm trong một runtime Linux. |
| `ctx.subprocess` | `seam` | [`subprocess`](../packages/subprocess/subprocess) | [`subprocess-local`](../packages/subprocess/subprocess-local), [`subprocess-e2b`](../packages/e2b/subprocess-e2b) | [`bash-local`](../packages/shell/bash-local), [`bash-sandbox`](../packages/shell/bash-sandbox), [`terminal-bash`](../packages/terminal/terminal-bash), [`lsp-stdio`](../packages/lsp/lsp-stdio), [`subagent-acp`](../packages/subagent/subagent-acp), [`subagent-codex`](../packages/subagent/subagent-codex), [`subagent-claude-code`](../packages/subagent/subagent-claude-code) | - | Bộ thực thi Bash, backend PTY shell, Host LSP, cùng backend subagent ACP, Codex và Claude Code ngoài tiến trình đều spawn qua ctx.subprocess; service này chịu trách nhiệm về tọa độ tiến trình, vòng đời cây tiến trình/phiên, xử lý stdio, cơ chế terminal và leo thang kill. |
| `ctx.shell` | `seam` | [`shell`](../packages/shell/shell) | [`bash-local`](../packages/shell/bash-local), [`bash-sandbox`](../packages/shell/bash-sandbox), [`pwsh-local`](../packages/shell/pwsh-local) | [`tool-bash`](../packages/shell/tool-bash), [`tool-pwsh`](../packages/shell/tool-pwsh), [`hooks-claude-code`](../packages/hooks/hooks-claude-code), [`hooks-codex`](../packages/hooks/hooks-codex) | - | Công cụ shell hướng tới mô hình và cầu nối hook tiêu thụ seam này; bộ thực thi sandbox, remote, hoặc PowerShell có thể thay thế bash-local mà không cần đổi các bên tiêu thụ này. |
| `ctx.shellEnv` | `core` | [`shell-env`](../packages/shell/shell-env) | - | [`tool-bash`](../packages/shell/tool-bash), [`tool-pwsh`](../packages/shell/tool-pwsh) | - | Plugin khai báo sự thật DSH_* giới hạn trong phạm vi effect; mỗi công cụ shell thu thập một snapshot đáng tin cậy trong mỗi lần thực thi, bộ thực thi của nó dựa vào đó để dựng lại namespace. |
| `ctx.terminals` | `seam` | [`terminal`](../packages/terminal/terminal) | [`terminal-bash`](../packages/terminal/terminal-bash) | [`tool-terminal`](../packages/terminal/tool-terminal) | - | Registry chịu trách nhiệm về danh tính phiên chính xác theo Agent và dọn dẹp; backend chịu trách nhiệm về cơ chế terminal, tool-terminal cung cấp giao diện mô hình giới hạn trong phạm vi chủ sở hữu. |
| `ctx.sandbox` | `seam` | [`sandbox`](../packages/sandbox/sandbox) | [`sandbox-local`](../packages/sandbox/sandbox-local) | [`bash-sandbox`](../packages/shell/bash-sandbox), [`terminal-bash`](../packages/terminal/terminal-bash) | - | Bên tiêu thụ giao ra argv chính xác sắp được spawn; backend dùng chung filesystem và kernel với host sẽ bọc argv đó theo policy từng lệnh gọi, và báo cáo tình trạng thực thi cưỡng chế. |
| `ctx.sandboxPolicy` | `core` | [`sandbox-policy`](../packages/sandbox/sandbox-policy) | - | [`bash-sandbox`](../packages/shell/bash-sandbox), [`fs-sandbox`](../packages/fs/fs-sandbox), [`terminal-bash`](../packages/terminal/terminal-bash) | - | Lưu thống nhất mode mặc định triển khai và workspace root; chỉ bộ thực thi và provider sandbox đọc service này (tầng công cụ dùng vùng gấp `sandbox/mode` thuần túy mà nó xuất ra cùng lúc). Cả hai thành phần cưỡng chế đều đọc service này, do đó bash và fs không bị giới hạn vào các root khác nhau. |
| `ctx.approval` | `seam` | `approval` | [`acp`](../packages/acp/acp) | [`tools`](../packages/core/tools), [`tool-bash`](../packages/shell/tool-bash) | - | Quyết định cấp quyền một lần được phân phối qua waterfall (chuỗi sự kiện dạng thác nước) `approval/request`; bên trả lời là listener (tức cầu nối mà ACP cung cấp cho agent của chính nó), khi không có bên trả lời thì đóng theo hướng thất bại với `unavailable`. |
| `ctx.permissionPresets` | `core` | [`permission-presets`](../packages/interaction/permission-presets) | - | - | - | Bảng preset hướng tới người dùng (`workspace-write`/`danger-full-access`), tổ hợp mode sandbox cùng tùy chọn chính sách phê duyệt; một lần chuyển đổi sẽ ghi một sự kiện `permission/preset`, và lan tới cả hai sự kiện tùy chọn. |
| `ctx.codeRuntime` | `seam` | [`code-runtime`](../packages/code-runtime/code-runtime) | `code-runtime-worker` | [`tools`](../packages/core/tools) | - | Chạy một đoạn chương trình do mô hình viết bằng binding bất đồng bộ do Host cung cấp; mỗi backend dùng môi trường nền và ngôn ngữ khác nhau (registry công cụ tiêu thụ service này trong Code Mode). |
| `ctx.fs` | `seam` | [`fs`](../packages/fs/fs) | [`fs-local`](../packages/fs/fs-local), [`fs-sandbox`](../packages/fs/fs-sandbox), [`fs-e2b`](../packages/e2b/fs-e2b) | [`tool-fs`](../packages/fs/tool-fs) | [`fs-observation-policy`](../packages/fs/fs-observation-policy) | tool-fs thực hiện đọc/ghi/sửa qua ctx.fs; fs-sandbox giới hạn thay đổi theo mode sandbox dùng chung; fs-observation-policy đóng góp kiểm tra dựa trên trạng thái quan sát thông qua cổng sự kiện fs/*. |
| `ctx.compaction` | `seam` | [`compaction`](../packages/compaction/compaction) | [`compaction-basic`](../packages/compaction/compaction-basic) | [`compaction-basic`](../packages/compaction/compaction-basic) | - | Backend cơ sở tiêu thụ sự kiện áp lực sau bước và sự kiện khôi phục lỗi request; không có công cụ compaction nào hướng tới mô hình. |
| `ctx.subagents` | `seam` | [`subagent`](../packages/subagent/subagent) | [`subagent-spawn-in-process`](../packages/subagent/subagent-spawn-in-process), [`subagent-fork-in-process`](../packages/subagent/subagent-fork-in-process), [`subagent-acp`](../packages/subagent/subagent-acp), [`subagent-codex`](../packages/subagent/subagent-codex), [`subagent-claude-code`](../packages/subagent/subagent-claude-code), [`subagent-dsh-sdk`](../packages/subagent/subagent-dsh-sdk) | [`tool-subagent`](../packages/subagent/tool-subagent), [`tool-subagent-control`](../packages/subagent/tool-subagent-control), [`tool-ralph`](../packages/workflow/tool-ralph) | - | Provider triển khai truyền tải; service này còn chịu trách nhiệm về điều phối tiếp diễn (continuation) dựa trên Activation, tùy chọn; tool-subagent chọn ủy thác một lần hoặc có thể tiếp diễn, tool-subagent-control chuyển tiếp message tiếp theo, còn tool-ralph yêu cầu một tuyến kết quả có cấu trúc hoàn toàn mới. |
| `ctx.jobs` | `seam` | [`jobs`](../packages/jobs/jobs) | [`jobs-local`](../packages/jobs/jobs-local) | [`tool-bash`](../packages/shell/tool-bash), [`tool-terminal`](../packages/terminal/tool-terminal), [`tool-subagent`](../packages/subagent/tool-subagent), [`tool-jobs`](../packages/jobs/tool-jobs) | - | Bên sản xuất (bash nền, gửi PTY, và ủy thác subagent) đăng ký công việc đang chạy; tool-jobs là bộ điều khiển hướng tới mô hình, dùng để đọc, liệt kê và kết thúc các công việc này; jobs-local là registry cục bộ theo tiến trình. |
| `ctx.web` | `seam` | [`web`](../packages/web/web) | [`web-search-exa`](../packages/web/web-search-exa), [`web-search-perplexity`](../packages/web/web-search-perplexity), [`web-search-deepseek`](../packages/web/web-search-deepseek), [`web-fetch-http`](../packages/web/web-fetch-http) | [`tool-web`](../packages/web/tool-web) | - | Provider search và fetch đăng ký vào cùng một seam ctx.web; tool-web chịu trách nhiệm về tên ổn định hướng tới mô hình. |
| `ctx.spillStore` | `seam` | [`spill`](../packages/spill/spill) | [`spill-local`](../packages/spill/spill-local) | [`spill-policy`](../packages/spill/spill-policy) | - | Backend lưu văn bản công cụ quá lớn, và trả về thông tin định vị cùng gợi ý lấy lại hướng tới mô hình; spill-policy là bên tiêu thụ tools/post-execute, chịu trách nhiệm quyết định khi nào cần spill. |
| `ctx.directoryPicker` | `seam` | `directory-picker` | `directory-picker-native`, `directory-picker-browse` | `apiproxy` | - | Capability tương tác có nhãn phân biệt (discriminant tag): backend gốc (native) mở bộ chọn hệ điều hành trên thiết bị hiển thị Host, backend browse cung cấp nguyên thủy liệt kê và tạo cho trình duyệt tích hợp trong ứng dụng; hai backend đều điền vào slot của quy trình thư mục ui-workspace thông qua phía trình duyệt của chúng (không phát hành qua giao thức). |
| `ctx.webServer` | `core` | `webserver` | - | `connection`, `modules`, `hmr` | - | Carrier node:http thông thường: registry route có tên, tap chuyển đổi index, và fallback dist tĩnh; plugin truyền tải Web tự đăng ký route của mình. |
| `ctx.clientModules` | `core` | `modules` | - | `hmr` | - | Tổ hợp đồ thị entry __DSH_BOOT__ qua quét gia tăng `dsh.client`, cung cấp bundle plugin, và thông báo cho bên đăng ký thay đổi rebuild/graph. |
| `ctx.workflowEngine` | `seam` | [`workflow`](../packages/workflow/workflow) | [`workflow-worker-thread`](../packages/workflow/workflow-worker-thread) | [`tool-workflow`](../packages/workflow/tool-workflow), [`tool-ralph`](../packages/workflow/tool-ralph) | - | Mỗi context dùng một engine, tương tự bash, và không có registry provider có tên; bên tiêu thụ workflow thông dụng và Ralph cố định khởi động lượt chạy, trong đó lệnh gọi agent() được phân tán (fan-out) qua ctx.subagents. |
| `ctx.lsp` | `seam` | [`lsp`](../packages/lsp/lsp) | `lsp-local` | [`tool-lsp`](../packages/lsp/tool-lsp) | - | Đăng ký và lựa chọn provider, cộng với việc thực thi truy vấn chuẩn hóa cho đúng bốn thao tác; seam này không cung cấp lối thoát giao thức (protocol escape hatch), backend phải chuyển đổi thành request và kết quả chuẩn hóa. |
| `ctx.apiProxy` | `core` | `apiproxy` | - | `connection` | - | Giao diện gateway Host không phụ thuộc truyền tải: nó dispatch lệnh gọi API trình duyệt, mỗi luồng Host đang mở tự đăng ký (subscribe) sự kiện chuyển tiếp của chính nó, thay vì được phương thức broadcast đẩy tới. |
| `ctx.dynamicCordisRunner` | `core` | [`cordis-host-runner`](../packages/extensions/cordis-host-runner) | - | [`tool-cordis`](../packages/extensions/tool-cordis) | - | Sở hữu registry định nghĩa trong bộ nhớ, sandbox vm nửa Host, và quy trình khứ hồi request-run; trang trình duyệt truy cập trực tuyến cùng service này qua namespace Remote của nó. |
| `ctx.cordisInspect` | `core` | [`cordis-host-runner`](../packages/extensions/cordis-host-runner) | - | [`tool-cordis`](../packages/extensions/tool-cordis) | - | Đăng ký provider inspect của Host, phản chiếu manifest provider của Client, và định tuyến truy vấn Client qua truyền tải Cordis động. |

Chế độ bảo trì: chế độ hỗn hợp. Service được phát hiện từ khai báo Cordis; vai trò interface, triển khai và bên tiêu thụ được phân loại trong `scripts/gen-doc-graphs.ts`, và có guard bảo đảm tính đầy đủ.
