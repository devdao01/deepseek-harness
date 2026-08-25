# @deepseek-ai/dsh-session-projection

[English](README.md) | Tiếng Việt

Service Definition và registry điều khiển cho projection của session. Nó sở hữu `ctx.sessionProjections`: registry này điều khiển mỗi đơn vị projection đã đăng ký trên các sự kiện session đã commit, và cung cấp giá trị cuối hoàn chỉnh cho carrier, hiện gồm trang đuôi lịch sử của api-proxy và frame đẩy `session/projection`. Domain chỉ đăng ký thuần túy toán học; quyền điều khiển thuộc về framework. [RFC session-projection](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md) ghi lại lý do thiết kế.

## Service: `SessionProjectionRegistry` (khóa ctx: `sessionProjections`)

### API công khai

- `ctx.sessionProjections.register(definition): () => void` đăng ký một đơn vị của domain. Key trùng lặp hoặc `stateVersion` không hợp lệ đều throw; việc đăng ký là một effect gắn trên fiber của bên gọi, khi plugin domain bị gỡ, key của nó (cùng với cell trong cache) biến mất khỏi các lần điều khiển và snapshot sau đó — client đọc thành sự vắng mặt năng lực.
- `ctx.sessionProjections.onChanged(listener): () => void` đăng ký luồng thay đổi: gọi lại một lần cho mỗi sự kiện đã commit, mỗi đơn vị có tham chiếu trạng thái thay đổi, kèm view đã xác thực qua schema và seq nguyên nhân. Giống `register`, gắn với effect.
- `ctx.sessionProjections.snapshot(session): ProjectionSnapshot` thực hiện một mặt cắt đồng bộ nhất quán cho toàn bộ đơn vị đã đăng ký — `{ asOfSeq, values }`, trong đó `asOfSeq` = seq của sự kiện cuối cùng mà mọi giá trị cùng phản ánh (log rỗng là `-1`).

### Kiểu chính

- `SessionProjectionMap` — bảng kiểu merge-extensible duy nhất cho toàn bộ chuỗi liên kết (đơn vị phía host, khối giao thức, hook React). Giá trị là giá trị JSON đầy đủ ở tầng giao thức; việc render do hệ thống slot quản lý, không bao giờ thuộc tầng này.
- `ProjectionDefinition<K, S>` — `{ key, schema, init(), apply(state, event), view(state), stateVersion }`: một đơn vị tính toán dẫn hướng bởi trạng thái (state-driven computation unit) gồm ba hàm đồng bộ thuần cộng với vài khai báo, không bao giờ là một getter mờ.

## Quy ước

- **Framework đảm nhiệm điều khiển, domain đảm nhiệm tính toán.** Registry chỉ đăng ký `session/event` một lần; mỗi sự kiện đã commit đều chủ động đi qua `apply` của từng đơn vị. Domain không giữ bất kỳ subscription nào. Cell (mỗi session mỗi đơn vị một `{state, observedSeq}`, dùng WeakMap làm khóa) được dựng lười — đơn vị đăng ký sau khi luồng sự kiện đã trôi qua, hoặc đọc một session sớm hơn lần đăng ký đó, đều gấp lại từ `init` trên log trong bộ nhớ khi được chạm lần đầu.
- **Cùng tham chiếu nghĩa là không có việc gì cần làm.** Với sự kiện không liên quan đến đơn vị, `apply` phải trả về cùng một tham chiếu trạng thái; việc điều khiển dùng `Object.is` để gác luồng thay đổi, do đó sự kiện không khớp chỉ tốn một lần gọi, không tạo ra công việc downstream nào.
- **Quy tắc sự kiện giá trị đầy đủ (chịu tải).** Sự kiện log mang trạng thái phải mang toàn bộ trạng thái sau khi thay đổi, không bao giờ mang delta trần — điều này giữ cho mỗi lần chuyển trạng thái luôn đủ rẻ, và mỗi giá trị được cung cấp tự mô tả (đối với bên tiêu thụ tức là last-wins).
- **Kỷ luật đồng bộ của đơn vị.** `init`/`apply`/`view` phải đồng bộ; carrier đọc `snapshot()` trong cùng tick khi cắt lát trang; `asOfSeq` là một mặt cắt nhất quán chính nhờ điều này. Viết nhầm `view` thành bất đồng bộ sẽ trả về Promise, khiến `schema.parse` ở ranh giới thất bại ngay tại chỗ và rõ ràng.
- **Trạng thái là JSON thuần, `stateVersion` là điểm neo vô hiệu hóa của nó.** Cache projection lâu bền (persisted projection cache) lưu dòng `(sessionId, key, ver, seq, val)`; hình dạng trạng thái hoặc ngữ nghĩa gấp lại thay đổi thì tăng `stateVersion`, khiến dòng lỗi thời bị bỏ, chứ không bị apply xuôi thành rác.
- **Tầng này không có từ vựng giao thức.** Registry chỉ công khai mặt luồng thay đổi và đọc snapshot; carrier (api-proxy) dựa vào đó tự đúc frame (`session/projection`) và khối riêng của mình.
- **Năng lực tùy chọn.** Plugin domain đăng ký dưới `ctx.inject(['sessionProjections'], …)`, do đó việc lắp ráp headless không có registry hoàn toàn không bị ảnh hưởng; carrier dùng `ctx.get('sessionProjections')`, khi registry vắng mặt sẽ bỏ hẳn khối và frame của chính nó.

## Trách nhiệm

Gói này đảm nhiệm vai trò Service Definition và điều khiển của năng lực seam: plugin host domain (như `dsh-tool-todo`) đóng góp đơn vị, carrier (`dsh-host-apiproxy`) tiêu thụ snapshot và luồng thay đổi, hai bên không biết về nhau.

## Trải nghiệm mô hình

Không có — registry chỉ tính toán read model hướng tới client từ trạng thái session đã vào log, không chạm vào bất kỳ prompt, tin nhắn, schema, luồng hay kết quả tool nào.

#### Ảnh hưởng KV Cache

Không có; projection không bao giờ cấu thành hay gửi request cho nhà cung cấp.

## Hạn chế đã biết và công việc hoãn lại

- **Mỗi trang đuôi mang theo mọi key đã đăng ký** — chưa có cơ chế opt-out theo từng key hay hình thức yêu cầu key lười biếng; chấp nhận được khi mọi giá trị đều ở quy mô UI (một danh sách todo, một snapshot goal), nếu giá trị của một domain nào đó lớn lên thì bàn lại.
- **Bảng đơn vị ở cấp tiến trình, do đó sự tồn tại của key không thể dùng làm tín hiệu năng lực theo từng session** — chỉ cần **bất kỳ** một agent preset nào đăng ký một key, nó sẽ xuất hiện trong snapshot của mọi session, kể cả session mà bản thân cấu thành hoàn toàn không tạo ra giá trị đó. Client phải đọc **giá trị** (`plan.active`, danh sách todo rỗng), không được coi sự vắng mặt của key là vắng mặt tính năng; nếu giá trị rỗng của một đơn vị không thể phân biệt với giá trị thật, nó nên ở lại mặt phẳng host — `dsh-token-meter` ở lại đó chính vì lý do này.
- **Điều khiển chủ động (eager drive) chạm mỗi đơn vị theo từng sự kiện** — theo cấu trúc chi phí rất thấp (quy tắc giá trị đầy đủ, cổng cùng tham chiếu), nhưng nếu xuất hiện đường nóng, có thể thêm bộ lọc trước theo loại sự kiện cho từng đơn vị, quy ước không đổi.
- **Cell của registry chỉ sống trong bộ nhớ** — sau khi khởi động lại, lần chạm đầu tiên sẽ dựng lại bằng cách gấp log; cấu thành có gắn `dsh-session-projection-cache` sẽ thay việc gieo giống cho lần gấp đó bằng dòng lâu bền.
- **Kỷ luật đồng bộ của đơn vị chỉ được gác một phần bằng máy móc** — `schema.parse` ở ranh giới có thể từ chối `view` trả về Promise, nhưng `apply` bị chặn, hoặc `apply` đọc trạng thái ngoài-session bị rách, chỉ có thể gác bằng review; mục invariant đi kèm ghi lại lý do không có kiểm tra runtime.
