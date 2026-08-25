# test-support/：hạ tầng phát triển và kiểm thử

[English](README.md) | 中文

Các gói này hỗ trợ việc phát triển, kiểm thử và ví dụ mẫu của repo, chứ không phải product API. Tính tương thích của chúng phụ thuộc vào nhu cầu phát triển mà chúng phục vụ.

| Gói | Trách nhiệm |
|---|---|
| [`acp-snapshot/`](acp-snapshot/README.md) | Cung cấp bộ công cụ kiểm thử snapshot ACP (Agent Client Protocol) |
| [`agent-loop-testkit/`](agent-loop-testkit/README.md) | Mount các điều kiện tiên quyết dùng chung cho kiểm thử AgentLoop |
| [`invariants/`](../runtime-diagnostics/invariants/README.md) | Chạy các khẳng định (assertion) quy ước runtime trong giai đoạn phát triển |
| [`loader-smoke/`](loader-smoke/README.md) | Khởi động ứng dụng được Loader lắp ráp để thực hiện smoke test |
| [`llm-mock-server/`](llm-mock-server/README.md) | Cung cấp máy chủ giả lập lỗi tương thích OpenAI, có tính xác định |
| [`llm-replay/`](llm-replay/README.md) | Phát lại các phản hồi model đã ghi lại cho kiểm thử và demo không cần key |

Khi một gói có được quy ước sản phẩm và bên tiêu thụ sản phẩm, nó sẽ được chuyển ra khỏi `test-support/`.

Quy ước bất biến (invariant) được ghi lại tại [docs/subsystems/invariants.md](../../docs/subsystems/invariants.md).
