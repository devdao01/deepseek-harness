# API Gateway

[English](api-gateway.md) | Tiếng Việt

Tài liệu này là tham chiếu trạng thái hiện tại của Typert API Gateway. Nó mô tả cách các service nghiệp vụ khai báo phương thức Remote một chiều, cách quá trình build sinh ra contract cho Host và Client, cũng như cách lời gọi tái sử dụng RPC và route `/api` của Connection. Sự kiện phiên, dữ liệu tăng dần và các giao thức luồng khác nằm ngoài phạm vi tài liệu này; chúng có thể dùng chung một Connection, nhưng không dùng bộ mô tả phương thức Remote.

## Mô hình lập trình

Service nghiệp vụ dùng `@Remote` hoặc `@RemoteScope` để chọn những phương thức được mở ra cho Client. Phương thức không được đánh dấu sẽ không đi vào kiểu Client sinh ra hay phần đóng góp runtime, và cũng không thể gọi qua `ctx.remote`.

`@Remote` biểu thị việc gọi một service Cordis đã đăng ký trong Host Context gốc. Các đối tượng Host phức tạp không thể truyền trực tiếp qua wire; package nghiệp vụ phải khai báo liên kết giữa nó với wire identity thông qua `TypertLookupMap`, và tại runtime đăng ký nhà cung cấp phân giải mặc định vào `ctx.typert.lookups`. Ví dụ, tham số `Agent` có tên là `agent` trong chữ ký Host, trường wire sinh ra là `agentId`, và Gateway phân giải id thành đối tượng Host trước khi gọi phương thức nghiệp vụ. Bản lắp ghép Host có thể dùng `ctx.typert.lookups.configure()` để ghi đè chiến lược phân giải cho một lookup key nhất định mà không làm thay đổi tên tham số, trường wire hay symbol kiểu chuẩn do package nghiệp vụ sở hữu.

`@RemoteScope(key)` biểu thị việc trước tiên phân giải identity thành một Context có phạm vi thông qua `ctx.typert.contexts`, rồi lấy service từ Context đó và gọi phương thức. Nó phù hợp với trường hợp bản thân phương thức phụ thuộc vào bản lắp ghép theo phạm vi và không cần nhận tường minh các đối tượng như `Agent`.

Service thường kế thừa `TypertRemoteService` để service key của Cordis và namespace Remote mặc định được gắn tường minh trong constructor. Service đã có lớp cơ sở khác có thể chuyển sang khai báo `readonly typertRemote = bindTypertRemote(this, serviceKey)`; cả hai cách đều để lại một binding công khai có thể kiểm tra được, không phụ thuộc vào việc trình biên dịch tiêm symbol vào hàm khởi tạo.

```ts
import type { Agent } from '@deepseek-ai/dsh-agent'
import { TypertRemoteService, Remote, RemoteScope } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

export interface CreateGoalRequest {
  objective: string
}

export interface CreateGoalResult {
  accepted: boolean
}

export class GoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  @Remote('create')
  createForClient(
    agent: Agent,
    request: CreateGoalRequest,
    signal: AbortSignal,
  ): CreateGoalResult {
    signal.throwIfAborted()
    return this.create(agent, request)
  }

  @RemoteScope('agent', 'current')
  currentForClient(): CreateGoalResult {
    return { accepted: true }
  }

  private create(_agent: Agent, request: CreateGoalRequest): CreateGoalResult {
    return { accepted: request.objective.length > 0 }
  }
}
```

Phương thức Remote có thể trả về đồng bộ hoặc trả về Promise. Nếu cần hủy theo kiểu hợp tác, tham số cuối cùng của chữ ký Host phải là `signal: AbortSignal` thuộc kiểu toàn cục; nó được ghi trong bộ mô tả chứ không đi vào `args`, còn phương thức sinh ra ở Client thì nhận một `AbortSignal` tùy chọn ở vị trí cuối.

Client dùng các hàm cụ thể trên đối tượng thường, không dùng JavaScript Proxy. Lời gọi trực tiếp và lời gọi theo phạm vi lần lượt xuất hiện ở `ctx.remote.<namespace>` và `agentCtx.remote.<namespace>`. Mỗi namespace là một service con Cordis có thể truy vết, được đăng ký dưới tên `remote.<namespace>`; bản lắp ghép Client gắn phần đóng góp qua `ctx.remote.$mount()`, và namespace đó được gỡ ngay sau khi phương thức cuối cùng bị thu hồi. Việc khai báo phụ thuộc thuộc về bên gọi thực sự: chỉ package nghiệp vụ đọc `ctx.remote.<namespace>` hoặc `agentCtx.remote.<namespace>` mới khai báo đồng thời `remote` và `remote.<namespace>` trong `inject` của mình; bản lắp ghép chỉ chịu trách nhiệm gắn contribution, cũng như runtime tầng trên không gọi namespace đó, không khai báo phụ thuộc namespace thay cho package nghiệp vụ. Khi một phương thức `@Remote` có đúng một tham số lookup và `TypertContextMap` cùng tên dùng chung wire identity, chữ ký theo phạm vi sinh ra sẽ lược bỏ tham số identity đó. `@RemoteScope` chỉ sinh ra giao diện gọi theo phạm vi.

```ts ignore-check
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AgentContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote', 'remote.goals']

declare const ctx: Context
declare const agentCtx: AgentContext
declare const agentId: SessionId

await ctx.remote.goals.create(agentId, { objective: 'ship it' })
await agentCtx.remote.goals.create({ objective: 'ship it' })
```

Ứng dụng Client chỉ lắp ghép `@deepseek-ai/dsh-api-remotes`. Package này import subpath `/remote` của các package nghiệp vụ được chọn dưới dạng giá trị runtime, gắn phần đóng góp qua `ctx.remote.$mount()`, đồng thời re-export phần declaration merging trong cùng tệp đó. Thêm một package Host Remote là lựa chọn tường minh của bên sở hữu bản lắp ghép Client; component nghiệp vụ không cần nạp riêng Typert Gateway hay JS Remote của package nghiệp vụ.

Bản lắp ghép `api-remotes` và contract `ctx.remote` không phụ thuộc React; mọi phương thức Host mà một bản lắp ghép Client nhìn thấy đều chỉ giới hạn ở các phương thức Remote được chọn lúc sinh mã.

## Trách nhiệm của các thành phần

| Vị trí | Package hoặc entry | Trách nhiệm |
|---|---|---|
| Dùng chung | `@deepseek-ai/dsh-typert-protocol` | Khai báo decorator, binding Gateway, các map giao thức có thể merge, bộ mô tả lời gọi và kiểu nhà cung cấp; không khởi động phân tích TypeScript, cũng không đăng ký service Cordis |
| Build | `@deepseek-ai/dsh-typert-generator` | Phân tích nghiêm ngặt chữ ký Remote, đồ thị kiểu, lookup, Context và vị trí mã nguồn từ `ts.Program` của Host, rồi sinh ra sản phẩm cho Host và Host-for-Client |
| Host | `@deepseek-ai/dsh-typert-registry` và Loader | Đưa bộ mô tả Host sinh ra, schema và các mục đăng ký của package nghiệp vụ vào `ctx.typert`, đồng thời giữ nhà cung cấp lookup và Context |
| Host | `@deepseek-ai/dsh-api-remotes` | Chịu trách nhiệm chiến lược identity Agent/Session của ứng dụng, và cấu hình lookup Typert tương ứng |
| Host | `@deepseek-ai/dsh-api-gateway` | Cung cấp `ctx.typertGateway`, nhận các endpoint Remote, phân giải đối tượng hoặc Context, gọi service Cordis đang chạy, và kiểm tra giá trị request lẫn giá trị trả về |
| Client | `@deepseek-ai/dsh-api-gateway/client` | Cung cấp `ctx.remote` và các service con `remote.<namespace>`, gắn bộ mô tả sinh ra thành phương thức cụ thể, đồng thời khởi tạo, kiểm tra và hủy lời gọi qua Connection |
| Client | `@deepseek-ai/dsh-api-remotes/client` | Chọn và gắn tường minh những phần đóng góp `/remote` mà ứng dụng này được phép dùng, mang phần declaration merging tương ứng vào mã nghiệp vụ |
| Cả hai phía | `@deepseek-ai/dsh-client-connection` | Cung cấp RPC carrier, tương quan request, ranh giới tin cậy, hủy lời gọi, envelope phản hồi và cầu nối HTTP `/api` |

Package API Gateway sở hữu đồng thời hai entry đối xứng là Host dispatcher và Client Remote endpoint, nhưng quá trình build của hai phía không đi vào cùng một `ts.Program`. Entry Host không import phần merge `Context` Cordis của Client, và entry Client cũng không import service Gateway của Host.

## Pipeline sinh mã nghiêm ngặt

Bản build gốc lần lượt chạy `build:lib:host`, `build:lib:client` và `build:web`. Giai đoạn lib của Host chạy `tsc -b tsconfig.host.json` trước, rồi chạy `tsdown --env.DSH_BUILD_FACE host`; Typert generator được biên dịch bởi đồ thị Project Reference thông thường của Host, và chạy trong lần tsdown này với Host aggregate là hạt giống `ts.Program` duy nhất. Giai đoạn lib của Client sau đó chạy `tsc -b tsconfig.client.json` và `tsdown --env.DSH_BUILD_FACE client`, sử dụng phần khai báo Remote Client và phần đóng góp runtime vừa được sinh ra, nhưng không khởi động Typert thêm lần nữa.

Cả hai lần tsdown đều nhận toàn bộ workspace, và đều chỉ đóng gói JavaScript do giai đoạn tsc tương ứng phát ra trong `lib/types`. Cấu hình gốc không quét sản phẩm Client, không phân loại theo tên package, và cũng không truyền filter phải bảo trì cho tsdown; cấu hình cục bộ của từng package trả về entry của giai đoạn hiện tại dựa trên `DSH_BUILD_FACE`. Plugin Client thông thường sinh entry Node loader và browser bundle cùng lúc trong giai đoạn Client.

`api-remotes` là package ngoại lệ duy nhất tách TypeScript face. Project Host của nó chịu trách nhiệm chiến lược lookup Agent/Session, còn project Client thì phụ thuộc vào khai báo `/remote` mà package nghiệp vụ sinh ra trong tsdown Host; aggregate gốc và bên tiêu thụ trực tiếp phải tham chiếu riêng `api/remotes/tsconfig.host.json` hoặc `api/remotes/tsconfig.client.json`. Trong package, `clientBundle(..., { hostPhase: true })` khiến entry Host được sinh trong tsdown Host, và tsdown Client chỉ sinh entry browser. Các package khác vẫn chỉ đăng ký trong một aggregate duy nhất.

Mỗi package nghiệp vụ đóng góp đều ghi tệp sinh ra vào `lib/` của chính nó, chứ không phải vào thư mục mã nguồn:

| Tệp | Bên tiêu thụ | Nội dung |
|---|---|---|
| `typert.host.js` | Host Loader | Phản chiếu runtime, bộ mô tả lời gọi nghiêm ngặt và giá trị đăng ký schema cho face Host |
| `typert.host.d.ts` | Hệ thống kiểu của Host | Phần khai báo sinh ra cho face Host |
| `typert.remote-client.js` | `api-remotes` | `TypertRemoteContribution` có thể gắn được, bao gồm bộ mô tả nghiêm ngặt và codec runtime |
| `typert.remote-client.d.ts` | Hệ thống kiểu của Client | Phần declaration merging của `TypertRemoteNamespaceMap` và `TypertRemoteScopeMap` cùng các tham chiếu kiểu Client-safe |
| `typert.remote-client.d.ts.map` | Trình soạn thảo | Ánh xạ thuộc tính phương thức sinh ra ngược về phần khai báo phương thức Remote trong package Host |

Package nghiệp vụ mở entry Host Loader qua `./typert`, và mở entry Host-for-Client qua `./remote`. Generator đồng thời kiểm tra các export và danh sách tệp phát hành của những package này; chỉ package đóng góp tường minh có entry tương ứng mới sinh ra sản phẩm.

Tên tham số trong khai báo Remote Client đến từ trường wire, còn kiểu tham số và kiểu trả về thì tham chiếu các kiểu Client-safe do package nghiệp vụ gốc export. Declaration map ánh xạ thuộc tính sinh ra mà `ctx.remote.goals.create` phân giải tới, về phương thức Host nguồn có `@Remote`, nhờ đó trình soạn thảo hỗ trợ declaration-map có thể nhảy từ lời gọi Client tới phần cài đặt thật, thay vì dừng lại ở `.d.ts` sinh ra.

Phân tích nghiêm ngặt yêu cầu Remote phải là phương thức instance công khai, không tĩnh và có phần cài đặt cụ thể. Phương thức không được là generic; tham số phải là định danh đơn giản có tên và bắt buộc, không được dùng destructuring, giá trị mặc định, rest hay tham số tùy chọn. Các kiểu thường có thể biểu diễn bằng JSON sẽ được Typert sinh schema nghiêm ngặt; các đối tượng phức tạp như class trong workspace bắt buộc phải có một khai báo `TypertLookupMap` duy nhất. Package lookup và Context đồng thời chịu trách nhiệm declaration merging tĩnh và đăng ký nhà cung cấp tại runtime; thiếu bất kỳ phía nào cũng khiến build thất bại, hoặc khiến lời gọi đầu tiên cần đến nhà cung cấp đó thất bại.

## Lời gọi tại runtime

Remote và API Proxy dùng chung route `/api` của Connection. Lời gọi Remote ở Client thực hiện `connection.rpc.call('/api', '<namespace>/<method>', { args }, signal)`; carrier HTTP tương ứng là `POST /api/<namespace>/<method>`, payload chỉ chứa một đối tượng `args` có tên.

Connection thực hiện kiểm tra tin cậy thống nhất cho `/api` trước cầu nối HTTP, rồi phân phối theo thứ tự interceptor bên trong FetchHandler dùng chung. Typert Gateway chỉ nhận các endpoint hai đoạn có bộ mô tả nghiêm ngặt hoặc có SRC marker đang hoạt động; request không được nhận sẽ quay về API Proxy sẵn có. Connection sở hữu tầng truyền tải, id RPC, envelope phản hồi và việc hủy request, còn Gateway chỉ sở hữu giao thức dữ liệu Remote và việc phân phối nghiệp vụ. Việc thay thế carrier của Connection trong tương lai không đòi hỏi thay đổi bộ mô tả Remote hay giao diện lập trình của Client.

Ở mỗi lời gọi, Gateway phân giải bộ mô tả và service đang chạy từ registry hiện tại, không cache đối tượng nghiệp vụ. Nó yêu cầu tập trường của `args` khớp hoàn toàn với bộ mô tả, dùng codec kiểm tra giá trị wire trước, rồi phân giải đối tượng hoặc bên nhận qua nhà cung cấp lookup hay Context đã đăng ký, cuối cùng gọi phương thức service mà binding trỏ tới và kiểm tra giá trị trả về. Thiếu nhà cung cấp, identity không khớp, binding không nhất quán, thiếu hoặc thừa tham số, schema thất bại và phương thức không tồn tại đều thất bại trước khi vào mã nghiệp vụ hoặc ngay sau khi rời mã nghiệp vụ.

`register()` của nhà cung cấp lookup vừa cung cấp phần khai báo ổn định vừa cung cấp resolver mặc định; `configure()` cung cấp resolver do bản lắp ghép Host sở hữu, có thể chạy bất đồng bộ và bị ràng buộc bởi vòng đời effect. Cấu hình có thể đến trước khi nhà cung cấp được gắn; khi không có nhà cung cấp, lời gọi vẫn thất bại với `lookup-unavailable`, và sau khi cấu hình được gỡ thì chiến lược mặc định của nhà cung cấp được khôi phục. API Remotes chịu trách nhiệm ngữ nghĩa `agentFor()` chuẩn cho `agent` và `session`: tái sử dụng Agent đang chạy, tự động khôi phục các phiên nguội thông thường, khử trùng lặp việc khôi phục đồng thời, và từ chối identity do subagent routing sở hữu; lookup `session` trả về Session của Agent đó. Web API Proxy cung cấp giá trị mặc định cho Agent và thiết lập scope, rồi để các phương thức cũ dùng chung resolver ấy. Lỗi khôi phục và ownership fence được trả về nguyên trạng qua lỗi RPC sẵn có, không bị gộp thành lỗi `internal` của Gateway.

Khi Client gỡ một phần đóng góp, nó gỡ luôn bộ mô tả và các phương thức cụ thể, hủy những lời gọi đang diễn ra của phần đó, và khiến các handle phương thức cũ mà bên ngoài còn giữ từ chối tiếp tục gọi. Endpoint nghiêm ngặt đã đăng ký ở Host, sau khi bị thu hồi, cũng không hạ cấp về suy luận SRC, nhằm tránh việc gỡ nóng âm thầm làm giảm mức độ kiểm tra.

## Phương án dự phòng SRC khi phát triển

Khi Host khởi động từ mã nguồn qua `node --import tsx/esm`, plugin biên dịch Typert không chạy. Bộ khởi tạo decorator tiêu chuẩn vẫn ghi tên phương thức và kiểu lời gọi vào một `WeakMap` riêng của module, còn `TypertRemoteService` hoặc `bindTypertRemote()` thì cung cấp binding service tường minh; nhờ vậy Gateway có thể dựng một bộ mô tả tạm thời yếu hơn mà không cần khởi động `ts.Program`.

Phương án dự phòng SRC phân giải tên tham số đơn giản từ hàm đang chạy. Nếu tên tham số trùng với `parameter` của một lookup đã đăng ký, ví dụ `agent` hoặc `session`, thì dùng trường wire `agentId` hoặc `sessionId` của nó và phân giải đối tượng ở Host; các tham số khác chỉ được kiểm tra xem giá trị có phải dữ liệu JSON-safe không có vòng lặp và không có prototype đặc biệt hay không. `@RemoteScope` dùng trực tiếp trường wire của nhà cung cấp Host Context đã đăng ký. SRC không đọc kiểu TypeScript, không sinh schema Zod, không suy luận tham số tùy chọn, và cũng không hỗ trợ destructuring, giá trị mặc định, rest hay tên tham số trùng lặp.

SRC chỉ giải quyết vấn đề phân phối trong tiến trình Host chạy từ mã nguồn. Client không phát hiện decorator từ Host đang chạy, và Client Remote cũng từ chối gắn bộ mô tả SRC thiếu codec nghiêm ngặt; các kiểu, codec và giá trị đăng ký Remote của nó luôn đến từ `lib/typert.remote-client.*` được sinh ra gần nhất.

## Chế độ phát triển

Phát triển Web trước tiên dùng `pnpm run build` để chuẩn bị sản phẩm Host, Client và Web hiện tại, rồi chạy Host từ mã nguồn và watcher plugin Client ở hai terminal riêng:

```sh
pnpm dsh web
pnpm run dev:web
```

`dsh` khởi động mã nguồn Host qua tsx, nên Host có thể dùng phương án dự phòng SRC; `dev:web` chỉ theo dõi các plugin Client có khai báo `dsh.client` và ghi lại `lib/client.js` của chúng, nó không phân tích decorator của Host, cũng không sinh DTS cho Remote Client.

Khi chỉ sửa phần thân cài đặt của phương thức Remote mà không đổi contract, không cần sinh lại tệp Typert. Khi thêm hoặc xóa decorator, đổi tên export, namespace, tham số, giá trị trả về, lookup, Context hay chữ ký hủy, hãy chạy lại bản build lib theo thứ tự để Host sinh contract nghiêm ngặt trước, rồi Client biên dịch và đóng gói phần đóng góp mới:

```sh
pnpm run build:lib
```

Watcher Client đang chạy sẽ tiêu thụ các tệp sinh ra này khi đóng gói lại. Nếu bạn đã chạy riêng `pnpm run build:lib:host` để làm mới contract của Host, cũng có thể chạy tiếp `pnpm run build:lib:client` để hoàn tất phía Client; với cây làm việc sạch thì không được bỏ qua giai đoạn Host. Chỉ biên dịch lại mã nguồn frontend thì không thể suy ra kiểu mới từ decorator của Host. `pnpm run typecheck` chạy giai đoạn lib của Host rồi mới chạy tsc của Client, và bản build CI lẫn phát hành cũng dùng đúng thứ tự này.

## Ranh giới

Remote chỉ xử lý lời gọi phương thức một chiều với một request và một kết quả. Luồng sự kiện phiên, phân trang, reduce tăng dần, projection và luồng con của thực thể cần giao thức dữ liệu và mô hình đăng ký riêng; ngay cả khi chúng tái sử dụng Connection, cũng không nên giả dạng thành phương thức Remote hay đưa vào bộ mô tả lời gọi.

Các tầng API được tổ chức theo `remotes → gateway → connection → webserver`. BFF và tầng Typert RPC nằm ở `packages/api`; Connection và WebServer nằm ở `packages/client/connection` và `packages/host/webserver`. API Proxy nằm ở `packages/host/apiproxy` xử lý các endpoint không có bộ mô tả Remote.

Chiến lược lookup được cấu hình theo key, nên mọi tham số `agent` hoặc `session` đều dùng chung hành vi khôi phục nguội. Việc chỉ chấp nhận đối tượng đang chạy cần một chiến lược tường minh theo từng tham số hoặc từng endpoint, mà chiến lược như vậy không tồn tại; cũng không thể đoán bên trong phương thức nghiệp vụ xem đối tượng có đến từ khôi phục hay không.
