# Agent Note: Chọn model cho session tại khu nhập liệu hội thoại Web

Status: implemented

[English](2026-07-24-web-session-model-selector.md) | Tiếng Việt

## Vấn đề

Hội thoại Web cần một lựa chọn model cho session do Host cung cấp, nhìn thấy được và thay đổi được. Nếu bê nguyên cách trình bày của TUI, hoặc hardcode model DeepSeek trong trình duyệt, thì logic khám phá model và ngữ nghĩa ranh giới bước sẽ bị phân tán ra các frontend khác nhau. Việc chuyển đổi xảy ra trong lúc phản hồi đang chạy còn cần một ranh giới nguyên tử: biến prompt và định tuyến request không được quan sát thấy hai lựa chọn khác nhau.

## Quyết định

Host Web cài `ModelSelection` cho mỗi Agent mới tạo hoặc được khôi phục. Nếu session đã từng dùng model, lựa chọn provider／model／suy luận (reasoning) sẽ lấy từ `request/header` mới nhất; nếu không thì lấy từ `ctx.agentDefaultModel`. `session.selectModel` sẽ gán lựa chọn ở cấp session, còn khâu lắp ráp prompt sẽ bắt giữ nó cùng với định tuyến request, nên việc chuyển đổi xảy ra trong bước đang chạy sẽ áp dụng cho bước lắp ráp kế tiếp. Lựa chọn thực sự được dùng tiếp theo sẽ được persist qua snapshot `request/header` đầy đủ; còn lựa chọn chưa đi vào request nào thì chỉ được lưu trong tiến trình hiện tại.

Miền RPC session công khai danh mục model `session.models` và `session.selectModel`. Danh mục này được dựng động từ registry LLM (mô hình ngôn ngữ lớn) và nhóm theo provider; metadata chính xác của mỗi model được liệt kê còn kèm thêm ID cường độ suy luận, tên, mô tả và giá trị mặc định tùy chọn do adapter nắm giữ. Danh mục và metadata chính xác của từng provider được nạp song song theo provider và thất bại độc lập với nhau, nên những nhóm nạp thành công vẫn dùng được cùng với bản ghi thất bại có thể thử lại. Việc model có nằm trong danh mục hay không chỉ mang tính tham khảo: `session.models.current` được trả về độc lập, và vẫn định tuyến được ngay cả khi không thuộc nhóm nào, nhưng khi provider ngừng công bố model đó thì Host sẽ không tổng hợp ra dòng chưa được liệt kê. Hai frontend trả lời khác nhau cho trạng thái này: TUI render model hiện tại chưa được liệt kê thành một dòng riêng, còn Web thì hiển thị nhãn trigger ở trạng thái chưa đặt và yêu cầu chọn model thay thế. Web là frontend chứa danh mục có thể chỉnh sửa, nên một dòng danh mục vắng mặt đại diện cho một lựa chọn còn phải đưa ra; TUI chỉ chọn trong các dòng sẵn có. Composer Web đang hiển thị nhãn chưa đặt vẫn có thể gửi message bằng lựa chọn hiện tại còn định tuyến được. Việc phân giải chính xác quyết định tổ hợp provider／model và cường độ suy luận tường minh có khả dụng hay không. Thao tác chọn sẽ từ chối các ID cường độ suy luận không được hỗ trợ thông qua `resolveCallConfig`, và cụ thể hóa giá trị mặc định trong cấu hình adapter trước khi gán lựa chọn đó.

`ModelDirectoryResolver` trong trình duyệt giữ một `ModelDirectory` cho mỗi session thời gian thực. Snapshot của nó bao gồm `ModelSelection` đầy đủ hiện tại, danh mục đã nhóm, bản ghi thất bại của provider, lỗi thao tác, cùng các trạng thái `idle`, `loading`, `ready`, `selecting`, `error`. Khi mount sẽ điền sẵn nhãn trigger, và từ đó mỗi lần mở menu đều làm mới danh mục. Lời gọi danh mục và lời gọi chọn dùng chung số thế hệ thao tác, ngăn phản hồi tới sớm hơn ghi đè lên kết quả mới hơn; việc reset kết nối sẽ bỏ projection trong tiến trình hiện tại trước, rồi khôi phục lựa chọn của Host. Khi thất bại thì giữ nguyên lựa chọn trước đó và các nhóm còn khả dụng.

`@deepseek-ai/dsh-client-ui-conversation` khai báo slot đơn thể có phạm vi session `conversation.input.model` làm slot con của entry thanh nhập liệu. InputBar render seat này trong khu điều khiển ở đuôi, trước chỉ báo pending và nút chính; seat này nhận prop owner `locked` của thanh nhập liệu cùng phạm vi session. `@deepseek-ai/dsh-client-ui-model-selection` chiếm seat đó, và cung cấp `/model` trên cùng một danh mục. Trigger nhỏ gọn của nó hiển thị đúng tên model trong danh mục và nhãn cường độ suy luận đang có hiệu lực. Khi lựa chọn hiện tại không nằm trong nhóm nào, trigger hiển thị `Select model`, danh sách model không đánh dấu dòng active nào, và dòng Effort cũng ẩn đi; chọn một model đã được liệt kê sẽ gán lựa chọn đầy đủ qua đường chọn dùng chung. Ngoài trường hợp đó ra, menu bung lên trước tiên đưa ra Model và Effort; Model có thể đi sâu vào nhóm provider, còn Effort có thể đi sâu vào các mức đã được adapter sắp xếp. Chỉ khi adapter không cấu hình giá trị mặc định cho model thì mới hiển thị dòng giá trị mặc định của provider.

Danh sách trình duyệt cho môi trường production được lắp ráp từ `apps/cli/config/base.cordis.yml` và `apps/cli/config/web.cordis.yml`; chức năng model tương ứng với một dòng cấu hình `dsh.client` trong đó, chứ không phải một package hardcode trong code boot của Web. Manifest (bản kê metadata) của package đặt thứ tự nạp sau runtime và chức năng lệnh; còn việc inject service của Cordis thì chờ conversation slot khả dụng rồi mới đăng ký bên chiếm composer.

## Các phương án đã cân nhắc

**Dùng riêng dropdown provider và dropdown model.** Danh sách model phụ thuộc vào provider, nên mỗi lần thay đổi đều cần một tương tác hai giai đoạn. Một menu nhóm duy nhất vẫn tổ chức model theo provider mà không làm tăng độ dài hiển thị của trigger hay của từng dòng.

**Hardcode danh mục DeepSeek hiện tại trong client Web.** Danh mục đó sẽ lệch pha với các adapter đã đăng ký, và cũng loại trừ những provider riêng của bên triển khai. Registry LLM tiếp tục là nguồn sự thật cho metadata provider và model, đồng thời bao hàm cả thông tin về một số truy vấn thất bại.

**Giữ `High`／`Max` làm trạng thái UI cục bộ phía client.** Nhãn DeepSeek tĩnh không bao phủ được `off`, từ vựng provider của pi-ai, giá trị mặc định và việc kiểm tra của adapter, cũng không tham gia được vào việc khôi phục hay request provider kế tiếp. Metadata model chính xác sở hữu từ vựng tùy chọn, còn lựa chọn của session sở hữu ID đã chọn.

**Chỉ dùng giá trị mặc định toàn cục.** Việc thay đổi giá trị mặc định sẽ vô tình đổi hướng các hội thoại trống. Lựa chọn của session chỉ thuộc về một session thời gian thực; với session chưa có request nào được ghi lại, `ctx.agentDefaultModel` cung cấp giá trị dự phòng.

**Từ chối thay đổi trong lúc Agent đang chạy.** Snapshot lựa chọn nguyên tử tách bước lắp ráp hiện tại khỏi lựa chọn kế tiếp. Giữ bộ chọn ở trạng thái dùng được cho phép người dùng chọn trước model cho bước kế tiếp mà không làm thay đổi request đang thực thi.

**Persist mỗi lần nhấp thành một sự kiện session mới.** Chỉ khi khâu lắp ráp prompt đã dùng một lựa chọn thì lựa chọn đó mới hiển thị với model. Persist ý định UI chưa được dùng sẽ thêm một sự kiện lâu bền không dựng lại được request model; `request/header` hiện có đã ghi lại request đầu tiên thực sự dùng route đó.

## Ảnh hưởng

Mọi hội thoại Web có Host chống lưng (kể cả session trống) đều có thể chuyển đổi giữa các nhóm provider được khám phá động và các mức suy luận do adapter nắm giữ, mà không cần hiển thị nhãn `provider/model` trùng lặp. Lựa chọn thực sự được dùng sẽ được giữ lại sau khi khôi phục và kết nối lại; tên trong danh mục chỉ dùng để trình bày, còn việc chọn và persist thì dùng ID provider／model／cường độ suy luận. Khi danh mục hoặc metadata chính xác của một provider không khả dụng thì chỉ nhóm tương ứng bị suy giảm. Việc đổi provider／model có thể làm giảm tỉ lệ tái sử dụng cache phía provider, nhưng bộ chọn không thêm bất kỳ nội dung prompt nào, cũng không can thiệp vào bước đang thực thi. Model không có metadata suy luận thì không hiển thị dòng Effort.

## Kiểm thử

Test Host cố định việc khám phá theo nhóm, cách ly thất bại của danh mục và metadata chính xác, khôi phục cường độ suy luận đã ghi lại mà không chèn dòng cũ, việc chọn model chưa được liệt kê không bị danh mục ràng buộc, việc từ chối cường độ suy luận không được hỗ trợ, việc cụ thể hóa giá trị mặc định, cũng như việc chuyển đổi chỉ ảnh hưởng tới lần lắp ráp kế tiếp. Test client cố định danh mục dùng chung, việc khôi phục khi kết nối lại và việc gửi lựa chọn đầy đủ. Test component cố định nhãn cường độ suy luận động, phần mô tả, việc hiển thị giá trị mặc định của provider, việc gửi cường độ suy luận, cùng phương án dự phòng `Select model` khi dòng model vắng mặt. Fixture built-app không cần khóa (dữ liệu chuẩn bị cho test) nạp plugin model production, chọn GPT-5 của OpenAI cùng cường độ suy luận Max của nó, phát một lượt, và kiểm chứng rằng phản hồi được sinh ra kế tiếp báo cáo cả hai ID; fixture cấu hình DeepSeek thì lược bỏ dòng danh mục active, cố định phương án dự phòng đó trước khi chọn model thay thế.
