# Skills

[English](skills.md) | Tiếng Việt

[Nhóm năng lực skill (kỹ năng)](../../packages/skill) gồm Service Definition ([dsh-skill](../../packages/skill/skill), `ctx.skills`), Service Provider cục bộ ([dsh-skill-filesystem](../../packages/skill/skill-filesystem)), provider huy hiệu đi kèm package tùy chọn ([dsh-skill-badge](../../packages/skill/skill-badge)) và Consumer ([dsh-tool-skill](../../packages/skill/tool-skill)). Registry hợp nhất danh mục của các provider giữa tầng host và các tầng scope; provider đóng góp skill cục bộ hoặc đi kèm package; Consumer sở hữu danh mục khởi tạo và danh mục thay thế, cùng công cụ `skill` hướng tới mô hình. skill là chỉ dẫn tùy chọn chứ không phải sự kiện session, nên từ vựng của nó được định nghĩa ở đây thay vì trong [core.md](core.md).

Mã nguồn: [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts), [`packages/skill/skill-filesystem/src/index.ts`](../../packages/skill/skill-filesystem/src/index.ts), [`packages/skill/skill-badge/src/index.ts`](../../packages/skill/skill-badge/src/index.ts) và [`packages/skill/tool-skill/src/index.ts`](../../packages/skill/tool-skill/src/index.ts).

## Registry của provider

`ctx.skills` kết hợp các provider cục bộ, nhúng, từ xa hoặc loại khác. Việc đăng ký là đồng bộ; khởi tạo từ xa và phát hiện thuộc giai đoạn await của `list()`. Đối tượng provider, options và ứng viên được mượn ở dạng chỉ đọc, còn các trường ngữ nghĩa thì được kiểm tra hợp lệ.

Registry có cấu trúc phân tầng gồm host + theo từng scope, đúng hình thái mà [registry công cụ](tools.md) đã xác lập trên nền [dsh-scope](../../packages/core/scope): một mục đăng ký sẽ rơi vào tầng tương ứng với scope của ngữ cảnh gọi — các dòng host và plugin của repository rơi vào tầng toàn cục, còn plugin do bản composition thường trú của preset agent (trí tuệ nhân tạo tác tử) mount thì rơi vào tầng của preset đó — tên provider là duy nhất trong từng tầng, chứ không phải duy nhất ở cấp tiến trình. Khi đọc, tầng toàn cục được hợp nhất với chuỗi tầng của scope quan sát: mục ở tầng gần nhất thắng trực tiếp với skill trùng tên, còn thứ tự rank nói dưới đây chỉ phân xử trùng tên trong cùng một tầng. Cache phát hiện được khóa theo chuỗi scope đã phân giải, nên việc đặt lại scope cha (tái tổ chức session rỗng) sẽ được lần đọc kế tiếp nhìn thấy mà không cần thay đổi registry.

Trong cùng một tầng, các mục trùng tên được xác định độ ưu tiên lần lượt theo rank, thứ tự provider và thứ tự cục bộ; phần tóm tắt được sắp xếp theo tên. Khi `list()` của một provider bị từ chối, hệ thống ghi log và bỏ qua kết quả của provider đó trong quan sát không đầy đủ; quan sát không đầy đủ tường minh vẫn cung cấp các ứng viên khả dụng nhưng không làm kết quả trở nên cache được; ứng viên sai định dạng thì thất bại ngay lập tức. Mỗi factory của provider nhận một khả năng điều khiển trong phạm vi mục đăng ký; `invalidate()` của nó chỉ xóa danh mục đã hoàn tất khi chính mục đăng ký đó vẫn còn hoạt động; khi đăng ký thất bại hoặc bị dispose (giải phóng tài nguyên), signal của nó sẽ bị hủy. Nếu thế hệ provider thay đổi trong lúc đang phát hiện, lần phát hiện đó sẽ thử lại một lần; nếu lại thay đổi thì trả về ứng viên mới nhất và đánh dấu kết quả là không đầy đủ và không cache. Thay đổi ở provider và lúc chạy sẽ phát ra sự kiện vô hiệu hóa `skills/change` không kèm điều kiện lọc; sự kiện này không mang diff, nên consumer sẽ lấy lại `snapshot()` bằng chính options tra cứu của mình.

Mảng do `SkillProvider.list()` trả về là dạng viết tắt của một lần phát hiện đầy đủ. `SkillProviderObservation` cho phép provider công bố các ứng viên vẫn có thể nạp trực tiếp, đồng thời báo rằng quan sát đó không có tính thẩm quyền.

```ts type-equiv
/** Provider candidates plus whether the current discovery is authoritative. */
interface SkillProviderObservation {
  /** Candidates available from the current provider discovery. */
  readonly candidates: readonly SkillCandidate[]
  /** Whether discovery completed and these candidates may be cached. */
  readonly complete: boolean
}
```

```ts type-equiv
/** Provider interface for one source of skills, such as local directories or a remote registry. */
interface SkillProvider {
  /** Unique provider name in the `ctx.skills` registry. */
  readonly name: string
  /**
   * List available skill candidates for the current lookup context. Provider
   * plugins register synchronously during `apply()`; remote initialization,
   * authentication, and discovery are awaited inside this method. Implementations
   * should settle promptly when `options.signal` aborts.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns provider candidates as a complete-array shorthand, or an explicit
   *   observation when usable candidates came from incomplete discovery.
   */
  readonly list: (options: SkillLookupOptions) => Promise<readonly SkillCandidate[] | SkillProviderObservation>
  /**
   * Load a complete skill body for a previously listed candidate.
   * @param candidate - the winning candidate originally returned by this provider.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns the full skill body, or `undefined` if it is no longer loadable.
   */
  readonly get: (candidate: SkillCandidate, options: SkillLookupOptions) => Promise<SkillDefinition | undefined>
}
```

```ts type-equiv
/** Registration-scoped lifecycle and invalidation capability borrowed by one provider. */
interface SkillProviderControl {
  /** Aborts if registration fails or when the exact provider registration is disposed. */
  readonly signal: AbortSignal
  /** Invalidate completed catalogs and notify consumers only while the exact registration remains active. */
  readonly invalidate: () => void
}
```

## Thứ tự ưu tiên khi phát hiện cục bộ

Provider cục bộ đi kèm sẽ quét từng thư mục gốc theo thứ tự rank:

| Rank | Source | Root |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |
| 600 | `bundled` | dùng thư mục này khi đã cấu hình `Config.bundledSkillDir` |

Thư mục gốc của dự án là thư mục tổ tiên gần nhất có chứa `.git`; nếu không tìm thấy thì dùng cwd hiện tại. Khi `ctx.fs` khả dụng, việc tìm ngược lên git-root sẽ dò `.git` qua dịch vụ hệ thống file, nhờ đó workspace từ xa hoặc trong sandbox không bị lùi về biên hệ thống file của host. Thư mục gốc DSH của người dùng sẽ bỏ qua thư mục con `.system` của nó. Provider cục bộ không tự tổng hợp skill hệ thống dựng sẵn; bên triển khai cung cấp skill đi kèm package thông qua thư mục gốc bundled đã cấu hình hoặc qua provider chuyên dụng.

`dsh-skill-badge` đăng ký một ứng viên `bundled` bất biến tại `BUNDLED_SKILL_RANK` và công bố thư mục tài nguyên đi kèm package của nó qua `resourceBase`. Bản CLI (giao diện dòng lệnh) được phát hành khai báo plugin này ở trạng thái tắt, nên việc bật dòng cấu hình composition của nó chính là hành vi chọn tham gia tường minh.

Chokidar theo dõi việc thêm và gỡ các bundle trực thuộc cùng các mục dàn phẳng trong những thư mục gốc đang tồn tại, cũng như thay đổi của các mục skill trực thuộc. Với thư mục gốc bị thiếu, hệ thống lần theo từng đoạn đường dẫn còn thiếu bắt đầu từ tổ tiên gần nhất đang tồn tại, cho đến khi Chokidar có thể gắn vào. Thay đổi ở các file tài nguyên bên dưới một bundle không được tính là thay đổi danh mục. Các quan sát `write` và `edit` hướng tới mô hình sẽ vô hiệu hóa đồng bộ danh mục của provider khi đường dẫn đích liên quan tới danh mục, còn watcher của host thì bao phủ các thay đổi phát sinh từ IDE, Git, shell và tiến trình bên ngoài. Watcher thất bại làm quan sát hiện tại trở nên không đầy đủ, nhưng không che giấu các ứng viên đọc được khi nạp trực tiếp; watcher ở phạm vi dự án dùng LRU với giới hạn theo cấu hình.

## Danh tính skill

Tên skill viết theo kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Provider cục bộ chấp nhận cả gói dạng thư mục (`<name>/SKILL.md`) lẫn file Markdown dàn phẳng (`<name>.md`). Việc phát hiện đệ quy lồng nhau theo `**/SKILL.md` không được hỗ trợ.

```ts type-equiv
/** Origin bucket for a skill contribution. The value is prompt-visible metadata, not precedence by itself. */
type SkillSource = 'project-dsh' | 'project-agents' | 'runtime' | 'user-dsh' | 'user-agents' | 'custom' | 'bundled' | (string & {})
```

## Tóm tắt, ứng viên và định nghĩa đầy đủ

`SkillSummary` là hình thái tóm tắt trong registry, độc lập với chính sách gọi. Consumer tự chọn hiển thị mục nào và trường nào; danh mục session của mô hình chỉ dùng `name` và `description` của những skill mà mô hình có thể gọi, không bao giờ dùng phần thân hay đường dẫn file tuyệt đối. `SkillInvocationPolicy` chuẩn hóa hai điều khiển gọi độc lập thành giá trị boolean thuận, và mọi bản tóm tắt, ứng viên và định nghĩa đã phân giải đều mang theo chính sách đó, thay vì đưa frontmatter tùy ý vào mô hình miền.

```ts type-equiv
/** Invocation controls shared by skill discovery consumers. */
interface SkillInvocationPolicy {
  /** Whether model-facing catalogs and loaders include this skill. */
  readonly modelInvocable: boolean
  /** Whether human-facing command catalogs and loaders include this skill. */
  readonly userInvocable: boolean
}
```

```ts type-equiv
/** Invocation-neutral skill metadata returned by `ctx.skills.list()`. */
interface SkillSummary {
  /** Kebab-case identifier used to address the skill. */
  readonly name: string
  /** Short routing description shown by discovery consumers. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Resolved model and user invocation controls. */
  readonly invocation: SkillInvocationPolicy
  /** Discovery source that produced this winning skill. */
  readonly source: SkillSource
  /** Provider that owns this skill body. */
  readonly provider: string
  /** Provider-specific base for relative resources. */
  readonly resourceBase?: SkillResourceBase
}
```

`ctx.skills.list()` giữ lại đủ cả bốn tổ hợp chính sách. `isModelInvocable(skill)` và `isUserInvocable(skill)` lần lượt đọc trường bắt buộc tương ứng. Skill chỉ dành cho mô hình gọi đặt `{ modelInvocable: true, userInvocable: false }`, skill chỉ dành cho người dùng gọi đặt `{ modelInvocable: false, userInvocable: true }`, còn khi cả hai trường đều là `false` thì skill đó chỉ có thể được lấy bởi bên gọi `ctx.skills.get()` đáng tin cậy. Provider cục bộ đọc đúng các khóa frontmatter kebab-case trùng tên hoàn toàn là `disable-model-invocation` và `user-invocable`, mặc định trường bị bỏ qua thành `true`, và sinh ra chính sách chuẩn hóa này cho mỗi skill đã phân tích.

`SkillCatalogSnapshot` dùng để phân biệt giữa việc chắc chắn không tồn tại với thất bại nhất thời của provider hoặc danh mục thay đổi liên tục trong lúc phát hiện. `skills` chứa các bản tóm tắt được thu thập, sắp xếp và độc lập với chính sách gọi trong lần quan sát đó; `complete` chỉ bằng true khi mọi provider đã đăng ký đều hoàn tất việc phát hiện mà không có bản sửa đổi danh mục đồng thời. Snapshot không đầy đủ sẽ không được cache, nhờ đó mỗi consumer có thể giữ lại danh mục khả dụng đã lọc theo cách riêng của lần trước và thử lại.

```ts type-equiv
/** One catalog observation plus whether discovery completed within a stable catalog revision. */
interface SkillCatalogSnapshot {
  /** Sorted invocation-neutral summaries collected in this observation. */
  readonly skills: SkillSummary[]
  /** Whether every registered provider completed without a concurrent catalog revision. */
  readonly complete: boolean
}
```

`SkillCandidate` là hình thái đi từ provider tới registry. `locator` là trạng thái mờ đục của provider; registry chỉ lưu nó và truyền ngược lại khi gọi `get()` của provider thắng cuộc.

```ts type-equiv
/** Provider catalog entry used by the registry to merge and later load skills. */
interface SkillCandidate extends SkillSummary {
  /** Lower ranks win duplicate skill names before provider registration order is considered. */
  readonly rank: number
  /** Opaque provider-owned handle passed back to `provider.get()`. */
  readonly locator: unknown
  /** Absolute file path when the provider has one. */
  readonly path?: string
  /** Parsed optional metadata object from provider-specific skill frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

`SkillDefinition` là kết quả phân giải đầy đủ do `ctx.skills.get()` trả về, phục vụ công cụ `skill`. `resourceBase` cho công cụ biết cách hiển thị phần hướng dẫn tài nguyên tương đối đối với skill cục bộ, skill theo URL hoặc skill do provider quản lý.

```ts type-equiv
/** Optional provider-specific base used by loaded skill bodies to resolve relative resources. */
type SkillResourceBase =
  | { readonly kind: 'directory'; readonly path: string }
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'opaque'; readonly description: string }
```

```ts type-equiv
/** Complete parsed skill definition, including the body loaded by `ctx.skills.get()`. */
interface SkillDefinition extends SkillSummary {
  /** Markdown instruction body after any provider-specific metadata removal. */
  readonly content: string
  /** Absolute file path when the skill came from disk. */
  readonly path?: string
  /** Parsed optional metadata object from frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

Đầu vào skill lúc chạy có thể bỏ qua phần điều khiển gọi và nhãn provider. Registry sẽ bổ sung giá trị mặc định cho cả hai một lần, sau đó dùng cùng hình thái định nghĩa đầy đủ như của provider và cùng thứ tự thu thập ai đến trước được trước. Disposer trả về sẽ gỡ bỏ đóng góp đó và vô hiệu hóa cache phát hiện.

```ts type-equiv
/** Runtime skill contribution accepted by `ctx.skills.register()`. */
type SkillRegistration = Omit<SkillDefinition, 'invocation' | 'provider'> & {
  /** Invocation controls; omission permits both model and user surfaces. */
  readonly invocation?: SkillInvocationPolicy
  /** Provider label; omission uses the registry-owned runtime provider. */
  readonly provider?: string
}
```

## Tra cứu và cấu hình

Việc tra cứu skill nhạy cảm với cwd, vì provider có thể phơi bày skill cục bộ theo workspace; signal tùy chọn giúp bên gọi hủy công việc của provider. Thao tác đọc registry còn mang theo scope quan sát qua `SkillViewOptions` — consumer truyền vào agent đang gọi, và bản thân agent chính là scope key của nó; registry tiêu thụ `scope` để chọn tầng, còn provider chỉ đọc phần quy ước `SkillLookupOptions` của mình từ cùng một đối tượng options được mượn đó. Việc hủy được kiểm tra cả trước lẫn sau khi chọn danh mục (kể cả khi cache trúng), và chạy đua với quá trình phát hiện cũng như nạp định nghĩa đầy đủ. Nếu không tìm thấy git root, provider cục bộ sẽ coi chính cwd được cung cấp là thư mục gốc của dự án.

Registry không cache định nghĩa đầy đủ. Mỗi lần gọi `get()` đều gọi provider thắng cuộc kèm ứng viên đã chọn, nên provider cục bộ sẽ đọc lại phần thân hiện hành. Định nghĩa có tên không còn khớp với ứng viên đó sẽ bị từ chối, và thể hiện provider đó bị vô hiệu hóa để phát hiện lại.

```ts type-equiv
/** Caller context used for cwd-sensitive and abortable provider work. */
interface SkillLookupOptions {
  /** Workspace selector for the current lookup. */
  readonly cwd?: string | undefined
  /** Abort discovery or loading work for the current caller. */
  readonly signal?: AbortSignal | undefined
}
```

```ts type-equiv
/**
 * Registry read options: provider lookup context plus the viewing scope.
 * The registry consumes `scope` to select layers; providers receive the same
 * borrowed options object and read only their {@link SkillLookupOptions}
 * contract from it.
 */
interface SkillViewOptions extends SkillLookupOptions {
  /** Viewing scope (the calling agent); omitted reads the global layer alone. */
  readonly scope?: ScopeKey | undefined
}
```

Registry chỉ sở hữu giới hạn trên của cache phát hiện của chính nó. Provider cục bộ sở hữu các thư mục gốc trên hệ thống file (`dshHome`, `agentsHome`, `customSkillDirs`, cùng `bundledSkillDir`/`DSH_BUNDLED_SKILL_DIR` tùy chọn), cũng như các điều khiển bật watcher, polling, độ ổn định, symbolic link và dung lượng theo dự án. Consumer sở hữu giới hạn trên cho phần mô tả danh mục của mình. Giá trị mặc định chính xác và quy tắc kiểm tra hợp lệ xem tại [danh mục cấu hình plugin](../config-catalog.md) được sinh tự động.

```ts type-equiv
/** Skill registry configuration. */
interface Config {
  /** Maximum number of completed cwd/provider catalogs kept in memory. */
  readonly collectCacheMaxEntries?: number
}
```

## Danh mục session và quy ước công cụ

`dsh-tool-skill` chèn `<system-reminder>` khởi tạo bền vững với vai trò user tại `agent/pre-step` đầu tiên quan sát được một view đầy đủ và không rỗng trong session đang sống. Danh mục chỉ chứa `name` của skill đã sắp xếp và `description` đã chuẩn hóa, đã escape XML; không chứa phần thân, đường dẫn, nguồn gốc, provider hay gợi ý định tuyến. Việc phát hiện chuyển tiếp abort signal của bước đó qua `SkillLookupOptions`. `catalogDescriptionMaxLength` là cấu hình mà consumer dùng cho giới hạn trên của description, giá trị mặc định là `500`, tối thiểu là số nguyên `3`.

Trước mỗi bước mô hình tiếp theo, consumer áp dụng đúng phạm vi hiển thị công cụ và tính digest trên các mục được hiển thị chính xác giữa các thẻ `<available_skills>` trong snapshot đầy đủ. Nó lấy các mục tương ứng trong thông điệp danh mục mới nhất mà plugin này đã phát hành, còn nhận diện được và vẫn hiển thị, làm mốc so sánh. Khi digest thay đổi, một bản thay thế danh mục đầy đủ, bền vững sẽ được nối thêm qua `agent.inject()`; khi mọi skill bị xóa thì nối thêm một bản thay thế rỗng tường minh. Snapshot không đầy đủ sẽ giữ lại view mô hình khả dụng của lần trước. Nếu quá trình nén (compaction) ẩn hết các thông điệp danh mục trong lịch sử, snapshot đầy đủ kế tiếp sẽ tái lập danh mục hiện hành; nếu view rỗng và chưa từng phát hành danh mục nào thì không gửi gì cả. Những thông điệp danh mục này thuộc lịch sử session, không thuộc World State.

Công cụ `skill({ name })` hướng tới mô hình kiểm tra tên kebab-case, tra cứu bản tóm tắt trong danh mục độc lập với chính sách gọi, và từ chối skill không có quyền truy cập thông qua `isModelInvocable` trước khi nạp; sau đó nó đọc lại định nghĩa đầy đủ theo cwd của agent gọi, và kiểm tra chính sách lần nữa trước khi trả về nội dung. Công cụ báo cáo skill không phân giải được là không xác định hoặc đã không còn khả dụng, và trả về kết quả công cụ gồm `<skill_content name="...">`, `<skill_resources>` và `<skill_instructions>`. `resourceBase` chỉ phân giải theo nhu cầu các script, tài liệu tham khảo và tài nguyên được tham chiếu tường minh; kết quả nạp không liệt kê thư mục skill. Do đó, việc chỉ sửa phần thân sẽ thay đổi các lần gọi công cụ về sau, mà không sinh ra thông điệp danh mục hay viết lại kết quả công cụ trước đó.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxskills--skillregistry"></a>

### `ctx.skills` — `SkillRegistry`

Layered registry of skill providers, the host+per-scope shape the tools registry established. A registration files into the layer of its calling context's scope (scopeOf): host rows and repository plugins land in the global layer, while a plugin mounted by an agent preset's standing composition lands in that preset's layer. A read merges the global layer with the viewing scope's chain — the nearest layer's entry wins a duplicate name outright, and the rank order decides duplicates only within one layer. It exposes sorted invocation-neutral summaries and loads full skill bodies on demand.

```ts cordis-catalog
/**
 * Register a borrowed same-process provider synchronously during plugin
 * apply, into the calling context's layer: a scoped context (an agent
 * preset's standing mount) registers for that scope alone, an unscoped
 * context registers globally. Duplicate names within one layer and reserved
 * names throw; remote initialization belongs in `list()`. Fiber disposal
 * unregisters the provider and invalidates catalog caches.
 * @param create - synchronous factory receiving this registration's lifecycle and invalidation control.
 * @returns the exact Cordis effect disposer that unregisters this provider;
 *   composite effects may yield it directly to preserve teardown ordering.
 */
registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void

/**
 * Register a borrowed readonly runtime skill into the calling context's
 * layer. Project entries outrank runtime entries, which outrank user
 * entries, within one layer. Same-name runtime entries in one layer are
 * first-wins; a duplicate logs a warning and receives a no-op disposer so
 * it cannot remove the winner.
 * @param skill - the skill definition input; omitted invocation and provider fields receive defaults.
 * @returns the exact Cordis effect disposer, preserving composite teardown order and invalidating caches.
 */
register(skill: SkillRegistration): () => void

/**
 * List invocation-neutral skill summaries for a workspace. Consumers apply
 * model or user invocation policy at their operational boundary. Lookup
 * options and provider candidates are readonly same-process values borrowed
 * throughout discovery.
 * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
 * @returns all sorted winning summaries.
 */
async list(options: SkillViewOptions = {}): Promise<SkillSummary[]>

/**
 * Observe the current invocation-neutral catalog and whether discovery completed within a stable revision.
 * Incomplete observations are never cached, allowing consumers to retain last-good state and
 * retry on their next request boundary.
 * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
 * @returns sorted summaries plus discovery-completeness state.
 */
async snapshot(options: SkillViewOptions = {}): Promise<SkillCatalogSnapshot>

/**
 * Load and validate the winning candidate, passing its opaque discovery locator back to the
 * provider. Cancellation is rechecked after selection, including cache hits, and raced against
 * loading so an uncooperative provider cannot hang the caller.
 * @param name - kebab-case skill name.
 * @param options - view options; `scope` selects the viewing agent's layers,
 *   `cwd` selects workspace-sensitive skills, and `signal` cancels work.
 * @returns the full skill, including body content, or `undefined`.
 */
async get(name: string, options: SkillViewOptions = {}): Promise<SkillDefinition | undefined>
```

Source: [`packages/skill/skill/src/index.ts:357`](../../packages/skill/skill/src/index.ts)

<a id="skills-events"></a>

### `skills/*` events

<a id="skillschange--emit"></a>

#### `skills/change` — emit

A skill provider, runtime contribution, or provider-backed catalog may have changed. This is an unfiltered invalidation notification; consumers refetch the catalog for their own lookup options. Listener failures are contained and cannot veto the registry mutation.

```ts cordis-catalog
/**
 * A skill provider, runtime contribution, or provider-backed catalog may
 * have changed. This is an unfiltered invalidation notification; consumers
 * refetch the catalog for their own lookup options. Listener failures are
 * contained and cannot veto the registry mutation.
 * @mode emit
 */
'skills/change'(): void
```

Source: [`packages/skill/skill/src/index.ts:297`](../../packages/skill/skill/src/index.ts)
<!-- END GENERATED cordis-surface -->
