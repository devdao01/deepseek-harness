# Agent Note: Tách việc chèn context khỏi việc thực thi lượt

Status: implemented

[English](2026-07-24-separate-context-injection-from-turn-execution.md) | Tiếng Việt

## Vấn đề

API agent (tác tử) từng biểu diễn phần đầu vào bổ sung hướng tới model theo ba cách chồng lấn nhau: bên gọi đính kèm `HookContext[]` qua `SendOptions.contexts`, hook chặn và hook tool trả về `additionalContexts`, còn plugin thì gọi `agent.inject()`. Các đường đi này rốt cuộc đều ghi context vào cùng một lịch sử model, nhưng mỗi đường lại mang theo quy tắc riêng về vị trí đặt, metadata, việc thu nhận, hàng đợi và vòng đời của lượt.

Sau khi context được đính kèm nguyên tử vào thông điệp trong inbox, agent loop (vòng lặp tác tử) từng buộc phải để context đi theo trọn vòng đời gồm thu nhận prompt, chuyển đổi steering (dẫn dắt giữa chừng), huỷ và loại bỏ khi kết thúc. Cách đặt `prompt-prefix` lại từng gộp context với prompt trực tiếp thành một sự kiện, nên bên tiêu thụ transcript (bản ghi văn bản) buộc phải dựa vào lớp bao mà model không nhìn thấy mới khôi phục được đầu vào thực tế của người dùng. Như vậy, mục outbox, phép chiếu session và phát lại UI đều từng phải xử lý phần phân biệt lẽ ra thuộc trách nhiệm bên sản xuất.

`inject()` ở trạng thái rảnh còn phơi bày một chỗ lệch ngữ nghĩa khác. Lúc đó việc chèn không yêu cầu model thực thi, nhưng phần cài đặt vẫn mở rồi đóng một lượt `injection` không có bước nào, chỉ để thoả mãn bất biến đóng kín lượt và có được điểm kiểm tra tính bền vững. Thành ra, lượt khi ấy đôi lúc có nghĩa là "chạy agent loop", đôi lúc lại có nghĩa là "không chạy agent, chỉ lưu context".

Tên gọi `HookContext` cũng mô tả bên sản xuất chứ không mô tả trách nhiệm của giá trị đó. Nó có thể đến từ plugin nguyên bản, cầu nối hook, khâu thu nhận prompt hay khâu hậu xử lý tool; ý nghĩa ổn định của nó là context bổ sung hướng tới model, và source sẽ chỉ rõ bên sản xuất.

## Quyết định

`inject()` là thao tác duy nhất để bên gọi giao đầu vào model bổ sung, còn một lượt biểu thị một lần thực thi vòng lặp model.

Bên gọi sở hữu context giao `UserMessage` có định danh và đã đóng băng qua `inject()`, rồi dùng `followup()` hoặc `steer()` một cách độc lập để gửi thông điệp trực tiếp.

Nhánh enter của pre-step trả về trọn lô `PreStepDecision.messages` cho request đang được chốt lại. Các điểm mở rộng tool vẫn có thể trả về `additionalContexts`, và những context này chỉ vào inbox next-step sau kết quả tool tương ứng. Các giá trị này là đầu ra của điểm mở rộng, chứ không phải phần đính kèm được lấy từ mục inbox của bên gọi.

Mỗi context bổ sung là một `UserMessage` độc lập, có `source` chỉ rõ bên sản xuất và mang theo các trường dành riêng cho bên sản xuất. Việc chèn vào inbox được lưu ngay lập tức; khâu thu nhận về sau sẽ ghi chính giá trị đó thành `user/message`. Không còn `context/message`, cách đặt prompt-prefix, dấu phân tách request ổn định hay lớp bao prompt. Bên tiêu thụ transcript và UI phân biệt thông điệp người dùng trực tiếp với context được chèn thông qua `source`.

## Vòng đời của việc chèn

`inject()` luôn chèn context vào inbox `next-step` vốn không đánh thức, và gửi thay đổi hàng đợi đó bằng `agent/inbox/spliced`. Driver đang chạy sẽ nhận nó tại ranh giới pre-step kế tiếp gần nhất. Driver ở trạng thái idle sẽ giữ nó ở dạng chờ xử lý cho tới khi `followup()` hoặc `steer()` cung cấp công việc có khả năng đánh thức; trước đó, việc huỷ hoặc dispose (giải phóng tài nguyên) có thể loại bỏ nó, nhưng không xoá lịch sử hàng đợi đã lưu.

Vòng lặp nhận lô next-step hiện tại trước, rồi mới chạy `agent/pre-step`, nên phần chèn đến sau khi đã nhận có thể không kịp vào request đang được chốt lại, mà sẽ được nhận ở ranh giới kế tiếp. Các thông điệp do enter decision trả về sẽ được ghi thêm trong phạm vi lượt sở hữu chúng, trước request tiêu thụ chúng. Do đó, context sinh ra trong lúc trợ lý gọi lô tool chỉ xuất hiện sau toàn bộ kết quả có thứ tự của lô đó.

Nếu pre-step reject hoặc ném lỗi, thì phần context đã chèn mà nó đã nhận, phần steering và prompt đã xếp hàng đều giữ nguyên trạng thái đã bị xoá, và lô trả về cũng không được ghi thêm. Các thông điệp được chèn sau lần nhận nguyên tử không bị ảnh hưởng và vẫn tiếp tục chờ xử lý.

Agent loop chỉ ghi thêm `user/message` được chèn từ lô của bước bắt đầu trong phạm vi lượt. Sự kiện thực thi lõi, steering, đầu ra trợ lý và sự kiện tool vẫn chịu ràng buộc của ranh giới lượt; quan hệ giữa các sự kiện mở rộng có thể hợp nhất do plugin khai báo chúng sở hữu, chứ không dùng quy tắc mặc định của phần lõi.

## Điểm mở rộng và ngữ nghĩa phía bên gọi

`PreStepDecision.messages` ở nhánh enter là trọn lô của bước được đề xuất. Khi listener waterfall (sự kiện kiểu thác nước) gọi `next()` để uỷ quyền, các thông điệp phía dưới sẽ được giữ lại trừ khi bị thay thế có chủ ý; thông điệp thêm mới tuân theo thứ tự trả về tự nhiên của waterfall. `additionalContexts` của kết quả tool giữ nguyên thứ tự FIFO và source của từng thông điệp.

Việc bên gọi chủ động chèn và context của bước hiện tại có thời điểm khác nhau một cách có chủ ý. `inject()` sẽ gia nhập pre-step khả dụng kế tiếp, không đảm bảo rằng request đang được chốt lại sẽ tiêu thụ nó. Listener buộc phải tác động tới request đó thì trả về context trong `PreStepDecision.messages`; khi phía dưới reject hoặc thất bại, context đó sẽ không vào log.

Việc tham chiếu chéo session dùng cách kết hợp theo lĩnh vực như sau: TUI chuẩn bị snapshot trước, rồi trả snapshot cùng với thông điệp đó trong pre-step của một thông điệp trực tiếp lúc idle, hoặc trong lượt đang chạy thì chèn snapshot trước rồi mới đánh thức steering. Log đích chứa hai thông điệp đơn giản, nên các thay đổi về sau ở session nguồn sẽ không làm đổi phần phát lại, và bên tiêu thụ transcript cũng không cần lớp bao prompt. Quyết định này thay thế cơ chế đính kèm trong [quyết định tham chiếu chéo session](../feature/2026-07-21-cross-session-references.md), nhưng giữ lại các quy tắc về snapshot và ranh giới tin cậy của nó.

Quyết định này giữ lại nguyên tắc để bên gọi quyết định khung nội dung được xác lập trong [gỡ bỏ lớp bao nội dung được chèn](../simplification/2026-07-20-unwrap-injected-content-envelopes.md), cùng quy tắc một lượt một mục được xác lập trong [một send, một lượt](../simplification/2026-07-17-one-send-one-turn.md). [Quyết định về sự kiện chỉ ghi log độc lập](../simplification/2026-07-28-remove-synthetic-log-only-turns.md) về sau áp dụng chính ngữ nghĩa "lượt chỉ biểu thị việc thực thi" đó cho các bản ghi do plugin sở hữu.

## Các phương án từng cân nhắc

**Giữ `SendOptions.contexts` làm phần đính kèm nguyên tử.** Khi khâu thu nhận prompt chặn thông điệp, cách này giữ được kiểu giao "được ăn cả ngã về không", nhưng cũng khiến context tiếp tục là một phần trạng thái vòng đời của inbox, và buộc mọi lần chuyển đổi hàng đợi cùng sự kiện quan sát phải mang theo nó. Phần lớn bên gọi đều có thể diễn đạt nhu cầu của mình bằng cách chèn context trước rồi giao thông điệp sau, nên API agent chung không nên nhúng sẵn giao dịch theo lĩnh vực.

**Giữ sự kiện session `context/message` riêng.** Đầu vào vai trò user hướng tới model sẽ lại có hai loại sự kiện được chiếu hoàn toàn giống nhau. `user/message.source` đã đủ cung cấp phần phân biệt mà bên tiêu thụ chính sách, transcript và phát lại cần.

**Giữ một lượt dùng một lần cho việc chèn lúc rảnh.** Việc chèn vào inbox bền vững vốn đã ghi được context lúc rảnh mà không cần mở lượt. Lượt tổng hợp sẽ khiến bộ đếm lượt và bên quan sát báo cáo phần công việc chưa từng chạy model; context không đánh thức sẽ tiếp tục chờ xử lý cho tới khi có công việc thật sự có khả năng đánh thức cung cấp một request.

**Giữ cách đặt tuỳ chọn `prompt-prefix`.** Việc nướng sẵn tiền tố cho phép context và request nằm trong cùng một thông điệp của provider, nhưng nó tạo ra cách biểu diễn thứ hai cho prompt trực tiếp, và làm việc xử lý vị trí đặt lan ra khắp mã thu nhận, steering, ghi log, phát lại và UI. Bên sản xuất cần khung văn bản có thể ghi thẳng nó vào nội dung context của chính mình.

**Để hook prompt gọi `inject()` thay vì trả về thông điệp.** Phần chèn có thể không kịp vào request mà prompt đang được chốt lại, đồng thời cũng thoát khỏi việc phía dưới chặn decision đó. Việc trả về trọn lô thông điệp giúp context của request hiện tại tiếp tục chịu ràng buộc của waterfall.

## Kiểm chứng

- Bản ghi đầu vào được giao và inbox steering không chứa context bổ sung; `agent/inbox/inserted` chỉ báo cáo thông điệp được chèn, và danh sách đích do splice bền vững giữ lại.
- `UserMessage` là hình dạng có định danh và đã đóng băng được dùng chung bởi khâu chặn prompt, thực thi tool, cầu nối hook, guard và bên sản xuất context.
- Cách đặt prompt-prefix, lớp bao prompt và `context/message` đều không tồn tại trong kiểu công khai, sự kiện bền vững, phép chiếu và phát lại UI.
- `inject()` ở trạng thái idle sẽ ghi thêm ngay một bản ghi chèn inbox bền vững, nhưng không ghi thêm `user/message` mà model nhìn thấy được; việc giao có khả năng đánh thức về sau có thể bắt đầu quá trình xử lý pre-step.
- Phần chèn trong lượt đang hoạt động sẽ được nhận ở ranh giới pre-step kế tiếp gần nhất, và nằm sau trọn lô kết quả tool, trước request tiêu thụ nó.
- Pre-step reject hoặc thất bại sẽ loại bỏ lô mà nó đã nhận; đầu vào được chèn sau lần nhận thì tiếp tục chờ xử lý.
- Test đơn vị, test lưu trữ và resume, test bất biến cùng phần bao phủ TUI cố định thứ tự sự kiện, quyền sở hữu việc nhận và phát lại bền vững.

## Hệ quả

- Phần chèn lúc idle chỉ trở nên nhìn thấy được với model sau khi một pre-step về sau tiếp nhận nó, và có thể bị huỷ hoặc dispose loại bỏ, trong khi vòng đời inbox bền vững của nó vẫn giữ lại bản ghi.
- Hai thông điệp vai trò user liên tiếp thay thế cho một thông điệp prompt đã nướng sẵn; adapter của provider sẽ giữ nguyên thứ tự này.
- Context buộc phải tác động tới request hiện tại thì phải được trả về từ `agent/pre-step`; phần chèn thông thường chỉ hỗ trợ giao tại ranh giới kế tiếp gần nhất.
- Giao ước giao nhận công khai và bản ghi inbox giữ được sự tinh gọn: không có phần đính kèm context, metadata vị trí đặt context, lớp bao prompt hay loại sự kiện bền vững trùng lặp.
