# Agent Note: Đặt hàng phân mảnh đóng gói làm layout JSONL mặc định

Status: implemented

[English](2026-07-26-packed-chunk-rows-by-default.md) | Tiếng Việt

## Vấn đề

Stream của bên cung cấp sinh ra một lượng lớn sự kiện gia tăng `assistant/chunk` cỡ token, phần bao bọc JSON lặp lại của chúng có thể lớn hơn cả payload thực. Session log phải giữ mỗi phân mảnh (chunk) như một sự kiện logic độc lập: việc truyền `session/event` thời gian thực, số thứ tự, `sourceEventSeqs`, replay, bằng chứng hủy (cancellation) và việc stream ra UI đều phụ thuộc vào các ranh giới này.

Seam lưu trữ JSONL có thể giảm phần chi phí bao bọc này mà không thay đổi log logic. Một đoạn có ít nhất 3 sự kiện gia tăng liên tiếp cùng thuộc một khối (block) có thể được mã hóa thành một dòng lưu trữ `text-chunks`, `reasoning-chunks` hoặc `tool-call-chunks`, việc giải mã sẽ dựng lại từng sự kiện gốc, timestamp và số thứ tự. Một giá trị mặc định đáng tin cậy phải bao phủ đồng thời writer ở runtime, cấu hình ở cấp ứng dụng, bộ sinh snapshot, và fixture (dữ liệu chuẩn bị trước cho test) đã được commit vào repo; nếu không, test sẽ đi vòng qua layout mà việc triển khai thực tế ghi ra.

## Quyết định

`dsh-session-persistence-jsonl` sẽ giải nghĩa `packChunks` khi bị bỏ trống thành `true`. Lớp bọc demo ACP (Agent Client Protocol) phơi ra cùng giá trị mặc định này, mọi tổ hợp bỏ trống trường này đều kế thừa việc ghi đóng gói. `packChunks: false` vẫn là chế độ chẩn đoán tường minh ở phía ghi, lưu dưới dạng mỗi sự kiện một dòng.

Việc đọc luôn không bị chi phối bởi option và không phụ thuộc vào layout. File đóng gói, không đóng gói và hỗn hợp đều được nạp thành cùng một `SessionEvent[]` liên tục và giống hệt nhau, do đó thay đổi giá trị mặc định không cần thay đổi phiên bản định dạng session, cũng không cần thực hiện di trú (migration) runtime trên dữ liệu đã lưu trên đĩa. Option này chỉ điều khiển các lô mới được nối thêm, tuyệt đối không lựa chọn mode của reader.

### Sự kiện logic và dòng vật lý

Việc đóng gói nằm trong seam lưu trữ của `dsh-session`, và được triển khai qua `packChunkRuns()` và `decodeStorageRecord()`. Bộ mã hóa nhận diện chính xác hình thái của các sự kiện gia tăng, giữ nguyên các sự kiện không nhận diện được, và chỉ đóng gói các đoạn liên tiếp có ít nhất 3 sự kiện. Dòng đóng gói thuộc về từ vựng lưu trữ, không phải thành viên của `SessionEventMap`: nó tuyệt đối không đi vào `Session.events`, cũng không kích hoạt `session/event`.

Backend JSONL đóng gói mỗi lô được nối thêm bền vững. Chế độ thô `compression: 'none'` mang cùng bản ghi lưu trữ logic với khung Zstandard mặc định; chọn chế độ thô để fixture dễ dàng cho việc review không tắt việc đóng gói. Reader replay và bộ chuẩn hóa trong repo giải mã cùng một định dạng dòng dùng chung, không duy trì bộ encode/decode chuyên biệt riêng cho snapshot.

### Fixture snapshot chuẩn

Mỗi fixture JSONL định dạng session đã commit vào repo đều dùng biểu diễn đóng gói chuẩn. `scripts/session-fixture-layout.snapshot.ts` sẽ phát hiện các file `*.jsonl` đã được theo dõi (tracked) trong toàn bộ repo, cùng với các file JSONL mới chưa được theo dõi mà không bị bỏ qua, chọn ra những file mà bản ghi đầu tiên là header `session`, giải mã toàn bộ bản ghi phần thân, và từ chối nội dung nào khác với đầu ra của `packChunkRuns()`. Do đó, danh sách này bao phủ ACP, headless, TUI, `apps/web`, session cha, session con và cả những tên fixture trong tương lai mà không cần duy trì danh sách đường dẫn.

Các lượt chạy snapshot ACP và headless thu thập đầu ra của backend JSONL mặc định. Writer ở chế độ ghi lại (record mode) của TUI và web sẽ áp dụng `packChunkRuns()` lên các sự kiện trong bộ nhớ trước khi ghi ra fixture. Kịch bản ACP `packed-chunks` được viết tay chạy trong cấu hình thông thường, và giữ lại đầy đủ cả 3 loại dòng đóng gói; quy ước của nó giải mã fixture nguồn và fixture đích riêng biệt trước, rồi khẳng định hai bên bằng nhau theo từng sự kiện.

Các test đóng gói có mục tiêu tập trung giữ lại các đầu vào layout không đóng gói và hỗn hợp để xác thực khả năng tương thích của reader. Các test này không miễn trừ kho ngữ liệu (corpus) snapshot mặc định khỏi yêu cầu layout chuẩn.

### Hội tụ các nhánh đang dang dở

Lệnh tạm thời [`scripts/migrate-packed-session-fixtures.ts`](../../../../scripts/migrate-packed-session-fixtures.ts) cho phép các nhánh đang dang dở hội tụ sau khi merge `master` hiện tại: `pnpm run migrate:packed-session-fixtures` sẽ phát hiện đúng tập fixture cấp repo giống như cổng kiểm tra vĩnh viễn, giữ lại dòng header của từng file, giải mã các bản ghi hỗn hợp hiện có, ghi ra phần thân đóng gói chuẩn, và chứng minh kết quả giải mã bằng nhau cùng với việc thao tác là bất biến khi lặp lại (idempotent). Lệnh này tuyệt đối không gọi model, cũng không tái sinh transcript (bản ghi văn bản) và đầu ra hiển thị.

Chừng nào các nhánh cũ vẫn còn có thể mang theo thay đổi fixture, chính sách test và README snapshot ACP sẽ tiếp tục liên kết tới lệnh này. Khi danh sách PR (Pull Request) đang mở mới nhất xác nhận mỗi nhánh bị ảnh hưởng đều đã được merge, đóng lại, hoặc tuân thủ chuẩn, [đề xuất gỡ bỏ](../../proposed/process/2026-07-26-remove-packed-session-fixture-migrator.md) sẽ xóa CLI này, lệnh package, chương này (phần chuyển tiếp) và các liên kết tài liệu, đồng thời thay thế hướng dẫn khắc phục chỉ áp dụng riêng cho lệnh này trong cổng kiểm tra vĩnh viễn. Bộ chuyển đổi layout chuẩn dùng chung và cổng kiểm tra snapshot vẫn tồn tại vĩnh viễn.

### Quy ước xác thực

Các test persistence JSONL chứng minh: khi bỏ trống option thì dòng đóng gói sẽ được ghi, khi truyền tường minh `false` thì sẽ ghi dưới dạng mỗi sự kiện một dòng, cả hai hình thức đều nạp thành cùng một tập sự kiện y hệt nhau. Test đơn vị của bộ chuyển đổi layout chuẩn bao phủ việc giữ lại header, chuyển đổi từ không-đóng-gói, JSONL không phải session, tính bất biến-khi-lặp-lại của đầu vào đã đóng gói, và đầu vào dị dạng. Cổng kiểm tra snapshot không cần khóa bao phủ mỗi fixture đã commit vào repo và đường dẫn replay đã được lắp ráp; cổng kiểm tra tài liệu thì đảm bảo giá trị mặc định của cấu hình nhất quán với quy ước song ngữ.

## Các phương án thay thế đã từng cân nhắc

**Chỉ lật giá trị mặc định của schema backend.** Cách này sẽ khiến giá trị mặc định của lớp bọc, bộ serialize trực tiếp của TUI/web, fixture hiện có và chính sách fixture trong tương lai vẫn không nhất quán với nhau. Giá trị mặc định chỉ có ý nghĩa khi các tổ hợp đã được giao (delivered) và các test đại diện cho những tổ hợp đó đều dùng cùng một giá trị mặc định.

**Snapshot tiếp tục dùng định dạng không đóng gói để dễ đọc.** Dòng đóng gói vẫn giữ lại tường minh từng mảnh và timestamp, bộ giải mã và bộ chuẩn hóa dùng chung cung cấp việc kiểm tra logic. Nếu để bên tiêu thụ có quy mô lớn nhất trong repo dùng layout khác, việc bao phủ của snapshot sẽ đi vòng qua đường ghi thực tế đã được giao.

**Xóa `packChunks` và luôn luôn đóng gói.** Chỉ giữ một writer thì đơn giản hơn, nhưng đầu ra mỗi sự kiện một dòng vẫn hữu ích cho chẩn đoán và các test tương thích layout hỗn hợp có mục tiêu tập trung. Việc tắt tường minh option này, trong khi vẫn không làm suy yếu giá trị mặc định, giữ lại được những bên tiêu thụ hiện có này.

**Gộp các lô phân mảnh lại thành sự kiện session logic.** Cách này sẽ giảm số lượng sự kiện, nhưng cũng sẽ làm chậm hoặc biến dạng việc truyền thời gian thực, đánh số lại seq của các phân mảnh mà tham chiếu tin nhắn assistant sử dụng, và đòi hỏi mỗi bên tiêu thụ UI và replay phải hiểu một đơn vị stream khác. Đóng gói vật lý được triển khai đằng sau interface persistence hiện có, nhờ đó thu được lợi ích về lưu trữ.

**Giữ lại vĩnh viễn bộ di trú nhánh.** Bộ chuyển đổi layout chuẩn chỉ-đọc và cổng kiểm tra snapshot chịu trách nhiệm cưỡng chế thực thi liên tục. Chỉ khi các nhánh dang dở vẫn còn mang theo layout fixture cũ thì lệnh có khả năng sửa đổi nội dung repo mới có giá trị, do đó đề xuất gỡ bỏ đã giới hạn rõ vòng đời của nó.

## Hệ quả

Việc ghi JSONL thông thường và fixture đã commit vào repo dùng ít dòng vật lý hơn, đồng thời giữ chính xác luồng sự kiện logic. Reader ở runtime chấp nhận mọi layout hiện có, phía vận hành cũng giữ lại chế độ chẩn đoán không-đóng-gói tường minh. Việc xử lý file thô theo từng dòng theo token trở nên bất tiện hơn; các công cụ bên ngoài coi nhầm mỗi dòng sau header đều là một `SessionEvent` sẽ gặp nhãn lưu trữ thường xuyên hơn, còn các reader được hỗ trợ thì gọi `decodeStorageRecord()`.

Repo sẽ phát sinh diff fixture máy móc trên quy mô lớn; việc review nên dựa trên sự thật rằng kết quả giải mã bằng nhau và cổng kiểm tra layout chuẩn, chứ không phải kiểm tra từng dòng, từng token. Repo cũng sẽ tạm thời giữ lại một lệnh di trú nhánh cùng các liên kết của nó; một đề xuất gỡ bỏ riêng biệt sẽ ngăn cơ chế hỗ trợ chuyển tiếp này trở thành một interface quy trình vĩnh viễn.
