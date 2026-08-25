# Agent Note: Loại bỏ agent stdio và Echo

Status: implemented

[English](2026-07-20-remove-stdio-and-echo-agents.md) | 中文

## Vấn đề

Ngoài TUI và Headless coding agent, DeepSeek Harness còn cung cấp hai agent (smart agent) sản phẩm trùng lặp. Agent stdio theo hướng dòng dùng giao thức prompt/output pha trộn, đồng thời triển khai trùng lặp cả tương tác terminal lẫn thực thi non-interactive. Echo thì dùng model mock không cần kết nối mạng cộng một tool giảng dạy để triển khai trùng lặp Headless, biến fixture (dữ liệu tiền đề test) thành agent hướng tới người dùng và đường quick-start mặc định.

Phần triển khai đi kèm của cả hai agent đều không chỉ dừng ở cấu hình leaf. stdio sở hữu UI plugin, app package, interface SDK, REPL leaf, giao thức prompt và test Loader. Echo sở hữu lệnh chạy được, adapter mock, tool, gate demo CI, entry graph, tham chiếu giảng dạy và fixture test dùng chung. Giữ lại bất kỳ đường sản phẩm nào trong số này cũng gián tiếp giữ lại agent trùng lặp đó.

Standard input/output vẫn là ranh giới giao thức cho ACP, JSON-RPC, MCP và subprocess. Adapter model xác định (deterministic) cũng vẫn khả dụng cho test. Các cơ chế này không đủ là lý do để giữ lại một agent sản phẩm hướng dòng hoặc chỉ dùng mock.

## Quyết định

Loại bỏ hoàn toàn agent stdio và Echo, không cung cấp package tương thích, mode, lệnh hay alias. Xóa UI package stdio và app package, `examples/repl-agent`, `examples/echo-agent`, `demo:repl`, `demo:echo`, các test chuyên dụng của từng cái, cùng các mục manifest (metadata), gate, graph và tài liệu liên quan.

Vai trò ứng dụng được giữ lại đều có quy thuộc rõ ràng:

- `@deepseek-ai/dsh-tui` phụ trách thực thi tương tác terminal. Nó từ chối luồng non-TTY trước khi Loader khởi động; overlay `apps/cli/config/base.cordis.yml` và `tui.cordis.yml` sở hữu bộ lắp ráp coding đầy đủ, còn phần bao phủ snapshot PTY và terminal nằm ở `apps/cli/tests/`.
- [`dsh --profile headless`](../../../../apps/cli/README.md) phụ trách thực thi non-interactive. Profile `headless` của nó là bộ lắp ráp sản phẩm; `examples/headless-agent` phụ trách replay snapshot, test suite agent thật dùng chung và driver Loader không cần key không được export.
- [`@deepseek-ai/dsh-acp-demo`](../../../../packages/examples/acp-demo/README.md) và `@deepseek-ai/dsh-sdk-jsonrpc-server` phụ trách tích hợp giao thức đóng khung riêng của từng cái.

Model project SDK từng mang option interface chạy `stdio` đã bị xóa bởi [quyết định loại bỏ toolchain project SDK](2026-08-11-remove-sdk-project-toolchain.md). Tài liệu demo trong repo yêu cầu DeepSeek API key, và ưu tiên dẫn người dùng đến sản phẩm hiện đang chạy được.

Xác minh không cần key thuộc trách nhiệm của test. Test smoke của Headless Loader dùng adapter fixture để xác minh round-trip tool thật; test suite `dsh` built-bin cố định entry point one-shot và output đã publish; snapshot Headless sản phẩm cố định việc persist; e2e đóng PTY của Headless cố định việc leo thang signal. Test Loader riêng của từng package thì đặt adapter xác định cạnh scenario tương ứng.

Không cái nào trong số này được phơi bày ra ngoài như một mock agent có thể chạy được.

## Xác minh

Phần bao phủ Loader của TUI và Headless chạy app package thật ở cả hai mode source lẫn build artifact. Bao phủ subprocess do PTY dẫn dắt chỉ dùng cho lifecycle của TUI; test smoke entry point khác dùng giao thức pipe một lần. Headless xác minh quy ước task/result và tool call. Graph sinh tự động và tìm kiếm repo sẽ từ chối package, lệnh, leaf, interface SDK, tham chiếu `createStdioChat` và `StdioRuntime` đã cũ.

File thực thi `dsh` đã build sẽ từ chối khởi động TUI qua pipe trước khi Loader khởi động, và trỏ đến `dsh --profile headless`; `apps/cli/tests/built-bin.e2e.ts` cố định entry point one-shot sản phẩm dưới Node thông thường, bao gồm output và tham số không hợp lệ. `examples/headless-agent/tests/headless.snapshot.ts` cố định việc persist sản phẩm, `apps/cli/tests/headless-shutdown.e2e.ts` phụ trách leo thang signal có giới hạn. Driver JSONL chỉ dùng cho test của ví dụ headless giữ lại snapshot sự kiện canonical sau khi lắp ráp, mà không tạo ra bộ quy ước CLI (giao diện dòng lệnh) thứ hai. Code Mode được bao phủ bởi snapshot TUI theo chương trình và demo overlay ACP. Tích hợp ngữ cảnh thời gian thực hiện qua bộ lắp ráp test Headless tường minh thực thi hai turn có thứ tự, còn hành vi tốn thời gian chi tiết hơn thuộc trách nhiệm của test cấp package cho ngữ cảnh thời gian.

## Phương án thay thế từng cân nhắc

- **Chỉ giữ agent hướng dòng cho pipe**: không chấp nhận, vì Headless đã cung cấp quy ước task có giới hạn, stdout định dạng sạch, ranh giới hoàn thành bền vững và exit status của process.
- **Giữ lại, gộp hoặc nâng cấp helper readline như một package**: không chấp nhận, vì nó chỉ có một app tiêu thụ, không tồn tại quy ước có thể thay thế độc lập. Gộp nó vào app stdio tuy loại bỏ được ranh giới package hỗ trợ thiếu lý do chính đáng, nhưng vẫn giữ lại sản phẩm trùng lặp; muốn đưa lại package này trong tương lai, UI hướng dòng độc lập phải có bên tiêu thụ thứ hai thực sự trước đã.
- **Giữ Echo làm đường quick-start không cần key**: không chấp nhận, vì trải nghiệm sản phẩm lần đầu nên dùng model thật và coding agent được hỗ trợ, chứ không phải adapter được script hóa với tool chuyên dụng.
- **Chỉ giữ Echo cho lệnh demo CI**: không chấp nhận, vì fixture Headless do test nắm giữ có thể bao phủ cùng ranh giới Loader và build artifact, không cần giữ leaf sản phẩm mock.
- **Loại bỏ mọi cơ chế stdio hoặc mock**: không chấp nhận, vì giao thức đóng khung, I/O process và adapter test xác định là hạ tầng độc lập, không phải agent bị loại bỏ.

## Hệ quả

- Thực thi sản phẩm tương tác và non-interactive mỗi loại chỉ có một bên quy thuộc và một coding leaf có thể chạy được.
- Repo không còn demo agent không cần key hướng tới người dùng; demo agent local cần `DEEPSEEK_API_KEY`.
- CI giữ lại bao phủ không cần key cho entry point thật thông qua fixture test, thay vì phụ thuộc vào lệnh sản phẩm.
- Cấu hình agent stdio và lệnh Echo hiện có sẽ fail trực tiếp, không được chuyển đổi.
- Chủ đích loại bỏ tương tác nhiều turn dựa trên pipe trong một process duy nhất, cùng provider readline cho `ask_user_question` hướng non-TTY; khôi phục session có thể đáp ứng công việc nhiều turn bền vững, còn bộ lắp ráp non-TTY phải tự cung cấp provider tương tác riêng.
