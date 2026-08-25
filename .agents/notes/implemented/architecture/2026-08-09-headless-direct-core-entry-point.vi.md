# Agent Note: headless là entry point sử dụng trực tiếp dịch vụ core

Status: implemented

[English](2026-08-09-headless-direct-core-entry-point.md) | 中文

## Vấn đề

Quy ước sản phẩm của `headless` là một tác vụ cục bộ: văn bản assistant cuối cùng ghi ra stdout, trạng thái exit phản ánh thành công hay không, khi thành công stderr rỗng, và không mở cổng lắng nghe nào. Bao gồm tổ hợp dịch vụ Workspace Host, ApiProxy, HTTP, Web runtime hay plugin trình duyệt sẽ vi phạm quy ước này, đồng thời khiến trạng thái hoàn thành cục bộ phụ thuộc vào cây transport không liên quan.

Entry point trực tiếp vẫn cần trạng thái model triển khai giống hệt như Agent do Web tạo ra. Giá trị mặc định provider/model độc lập sẽ khiến cùng một lần triển khai cho ra hai câu trả lời khác nhau, còn việc suy ra trạng thái hoàn thành trước khi Agent và lưu bền phiên dừng hẳn hoàn toàn sẽ khiến stdout và trạng thái exit quan sát thấy trạng thái chưa hoàn chỉnh.

## Quyết định

Profile `headless` đi kèm bao gồm `dsh-base` và `dsh-headless`. Bundle tổ hợp headless cung cấp persona và tool mode riêng, tắt HMR (Hot Module Replacement), gắn tường minh Code Mode worker, và chèn `headless-runner`. Cây plugin của nó không chứa bất kỳ package `@deepseek-ai/dsh-host-*` nào, ApiProxy, HTTP server, Web runtime hay client trình duyệt. Code Mode và lưu bền phiên đều là năng lực Agent một lần (one-shot), độc lập với việc hiển thị Web.

`headless-runner` là entry point sử dụng trực tiếp dịch vụ core. Sau khi Loader load xong hoàn toàn, nó đọc `ctx.agentDefaultModel.currentSelection()`, tạo một Agent lưu bền mới qua `ctx.agents.create`, cài đặt `ModelSelection` đó trong phạm vi Agent, chờ công việc khởi động dừng hẳn hoàn toàn, đánh dấu số thứ tự sự kiện phiên, gửi một message người dùng thông thường, rồi lại chờ dừng hẳn hoàn toàn. Sau đó, nó chờ `ctx.sessions.flush`, gộp khoảng sự kiện lưu bền mà nó tự giữ, để lấy ra văn bản assistant không rỗng cuối cùng và lý do kết thúc `turn/end` cuối cùng, ghi văn bản đó kèm một dòng mới ra stdout, và chỉ khi lý do kết thúc là `completed` mới yêu cầu launcher đóng có giới hạn với trạng thái exit 0. Khi lý do kết thúc là `error`, mã lỗi và message lưu bền của nó được ghi ra stderr; lỗi bất ngờ của driver cũng được ghi ra stderr và exit với mã 1.

`@deepseek-ai/dsh-agent-default-model` sở hữu giá trị mặc định độc lập với transport, dùng cho các Agent không có lựa chọn ở cấp phiên. `AgentDefaultModelConfig` cung cấp `ctx.agentDefaultModel` và đăng ký mục Settings `agent-default-model`. Cấu hình tổ hợp cung cấp `{provider, model}`, cài đặt người dùng còn có thể cung cấp thêm `reasoningEffort`. `currentSelection()` trả về lựa chọn đầy đủ hiện tại, còn `saveSelection()` ghi đè toàn bộ mục, do đó một lựa chọn không kèm reasoning effort sẽ xóa reasoning effort đã lưu trước đó. `dsh-base` cung cấp mục tổ hợp này. Cả entry point trực tiếp lẫn entry point ApiProxy đều tiêu thụ dịch vụ này; chỉ ApiProxy chịu trách nhiệm về độ ưu tiên cấp phiên, xác thực model và lưu bền lựa chọn Web đã được chấp nhận.

`loadProfile` nhận diện đúng bộ ba headless (`dsh-base`, `dsh-web-app`, `dsh-headless`) mà quy trình cài đặt sở hữu, chuẩn hóa nó thành template headless đi kèm, và giữ nguyên toàn bộ các trường khác của manifest (danh mục metadata). Danh sách tổ hợp có thêm mục, thiếu mục, hoặc thứ tự khác đi thuộc quyền của người dùng, giữ nguyên không đổi.

Agent Note này chịu trách nhiệm về quy ước transport và hoàn thành của headless. [App tự sở hữu command line](2026-08-06-app-owned-command-line.md) chịu trách nhiệm về cú pháp `dsh --profile headless` hiện tại; [quyết định `dsh run`](../../archived/feature/2026-08-08-dsh-run-headless-command.md) gốc ghi lại cú pháp launcher sở hữu đã bị thay thế, [Phân lớp GUI và giao thức RPC](2026-07-19-gui-layering-and-rpc-protocol.md) chịu trách nhiệm về ranh giới gateway trình duyệt, [Khởi động và phân lớp transport của cây cấu hình Web](2026-07-24-web-config-tree-boot-and-transport-layering.md) chịu trách nhiệm về cây plugin Web, [Model mặc định theo picker](../feature/2026-08-07-default-model-follows-the-picker.md) chịu trách nhiệm về việc lưu bền giá trị Agent mặc định dùng chung.

## Xác minh

Test package dùng factory Agent kịch bản hóa với kho lưu trữ phiên và registry Agent thực, cố định các trường hợp: gộp trạng thái idle-to-idle, hoàn thành bất đồng bộ trễ, chẩn đoán model ở trạng thái kết thúc, exit chưa hoàn thành khác, lỗi trực tiếp, dispose (giải phóng tài nguyên) trong lúc Loader đang load, và thứ tự flush trước khi exit. Snapshot keyless đã lắp ráp chạy `dsh --profile headless` qua vòng lặp công cụ replay, ghi lại một `user/message` với `source.kind: 'user'`, và lộ ra lỗi model ở trạng thái kết thúc trên stderr. Kiểm thử nghiệm thu (acceptance) trên binary đã build truy cập provider mock qua entry point đã publish, yêu cầu văn bản cuối cùng xuất hiện trên stdout, trạng thái exit là 0 và stderr rỗng. Kiểm thử dump cấu hình loại trừ toàn bộ package Host, Web và Client trong cây headless đi kèm; kiểm thử đóng PTY yêu cầu không xuất hiện dòng quan sát nào, và dispose hoàn thành trong thời gian có giới hạn.

## Các phương án đã cân nhắc

| Phương án | Điểm không khớp quy ước |
|---|---|
| Giữ `dsh-web-app`, nhưng ẩn dòng quan sát | Tiến trình vẫn mở cổng và mang theo cây plugin Host, Web và trình duyệt. |
| Xây dựng bundle Host thuần túy một lần xoay quanh ApiProxy | ApiProxy là gateway giao thức phía client, còn entry point một lần cục bộ không có ranh giới client. |
| Dùng `InProcessApiClient` để triển khai bao phủ giao thức cấp sản phẩm | Việc thực thi sản phẩm sẽ phụ thuộc vào giao thức đó chỉ vì lý do test không liên quan. |
| Cung cấp cấu hình provider/model riêng cho headless | Việc tạo trực tiếp và tạo qua Web sẽ có giá trị mặc định và lưu bền độc lập với nhau. |
| Bỏ Code Mode và lưu bền phiên | Cả hai năng lực đều thuộc về thực thi Agent một lần, chứ không phải hiển thị Web. |
| Chuẩn hóa mọi bộ ba chứa tổ hợp Web và headless | Danh sách tổ hợp là bề mặt mở rộng; chỉ bộ ba thuộc quy trình cài đặt chính xác mới có thể phân loại an toàn. |

## Hệ quả

`dsh --profile headless` cung cấp tác vụ Agent cục bộ, chứ không phải quan sát trình duyệt, Host API hay HTTP. Người dùng cần các năng lực này chọn `dsh web`. Khi thành công stderr rỗng, kết quả hoàn thành được suy ra sau khi flush lưu bền, phiên đã lưu bền vẫn khả dụng cho công cụ sau đó sử dụng. Message người dùng ban đầu ghi `source.kind: 'user'`, do đó không mang `rpcId` của ApiProxy.

Việc bao phủ carrier của ApiProxy vẫn nằm trong package ApiProxy. Profile một lần tùy chỉnh có thể tường minh chứa tổ hợp Host hoặc Web; profile đi kèm và bộ ba thuộc quy trình cài đặt có thể nhận diện đều không chứa Web.
