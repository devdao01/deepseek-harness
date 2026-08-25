# @deepseek-ai/dsh-session-projection-cache

[English](README.md) | Tiếng Việt

Cache projection lâu bền (`ctx.sessionProjectionCache`): lưu bền vững trạng thái của mỗi đơn vị projection đã đăng ký thành checkpoint, mỗi session một bản ghi dựa trên hình thái dữ liệu domain (domain data form) (domain `session_projcache` — backend JSON mặc định đặt bản ghi này dưới thư mục gốc lưu trữ đã cấu hình, cạnh `workspace.json`). Nguồn thẩm quyền thiết kế: [RFC session-projection](../../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md) (phần persisted projection cache).

Một dòng lưu trữ `(key → {ver, seq, val})` là lối tắt gấp gọn, không bao giờ là nguồn thẩm quyền: có thể lỗi thời (`seq` nói chính xác lỗi thời đến mức nào), nhưng không bao giờ sai. Việc triển khai cam kết dựa trên điều này:

- **Mọi lần ghi ở background đều fail-soft.** Ghi lâu bền thất bại chỉ ghi một cảnh báo và giữ cache ở trạng thái lỗi thời; lần ghi kế tiếp hoặc lần đọc nguội tiếp theo sẽ tự phục hồi. Cái giá của việc sự cố xảy ra giữa hai lần ghi là phải replay đuôi dài hơn, không bao giờ là giá trị sai.
- **`ver` không khớp `stateVersion` của đơn vị đang chạy hiện tại thì bị bỏ, không bao giờ migrate.** Đơn vị tăng phiên bản sẽ làm dòng của nó vô hiệu khi đọc; key đó được gấp lại từ log.
- **Ghi toàn bộ bản ghi.** Mỗi lần ghi thay thế toàn bộ checkpoint của session đó (mặt cắt registry luôn là hoàn chỉnh), và đi qua ranh giới JSON không mất dữ liệu — trạng thái đơn vị vi phạm quy ước JSON thuần sẽ thất bại rõ ràng và báo lỗi.
- **Bản ghi gắn với vòng đời log, không chỉ với id.** Mỗi bản ghi lưu danh tính header nguồn gấp lại của nó (`createdAt`, `cwd`); mỗi lần đọc xác thực nó bằng header đang hoạt động hoặc header đã lưu làm bằng chứng trước khi chấp nhận bất kỳ dòng nào — id bị xóa rồi dựng lại, hoặc cache còn sống trong khi lưu trữ lâu bền đã bị thay, sẽ khiến bản ghi không liên quan bị bỏ toàn bộ, không bao giờ gieo giá trị ảo.
- **Log đi trước, cache theo sau.** Checkpoint của session đang hoạt động flush sự kiện đệm lâu bền trước, dòng cache mới hạ cánh, do đó sự cố chỉ khiến cache tụt sau log (đuôi replay dài hơn), không bao giờ đi trước nó.

## Chiến lược ghi

Hai điểm ghi bắt buộc, với việc điều tiết ở giữa:

| Kích hoạt | Tính chất |
|---|---|
| `turn/end` | Bắt buộc ghi — đọc nguội cần chính giá trị cuối lượt. |
| Giải phóng session (detach) | Bắt buộc ghi — thời điểm live chuyển sang cold; sau đó bậc đọc nguội tiếp quản session này. |
| Tích lũy `writeEveryEvents` sự kiện đã commit | Điều tiết cấu hình (theo số lượng). |
| Cách sự kiện bẩn đầu tiên `writeIntervalMs` mili giây | Điều tiết cấu hình (theo khoảng thời gian). |

Cả hai trường `Config` đều bắt buộc (không có giá trị mặc định): nhịp độ ghi là lựa chọn triển khai, không có giá trị đúng phổ quát, phải khai báo rõ trong cordis.yml.

## Đọc danh sách (`cachedSnapshot(meta)`)

Bậc không I/O: view giá trị đầy đủ trực tiếp từ bản ghi lưu trữ khớp danh tính (chỉ các key khớp phiên bản), trả về dưới dạng mặt cắt `{asOfSeq, values}` — `asOfSeq` lấy mực nước thấp nhất trong các dòng được phục vụ, khi client gieo giá trị vào kho lưu trữ dưới quy tắc higher-seq-wins, khối danh sách lỗi thời sẽ không bao giờ đè lên frame đẩy mới hơn. Khi không có bản ghi khả dụng (id không xác định, vòng đời không liên quan, không có dòng khớp phiên bản) sẽ trả về `undefined`; carrier danh sách api-proxy chuyển thành sự vắng mặt của cột.

## Đọc nguội (`coldSnapshot(id, signal?)`)

Bậc đọc, đường đi bình thường không cần tải toàn bộ log: dòng cache → `sessionProjections.restoreFloor` (neo tại vị trí trước một sự kiện so với mực nước thấp nhất khả dụng) → `readFrom(id, floor)` lâu bền → `sessionProjections.restore` → ghi lại fail-soft dòng đã làm mới. Điểm neo này khiến log bị rút ngắn (do cắt bớt khi sửa chữa sự cố) có thể được chứng minh: dòng ngoài phạm vi sẽ kích hoạt đúng một lần đọc lại toàn bộ từ seq 0, thay vì phục vụ giá trị ma như thể là giá trị hiện tại. Khi không có đơn vị nào đã đăng ký, phục vụ trực tiếp `{asOfSeq: -1, values: {}}`, không chạm vào lưu trữ lâu bền; session không có log lâu bền bị seam từ chối với `not found`.

`write(session)` là mặt cắt checkpoint đồng bộ dùng chung cho hai điểm ghi bắt buộc; carrier có thể gọi trực tiếp (không fail-soft — việc ngăn chặn do lớp bọc fail-soft đảm nhiệm).

## Cấu thành

```yaml
- id: session-projection-cache
  name: '@deepseek-ai/dsh-session-projection-cache'
  config:
    writeEveryEvents: 200
    writeIntervalMs: 5000
```

Inject `storageDomain`, `sessionProjections`, `sessionPersistence`, `sessions`. Không có dòng này, hệ thống projection chỉ chạy live (cache mực nước; đọc nguội quay về tải toàn bộ log tại carrier đã triển khai nó).

## Trải nghiệm mô hình

Không có, vì cache chỉ lưu bền vững và khôi phục read model phía host, được suy ra từ trạng thái session đã ghi vào log, không chạm vào bất kỳ prompt, tin nhắn, schema, luồng hay kết quả tool nào.

#### Ảnh hưởng KV Cache

Không có; cache không bao giờ cấu thành hay gửi request cho nhà cung cấp.

## Hạn chế đã biết và công việc hoãn lại

- **Không cung cấp giao diện đào thải hay giữ lại**: bản ghi sẽ tích lũy liên tục theo từng session; dọn dẹp checkpoint đã lưu là bảo trì ngoài băng thông, dùng cùng chiến lược với lưu trữ session lâu bền.
- **Việc điều tiết theo khoảng thời gian dùng kiểm soát thô theo từng session**: sau khi một lần ghi không có dữ liệu bẩn hoàn tất, bộ đếm thời gian sẽ khởi động khi sự kiện bẩn đầu tiên đến; với luồng sự kiện liên tục nhưng chưa đạt ngưỡng số lượng, hệ thống ghi một lần mỗi khoảng thời gian, không dùng cửa sổ trượt.
- **Việc đọc `coldSnapshot` không khử trùng lặp** — hai lần đọc nguội đồng thời trên cùng session sẽ mỗi lần chạy cả bậc đọc; lần ghi lại cuối cùng thắng (dòng tương đương), chấp nhận được với tần suất gọi ở cấp danh sách.
