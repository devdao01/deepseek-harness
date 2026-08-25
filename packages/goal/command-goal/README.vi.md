# @deepseek-ai/dsh-command-goal

[English](README.md) | Tiếng Việt

Điều khiển `/goal` hướng tới người dùng, được triển khai dựa trên [`ctx.goals`](../goal/README.md). Plugin này đăng ký một lệnh toàn cục thông qua [`ctx.commands`](../../interaction/commands/README.md), nên mọi command adapter đã được lắp ráp đều có thể phát hiện và thực thi nó mà không cần đến lượt model. [Agent Note về lệnh goal của người dùng](../../../.agents/notes/implemented/feature/2026-07-19-human-goal-command.md) chịu trách nhiệm về trải nghiệm người dùng và các quyết định lắp ráp.

## Quy ước lệnh

| Đầu vào | Kết quả |
|---|---|
| `/goal` | Hiển thị mục tiêu hiện tại, phase bền vững, số Round đã đếm／giới hạn, trạng thái bật tiếp diễn cục bộ theo tiến trình và lệnh tiếp theo hợp lệ; goal đang bị chặn còn hiển thị mã chính sách và mô tả, không có goal thì hiển thị cách dùng. |
| `/goal <objective>` | Tạo goal và bật tiếp diễn, hoặc thay thế goal đã hoàn thành bằng một danh tính hoàn toàn mới. Goal chưa hoàn thành sẽ không bao giờ bị thay thế nếu không có clear tường minh. |
| `/goal edit <objective>` | Chỉnh sửa mục tiêu hiện tại mà không thay đổi phase hay trạng thái bật tiếp diễn của nó. Chỉnh sửa một goal đã hoàn thành sẽ tạo ra một active goal mới. |
| `/goal pause` | Tạm dừng active goal, đồng thời tắt tiếp diễn. |
| `/goal resume` | Khôi phục goal đã dừng, hoặc bật lại tiếp diễn cho active goal sau khi session resume／fork; vẫn bị ràng buộc bởi giới hạn Round còn lại. |
| `/goal clear` | Xóa con trỏ hiện tại, đồng thời giữ lại lịch sử bền vững và tombstone của nó. |

Chỉ khi từ điều khiển chiếm trọn đầu vào thì việc so khớp mới không phân biệt chữ hoa/thường. Bất kỳ hậu tố không rỗng nào khác đều thuộc về mục tiêu, do đó `/goal pause after verification` sẽ tạo ra chính mục tiêu theo nghĩa đen đó. Miền goal sẽ loại bỏ khoảng trắng đầu/cuối của mục tiêu và tiến hành xác thực. Vì mặt phẳng lệnh chung không có trình soạn thảo modal hay nguyên thủy xác nhận, `edit` sẽ nhận nội dung thay thế nội tuyến (inline); nếu cố gắng thay thế một goal chưa hoàn thành, hệ thống trả về lỗi trực tiếp, nhắc người dùng thực hiện edit hoặc clear.

Các từ chối miền có thể dự đoán được sẽ trở thành lỗi lệnh trực tiếp ổn định, không lộ ra id hay revision mang kiểu gắn nhãn (branded type). Lỗi triển khai ngoài dự kiến vẫn sẽ reject việc phân phối, cho phép adapter báo cáo nó như một lỗi lệnh. Văn bản và đầu ra lệnh chung vẫn thuộc trạng thái UI thời gian thực; `dsh-goal` ghi lại mỗi thay đổi đã được chấp nhận thông qua sự kiện bền vững `goal/change` của riêng nó.

## Lắp ráp

Bên sản xuất tiêm (inject) `commands` và `goals`. Ứng dụng tùy chỉnh gắn kết chủ sở hữu của chúng cùng plugin này; auto-resume vẫn là một lựa chọn độc lập:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: goal
  name: '@deepseek-ai/dsh-goal'
- id: command-goal
  name: '@deepseek-ai/dsh-command-goal'
```

Cấu hình cơ sở đi kèm của `dsh` bật ngăn xếp goal bền vững và lệnh này; Web client cung cấp adapter tương tác của nó. Ứng dụng tự động hóa ACP (Agent Client Protocol) bật miền và công cụ model, nhưng không gắn command adapter; `goals: false` sẽ loại bỏ ngăn xếp đó. `agent-spine-demo` không có UI phải cấu hình tường minh `goals: {}`, tránh trường hợp bên gọi một lượt duy nhất không có đầu (headless) vô tình chuyển từ một lượt vật lý sang một thao tác gồm nhiều Round.

## Trải nghiệm model

### Điều khiển `/goal` của người dùng

#### Model nhìn thấy gì

Đầu vào slash, thay đổi cũng như đầu ra trạng thái／lỗi trực tiếp không đi vào request của model. Miền goal ghi lại thay đổi dưới dạng `goal/change`; driver cùng session đã được bật có thể phơi bày trạng thái kết quả trong prompt tiếp diễn tiếp theo. Văn bản hiển thị sẽ không bao giờ được ghi vào log.

#### Ảnh hưởng Token

Việc đọc trạng thái, thay đổi goal hoặc nhận lỗi lệnh trực tiếp không làm tăng token của model. Driver cùng session đã được bật có thể làm tăng prompt của Goal Round tiếp theo.

#### Ảnh hưởng KV Cache

Việc khám phá lệnh, thay đổi và đầu ra trực tiếp không ảnh hưởng đến cache. Prompt tiếp diễn tiếp theo tuân theo lịch sử request thông thường của driver.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ tương tác thuần văn bản**: registry lệnh chung không có form chỉnh sửa modal hay callback xác nhận thay thế; edit nội tuyến và clear tường minh giúp giữ ý định phá hủy rõ ràng và nhất quán trên các adapter khác nhau.
- **Không có tham số giới hạn Round theo từng lệnh**: `defaultMaxGoalRounds` vẫn là cấu hình triển khai; khi người dùng yêu cầu trực tiếp, có thể đề nghị model chỉnh sửa `max_goal_rounds` thông qua goal tool được ủy quyền riêng.
- **Không có thành phần trạng thái liên tục**: `/goal` trần là một giao diện quan sát có thể di chuyển được; huy hiệu (badge) riêng cho từng adapter và đầu ra lệnh có thể khôi phục sau khi kết nối lại vẫn là công việc UI trong tương lai.
- **Trong các ứng dụng đi kèm, chỉ Web command adapter sử dụng lệnh này**: các adapter headless, tự động hóa ACP và JSON-RPC không tiêu thụ `ctx.commands`. Nếu bản lắp ráp bao gồm goal tool hướng tới model, prompt thông thường vẫn có thể ủy quyền cho chúng.
