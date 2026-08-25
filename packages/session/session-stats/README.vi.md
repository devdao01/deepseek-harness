# @deepseek-ai/dsh-session-stats

[English](README.md) | Tiếng Việt

Function plugin đăng ký đơn vị projection `sessionStats`: gấp lại các con số session cho toàn bộ log — số lượt/bước, cùng thời gian đồng hồ tường của LLM, tool, token đầu tiên, decode — từ ranh giới bước, chunk streaming, ghép đôi tool và tin nhắn assistant đã lắp ráp, cung cấp ra ngoài qua seam session-projection (snapshot registry, luồng thay đổi, và mọi carrier projection: trang đuôi history, frame đẩy `session/projection`, dòng danh sách session). Client dựa vào đó để render các con số toàn session mà phân trang và nén (compaction) đều không thể làm thay đổi; bên tiêu thụ tham chiếu là thanh thống kê chat của Web, việc gấp lại theo cửa sổ của nó dùng cùng tên trường để làm fallback khi không có đơn vị.

## Ngữ nghĩa gấp lại

- `steps` đếm sự kiện `step/end`. Agent loop thêm đúng một sự kiện trong `finally` cho mỗi bước đi vào, do đó bước hoàn thành, thất bại, bị hủy, max-tokens đều được tính. Nếu đổi sang đếm theo tin nhắn assistant đã lắp ráp thì sẽ đếm thừa tin nhắn usage host của max-tokens (nội dung rỗng, bị loại khỏi surface), và đếm thiếu bước bị hủy (bị dừng trước khi lắp ráp tin nhắn).
- `turns` đếm số turn khác nhau có ít nhất một bước đã đóng; lượt bị từ chối hoặc lượt rỗng (đóng mà chưa vào bước nào) không tính. Số turn do host cấp phát, tăng đơn điệu theo session, nên việc gấp lại chỉ cần giữ turn được tính gần nhất.
- `llmMs` cộng dồn theo bước từ `step/start` → `assistant/message` (bước lắp ráp ra tin nhắn; việc chờ thử lại trong bước cũng tính vào thời gian mô hình, giống việc gấp lại theo cửa sổ).
- `ttftMs`/`ttftSteps` cộng dồn và đếm từ `step/start` → chunk delta không rỗng đầu tiên; ranh giới của lần thử đầu tiên được giữ lại sau `llm/retry` trong bước (khớp với `resetForRetry` của cửa sổ).
- `decodeMs`/`decodeTokens` cộng dồn thời gian từ token đầu tiên → tin nhắn đã lắp ráp và số token output do nhà cung cấp báo cáo, chỉ tính bước có cả hai.
- `toolMs` cộng dồn theo cặp callId từ `tool/call` → `tool/result`; lệnh gọi chưa giải quyết bị bỏ khi `turn/end` (kết quả luôn hạ cánh trong lượt của nó).
- Mỗi trường bằng 0 trước sự kiện đóng góp đầu tiên. Registry đã lắp ráp luôn cung cấp key đó, client đọc chính giá trị, không phải sự tồn tại của key.

## Cấu thành

```yaml
- id: session-stats
  name: '@deepseek-ai/dsh-session-stats'
```

Inject `sessionProjections` — đó là toàn bộ công dụng của plugin; trong cấu thành không có registry, fiber giữ ở trạng thái treo, không đăng ký gì cả.

## Trải nghiệm mô hình

Không có, vì plugin chỉ tính toán read model hướng tới client, suy ra từ sự kiện session đã ghi vào log, không chạm vào bất kỳ prompt, tin nhắn, schema, luồng hay kết quả tool nào.

#### Ảnh hưởng KV Cache

Không có; plugin không bao giờ cấu thành hay gửi request cho nhà cung cấp.

## Hạn chế đã biết và công việc hoãn lại

- **Số bước đếm công việc đã xảy ra, không phải output hiển thị** — bước thất bại trước khi tạo ra bất kỳ nội dung hiển thị nào vẫn đóng bằng `step/end` và được tính; bước bị sự cố làm gián đoạn được tính sau khi session được tải lại, lúc đó việc phục hồi sự cố sẽ bù thêm `step/end` tổng hợp cho nó (`interruptedTurnClosers` của dsh-session).
- **Bước bị hủy được đếm nhưng không được tính thời gian** — không lắp ráp ra tin nhắn assistant, thời gian streaming một phần của nó không đi vào bất kỳ con số đồng hồ tường nào, khớp với node interrupted không tính thời gian của việc gấp lại theo cửa sổ; ngược lại, tin nhắn usage host của max-tokens đóng góp thời gian mô hình mà surface không nhìn thấy.
- **Số đếm theo khẩu độ log, không phải khẩu độ surface** — bước có tin nhắn sau này bị nén vẫn được tính; con số mô tả toàn bộ session, không phải surface hiển thị hiện tại của mô hình.
- **Chỉ gắn ở web-app bundle** — cấu thành khác không cung cấp key `sessionStats`, bên tiêu thụ của nó quay về đếm theo khẩu độ cửa sổ (đường fallback của thanh thống kê Web).
