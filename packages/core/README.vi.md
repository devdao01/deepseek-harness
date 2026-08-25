# core/ — Trục API sản phẩm

[English](README.md) | 中文

Các log phiên, việc lắp ráp system prompt, registry công cụ, từ vựng agent (tác tử), lựa chọn model mặc định khi triển khai và vòng lặp cụ thể tạo nên trục điều khiển mặc định của harness. Đây là các gói **sản phẩm**, tức là các interface ổn định mà plugin và bên tiêu thụ dựa vào để xây dựng.

| Gói | Trách nhiệm | ctx key |
|---|---|---|
| [`scope/`](scope/README.md) | Nguyên thủy đăng ký ngữ cảnh có phạm vi (scope) | Thư viện, không dùng ctx key |
| [`session/`](session/README.md) | Log phiên event-sourced và lưu trữ trong bộ nhớ | `ctx.sessions` |
| [`system-prompt/`](system-prompt/README.md) | Registry lắp ráp prompt và schema công cụ | `ctx.systemPrompt` |
| [`tools/`](tools/README.md) | Registry công cụ có phạm vi và pipeline thực thi | `ctx.tools` |
| [`agent/`](agent/README.md) | Interface, registry và từ vựng sự kiện của Agent | `ctx.agents` |
| [`agent-default-model/`](agent-default-model/README.md) | Lựa chọn model mặc định dùng chung cho các điểm vào của Agent | `ctx.agentDefaultModel` |
| [`agent-loop/`](agent-loop/README.md) | Bộ điều khiển (driver) agent cụ thể mặc định | `ctx.agentLoop` |

`scope` cung cấp nguyên thủy phạm vi dùng chung. `agent` chịu trách nhiệm công bố ước định (convention), `agent-loop` là triển khai mặc định của nó; các plugin mở rộng dựa vào seam này, nhờ đó driver có thể thay thế được. `agent-default-model` chịu trách nhiệm lựa chọn khi triển khai, các điểm vào của Agent chỉ dùng nó khi bản thân phiên chưa có lựa chọn nào.

Tổ hợp có thể chạy được thuộc về [`examples/agent-spine-demo`](../examples/agent-spine-demo/README.md); nhóm này chỉ chịu trách nhiệm về các thành phần trục có thể thay thế.

Tham chiếu hệ thống con — sơ đồ vòng lặp theo từng gói, handle `Agent` và các ước định phân phối/chặn của nó — xem [docs/subsystems/core.md](../../docs/subsystems/core.md); tổ hợp có thể chạy được mặc định là [`examples/agent-spine-demo`](../examples/agent-spine-demo/README.md).
