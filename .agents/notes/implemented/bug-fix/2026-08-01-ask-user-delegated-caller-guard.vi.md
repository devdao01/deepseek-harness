# Agent Note: Từ chối cho subagent thuộc quyền sở hữu của agent khác trong runtime khởi phát tương tác với con người

Status: implemented

[English](2026-08-01-ask-user-delegated-caller-guard.md) | Tiếng Việt

## Vấn đề

Khi một subagent dùng một lần gọi `ask_user_question`, lời gọi đó có thể chặn vô hạn. Nó chờ con người trả lời, nhưng agent con không có kênh tương tác với con người do chính nó sở hữu độc lập, nên agent con không thể hoàn thành, và agent cha đang chờ nó hoàn thành cũng bị đình trệ theo.

Phả hệ session được lưu bền vững không cho biết bên trả lời có tồn tại hay không. Session con sau này có thể được khôi phục thành một gốc runtime cấp cao mới, còn một agent con đang sống mà thuộc quyền sở hữu của agent khác trong runtime lại có thể có độ sâu ủy quyền được lưu bằng không hoặc bị thiếu. Chỉ dẫn lỗi trên seam dùng chung còn phải áp dụng được cho mọi bên tiêu thụ: `exit_plan_mode` dùng `ctx.userQuestions.ask()` nhưng không gọi `ask_user_question`.

## Quyết định

Nếu `AskUserQuestionRequest.agent` tồn tại, `UserQuestionService.ask()` sẽ thông qua `ctx.agents` kiểm chứng rằng agent đó đúng là một thực thể đang sống trong registry, và chỉ cho phép lời gọi khi `ctx.agents.roots()` chứa thực thể ấy. Khi thiếu registry hoặc khi truyền vào một đối tượng cũ chỉ trùng id, sẽ thất bại với `CALLER_NOT_LIVE`; khi một agent đang sống thuộc quyền sở hữu của một agent đang sống khác, sẽ thất bại với `DELEGATED_CALLER`. Bước kiểm tra này nằm sau các guard đã có về trạng thái đã hủy và lô rỗng, và nằm trước bước kiểm tra ý định hay việc phân phối tới provider, nên agent con thuộc quyền sở hữu của agent khác sẽ không bao giờ kích hoạt một lần chờ trên UI.

Lấy quyền sở hữu trong runtime làm căn cứ phân quyền. Session mang phả hệ mà được khôi phục trong tình trạng không có chủ sở hữu thì chính là gốc runtime và được phép hỏi; agent con đang sống thì không đủ tư cách hỏi, kể cả khi `delegationDepth` được lưu bằng không. Các lời gọi lập trình không kèm agent tiếp tục đi theo đường provider sẵn có.

Nội dung thất bại dùng chung không phụ thuộc vào bên tiêu thụ cụ thể, và đưa ra chỉ dẫn thực hiện được: agent con ghi câu hỏi hoặc quyết định chưa giải quyết vào kết quả cuối cùng. Quy ước ủy quyền vốn đã chuyển kết quả đó lên agent cha, và agent cha căn cứ vào đó để quyết định có hỏi con người hay không. Cả service lẫn agent con đều không tuyên bố tồn tại khả năng truyền tin lên trên hay chuyển tiếp câu trả lời mà thực tế không có.

Ranh giới an toàn này độc lập với việc bầu chọn composer của trình duyệt. [Các pha composer ngữ nghĩa](../../proposed/architecture/2026-08-08-semantic-composer-chain-phases.md) được đề xuất giải quyết cách sắp xếp thứ tự giữa tương tác đang chờ sẵn có và giao diện subagent chỉ đọc; nó không làm suy yếu guard runtime này.

## Phương án thay thế

**Dùng `session.header.delegationDepth > 0`.** Không áp dụng: phả hệ được lưu bền vững vẫn tồn tại sau khi khôi phục, nhưng không chứng minh được chủ sở hữu trong tiến trình hiện tại. Cách này sẽ từ chối những gốc đã khôi phục hợp lệ, và cũng có thể cho lọt agent con đang sống mà header lưu bền vững không đầy đủ.

**Chỉ từ chối bên trong `dsh-tool-ask-user`.** Không áp dụng: `exit_plan_mode` và các bên gọi trực tiếp cùng dùng `ctx.userQuestions.ask()`. Service là ranh giới thao tác hẹp nhất mà mọi bên tiêu thụ tương tác người–máy đều đi qua.

**Để agent con ủy quyền lên trên hoặc chờ chuyển tiếp.** Không áp dụng: ủy quyền dùng một lần không có kênh công khai để agent con gửi yêu cầu lên agent cha, cũng không có giao thức chuyển tiếp câu trả lời. Đường quay về duy nhất được bảo đảm là kết quả cuối cùng của agent con.

**Trông cậy vào bản sửa composer của trình duyệt.** Không áp dụng: cách trình bày không thể tự sinh ra một kênh giao tiếp với con người do chủ sở hữu chịu trách nhiệm, và các bản triển khai không dùng trình duyệt vẫn cần lời gọi này kết thúc được.

## Ảnh hưởng

Lời gọi từ agent con thuộc quyền sở hữu của agent khác trong runtime sẽ thất bại nhanh với một lỗi có cấu trúc ổn định, thay vì treo. Đúng những gốc đang sống trong registry và các lời gọi lập trình không kèm agent vẫn đủ tư cách hỏi, bao gồm cả session đã khôi phục mang phả hệ agent con trong quá khứ. `ask_user_question` và `exit_plan_mode` nhận cùng một chỉ dẫn sửa lỗi trung tính, trong khi schema mà model nhìn thấy và tiền tố system prompt của chúng không đổi; chỉ có kết quả lỗi được nối thêm là thay đổi, nên tiền tố KV Cache hiện có vẫn tái sử dụng được.

## Kiểm thử

Test của service bao phủ agent con đang sống có độ sâu lưu bằng không, gốc runtime đã khôi phục có độ sâu bằng một, thiếu registry, đối tượng cũ chỉ trùng id, và việc mỗi lần từ chối đều không gọi tới provider. Test của tool và plan-mode chứng minh cả hai bên tiêu thụ đều hiển thị kết quả `DELEGATED_CALLER` trung tính và không bao giờ chạm tới provider. Snapshot lắp ghép không cần khóa ủy quyền cho một agent con thử gọi `ask_user_question`, cố định kết quả tool lỗi và lần bàn giao cuối cùng của nó, đồng thời chứng minh agent cha có thể hoàn thành thay vì cứ chờ câu trả lời mãi.
