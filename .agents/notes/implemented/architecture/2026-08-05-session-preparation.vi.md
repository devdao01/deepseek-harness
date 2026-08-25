# Agent Note: Giai đoạn chuẩn bị Session có thể tái dùng trước khi công bố

Status: implemented

[English](2026-08-05-session-preparation.md) | Tiếng Việt

## Vấn đề

Việc kiểm tra lịch sử nguội và việc khôi phục agent đều vật chất hóa riêng cùng một nhật ký session bền vững. Với các nhật ký nén cỡ lớn, mỗi thao tác lại đọc đầy đủ, giải nén, parse, kiểm tra, đóng băng rồi dựng Session từ đầu. Vì vậy, việc phân trang lịch sử có thể phải trả chi phí đọc nguội lặp đi lặp lại; còn nếu chuyển sang cho truy vấn lịch sử kích hoạt agent thì vòng đời đọc lại bị ràng buộc với agent thời gian thực vốn không có thời điểm thoát tự nhiên.

Việc tạo mới và việc khôi phục từ dữ liệu bền vững cũng đi qua hai luồng dựng khác nhau để đến cùng một ranh giới công bố. Điều này khiến một bất biến then chốt trở nên không rõ ràng: phần thiết lập phải hoàn tất trên một Session chưa được công bố, sau đó hệ thống mới có thể đồng thời phơi bày chính xác Session ấy cùng agent của nó.

## Quyết định

`SessionPreparation` nắm giữ đúng một `Session` chưa công bố cho tới khi công bố hoặc quay lui. Nó thuộc về vòng đời Session, không thuộc vòng đời agent hay cơ chế kích hoạt. Luồng tạo mới bọc kết quả của `SessionStore.prepare()`; còn khôi phục từ dữ liệu bền vững thì lấy đối tượng chuẩn bị từ `SessionPersistence.prepare()`.

agent loop tiêu thụ cả hai dạng này qua cùng một pipeline thiết lập và công bố: lấy đối tượng chuẩn bị trước, dựng agent context riêng quanh `preparation.session`, chờ phần thiết lập tùy chọn hoàn tất, rồi công bố đúng Session và agent đó, và thực hiện dispose đối tượng chuẩn bị trên mọi đường thoát. Sau khi công bố, vòng đời thời gian thực được các store Session và agent hiện có tiếp quản; bản thân `SessionPreparation` không chịu trách nhiệm về bất kỳ hành vi agent nào.

Cơ chế này tinh chỉnh ranh giới công bố trong [quyết định về vòng đời và quyền sở hữu agent](2026-06-18-agent-lifecycle-and-ownership-contracts.md), nhưng không thay thế mô hình sở hữu của nó.

## Vòng đời chuẩn bị của lớp persistence

Hiện thực persistence dùng bộ điều phối sẽ nạp một nguồn nguội thành một Session đã chuẩn bị xong. Backend chuyển giao metadata và sự kiện tươi mới, không alias lẫn nhau, cùng một revision có định danh nguồn để nhận diện chính xác những giá trị đó; đường khôi phục Session kiểm tra và đóng băng trực tiếp các đồ thị đối tượng này, không sao chép lại. Bộ điều phối tính toán closer cho lượt bị gián đoạn, và chỉ dựng đúng một Session chưa công bố. Header bất biến của nó cùng nhật ký sự kiện logic đã được cân bằng tạo thành `SessionInspection` mà phía đọc mượn, còn revision thì được giữ lại bên trong lớp persistence.

`inspect(id, signal?)` không sửa đổi kho lưu trữ. Closer tổng hợp chỉ tồn tại trong khung nhìn bộ nhớ đã chuẩn bị xong, phần đuôi vật lý bị rách vẫn giữ nguyên. Những phía gọi cùng id sẽ dùng chung lần đọc nguội đang diễn ra. Sau khi chuẩn bị xong, đối tượng này có thể đi vào LRU riêng của từng bộ điều phối; backend first-party cho phép cấu hình dung lượng, mặc định giữ lại năm mục. Trước khi tái dùng một nguồn được giữ lại, bộ điều phối sẽ đọc revision hiện tại của id đó; nếu không khớp, nó loại bỏ nguồn đang ở giai đoạn sẵn sàng và vật chất hóa nguội lại từ đầu. Những nguồn đã đi vào giai đoạn commit hoặc đã được đặt trước để khôi phục thì vẫn thuộc độc quyền của chủ sở hữu, nên các lần kiểm tra đồng thời sẽ mượn khung nhìn bất biến đó cho tới khi công bố hoặc giải phóng.

`prepare(id, signal?)` đặt trước độc quyền một Session đã chuẩn bị xong. Nó xác nhận revision được giữ lại trước, rồi commit phần sửa chữa đuôi bị rách và lượt bị gián đoạn, thiết lập con trỏ bền vững, cuối cùng trả về đối tượng chuẩn bị có thể dispose. Nguồn đã cũ sẽ bị loại bỏ và đọc lại, không tham gia vào việc sửa chữa hay công bố. Sau khi sửa chữa thành công, nguồn trước khi sửa cũng bị loại bỏ, và nhật ký đã commit được vật chất hóa lại trước khi đặt trước, để tránh gắn một revision mới hơn vào đồ thị đối tượng sự kiện cũ hơn. Một yêu cầu chuẩn bị khác trên cùng id sẽ chờ cho tới khi lượt đặt trước hiện tại được công bố hoặc giải phóng. Việc công bố chỉ chấp nhận đúng Session đã đặt trước và gắn thẳng con trỏ đã commit, không cần dựng lại lịch sử. Khi thiết lập thất bại hoặc bị hủy, Session chưa công bố và chưa hề thay đổi sẽ quay lại LRU; còn khi đã có thay đổi hoặc đã gắn xong, hệ thống sẽ tiêu thụ lượt đặt trước đó.

API `load(id)` tồn tại từ trước dùng chính cơ chế chuẩn bị và sửa chữa này, sau đó bỏ lượt đặt trước của nó và trả về khung nhìn logic bất biến. Nó được giữ lại như một API tương thích, không đảm nhận đường tái dùng từ lịch sử sang khôi phục. Vòng đời này mở rộng [bộ điều phối ghi persistence dùng chung](2026-06-18-shared-persistence-write-coordinator.md), đồng thời tiếp tục tuân theo các quy tắc lưu trữ và khôi phục do [quyết định về persistence cho session](2026-06-14-session-persistence.md) đặt ra.

## Tái dùng giữa lịch sử và khôi phục

Việc đọc lịch sử dùng `inspect()`, nhờ vậy các lần phân trang lặp lại có thể mượn cùng một trạng thái chuẩn bị bất biến mà không kích hoạt agent. Lần khôi phục sau đó gọi `prepare()` và nhận thẳng đúng Session đã được giữ lại từ giai đoạn kiểm tra; hệ thống không đọc, giải nén, parse, sao chép, kiểm tra hay đóng băng nhật ký đầy đủ thêm lần nữa.

Nếu nhật ký bền vững thay đổi sau lần kiểm tra, revision của nó cũng đổi theo. Lần đọc lịch sử hoặc lần khôi phục kế tiếp sẽ loại bỏ Session được giữ lại đang ở giai đoạn sẵn sàng và vật chất hóa nhật ký mới, nhờ đó đồ thị đối tượng sự kiện cũ không bị gắn vào revision snapshot mới hơn. Nguồn đã được một thao tác khôi phục đang diễn ra lấy đi thì không bị loại bỏ: chủ sở hữu độc quyền của nó giữ nguồn ấy cho tới khi công bố hoặc giải phóng, còn các lần đọc lịch sử đồng thời có thể mượn chính khung nhìn bất biến đó.

Việc truy cập continuable subagent ở trạng thái nguội cũng đi theo đúng đường này. Hệ thống kiểm tra session con và hoàn tất phần cấp quyền theo descriptor trước, rồi `ctx.agents.resume()` mới đặt trước và công bố Session đã được giữ lại. Cách này vừa tuân theo các quy tắc vòng đời và cấp quyền trong [quyết định về session continuable subagent](../feature/2026-07-28-continuable-subagent-conversations.md), vừa loại bỏ các lần đọc nguội trùng lặp.

## Ranh giới

- `readFrom()` vẫn là API cho phần hậu tố vật lý đã tách rời. Nó không tạo hay tiêu thụ đối tượng chuẩn bị, không tổng hợp closer logic, và không đi vào LRU.
- Việc tiếp quản HMR vẫn lấy Session thời gian thực làm thẩm quyền và đọc thẳng phần tiền tố đã lưu trữ. Nó có thể cắt bỏ mảnh vật lý bị rách, nhưng tuyệt đối không đóng một lượt đang mở ở thời gian thực thành trạng thái bị gián đoạn.
- Bộ nhớ đệm thuộc về từng bộ điều phối persistence riêng lẻ, không phải một map Session toàn cục theo tiến trình. Session thời gian thực do các store hiện có nắm giữ và không bao giờ chiếm dung lượng chuẩn bị.
- Luồng tạo mới không bao giờ nhận một đối tượng chuẩn bị persistence nguội có cùng id. Xung đột persistence vẫn bị từ chối.
- Các hiện thực persistence của bên thứ ba vẫn nhận được `prepare()` trừu tượng được hiện thực qua `load()` làm phương án dự phòng. Chúng dùng cùng interface công bố, nhưng chỉ khi ghi đè luồng chuẩn bị thì mới tái dùng được đúng đối tượng.
- Việc kiểm tra revision thiết lập tính tươi mới tại điểm tái dùng và điểm commit sửa chữa, nhưng không thêm cơ chế loại trừ writer xuyên tiến trình cho backend. Việc thử lại chỉ hội tụ khi nhật ký bền vững giữ nguyên trong một vòng đọc và kiểm tra lại, nên việc ghi liên tục từ bên ngoài có thể làm chậm quá trình chuẩn bị.

## Kiểm chứng

Quy ước persistence dùng chung quy định rằng việc kiểm tra nguội không được sửa đổi kho lưu trữ và phải giữ cân bằng, đồng thời phủ cả phần sửa chữa sau đó. `persistence.spec.ts` và `preparations.spec.ts` phủ việc dùng chung lần đọc đang diễn ra trên cùng id, việc tái dùng đúng Session giữa kiểm tra và chuẩn bị, việc revision kích hoạt làm tươi trước khi đọc lịch sử và khôi phục, việc sửa chữa chỉ commit một lần, đặt trước độc quyền, giải phóng sau khi thiết lập thất bại, loại bỏ theo LRU với các mục ở trạng thái sẵn sàng, từ chối append trong lúc đang đặt trước, và chỉ cho phép công bố Session đã đặt trước. Test của backend phủ việc đọc đầy đủ và đọc nhẹ dùng chung một danh tính revision. Test của agent loop và continuable subagent phủ pipeline công bố hợp nhất, cùng đường đi từ kiểm tra tới khôi phục trong lúc hủy và dọn dẹp.

## Các phương án đã cân nhắc

**Cho việc đọc lịch sử kích hoạt agent.** Không áp dụng, vì việc phân trang sẽ khiến agent chỉ dùng để truy vấn phải duy trì trạng thái thời gian thực lâu dài, và đẩy vấn đề thoát khỏi bộ nhớ đệm sang vòng đời agent.

**Chỉ cache `{ meta, events }`.** Không áp dụng, vì khi khôi phục vẫn phải dựng lại, kiểm tra, đóng băng và sao chép Session từ giá trị trong cache. Đơn vị thực sự tái dùng được là đúng Session chưa công bố.

**Duy trì một map Session toàn cục theo tiến trình.** Không áp dụng, vì nó vượt qua ranh giới sở hữu của backend và runtime, giữ danh tính vô hạn định, và trùng lặp với store Session thời gian thực.

**Thêm transaction hoặc bộ điều phối khôi phục vào agent loop.** Không áp dụng, vì đọc nguội, sửa chữa, đặt trước và gắn con trỏ đều thuộc trách nhiệm của persistence và Session. agent loop chỉ cần một ranh giới sở hữu `SessionPreparation` thống nhất.

**Đổi `readFrom()` thành luồng chuẩn bị logic.** Không áp dụng, vì các bên tiêu thụ mốc nước cần phần hậu tố vật lý đã tách rời; với các backend có thể định địa chỉ, còn cần giới hạn phạm vi đọc thực tế. Việc cân bằng khi khôi phục và việc tái dùng Session đầy đủ có ngữ nghĩa khác nhau.

## Hệ quả

Một lần vật chất hóa nguội có thể phục vụ đồng thời việc phân trang lịch sử, việc kiểm tra descriptor của subagent và lần khôi phục sau đó. Việc chuyển giao quyền sở hữu loại bỏ các bản sao dư thừa ở giai đoạn khôi phục; LRU có giới hạn của từng bộ điều phối giới hạn mức chiếm dụng bộ nhớ, đồng thời tránh việc truy vấn tạo ra agent thời gian thực. Việc tạo mới và khôi phục dùng chung một giao thức công bố, đồng thời vẫn giữ tách bạch trách nhiệm giữa agent và Session.

Lần kiểm tra nguội đầu tiên phải trả toàn bộ chi phí kiểm tra và dựng Session, và có thể giữ Session chưa công bố đó cho tới khi bị loại bỏ. Lớp persistence phải phối hợp đặt trước, append, sửa chữa và công bố; phía gọi phải coi kết quả kiểm tra là trạng thái bất biến được mượn. Các backend dựa vào `prepare()` mặc định vẫn hoạt động đúng, nhưng không nhận được tối ưu hóa tái dùng.
