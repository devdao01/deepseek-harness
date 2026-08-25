# @deepseek-ai/dsh-api-remotes

[English](README.md) | Tiếng Việt

Cung cấp BFF hai phía cho những năng lực Host Remote mà ứng dụng này chọn dùng. Entry point Host phụ trách chính sách định danh Agent/Session; entry point Client nhập các sản phẩm `/remote` được sinh ra dưới dạng giá trị runtime, gắn từng phần đóng góp qua `ctx.remote.$mount()`, rồi tái xuất phần declaration merging tương ứng. Package nghiệp vụ phía Client phụ thuộc vào lớp mặt ngoài này, chứ không phụ thuộc vào phần hiện thực Gateway hay một entry point runtime Remote riêng.

`createApiRemoteAgentResolver()` tái sử dụng Agent live, khôi phục phiên nguội thông thường, khử trùng lặp các lần khôi phục đồng thời, giữ nguyên ownership fence của subagent, và cấu hình cùng một resolver cho cả hai lookup Typert `agent` và `session`. API Proxy chuẩn của Web cung cấp giá trị mặc định cho Agent cùng thiết lập scope, rồi dùng resolver trả về cho các phương thức cũ, khiến phương thức đã di trú và chưa di trú dùng chung một phần hiện thực chính sách.

Tổ hợp Client hiện tại gắn phần đóng góp Goal Remote và phần đóng góp danh mục plugin Host chỉ đọc (`pluginInventory/list`). Khi tổ hợp này được gỡ bỏ, cơ chế sở hữu của Cordis effect sẽ rút lại toàn bộ phần đóng góp; `@deepseek-ai/dsh-api-gateway/client` phụ trách kiểm tra descriptor, Service namespace có thể theo dõi, phương thức trực tiếp và theo phạm vi, cùng việc gọi và hủy. Entry point Client tiêu thụ interface `TypertClientRemote` dùng chung thông qua Cordis chứ không nhập Gateway cụ thể; nó chỉ tái xuất phần declaration merging của Gateway Client face dưới dạng type-only, nên khi bên tiêu thụ lấy từ vựng sự kiện chuyển tiếp qua lớp mặt ngoài này, runtime không phát sinh thêm một cạnh dẫn tới phần hiện thực Gateway.

Package này không chứa logic truyền tải hay logic khám phá service Host. Web hoặc TUI trong tương lai chỉ cần cung cấp cùng một quy ước `ctx.remote` không phụ thuộc React là có thể tái sử dụng Client face của nó.

## Sự kiện Host được chuyển tiếp

`src/remote-events.ts` giữ `API_REMOTE_FORWARDED_EVENTS` — danh sách tên sự kiện cordis phía Host mà ứng dụng này chuyển tiếp nguyên trạng cho bên tiêu thụ (không chiếu, không che giấu, không đổi tên), đồng thời chính là tập khóa hợp lệ của `ctx.remote.$on`; file chỉ chứa kiểu `src/types.ts` dẫn xuất mặt lựa chọn từ đó. Muốn chuyển tiếp thêm một sự kiện chỉ cần thêm một dòng vào mảng ấy: phép chiếu kiểu, mặt khóa phía tiêu thụ và vòng lặp chuyển tiếp của Host đều dẫn xuất từ nó.

Chữ ký listener không được viết lại ở đây. Khai báo `Events` cordis của từng sự kiện trong danh sách đều nằm ở lối xuất `./types` an toàn cho Client của package sở hữu (`dsh-agent-presets`, `dsh-commands`, `dsh-credentials`, `dsh-llm`, `dsh-settings`), và cả hai face của package này đều đưa các khai báo ấy vào mặt biên dịch, nên tính chất "chuyển tiếp nguyên trạng" thành lập một cách kiến thiết, không cần chứng minh riêng. Host face còn khẳng định thêm danh sách này với `TypertForwardableEvent`: tên sự kiện chưa khai báo, sự kiện gắn AgentScope, cũng như sự kiện có hình thái không phải một chiều đều bị từ chối tại đây.

## Ranh giới build

Package thông thường trong repo chỉ thuộc về một TypeScript face: package Host đăng ký ở `tsconfig.host.json` gốc, package Client đăng ký ở `tsconfig.client.json` gốc. `api-remotes` là ngoại lệ duy nhất được tách một cách có chủ ý, vì entry point Host của nó phải tham gia đồ thị Typert phía Host, còn `src/client/index.ts` phải đợi tsdown phía Host sinh xong khai báo `/remote` của các package nghiệp vụ mới biên dịch được.

`tsconfig.json` gốc của package này chỉ là một solution tham chiếu tới `tsconfig.host.json` và `tsconfig.client.json`. Host aggregate cùng bên tiêu thụ Host trực tiếp tham chiếu cái trước, Client aggregate cùng bên tiêu thụ Client trực tiếp tham chiếu cái sau; cấm đưa solution gốc của package vào đồ thị phụ thuộc của bất kỳ aggregate nào. Hai project sở hữu mã nguồn và `.tsbuildinfo` không chồng lấn, nhưng dùng chung thư mục xuất `lib/types` — chỉ có đúng một ngoại lệ có chủ ý: `src/remote-events.ts` và `src/types.ts` được liệt kê **đồng thời** vào `files` của cả hai face, vì danh sách sự kiện chuyển tiếp là điểm kiểm soát duy nhất cho câu hỏi "bên tiêu thụ nhận được gì", và vòng lặp chuyển tiếp của Host cùng mặt khóa `ctx.remote.$on` của Client phải đọc cùng một khai báo, chứ không phải hai khai báo có thể trôi lệch khỏi nhau.

Ngoại lệ này không chỉ là một dòng `files`. `tsconfig.base.json` gốc ánh xạ `@deepseek-ai/dsh-api-remotes/types` sang `src/types.ts` — **mặt phẳng nguồn**, nhất quán với mọi đường dẫn con workspace khác, và ngược với các sản phẩm `/remote` được sinh ra (những sản phẩm này không có mục `paths`, mà dựa vào `exports` để trỏ tới sản phẩm build). Nhờ đó cả hai face đều thu cùng một danh sách và phép chiếu kiểu vào program của mình, và phát ra `lib/types` các kết quả `remote-events` cùng `types` giống hệt từng ký tự; `.tsbuildinfo` vẫn độc lập với nhau. Không có cổng kiểm tra nào bắt buộc mã nguồn của hai face phải không chồng lấn — `scripts/project-reference-faces.ts` chỉ kiểm tra rằng "tham chiếu tới một split project thì phải trỏ đúng face tương ứng" — nên đoạn này ghi lại vì sao lần liệt kê kép này là có chủ ý.


`clientBundle(..., { hostPhase: true })` trong package khiến tsdown phía Host đóng gói entry point Host, để tsdown phía Client sau đó chỉ đóng gói entry point browser. Plugin Client thông thường vẫn dùng một project Client duy nhất, và sinh entry point Node loader cùng bundle browser chung trong giai đoạn tsdown phía Client; không được sao chép cách tách của package này chỉ vì một package đồng thời có `src/index.ts` và `src/client/index.ts`.

## Trải nghiệm mô hình

Không có, vì BFF này chỉ chọn phương thức ứng dụng Remote cùng chính sách định danh, không đăng ký bất kỳ interface mô hình nào.

#### Ảnh hưởng KV Cache

Không có ảnh hưởng trực tiếp; mọi hành vi mà mô hình nhìn thấy do nó kích hoạt đều thuộc trách nhiệm của các năng lực Host đã được gắn kết.

## Hạn chế đã biết và phần việc tạm hoãn

- Tập năng lực được xác định cố định bởi các giá trị nhập tường minh lúc build; Client không khám phá tại runtime những service hay định nghĩa Remote đã bật ở Host.
- Muốn thêm năng lực thì phải nhập tường minh giá trị `/remote` tương ứng và gắn nó trong tổ hợp này.
- Trước khi phần cấu hình BFF còn lại được di trú sang `api-remotes`, Host Web chuẩn vẫn lấy giá trị mặc định khôi phục và thiết lập scope Agent từ API Proxy cũ.
