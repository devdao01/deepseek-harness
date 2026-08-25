# Agent Note: Đóng theo signal có giới hạn và buộc thoát khi lặp signal cho Web và headless

Status: implemented

[English](2026-08-03-cli-signal-shutdown-escalation.md) | 中文

## Vấn đề

Sau khi mount telemetry mặc định, lệnh `dsh web` và headless (nay là `dsh --profile headless`) đã thêm handler SIGINT/SIGTERM, để khi process thoát có thể drain hết cây plugin Cordis, thay vì làm mất dữ liệu telemetry còn đang xếp hàng. Mỗi handler dùng một latch (chốt) boolean một chiều, và chỉ thoát sau khi `ctx.fiber.dispose()` đã kết toán (settle). Khi headless hoàn tất bình thường, nó cũng chờ vô hạn để toàn bộ cây thực hiện dispose (giải phóng tài nguyên).

Sau đó có user tái hiện được: lệnh headless bị treo ngay sau khi in ra observation URL, bấm `Ctrl+C` nhiều lần cũng không phản hồi; đặt `DSH_TELEMETRY_DISABLED=1` thì hết treo, còn một Node signal handler độc lập trong cùng sandbox Linux vẫn nhận được SIGINT bình thường. Điều này khoanh vùng disposer đang chờ kết toán vào telemetry, chứ không phải việc chuyển tiếp signal ở terminal. `BatchLogRecordProcessor.shutdown()` của OTel sẽ chờ `exporter.forceFlush()` trước, rồi mới chờ Promise hoàn tất bị giới hạn bởi `exportTimeoutMillis`; còn `forceFlush()` của OTLP exporter thì chờ trực tiếp Promise HTTP đang chạy. Do đó, khi kết nối proxy/sandbox không bao giờ lấy được socket, dù đã cấu hình cả hai timeout của SDK, việc đóng phía provider vẫn sẽ treo chờ mãi.

Latch sau đó biến lỗi telemetry này thành một CLI (command-line interface) không thể chấm dứt: luồng hoàn tất bình thường đã đang chờ một lần dispose gốc duy nhất; SIGINT đầu tiên sẽ gia nhập cùng lần dispose đang chờ kết toán đó, và đặt signal latch; SIGINT sau đó sẽ return ngay tại latch, nên process không còn đường thoát nào nữa. Khi nhận signal trước lúc hoàn tất bình thường cũng rơi vào tình trạng chờ vô hạn tương tự. Web dùng cấu trúc latch giống hệt như vậy.

Timeout riêng của telemetry không thể chứng minh toàn bộ cây plugin đều kết toán được. Bất kỳ disposer nào hiện tại hoặc trong tương lai đều có thể treo; ranh giới process vừa phải giữ cơ hội đóng graceful lần đầu, vừa phải để lại đường buộc thoát cho user.

## Quyết định

Việc sửa được chia làm hai lớp trách nhiệm. Backend OTel bọc thêm `shutdownTimeoutMillis` quanh Promise đóng hoàn chỉnh của SDK provider (giá trị mặc định và giá trị triển khai đều là 3 giây). Quá deadline đó sẽ kết toán ở trạng thái reject, và đi vào đường cách ly lỗi hiện có của telemetry coordinator, cho phép cây plugin Cordis hoàn tất dispose; vì OTel không công khai khả năng hủy Promise truyền tải, các bản ghi đang chờ xử lý có thể bị mất.

Web và headless dùng chung `createProcessShutdown`, một bộ điều khiển cấp process được xây dựng quanh lần dispose gốc:

- Nhiều lần gọi đóng bình thường sẽ hội tụ vào cùng một lần dispose, và giữ lại exit code của yêu cầu đầu tiên; các lệnh gọi này không kích hoạt buộc thoát lẫn nhau. Sau khi dispose thành công, bộ điều khiển ghi exit code đó qua `process.exitCode`, để Node tự nhiên drain hết các handle còn lại; khi dispose thất bại vẫn buộc thoát, vì launcher không thể giả định cây plugin thất bại đã dừng hoàn toàn ổn định.
- Signal đầu tiên sẽ khởi động cùng một lần dispose graceful đó, và đặt một cơ chế thoát dự phòng 5 giây có giữ reference. Dispose dù thành công hay thất bại đều sẽ kích hoạt và chỉ kích hoạt đúng một lần thoát; kết quả nào cũng không thể hủy việc process thoát.
- Nếu nhận signal trong lúc đang chờ đóng kết toán, sẽ buộc thoát ngay lập tức theo exit code của đường signal đó. Điều này bao gồm cả lần `Ctrl+C` đầu tiên nhận được khi headless đã hoàn tất bình thường và đã vào dispose, lẫn signal thứ hai nhận được sau khi việc drain do signal khởi động.
- Ngưỡng 5 giây là bất biến an toàn của process, không phải một tham số điều chỉnh theo deployment. Nó đủ để bao phủ thời hạn drain thông thường của deployment telemetry, đồng thời vẫn đặt giới hạn chờ ở ranh giới launcher cho bất kỳ disposer nào bị treo.

Luồng hoàn tất bình thường cố ý tránh gọi `process.exit()`: buộc thoát ngay sau khi một request Undici vừa hoàn tất có thể kích hoạt [assertion async handle libuv trên Windows của Node](https://github.com/nodejs/node/issues/56645) khi việc dọn dẹp handle gốc chưa kịp drain xong. Nếu dispose bình thường đã hoàn tất, nhưng vẫn còn handle khác giữ process sống, signal vẫn có thể buộc thoát.

headless vẫn thoát với 0 khi turn hoàn tất, thoát với 1 cho lý do kết thúc turn khác hoặc lỗi nghiệp vụ API, thoát với 130 cho SIGINT, và thoát với 143 cho SIGTERM. Web giữ nguyên hành vi hiện có: SIGTERM thoát với 0, SIGINT thoát với 130.

Quyết định này thay thế giả định trong [Agent Note về triển khai telemetry](../feature/2026-07-31-web-telemetry-default-mount.md) rằng timeout của SDK exporter/processor có thể giới hạn toàn bộ luồng đóng của provider, đồng thời thay thế quyết định hoãn lại cơ chế thoát dự phòng cấp process trong note đó. Backend chịu trách nhiệm về chính sách mất dữ liệu export và độ trễ, đồng thời bịt khoảng hở đã biết của `forceFlush()` trong SDK; launcher chịu trách nhiệm về đảm bảo lớp ngoài cùng, bảo đảm không plugin nào có thể giữ process mãi mãi.

## Các phương án đã cân nhắc

**Chỉ giới hạn `shutdown()` của telemetry backend.** Vẫn không đủ: nó bảo vệ được lần chờ OTel đã biết, nhưng không bảo vệ launcher khỏi disposer của các plugin khác.

**Khôi phục hành vi thoát ngay lập tức mặc định của Node khi nhận signal.** Không chọn: khi nhận signal đầu tiên, luồng khỏe mạnh vẫn nên flush dữ liệu telemetry và giải phóng tài nguyên khác. Thoát ngay lập tức là đường buộc thoát tường minh, không phải hành vi mặc định.

**Chỉ thêm timeout 5 giây.** Không chọn: khi user bấm `Ctrl+C` lần nữa, đó là yêu cầu dừng chờ ngay lập tức. Nếu tiếp tục nuốt ý định đó trong phần thời gian gia hạn còn lại thì chỉ rút ngắn thời gian xảy ra lỗi đã báo cáo, chứ không giải quyết vấn đề.

**Luôn gọi `process.exit()` sau khi dispose thành công.** Không chọn: dispose gốc chỉ chứng minh được cây plugin của app đã dừng hoàn toàn ổn định, không chứng minh được Node và các dependency gốc của nó đã thu hồi hết mọi async handle. Đặt `process.exitCode` vừa giữ được status code đã yêu cầu, vừa để runtime hoàn tất phần việc còn lại đó.

## Hệ quả

Luồng thoát bình thường khỏe mạnh vẫn thực hiện dispose toàn bộ cây plugin Cordis, sau đó chờ Node event loop tự nhiên drain hết. Lần chờ telemetry đã biết sẽ được giải phóng sau tối đa 3 giây; các luồng thoát khác nếu treo, khi không có input tiếp theo, sẽ chờ tối đa 5 giây; khi nhận signal, cả luồng hoàn tất bình thường đang drain handle lẫn luồng đóng đang chờ kết toán đều sẽ kết thúc process ngay lập tức. Buộc thoát hoặc thoát bị giới hạn deadline có thể làm gián đoạn việc export telemetry hoặc công việc dọn dẹp chưa hoàn tất; chỉ khi thỏa thuận đóng graceful đã thất bại, hoặc user yêu cầu buộc thoát tường minh, kết quả này mới được chấp nhận một cách có chủ đích.

Bộ điều khiển này thuộc về hạ tầng launcher, không phải plugin Cordis: nó không khẳng định rằng dispose đã hoàn tất, cũng không làm suy yếu quy tắc vòng đời buộc mọi disposer thông thường phải đạt trạng thái dừng hoàn toàn ổn định.

## Kiểm thử

`apps/cli/tests/process-shutdown.spec.ts` cố định các hành vi: hoàn tất tự nhiên sau khi dispose thành công, buộc thoát sau khi dispose thất bại, cơ chế thoát dự phòng 5 giây, việc hội tụ các lệnh gọi bình thường, dispose khởi động bởi signal, signal ngắt dispose bình thường hoặc drain handle sau dispose, và hành vi buộc thoát khi có signal thứ hai.

`apps/cli/tests/headless-shutdown.e2e.ts` khởi động trong PTY cây plugin Loader Web/headless đã triển khai thật, và mount một plugin chỉ dùng cho test; disposer của plugin đó sẽ khai báo đã bước vào quá trình dọn dẹp, nhưng không bao giờ kết toán. Test gửi SIGINT sau khi địa chỉ observation xuất hiện, chờ bằng chứng dispose đã khởi động, gửi SIGINT lần nữa, và yêu cầu process thoát với 130. Bộ phân giải khởi động source/artifact khiến cả hai mặt phẳng thực thi đều bao phủ cùng một hồi quy. Kịch bản PTY này bao phủ trạng thái process mà user nhìn thấy được; snapshot output của model không thay đổi.

`packages/session/session-telemetry-otel/tests/otel.spec.ts` giữ một request OTLP thật đang mở sau khi việc export định kỳ bắt đầu, và cố định hành vi: ngay cả khi `forceFlush()` của SDK vẫn đang chờ kết toán, dispose của Cordis vẫn sẽ trả về khi `shutdownTimeoutMillis` hết hạn. Sau đó test giải phóng collector, để Promise của provider vẫn đang được quan sát kết toán một cách sạch sẽ.
