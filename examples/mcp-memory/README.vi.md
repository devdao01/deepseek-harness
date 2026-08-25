# Ví dụ bộ nhớ MCP bên thứ ba

[English](README.md) | 中文

Ba **cấu hình tham khảo mặc định tắt** này kết nối một hệ thống bộ nhớ với DSH thông qua [`@deepseek-ai/dsh-mcp-client`](../../packages/mcp/mcp-client/README.md). Hãy chọn một trong số đó, hoặc sao chép các mục cấu hình MCP chung tương tự để kết nối với các máy chủ khác.

Các cấu hình bên thứ ba này chỉ mang tính tham khảo cho khả năng tương tác; việc được thu thập không đồng nghĩa với sự chứng thực, giới thiệu, quan hệ đối tác hay cam kết hỗ trợ liên tục từ DeepSeek.

## DSH chịu trách nhiệm gì

DSH giải quyết overlay Cordis được chọn, khởi động lệnh stdio đã cấu hình hoặc kết nối tới URL Streamable HTTP đã cấu hình, khám phá công cụ MCP, và công khai các công cụ đó dưới dạng `mcp__<serverName>__<tool>`. DSH **không** chịu trách nhiệm tải máy chủ về, khởi tạo cơ sở dữ liệu của nó, chọn model hay nhà cung cấp embedding, tạo tài khoản đám mây, di trú dữ liệu nhà cung cấp, hay giám sát dịch vụ HTTP độc lập. Với stdio, client MCP chung sẽ khởi động và dừng subprocess theo vòng đời plugin DSH; với HTTP, dịch vụ thượng nguồn phải đã đang chạy sẵn.

Cầu nối stdio sẽ chủ động loại bỏ các biến trong môi trường có tên thường biểu thị thông tin xác thực, cùng mọi biến `DSH_*`, trước khi khởi động subprocess; các biến môi trường còn lại vẫn được kế thừa. Mỗi ví dụ chỉ thêm các override cần thiết cho baseline của nó. Nếu một tính năng thượng nguồn tùy chọn cần thêm khóa khác, hãy thêm biến đó vào `config.env` của mục cấu hình, đừng ghi thẳng khóa vào YAML.

## Chọn một

| Hệ thống | Phiên bản đã kiểm thử | Kênh truyền | Điều kiện tiên quyết thượng nguồn |
|---|---:|---|---|
| [Memorix](https://github.com/AVIDS2/memorix) | `memorix@1.3.0` (`500792cad3144142293bfbb20acb4841c9f7fcfa`) | stdio | Node 22.18+, và chạy `npm install --global memorix@1.3.0` |
| [MCP Reference Memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) | `@modelcontextprotocol/server-memory@2026.7.4` (`6dd0a683e198783e30feabf7abaf42f925bd18b1`) | stdio | `npm install --global @modelcontextprotocol/server-memory@2026.7.4` |
| [Engram](https://github.com/Gentleman-Programming/engram) | `v1.20.0` (`ba9e46ced152c37a7cb9e576153c41995873e2fc`) | stdio | Go 1.25.10+, và chạy `go install github.com/Gentleman-Programming/engram/cmd/engram@v1.20.0`, hoặc cài đặt file nhị phân bản phát hành phù hợp |

## Bật một cấu hình

Truyền một overlay cho DSH:

```sh
dsh web --patch "$PWD/examples/mcp-memory/memorix.cordis.yml"
```

Hãy thay tên file bằng `mcp-reference-memory.cordis.yml` hoặc `engram.cordis.yml`. Đường dẫn này có thể trỏ tới một bản sao ở bất kỳ đâu trên ổ đĩa. Tổ hợp bàn giao không chứa bất kỳ máy chủ bộ nhớ nào, nên nếu không truyền `--patch`, cả ba đều sẽ ở trạng thái tắt.

Nếu muốn giữ cấu hình đã chọn qua nhiều lần chạy, hãy hợp nhất `insert` patch đơn lẻ trong file tương ứng vào lớp patch của người dùng: chỉ áp dụng cho một profile thì ghi vào `$DSH_HOME/profiles/<name>/cordis.patch.yml`, áp dụng cho mọi profile trên máy thì ghi vào `$DSH_HOME/cordis.patch.yml`. Đừng ghi đè file đã tồn tại, vì nó có thể đã chứa patch người dùng khác không liên quan.

## Thiết lập nhà cung cấp

### Memorix

```sh
npm install --global memorix@1.3.0
dsh web --patch "$PWD/examples/mcp-memory/memorix.cordis.yml"
```

Memorix có thể chạy ở chế độ heuristic cục bộ mà không cần LLM (mô hình ngôn ngữ lớn) hay dịch vụ embedding. Hãy cấu hình nhà cung cấp tùy chọn trong `~/.memorix/config.toml` của riêng Memorix, hoặc `memorix.toml` của dự án. Ví dụ này dùng theo định danh dự án Git trong thư mục làm việc của DSH, và dùng thư mục mặc định `~/.memorix/data` của chính Memorix. Để ghi đè thư mục đó, hãy đặt `MEMORIX_DATA_DIR` trước khi khởi động DSH.

### MCP Reference Memory

```sh
npm install --global @modelcontextprotocol/server-memory@2026.7.4
dsh web --patch "$PWD/examples/mcp-memory/mcp-reference-memory.cordis.yml"
```

Máy chủ tham khảo này lưu trữ đồ thị tri thức cục bộ, và công khai các công cụ entity, relation, observation, read, search và open. Nó không cần model hay dịch vụ embedding. Ví dụ này lưu JSONL tại `$HOME/.dsh-mcp-reference-memory.jsonl`, thay vì trong thư mục gói npm đã cài đặt. Để ghi đè đường dẫn đó, hãy đặt `MEMORY_FILE_PATH` trước khi khởi động DSH.

Tìm kiếm chỉ khớp chuỗi con không phân biệt hoa thường trên tên, loại và observation của entity, không phải truy xuất ngữ nghĩa. Máy chủ này không cung cấp embedding, tóm tắt tự động, giải quyết xung đột hay chính sách lãng quên.

### Engram

```sh
go install github.com/Gentleman-Programming/engram/cmd/engram@v1.20.0
dsh web --patch "$PWD/examples/mcp-memory/engram.cordis.yml"
```

Engram chịu trách nhiệm lưu trữ và chọn dự án: mặc định nó dùng `~/.engram`, phát hiện dự án Git từ thư mục làm việc của DSH, và chấp nhận `ENGRAM_DATA_DIR` hoặc `ENGRAM_PROJECT` làm override qua biến môi trường.

## Chỉ dẫn model dùng chung tùy chọn

Nếu mô tả công cụ của máy chủ không đủ tin cậy để kích hoạt việc dùng bộ nhớ, hãy thêm chỉ dẫn ngắn gọn, không phụ thuộc nhà cung cấp sau vào chỉ dẫn model hiện có của bạn:

> Gọi công cụ ghi bộ nhớ khi người dùng yêu cầu ghi nhớ điều gì đó; truy xuất bộ nhớ và dùng kết quả liên quan khi thông tin lịch sử có thể liên quan.

Đây chỉ là hướng dẫn bổ sung. Ví dụ này không thay thế persona trong system prompt của DSH.

## Xác minh ghi, gợi nhớ ở session mới, và cách dùng

Hãy dùng một giá trị duy nhất xuyên suốt quá trình, và giữ nguyên phạm vi lưu trữ của nhà cung cấp:

1. Trong DSH session A, đặt câu: `Remember that my validation drink is lapsang-<unique suffix>.`. Xác nhận model đã gọi công cụ ghi của nhà cung cấp, và công cụ trả về thành công.
2. Trong cùng một Host vẫn đang chạy, tạo DSH session B. Đừng sao chép cuộc hội thoại của session A. Đặt câu: `What is my validation drink? Check memory.`. Xác nhận model đã gọi công cụ tìm kiếm hoặc gợi nhớ của nhà cung cấp, và trả về đúng giá trị đó.
3. Tiếp tục trong session B với câu: `Use that preference to suggest one drink for the meeting.`. Xác nhận câu trả lời có dùng giá trị đã gợi nhớ.

Bắt buộc phải tạo DSH session mới, nhưng không cần khởi động lại Host. Chỉ cần khởi động lại hoặc thực hiện HMR (Hot Module Replacement) khi subprocess MCP bị crash, vì client chung hiện tại không tự động kết nối lại; đăng ký công cụ của nó sẽ được giữ nguyên cho đến khi plugin dispose (giải phóng tài nguyên) hoặc đồng bộ lại thành công, các lệnh gọi tới transport đã đóng có thể thất bại. Quá trình khám phá ban đầu diễn ra bất đồng bộ, nên hãy đợi các công cụ `mcp__...` của nhà cung cấp xuất hiện trước khi gửi prompt xác minh đầu tiên.

## Kết nối với các máy chủ MCP khác

Sao chép các trường mục nhập tương tự, và dùng `id` và `serverName` duy nhất:

```yaml
- insert:
    - id: memory-my-server
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: my-memory
        transport: stdio
        command: my-memory-mcp
        args: []
        env: {}
        cwd: !!js process.cwd()
```

Với máy chủ từ xa, hãy dùng `transport: streamable-http`, `url` và `headers` thay thế. Việc cài đặt, danh tính, xác thực, model, embedding, lưu bền vững và giấy phép riêng của nhà cung cấp vẫn thuộc trách nhiệm của nhà cung cấp.
