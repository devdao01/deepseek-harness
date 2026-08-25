# acp/: Tự động hóa Agent Client Protocol

[English](README.md) | Tiếng Việt

Nhóm ACP (Agent Client Protocol) công khai các agent (tác tử) trong harness cho các client lập trình thông qua giao thức này. Đây là tầng vận chuyển liên vận hành (interoperability transport layer), không phải tầng hiển thị hay tương tác người-máy; *client* subagent ngoài tiến trình được ghép cặp nằm ở [`subagent/subagent-acp`](../subagent/subagent-acp/README.md), vì nó triển khai giao diện phía cung cấp (provider) subagent.

| Gói | Trách nhiệm |
|---|---|
| [`acp/`](acp/README.md) | Máy chủ ACP chỉ dành cho tự động hóa. |

Các quy ước máy chủ xem tại [`acp/README.md`](acp/README.md).
