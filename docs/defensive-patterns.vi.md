# Mẫu phòng thủ

[English](defensive-patterns.md) | Tiếng Việt

Các quy tắc về loại lỗi phải trả giá mới có được: mỗi mẫu dưới đây là một loại lỗi đã thực sự phát hành hoặc suýt phát hành trong dự án này, được phát biểu dưới dạng quy tắc nhằm ngăn nó tái diễn. Hãy đọc bài này trước khi viết mã vòng đời, đồng thời, tiến trình con hoặc dọn dẹp. Các quy tắc tương ứng ở tầng kiểm thử (đường vào thật, kiểm chứng kết quả thực tế, quyền sở hữu tài nguyên) xem [testing.md](testing.md).

## Báo cáo độc lập các kết quả trực giao

Một kết quả có thể đồng thời mang nhiều tính chất: một tiến trình có thể đã hết thời gian chờ nhưng vẫn kết thúc với mã thoát 0 vì nó bắt tín hiệu kết thúc. Mỗi sự kiện độc lập (`timedOut`, `signal`, `exitCode`) phải được báo cáo riêng; đừng bao giờ lồng việc báo cáo một cờ vào nhánh của một cờ khác, nếu không bên gọi có thể hiểu nhầm một lần chạy bị kết thúc sớm là thành công bình thường.

## Cả hai phía đều phải tuân thủ cam kết công khai

Khi một implementation nhận nhiều cách biểu diễn của cùng một kết quả, hãy chuẩn hóa chúng trước khi trả về qua API công khai. Implementation của `LlmAdapter.stream()` có thể ném ngoại lệ hoặc phát `finish {kind:'error'|'aborted'}`, nhưng `LlmRuntime.stream()` chỉ phơi bày lỗi của model request qua phân mảnh finish mang tính kết thúc; lỗi của middleware và lỗi của bên tiêu thụ vẫn được ném dưới dạng ngoại lệ. Nhờ vậy bên tiêu thụ không phải đoán xem ngoại lệ bắt được rốt cuộc đến từ provider, lớp bao, việc ghi log phân mảnh hay từ chính logic lắp ráp của mình. Hãy ghi lại cam kết sau chuẩn hóa ngay tại nơi định nghĩa kiểu; phủ mọi dạng nguồn bằng một bên tiêu thụ thật.

## Trạng thái bất đồng bộ không phải trạng thái đồng bộ

`agent.followup()` không có trạng thái hoàn thành hay kết quả theo từng thông điệp; việc hoàn thành của tác vụ nền cạnh tranh với ranh giới lượt; `reader.close()` kích hoạt trong cả hai trường hợp EOF và dispose (giải phóng tài nguyên). Đừng bao giờ coi `agent/status` hay `whenIdle()` là kết quả của một lần `followup()`: nhiều thông điệp tiếp nối đã xếp hàng, steering (dẫn hướng giữa chừng) và công việc được tiêm vào có thể dùng chung một khoảng `running`, còn việc hủy hoặc giải phóng tài nguyên có thể loại bỏ những mục chưa khởi động. Bên gọi tự động thực sự sở hữu một lần chạy phải định nghĩa khoảng của mình một cách tường minh — ví dụ từ biên nhận inbox bền vững của thông điệp cho tới lần kế tiếp toàn bộ agent (tác tử) trở về `idle` — và mô tả bất kỳ đầu ra nào chọn ra là đầu ra của cả khoảng đó, chứ không quy nhân quả cho thông điệp ấy. Quy tắc này có hai chiều: nếu chuyển đổi đang chờ không bao giờ xảy ra thì việc chờ sẽ treo, nên phải xử lý tường minh nhánh «không cần chờ».

## dispose phải dừng hẳn hoàn toàn, không chỉ là yêu cầu dừng

Nếu quy trình dọn dẹp chỉ phát tín hiệu kết thúc hoặc hủy rồi trả về mà không chờ công việc thực sự dừng lại, nó sẽ để lại tiến trình mồ côi. Logic dọn dẹp nên dùng luồng bất đồng bộ và chờ tiến trình con thoát (sau khi phát tín hiệu kết thúc thì chờ `done`); ngoài ra nên đóng registry của listener và registry thông báo trước khi kết thúc tiến trình, để các sự kiện hoàn thành đến muộn giữ im lặng.

## Cô lập ngoại lệ của callback trong bộ phân phát

Listener do người dùng cung cấp nếu ném ngoại lệ thì không được làm promise chứa nó bị reject, cũng không được bỏ đói các listener xếp sau nó. Hãy bọc vòng lặp phân phát bằng try/catch và ghi log; một subscriber hành xử sai tuyệt đối không được phá vỡ vòng đời lõi.

## Không bao giờ để lộ biến môi trường hoặc đường dẫn đoán được ra đầu ra không đáng tin

Lệnh được khởi chạy nên dùng biến môi trường đã được làm sạch, loại bỏ các mục có tên khớp `*KEY*`, `*SECRET*`, `*TOKEN*` hoặc `*PASSWORD*`, để ngăn thông tin xác thực của harness rò rỉ qua đầu ra lệnh, `env` hay tệp spill. Tệp tạm và tệp spill nên đặt trong thư mục riêng có quyền 0700, dùng tên tệp ngẫu nhiên, và mở theo cách độc quyền, chỉ chủ sở hữu truy cập được (`'wx'`, `0o600`); đường dẫn đoán được và ai cũng đọc được sẽ dẫn tới tranh chấp symbolic link và rò rỉ thông tin.

## Dùng unlink để xóa đường dẫn dạng liên kết

Với đường dẫn có thể là symbolic link hoặc junction trên Windows, hãy xác định trước bằng `lstatSync().isSymbolicLink()` rồi xóa bằng `unlinkSync`: unlink chỉ xóa chính liên kết và từ chối thư mục thật, nên không bao giờ đi theo liên kết vào đích của nó. Trên Windows, gọi `rmSync(link)` cho junction sẽ ném `ERR_FS_EISDIR`; xóa đệ quy có thể xuyên qua junction vào đích của nó. Chỉ dùng `rmSync` kèm `recursive` cho thư mục thật.
