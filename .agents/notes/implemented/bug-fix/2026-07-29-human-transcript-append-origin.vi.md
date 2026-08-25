# Agent Note: Bản chiếu transcript cho người đọc lấy từ các sự kiện gốc append

Status: implemented

[English](2026-07-29-human-transcript-append-origin.md) | Tiếng Việt

## Vấn đề

Cả terminal lẫn cổng lịch sử phía host đều coi surface mà model nhìn thấy là transcript (bản ghi văn bản). Một lần compaction (nén) thành công sẽ thay thế một khoảng surface bằng một nút checkpoint, nên ngay khi phép thay thế đó có hiệu lực, terminal liền vứt bỏ mọi tin nhắn bị nó che khuất — tức những đoạn hội thoại mà người dùng đã đọc — rồi lặp lại quá trình tái dựng phá hủy này mỗi khi có phép thay thế mới. Chính sự nhầm lẫn đó cũng lan sang phân trang: `maxMessages` đếm mọi `user/message` và `assistant/message` trong cửa sổ, thành ra bản sao thay thế chỉ dành cho model lại chiếm mất một suất trang mà con người chưa từng lấp đầy, và điểm cắt còn có thể rơi vào giữa sự kiện `compaction/summary` chỉ-ghi-log của lần nén và phép thay thế tham chiếu tới nó.

Bản thân nhật ký không mất mát nội dung nào. `Session.events` vẫn giữ từng tin nhắn gốc và toàn bộ kết quả công cụ; surface chỉ quyết định nội dung sẽ gửi cho model tiếp theo. Khiếm khuyết nằm hoàn toàn ở lớp chiếu.

## Quyết định

Bản chiếu cho model và bản chiếu cho người đọc là tách biệt, và một sự kiện thuộc loại nào là do chính nhãn của nó quyết định. `dsh-session` xuất trong module `surface` an toàn với trình duyệt hai vị từ `isAppendSurfaceEvent(event)` và `isReplacementSurfaceEvent(event)`, phân chia theo hai biến thể `SurfaceOp`. Sự kiện có gốc append là nguồn bền vững của transcript, còn bản sao thay thế chỉ dành cho model. Mọi phần buộc phải gửi chính xác những gì model nhìn thấy — `deriveMessages`, hạch toán token, backend nén, ghép cặp công cụ, phán định còn sống của context được tiêm vào, bản chiếu tham chiếu liên phiên — đều tiếp tục đọc `session.surface`.

Terminal phát lại transcript từ các sự kiện surface có gốc append, và giữ cho thẻ công cụ của các bước bị che khuất vẫn ghép cặp được thông qua `transcriptToolCallIds`: hàm này đọc các `assistant/message` có gốc append, chứ không đọc quan hệ thành viên của surface. Lần nén đã có hiệu lực sẽ đóng góp một dòng mờ `… earlier context was compacted …` ngay tại vị trí nhật ký của chính nó: dòng đánh dấu này cho biết model không còn nhìn thấy đoạn lịch sử đó kể từ đâu, chứ không xóa nó đi. Payload checkpoint có khung không bao giờ được render, và cả hai lối đi đều phân loại sự kiện surface theo cùng một nhãn, nên một lần nén đến theo thời gian thực và một lần phát lại cùng nhật ký đó sau khi khôi phục sẽ tạo ra transcript giống hệt nhau. Chỉ có phát lại mới suy diễn lại quan hệ ghép cặp của `tool/call`: bản thân sự kiện gọi không mang nhãn, quy thuộc của nó kế thừa từ `assistant/message` đã công bố nó, mà listener thời gian thực thì tất yếu vừa render tin nhắn đó xong.

Checkpoint được nhận diện qua chính quy ước của seam nén — `isCompactCheckpointSource`, tức nhãn không phụ thuộc backend mà `CompactionEngine` yêu cầu tin nhắn người dùng thay thế phải mang — nên terminal dựa vào từ vựng đã được khai báo, chứ không dựa vào hình dạng của phép thay thế. `dsh-session-reference` vốn đã dùng vị từ này để chiếu nhật ký của một phiên khác; ở đây chỉ là thêm một người đọc đặt ra cùng câu hỏi. Các phép thay thế khác giữ im lặng: `tool/result` bị cắt bớt và `assistant/message` được sinh lại chỉ viết lại một nút cho model, chứ không đánh dấu ranh giới nào trong hội thoại.

`session.history` chỉ tính các tin nhắn có gốc append vào `maxMessages`. Mỗi trang vẫn là một khoảng sự kiện gốc liên tục, nên sự kiện `compaction/summary` của lần nén sẽ nằm cùng trang với phép thay thế tham chiếu tới nó.

Sự kiện bền vững, phong bì RPC, giao dịch nén và surface mà model nhìn thấy đều không đổi, và cũng không cần di trú.

## Việc hoãn lại

Client trình duyệt được sửa riêng trong [ghi chú về bản chiếu Web transcript](2026-07-30-web-transcript-log-ordered-projection.md): nó chiếu cùng một transcript gốc append theo thứ tự nhật ký và render một component đánh dấu, đồng thời khép lại lỗ hổng phân trang mà thay đổi lần này mở ra — bởi vì `session.history` không còn tiêu suất cho checkpoint, nó sẽ không bao giờ cắt vào bên trong khối gồm checkpoint và sự kiện nguồn mà checkpoint tham chiếu, thành ra một trang có thể mang theo một checkpoint tham chiếu tới `surfaceOp.start` nằm ngoài cửa sổ, và phép surface fold của trình duyệt sẽ từ chối khoảng đó. Lỗ hổng này có trước thay đổi lần này (trước đây việc đếm vẫn có thể vượt qua checkpoint để đi vào khoảng mà nó che khuất), nhưng khi checkpoint là tin nhắn được đếm cũ nhất, quy tắc phân trang cũ sẽ đặt trọn khoảng bị che khuất vào cùng một trang.

[Quyết định đã lưu trữ về hiển thị tiến độ nén thời gian thực](../../archived/feature/2026-07-30-compaction-progress-visibility.md) của terminal dùng các sự kiện trong một cặp nhãn độc lập để điều khiển chỉ báo một ô hiện có. Nó không thay đổi nhãn hoàn tất mà tài liệu này phụ trách, cũng không bổ sung thông tin quy mô: `sourceEventSeqs` của checkpoint vẫn có sẵn cho việc đếm hoặc lấy khoảng nếu được lập luận riêng. Vì vậy, việc hiển thị tiến độ không cần sửa nội dung nhãn, cũng không lấy việc tách `renderReplacement(event)` làm tiền đề.

## Các phương án từng cân nhắc

**Nhận diện checkpoint theo hình dạng (một `user/message` kiểu thay thế).** Bị bác bỏ: cách đó đọc một sự trùng hợp của bên sản xuất hiện tại chứ không phải quy ước đã khai báo, và về sau bất kỳ bên sản xuất nào thay thế một khoảng bằng tin nhắn người dùng cũng sẽ âm thầm kế thừa nhãn nén. Seam đã công bố `COMPACT_CHECKPOINT_SOURCE` chính là để bên tiêu thụ nhận diện checkpoint mà không phụ thuộc backend.

**Tiếp tục render checkpoint dưới dạng thẻ context được tiêm vào.** Bị bác bỏ: checkpoint có khung là phong bì chỉ dẫn viết cho model, không phải nội dung hội thoại của con người. Trưng nó ra mà lại giấu đi phần lịch sử nó thay thế thì đúng là làm ngược nhu cầu của người đọc.

**Lưu bền vững một transcript thứ hai dùng để hiển thị.** Bị bác bỏ: nhật ký chỉ-ghi-thêm vốn đã chứa nguyên liệu nguồn có thẩm quyền, một transcript song song chẳng đổi lại được gì mà còn tăng thêm công việc di trú và giữ nhất quán.

**Suy ra nhãn từ cặp ngoặc `compaction/*` thay vì từ checkpoint.** Bị bác bỏ xét trên phương diện transcript: cặp ngoặc là hai mốc thời gian bao quanh một thao tác, còn transcript cần vị trí surface thực sự thay đổi. Cặp ngoặc phù hợp làm nguồn cho tiến độ và thời lượng, mà thay đổi lần này không render những thứ đó.

**Gập lại nhật ký để phân loại sự kiện (`current`／`shadowed`／`log-only`) như cách `session-query` làm cho tìm kiếm.** Bị bác bỏ: phép gập trả lời câu hỏi về toàn bộ nhật ký, còn bản chiếu đặt câu hỏi theo từng sự kiện, mà nhãn của chính sự kiện đã trả lời được trong thời gian hằng số.

## Hệ quả

Nén không còn xóa sạch lịch sử terminal; phiên bị nén nhiều lần sẽ hiển thị theo thứ tự nhật ký một dòng đánh dấu ứng với mỗi lần nén có hiệu lực. Mỗi trang phân trang có thể mang nhiều sự kiện gốc hơn trước, vì suất chỉ tiêu tốn cho những tin nhắn do con người hoặc model thực sự tạo ra.

`rebuildTranscript` nay hiện thực hóa một component cho mỗi sự kiện gốc append trong toàn bộ nhật ký, và chạy khi mount, khi bảng màu terminal thay đổi, cũng như mỗi lần bật/tắt reasoning (suy luận). Trước đây, nén vốn giới hạn khối lượng công việc này đúng cho những phiên dài mà nén phục vụ, nên chi phí này giờ tăng theo độ dài phiên chứ không còn tăng theo surface. Đây chính là đánh đổi mà bản sửa lần này chấp nhận — giữ lại lịch sử mới là mục đích — nhưng chiến lược cửa sổ hóa hay tái sử dụng thuộc về người đầu tiên thực sự đo được việc tái dựng chậm đi, chứ không thuộc về một người phân tích hiệu năng nào đó về sau thắc mắc vì sao khối lượng công việc lại tăng.

`dsh-tui` thêm một phụ thuộc vào seam `dsh-compaction` chỉ vì một vị từ thuần khiết, nhất quán với cách dùng sẵn có của `dsh-session-reference`. Ở thời điểm chạy, terminal vẫn không cần bất kỳ backend nén nào.

Hai hành vi thay đổi cùng với test của chúng. Test terminal về phép thay thế bề mặt trước đây ghim vào việc xóa bỏ («ẩn lời gọi công cụ bị che khuất»), nay ghim vào việc giữ lại cộng đúng một dòng đánh dấu, trong đó bản sao kết quả bị cắt bớt, tin nhắn assistant được sinh lại và các phép thay thế đến từ plugin khác đều không render gì cả. Kịch bản snapshot của nén trước đây tuyên bố ghim vào nén, nhưng lại ghi nguồn `agent-instructions`; nay nó ghi nguồn checkpoint thật, và ghi lại ba fixture (dữ liệu chuẩn bị cho test) để hiển thị các prompt được giữ lại, thẻ công cụ đầy đủ và dòng đánh dấu đó.

Tính tương đương thời-gian-thực／phát-lại nói trên được ghim bằng fixture chứ không chỉ được khẳng định ở đây: `surface-replayed-compaction` có sẵn phép thay thế ngay khi mount, và kết quả ghi lại của nó giống hệt từng byte với `surface-after-compaction-wide` của lối đi thời gian thực. Sửa một trong hai lối đi sẽ phá vỡ đẳng thức này — và đó chính là điểm mấu chốt: bản chiếu khi phát lại mới là phần đã gây hồi quy cho người dùng lúc đầu, hai fixture phải thay đổi cùng nhau.
