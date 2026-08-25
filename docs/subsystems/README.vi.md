# Các hệ con

[English](README.md) | Tiếng Việt

Mỗi hệ con một trang, bao trùm toàn bộ các hệ con của DeepSeek Harness: nó là gì, nó thao tác trên những cấu trúc dữ liệu nào, và — khi được chống đỡ bởi một service hay phạm vi sự kiện `ctx` nào đó — một mục nhỏ **Cordis API** được sinh tự động, chứa phần tham chiếu service và sự kiện của nó. Thư mục này bổ trợ cho [architecture.md](../architecture.md): tài liệu đó mô tả *hành vi* xuyên các hệ con (ánh xạ service, vòng đời phiên/lượt/bước, phân loại sự kiện); còn mỗi trang ở đây là tài liệu tham chiếu về từ vựng và cách đấu nối của một hệ con đơn lẻ.

| Trang | Phụ trách nội dung |
|---|---|
| [core.md](core.md) | `packages/core` điều khiển agent loop (vòng lặp tác tử) như thế nào: mô tả vòng lặp theo từng package, việc tạo agent và quyền sở hữu (`AgentHandle`), cam kết gửi/hủy/chặn của handle `Agent`, cùng các mẫu kiểu dùng chung toàn kho (`…Map → union dẫn xuất`, id được gắn nhãn thương hiệu) |
| [llm-streaming.md](llm-streaming.md) | Các kiểu hội thoại của `packages/llm` — `Message`/`ContentBlock`, model request đã lắp ráp xong, wire protocol `StreamChunk` và cam kết adapter (adapter contract), `BlockAssembler`, cùng cam kết của bên cung cấp `LlmAdapter` |
| [token-meter.md](token-meter.md) | Số đo vô hướng bất biến và số đo phát lại theo vị trí, kèm số hiệu bản sửa nhật ký đã tiêu thụ |
| [scope.md](scope.md) | Định danh đăng ký có scope, carrier dispatch, và ngữ cảnh `Scope` được sở hữu |
| [typert.md](typert.md) | Bộ mô tả lời gọi từ xa, khai báo lookup/Context, registry Typert, cùng ranh giới API Host Gateway/Client |
| [goal.md](goal.md) | Định danh goal bền vững, ảnh chụp vòng đời, kích hoạt, bản ghi thay đổi và quyền sở hữu Round |
| [schedule.md](schedule.md) | Bản ghi nhắc việc chỉ trong phạm vi Session, chuyển đổi bền vững, khung nhìn hoạt động và việc giao nhận hội thoại thông thường |
| [commands.md](commands.md) | Service registry lệnh con người: định nghĩa, adapter khám phá, gọi trực tiếp, kết quả và khung nhìn phân giải |
| [session.md](session.md) | Danh mục đầy đủ các biến thể `SessionEventMap`, `TurnTrigger`/`TurnEndReason`, `deriveMessages()`, bao đóng thực thi và sự kiện độc lập |
| [persistence.md](persistence.md) | seam bền vững: `SessionPersistence`, backend JSONL + SQLite, `session/flush`, khôi phục sau sự cố, `SessionHeader` |
| [settings.md](settings.md) | seam thiết lập người dùng: đăng ký `SettingsNamespace`, phân giải theo tầng (giá trị mặc định → `base` tổ hợp → tài liệu người dùng), owner scope, commit nóng |
| [credentials.md](credentials.md) | seam thông tin xác thực: tham chiếu `CredentialRef` trong cấu hình (không bao giờ chứa giá trị), phân giải theo từng thao tác, `CredentialInfo` an toàn cho UI, tầng nguồn của bên cung cấp |
| [session-query.md](session-query.md) | Bản ghi logic, đọc sự kiện chính xác có giới hạn, truy vết quan hệ, bộ lọc/tài liệu ngữ nghĩa và trang kết quả tìm kiếm toàn văn |
| [feedback.md](feedback.md) | Bản ghi phản hồi theo từng thông điệp gắn với vòng đời, phiên bản lạc quan, lưu bền bản ghi đi kèm và giao kèo Host Remote |
| [session-title.md](session-title.md) | Ảnh chụp tiêu đề bền vững, seq của thông điệp nguồn được tham chiếu và cam kết của bên cung cấp bất đồng bộ |
| [session-reference.md](session-reference.md) | Tham chiếu xuyên phiên có cấu trúc: `SessionReferenceInput`/`Candidate`, ngữ cảnh thông điệp đã chuẩn bị, phân loại lỗi ổn định |
| [system-prompt.md](system-prompt.md) | Ngữ cảnh lắp ráp theo từng lần, kết quả của bên cung cấp tool, các đoạn prompt và việc lắp ráp có phối hợp |
| [tools.md](tools.md) | Toàn bộ trường của `ToolDefinition`, schema DSL, `ToolExecution`/`ToolResult`, các kiểu UI trình bày tool, cùng đường ống thực thi được bảo vệ |
| [user-questions.md](user-questions.md) | seam hỏi đáp con người có UI hỗ trợ: `AskUserQuestionRequest`, từ vựng answer/options, API của bên cung cấp, phân loại lỗi |
| [approval.md](approval.md) | seam phê duyệt người dùng một lần: `ApprovalRequest`, `ApprovalOutcome`, chính sách theo từng phiên, sự kiện kiểm toán và cam kết của answerer |
| [attachment.md](attachment.md) | Định danh ảnh bền vững và metadata, đầu vào đã kiểm tra, đọc có kiểm chứng, cùng seam `AttachmentStore` |
| [shell.md](shell.md) | seam bộ thực thi bash: `ShellExecRequest`/`Spec`, `ShellRunResult`, handle `ShellProcess` chạy nền |
| [subprocess.md](subprocess.md) | seam tiến trình con: `SubprocessSpawnSpec` hoàn toàn tường minh, bộ đọc đầu ra dựa trên offset, `SubprocessOutcome` không kèm phân loại, cùng từ vựng môi trường `DSH_*` được quản lý |
| [terminal.md](terminal.md) | ID terminal được lưu bền, cam kết backend/phiên, trạng thái sẵn sàng gửi, đọc có giới hạn và ảnh chụp mà owner nhìn thấy |
| [sandbox.md](sandbox.md) | seam phân giải chính sách theo từng phiên và ràng buộc tiến trình: chế độ hiệu ứng tệp, chính sách thực thi/bên cung cấp, `ConfinedArgv`, cưỡng chế và lỗi fail-closed |
| [code-runtime.md](code-runtime.md) | seam thực thi mã: `CodeRunRequest`/`Result`, không gian tên ràng buộc, log đã bắt được, phân loại `CodeRunFailure` |
| [extensions.md](extensions.md) | Cordis Plugin và Package động có phiên bản, kích hoạt Host/Client, phê duyệt, kiểm tra lúc chạy và thu hồi vòng đời |
| [filesystem.md](filesystem.md) | seam hệ thống tệp: `FsTarget`, kết quả đọc/ghi/sửa, trạng thái tệp quan sát được, `FsErrorCode` |
| [lsp.md](lsp.md) | seam điều hướng LSP: `LspQueryRequest`/`Result`, `LspProvider`/`Service`, bốn thao tác, `LspError` |
| [skills.md](skills.md) | Service skill (kỹ năng): thứ tự ưu tiên khám phá, `SkillSummary`/`SkillDefinition`, danh mục tiền tố phiên, việc nạp `skill` hướng tới model |
| [compaction.md](compaction.md) | seam nén (compaction): sự kiện phiên `compaction/*`, `CompactionResult`, interface `CompactionEngine` |
| [subagent.md](subagent.md) | seam subagent: registry bên cung cấp có tên, `SubagentStartRequest`/`Result`/`Run`, tách năng lực lúc khởi động và lúc chạy |
| [web.md](web.md) | seam truy cập web: `WebSearchRequest`/`Result`, `WebFetchRequest`/`Result`, `WebFetchBody`, tính sẵn có của bên cung cấp, `WebError` |
| [spill.md](spill.md) | seam lưu trữ spill: `SaveTextSpill`, `SpillOwner`/`SpillSource`, `SpillRef`, kiểu gắn nhãn thương hiệu `SpillLocator` |
| [workflow.md](workflow.md) | seam workflow: `WorkflowStartRequest`, `WorkflowMeta`, `WorkflowRun`/`Result`, payload sự kiện `workflow/*`, tính chí mạng của `WorkflowError` |
| [jobs.md](jobs.md) | Runtime tác vụ nền: `JobId` gắn nhãn thương hiệu, cam kết của producer, khung nhìn của bên tiêu thụ và hành vi service `ctx.jobs` |
| [permission-presets.md](permission-presets.md) | Tầng preset quyền: `PresetSpec`/`PresetOption`, trạng thái `custom` dẫn xuất, sự kiện `permission/preset` chỉ ghi log |
| [plan.md](plan.md) | Chế độ kế hoạch: trạng thái `plan/mode` chỉ ghi log, việc xả các lựa chọn đang chờ, `PlanModeConfig`, quy trình rà soát `exit_plan_mode` |
| [invariants.md](invariants.md) | Registry bất biến lúc chạy: `Config` chọn lọc cấu hình, `InvariantInstaller`/`InvariantFailure`, cam kết plugin đi kèm rỗng |
| [web-server.md](web-server.md) | Vật mang HTTP: `WebRouteKind`/`WebRoute`, thứ tự khớp, chỗ dự phòng có thể nhận, điểm móc kết xuất index |
| [storage.md](storage.md) | Hệ con lưu trữ: cam kết của backend (`StorageBackend`), `StorageForms`, `DomainSpec`/`Domain`, `domain/changed` |
| [workspace.md](workspace.md) | Registry workspace: `Workspace`/`WorkspaceId`, đăng ký và phân giải, quan hệ với `cwd` của phiên |
| [client-modules.md](client-modules.md) | Bảng plugin Web: khai báo `dsh.client`, tổ hợp trực tuyến `WebBootGraph`, định tuyến bundle và biến đổi index |
| [session-projection.md](session-projection.md) | seam chiếu: `SessionProjectionMap`, đơn vị `ProjectionDefinition` hàm thuần, lát cắt nhất quán của `ProjectionSnapshot`, luồng cấp thay đổi |
| [session-telemetry.md](session-telemetry.md) | seam năng lực báo cáo phiên ra bên ngoài: `SessionTelemetryRecord`/`SessionTelemetrySeverity`, cam kết `SessionTelemetrySink` và waterfall khử nhạy cảm `session-telemetry/record` |

> Các khai báo kiểu trên những trang này cùng JSDoc của chúng tương đương với mã nguồn, và được `pnpm run verify-type-equiv` kiểm tra độ trôi lệch (xem [development.md](../development.md#documenting-types-verbatim-ts-type-equiv)). Khối thường giữ nguyên khai báo đầy đủ; khối `public-api` giữ khai báo class công khai đã lược bỏ phần thân triển khai. Service và sự kiện Cordis dùng mục **Cordis API** được sinh ra trên từng trang.
