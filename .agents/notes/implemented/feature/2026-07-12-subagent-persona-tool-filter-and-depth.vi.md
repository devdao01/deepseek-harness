# Agent Note: Cấu hình persona, khả năng hiển thị tool và độ sâu của subagent

Status: implemented

[English](2026-07-12-subagent-persona-tool-filter-and-depth.md) | 中文

## Vấn đề

Một bên cung cấp subagent có thể tái sử dụng giải quyết vấn đề "chạy sub-agent (tác tử con) như thế nào", nhưng các tool delegation (ủy thác) khác nhau cần hành vi sub-agent khác nhau. Một triển khai có thể cần persona của người đánh giá, bộ tool chỉ giới hạn cho nghiên cứu, hoặc giới hạn đệ quy cứng, mà không cần tạo bên cung cấp mới cho mỗi tổ hợp.

Các control này ảnh hưởng đến request model đầu tiên của sub-agent, do đó không thể cài đặt sau khi sub-agent đã trở nên hiển thị. Chúng còn cần sự hỗ trợ trung thực từ bên cung cấp: backend ACP (Agent Client Protocol) không thể âm thầm chấp nhận một bộ lọc tool chỉ tồn tại trong tiến trình, và bộ lọc cũng không nên được mô tả như một ranh giới bảo mật khi mọi plugin đều chạy trong cùng một tiến trình đáng tin cậy.

## Quyết định

Việc khởi động subagent có ba control tổ hợp độc lập: `persona`, `toolFilter` và `maxDepth`. Bên cung cấp khai báo mức hỗ trợ cho từng control, service từ chối các request không được hỗ trợ trước khi khởi động chạy, bên cung cấp trong tiến trình cài đặt tổ hợp đã yêu cầu khi sub-agent chưa được publish.

Các control này trả lời các câu hỏi khác nhau:

| Control | Câu hỏi | Kết quả |
|---|---|---|
| `persona` | Chỉ dẫn vai trò nào thay thế persona triển khai của sub-agent này? | Một đoạn prompt cục bộ của sub-agent che (shadow) `deployment:persona` |
| `toolFilter` | Trong các tool toàn cục của triển khai, tool nào lọt vào view tool hiển thị của sub-agent này? | Một giới hạn có phạm vi (scope) lọc tool toàn cục trước khi thêm tool cục bộ của sub-agent |
| `maxDepth` | Cây delegation này có thể sâu tối đa bao nhiêu tầng? | Request khởi động bị từ chối khi độ sâu sub-agent vượt giới hạn tuyệt đối |

`dsh-tool-subagent` expose các control này như cấu hình plugin, và sao chép chúng vào mỗi request nó tạo ra. Bên gọi trực tiếp `SubagentRuntime` có thể chọn các control này theo từng request. Bộ mô tả năng lực của bên cung cấp vẫn là nguồn sự thật cho việc backend có thể đáp ứng từng trường hay không.

### Persona là một lớp che có phạm vi

Control persona thay đổi hành vi của một sub-agent, chứ không thay đổi việc lắp ráp prompt ở cấp triển khai. Trong giai đoạn thiết lập chưa publish, bên cung cấp trong tiến trình đăng ký một đoạn tên `deployment:persona` trong phạm vi sub-agent; quy tắc giải quyết "cụ thể nhất thắng" thông thường chỉ thay thế đoạn toàn cục trong bản lắp ráp của sub-agent đó.

Giá trị của nó có ngữ nghĩa template nghiêm ngặt giống hệt persona triển khai. Khi bỏ qua, nó kế thừa đoạn triển khai qua tầng toàn cục; chuỗi rỗng tường minh sẽ che persona toàn cục bằng một đoạn rỗng. Persona của cha và anh em không bao giờ lọt vào phạm vi phẳng của sub-agent.

Cách này dùng cơ chế đăng ký system prompt thông thường, chứ không phải một kênh persona thứ hai. Do đó, phần đóng góp có tên mà prompt đầu tiên nhìn thấy nhất quán với những gì các prompt sau và công cụ kiểm tra prompt nhìn thấy.

### Lọc tool là một quy tắc tác động lên view toàn cục thời gian thực

Bộ lọc tool kiểm soát đồng thời khả năng hiển thị năng lực và việc tra cứu để thực thi. Bên cung cấp trong tiến trình cài đặt `ToolRuntime.restrict()` trong phạm vi sub-agent trước khi publish; resolver duy nhất của registry áp cùng một kết quả lên schema tool định dạng giao thức (wire format), tra cứu, thực thi và việc sinh SDK Code Mode. Đoạn system prompt đăng ký độc lập không nằm trong `ToolRuntime`, do đó lọc một tool không xóa văn bản hướng dẫn độc lập của plugin đó.

Việc giải quyết tuân theo các quy tắc sau:

1. Mỗi giới hạn áp `allow` trước rồi mới áp `deny` lên registry tool toàn cục của triển khai đang hoạt động.
2. Nhiều giới hạn lấy giao (intersection), do đó một tool toàn cục phải được mọi giới hạn đã cài đặt cho phép.
3. Tool trong phạm vi sub-agent được thêm sau khi lọc toàn cục, có thể che một tool toàn cục đã được cho phép.
4. Phần hiển thị `run_code` được giữ lại và các đóng góp giao thức cục bộ theo phạm vi khác không bị ảnh hưởng bởi bộ lọc toàn cục.

Khi bộ lọc không cung cấp cả `allow` lẫn `deny`, hoặc nêu tên thứ nằm ngoài tập tool toàn cục có thể giới hạn hiện tại (bao gồm tên chỉ tồn tại trong phạm vi cục bộ hoặc tên dành riêng), cấu hình sẽ fail tường minh. `allow: []` hợp lệ, và có chủ đích ẩn toàn bộ tool toàn cục. Các kiểm tra này bắt lỗi chính tả, và ngăn cấu hình trông có vẻ hợp lệ trong khi không thể ảnh hưởng đến các mục được nêu tên.

Registry toàn cục vẫn hoạt động. Bộ lọc chỉ có deny sẽ cho phép tên toàn cục đăng ký sau đó (trừ khi tên đó bị deny tường minh); danh sách allow sẽ loại trừ tên toàn cục đăng ký sau đó (trừ khi tên đó được allow tường minh). Gỡ một tool toàn cục sẽ xóa nó khỏi mọi view đã giải quyết. Các ngữ nghĩa này vừa giữ được đăng ký nóng (hot registration), vừa làm rõ tường minh sự khác biệt giữa allow và deny.

### Độ sâu là giới hạn tuyệt đối trên cây

Giới hạn độ sâu ràng buộc việc delegation đệ quy độc lập với khả năng hiển thị tool. Agent cấp cao nhất có độ sâu bằng không; sub-agent trong tiến trình có độ sâu bằng độ sâu đã xác thực của cha nó cộng một. `maxDepth` là một số nguyên an toàn, không âm, tuyệt đối, khi độ sâu sub-agent suy ra vượt giới hạn, việc khởi động bị từ chối trước khi quyền sở hữu sub-agent bắt đầu.

Độ sâu cha hiệu lực lấy giá trị lớn hơn giữa `SessionHeader.delegationDepth` bền vững và `AgentOptions.subagentDepth` lúc runtime. Sub-agent trong tiến trình ghi độ sâu suy ra vào header phiên, việc khôi phục sẽ tải lại header đó, do đó khởi động lại không thể làm giảm bộ đếm đệ quy.

Mỗi điểm vào công khai tự xác thực phạm vi giá trị của mình, thay vì phụ thuộc vào một đường cấu hình duy nhất hướng tới model. Giá trị âm, số thập phân, số không âm, giá trị không hữu hạn, số nguyên không an toàn, độ sâu cha lưu trữ sai định dạng và tràn khi suy ra đều bị từ chối. `SubagentStartRequest` trực tiếp có thể bỏ qua giới hạn, để cơ chế này không ràng buộc độ sâu; cấu hình `dsh-tool-subagent` được loader giải quyết mặc định là `3`, chấp nhận override bằng số, và dùng `'provider-managed'` tường minh để bỏ qua giới hạn khi triển khai bên cung cấp ngoài tiến trình sở hữu ngân sách đệ quy riêng. Ba là một giá trị mặc định hữu hạn nhỏ, vẫn cho phép root cộng ba thế hệ hậu duệ: [ví dụ JSON-RPC](../../../../examples/jsonrpc-agent/cordis.yml) áp dụng chính sách chung này, còn ví dụ ACP và headless cố định bằng một. Khi bên cung cấp thiếu `depthLimit`, giới hạn tool bằng số sẽ fail ở giai đoạn gắn bên cung cấp.

Triển khai có thể tổ hợp độ sâu và lọc, nhưng giới hạn số không tổng hợp với bộ lọc. Tool delegation vẫn hiển thị tại giới hạn, vì việc ủy quyền có thể phụ thuộc vào trạng thái runtime; mỗi lần thử khởi động đều kiểm tra độ sâu bền vững và runtime hiện tại của agent gọi, khởi động bị từ chối trả về kết quả tool lỗi, và không publish sub-agent. Triển khai có chính sách hiển thị cố định có thể deny thêm tool delegation trong sub-agent. Cả hai lựa chọn đều không thay đổi hành vi lịch sử hội thoại của bên cung cấp.

### Cổng năng lực giữ bên cung cấp trung thực

Năng lực tách biệt chức năng được yêu cầu khỏi triển khai của bên cung cấp. `SubagentCapabilities` khai báo `persona`, `toolFilter` và `depthLimit`; `SubagentRuntime.start()` kiểm tra từng trường hiện diện trong request theo các cờ này trước khi gọi bên cung cấp.

Điều này cho phép bên cung cấp spawn và fork chia sẻ triển khai trong tiến trình, trong khi bên cung cấp bên ngoài chỉ khai báo phần mà nó có thể cưỡng chế thực thi. Request không bao giờ bị hạ cấp âm thầm: chọn một control không được hỗ trợ sẽ tạo ra `UNSUPPORTED_CAPABILITY`, không có event chạy hay vòng đời nào tồn tại.

### Thiết lập chưa publish giúp request đầu tiên đúng đắn

Mọi tổ hợp cục bộ của sub-agent hoàn tất trước khi sub-agent trở nên có thể quan sát được. Bên cung cấp trong tiến trình cung cấp một callback thiết lập cho việc tạo agent; callback đó cài đặt persona, giới hạn tool và đóng góp output có cấu trúc trong phạm vi sub-agent. Chỉ sau khi thiết lập thành công, việc tạo mới publish phiên và agent, cho phép driver khởi động.

Thiết lập thất bại sẽ rollback sub-agent riêng tư. Không có bên quan sát nào có thể nhìn thấy một sub-agent mà "prompt đầu tiên dùng persona triển khai hoặc bộ tool chưa lọc, các prompt sau mới dùng cấu hình đã yêu cầu".

## Khả năng hiển thị không phải ủy quyền

Các control này tổ hợp hành vi trong cùng một tiến trình đáng tin cậy, chứ không phải hành vi ủy quyền. `toolFilter` thay đổi view sub-agent được registry tool giải quyết ra, nhưng nó không tạo ra một dàn (lattice) ủy quyền từ cha sang con, không yêu cầu sub-agent chỉ giữ tập con ủy quyền của cha, không sandbox hóa plugin, cũng không ngăn code đang giữ một Cordis context khác gọi trực tiếp service.

Cụ thể, tool cục bộ của sub-agent được thêm sau khi lọc toàn cục, có thể không nằm trong view của cha. Sub-agent chỉ-deny cũng vẫn thấy các tool toàn cục đăng ký sau này mà danh sách deny không nêu tên. Đây là các ngữ nghĩa tổ hợp động có chủ đích, không cấu thành đảm bảo không-nâng-quyền.

Thiết kế bảo mật cần biểu diễn ủy quyền độc lập, quy tắc lan truyền và điểm cưỡng chế lúc thực thi. Snapshot ủy quyền lúc tạo, ủy quyền tập con của cha, API ủy quyền tường minh cho tương lai, cùng các nhãn năng lực, output, kết thúc chung đều nằm ngoài phạm vi của tính năng này.

## Các phương án thay thế đã cân nhắc

**Tạo một bên cung cấp cho mỗi persona hoặc bộ tool.** Điều này sẽ nhân bản các bên cung cấp chia sẻ cùng triển khai transport và vòng đời, làm cấu hình triển khai động trở nên cồng kềnh, và vẫn cần cơ chế đệ quy. Trách nhiệm của bên cung cấp là thực thi transport; request mang tổ hợp của mỗi sub-agent.

**Sao chép toàn bộ view tool của cha.** Phạm vi đăng ký được thiết kế phẳng có chủ đích, quyền sở hữu vòng đời không có nghĩa là kế thừa khả năng hiển thị. Sao chép view đã giải quyết còn đóng băng việc đăng ký toàn cục động, và làm mờ ranh giới giữa tổ hợp và ủy quyền khi chưa định nghĩa đầy đủ quy ước nào.

**Chụp snapshot tool toàn cục được phép tại thời điểm tạo sub-agent.** Tập allow đóng băng khiến việc đăng ký trong tương lai luôn không khả dụng, nhưng nó thay đổi ngữ nghĩa đăng ký nóng và mở ra vấn đề thiết kế ủy quyền. Bộ lọc đã triển khai vẫn là một predicate registry đang hoạt động, và ghi lại trực tiếp hành vi allow và deny.

**Chỉ ẩn schema tool.** Lọc chỉ ở lớp hiển thị sẽ cho phép model thực thi qua Code Mode hoặc lời gọi giả mạo một tool mà prompt tuyên bố không tồn tại. Thay vào đó, một resolver duy nhất kiểm soát cả hiển thị và thực thi.

**Mã hóa giới hạn độ sâu thành bộ lọc tool tự động.** Bộ lọc tại thời điểm tạo sẽ chụp snapshot một quyết định có thể phụ thuộc vào trạng thái runtime, chỉ ảnh hưởng một tên tool đã cấu hình, và không bảo vệ bên gọi service trực tiếp hay tool delegation thay thế. Bên cung cấp thay vào đó cưỡng chế giới hạn tuyệt đối tại mỗi lần khởi động.

## Hệ quả

Bên đóng góp có thể cấu hình vai trò, tool toàn cục hiển thị và độ sâu đệ quy của sub-agent, mà không cần định nghĩa bên cung cấp mới. Kiểm tra năng lực fail trước khi quyền sở hữu bắt đầu, thiết lập chưa publish giúp request đầu tiên nhất quán, resolver tool duy nhất ngăn hiển thị/thực thi trôi lệch nhau.

Cái giá phải trả là bên triển khai phải hiểu hành vi allow/deny đang hoạt động cũng như sự khác biệt giữa khả năng hiển thị và ủy quyền. Sau khi chính sách độ sâu hiện tại cấm tạo thêm sub-agent, model vẫn có thể gọi tool delegation đang hiển thị và nhận lỗi. Tác giả bên cung cấp phải khai báo chính xác từng control được hỗ trợ, bên cung cấp trong tiến trình phải cài đặt mọi đóng góp đã yêu cầu trước khi publish. Các control này có chủ đích không giải quyết vấn đề cách ly bảo mật hay không-nâng-quyền từ cha sang con.
