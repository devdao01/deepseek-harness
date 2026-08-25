# @deepseek-ai/dsh-client-ui-commands

[English](README.md) | Tiếng Việt

API lệnh phía client (`ctx.commandUi`): cache danh mục lệnh theo khóa session, `/` command source với hook quyết định `matchSpace`/`matchEnter`, ba loại phân phối (`execute`/`popupSelect`/`leadingInput`), và đăng ký popupSelect cho các gói nghiệp vụ. [Agent Note lệnh Web](../../../.agents/notes/implemented/architecture/2026-07-25-web-command-surfaces-and-assembly.zh.md) ghi lại quyết định này.

`src/client/contract.ts` là quy ước API nghiệp vụ cố định: `CommandUiContract.register(name, spec)` và `decorate(name, spec)` là toàn bộ những gì gói nghiệp vụ tiêu thụ; `CommandUiSpec{options, onSelect}` tự cung cấp dữ liệu popup — component lớp ngoài thuộc sở hữu của gói này, gói nghiệp vụ không bao giờ thấy nó. Mục đóng góp là lệnh riêng của client (báo lỗi rõ ràng khi trùng tên với lệnh host); mục trang trí (decorate) thì thêm popup gọi trần cho lệnh host **đã tồn tại**. Host giữ dòng danh mục, việc claim có tham số (space/Enter có tham số) và ghi sổ vòng đời; tên bị trang trí nếu không có dòng host trong danh mục session thì không bao giờ kích hoạt. Loại lệnh được suy ra theo mỗi lần phân phối, không bao giờ định hình lúc đăng ký: descriptor host có `input` là `leadingInput`, đã đăng ký `CommandUiSpec` là `popupSelect`, còn lại đều là `execute`.

`CommandDirectory` (`src/client/directory.ts`) là cache phái sinh từ wire duy nhất, khóa theo session. Session thông thường lấy qua `command.list({sessionId})`, hook `warm` khi scope của source ra đời sẽ làm nóng trước mục cache của session đó. Subagent có thể tiếp tục được đánh địa chỉ bởi danh mục sẽ giải quyết thành danh mục lệnh rỗng phía client: `command.list` gắn với Agent, nếu làm nóng nó thì subagent sẽ bị kích hoạt chỉ vì xem lịch sử bền vững. Mục cache bị vô hiệu hóa mềm bởi sự kiện owner đã chuyển tiếp `commands/change` (bản chụp cũ vẫn phục vụ trong khi lấy lại đang diễn ra), cũng bị vô hiệu hóa mềm riêng cho session đó bởi `agent-preset/selected` đã chuyển tiếp (tái tổ hợp agent không tạo ra đăng ký nào, tín hiệu cấp registry không kích hoạt cho nó), bị vô hiệu hóa cứng bởi `connection/reset`, và được canh gác bằng epoch, lần lấy cũ bị thay thế không bao giờ ghi đè được kết quả mới hơn. `matchSpace` chỉ trả lời đồng bộ dựa trên cache này; `matchEnter` chờ cứng cache trên tín hiệu SubmitAttempt, làm nóng thất bại thì từ chối — một dòng bắt đầu bằng `/` không bao giờ bị âm thầm hạ cấp thành prompt thường.

Sau khi `command.execute` trả về kết quả lệnh đã khớp, trình duyệt hiện tại sẽ phát ra `command/executed(sessionId, name, result)` cục bộ. Các client khác chỉ nhận node lệnh bền vững qua luồng sự kiện Host, không nhận xác nhận này, do đó tác dụng phụ riêng của trình duyệt có thể lọc ra kết quả thành công mà client thực sự gửi lệnh nhận được, không nhầm việc phát lại Session thành yêu cầu thao tác. Listener thất bại được ghi log riêng lẻ và cô lập, không thay đổi kết quả lệnh đã được nhận, cũng không chặn các listener sau chạy.

Truy vấn menu khớp mờ theo thứ tự, không phân biệt hoa thường, trên chuỗi con của tên lệnh. Tiền tố được xếp hạng cao nhất; các kết quả khớp còn lại được sắp xếp theo quy tắc ưu tiên ranh giới dấu phân cách, ưu tiên ký tự liền kề, khoảng cách càng ngắn càng ưu tiên, nếu vẫn bằng điểm thì dùng thứ tự danh mục và thứ tự đóng góp để phá thế hòa. Hành vi này chỉ ảnh hưởng đến việc khám phá lệnh: space và Enter vẫn yêu cầu khớp chính xác tên lệnh. Cơ sở: [Khám phá lệnh slash mờ trên Web](../../../.agents/notes/implemented/feature/2026-08-04-web-slash-command-fuzzy-discovery.md).

`PopupSelectController` (`src/client/popup.ts`) là lớp vỏ trạng thái không có giao diện: `PopupSelectView` tự đăng ký vào `conversation.input.overlay` (khóa SlotMap thuộc sở hữu của ui-conversation; gói này chỉ import khai báo đó dưới dạng type-only — không có cạnh phụ thuộc thời gian chạy). Lớp vỏ là tầng tạm thời giữ focus trong khi mở; việc tiêu thụ phân đoạn token sau onSelect được thực hiện qua `consumeTokenSegment` trên cả hai nhánh (đường menu dùng span CAS, đường Enter dùng so sánh token trần bằng nhau), tác động lên bề mặt bản nháp được nối qua `bindDraft` ở tầng kết nối.

Entry `/client` export phần thân plugin (`apply`/`inject`), `CommandUiRuntime`, các lớp directory và popup cùng các kiểu trạng thái của chúng, và các kiểu quy ước cố định; component lớp ngoài tự nó là chi tiết triển khai nội bộ của đăng ký overlay.

## Trải nghiệm Model

Ảnh hưởng gián tiếp, thông qua đường phân phối của gói này và RPC `command.execute` do đường dẫn `claim.submit` kích hoạt: lệnh khớp trúng có handler của nó sửa đổi trạng thái miền host, các gói khác sau đó chiếu trạng thái đó vào yêu cầu tiếp theo (handler của `/plan` bật chế độ plan, gói sở hữu nó inject đoạn system prompt `plan:policy`), còn dòng lệnh, kết quả detached và toàn bộ việc render menu/notice đều ở lại phía client, không bao giờ đi vào nhật ký session.

#### Tác động KV Cache

Không có tác động trực tiếp; gói này không lắp ráp cũng không gửi yêu cầu provider. Handler lệnh mà nó kích hoạt có thể thay đổi đóng góp của gói host sở hữu vào system prompt của yêu cầu tiếp theo (một section xuất hiện hoặc biến mất sẽ thay thế token yêu cầu trước đó, làm mất hiệu lực tiền tố provider từ điểm đó trở đi), nhưng tác động này thuộc sở hữu và được ghi lại bởi gói host của từng lệnh.

## Hạn chế đã biết và công việc hoãn lại

- **Sau khi rời session, notice của kết quả detached hạ về console**: đường fire-and-forget gửi kết quả qua `SessionInput.notify` đến composer của session đã kích hoạt; sau khi session bị hủy, dòng output console là bề mặt hiển thị duy nhất còn lại.
