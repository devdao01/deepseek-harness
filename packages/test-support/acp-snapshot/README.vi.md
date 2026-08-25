# `@deepseek-ai/dsh-acp-snapshot`

[English](README.md) | 中文

Bộ công cụ cho bộ snapshot ACP (Agent Client Protocol): cơ chế dùng chung phía sau tầng snapshot không cần key (`pnpm run test:snapshot`, xem [chiến lược kiểm thử](../../../docs/testing.md)). Ví dụ chỉ cần bảng scenario và thư mục fixture (dữ liệu tiền đề kiểm thử) là đã có được bộ snapshot đầy đủ; mọi cơ chế so sánh/bảo vệ đều nằm ở đây, chịu ràng buộc bởi cổng độ phủ theo từng file, thay vì bị sao chép ở mỗi ví dụ.

Bốn tầng có thể import độc lập:

- **`launchAcpTestAgent` (bộ khởi động)**: khởi động agent (agent thông minh) nguồn dưới tsx từ cwd chỉ định, hoặc khởi động agent `lib` đã build dưới Node thông thường; kết nối SDK client qua stdout tee dạng byte thô, thu thập cập nhật session và stderr, báo cáo lỗi spawn bất đồng bộ trong giai đoạn khởi động, mặc định từ chối các yêu cầu quyền chưa được xử lý, và chịu trách nhiệm tắt tiến trình một cách êm ái hoặc bằng tín hiệu. Việc tắt sẽ chờ tiến trình thoát, đóng stdio được kế thừa và ACP parser cạn dữ liệu, rồi mới hoàn tất việc tắt hoặc lan truyền lỗi của tiến trình con, để nội dung thu được đầy đủ, và bên gọi có thể loại bỏ đường dẫn riêng của mình sau bất kỳ kết quả nào. Khi Windows chấp nhận buộc chấm dứt nhưng công bố cờ thoát bất đồng bộ, việc tắt sẽ cho cờ đó một khoảng ân hạn có giới hạn, rồi mới coi việc từ chối dự phòng là lỗi thứ hai. Bộ snapshot và bộ e2e thông thường dùng chung ranh giới tiến trình này; kiểm thử chỉ cần cung cấp đường dẫn agent, cwd, override môi trường và chính sách quyền bất kỳ.
- **`runScenario` (harness)**: thông qua bộ khởi động, điều khiển ACP JSON-RPC stdio từ kịch bản `input.json` có tính xác định, tee stdout thô cho việc kiểm tra đầu ra mong đợi và độ thuần khiết, và sau khi stdin EOF một cách êm ái, thu thập từng log session JSONL thô đã lưu bền vững (session cha và session con subagent, session chính được ưu tiên). `AgentUnderTest` cung cấp `binScript` tuyệt đối, `libBinScript` tùy chọn, đường dẫn `configPath` và `tsconfigPath`, vì cwd của tiến trình con nằm ngoài repo. Khi việc ủy quyền tạo cwd con chính là đối tượng kiểm thử, `workspaceParent` có thể di chuyển nó ra khỏi thư mục tạm của nền tảng. Khởi động thất bại sẽ giữ lại stderr của agent đã thu thập được trong chẩn đoán từ chối.
- **Bộ chuẩn hóa (normalizer)**: các hàm thuần chuyển nội dung đã thu thập thành văn bản ổn định hoặc fixture di động: `normalizeStdout` (id JSON-RPC → thứ tự xuất hiện lần đầu; UUID cùng mọi cách viết cwd đã sinh ra theo hệ thống file gốc/JavaScript → token, ưu tiên khớp dài nhất trước; chọn `/` chuẩn hoặc dạng gốc của host theo dấu phân tách của cwd; đồng thời đóng vai trò kiểm tra độ thuần khiết của stdout), `normalizeSessionLog` (đưa thời gian về 0, giữ `seq`, dùng cùng chiến lược đường dẫn cwd), `tokenizeSessionFixtureCwd` (workspace đã sinh và các alias hệ thống file của nó, gồm cả alias `/private` trên macOS đã được token hóa → `{{cwd}}` chuẩn duy nhất; đường dẫn tạm viết tay giữ nguyên), `scrubSystemPrompts` (văn bản prompt → `{{system}}`), `scrubToolSchemas` (khối schema → `{{tools}}`), `scrubRequestHeaders` (mọi khối header ngoài mỗi pin → `{{system}}`/`{{tools}}`/`{{messagePrefix}}`, giữ nguyên cấu trúc; xem [Agent Note về pin header](../../../.agents/notes/archived/testing/2026-07-06-pin-request-header-content-in-one-scenario.md)) và `stabilizeFixtureMessageIds` (đối với log cha/con mà bất kỳ bộ ghi nào đã chuẩn bị ghi vào fixture, chỉ viết lại trường ID của các message đầy đủ trong surface và inbox bền vững theo cách có cấu trúc, đưa UUID đã commit vào các message không đổi và khớp song ánh duy nhất).
- **`defineAcpSnapshotSuite` (factory)**: đăng ký toàn bộ cây describe/it cho bảng scenario: so sánh đầu ra mong đợi của từng scenario với log đã lưu bền vững lại, ghi lại/làm mới fixture rồi ghi ngược, từ chối kết quả `UNKNOWN_TOOL` có cấu trúc, mỗi loại header một pin đã token hóa (được ghép từ file đồng hành `system-prompt.expected.md` và `tool-schemas.expected.json` có thể chia sẻ độc lập), cùng bảo vệ tính nhất quán thời gian thực. Cơ chế bảo vệ fixture của nó sẽ từ chối thư mục scenario cũ, file bị thiếu, một loại có nhiều pin, nội dung file đồng hành trùng lặp, cwd token có tiền tố macOS không chuẩn, header JSONL chưa được xóa, và header pin sai định dạng. Trước khi ghi fixture ở chế độ record hoặc refresh, chỉ khi ID của một message đầy đủ không đổi và dấu vân tay sau khi loại bỏ danh tính của nó đều duy nhất trong log cha/con có thể ghi fixture của scenario, message đó mới giữ lại UUID đã commit; vị từ (predicate) kiểu surface có thẩm quyền của gói session chịu trách nhiệm chọn vật mang surface, các bản sao `agent/inbox/spliced` liên quan cũng nằm trong cùng ánh xạ đó, và chỉ trường `id` đã qua xác thực trong các vật mang đó mới bị viết lại. Message mới, đã thay đổi, sai định dạng hoặc có quan hệ đồ thị mơ hồ sẽ giữ UUID sinh ra lần này. Việc refresh sẽ dùng id, cwd và mọi alias cwa cwd thu thập được của lần chạy này để đánh giá giá trị lá sinh ra lần này; chỉ khi bố cục bản ghi logic đầy đủ khớp nhau và việc thay thế chuỗi dễ biến đổi tạo thành song ánh, giá trị lá tương đương sau chuẩn hóa mới được tái sử dụng; ID message đầy đủ trong vật mang surface hoặc inbox không tham gia đường này, vì xử lý có cấu trúc tiếp theo chịu trách nhiệm về các ID đó; log mơ hồ giữ chuỗi sinh ra lần này, còn giá trị ngữ nghĩa sinh ra lần này vẫn là dữ liệu có thẩm quyền. Nó còn mở rộng envelope thời gian đóng gói trước khi căn chỉnh thời gian sự kiện, nên việc chuyển đổi bố cục đóng gói/không đóng gói không thể làm dịch chuyển các bản ghi sau đó. `session/title` mới chèn vào dùng thời gian của sự kiện trước đó, nên việc chèn do tính năng gây ra sẽ không làm nhiễu phần còn lại của fixture. `session.jsonl` và các file cùng cấp `session.<n>.jsonl` liên tiếp của mỗi thư mục scenario tạo thành danh sách có thứ tự của session chính/session con; bảng scenario không lặp lại số lượng của chúng. Phải được gọi trong lúc vitest thu thập test.

Fixture session được commit vào repo dùng dòng đóng gói chuẩn; [công cụ di trú tạm thời của repo](../../../scripts/migrate-packed-session-fixtures.ts) (`pnpm run migrate:packed-session-fixtures`) sẽ viết lại bố cục fixture cũ hơn, và [đề xuất gỡ bỏ](../../../.agents/notes/proposed/process/2026-07-26-remove-packed-session-fixture-migrator.md) của nó chịu trách nhiệm xóa công cụ di trú này.

File `*.snapshot.ts` của bên tiêu thụ chính là bảng scenario cộng một lần gọi factory:

```ts
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defineAcpSnapshotSuite,
  type Scenario,
  type SnapshotSuiteOptions,
} from '@deepseek-ai/dsh-acp-snapshot'

function snapshotMode(value: string | undefined): SnapshotSuiteOptions['mode'] {
  switch (value) {
    case undefined:
    case '':
    case 'replay': return 'replay'
    case 'record': return 'record'
    case 'refresh': return 'refresh'
    default: throw new Error(`unknown DSH_SNAPSHOT mode: ${value}`)
  }
}

const SCENARIOS: Scenario[] = [
  { name: 'text-turn', hasModelTurn: true, recorded: true, pinsHeader: true },
]

defineAcpSnapshotSuite({
  agent: { // absolute paths, resolved from the suite's own location
    binScript: fileURLToPath(new URL('../../../packages/examples/acp-demo/src/bin.ts', import.meta.url)),
    configPath: fileURLToPath(new URL('../cordis.yml', import.meta.url)),
    tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
  },
  snapshotsDir: join(dirname(fileURLToPath(import.meta.url)), 'snapshots'),
  scenarios: SCENARIOS, // exactly one entry per header class sets pinsHeader
  mode: snapshotMode(process.env.DSH_SNAPSHOT),
})
```

Scenario khởi động các cây tổ hợp khác nhau sẽ đặt `configPath` riêng của mình (một overlay có basename vẫn kết thúc bằng `cordis.yml`, để việc hoán đổi replay của bin có thể tìm thấy `*cordis.snapshot.yml` cùng cấp); khi tổ hợp đó thay đổi request header, nó còn đặt `headerClass` và scenario pin riêng, scenario Code Mode và filesystem của ví dụ acp-agent là template. Workspace được sinh ra mặc định sẽ lưu trong fixture session dưới dạng `{{cwd}}`, để thư mục gốc tạm của nền tảng và basename ngẫu nhiên không ảnh hưởng đến kết quả ghi; khi việc ủy quyền thư mục tạm chính là đối tượng kiểm thử, `workspaceParent` sẽ di chuyển cwd sinh ra khỏi vùng tạm của nền tảng, giữ đường dẫn tường minh đó trong fixture, và vẫn thuộc sở hữu của cấp cha, còn harness chỉ xóa cấp con được sinh ra. `workspace/` được commit của scenario sẽ được sao chép vào cấp con đó trước, sau đó `prepareWorkspace` chạy nhắm vào cwd đã sinh trước khi agent khởi động. Hook này chỉ dùng cho fixture mà Git không thể biểu diễn xuyên nền tảng; dữ liệu khởi tạo (seed) thông thường nên ở lại trong `workspace/`, còn khi đường dẫn sinh ra không hợp lệ trên Windows thì còn phải kèm `posixOnly`.

Mỗi pin mặc định có `system-prompt.expected.md` hoặc `tool-schemas.expected.json` sinh ra riêng; khi chuỗi tương ứng đầy đủ giống nhau, `systemPromptSource` và `toolSchemasSource` chỉ định một pin khác làm nguồn, nên mỗi phiên bản khác nhau chỉ được commit một lần. `session.jsonl` của pin đó lưu `"system":"{{system}}","tools":"{{tools}}"`, đồng thời giữ lại cấu hình, nguyên nhân và bất kỳ tiền tố nào hiển thị với model. Pin có thay đổi header hợp lệ trong lúc chạy khai báo `expectedHeaderChanges`; nguồn dùng chung phải khai báo cùng số lượng thay đổi header, việc record/refresh sẽ từ chối nếu bên tham chiếu dùng chung sinh ra byte khác nhau.

Child session tổ hợp ra request khác trong phạm vi của chính nó được khai báo riêng theo chỉ số fixture: `pinsChildToolSchemas` chuyển chuỗi công cụ của child đó vào `tool-schemas.<n>.expected.json`, `pinsChildSystemPrompts` chuyển prompt của nó vào `system-prompt.<n>.expected.md`. Cả hai đều chỉ đích danh fixture `session.<n>.jsonl` mà chúng mô tả, các trường header request còn lại vẫn thuộc về pin loại, và yêu cầu sidecar phải tồn tại đúng lúc được khai báo. Sidecar prompt của child còn phải khác với pin loại của nó, nên bản sao dư thừa sẽ thất bại ngay lập tức, thay vì âm thầm trôi dạt. Child có thể tiếp tục (continuable) mang theo công cụ `report` cục bộ trong phạm vi cùng section hướng dẫn của nó là ví dụ đi kèm của cả hai.

Mỗi scenario đều so sánh `stdout.expected.jsonl`, trong đó dấu phân tách gốc ở cwd được chuẩn hóa thành `/`. Trên Windows, `pinsNativeWindowsStdout` còn so sánh `stdout.expected.windows.jsonl` đầy đủ sau đầu ra mong đợi dùng chung, và chỉ yêu cầu file đồng hành đó tồn tại khi được bật. Scenario cần host không phải Windows khai báo `posixOnly`, bỏ qua chạy test trên Windows, nhưng cơ chế bảo vệ fixture vẫn bao phủ file đã commit của nó trên mọi nền tảng; ví dụ gồm ngữ nghĩa tiến trình POSIX (ví dụ hủy một lời gọi bash đang chạy sẽ chấm dứt một nhóm tiến trình đã tách rời) và đường dẫn sinh ra mà Windows không thể biểu diễn. Tổ hợp cần `pwsh` khả dụng khai báo `pwshOnly`; việc dò `hasPwsh` do bên gọi cung cấp (bộ scenario acp-agent đi kèm tuân theo cách phân giải của chính bộ thực thi, nên bản cài đặt Program Files cũng được tính) sẽ bỏ qua chạy test khi không phân giải được `pwsh` khả dụng, còn cơ chế bảo vệ fixture vẫn bao phủ file đã commit của nó ở mọi nơi.

Ví dụ còn phát hành overlay replay `cordis.snapshot.yml`, đặt cạnh `cordis.yml` (bin hoán đổi chúng dưới `DSH_SNAPSHOT=replay`, xem [Agent Note về cấu hình replay nguồn đơn](../../../.agents/notes/archived/testing/2026-07-04-single-source-acp-replay-config.md)); fixture replay do [`dsh-llm-replay`](../llm-replay/README.md) cung cấp, gói này trỏ tới nó qua biến môi trường `DSH_SNAPSHOT_*` được đặt cho tiến trình con. `pnpm run test:snapshot:record` gọi LLM (mô hình ngôn ngữ lớn) trực tuyến, và ghi đè fixture model của scenario đã ghi; `pnpm run test:snapshot:refresh` giữ trạng thái không cần key, chạy overlay replay, và ghi lại stdout, đầu ra mong đợi log session có thể so sánh, cùng các file đồng hành prompt và tool schema riêng của từng pin từ kịch bản model đã commit. Vai trò fixture, ngữ nghĩa record/replay/refresh và các trường bảng scenario được ghi lại trong `Scenario` và [Agent Note về snapshot](../../../.agents/notes/implemented/testing/2026-06-19-acp-snapshot-tests.md).

Ràng buộc: `suite.ts` và `harness.ts` import vitest (harness dùng `vi.waitFor` để poll chờ ranh giới bền vững của nó), nên entry point của gói chỉ có thể được import trong lúc vitest chạy (bộ khởi động và bộ chuẩn hóa không có phụ thuộc này, nhưng vẫn được phát hành từ cùng entry point). Bộ khởi động và factory bộ scenario được thiết kế chuyên dụng cho ACP, bộ khởi động dùng `ClientSideConnection` của SDK; bộ chuẩn hóa là công cụ hỗ trợ log session/văn bản không phụ thuộc tầng truyền tải, còn được bộ ghi snapshot JSON-RPC và Web tiêu thụ. Kịch bản input bao phủ khởi tạo, tạo session mới, cách viết tắt prompt văn bản, khối prompt ACP có cấu trúc chính xác, hủy bỏ, lỗi RPC mong đợi và việc chờ ranh giới lượt (turn) bền vững. Vòng đời quyền là hàng đợi FIFO của việc chọn loại tùy chọn (`allow_once`, `reject_once`, v.v.), ánh xạ tới `optionId` mà agent phát ra; hàng đợi thiếu hoặc cạn sẽ trả lời `cancelled`, loại chưa cung cấp sẽ từ chối chạy.

## Trải nghiệm model

Không có. Harness chuyên dụng cho kiểm thử này ghi lại, chuẩn hóa và so sánh transcript (bản ghi văn bản) ACP, không thay đổi request model do agent lắp ráp.

#### Ảnh hưởng KV Cache

Không có; gói này không lắp ráp cũng không gửi request tới provider.

## Hạn chế đã biết và công việc hoãn lại

- **Việc thu thập session cần mode JSONL thô**: `runScenario` thu thập log `.jsonl` đã lưu bền vững, nên cấu hình snapshot dùng `persistenceCompression: 'none'`; tổ hợp JSONL nén và SQLite không có đường thu thập snapshot.
- **Chế độ build cần artifact hiện tại**: chạy `pnpm run build` trước, rồi mới chọn `DSH_EXAMPLE_MODE=lib`; chế độ nguồn vẫn là đường không cần build.
- **Việc phủ backend vẫn dùng driver ACP**: lý do giữ scenario dùng tầng truyền tải này, xem [quyết định chỉ tự động hóa ACP](../../../.agents/notes/implemented/simplification/2026-07-23-acp-automation-only-protocol.md#snapshot-boundary).
