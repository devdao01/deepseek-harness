# Ví dụ acp-agent

[English](README.md) | 中文

Máy chủ [ACP (Agent Client Protocol)](https://agentclientprotocol.com) hướng tự động hóa, cung cấp qua JSON-RPC stdio. Nó hướng tới parent agent (tác tử cha), nhà cung cấp subagent và các client lập trình khác, chứ không phải giao diện sản phẩm.

```sh
pnpm run demo:acp             # needs DEEPSEEK_API_KEY (repo-root .env or env)
pnpm run demo:code-mode       # same protocol with the Code Mode tool transport
```

Leaf này nạp ứng dụng ACP, adapter DeepSeek, chồng bash và filesystem chịu giới hạn sandbox, chính sách phê duyệt một lần, compaction (nén), subagent, workflow, hook, chỉ mục truy vấn session phái sinh, và guard chống lặp lại. Ứng dụng tạo một agent mới cho mỗi `session/new`, lưu bền vững session vào JSONL, và giữ cho stdout chỉ chứa nội dung giao thức. Overlay tùy chọn có thể thêm truy vấn session, kho lưu trữ spill hệ thống tệp, Code Mode hoặc thu thập Web.

## Kênh giao thức

Stdout chỉ mang ACP JSON-RPC phân tách bằng dấu xuống dòng. `@deepseek-ai/dsh-acp-demo` không cài đặt stdout logger; các thành phần mới thêm vào leaf này phải dùng stderr để xuất thông tin chẩn đoán.

Các quy ước tự động hóa (phương thức được hỗ trợ, nội dung prompt cơ sở, đầu ra văn bản đã commit, và giao diện UI cố ý bị thiếu) nằm ở [`@deepseek-ai/dsh-acp`](../../packages/acp/acp/README.md).

## Workspace session và quyền hạn

Mỗi `session/new` cung cấp một `cwd` tuyệt đối. Bash và các sửa đổi filesystem chịu giới hạn sandbox sẽ áp dụng `workspace-write` dựa trên cwd của session đó, nên các session chạy song song có thể dùng thư mục gốc dự án khác nhau; thư mục gốc tạm thời của nền tảng vẫn là vùng lưu tạm chia sẻ có thể ghi (xem [quy ước sandbox](../../packages/sandbox/sandbox/README.md)). `DSH_PERMISSION_MODE` chọn `workspace-write` hoặc `danger-full-access` tùy theo triển khai.

Ở chế độ `workspace-write`, nếu model thử lại yêu cầu quyền truy cập sandbox rộng hơn, `session/request_permission` sẽ được kích hoạt, với các lựa chọn `allow_once` và `reject_once`. Client quyết định theo cách lập trình; nếu client bỏ qua lựa chọn hoặc không thể phản hồi, hệ thống sẽ xử lý như từ chối. Kết quả được chọn chỉ áp dụng cho lần thử lại đó, và được ghi lại qua đường dẫn kết quả công cụ/kiểm toán thông thường. Máy chủ không bao giờ công khai bộ chọn quyền hạn, cũng không lưu bền vững chính sách của client.
