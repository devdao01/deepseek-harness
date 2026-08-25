# Agent Note: Capability seam lưu trữ KV theo miền và thực thể workspace

Status: proposed

[English](2026-07-24-domain-kv-storage-and-workspace.md) | Tiếng Việt

## Vấn đề

Mặt lưu bền duy nhất ở phía host là nhật ký sự kiện session (`packages/session/session-persistence`: chỉ ghi thêm, mỗi session một tệp). Mọi thông tin "không thuộc về một session nào" đều không có chỗ ghi xuống đĩa, và hiện có hai nhu cầu thực tế:

- **Thực thể workspace**. GUI muốn biến workspace thành một đối tượng thật: đường dẫn, tiêu đề, danh sách session liên quan. Quan hệ sở hữu do workspace nắm giữ — "những session nào thuộc workspace này" không phải là sự thật của riêng bất kỳ session đơn lẻ nào, nhét vào session log thì không hợp về mặt ngữ nghĩa. Trước thiết kế này, workspace chỉ là một khái niệm thị giác gom nhóm theo cwd trên sidebar, không có thực thể.
- **Metadata động của session** (bên tiêu thụ thứ hai có thể dự đoán trước). Danh sách session nguội chỉ đọc dòng header đầu tiên của log (ảnh chụp bất biến lúc tạo), nên không lấy được những thông tin thay đổi theo tiến trình phiên như title hay trạng thái kết thúc; hướng bù đắp là bảng metadata sidecar — chính là một bảng KV cập nhật điểm theo key với tần suất cao.

Ngoài ra, việc xóa Session cần nguyên thủy xóa của `SessionPersistence` và endpoint `session.delete`. Thiết kế cho khoảng trống đó được chốt cùng Note này, nhưng phần hiện thực vẫn thuộc công việc tương lai.

[Quyết định xóa bản ghi đăng ký Workspace](../../implemented/feature/2026-07-27-workspace-registration-deletion.md) về sau chỉ thay thế đúng quan hệ ghép nối nói trên: xóa bản ghi đăng ký Workspace sẽ giữ lại các Session liên quan cùng log của chúng, còn việc xóa Session vẫn là công việc tương lai độc lập. Do đó, thiết kế xóa dây chuyền dưới đây không phải là ngữ nghĩa xóa của Workspace GUI.

## Phương án

Lập nhóm mới `packages/storage/` — trung tâm lưu trữ `ctx.storage` (mặt đăng ký backend + mặt gắn dạng dữ liệu), hai backend, dạng dữ liệu miền domain — cùng package bên tiêu thụ workspace; và mở rộng nguyên thủy xóa cho `SessionPersistence`.

| Package | Đường dẫn | Mặt ctx | Đợt này |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh-storage` | `packages/storage/storage/` | `ctx.storage` (trung tâm) | ✓ |
| `@deepseek-ai/dsh-storage-json` | `packages/storage/storage-json/` | đăng ký backend `json` | ✓ |
| `@deepseek-ai/dsh-storage-sqlite` | `packages/storage/storage-sqlite/` | đăng ký backend `sqlite` | ✓ |
| `@deepseek-ai/dsh-storage-domain` | `packages/storage/storage-domain/` | gắn `ctx.storage.domain` | ✓ |
| `@deepseek-ai/dsh-workspace` | `packages/workspace/workspace/` | `ctx.workspaceRegistry` | ✓ |
| Mở rộng `SessionPersistence.delete` + điều phối xóa dây chuyền | `packages/session/*` | phương thức mới trên seam sẵn có | ✗ future work (đợt này không động phía session) |
| RPC `workspace.*` / `session.delete`, đấu nối GUI, lắp ráp boot | — | — | ✗ đợt sau |

(workspace đặt ở nhóm riêng chứ không đặt vào `packages/host/`: quy tắc đặt tên của nhóm host yêu cầu tiền tố `dsh-host-*`, trong khi tên package được định là `dsh-workspace`; hơn nữa thực thể workspace là khái niệm miền, không ràng buộc vào tầng lắp ráp host. Không liên quan tới package `agent-instructions` sẵn có — đó là bộ nạp chỉ thị AGENTS.md.)

Hướng phụ thuộc: `dsh-workspace` → `dsh-domain` → `dsh-storage` ← hai backend. `dsh-workspace` còn phụ thuộc mặt chỉ đọc của `ctx.sessionPersistence` (kiểm tra cwd khi attach thì đọc session header; khi dịch vụ vắng mặt thì attach từ chối thẳng — không kiểm tra được thì không ghi sổ). Phần kiểm tra "đang chạy" trên `ctx.sessions` liên quan tới xóa session được xếp chung vào future work cùng với xóa dây chuyền.

### `dsh-storage`: trung tâm lưu trữ

Thuần túy là trung tâm đăng ký, tự nó không làm IO, không có Config. Dịch vụ `Storage` gắn vào `ctx.storage`, có hai mặt: `backend` (`BackendRegistry`: `register(name, backend)` trả về disposer, trùng tên thì throw; `get(name)` với tên lạ thì throw `backend-not-found`) và mặt gắn dạng dữ liệu (`mount(form, facility)` ăn khớp với map merge-extensible `StorageForms`, `dsh-domain` merge vào khóa `domain`; truy cập khi chưa gắn thì throw `form-not-mounted`). Phần chữ ký chính xem `packages/storage/storage/src/index.ts` và `src/registry.ts`.

**Nhiều backend gắn đồng thời**; việc chọn miền→backend là cấu hình của `dsh-domain` (xem bên dưới), không phải chọn một trong hai ở phạm vi toàn cục. Ngữ nghĩa disposer = gỡ tên khỏi bảng; việc close của bản thân backend do closure effect của package backend chịu trách nhiệm, thứ tự là gỡ tên trước rồi mới close.

Một backend là một **owner của phương tiện lưu trữ** (một cây tệp root / một tệp db), phơi bày nguyên thủy qua **facet hình dạng dữ liệu** — đợt này chỉ có `kv`; giai đoạn di trú session sẽ thêm `log` (xem mục di trú). facet là thành viên tùy chọn, vắng mặt nghĩa là backend đó không hỗ trợ hình dạng ấy, và fail loud khi phân giải. Mặt nguyên thủy của facet `kv`: `open(descriptor)` (descriptor = tên/phiên bản/danh sách tên bảng/có global hay không; tên và tên bảng giới hạn ở `^[a-z][a-z0-9_]*$` để dùng chung làm tên tệp và làm đoạn tên bảng SQL) trả về unit, và unit cung cấp `loadAll` / `putRecord` / `deleteRecord` (thiếu key là no-op) / `setGlobal` / `close` (idempotent); giá trị là JSON mờ đối với backend. Phần đặc tả chính (kèm JSDoc từng phương thức) nằm ở `packages/storage/storage/src/backend.ts`.

Quy ước của backend (bộ test quy ước dùng chung khẳng định từng điều, hai backend chạy cùng một suite):

1. `open` tạo mới với phương tiện chưa tồn tại (cho phép vật chất hóa lười: có thể hoãn tới lần ghi đầu, nhưng `loadAll` phải dùng được ngay và trả về bảng rỗng); với phương tiện đã tồn tại thì nạp vào.
2. Phiên bản trên phương tiện ≠ descriptor.version → `StorageError('version-mismatch')`, không migrate, không dựng lại.
3. Tính bền: sau khi nguyên thủy ghi resolve, nếu tiến trình sập rồi open lại thì `loadAll` bắt buộc phải phản ánh lần ghi đó.
4. Backend không cam kết thứ tự ghi đồng thời trong một unit — **bên gọi chịu trách nhiệm tuần tự hóa**; backend chỉ bảo đảm tính nguyên tử của một lần gọi đơn lẻ (ghi đè toàn tệp JSON / một câu lệnh SQLite).
5. `deleteRecord` idempotent; `putRecord` ghi đè.
6. An toàn với key là chuỗi bất kỳ / giá trị JSON bất kỳ (key không đi vào đường dẫn tệp, đây là tính chất cấu trúc).
7. `close` idempotent; sau khi close thì mọi thao tác → `StorageError('closed')`.

Từ vựng lỗi là `StorageError` có code phân biệt, bảng mã: `backend-not-found` / `form-not-mounted` / `duplicate-backend` / `duplicate-mount` / `version-mismatch` / `malformed-medium` / `closed` (`packages/storage/storage/src/error.ts`).

### `dsh-storage-json`

Config chỉ có `root` (bắt buộc, không mặc định, schemastery); apply đăng ký backend `json` bên trong `ctx.effect()`, disposer gỡ tên trước rồi `backend.close()`.

- Bố cục `<root>/<unitName>.json`, mỗi unit một tệp; thư mục 0o700, tệp 0o600.
- Định dạng tệp (dấu phiên bản nằm ở header, tệp chính là giá trị hiện hành, `JSON.stringify(…, null, 2)` để đọc được bằng mắt — đây là lý do tồn tại của backend này):

```json
{
  "unit": { "name": "workspace", "version": 1 },
  "global": null,
  "tables": { "workspaces": { "<key>": {} } }
}
```

- Ghi: bất kỳ lần gọi nguyên thủy ghi nào = serialize toàn bộ trạng thái trong bộ nhớ → ghi tệp temp + fsync → rename để phát hành nguyên tử (biến thể Windows sao y đường win32 của session-persistence-jsonl). Trạng thái trong bộ nhớ là bản có thẩm quyền, đĩa là projection.
- `loadAll`: parse toàn tệp lúc open; thiếu header `unit`, tables không phải object, v.v. → `malformed-medium`. Tệp không tồn tại = unit rỗng, lần ghi đầu mới xuống đĩa.

### `dsh-storage-sqlite`

Config là `path` (bắt buộc, cho phép `':memory:'`) + `journalMode` (enum, mặc định `wal`); apply giống json, đăng ký backend `sqlite`.

- `node:sqlite` `DatabaseSync`; trình tự mở sao y session-persistence-sqlite: mkdir 0o700 → nếu chưa tồn tại thì `open(path,'wx',0o600)` để tạo tệp độc quyền → `PRAGMA foreign_keys=ON` → journal_mode → kiểm tra phiên bản → tạo bảng.
- Phiên bản bố cục vật lý `STORAGE_SQLITE_SCHEMA_VERSION = 1` lưu ở `PRAGMA user_version`: 0 → đóng dấu; ≠ → `version-mismatch`.
- DDL (toàn bộ STRICT; tên bảng ghép từ tập ký tự bị giới hạn và thêm tiền tố `u_`, triệt tiêu khả năng đầu vào bên ngoài lọt vào DDL):

```sql
CREATE TABLE IF NOT EXISTS units (name TEXT PRIMARY KEY, version INTEGER NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS unit_globals (
  unit TEXT PRIMARY KEY REFERENCES units(name), value TEXT NOT NULL) STRICT;
-- 每 unit 每表：
CREATE TABLE IF NOT EXISTS "u_<unit>_<table>" (
  key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;             -- value = 记录 JSON 文档
```

- Phiên bản của unit lưu ở hàng trong `units`, descriptor không khớp → `version-mismatch`. Độ mịn theo hàng, document-per-row, giữ được khả năng cập nhật chính xác theo key xuống đĩa (chừa đường cho những bảng cập nhật điểm tần suất cao như session sidecar); khi có nhu cầu truy vấn thì dùng JSON1 truy vấn thẳng cột value.
- Nguyên thủy ghi chỉ một câu lệnh nên đã nguyên tử, không cần transaction xuyên nhiều câu lệnh (tầng domain không có transaction xuyên bảng, xem danh sách không làm).

### `dsh-domain`: dạng dữ liệu miền

Một phần hiện thực duy nhất, không trừu tượng hóa; bên tiêu thụ chỉ phụ thuộc tầng này, không chạm thẳng vào backend.

```ts ignore-check
export const Config = z.object({
  backend: z.string().required(),                // 默认后端名，必填
  routes: z.dict(z.string()).default({}),        // per-domain 覆盖：{ workspace: 'sqlite' }
})

export function apply(ctx: Context, config: Config) {
  ctx.effect(() => ctx.storage.mount('domain', new DomainFacility(ctx, config)))
}
```

(Thứ tự gỡ facility: dispose từng miền trước (rút cạn chuỗi ghi) rồi mới gỡ tên khỏi trung tâm — trong lúc rút cạn, các lượt ghi đang trên đường vẫn phát `domain/changed`, mà invariant về tính nhất quán sự kiện lại tra ngược miền qua facility, nên yêu cầu tên miền lúc này vẫn phân giải được.)

Khai báo miền (đối tượng spec do package sở hữu miền đó định nghĩa và export, là nguồn sự thật duy nhất cho cả kiểu lẫn runtime; schema dùng zod, kiểu suy ra bằng `z.infer` chứ không khai báo lặp — đợt sau mô hình bản ghi sẽ được projection thành wire schema RPC, mà biên wire toàn bộ dùng zod; schemastery vẫn chỉ lo Config của plugin):

```ts ignore-check
export interface DomainGlobalSpec<G> { readonly schema: ZodType<G>; readonly initial: G }
export interface DomainTableSpec<K extends string, V> { readonly valueSchema: ZodType<V> }

export interface DomainSpec {
  readonly name: string                          // ^[a-z][a-z0-9_]*$
  readonly version: number
  readonly global?: DomainGlobalSpec<unknown>
  readonly tables: Record<string, DomainTableSpec<string, unknown>>
}

export function defineDomain<S extends DomainSpec>(spec: S): S
export function domainTable<K extends string, V>(schema: ZodType<V>): DomainTableSpec<K, V>
```

Ngữ nghĩa chính xác của `DomainFacility.open(spec)` (thực hiện tuần tự, hỏng bất kỳ bước nào là hỏng toàn bộ):

1. Miền trùng tên đã mở → `DomainError('already-open')`.
2. Tên backend = `config.routes[spec.name] ?? config.backend`; `ctx.storage.backend.get(name)` (chưa gắn thì `backend-not-found` xuyên qua — misconfiguration fails loud).
3. Backend không có facet `kv` → `DomainError('facet-unsupported')`.
4. `kv.open(descriptorOf(spec))` (descriptor được projection trực tiếp từ spec).
5. `loadAll()`; mỗi bản ghi đi qua `valueSchema.parse`, global đi qua schema (null thì lấy `initial`, không ghi xuống đĩa, lần ghi đầu mới xuống đĩa). Thất bại → `DomainError('invalid-record', { table, key })` (biên durable bắt buộc phải kiểm tra; phía ghi không kiểm tra lặp lại).
6. Dựng `Domain` và đăng ký `ctx.effect()`: disposer rút cạn chuỗi ghi → `unit.close()`.

```ts ignore-check
export interface Domain</* 由 spec 推导 */> {
  readonly name: string
  readonly global: { get(): G; set(value: G): Promise<void> }   // 仅当 spec.global 声明
  table<N extends keyof S['tables']>(name: N): KvTable<KeyOf<N>, ValueOf<N>>
}

export interface KvTable<K extends string, V> {
  get(key: K): V | undefined                     // 内存快照，同步
  entries(): IterableIterator<[K, V]>
  keys(): IterableIterator<K>
  readonly size: number
  put(key: K, value: V): Promise<void>
  delete(key: K): Promise<boolean>               // false = 本就不存在
  /** Atomic read-modify-write on the domain's single write chain; fn is sync-pure. */
  update(key: K, fn: (current: V) => V): Promise<V>   // 缺 key → DomainError('missing-key')
}
```

Quy tắc:

- **Ánh xạ một cấp**: key → bản ghi, không làm bảng lồng nhau; nhu cầu phân cấp thì dùng key phức hợp hoặc trường bên trong giá trị. Nhờ vậy hai backend đồng cấu (một cấp object JSON ↔ một hàng SQLite).
- **Bản ghi là dữ liệu thuần**: POJO bất biến, serialize thẳng ra JSON được; giá trị mà `get`/`entries` trả về không được sửa tại chỗ (projection readonly của TypeScript, không đóng băng lúc runtime). Đối tượng miền có hành vi thì thuộc về package bên tiêu thụ.
- **Ghi tuần tự**: mỗi miền một chuỗi promise, `put`/`delete`/`update`/`global.set` đều xếp hàng; hàm fn của `update` chạy trên chuỗi đó, không đan xen khi có đồng thời. Không làm active-record (lấy ra một object khả biến rồi tự động ghi xuống đĩa — thời điểm ghi không kiểm soát được, xung đột với việc ghi đè nguyên tử toàn miền).
- **Phiên bản fail loud**: phiên bản trên đĩa không khớp spec thì báo lỗi thẳng, không migrate, không dựng lại (dữ liệu không tái tạo được, tiền phát hành từ chối định dạng cũ).
- **Sự kiện thay đổi**: sau mỗi lần ghi xuống đĩa resolve thì emit `domain/changed` (`@mode emit`), phát từng bản ghi một, không kèm giá trị cũ (khớp với thông lệ "ảnh chụp mới + phân biệt thao tác" của repo, hình mẫu là `goal/changed`); payload `DomainChanged` là union phân biệt put/deleted — tên miền + tên bảng + key (thay đổi global thì cả hai là `''`) + operation, nhánh put mang theo ảnh chụp mới value, nhánh deleted không có value (`packages/storage/storage-domain/src/events.ts`). Đây là nguồn sự kiện cho khung đẩy RPC ở đợt sau. Từ vựng lỗi là `DomainError`, bảng mã: `already-open` / `facet-unsupported` / `invalid-record` (kèm `{ table, key }`) / `missing-key` / `closed`.

### Future work: xóa ở phía session (thiết kế đã chốt, đợt này không hiện thực)

Mục này là đặc tả thi công đã chốt, tới kỳ hiện thực thì chỉ đổi code chứ không đổi ngữ nghĩa; đợt này không sửa bất kỳ tệp nào của session-persistence.

```ts ignore-check
export abstract class SessionPersistence extends Service {
  /**
   * Permanently delete one session's stored log.
   * Queued on the per-id write chain (serialized with in-flight appends).
   * Unknown id → reject; un-materialized create intent → cancel it and resolve.
   * After deletion the id behaves as unknown for every subsequent operation.
   */
  abstract delete(id: SessionId): Promise<void>
}
```

- Backend JSONL: unlink tệp của session đó (bao gồm biến thể `.zstd`); nếu không có cả tệp lẫn intent → reject.
- Backend SQLite: một transaction `DELETE FROM events…; DELETE FROM sessions…`; 0 hàng khớp và không có intent → reject.
- Sau khi xóa thành công thì emit `'session-persistence/deleted'(id: SessionId)` (`@mode emit`; mặt sự kiện ở tầng session-persistence, không liên quan tới `domain/changed`). Dữ liệu dẫn xuất (chỉ mục toàn văn của session-query, v.v.) tự đăng ký để tự dọn; tầng lưu bền không nối thẳng tới chỉ mục, còn cửa sổ sập thì dựa vào việc chỉ mục dẫn xuất có thể bỏ đi và dựng lại để đỡ.

Quy tắc tầng điều phối (hiện thực cùng lúc với xóa dây chuyền; RPC `session.delete` và xóa dây chuyền của workspace dùng chung một bộ quy tắc):

| Kiểm tra (theo thứ tự) | Khi không thỏa |
| --- | --- |
| Mục tiêu (khi đệ quy thì gồm cả cây con) không có cái nào đang chạy trong `ctx.sessions` | throw, không xóa gì cả; bên gọi phải cancel trước rồi mới xóa, tầng lưu bền không kéo ngược vào runtime |
| Khi không đệ quy thì mục tiêu không có hậu duệ (hậu duệ = bao đóng bắc cầu của `parentSessionId`, tính từ header do `list()` trả về) | throw: mặc định chỉ xóa được lá, `recursive: true` mới đệ quy tường minh |
| Thứ tự đệ quy đi từ dưới lên (lá→gốc) | —— sập giữa chừng chỉ để lại "cây con xóa một nửa, tổ tiên vẫn còn", chạy lại thì hội tụ, không lúc nào có parent treo lơ lửng |
| Trong dây chuyền có id đã không còn trên đĩa | bỏ qua (xóa tiếp idempotent); các lỗi khác thì hủy bỏ |

### `dsh-workspace`

Package sở hữu brand `WorkspaceId`, phơi bày `ctx.workspaceRegistry`. Key của bản ghi là uuid sinh ra — path không dùng làm key: chuẩn hóa sẽ viết lại nó, mà điểm neo tham chiếu thì phải ổn định.

```ts ignore-check
export type WorkspaceId = Branded<'WorkspaceId'>
export function WorkspaceId(id: string): WorkspaceId

const workspaceRecord = z.object({
  path: z.string(),                              // realpath，见下
  title: z.string(),
  sessionIds: z.array(z.string().transform(SessionId)),
  createdAt: z.string(),                         // ISO
  updatedAt: z.string(),
})
export type WorkspaceRecord = z.infer<typeof workspaceRecord>

export const workspaceDomainSpec = defineDomain({
  name: 'workspace', version: 1,
  tables: { workspaces: domainTable<WorkspaceId, WorkspaceRecord>(workspaceRecord) },
})

declare module 'cordis' { interface Context { workspace: WorkspaceRegistry } }

export interface Workspace {
  readonly id: WorkspaceId
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly SessionId[]      // 唯一真相且有序：数组序即展示序
  setTitle(title: string): Promise<void>
  /** Record a session under this workspace (idempotent). Rejects when the session
   *  header's cwd (realpath) differs from this workspace's path. */
  attachSession(sessionId: SessionId): Promise<void>
  detachSession(sessionId: SessionId): Promise<void>
  /** Live directory check, uncached. */
  status(): Promise<'ok' | 'missing-dir'>
}

export class WorkspaceRegistry extends Service {
  constructor(ctx: Context)                      // super(ctx, 'workspaceRegistry')
  // start(): this.domain = await ctx.storage.domain.open(workspaceDomainSpec)
  //          实体缓存 Map<WorkspaceId, WorkspaceEntity> 重建
  create(path: string, title?: string): Promise<Workspace>   // realpath 后撞已有 → reject
  get(id: WorkspaceId): Workspace | undefined
  list(): Workspace[]
  resolveByPath(path: string): Promise<Workspace | undefined> // 同 realpath 口径，故 async
  delete(id: WorkspaceId): Promise<boolean>      // 只删注册记录；目录与 session 日志保留
}
```

- **Chuẩn hóa path**: giá trị ghi xuống đĩa = `fs.realpath(đầu vào)` (dấu gạch chéo cuối, `..`, symbolic link đều được phân giải); tính duy nhất = so sánh chuỗi bằng nhau sau khi chuẩn hóa (symbolic link trỏ về cùng một thư mục thì coi là trùng). Khi thư mục không tồn tại thì create reject thẳng (realpath thất bại — workspace bắt buộc phải trỏ tới thư mục có thật; "Create new = tạo thư mục" là tương tác ở tầng trên, mkdir trước rồi mới create). Cwd của session mà attach kiểm tra cũng theo cùng chuẩn đó. cwd đơn trị + path duy nhất ⇒ về mặt cấu trúc, một session thuộc về nhiều nhất một workspace, việc ghi sổ trùng lặp là bất khả thi ở phía ghi.
- **title**: tên hiển thị, mặc định `basename(path)`, sửa được, cho phép trùng. Quan hệ sở hữu không dùng cwd suy ra để đỡ — cwd không diễn đạt được thứ tự, mà quan hệ sở hữu là sự thật thuộc phía workspace; session mở thẳng dạng headless không thuộc workspace nào.
- Bên tiêu thụ chỉ thấy interface `Workspace`, `WorkspaceEntity` không ra khỏi package (một phần hiện thực duy nhất, không tách seam trước); thực thể duy nhất theo id (registry cache), ảnh chụp bản ghi sau khi ghi thì thay mới tại chỗ, bên ngoài chỉ thấy getter; mọi lượt ghi hội tụ vào `mutate(fn)` bên trong thực thể → `table.update`, và `updatedAt` được làm mới thống nhất bên trong mutate. Đối tượng miền không đi qua RPC, đợt sau tầng wire sẽ projection bản ghi thành zod wire schema.
- **Việc xóa Session vẫn thuộc công việc tương lai.** [Quyết định xóa bản ghi đăng ký Workspace](../../implemented/feature/2026-07-27-workspace-registration-deletion.md) về sau đã bàn giao `ctx.workspaceRegistry.delete(id)` như một thao tác chỉ xóa metadata, giữ lại Session và log. Việc xóa Session đệ quy, kiểm tra "đang chạy" và hội tụ khi chạy lại sau sự cố thuộc về năng lực `session.delete` độc lập.

Chuẩn nhất quán (sổ sách = căn cứ duy nhất về quan hệ sở hữu; là chuẩn mực cho hiện thực và kiểm thử):

| Tình huống | Hành vi |
| --- | --- |
| id có trong sổ nhưng trên đĩa không có session | lọc bỏ khi `list()`/projection thực thể; lần mutate bất kỳ kế tiếp thì tiện tay gỡ ra; không báo lỗi (đây là sản phẩm bình thường của tính nhất quán khi sập lúc xóa) |
| cwd của session khớp một workspace nào đó nhưng chưa vào sổ | không thuộc về: không gộp, không thu nạp. GUI sau này có thể làm khu riêng cho "session trôi nổi" (trôi nổi = phần bù của toàn bộ sổ sách) |
| Cùng một session có mặt trong hai sổ | chặn về mặt cấu trúc ở phía ghi (kiểm tra khi attach); nếu phát hiện lúc load → throw (dữ liệu bị sửa tay từ bên ngoài, không che giấu) |
| Thư mục workspace không tồn tại | giữ nguyên bản ghi và sổ sách, `status()` = `'missing-dir'`; tầng lưu trữ không tự xóa (thư mục có thể chỉ tạm bị chuyển đi) |

### Triển vọng tái sử dụng và di trú backend của session

**Hướng đi dài hạn**: phần "thao tác thuần trên phương tiện lưu trữ" trong backend JSONL/SQLite của session-persistence được hạ xuống backend của `dsh-storage` (package session không bị xóa, ngữ nghĩa của seam `SessionPersistence` và của coordinator không đổi; cái thay đổi chỉ là tầng thao tác tệp/db nằm bên dưới chúng). Động cơ tái sử dụng: tầng phương tiện toàn là thao tác hệ thống tệp, lời gọi cơ sở dữ liệu và những việc bẩn về tương thích đa nền tảng (biến thể quyền và phát hành nguyên tử trên Windows, ngữ nghĩa fsync, tạo tệp độc quyền…), những thứ này chỉ nên viết một lần; còn ngữ nghĩa nghiệp vụ (session append thế nào, append khi nào, append cái gì) thì ở lại tầng trên — mà "lần append bên dưới đó có hoàn tất bình thường hay không" (tính bền/tính nguyên tử/tính đúng đắn trên nền tảng) là trách nhiệm của tầng dưới, và mặt phân định trách nhiệm chính là quy ước của nguyên thủy facet. Vì vậy interface backend được thiết kế theo **owner phương tiện + facet hình dạng dữ liệu**: session log là luồng chỉ ghi thêm, khác hình dạng với KV — ép gộp vào nguyên thủy KV thì cả hai đầu đều méo mó, nên tách theo facet (`kv` đợt này, `log` giai đoạn di trú), còn phương tiện và vòng đời thì dùng chung.

Kiểm toán tái sử dụng ở hiện trạng (bảng sổ có thể nhìn rõ ngay trước khi di trú):

| Logic hiện có trong session-persistence | Thuộc về | Xử lý |
| --- | --- | --- |
| JSONL: ghi temp + fsync + link/unlink phát hành nguyên tử, quyền 0o700/0o600, biến thể Windows (win32.ts) | thuần phương tiện | đợt này `dsh-storage-json` chép dùng trực tiếp (ghi đè nguyên tử toàn tệp chính là cùng một bộ); tới giai đoạn di trú thì trở thành phần hiện thực dùng chung |
| JSONL: append từng dòng, đọc nhanh header dòng đầu, nén zstd theo từng frame | hình dạng log | ở nguyên chỗ; giai đoạn di trú thì vào facet `log` |
| SQLite: openDatabase (mkdir/tạo tệp độc quyền/trình tự PRAGMA/kiểm tra user_version) | thuần phương tiện | đợt này `dsh-storage-sqlite` chép dùng — hai chỗ openDatabase vốn đã gần như đồng cấu từng dòng, nhóm này là người dùng thứ ba; chép trước rồi trích xuất sau, phần trích xuất để giai đoạn di trú |
| SQLite: cấu trúc bảng events/sessions, vật chất hóa trong cùng transaction | hình dạng log | ở nguyên chỗ; giai đoạn di trú thì vào facet `log` |
| coordinator (chuỗi ghi per-id, vật chất hóa lười, sửa chữa sau sự cố, hàng rào flush) | ngữ nghĩa session | không bao giờ hạ xuống — đây là logic miền của nhật ký sự kiện, cái tương ứng ở tầng domain là chuỗi ghi tuần tự, ai lo phần nấy |
| encodeSegment (escape id khi đưa vào đường dẫn) | công cụ phương tiện | phía domain key không đi vào đường dẫn nên không dùng tới; sẽ hạ xuống cùng facet `log` (mỗi session một tệp) khi di trú |

**Đợt này không sửa code phương tiện của session-persistence** (chỉ thêm nguyên thủy delete); bảng trên là danh sách thi công của giai đoạn di trú, đồng thời là căn cứ thiết kế cho việc interface backend "bắt buộc phải chứa được hình dạng log".

### Ma trận kiểm thử

| Suite | Bao phủ | Backend |
| --- | --- | --- |
| Quy ước backend (suite dùng chung, viết một lần chạy hai đầu) | bảy quy ước + từ chối theo phiên bản + close idempotent | json, sqlite (`:memory:` + thư mục tạm) |
| Registry/mount | đăng ký trùng, truy cập khi chưa gắn, disposer gỡ tên | — |
| Tầng domain | ngữ nghĩa sáu bước của open, schema từ chối, update tuần tự (nén tải đan xen đồng thời), `domain/changed` từng bản ghi, vật chất hóa lười giá trị khởi tạo của global, định tuyến và `facet-unsupported` | bất kỳ (json) |
| workspace | create/tính duy nhất/realpath, kiểm tra khi attach (gồm cả việc từ chối khi sessionPersistence vắng mặt), bốn tình huống của chuẩn nhất quán | mock domain hoặc json |
| Quy ước xóa session (future work, khi hiện thực thì gộp vào runPersistenceContract) | id lạ, tái dùng id đã xóa, intent chưa vật chất hóa, tuần tự hóa với append đang trên đường, sự kiện deleted | jsonl, sqlite |

Snapshot: đợt này không có mặt model-visible và mặt lắp ráp, không thêm mới; đợt sau khi đấu nối RPC thì bổ sung theo miền `workspace.*`.

### Danh sách không làm

| Không làm | Điều kiện kích hoạt | Điểm phải làm lại | Phần chôn sẵn |
| --- | --- | --- | --- |
| Xóa Session (`SessionPersistence.delete`, sự kiện deleted, xóa đệ quy, kiểm tra đang chạy) | khi khởi động luồng sản phẩm xóa Session mang tính phá hủy | hiện thực nguyên thủy Session và `session.delete`; giữ độc lập với việc xóa bản ghi đăng ký Workspace | quy tắc điều phối và danh sách từ chối ở trên vẫn là nền tảng; xóa Workspace sẽ giữ lại Session và log |
| Facet `log` và di trú backend session | khởi động ở bất kỳ đợt nào sau đợt này | hạ thao tác phương tiện xuống (bảng kiểm toán tái sử dụng chính là danh sách thi công) | cấu trúc facet đã chừa chỗ; code phương tiện của hai backend ngay đợt này đã tổ chức theo hình dạng có thể hạ xuống |
| Bảo vệ ghi đồng thời đa tiến trình | hai tiến trình host cùng ghi một phương tiện | khóa tệp cho backend JSON; SQLite WAL vốn đã đa tiến trình | mọi lượt ghi đều đi qua điểm tuần tự hóa duy nhất ở domain, thêm khóa chỉ động tới backend |
| Quan sát thay đổi xuyên tiến trình | GUI mất kết nối rồi kết nối lại cần nhận biết | mẫu revision (chép từ session-persistence) | trong tiến trình đã có `domain/changed` |
| Di trú dữ liệu | mô hình lại đổi sau bản tagged release đầu tiên | migrate từng miền do số phiên bản dẫn dắt | số phiên bản đã vào phương tiện ngay từ ngày đầu |
| Hiệu năng bảng lớn | miền cỡ nghìn bản ghi lại gắn vào json | đổi `routes` trỏ sang sqlite, chuyển dữ liệu thủ công một lần | định tuyến chính là cấu hình, bên tiêu thụ không phải sửa gì |
| Key nhiều đoạn | xuất hiện bên tiêu thụ dùng key hai đoạn (dữ liệu theo chiều mỗi workspace mỗi session) | đổi generic của key sang tuple, khóa chính phức hợp cho SQLite, thêm tầng lồng nhau cho JSON | bảng một cấp = trường hợp đặc biệt số đoạn bằng 1; không làm lồng nhau độ sâu tùy ý; không ghép key bằng chuỗi |
| Chiều scope | xuất hiện miền kiểu "mỗi workspace một bản" mà key phức hợp không diễn đạt nổi | thêm scope vào DomainSpec + đoạn scope trong tên tệp (encodeSegment) | tập ký tự của tên đã siết chặt, tên tệp không xung đột |
| Transaction nguyên tử xuyên bảng | nhu cầu thao tác nguyên tử trên hai bảng cùng miền | `domain.transact(fn)`; JSON vốn đã nguyên tử, SQLite thì bọc transaction | — |
| Chỉ mục phụ / truy vấn có điều kiện | lọc trong bộ nhớ không kham nổi (cỡ vạn bản ghi) | SQLite JSON1 truy vấn cột value, thêm mặt query chỉ đọc | backend JSON không chạy theo |
| Chuyển session giữa các workspace | khi nhu cầu sản phẩm xuất hiện | nới kiểm tra khi attach thành điều phối "detach trước rồi attach" | — |
| RPC／GUI xóa Session | khi khởi động luồng sản phẩm xóa Session mang tính phá hủy | endpoint `session.delete`, wire schema và UI xác nhận rõ ràng | RPC／GUI của Workspace đã bàn giao độc lập, không còn tồn tại ghép nối dây chuyền |

## Phương án thay thế

- **Tái sử dụng coordinator/backend của session-persistence**: ngữ nghĩa nhật ký sự kiện (chỉ ghi thêm, sửa chữa sau sự cố ở turn, vật chất hóa lười) không khớp với ngữ nghĩa ghi đè của KV; chỉ mượn tư tưởng phân tầng của nó (tầng điều phối giữ thứ tự ghi, backend chỉ hiện thực nguyên thủy tối thiểu).
- **Package lưu trữ chuyên dụng cho workspace, sau này mới trích seam**: bên tiêu thụ thứ hai (session sidecar) đã dự đoán được, tới lúc đó tổng quát hóa lại phải động vào interface thêm lần nữa.
- **Gộp domain và storage thành một tầng**: backend sẽ bị buộc phải chạm tới các mối bận tâm của miền như kiểm tra schema, sự kiện thay đổi, ghi tuần tự; tách ra thì backend storage chỉ làm nguyên thủy mờ (mặt có thể thay thế là nhỏ nhất), còn domain với một phần hiện thực duy nhất thì hội tụ toàn bộ logic miền (zod/sự kiện/tuần tự hóa chỉ viết một lần, không nhân đôi theo số backend).
- **Toàn kho chọn một backend duy nhất (học mẫu single slot của session-persistence)**: bác bỏ — trung tâm lưu trữ phải chứa nhiều dạng dữ liệu, mà sở thích backend của các dạng/miền khác nhau (đọc được bằng mắt đối lại cập nhật điểm tần suất cao) tất yếu phân hóa, single slot sẽ ép ra thao tác thô kiểu "đổi toàn bộ + chuyển dữ liệu thủ công". Cái giá là tra tìm theo tên thêm một bước, có fail-loud đỡ lưng.
- **Backend JSON kiểu jsonl append + tombstone + nén gọn (compaction)**: mức an toàn khi sập của temp+fsync+rename tương đương append; ghi đè khiến tệp luôn là giá trị hiện hành, đọc được bằng mắt, khỏi phải làm gấp／nén gọn／chịu lỗi dòng đứt. Ở quy mô một miền, ghi toàn bộ và append một dòng cùng cấp độ lớn.
- **JSON mỗi bảng một tệp**: dưới cơ chế ghi đè thì độ mịn tệp không ảnh hưởng chi phí ghi, gộp theo miền thì ít tệp hơn, và global singleton có chỗ để rơi vào.
- **SQLite lưu cả miền trong một blob một hàng**: bất kỳ thay đổi bản ghi nào cũng viết lại cả miền, mất khả năng cập nhật chính xác theo key — ưu thế duy nhất của SQLite so với JSON coi như bằng không.
- **SQLite sinh typed columns theo schema**: bộ sinh DDL là xây dựng thừa; document-per-row là đủ, khi nào có nhu cầu truy vấn thì bàn tiếp.
- **Mỗi miền một tệp db sqlite riêng**: trái với thông lệ một db nhiều bảng của repo.
- **Dùng path làm key của workspace**: chuẩn hóa/phân giải symbolic link sẽ viết lại path; điểm neo tham chiếu phải ổn định.
- **Quan hệ sở hữu suy ra từ cwd (hoặc gộp với sổ sách)**: hai nguồn sự thật; cwd không diễn đạt được thứ tự; quan hệ sở hữu vốn dĩ là sự thật thuộc phía workspace.
- **Sự kiện thay đổi mang theo giá trị cũ**: thông lệ sự kiện thay đổi của repo là "ảnh chụp mới + phân biệt thao tác" (ngoại lệ duy nhất là before/after của fs, nhưng đó là giá trị trả về của phương thức chứ không phải sự kiện, vì giá trị cũ không tái dựng được sau đó và có bên tiêu thụ cần diff); bên tiêu thụ nào cần diff thì tự giữ ảnh chụp lần trước.
- **Xóa thì tự động cancel session đang chạy**: tầng lưu bền/tầng điều phối kéo ngược vào runtime, làm bẩn phân tầng; cơ chế cancel đã có sẵn, bên gọi tự tổ hợp là được.

## Tiêu chí chấp nhận

- Bốn suite của ma trận kiểm thử đợt này xanh toàn bộ: suite quy ước backend dùng chung chạy trên cả json/sqlite, ngữ nghĩa disposer của registry/mount, tầng domain (gồm sáu bước của open và fail-loud khi định tuyến), toàn bộ ngữ nghĩa workspace (create/kiểm tra khi attach/chuẩn nhất quán).
- `ctx.workspaceRegistry` hoàn thành được vòng đời create → attach → list → delete chỉ xóa metadata trong bản lắp ráp phục vụ kiểm thử.
- Package session-persistence có diff bằng không (đây là mốc chấp nhận cho việc đợt này không động phía session).
- Đợt này không có snapshot mới (không có mặt model-visible và mặt lắp ráp); đợt sau khi đấu nối RPC thì bổ sung.

## Rủi ro

- **Sự kiện thay đổi kiểu đẩy đầu tiên trên mặt lưu bền của repo** (session-persistence dựa vào polling revision): tuy đã có hình mẫu `goal/changed`, nhưng "tầng lưu trữ phát sự kiện" là một tiền lệ mới, phải tới đợt sau khi RPC tiêu thụ mới kiểm chứng được hình thái ấy có phù hợp hay không.
- **Tiền đề quy mô của việc ghi đè toàn miền ở backend JSON**: nếu bên tiêu thụ thứ hai (session sidecar) rơi vào backend JSON với cỡ nghìn bản ghi trước khi kịp định tuyến sang SQLite, thì chi phí ghi toàn bộ sẽ lộ ra sớm hơn dự kiến; cách giảm nhẹ chính là đổi `routes` trỏ sang sqlite.
- **Phụ thuộc yếu của việc điều phối xóa vào `ctx.sessions`**: khi bản lắp ráp headless không lấy được registry runtime thì xử lý theo hướng "không có session nóng", nên tồn tại một cửa sổ (tiến trình bên ngoài đang chạy session đó); đa tiến trình vốn đã nằm trong danh sách không làm, nên chấp nhận.
- **Việc tổng quát hóa facet lấy facet `log` tương lai làm căn cứ thiết kế nhưng đợt này chưa hiện thực nó**: tồn tại rủi ro "hình dạng chừa sẵn không vừa"; cách giảm nhẹ là code phương tiện của backend đợt này được tổ chức theo hình dạng hạ xuống trong bảng kiểm toán tái sử dụng, để khi facet `log` thực sự ra đời thì chỉ phải động tới tầng facet.
