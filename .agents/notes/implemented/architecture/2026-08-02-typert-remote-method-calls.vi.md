# Agent Note: Lời gọi phương thức có định hướng qua Typert Gateway

Status: implemented

[English](2026-08-02-typert-remote-method-calls.md) | Tiếng Việt

## Problem

Host API Proxy đồng thời gánh cả lời gọi phương thức trực tiếp, tương tác có trạng thái và luồng sự kiện Session. Ba thứ này có vòng đời, ngữ nghĩa định tuyến và giao diện lập trình phía client khác nhau, nên tiếp tục dùng chung một package export nghiệp vụ sẽ khiến Service nghiệp vụ, giao thức truyền tải, máy trạng thái và kiểu dữ liệu phía client bị ràng buộc lẫn nhau.

Quyết định này chỉ bao phủ lời gọi phương thức có định hướng, kiểu một yêu cầu ứng với một kết quả. Các tương tác có trạng thái như Permission, Approval cùng luồng sự kiện Session vẫn theo thiết kế riêng.

Quy ước của lời gọi phương thức trực tiếp thuộc về chính Service nghiệp vụ hiện thực hành vi đó. Người phát triển nghiệp vụ chỉ cần khai báo phương thức nào có thể gọi từ xa, không phải đồng bộ duy trì thêm interface API trung tâm, bảng định tuyến, bảng chuyển đổi tham số, stub phía client và schema Zod.

Host và Browser Client dùng hai TypeScript Program độc lập, vì hai bên hợp nhất `Context` cùng tên của Cordis với các kiểu khác nhau. Phép chiếu Remote không được import toàn bộ khai báo Host vào phía tiêu thụ, cũng không được phụ thuộc vào kiểu chỉ dành cho Browser; nếu sau này TUI dùng lại giao diện lập trình này, nó cũng chỉ được thấy các phương thức có đánh dấu Remote. Đợt này chưa hiện thực phần tích hợp TUI, nhưng ranh giới hiện thực không được chặn khả năng tái sử dụng đồng dạng đó.

## Quyết định

Service nghiệp vụ kế thừa `TypertRemoteService`, và khai báo phương thức có thể gọi thông qua `@Remote` hoặc `@RemoteScope()`; Service đã có lớp cơ sở khác có thể chuyển sang dùng `bindTypertRemote()` để phơi bày cùng một binding. Typert sinh từ Host Program ra sản phẩm phản chiếu cục bộ của Host và phép chiếu phía tiêu thụ Remote độc lập nền tảng; Client Program vẫn tiếp tục tự sinh sản phẩm phản chiếu cục bộ của riêng nó.

Phép chiếu phía tiêu thụ Remote bao gồm đồng thời `.d.ts`, `.d.ts.map` và `.js`. `.d.ts` chỉ phơi bày các phương thức được decorator Remote đánh dấu, và tham chiếu tới ký hiệu kiểu công khai duy nhất của package nghiệp vụ; `.d.ts.map` đưa phương thức API phía tiêu thụ điều hướng ngược về phần hiện thực phương thức nghiệp vụ trên Host; `.js` mang theo thông tin endpoint, tham số, Context và Zod của cùng một quy ước. Browser Client, ở tầng assembly, gắn tập trung các đóng góp Remote JS cần thiết vào Client Remote Service; phép chiếu đó cùng lớp trừu tượng Remote giữ tính độc lập nền tảng, để TUI sau này dùng lại được.

`@deepseek-ai/dsh-api-gateway` nằm ở `packages/api/gateway`, cung cấp hai face đối xứng: entry mặc định cung cấp `ctx.typertGateway` phía Host, entry `/client` cung cấp `ctx.remote` phía tiêu thụ. Mỗi bên tiêu thụ cục bộ `InvocationDescriptor` được sinh ra từ cùng một mô hình, và descriptor không được gửi qua wire. Giao thức dữ liệu Remote chạy trên channel RPC `/api` dùng chung của Connection; giao diện gọi nghiệp vụ không đổi khi Connection chuyển từ HTTP sang WebSocket.

`@deepseek-ai/dsh-api-remotes` nằm ở `packages/api/remotes`, là tầng BFF nằm trên Gateway. Entry Host của nó chịu trách nhiệm phân giải danh tính Agent/Session và cấu hình lookup của Typert; entry `/client` chọn các đóng góp Remote được sinh ra mà ứng dụng phơi bày ra ngoài. Entry Client tiêu thụ quy ước `TypertClientRemote` dùng chung thông qua Cordis, chứ không import một hiện thực Gateway cụ thể.

## Thành phần và service Cordis

| Thành phần | Service Cordis | Trách nhiệm |
|---|---|---|
| `@deepseek-ai/dsh-typert-protocol` | chỉ khai báo giao thức tối thiểu của `ctx.typert` | `TypertRemoteService`, decorator, binding dự phòng, descriptor, lookup/Context và Remote map; không phụ thuộc compiler, Zod, Connection hay Browser |
| Typert registry | `ctx.typert` | lưu tách biệt reflection của môi trường hiện tại, các đóng góp Remote đã import, lookup provider và Context provider |
| Typert generator/loader | không thêm service nghiệp vụ | sinh ba loại sản phẩm `lib` từ Host/Client Program, và đăng ký sản phẩm của môi trường hiện tại vào `ctx.typert` |
| Host face của API Gateway | `ctx.typertGateway` | liên kết definition của Host với Service đang sống, giải mã tham số, phân giải receiver, gọi phương thức và mã hóa kết quả |
| Connection | `ctx.connection` | độc chiếm HTTP Server/WebSocket tương lai, route `/api` dùng chung, RPC envelope, rpcId, tuần tự hóa, trust, truyền lỗi, chặn Typert và dự phòng API Proxy cũ |
| Client face của API Gateway | `ctx.remote`, `ctx.remote.<namespace>` | mount đóng góp Remote, hiện thực hóa mỗi namespace thành một sub-Service `remote.<namespace>` theo dõi được, và giao lời gọi chuẩn tắc cho `ctx.connection.rpc` |
| API Remotes | không thêm service | phụ trách chiến lược lookup Agent/Session phía Host, và làm facade duy nhất cho nghiệp vụ Client, chọn và gắn các đóng góp `/remote`, đồng thời phơi bày các khai báo API đã chọn |
| Package sở hữu Agent/Session | service lĩnh vực đã có | cung cấp đồng thời interface merge tĩnh và lookup/Context provider lúc chạy |
| Các package nghiệp vụ như Goal | Service nghiệp vụ đã có | chỉ khai báo binding, phương thức Remote và DTO duy nhất, rồi export sub-path `/remote` được sinh ra |

Host Gateway không phụ thuộc vào hiện thực cụ thể của `ctx.agents`, `ctx.sessions`, `ctx.goals` hay `ctx.webServer`. Client Remote không hiểu carrier vật lý, và Connection cũng không hiểu Goal, Agent, lookup, `InvocationDescriptor` hay namespace Remote.

## Khai báo nghiệp vụ

Lời gọi trực tiếp thông thường dùng `@Remote`. Khi tham số và kết quả của một phương thức sẵn có đã đúng quy ước Remote mong muốn, hãy decorate thẳng phương thức đó, không đổi tên vì việc này. Chỉ khi quy ước wire cần một hình thái yêu cầu hoặc kết quả khác thì mới thêm adapter `remoteExport*`, và khai báo tên API ngắn qua tham số của decorator. Phương thức cần đối tượng nghiệp vụ nào thì khai báo tường minh đối tượng đó ở vị trí tham số cấp cao nhất:

```text
export class GoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  create(agent: Agent, request: CreateGoalRequest): GoalView {
    // Existing business method remains unchanged.
  }

  @Remote('create')
  remoteExportCreate(agent: Agent, request: CreateGoalRequest): CreateGoalResult {
    const view = this.create(agent, request)
    return { ref: { id: view.id, revision: view.revision } }
  }
}
```

`goals` là service key Cordis rõ ràng truyền cho `super()`, và mặc định cũng là namespace trên wire. Chỉ khi namespace giao thức thực sự cần khác với service key thì mới truyền tùy chọn `namespace` qua tham số thứ ba.

Khi cần tìm Service receiver trong một loại Context cách ly nào đó thì dùng `@RemoteScope()`. Scope identity không đi vào tham số của phương thức nghiệp vụ:

```text
export class ScopedGoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  @RemoteScope('agent', 'create')
  remoteExportCreate(request: CreateGoalRequest): Promise<CreateGoalResult> {
    // Runs against the goals service resolved from the Agent Context.
  }
}
```

Cùng một endpoint chỉ được chọn một chế độ gọi. Luồng cần tham số `Agent` tường minh thì dùng `@Remote`; luồng cần chuyển sang Agent Context rồi mới phân giải scoped receiver thì dùng `@RemoteScope('agent')`, và Typert không tự đoán giữa hai loại này dựa trên thân phương thức hay việc thiếu tham số.

Package nghiệp vụ chỉ phụ thuộc vào `@deepseek-ai/dsh-typert-protocol` nhẹ. Nó cung cấp `TypertRemoteService`, cùng giao thức khai báo cho decorator, binding dự phòng, lookup, Remote Scope và descriptor, mà không phụ thuộc TypeScript compiler, Zod, HTTP hay runtime Client.

Phương thức hỗ trợ hủy theo kiểu hợp tác sẽ khai báo `signal: AbortSignal` làm tham số Host cuối cùng. Tham số dành riêng này không phải giá trị nghiệp vụ, không phải lookup, cũng không phải trường JSON. Phương thức sinh ra phía tiêu thụ phơi bày nó thành tham số tùy chọn cuối cùng, nên lời gọi thông thường giữ nguyên, còn bên gọi nắm quyền hủy có thể truyền signal vào.

## Decorator và facet Gateway tường minh

Decorator chỉ diễn đạt "phương thức này tham gia quy ước Remote", không đảm nhiệm phản chiếu kiểu lúc chạy, cũng không tiêm symbol ẩn vào constructor của Service. Tham số của `@Remote('create')` và `@RemoteScope('agent', 'create')` là tên phương thức đối ngoại; thành viên được decorate có thể là chính phương thức nghiệp vụ, hoặc một adapter như `remoteExportCreate`. Chỉ khi không đặt bí danh thì mới lấy tên thành viên làm tên phương thức đối ngoại. Kế thừa `TypertRemoteService` là cách khai báo tường minh thông thường để một Service gia nhập Gateway; trường public readonly `typertGateway` của nó giữ cho binding trên thực thể lúc chạy vẫn nhìn thấy được.

Runtime SRC cho phép decorator ghi lại prototype, tên phương thức và chế độ gọi trong một `WeakMap` nội bộ của `dsh-typert-protocol`. Nó không ghi thuộc tính tùy biến vào thực thể Service, prototype, constructor hay hàm phương thức.

Việc phát hiện phương thức nghiêm ngặt, phân giải kiểu và sinh descriptor của LIB do Typert compiler đảm nhiệm. Nó chấp nhận service key dạng literal trong lời gọi `super()` trực tiếp của `TypertRemoteService`, hoặc binding dự phòng tường minh; quá trình sinh không viết lại mã nguồn nghiệp vụ, cũng không tiêm siêu dữ liệu đăng ký ẩn.

## Đăng ký lookup và Remote Scope

Gateway không nhúng sẵn nhánh xử lý cho Agent, Session hay đối tượng nghiệp vụ khác. Package sở hữu đối tượng cung cấp đồng thời khai báo tĩnh và provider lúc chạy:

```text
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertLookupMap {
    agent: TypertLookup<Agent, SessionId>
  }
}

ctx.typert.lookups.register('agent', {
  parameter: 'agent',
  wire: 'agentId',
  resolve: sessionId => resolveAgent(sessionId),
})
```

Khai báo tĩnh cho Typert biết `Agent` tương ứng với `SessionId` trên wire; provider lúc chạy chịu trách nhiệm phân giải `agentId` trong yêu cầu thành đối tượng `Agent` đang sống. Thiếu bất kỳ phía nào thì bản dựng LIB hoặc lần đăng ký lúc chạy sớm nhất phân giải được sẽ thất bại ngay.

Các đối tượng lookup như Agent, Session chỉ được chiếm đúng một vị trí tham số cấp cao nhất mỗi loại. Một request JSON thông thường có thể được truyền vào như một tham số hoàn chỉnh khác, nhưng thiết kế này không hỗ trợ `request.agent`, phá cấu trúc đối tượng, mảng đối tượng, lookup lồng nhau hay việc dò tìm ID trong một cấu trúc phức tạp tùy ý.

Remote Scope dùng map merge-extensible và Context provider riêng. Package Agent đăng ký provider `agent`, chịu trách nhiệm dùng wire identity để tìm ra Agent Context, rồi phân giải service key mà descriptor chỉ định từ Context đó; Gateway không biết cấu trúc bên trong của Agent Context.

Phía Client cũng đăng ký một Context binder `agent`. Binder chỉ chịu trách nhiệm lấy `SessionId` từ Context nơi diễn ra lời gọi; nó không liệt kê Scope, cũng không sao chép từng phương thức. Namespace scoped được Cordis Service tracker tự động rebind về Agent Context hiện tại.

## InvocationDescriptor

Giữa Typert, bộ phân giải yếu SRC, Host Gateway và Client Remote chỉ trao đổi một dạng mô tả chuẩn tắc:

```text
InvocationDescriptor {
  id: '@deepseek-ai/dsh-goal#goals/create'
  service: 'goals'
  namespace: 'goals'
  method: 'create'
  implementation: 'remoteExportCreate'
  invocation: direct | { context: 'agent', wire: 'agentId' }
  scope?: { context: 'agent', wire: 'agentId' }
  parameters: [
    { name, wire, source: json | lookup, lookup?, codec }
  ]
  cancellation?: { parameter: 'signal' }
  result: codec
  sourceLocation
}
```

`method` là tên ngắn đối ngoại mà endpoint và Client Remote sử dụng, `implementation` là tên thành viên thật trên receiver phía Host; khi hai tên trùng nhau thì có thể lược bỏ `implementation`. Descriptor `direct` giữ nguyên thực thể Service gốc làm receiver. Descriptor Context trước hết tìm scoped Context qua Context provider tương ứng, rồi mới phân giải receiver bằng service key của descriptor.

Bộ sinh nghiêm ngặt chỉ ghi `scope` khi phương thức direct chứa đúng một tham số lookup, tồn tại khai báo `TypertContextMap` cùng tên, và cả hai dùng cùng một ký hiệu kiểu wire. `scope.wire` bắt buộc trỏ tới tham số lookup đó; nó tuyên bố rằng phía tiêu thụ có thể điền tham số này từ Context nơi diễn ra lời gọi, chứ không làm đổi Host receiver hay endpoint. Khi có nhiều lookup, thiếu khai báo Context, hoặc kiểu wire không nhất quán thì không sinh phép chiếu scoped, trong đó việc kiểu không nhất quán là lỗi biên dịch.

Thứ tự tham số lấy từ chữ ký phương thức, trường HTTP lấy từ tên tham số hoặc khai báo lookup. Descriptor hủy chỉ giữ lại vị trí `signal` cuối cùng, và làm cho nó không đi vào `args` có tên; signal thật do Connection hoặc bên gọi Gateway trực tiếp cung cấp. Gateway không suy đoán trường tùy chọn, kiểu Context, kiểu lookup hay tham số thiếu dựa trên nội dung yêu cầu, và cũng không tổng hợp giá trị mặc định nghiệp vụ.

Codec của LIB mang theo schema Zod và `typeSymbol` chuẩn tắc gồm «package + sub-path công khai + tên export»; codec của SRC chỉ đánh dấu `src-json`. Khi Host và phía tiêu thụ chạy ở các JavaScript realm khác nhau, mỗi bên sẽ giữ thực thể Zod riêng, nhưng các thực thể này được sinh từ cùng một mô hình Typert và cùng symbol key.

Descriptor chỉ tồn tại trong registry cục bộ ở hai đầu. Trên wire chỉ có channel `/api`, endpoint và payload `{ args }`; Host dùng descriptor của mình để giải mã và gọi, Client dùng descriptor tương ứng của mình để mã hóa tham số và kiểm tra kết quả.

## Typert runtime registry

```text
ctx.typert.local     reflection Host hoặc Client của chính tiến trình hiện tại
ctx.typert.remotes   đóng góp Remote của đối tác mà phía tiêu thụ mount tường minh
ctx.typert.lookups   provider và chiến lược tổ hợp từ wire ID sang đối tượng Host
ctx.typert.contexts  Host Context resolver và Client Context binder
```

Mỗi lần đăng ký đều trả về một disposer do Cordis fiber của bên gọi nắm giữ. Khi gắn đóng góp Client, tập descriptor và các phương thức cụ thể được đăng ký thống nhất như một thao tác có chủ sở hữu rõ ràng. Host Gateway chỉ đệm tập tên endpoint mà SRC nhận sở hữu, và loại bỏ toàn bộ tập đó khi tập Service của Cordis thay đổi; nó không giữ lại descriptor, Service hay bên cung cấp. Khi gọi, mọi đối tượng đang sống đều được phân giải từ trạng thái hiện tại, nên việc gỡ strict definition, Service hay bên cung cấp sẽ làm lời gọi tương ứng không dùng được, và không để sót đối tượng sống đã cũ.

Bảng đăng ký lookup vẫn giữ khai báo wire ổn định sau khi resolver đang sống được gỡ bỏ. Phân giải SRC vẫn xếp tham số đó vào loại lookup, còn lời gọi sẽ thất bại với `lookup-unavailable`; hệ thống tuyệt đối không xếp lại ID truyền vào thành đối tượng nghiệp vụ JSON thông thường. Trong cùng vòng đời của một Typert Service, việc đăng ký lại cùng một key với tham số, wire hay ký hiệu kiểu chuẩn tắc khác sẽ thất bại ngay.

Package đối tượng nghiệp vụ và package scoped Context sở hữu khai báo ổn định và resolver mặc định thông qua `lookups.register()` và `contexts.registerHost()`; phần tổ hợp Host cung cấp chiến lược bất đồng bộ theo phạm vi effect thông qua `lookups.configure()` và `contexts.configureHost()`. Cấu hình có thể đến trước khi provider đăng ký, nhưng khi chưa có provider đang sống thì bản thân nó không tạo ra một danh tính dùng được; khi cấu hình bị gỡ, resolver mặc định của provider được khôi phục. API Remotes tạo một resolver `agentFor()` dùng chung cho lookup `agent`, `session` và Host Context `agent`: Agent đang sống thì dùng lại trực tiếp, phiên nguội thông thường được khôi phục tự động, khôi phục đồng thời được khử trùng lặp theo Session ID, còn hàng rào sở hữu subagent thì trả về `agent-busy` như trước. Web API Proxy tiêu chuẩn cung cấp giá trị mặc định cho Agent và thiết lập scope, đồng thời cho các phương thức cũ dùng chính resolver đó. Lookup `session` trả về Session của Agent đã phân giải, Host Context `agent` trả về Context của nó, nên cả ba phép chiếu dùng chung một vòng đời khôi phục.

Entry gốc phía Host của Registry sở hữu trọn vẹn interface merge `TypertRegistryContract`; phần hiện thực registry dùng chung giữa Host và Client nằm ở một module riêng không có khai báo môi trường. Entry `/client` của Registry chỉ tham chiếu phần hiện thực dùng chung đó, không đi qua entry gốc phía Host, nhờ vậy không kéo khai báo Cordis của Host vào Client Program.

## Kiểu duy nhất, ký hiệu và Zod

DTS của Remote Client không sao chép DTO nghiệp vụ, cũng không khai báo lại một kiểu bóng có cấu trúc y hệt. Nó chỉ tham chiếu ký hiệu gốc từ sub-path kiểu thuần công khai vốn không mang theo merge Cordis của Host:

```text
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CreateGoalRequest, CreateGoalResult } from '@deepseek-ai/dsh-goal/types'
```

Nhờ đó `SessionId`, wire ID của Agent, request và result đều trỏ về cùng một khai báo TypeScript ở cả Host lẫn Browser Client, và khi TUI dùng lại sau này cũng không cần bản kiểu thứ hai. Việc nhảy tới định nghĩa, đổi tên và tìm tham chiếu của DTO đều quay về đúng vị trí mã nguồn duy nhất của kiểu nghiệp vụ, thay vì dừng lại ở bản sao trong file được sinh.

Bản thân phương thức Remote thì điều hướng bằng declaration map. Typert cố định `InvocationModel.location` vào token tên phương thức của phương thức được decorate trên Host, và ghi source-map segment lên thuộc tính tương ứng trong interface namespace. Với các endpoint được adapter chống đỡ, editor TypeScript lấy khai báo được sinh từ `ctx.remote.models.list`, rồi men theo `typert.remote-client.d.ts.map` để nhảy tới cửa ra remote `remoteExportList` của Host Service. Cửa ra đó tiếp tục gọi tường minh phương thức `list()` sẵn có không đổi tên, và map không nhầm decorator, class hay toàn bộ chữ ký thành vị trí định nghĩa phương thức.

Typert sinh wire Zod codec cho cùng một symbol key. Host Gateway dùng nó để kiểm tra đầu vào và mã hóa kết quả, Client Remote dùng nó để mã hóa tham số và kiểm tra phản hồi; khi kiểu phức tạp không thể sinh codec nghiêm ngặt, bản dựng LIB thất bại, chứ không hạ cấp thành `unknown` hay JSON không kiểm tra.

Kiểu nghiệp vụ có tên mà phương thức Remote tham chiếu bắt buộc phải được export từ sub-path công khai chỉ chứa kiểu. Nếu entry duy nhất tiếp cận được lại kéo theo Service của Host, merge `Context` của Cordis hay phần hiện thực chỉ dành cho Host, bản dựng sẽ thất bại và yêu cầu package nghiệp vụ cung cấp một cửa ra kiểu an toàn. Giá trị nguyên thủy, literal và các tổ hợp đơn giản mà Typert hỗ trợ rõ ràng thì không cần đặt tên thêm.

Tham số lookup không phơi bày class `Agent` ra phía tiêu thụ. Phép chiếu Remote tham chiếu kiểu ID duy nhất trong khai báo lookup, ví dụ `SessionId`; bên trong Host vẫn dùng ký hiệu class `Agent` duy nhất để hoàn tất việc phân giải đối tượng.

## Ba loại sản phẩm và hai TypeScript Program

Host và Client vẫn chỉ có hai TypeScript Program độc lập, nhưng Typert sinh ra ba loại sản phẩm có bản chất khác nhau:

```text
Host Program
├─ typert.host.js / typert.host.d.ts
│  Service, Event, Object, schema của chính Host và thông tin Gateway hướng vào
└─ typert.remote-client.js / typert.remote-client.d.ts / typert.remote-client.d.ts.map
   phép chiếu wire của Host Remote cho môi trường tiêu thụ bất kỳ

Client Program
└─ typert.client.js / typert.client.d.ts
   thông tin Service, Event, Object và schema của chính Client
```

`remote-client` là emitter thứ hai của Host Program, không phải Program thứ ba, cũng không phải face cục bộ của Client. Nó không chứa merge Cordis của Host, class Service, class Context hay mã hiện thực, và không đi vào registry reflection cục bộ của Host.

Bản dựng lib của Host chịu trách nhiệm hoàn tất phân tích Host nghiêm ngặt và tạo ra artifact cục bộ của Host cùng artifact phía tiêu thụ Remote; sau đó lib của Client mới tiêu thụ DTS của Remote. Trình tự đầy đủ là:

```text
Host lib build
→ sinh typert.host.{js,d.ts}
→ sinh lib/typert.remote-client.{js,d.ts,d.ts.map} cho từng package nghiệp vụ
→ hoàn tất lib của Client và sản phẩm typert.client
→ Vite dựng Web
```

Lệnh `build` cấp cao hiện có vẫn thể hiện là chạy `build:lib` trước rồi `build:web`, nhưng bên trong `build:lib` bắt buộc phải hoàn tất artifact của Host và Remote trước, rồi mới khởi động phần biên dịch TypeScript của Client. Một bản dựng sạch không được phụ thuộc vào `.d.ts` còn sót lại từ lần trước.

Ngay cả khi đầu vào chính là file nguồn, các gate của kho cần trình biên dịch phân giải bề mặt phía tiêu thụ cũng có cùng điều kiện tiên quyết. Các lệnh công khai `typecheck`, `lint` và `doc-typecheck` sẽ chạy pass quy ước Host trước. Bộ điều phối gate chỉ được dùng biến thể `*:contracts-ready` tương ứng sau khi phụ thuộc quy ước Typert tường minh hoặc phụ thuộc bản dựng đầy đủ đã hoàn tất, để các lane song song vừa không đọc phải khai báo còn thiếu, vừa không chạy đồng thời nhiều bộ sinh cho cùng một đầu ra.

## Entry `/remote` của package

Mỗi package nghiệp vụ cung cấp phương thức Remote đều export sub-path `/remote` được sinh ra:

```text
"./remote": {
  "types": "./lib/typert.remote-client.d.ts",
  "default": "./lib/typert.remote-client.js"
}
```

Mã tiêu thụ chọn năng lực thông qua chính package nghiệp vụ:

```text
import goalsRemote from '@deepseek-ai/dsh-goal/remote'
```

Lệnh import đó đưa phần map augmentation của `.d.ts` vào TypeScript project hiện tại, đồng thời giao descriptor JS của cùng quy ước cho runtime dưới dạng giá trị. Package nghiệp vụ không được import sẽ không mở rộng kiểu API Remote của project hiện tại.

File phát hành của package nghiệp vụ bắt buộc phải chứa `lib/typert.remote-client.d.ts.map`. DTS được sinh ra tham chiếu map liền kề bằng `//# sourceMappingURL=typert.remote-client.d.ts.map`; phần source trong map trỏ tương đối từ `lib` về mã nguồn nghiệp vụ, ví dụ `../src/index.ts`. Export `/remote` không liệt kê map riêng, mà trường `files` của package chịu trách nhiệm phát hành nó. Mục tiêu ở đây là đường dùng trong lúc phát triển: bên tiêu thụ trong workspace phân giải nó qua package link, nên sản phẩm phát hành vẫn không chứa `src`, và map đã phát hành đơn giản là không phân giải ra được gì.

Khi chỉ cần kiểu tĩnh thì có thể dùng `import type {} from '@deepseek-ai/dsh-goal/remote'`; kiểu import này bị xóa lúc chạy, không nạp JS, và cũng không kích hoạt bất kỳ đăng ký runtime nào. Môi trường cần gọi thật bắt buộc phải giao đóng góp lấy được từ một value import thông thường cho Client Remote Service.

Việc phân giải `/remote` trong workspace bắt buộc phải trỏ rõ tới sản phẩm trong `lib`, không được bị quy tắc paths package-sang-`src` chung kéo ngược về mã nguồn Host. Các import nghiệp vụ thông thường vẫn phân giải về SRC hay LIB theo quy tắc sẵn có của từng môi trường.

## Kiểu API nghiêm ngặt phía tiêu thụ

DTS của Remote đồng thời mở rộng map endpoint phẳng, interface namespace direct, map namespace và map scoped, chứ không mở rộng `Context` toàn cục của Cordis:

```text
interface TypertRemoteNamespace$676f616c73 {
  create: (
    agentId: SessionId,
    request: CreateGoalRequest,
    signal?: AbortSignal,
  ) => Promise<CreateGoalResult>
}

interface TypertRemoteMap {
  'goals/create': (
    agentId: SessionId,
    request: CreateGoalRequest,
    signal?: AbortSignal,
  ) => Promise<CreateGoalResult>
}

interface TypertRemoteNamespaceMap {
  goals: TypertRemoteNamespace$676f616c73
}

interface TypertRemoteScopeMap {
  'agent:goals/create': (
    request: CreateGoalRequest,
    signal?: AbortSignal,
  ) => Promise<CreateGoalResult>
}
```

`TypertRemoteMap` giữ chữ ký endpoint chuẩn tắc, phục vụ cho kiểu giao thức và phản chiếu. Kiểu Remote gốc đọc thẳng `TypertRemoteNamespaceMap`, không suy diễn phương thức gián tiếp qua key-remapped mapped type; TypeScript Language Service không thể điều hướng ổn định loại thuộc tính gián tiếp đó tới declaration map. Tên interface namespace được tạo bằng cách mã hóa các byte UTF-8 của namespace thành hex, nên `goals` luôn cho ra `TypertRemoteNamespace$676f616c73` một cách ổn định. Các package khác nhau sinh interface cùng tên cho cùng một namespace, dựa vào module augmentation để hợp nhất phương thức của mỗi bên, và `TypertRemoteNamespaceMap.goals` luôn tham chiếu cùng một kiểu.

Typert chiếu `TypertRemoteScopeMap` theo key của Context sang kiểu Scope chuyên dụng. Giao diện lập trình cuối cùng giữ nguyên:

```text
ctx.remote.goals.create(agentId, request)
agentCtx.remote.goals.create(request)
```

Agent Scope tự động cung cấp `SessionId` của chính nó. Vì vậy phương thức `@Remote` có lookup `agent` có thể sinh đồng thời hai chữ ký phía tiêu thụ: root và scoped; phương thức `@RemoteScope('agent')` cũng lược bỏ Scope identity riêng, nhưng chỉ sinh chữ ký scoped. `Context` gốc phơi bày namespace direct qua `ctx.remote`, còn `AgentContext.remote` thì lấy giao của bề mặt direct đó với bề mặt scoped. Khi TUI dùng lại sau này cũng phải giữ đúng sự phân biệt này.

`TypertClientRemote` giữ tính độc lập nền tảng, và Browser Client phơi bày nó qua `ctx.remote`. Nếu sau này TUI dùng lại kiểu này thì cũng phải dùng nó qua đối tượng Remote chuyên dụng và Agent Scope, không được coi `Context` của Host như một tập Service rộng hơn; các phương thức public của Service không được đánh dấu sẽ không đi vào các Remote map.

## Client Typert và Client face của API Gateway

Typert của một môi trường tiêu thụ duy trì đồng thời thông tin cục bộ và thông tin Remote nhập từ môi trường khác, nhưng hai loại này nằm ở các registry khác nhau:

```text
Typert.local    mô hình phản chiếu của chính môi trường hiện tại
Typert.remotes  các đóng góp Remote đã nhập
```

`@deepseek-ai/dsh-api-remotes/client` nạp tập trung các đóng góp Remote cần thiết:

```text
import goalsRemote from '@deepseek-ai/dsh-goal/remote'
import sessionsRemote from '@deepseek-ai/dsh-session/remote'

await ctx.remote.$mount(goalsRemote)
await ctx.remote.$mount(sessionsRemote)
```

Package nghiệp vụ phía Client chỉ tham chiếu `@deepseek-ai/dsh-api-remotes/client`, không phụ thuộc trực tiếp vào API Gateway hay entry runtime `/remote` của từng package nghiệp vụ. API Remotes tiêu thụ quy ước `TypertClientRemote` dùng chung và service `ctx.remote` của Cordis, rồi re-export các khai báo, để các Remote map đã chọn đi vào phần biên dịch nghiệp vụ; việc thêm hay bỏ trọn một bộ năng lực phía Client chỉ sửa ở đúng chỗ assembly này.

`ctx.remote.$mount()` đăng ký đóng góp vào `Typert.remotes`, cài đặt namespace Service và các phương thức cụ thể của nó, và chỉ resolve sau khi chúng đã sẵn sàng. Cordis fiber gọi phương thức này nắm giữ disposer. Khi endpoint trùng lặp, cùng namespace/method xung đột chế độ, hoặc descriptor xung đột danh tính kiểu với cái đã có, thì thất bại ngay.

Client Remote Service hiện thực hóa các descriptor `@Remote` thành hàm thật trên sub-Service `remote.<namespace>`. Hàm dựng `args` có tên theo thứ tự tham số vị trí của descriptor, chạy strict codec phía Client, rồi gọi `ctx.connection.rpc.call('/api', endpoint, { args }, signal)`. Với descriptor hỗ trợ hủy, hàm được sinh ra nhận thêm một signal tùy chọn ở cuối, và hợp nhất nó với vòng đời mount của đóng góp; nhờ vậy việc gỡ bỏ sẽ hủy mọi lời gọi carrier đang chạy, còn bên gọi vẫn có thể hủy riêng một lời gọi.

Cả descriptor direct có `scope` lẫn descriptor `@RemoteScope` đều không nhân bản hàm cho từng Agent Scope. Client Remote Service tạo cho mỗi namespace một sub-Service Cordis đăng ký dưới tên `remote.<namespace>`, và hiện thực hóa cả biến thể direct lẫn scoped trên đó. Khi lấy phương thức qua `agentCtx.remote.goals`, accessor sẽ bắt lấy Agent Context hiện tại trước khi trả về một handle gọi được. Phương thức sau đó lấy identity từ Context ấy thông qua Context binder tương ứng. Phép chiếu direct scoped dùng identity để thay vào vị trí lookup mà `scope.wire` chỉ định, còn descriptor Remote Scope thì ghi identity vào một trường wire riêng của receiver; cả hai đều phát ra cùng một loại lời gọi `/api`.

```text
root ctx.remote.goals.create(agentId, request)
  → descriptor direct
  → ctx.connection.rpc.call('/api', 'goals/create', { args })

agentCtx.remote.goals.create(request)
  → accessor remote.goals bắt lấy agent Context
  → agent binder lấy agentId từ Context của bên gọi
  → dùng agentId điền vào tham số lookup của cùng descriptor direct
  → ctx.connection.rpc.call('/api', 'goals/create', { args })
```

`Context` gốc chỉ merge bề mặt `TypertClientRemote` direct; `AgentContext` thay thuộc tính đó bằng giao của `TypertClientRemote` và `TypertRemoteScopeApi<'agent'>`, nhờ vậy phương thức chỉ dành cho scoped không bị phơi ra cho mã ở root. Nếu bên gọi lách kiểu để gọi động một phương thức scoped-only từ Root, binder sẽ báo lỗi rõ ràng. Nếu Client đã có service Cordis tên `remote.<namespace>`, hoặc hai đóng góp xung đột chiếm cùng namespace/method, thì mount thất bại ngay, không ghi đè service đang có.

Remote JS được sinh ra chỉ chứa descriptor, symbol key và codec, không đóng gói phần hiện thực Service của Host. Client Remote Service dựa vào đó để tạo hàm thật, nên runtime không phụ thuộc JavaScript Proxy; Proxy có thể là một lựa chọn hiện thực, nhưng không trở thành nguồn của kiểu hay phản chiếu.

## Ràng buộc đồng dạng xuyên môi trường

Remote API là năng lực phía tiêu thụ, không đồng nghĩa với Browser API. Phần runtime đã bàn giao hiện thực việc gắn đóng góp cho Browser Client, lời gọi RPC qua Connection và liên kết Agent Scope.

Remote DTS, Remote JS, `TypertClientRemote`, `InvocationDescriptor`, giao thức dữ liệu Remote RPC và Context binder không được phụ thuộc DOM, module loader của Browser hay HTTP. Browser Client mã hóa các phương thức đã được descriptor hiện thực hóa thành lời gọi RPC `/api` thông qua Connection.

TUI trong tương lai có thể tích hợp vào cùng lớp trừu tượng gọi này mà không cần đổi decorator nghiệp vụ, các Remote map và hình thái lời gọi API. Khi đó API mà TUI nhìn thấy vẫn chỉ được sinh ra bởi `@Remote` và `@RemoteScope`, không được vì nó cùng tiến trình với Host mà lách giới hạn Remote để phơi bày thẳng phương thức Service.

Việc gắn runtime, carrier, liên kết Agent Scope và đấu nối khởi động SRC cho TUI đều vẫn hoãn lại, không nằm trong quyết định này.

Bản thân Web phụ thuộc vào các sản phẩm dựng như `lib/client.js`, nên trước khi khởi động Web cần có một `build:lib` đầy đủ. Sau khi quy ước Host Remote thay đổi, người phát triển cần chạy lại lib build rồi mới khởi động hay khởi động lại Web; hệ thống không hiện thực watch tăng dần cho Remote contract.

## Chế độ chạy SRC và LIB

SRC khởi động nhắm vào mã nguồn cục bộ. Ghi chép WeakMap của `@Remote` và `@RemoteScope()` cho biết tên phương thức và chế độ gọi, runtime đọc tên tham số theo thứ tự từ chữ ký hàm JavaScript, rồi kết hợp với lookup/Context provider đã đăng ký để sinh descriptor yếu.

Ví dụ `@Remote('create') remoteExportCreate(agent, request, signal)` được phân giải thành phương thức đối ngoại `create`, thành viên hiện thực `remoteExportCreate`, hai tham số nghiệp vụ cấp cao nhất và một điểm tiêm cho việc hủy; đăng ký lookup viết lại `agent` thành trường wire `agentId`, `request` được truyền như tham số JSON cùng tên, còn `signal` cuối cùng thì nằm ngoài payload. SRC không khởi động `ts.Program`, không dùng preload, loader hook, sinh mã hay viết lại module, và cũng không kiểm tra cấu trúc bên trong của đối tượng JSON thông thường.

Chữ ký mà SRC không phân giải rõ ràng được sẽ thất bại ở lần gọi đầu tiên phân giải descriptor của nó; việc gắn Service chỉ ghi lại dấu decorator, không kiểm tra chữ ký JavaScript. SRC không đoán mò về phá cấu trúc đối tượng, sự nhập nhằng do tham số mặc định, tham số rest, lookup lồng nhau hay kiểu phức tạp.

LIB nhắm vào CI, phát hành và bước dựng trước cho Web. Typert quét toàn bộ Host project, kiểm tra decorator Remote, binding tường minh, service key, xung đột endpoint, khai báo lookup/Context, khả năng tiếp cận ký hiệu công khai, JSON codec, result codec, cùng việc tham số `signal` cuối cùng được dành riêng có đúng kiểu `AbortSignal` toàn cục hay không, rồi sinh descriptor nghiêm ngặt.

Runtime LIB chỉ nạp definition trong `lib`, không khởi động TypeScript compiler. Các bước sau đó của Host Gateway — liên kết Service, lookup, phân giải Context, gọi và mã hóa phản hồi — không phân biệt descriptor đến từ phân giải yếu của SRC hay sinh nghiêm ngặt của LIB.

CI và phát hành chạy LIB. Việc chuyển toàn bộ coverage của cả kho sang LIB là công việc tiếp theo độc lập, không chặn phần hiện thực lời gọi phương thức trực tiếp lần này.

## Phân giải ở Host Gateway

Host Gateway đăng ký với Connection một interceptor `/api`, không duy trì bảng đăng ký endpoint thứ hai. Bộ so khớp quyền sở hữu trước hết kiểm tra registry local của Typert hiện tại, rồi mới tra một tập có thể vô hiệu hóa; tập này được sinh ra bằng cách quét binding `typertGateway` và dấu Remote của SRC trong các Service Cordis hiện tại. Khi Service Cordis thay đổi thì toàn bộ tập bị loại bỏ, nhờ vậy definition của Typert và Service nghiệp vụ có thể đến theo thứ tự bất kỳ, đồng thời vừa không khiến lưu lượng `/api` của API Proxy cũ phải quét lại toàn bộ Service ở mỗi yêu cầu, vừa không làm phình bộ đệm vì các đường yêu cầu tùy ý.

Mỗi lời gọi đều phân giải lại descriptor, receiver, bên cung cấp lookup và bên cung cấp Context từ trạng thái hiện tại. Descriptor strict hiện tại được ưu tiên hơn SRC. Một khi endpoint strict đã xuất hiện, dù sau đó descriptor tương ứng bị thu hồi, `TypertLocalRegistry.hasSeen()` vẫn tiếp tục nhận sở hữu nó trong phần đời còn lại của registry và cấm quay về SRC; chỉ cần đăng ký lại descriptor strict là khôi phục được lời gọi. Việc gỡ Service hay bên cung cấp sẽ khiến lời gọi thất bại rõ ràng; Gateway không giữ lại đối tượng đã vô hiệu, cũng không gọi phương thức bằng chính ID lookup thô.

Lời gọi `@Remote` thông thường giữ nguyên thực thể Service gốc làm receiver. Sau khi lookup thành công, Gateway gọi thành viên do `implementation ?? method` chỉ định theo đúng thứ tự tham số của descriptor; nếu descriptor có khai báo hủy thì nối thêm signal của carrier sau các tham số đó.

Lời gọi `@RemoteScope('agent')` trước hết để Agent Context provider phân giải wire identity, rồi từ Context đó đọc service key của descriptor và gọi scoped receiver. Phương thức nghiệp vụ không nhận tham số Context ẩn hay Agent ID.

```text
ctx.typertGateway.invoke({ namespace, method, args, signal })
→ tra InvocationDescriptor cục bộ và live receiver
→ đọc các trường wire có tên theo descriptor tham số
→ codec giải mã giá trị thường hoặc ID lookup
→ lookup provider phân giải ID thành đối tượng đang sống
→ direct dùng Service gốc; context thì phân giải scoped Context và Service trước
→ khi có cancellation descriptor thì nối signal vào cuối các tham số nghiệp vụ
→ Reflect.apply(receiver[implementation ?? method], receiver, orderedArgs)
→ result codec mã hóa kết quả nghiệp vụ
```

`ctx.typertGateway.invoke()` là entry phía Host độc lập với carrier. Nó không tạo rpcId, RPC envelope hay HTTP response; nó chỉ trả về kết quả đã mã hóa, hoặc sinh ra lỗi Gateway để RPC adapter của Connection ánh xạ.

## Chuỗi gọi `/api` dùng chung

Connection giữ route `/api` duy nhất trên HTTP Server. Gateway gắn phần phán định quyền sở hữu endpoint đồng bộ và Remote RPC handler vào Connection:

```text
ctx.connection.rpc.intercept(
  '/api',
  endpoint => ownsRemoteEndpoint(endpoint),
  (endpoint, payload, signal) => {
    const { namespace, method } = parseEndpoint(endpoint)
    const { args } = parsePayload(payload)
    return ctx.typertGateway.invoke({ namespace, method, args, signal })
  },
)
```

Gateway nhận sở hữu endpoint khi registry Host có descriptor strict, đã từng ghi nhận một descriptor strict bị thu hồi, hoặc trên binding Service SRC đang hoạt động có dấu `@Remote` khớp. Một khi endpoint đã được nhận sở hữu, thì dù việc giải mã payload, phân giải descriptor hay lời gọi thất bại, Gateway vẫn tiếp tục là bên trả lỗi; chỉ những endpoint không thuộc Remote mới rơi vào phương án dự phòng API Proxy cũ.

Nửa Host của Connection giao một FetchHandler tổ hợp cho HTTP bridge. Sau khi bridge tạo `Request` chuẩn, handler đó mới chọn giữa FetchHandler của Gateway RPC và FetchHandler của API Proxy; hai đường dùng chung cùng envelope request/response, rpcId, tuần tự hóa, trust, transport error và `RpcError`. Ánh xạ vật lý hiện tại là:

```text
POST /api/<namespace>/<method>
```

Payload của Remote dùng đối tượng JSON có tên, không dùng mảng theo vị trí, và cũng không gửi `InvocationDescriptor`. Slot payload của một lời gọi Goal thông thường là:

```json
{
  "args": {
    "agentId": "session-1",
    "request": {
      "objective": "finish the migration"
    }
  }
}
```

Chuỗi đầy đủ là:

```text
ctx.remote.goals.create(sessionId, request, signal?)
→ InvocationDescriptor phía Client mã hóa { args: { agentId, request } }
→ Client hợp nhất signal của bên gọi với vòng đời mount của contribution
→ ctx.connection.rpc.call('/api', 'goals/create', { args }, signal)
→ Connection tạo rpcId và envelope client-request sẵn có
→ carrier hiện tại gửi POST /api/goals/create
→ nửa Host của Connection chạy trust dùng chung, rồi bridge tạo Request chuẩn
→ FetchHandler tổ hợp phán định quyền sở hữu endpoint và chọn FetchHandler đích
→ Typert interceptor gọi ctx.typertGateway.invoke(..., request.signal)
→ InvocationDescriptor phía Host giải mã, lookup, phân giải receiver và tiêm signal vào Reflect.apply
→ result codec mã hóa
→ Connection ghi RPC result sẵn có và gửi lại cùng rpcId
→ result codec phía Client kiểm tra và trả về CreateGoalResult
```

Remote không định nghĩa thêm một tầng response `{ ok, value/error }` thứ hai. Giá trị thành công và lỗi Gateway đều dùng thẳng `result` của RPC response sẵn có. Adapter chuyển các thất bại thông thường của Gateway và của lời gọi nghiệp vụ thành envelope `RpcError` sẵn có, và thống nhất dùng `code: 'internal'`; còn lỗi RPC sẵn có mà resolver mang theo trong `TypertLookupFailure` thì được trả nguyên trạng, giữ cho thất bại khi khôi phục nguội và hàng rào sở hữu có mã lỗi ổn định. Phân loại lỗi có cấu trúc của Gateway chỉ được giữ trong tiến trình, còn thông tin chẩn đoán thì truyền qua Connection bằng message.

Gateway không xử lý quyền theo từng phương thức, danh tính bên gọi, tính idempotent hay trạng thái kết nối dài. Nó chỉ lan truyền việc hủy theo kiểu hợp tác của Connection tới các phương thức nghiệp vụ hỗ trợ hủy tường minh. Endpoint của Typert dùng chính sách trusted-host của Connection; endpoint chưa được nhận sở hữu vẫn giữ chính sách trust và privileged-method của API Proxy cũ. Việc chuyển Connection sang WebSocket sẽ được làm độc lập sau này.

## Connection và ranh giới giao thức

Client Remote Service phụ trách đóng góp Remote, việc hiện thực hóa namespace Service, liên kết Scope, cùng việc khớp tham số vị trí với descriptor. Gateway phụ trách descriptor phía Host, quyền sở hữu endpoint, lookup, Context và lời gọi nghiệp vụ. Connection gửi `/api`, endpoint và `{ args }` như một lời gọi RPC tới đích rồi trả về RPC result sẵn có; nó không hiểu Goal, Agent, lookup, descriptor hay kiểu Client Remote.

Gateway chỉ đăng ký với Connection bộ so khớp quyền sở hữu và RPC handler, không đăng ký HTTP route. Connection gắn route `/api` dùng chung lên HTTP Server, và giao một FetchHandler tổ hợp cho bridge; handler đó phân phối endpoint đã nhận sở hữu cho Gateway, còn endpoint chưa nhận sở hữu thì giao cho API Proxy. Transport Connection trong tương lai có thể giữ nguyên trình tự này mà không đổi payload Remote, decorator nghiệp vụ, DTS được sinh, kiểu Remote API hay giao diện lập trình Agent Scope.

## Ranh giới package

- `@deepseek-ai/dsh-typert-protocol`: giao thức nhẹ cho decorator, binding, lookup, Remote Scope và descriptor.
- Typert generator: phân tích Host/Client Program, sinh face cục bộ và phép chiếu phía tiêu thụ Remote, đồng thời sinh thông tin symbol/Zod chuẩn tắc.
- Typert runtime: lưu riêng reflection local của môi trường hiện tại và các đóng góp Remote đã nhập.
- `@deepseek-ai/dsh-api-gateway`: entry mặc định liên kết definition của Host với Service, nhận sở hữu endpoint Remote, thực hiện lookup, phân giải receiver theo Context, gọi và mã hóa kết quả, đồng thời đăng ký interceptor `/api` với Connection; entry `/client` gắn đóng góp Remote, tạo namespace Service và phương thức Remote nghiêm ngặt, rồi giao lời gọi cho `ctx.connection.rpc`. Hai entry dùng chung giao thức Remote, nhưng không import interface merge Cordis của nhau.
- `@deepseek-ai/dsh-api-remotes`: tầng BFF; phụ trách resolver Agent/Session phía Host, chọn đóng góp `/remote` phía Client, và phơi bày kiểu Remote đã hợp nhất cho package nghiệp vụ thông qua quy ước `TypertClientRemote` dùng chung.
- Connection: sở hữu HTTP Server duy nhất/carrier WebSocket tương lai, route `/api` dùng chung và FetchHandler tổ hợp, dự phòng API Proxy, RPC envelope, rpcId, tuần tự hóa, trust và truyền lỗi.
- Các package đối tượng nghiệp vụ như Agent/Session: sở hữu lookup, Context provider, kiểu ID duy nhất và cửa ra công khai chỉ chứa kiểu.
- Phần tổ hợp Host của API Proxy: cung cấp cho API Remotes giá trị mặc định Agent cho Web và thiết lập scope, đồng thời cho các phương thức cũ dùng chung một `agentFor()`.
- Package Service nghiệp vụ: khai báo binding, phương thức Remote cùng kiểu request/result của chúng, và export sub-path `/remote` được sinh ra.

## Phạm vi đã bàn giao và công việc tiếp theo

Chuỗi dọc đã bàn giao là `@deepseek-ai/dsh-goal/remote → Browser Client Remote → Connection RPC /api → Host Gateway → GoalService.remoteExportCreate()`. Cùng một descriptor direct có lookup Agent hỗ trợ đồng thời `ctx.remote.goals.create(agentId, request)` và `agentCtx.remote.goals.create(request)`. Phiên nguội thông thường được khôi phục qua `agentFor()` lúc lookup, còn identity thuộc sở hữu subagent thì giữ nguyên hàng rào `agent-busy` sẵn có; `@RemoteScope('agent')` vẫn là chế độ scoped receiver độc lập.

Connection cung cấp channel interceptor dùng chung và ánh xạ carrier HTTP hiện tại. Việc chuyển sang WebSocket, runtime và carrier của TUI, đấu nối Agent Scope cho TUI, máy trạng thái Permission/Approval, luồng sự kiện Session, ủy quyền lời gọi, thử lại, tính idempotent và tương thích giao thức xuyên phiên bản đều không thuộc quyết định này.

Cấu trúc package là `api/remotes → api/gateway → client/connection → host/webserver`. Connection và WebServer giữ nguyên đường dẫn cũ trong thay đổi lần này; việc chuyển chúng sang `api/connection` và `api/webserver` sau này chỉ đổi vị trí package, không đổi ranh giới của các service đó. API Proxy cũ cũng được giữ dưới `host/apiproxy`, làm đường dự phòng cho những phương thức chưa chuyển sang Remote.

## Alternatives considered

**Tiếp tục dùng package API Proxy trung tâm.** Phương án này đòi hỏi phương thức nghiệp vụ, định tuyến Host và interface Client phải khai báo lặp ở nhiều nơi, đồng thời vẫn trói lời gọi trực tiếp, tương tác có trạng thái và luồng sự kiện vào cùng một vòng đời, nên không chọn.

**Để decorator hoàn tất phản chiếu nghiêm ngặt lúc chạy.** Decorator JavaScript không thể khôi phục kiểu TypeScript đã bị xóa, danh tính ký hiệu công khai và Zod codec đầy đủ; còn việc tiêm symbol riêng của compiler vào constructor lại che giấu phụ thuộc thật của class nghiệp vụ, nên thông tin nghiêm ngặt do Typert compiler sinh ra.

**Dùng preload, loader hook hoặc `ts.Program` đầy đủ khi khởi động SRC.** Cách này cho phép tái dùng phân tích của LIB, nhưng lại đặt thêm yêu cầu lên mọi entry khởi động từ mã nguồn. SRC chỉ cần descriptor yếu dùng được, nên dùng dấu decorator, tên tham số hàm và provider tường minh; phần kiểm tra nghiêm ngặt để lại cho pass quy ước của LIB.

**Viết tay interface phía Client.** Interface viết tay không đảm bảo chỉ chứa các phương thức được đánh dấu Remote, và sẽ trôi lệch khỏi chữ ký Host, ID lookup cùng schema Zod, nên kiểu phía Client được chiếu tự động từ Host Program.

**Dùng plugin TypeScript language-service/compiler để Client hiểu decorator trực tiếp.** Cách này khiến editor, Vite, tsc, tsx và cả bên tiêu thụ bản phát hành đều phải phụ thuộc một plugin bổ sung, diện tích tích hợp quá lớn, nên chọn sinh `.d.ts` thông thường và declaration map tiêu chuẩn.

**Import trọn DTS của Host vào Client hoặc TUI.** Phương án này kéo theo Service của Host và interface merge của Cordis, đồng thời phơi bày các phương thức không được đánh dấu cho phía tiêu thụ. DTS của Remote chỉ tham chiếu ký hiệu công khai thuần kiểu và mở rộng các Remote map chuyên dụng.

**Chỉ sinh Remote DTS, không sinh JS.** Kiểu thì vẫn đứng vững, nhưng runtime không thể liệt kê endpoint, codec và chế độ Context, chỉ còn cách dựa vào Proxy hoặc một bảng đăng ký viết tay khác, nên cùng một lần chiếu từ Host sẽ sinh luôn cả đóng góp Remote JS.

**Để import cấp cao của `/remote` lén đăng ký trạng thái toàn cục.** Lúc ESM được lượng giá chưa chắc đã có Cordis Context đích, và nhiều Context, HMR cùng dispose cũng không quy thuộc rõ ràng được, nên value import thông thường chỉ trả về contribution, còn việc gắn thì do Client Remote Service của phần assembly môi trường thực hiện tường minh.

**Lập transport, HTTP route hay channel `/api2` riêng cho Remote.** Cách này sẽ nhân bản hoặc chia cắt quyền sở hữu Server, rpcId, tuần tự hóa, trust, lỗi và vòng đời WebSocket tương lai của Connection. Interceptor `/api` dùng chung giữ được route vật lý duy nhất, và để Connection tiếp tục dùng API Proxy làm FetchHandler dự phòng.

## Kiểm chứng

- Goal Service decorate thẳng các phương thức thay đổi trạng thái có chữ ký nghiệp vụ vốn đã hợp quy ước Remote, chỉ giữ lại `remoteExportCreate(...)` để chuyển `GoalView` thành `CreateGoalResult`, không cần route thứ hai, codec thứ hai hay danh sách phương thức phía Client.
- Một lần `build:lib` sạch sẽ sinh sản phẩm Remote của Host và của phía tiêu thụ trước khi biên dịch Client, bao gồm JS, DTS và declaration map dưới `/remote` của package nghiệp vụ.
- Sau khi `clean`, chạy riêng `typecheck`, `lint` hay `doc-typecheck` đều sinh lại quy ước Remote; hook pre-push dùng chính typecheck đã bao gồm bước chuẩn bị quy ước, còn bên tiêu thụ mã nguồn trong CI thì chờ một pass quy ước dùng chung.
- Import `@deepseek-ai/dsh-goal/remote` sẽ thêm kiểu nghiêm ngặt `ctx.remote.goals.create(...)`, và có thể điều hướng qua declaration tới `remoteExportCreate`; không import thì namespace đó không xuất hiện.
- Gắn đóng góp JS lấy từ cùng lần import sẽ cung cấp phản chiếu về endpoint, tham số, kết quả, lookup, Context và Zod, và hiện thực hóa lời gọi mà không cần stub viết tay.
- Lời gọi ở Root và lời gọi theo Agent-scope đều đi qua carrier `/api` dùng chung thật, phân giải `agentId` thành Agent đang sống, gọi Goal receiver gốc, và trả về qua envelope RPC sẵn có.
- Lookup Agent và Session dùng chung một lần khôi phục nguội đồng thời; phiên nguội thông thường nhận được đối tượng đã khôi phục, còn identity subagent dù nguội hay đang sống đều trả `agent-busy` trước khi tới lời gọi nghiệp vụ.
- Sản phẩm Remote và map chỉ chứa các phương thức đã được đánh dấu, không phụ thuộc Browser, nhờ đó giữ nguyên ranh giới phía tiêu thụ cho TUI trong tương lai.
- Test vòng đời sẽ thu hồi rồi gắn lại descriptor, Service, lookup, Context provider và namespace phía Client; khi phụ thuộc không khả dụng, lời gọi thất bại, và không dùng lời gọi cũ hay quay về ID thô.
- Test hủy bao phủ việc sinh nghiêm ngặt, nhận diện tên tham số cuối ở SRC, hợp nhất signal phía Client, lan truyền từ Connection tới Gateway, cùng việc Host tiêm signal bên ngoài `args` trên wire.
- Endpoint chưa được nhận sở hữu tiếp tục dùng đường API Proxy sẵn có, giữ nguyên hành vi trust, privileged-method, Permission/Approval và luồng sự kiện Session.

## Hệ quả

Kiểu Remote API phụ thuộc vào khai báo `lib` được sinh ra, nên việc điều phối bản dựng và gate bắt buộc phải hoàn tất pass quy ước Host trước khi biên dịch hay phân tích ngữ nghĩa cho bên tiêu thụ Host và Client; sai thứ tự sẽ khiến các lệnh trong môi trường sạch phụ thuộc vào sản phẩm cũ.

Việc điều hướng mã nguồn phụ thuộc vào việc package Remote phát hành đồng thời declaration map và phần `src` mà map trỏ tới. Khi trường `files` của package bỏ sót một trong hai, kiểu vẫn biên dịch được, nhưng bước nhảy phía tiêu thụ sẽ dừng ở DTS được sinh, nên bước kiểm tra manifest của workspace phải coi cả hai là cùng một quy ước phát hành.

Descriptor yếu của SRC không kiểm tra cấu trúc bên trong của JSON thông thường. Sau khi chữ ký Host Remote thay đổi, Web và bên tiêu thụ kiểu nghiêm ngặt bắt buộc phải chạy lại lib build, vì hệ thống không có contract watcher tăng dần.

Yêu cầu về tính duy nhất của kiểu công khai đòi hỏi DTO nghiệp vụ có cửa ra thuần kiểu, và điều này có thể phơi bày vấn đề ở các package hiện có nơi kiểu Host lẫn lộn với entry hiện thực. Bản dựng sẽ từ chối những ranh giới như vậy, thay vì sao chép kiểu để che vấn đề.

Type import và runtime contribution là hai hiệu ứng khác nhau. `import type {}` chỉ mở rộng bề mặt Remote tĩnh; khi môi trường cần gọi thật lại bỏ sót value contribution, Client Remote Service bắt buộc phải thất bại với lỗi «Remote chưa được gắn» rõ ràng.

Browser và Host mỗi bên giữ thực thể Zod riêng, nên không được dựa vào so sánh identity đối tượng xuyên realm; tính nhất quán chỉ được đảm bảo bởi symbol key chuẩn tắc, cùng một mô hình được sinh ra và hành vi trên wire.

Phía tiêu thụ có thể import một Remote contract mà Host hiện chưa gắn. Kiểu chỉ biểu thị «năng lực giao thức này đã được phía tiêu thụ chọn», chứ không đảm bảo tiến trình đích hiện có Service tương ứng; endpoint không khả dụng lúc chạy bắt buộc phải thất bại rõ ràng.

API channel tổng quát của Connection phải phù hợp đồng thời với carrier HTTP hiện tại và carrier WebSocket sau này. Nếu Client Remote hay Gateway phơi bày `fetch`, HTTP request hoặc route handle, thì việc chuyển sang WebSocket sẽ lại xuyên thủng tầng Remote, nên những đối tượng vật lý đó bắt buộc phải nằm bên trong Connection.

Endpoint Remote dùng quyền `trusted-host` của Connection. Hệ thống mặc định chấp nhận loopback; bên gọi trong LAN phải tham gia qua cấu hình trusted-host tường minh, nhưng tầng này không thêm ủy quyền bên gọi theo từng phương thức, nên mọi trusted host đều có thể gọi các Remote endpoint đã gắn.

`hasSeen()` ưu tiên bảo đảm an toàn cho strict definition hơn là tính khả dụng của SRC. Khi descriptor strict bị thu hồi (ví dụ trong lúc HMR), Gateway vẫn tiếp tục nhận sở hữu endpoint và báo không khả dụng, chứ không quay về descriptor SRC yếu. Đăng ký lại là khôi phục được; chỉ khi khởi động lại registry của Typert thì lịch sử strict definition mới bị quên.

Chữ ký Remote hỗ trợ hủy sẽ nhận `AbortSignal` của yêu cầu Connection, nhờ đó việc đứt kết nối HTTP hay abort từ phía Client có thể truyền tới công việc nghiệp vụ đang chạy mà không cần đi vào giao thức JSON. Hủy vẫn theo kiểu hợp tác: phương thức không có tham số cuối dành riêng sẽ tiếp tục chạy; phương thức nhận được signal phải chuyển nó cho các thao tác hỗ trợ hủy của chính mình, hoặc tự quan sát nó.

Cấu hình lookup hiện ở mức độ chi tiết theo key, nên mọi tham số `agent` hay `session` đều dùng chung một chiến lược khôi phục nguội. Các Remote cụ thể cần ngữ nghĩa chỉ-live phải chờ chính sách tường minh theo từng tham số hoặc từng endpoint, chứ không được để phần hiện thực nghiệp vụ đoán xem đối tượng có vừa mới được khôi phục hay không.
