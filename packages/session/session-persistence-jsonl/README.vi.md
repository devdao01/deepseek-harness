# @deepseek-ai/dsh-session-persistence-jsonl

[English](README.md) | Tiếng Việt

Backend lưu trữ session lâu bền dạng JSONL: một triển khai cụ thể của `SessionPersistence` (seam `dsh-session-persistence`). Mỗi session có một log JSONL logic chỉ nối thêm, mặc định lưu dưới dạng `.jsonl.zstd`; khi tắt nén sẽ dùng `.jsonl` gốc.

## Bố cục trên đĩa

```
<root>/
  --<normalized-cwd>--/          # readable project directory (or _no-cwd/)
    <encoded-id>/                # session-owned directory
      session.jsonl.zstd         # default: checksummed header frame + append frames
      session.jsonl              # only with compression: 'none'
```

- Dòng logic đầu tiên là một `SessionHeader` bất biến, đánh dấu `{ type: 'session', version, id, cwd?, createdAt, parentSession?, seedLength?, origin?, delegationDepth, agentPreset? }`. `delegationDepth` là bắt buộc trên đĩa, session cấp cao nhất có giá trị `0`; giá trị thiếu hoặc không hợp lệ sẽ khiến log bị từ chối. `agentPreset` phải được lưu bền vững vì nó quyết định tool và prompt của session được khôi phục — khôi phục thành một cấu thành lắp ráp khác sẽ khiến việc replay lịch sử dựa trên đó mô hình không còn hành động được nữa. Mỗi dòng logic tiếp theo là một bản ghi lưu trữ; sự kiện `assistant/chunk` không bao giờ bị bỏ, và `seq` giữ liên tục trong log đã giải mã (`events[i].seq === i`).
- Bản ghi lưu trữ là `SessionEvent` JSON nguyên trạng, hoặc **dòng phân đoạn được gói (packed chunk)** được ghi khi `packChunks` được bật và một đoạn liên tục đủ điều kiện (`text-chunks` / `reasoning-chunks` / `tool-call-chunks`; giống header `session`, không có dấu gạch chéo, nên tag của dòng không lẫn với loại sự kiện): một dòng lưu ít nhất 3 sự kiện delta `assistant/chunk` liên tục cùng block; `seq0`/`time0` và khoảng cách `dt` của từng thành viên tái tạo chính xác `seq`/`time` của mỗi thành viên. Codec không mất dữ liệu nằm trong `@deepseek-ai/dsh-session` (`packChunkRuns`/`decodeStorageRecord`) và dùng allowlist hình dạng chính xác: mọi nội dung không nhận dạng được sẽ được lưu nguyên trạng. Việc đọc không phụ thuộc vào bố cục: `load` luôn giải mã dòng, nên tệp đã gói, chưa gói và hỗn hợp cho kết quả tải giống nhau.
- Thư mục dự án giữ dạng dễ đọc của cwd đã chuẩn hóa để tiện điều hướng, và giới hạn trong mức trần thành phần hệ thống tệp. Việc thay thế dấu phân tách và cắt bớt cố ý gây mất mát, nên các chuỗi cwd chuẩn hóa giống nhau sẽ dùng chung thư mục dự án; id session vẫn chọn các thư mục session khác nhau. Trên hệ thống tệp không phân biệt hoa thường, việc xác thực chỉ chấp nhận cách viết đường dẫn thay thế khi chuẩn hóa hệ thống tệp phân giải cả hai cách viết về cùng một transcript (bản ghi văn bản). Thư mục gốc cấu hình vẫn do triển khai kiểm soát: có thể là local theo dự án, dùng chung, tạm thời hoặc tập trung. [Quyết định về thư mục session theo dự án](../../../.agents/notes/implemented/architecture/2026-07-24-project-session-directories.md) ghi lại sự đánh đổi này.
- Id session là chuỗi mang nhãn kiểu (branded type) chưa được xác thực, do đó trước khi sử dụng sẽ được escape đơn ánh thành một đoạn đường dẫn an toàn (không có traversal, không xung đột). Thư mục kết quả được dành riêng cho các sản phẩm khác thuộc sở hữu session; việc phát hiện chỉ đọc tên tệp transcript cố định.

## Cấu hình

| Khóa | Kiểu | Mô tả |
|---|---|---|
| `root` | `string` (bắt buộc) | Thư mục gốc cho tất cả tệp session. **Không có giá trị mặc định**: giá trị mặc định `process.cwd()` sẽ thay đổi theo cwd của tiến trình (lệnh gọi bash, tiến trình con), khiến tệp bị phân tán. Thư mục gốc hiện có phải là thư mục đọc được; thư mục gốc bị thiếu sẽ được tạo khi thực thể hóa lần đầu. |
| `packChunks` | `boolean` (mặc định `true`) | Ghi các đoạn delta liên tục đủ điều kiện thành dòng gói (đo được trên các phiên lập trình thực tế cho thấy log logic nhỏ hơn khoảng 60%). Đặt thành `false` để chẩn đoán mỗi sự kiện một dòng; bất kể công tắc phía ghi này thế nào, dòng đã gói vẫn có thể đọc được. |
| `compression` | `'zstd' \| 'none'` | Mặc định `'zstd'`; `'none'` giữ văn bản UTF-8 phân tách bằng dòng mới. |
| `preparedSessionCacheSize` | số nguyên dương (mặc định `5`) | Số lượng session chưa publish tối đa được giữ lại sau khi kiểm tra lịch sử nguội, để tái sử dụng khi khôi phục. |
| `writeBatchMaxDelayMs` | số nguyên dương (mặc định `200`) | Cửa sổ gộp cố định mở ra khi hàng đợi sự kiện hoạt động đang rảnh nhận được sự kiện chờ ghi. Sự kiện sau đó không reset cửa sổ; flush và teardown sẽ bỏ qua nó. Giá trị này không giới hạn event loop, thao tác tuần tự hóa hay độ trễ backend. Giá trị tối đa là mức trần bộ đếm thời gian của Node `2_147_483_647` ms. |

`locate(meta)` trả về `{ kind: 'jsonl', path }` cho transcript cố định bên trong thư mục dự án/session đã giải quyết. Nó không thực hiện I/O hệ thống tệp: có thể trả về đích trước khi thư mục hoặc tệp tồn tại, và tệp hiện có cũng chỉ chứa tiền tố của lần flush hoàn tất gần nhất.

## Mã hóa vật lý

Sản phẩm mặc định là nối tiếp tiêu chuẩn của các [Zstandard frame](../../../.agents/notes/implemented/architecture/2026-07-19-zstandard-jsonl-session-logs.md) độc lập: một frame có checksum chỉ chứa dòng header, theo sau bởi một frame có checksum cho mỗi batch nối thêm lâu bền. Backend dùng API Zstandard tích hợp sẵn của Node và mức nén mặc định, không có công tắc chọn mức nén. Việc liệt kê chỉ đọc và xác thực frame header. `compression: 'none'` giữ nguyên các dòng logic tương tự ở dạng biểu diễn thô.

Một thư mục gốc chỉ thuộc về một kiểu mã hóa. Việc phát hiện khi khởi động và tra cứu định hướng sẽ từ chối suffix ngược lại, lỗi sẽ nêu tên sản phẩm không tương thích và hướng dẫn bên gọi chọn mode khớp hoặc thư mục gốc độc lập. Sản phẩm phẳng `<project>/<id>.jsonl*` cũng sẽ bị từ chối, chứ không bị bỏ qua. Không cung cấp migration, fallback trộn thư mục gốc, hay ghi đúp.

## Ngữ nghĩa lâu bền và phục hồi sau sự cố

- **Danh tính lưu trữ ràng buộc.** Việc tra cứu yêu cầu chỉ có một thư mục session khớp trong thư mục dự án đọc được, sau đó xác thực id header bằng id yêu cầu, và id/cwd của header suy ra đường dẫn transcript đã chọn. Việc liệt kê áp dụng cùng kiểm tra đường dẫn đó và từ chối id trùng lặp. Lỗi danh tính xảy ra trước khi sửa chữa hoặc append.
- **Thực thể hóa trễ.** `create(meta)` không ghi; lần `append` đầu tiên mã hóa header và batch đầu tiên vào tệp tạm và thực hiện `fsync`. POSIX công bố không ghi đè qua hard link, và `fsync` thư mục cha. Windows công bố không ghi đè qua `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)`, và tạo thư mục còn thiếu qua cùng pattern write-through. Session đã tạo nhưng chưa từng append không để lại nội dung trên đĩa, không xuất hiện trong `list`.
- **Chỉ nối thêm.** Sự kiện đã flush không bao giờ bị ghi lại. Batch thô tiếp theo nối thêm dòng; batch nén nối thêm một frame. Cả hai đường đều thực hiện `fsync`, và rollback về độ dài byte trước đó khi bắt được lỗi ghi hoặc đồng bộ.
- **Phục hồi sau sự cố: giữ lại phần đuôi hợp lệ đã hoàn tất.** `load` xác thực từng frame nén hoàn chỉnh và quét JSONL đã giải nén. Khi frame cuối cùng có cấu trúc không hoàn chỉnh, reader giữ lại các bản ghi đã giải mã hoàn chỉnh của nó, cắt từ đầu frame, và mã hóa lại các bản ghi này bằng tool, bước và closer lượt tổng hợp theo yêu cầu của [quy ước lưu trữ lâu bền dùng chung](../../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md). Mode thô cắt từ dòng không hoàn chỉnh đầu tiên. Artifact nén đã tồn tại nhưng không có frame header hoàn chỉnh, lỗi checksum/giải nén trong frame hoàn chỉnh, hoặc lỗi tại hay trước `turn/end` đã commit gần nhất đều là hỏng hóc và sẽ bị từ chối.
- **Kiểm tra không sửa đổi.** `inspect()` trả về view logic bất biến, cân bằng, và có thể tổng hợp closer khôi phục trong bộ nhớ, nhưng không cắt phần đuôi không hoàn chỉnh hay thay đổi revision nhẹ.
- **Seq liên tục.** `append` từ chối batch mà `seq` đầu tiên không tiếp nối log đã lưu, và từ chối `event.data` không thể serialize JSON, đồng thời nêu tên loại sự kiện vi phạm.
- **Revision nhẹ.** `listSnapshots(signal?)` dùng device, inode, size và timestamp nano giây để xác định log, tránh phải parse toàn bộ log; danh tính này thay đổi sau append, sửa chữa, thay thế hoặc thay đổi lưu trữ. Việc đọc tiền tố hoàn chỉnh yêu cầu danh tính nhất quán trước và sau khi đọc byte, `readStoredRevision()` dùng cùng kiểm tra danh tính đó để xác nhận preparation đã giữ lại, mà không tải log. Danh sách snapshot chuyển tiếp nguyên trạng tín hiệu này qua việc phát hiện sản phẩm, và kiểm tra hủy trước và sau mỗi `stat`; vì `stat` hệ thống tệp không thể ngắt giữa chừng, việc hủy sẽ chờ lệnh gọi đang hoạt động hoàn tất, sau đó từ chối mà không khởi động thêm lệnh gọi khác.

## Đường ghi

Plugin sao chép sự kiện session đã đóng băng vào controller riêng của mỗi session đang hoạt động. Sự kiện đang chờ đầu tiên mở cửa sổ batch cố định đã cấu hình, sự kiện sau đó tham gia nhưng không reset deadline. Khi cửa sổ hết hạn, một lần append lưu trữ được khởi động; sự kiện được nhận trong quá trình ghi đó tạo thành một batch tiếp theo độc lập, có giới hạn. `session/flush` hủy chờ và giải phóng batch hiện tại lẫn đang chờ. Con trỏ theo từng session ngăn session sau khi khôi phục append lại sự kiện đã lưu; plugin thiết lập trạng thái ban đầu cho session đang hoạt động khi nạp. Instance backend sở hữu tuần tự hóa thao tác trên một session; dispose (giải phóng tài nguyên) giải phóng từng controller được giữ lại trước khi tháo dỡ. Mỗi sự kiện logic đều được giữ lại: batch chỉ cho phép một frame nén hoặc một lần fsync JSONL thô mang nhiều bản ghi hơn.

## Trải nghiệm mô hình

### Lịch sử hội thoại đã khôi phục

#### Mô hình thấy gì

Lưu trữ JSONL không cung cấp prompt hay schema cho request hiện tại. Việc tải sẽ khôi phục lịch sử bề mặt đã lưu, và giữ lại header request trước đó để tái tạo; loop mới cấu thành envelope hiện tại. Việc khôi phục cân bằng bằng `TOOL_NOT_STARTED` cho các request assistant không có lệnh gọi đã lưu; lệnh gọi đã lưu nhưng không có kết quả sẽ trở thành `TOOL_OUTCOME_UNKNOWN`, yêu cầu mô hình chỉ thử lại công việc chỉ đọc hoặc idempotent, và xác minh tác dụng phụ có thể có hoặc hỏi người dùng. Bản ghi `assistant/chunk` gốc không tạo lại tin nhắn.

#### Ảnh hưởng Token

Request hiện tại không thêm token nào. Agent (tác nhân) đã khôi phục sẽ tiêu tốn token do lịch sử được giữ lại, envelope hiện tại, và văn bản kết quả sửa chữa được thêm dưới dạng tham chiếu trong mỗi lệnh gọi bị gián đoạn.

#### Ảnh hưởng KV Cache

Lưu trữ JSONL không sửa đổi tiền tố request thời gian thực. Chỉ khi lịch sử tái tạo, envelope hiện tại và tuyến mô hình khớp nhau thì loop khôi phục mới tái sử dụng được cache của nhà cung cấp; kết quả sửa chữa sau sự cố chỉ được nối thêm.

## Hạn chế đã biết và công việc hoãn lại

- **Chỉ tải mã hóa đã cấu hình và `SESSION_FORMAT_VERSION` (v0) hiện tại**: thay đổi nén cần thư mục gốc độc lập/mới hoàn toàn, hoặc chọn mode thô cũ; định dạng tiền phát hành không có migration.
- **Bố cục lưu trữ tệp phẳng không tải được**: dùng thư mục gốc độc lập trước khi tải; hoặc di chuyển sản phẩm tiền phát hành vào bố cục thư mục dự án/session.
- **Không thể đọc trực tiếp theo dòng đối với tệp nén**: dùng backend để tải; hoặc chọn `compression: 'none'` trước khi ghi vào thư mục gốc mới, để reader dòng bên ngoài có thể dùng được.
- **Không xóa tệp session**: log tích lũy dưới `root` cho đến khi bị loại bỏ từ bên ngoài (seam không có giao diện xóa).
- **Mỗi session một writer hoạt động**: append và sửa chữa chỉ phối hợp trong instance backend sở hữu. Trước khi chủ sở hữu hoàn tất dispose dừng hẳn hoàn toàn, instance backend hay tiến trình khác không được ghi vào cùng session; việc công bố cùng id lần đầu vẫn giữ an toàn xung đột nhờ hard link không ghi đè POSIX hoặc rename write-through không thay thế của Windows.
- **Thực thể hóa POSIX cần hỗ trợ hard link**: lần append đầu tiên dùng `link()`, khiến race cùng id thất bại thay vì ghi đè log đã commit; Windows dùng rename write-through không thay thế.
