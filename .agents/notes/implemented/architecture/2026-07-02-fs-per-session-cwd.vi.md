# Agent Note: Đường dẫn filesystem tương đối được resolve theo cwd của session gọi

Status: implemented

[English](2026-07-02-fs-per-session-cwd.md) | Tiếng Việt

## Vấn đề

Tầng cầu nối ACP (Agent Client Protocol) cung cấp workspace riêng cho mỗi session: `session/new` ghi lại thư mục project của client tự động hóa dưới dạng `SessionHeader.cwd`, `dsh-tool-bash` mặc định `workdir` cho mỗi lệnh gọi bash bằng `session.header.cwd` của agent (tác nhân) gọi (xem [package ACP](../../../../packages/acp/acp) và `resolveWorkdir` trong `dsh-tool-bash`). Do đó lệnh bash trong session A chạy tại thư mục project của A, trong session B chạy tại thư mục project của B——một tiến trình server, N workspace.

Việc resolve filesystem dùng cwd tại thời điểm load plugin, còn bash dùng thư mục project của session. Do đó, khi thư mục project của client tự động hóa khác với thư mục khởi động server, kết quả resolve đường dẫn tương đối sẽ không nhất quán; snapshot test bị che giấu bug này vì hai đường dẫn được đặt giống nhau.

Một cwd tuyệt đối hợp lệ tự nó có thể trông như có hai thư mục cha: khi nó chứa `symlink/..`, tra cứu filesystem sẽ theo symbolic link trước rồi mới áp dụng `..`, còn `path.resolve()` lại xóa cả hai thành phần này theo nghĩa từ vựng (lexical). Nếu resolve chính sách sandbox theo nghĩa từ vựng nhưng lại khởi động bash từ cwd gốc, sẽ cấp quyền cho thư mục cha từ vựng không liên quan, từ chối ghi trong workspace thật, và khiến công cụ filesystem resolve đường dẫn tương đối vào sai thư mục.

cwd là symbolic link thông thường cũng phơi bày cùng sự khác biệt đó khi đường dẫn tương đối được yêu cầu chứa `..`: tiến trình duyệt bắt đầu từ đích vật lý của symbolic link, còn `path.resolve(cwd, path)` lại duyệt bắt đầu từ cách viết từ vựng của nó. Do đó, với cùng một đường dẫn model cung cấp, file mà read chọn sẽ khác với file mà bash hoặc mutation được sandbox hóa chọn cho cùng đường dẫn đó.

## Quyết định

Truyền cwd của session gọi vào việc resolve đường dẫn, hoàn toàn nhất quán với cách `dsh-tool-bash` xử lý `workdir`. Khi cwd hoặc đường dẫn được yêu cầu chứa thành phần thư mục cha, resolve cwd thành định danh filesystem gốc trước bất kỳ lần join từ vựng nào; khi không có bước duyệt nào khiến định danh có thể quan sát được, giữ nguyên cách viết cwd thông thường để hiển thị. Mutation và lệnh gọi bash được sandbox hóa tái sử dụng thư mục gốc chính sách sandbox đã resolve, để một lệnh gọi chỉ có một định danh workspace. **Bên gọi** (tức công cụ) cung cấp cwd; provider không đọc session hay agent.

- `FileSystem.resolve` nhận `resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>`. `opts.cwd` là thư mục gốc dùng để resolve `path` tương đối; `path` tuyệt đối bỏ qua nó; bỏ qua `opts.cwd` thì dùng giá trị mặc định của backend. Khi backend thực hiện I/O, `opts.signal` có thể hủy việc resolve. Đối tượng options gom hai điều khiển resolve mà bên gọi sở hữu lại với nhau, tránh tham số vị trí tiếp tục tăng.
- `dsh-fs-local.resolve` dùng `resolveLocalTarget(opts?.cwd ?? this.config.cwd, path)`. `config.cwd` vẫn là giá trị mặc định khi bên gọi không cung cấp cwd của session.
- `read`/`write`/`edit` của `dsh-tool-fs` lấy cwd của session qua hàm hỗ trợ dùng chung `sessionCwd(exec, requestedPath)` (`exec.agent?.session.header.cwd`, tương ứng với `resolveWorkdir` của bash), và truyền cho `resolve`. Chỉ khi thành phần thư mục cha trong một trong hai giá trị có khả năng vượt qua symbolic link, hàm hỗ trợ này mới dùng ngữ nghĩa realpath gốc, nếu không giữ nguyên cách viết thông thường; mutation được sandbox hóa tái sử dụng `workspaceRoot` của chính sách đầy đủ; bên gọi không phải agent/không có header nhận `undefined`, backend do đó áp dụng giá trị mặc định của nó.

## Phương án thay thế đã cân nhắc

### Vì sao cwd do bên gọi (không phải provider) cung cấp

Convention của provider không được phụ thuộc vào `dsh-agent`/`dsh-session`——đây là convention backend lưu trữ văn bản, một implementation được sandbox hóa hoặc từ xa cũng thỏa mãn convention đó, và các implementation này không có khái niệm "session agent". Công cụ đã nhận `ToolExecution` (`exec`), thứ mang theo agent, nên công cụ là nơi đúng đắn để chiếu `exec → cwd` và truyền cho provider một chuỗi thuần túy. Điều này tuân theo convention "tường minh hơn ngầm định ở ranh giới package": thư mục gốc được truyền vào như tham số tường minh, provider hành động dựa trên đó, thay vì để provider vượt ranh giới đọc session mà nó không nên biết. Điều này cũng tương ứng một-một với `dsh-tool-bash`, khiến hai interface thao tác file hướng tới model resolve đường dẫn theo cùng cách.

Giá trị mặc định chỉ tồn tại ở một nơi——`config.cwd` của provider. `sessionCwd` trả về `undefined` khi không có session, thay vì `process.cwd()`, nên công cụ không bao giờ tự tạo ra một thư mục gốc mà lẽ ra provider phải tự chọn.

## Hậu quả

- Trong demo ACP, công cụ fs và bash đồng thuận về workspace cho mỗi session; client tự động hóa có thể chọn bất kỳ thư mục project tuyệt đối nào, cả hai loại công cụ đều thao tác trong thư mục đó.
- Với cwd session chứa `symlink/..`, hoặc cwd symbolic link thông thường kèm đường dẫn tương đối có duyệt thư mục cha, bash, công cụ filesystem và ủy quyền sandbox đều resolve từ cùng một workspace vật lý; thư mục cha từ vựng không được cấp quyền.
- Định danh của `FsTarget` không đổi: `targetKey` vẫn là realpath của đường dẫn tuyệt đối đã resolve, nên việc keying observed-state và định danh symbolic link không bị ảnh hưởng——cwd đúng cho mỗi session tạo ra cùng key với đích bash.
- Tương thích ngược: mọi lệnh gọi `resolve(path)` hiện có (đều trong test) tiếp tục hoạt động bình thường; tham số mới là tùy chọn.
- Demo stdio đơn session không bị ảnh hưởng: nó không cung cấp cwd session (session của agent của nó không có `cwd`), nên việc resolve rơi về `config.cwd = process.cwd()`, chính là workspace.
</content>
