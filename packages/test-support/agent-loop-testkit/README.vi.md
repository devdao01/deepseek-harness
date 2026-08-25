# `@deepseek-ai/dsh-agent-loop-testkit`

[English](README.md) | 中文

Chia sẻ các phụ thuộc tiên quyết cần mount cho các test chạy `AgentLoop` cụ thể. `mountAgentLoopTestDependencies(ctx, options?)` cài đặt dịch vụ LLM (mô hình ngôn ngữ lớn), session, system prompt, tool và agent (agent thông minh) theo đúng thứ tự phụ thuộc, rồi trả về trước khi agent loop được mount.

Bên gọi đăng ký adapter và plugin tùy chọn, mount `AgentLoop` bằng cấu hình đang kiểm thử, và dispose (giải phóng tài nguyên) Context của riêng mình. Cấu hình system prompt và registry tool có thể chuyển tiếp qua `options`; hàm hỗ trợ này không cung cấp giá trị mặc định kiểm thử nào vượt quá giá trị mặc định vốn có của dịch vụ. Nếu plugin nạp thất bại, lời gọi hàm hỗ trợ sẽ bị reject, còn các dịch vụ đã kích hoạt trước đó theo thứ tự vẫn thuộc sở hữu của Context bên gọi.

```ts
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'

const ctx = new Context()

await mountAgentLoopTestDependencies(ctx)
// Register the test adapter and any optional plugins here.
await ctx.plugin(AgentLoop, { agents: [] })
```

Các test nhắm vào lỗi injection, topology từng phần, thứ tự nạp dịch vụ hoặc dọn dẹp dịch vụ sẽ tự mount phụ thuộc của mình trực tiếp, không dùng hàm hỗ trợ này.

## Trải nghiệm model

Không có. Công cụ hỗ trợ lắp ráp chuyên dụng cho kiểm thử này không điều khiển cũng không sửa đổi request model.

#### Ảnh hưởng KV Cache

Không có; gói này không lắp ráp cũng không gửi request tới provider.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ chia sẻ phần thân tiên quyết cần thiết**: adapter, plugin tùy chọn, `AgentLoop`, agent và việc dọn dẹp Context vẫn do bên gọi chịu trách nhiệm, để thứ tự mount đặc thù cho từng scenario luôn rõ ràng.
