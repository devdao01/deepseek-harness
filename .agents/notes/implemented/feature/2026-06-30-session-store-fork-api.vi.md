# Agent Note: SessionStore fork API

Status: implemented

[English](2026-06-30-session-store-fork-api.md) | Tiếng Việt

## Vấn đề

Log phiên theo mô hình event sourcing đã có sẵn nguyên thủy cần cho fork: tạo một phiên mới với tiền tố sự kiện seed, rồi suy ra lịch sử model từ log seed đó giống như replay. Nguyên thủy này có chủ đích được giữ ở tầng thấp: `ctx.sessions.create(id, { seed, meta })` chấp nhận bất kỳ seed hợp lệ nào, nhưng việc phân nhánh phiên hoạt động thông thường cần chính sách xoay quanh các câu hỏi: tiền tố nào được phép sao chép, phiên con nên gắn metadata gì, và lỗi được phân loại ra sao.

Rủi ro về ngữ nghĩa nằm ở ranh giới fork. Một seed fork hợp lệ, hiển thị cho người dùng, phải liên tục và kết thúc bên ngoài một turn đang hoạt động. Nếu fork trong khi đang thực thi, sẽ sao chép một `turn/start` chưa đóng, có thể cả một `step/start` chưa đóng, và có thể có lệnh gọi tool còn treo lơ lửng. Điều này vi phạm bất biến transcript (bản ghi văn bản) thực thi và của nhà cung cấp, đồng thời tạo ra một lịch sử con gây hiểu lầm — trông như thể phiên con đã tham gia vào một turn của phiên cha vẫn chưa hoàn thành. Ngữ cảnh độc lập sau một turn đã đóng và các sự kiện thuần log do plugin chịu trách nhiệm ghi là lịch sử ổn định và có thể fork được. [subagent seam](2026-06-21-subagent-capability-seam.md) hiện có giải quyết có chủ đích một vấn đề khác: fork subagent do tool kích hoạt thường xảy ra khi turn của cha vẫn đang mở, nên `dsh-subagent-fork-in-process` cắt seed về tiền tố tại turn đã hoàn thành cuối cùng của phiên cha. Fork phiên tổng quát không nên âm thầm cắt xén; nó nên hoặc fork tại đúng ranh giới được yêu cầu, hoặc từ chối yêu cầu.

## Quyết định

`dsh-session` trực tiếp chịu trách nhiệm cho việc fork phiên hoạt động thông thường trên `ctx.sessions`. Không có package `dsh-session-fork` riêng, cũng không có dịch vụ `ctx.sessionFork`: API này không có backend riêng, từ vựng sự kiện riêng, vòng đời riêng hay hành vi bền vững riêng, mọi công việc bền vững được ủy quyền cho kho lưu trữ phiên và backend bền vững sẵn có.

store phơi bày một thao tác:

```ts ignore-check
type SessionForkSource = Session | SessionId

class SessionStore extends Service {
  fork(source: SessionForkSource, boundary?: number, childSessionId?: SessionId): Session
}
```

`boundary` là `seq` sự kiện nguồn cần sao chép đến (bao gồm cả số đó). Khi bỏ qua, mặc định là sự kiện cuối cùng hiện tại của phiên nguồn; đối với phiên nguồn rỗng, bỏ qua `boundary` sẽ tạo ra một phiên con rỗng. Việc xác thực riêng cho fork kiểm tra ranh giới được yêu cầu có tồn tại, và xác nhận ranh giới turn gần nhất của tiền tố đã chọn không phải là một `turn/start` chưa khớp. Vì vậy, tiền tố đã chọn có thể kết thúc ở `turn/end` hoặc sự kiện độc lập muộn hơn, sau đó được deep copy vào seed của phiên con. Phiên con kế thừa `cwd` của phiên nguồn, đặt `parentSession` là id của phiên nguồn, và đặt `seedLength` bằng độ dài tiền tố đã sao chép. Khi bỏ qua `childSessionId`, `SessionStore` dùng chiến lược tạo id sẵn có của nó để sinh một cái.

Tiền tố rỗng có thể được fork; bất kỳ ranh giới không rỗng nào cũng phải là một số thứ tự an toàn, đã tồn tại, nằm ngoài turn còn mở. Các lỗi được định kiểu phân biệt giữa: thiếu nguồn, đối tượng đã lỗi thời, id con trùng lặp, ranh giới không hợp lệ, và tiền tố kết thúc giữa lúc đang thực thi. Việc xác thực log rộng hơn và khôi phục sau crash vẫn do bên chịu trách nhiệm sẵn có của chúng xử lý.

### Đấu nối Host và trình duyệt

RPC `session.fork` của Host nhận `atSeq`, coi nó là điểm neo bên trong turn cần thiết, chứ không phải ranh giới an toàn trong store chứa số thứ tự đó. Nó chọn `turn/end` đầu tiên tại hoặc sau điểm neo đó; khi điểm neo bị bỏ qua hoặc vượt quá cuối log, chọn turn đã hoàn thành cuối cùng. Nếu điểm neo đã có trong log, nhưng không tìm thấy `turn/end` khớp kể từ điểm neo đó, trả về `fork-unavailable`, tuyệt đối không rơi về turn sớm hơn, nên thao tác trên tin nhắn sẽ không âm thầm bỏ sót tin nhắn đã bấm chọn.

Host tạo phiên con qua registry agent (tác tử) với seed và phả hệ đã chọn; setup trước khi publish sẽ cài đặt nhà cung cấp, model và mục tiêu reasoning (suy luận) mới nhất trong log trước, thì phiên con mới có thể chạy. Sau đó, Host gắn phiên con vào Workspace nguồn. Nếu gắn thất bại, trả về `workspace-attach-failed` cùng id phiên con đã publish; client đối chiếu phiên con đó vào danh sách tóm tắt trước, rồi mới báo lỗi cho bên gọi. Thao tác trên Session dùng turn đã hoàn thành cuối cùng, thao tác trên tin nhắn thì cung cấp seq sự kiện của nó; cả hai đều mở phiên con sau khi thành công, mở rộng phả hệ sẽ thấy nó bên dưới phiên nguồn.

## Phương án thay thế đã cân nhắc

**Dịch vụ `ctx.sessionFork` độc lập.** Một phiên bản lặp lại sớm hơn từng phát hành nó như dịch vụ độc lập; nó áp dụng quá mức mô hình capability seam. Đoạn code không có backend có thể thay thế, không có bề mặt sự kiện thêm, không có vòng đời sở hữu độc lập, cũng không có hành vi bền vững vượt ngoài `ctx.sessions.create({ seed, meta })`. Giữ package độc lập sẽ buộc bên gọi phải khám phá và cài đặt thêm một dịch vụ thứ hai chỉ để chạy một lớp chính sách trên nguyên thủy lưu trữ phiên.

**Hai hàm: `snapshot()` cộng `fork()`.** Cách này giữ được việc tính toán seed/metadata có thể tái sử dụng, nhưng bên tiêu thụ duy nhất được hỗ trợ lại tạo phiên ngay lập tức. Nó cũng khiến API trông trừu tượng hơn thao tác cụ thể mà người dùng thực sự cần. `fork()` đơn lẻ cộng `boundary` tường minh giữ API trực tiếp, đồng thời vẫn hỗ trợ fork tại một thời điểm trước đó.

**Âm thầm cắt turn chưa đóng về ranh giới đã hoàn thành cuối cùng.** Cách này đúng với `dsh-subagent-fork-in-process` — việc ủy thác thường bắt đầu khi turn của cha vẫn còn mở, và phiên con chỉ nên kế thừa tiền tố đã hoàn thành. Nhưng lại sai với việc phân nhánh phiên/người dùng thông thường, vì nó che giấu sự thật rằng điểm fork được yêu cầu thực ra không phải là ranh giới hợp lệ, và âm thầm loại bỏ phần đuôi của turn cha.

## Hậu quả

API công khai vẫn gọn gàng và dễ khám phá: phân nhánh phiên hoạt động là một phần của `ctx.sessions`, nằm sát `create({ seed })`, chứ không phải một dịch vụ độc lập hay một cặp hàm phụ trợ hai bước. Tính bền vững tiếp tục vận hành qua hành vi `session/created` và `session/flush` sẵn có: phiên con được fork ra đã có sự kiện seed ngay từ lúc tạo, nên backend sẵn có chỉ cần lưu bền vững seed đó một lần, và lưu `parentSession`/`seedLength` trong header.

Phạm vi v1 vẫn loại trừ `session/fork` của ACP (Agent Client Protocol), fork phiên bền vững chưa được nạp, tool hướng model, và tái cấu trúc subagent. Nếu sau này thêm phương thức ACP, nên chỉ công bố hỗ trợ khả năng này sau khi có độ bao phủ giao thức và snapshot; Agent Note này không thêm bất kỳ hành vi giao thức ACP nào, nên không cần snapshot ACP. Việc replay phiên con được fork vẫn được bao phủ bởi [Agent Note test ranh giới seed sẵn có](../testing/2026-06-22-fork-child-replay-seed-boundary.md); test riêng cho store, Host, lớp truyền tải và client chốt các quy ước ranh giới và đối chiếu, còn kịch bản Chromium thật thì chốt thao tác tin nhắn đã lắp ráp và cây phả hệ.
