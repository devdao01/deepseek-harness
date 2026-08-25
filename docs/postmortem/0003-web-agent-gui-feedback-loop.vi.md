# Phân tích sự cố (postmortem) 0003: Web agent (tác tử) xác minh máy chủ thay thế, chứ không phải GUI hiện tại của nó

[English](0003-web-agent-gui-feedback-loop.md) | Tiếng Việt

Trạng thái: đã giải quyết

## Tóm tắt

Web agent đã sửa mã nguồn GUI, nhưng không biết phiên hiện tại tương ứng với URL nào, do tiến trình nào phục vụ. Nó giao việc xác minh lại cho người dùng, sau đó trong tình huống `window.__DSH_BOOT__` bị thiếu khiến trang trắng, vẫn coi HTTP 200 do Vite trần trả về là thành công; cuối cùng, dù trang gốc thực ra đã nạp sản phẩm đã build lại, nó lại đi xác minh một máy chủ `dsh web` thay thế trên một cổng khác. Bản sửa làm cho URL hiện tại và chế độ chạy trở nên hiển thị với mô hình và có thể truy vấn qua shell, từ chối khởi động trước khi Vite độc lập bắt đầu lắng nghe, và xác minh việc refresh ở chế độ production cùng HMR (Hot Module Replacement) ở chế độ development dựa trên trạng thái bên ngoài.

## Tổng quan

Phiên này chạy trong DeepSeek Harness Web GUI trên cổng 3081, còn Workspace mà người dùng chọn là thư mục `test/` rỗng. Request của mô hình không nêu rõ GUI này, cũng không cung cấp thư mục checkout mã nguồn, URL, tiến trình hay chế độ cập nhật của nó. Repo cung cấp script phát triển Vite trong `apps/web`, còn tổ hợp trình duyệt đầy đủ do `dsh web` cung cấp.

Mỗi hành động phát sinh từ đó nhìn riêng lẻ đều hợp lý, nhưng không cùng trỏ tới một mục tiêu xác minh. Việc sửa mã nguồn, build thành công, HTTP 200, manifest (tệp mô tả metadata) khởi động đã tiêm vào, và trang mà người dùng đang mở ban đầu, đều bị coi là những sự thật có thể thay thế lẫn nhau.

Nguồn bằng chứng là log sự kiện bền vững của `session-3eb796c2-5159-4686-affe-df8719f6f987`, với cwd ghi ở header là `/Users/tn.shen/Documents/deepseek-harness-gui-master/test`. Header request ban đầu nằm ở seq 6; việc bàn giao cho người dùng, khởi động Vite trần, khởi động host thay thế, dò tìm manifest khởi động, và lần dò cổng 3081 đầu tiên, lần lượt nằm ở seq 30939, 31865, 34309, 34441 và 34681. Dòng thời gian dưới đây dựa trên các sự kiện này, không suy ngược ý định từ báo cáo sau đó.

## Ảnh hưởng

Người dùng đã phải liên tục chỉ ra ba lỗi: agent giao việc xác minh lại cho người dùng; trang được đề xuất xem trước lại trắng trơn; báo cáo thành công cho một URL không phải trang mà người dùng đang dùng. Một máy chủ thay thế không được quản lý còn tiếp tục chạy sang lượt kế tiếp, cho đến khi người dùng đặt câu hỏi.

Lần điều tra này không khởi động lại hay sửa đổi hai dịch vụ thử nghiệm chỉ-đọc trên cổng 3081 và 3082.

## Dòng thời gian

- Ở lượt thứ 2, sau khi agent sửa chủ đề (theme), nó yêu cầu người dùng chạy `pnpm run demo:tui` hoặc mở một ứng dụng Web không nêu rõ, trong tin nhắn tại seq 30939. Nó không thực hiện bất kỳ bước xác minh nào đối với ứng dụng Web đã tổ hợp.
- Ở lượt thứ 3, agent đọc `apps/web/package.json`, khởi động Vite trần trên cổng 5173 tại seq 31865, quan sát thấy HTTP 200 rồi tuyên bố thành công. Nhưng trình duyệt lại ném lỗi `client-modules: window.__DSH_BOOT__ is missing or not an object`, và hiển thị trang trắng.
- Ở lượt thứ 4, agent tìm ra đường khởi động đầy đủ `dsh web`, build lại shell, khởi động một tiến trình không được quản lý trên cổng 3334 tại seq 34309, và chỉ kiểm tra dịch vụ thay thế này có trả về 200 và manifest khởi động hay không tại seq 34441. Nó chưa bao giờ dò cổng 3081.
- Ở lượt thứ 5, người dùng báo cáo tại seq 34556 rằng cổng 3081 đã hiển thị chủ đề mới. Mãi đến seq 34681, agent mới kiểm tra các tiến trình hiện có và gỡ bỏ máy chủ dư thừa.

## Nguyên nhân gốc

Tổ hợp Web không cung cấp cho mô hình thông tin danh tính về GUI hiện tại, URL chuẩn, hay chế độ chạy. cwd của phiên xác định đúng Workspace mà người dùng đã chọn, nhưng mô hình lại coi thư mục dự án này là thư mục ứng dụng. Hệ thống cũng không lưu bền vững mối liên kết giữa thư mục checkout mã nguồn GUI, sản phẩm build, tiến trình phục vụ, origin đích và việc xác minh trên trình duyệt.

Vite trần trả về HTTP 200 khiến đường khởi động sai trông có vẻ hợp lý. `window.__DSH_BOOT__` chỉ được host đầy đủ tiêm vào, do đó tầng truyền tải sẵn sàng không đồng nghĩa với ứng dụng đã sẵn sàng. Regression test đầu tiên lặp lại chính lỗi này theo một cách khác: sau khi cơ chế timeout kết thúc Vite, khẳng định thoát khác 0 vẫn pass. Việc tái hiện thực tế đã phơi bày báo cáo dương tính giả (false positive) này.

agent còn dùng `&` của shell để bỏ qua ngữ nghĩa tiến trình nền, do đó danh tính tác vụ, thông báo hoàn tất, thu thập kết quả và cơ chế dọn dẹp đều không có hiệu lực. Việc xác minh cổng 3334 chỉ chứng minh được rằng dịch vụ thứ hai có thể hoạt động.

## Các biện pháp bảo vệ đã bổ sung

- Bộ khởi động Web phát hành URL loopback chuẩn và chế độ production/development thực tế trong phân đoạn prompt `app:web-surface` được ghi log, cùng các biến môi trường `$DSH_WEB_URL`/`$DSH_WEB_MODE` được quản lý.
- Hướng dẫn chế độ production yêu cầu build lại sản phẩm, và xác minh URL hiện có sau khi refresh. Hướng dẫn chế độ development nêu rõ `dsh web --dev` chỉ mount receiver HMR; `pnpm run dev:web` trong cùng thư mục checkout mã nguồn còn phải build lại bundle plugin client, và thay đổi ở Web shell cùng package thông thường vẫn cần refresh trang.
- Chế độ phục vụ Vite độc lập của `apps/web` sẽ từ chối khởi động ở giai đoạn cấu hình. Test tiến trình con của nó xác minh tiến trình tự thoát tự nhiên, và chèn instrument vào `Server.listen()`, đảm bảo việc bind cổng dù ngắn ngủi cũng không bị bỏ sót.
- Độ phủ test theo nhiều tầng, trên đường đi thực, bao phủ request CLI (giao diện dòng lệnh), prompt chính xác cho chế độ production/development, sự thật runtime của shell, việc thay thế sản phẩm tĩnh trên cùng cổng, việc watcher mã nguồn build lại, việc host poll trạng thái (stat), và HMR trên trình duyệt với danh tính trang không đổi.
- Bằng chứng của PR (Pull Request) giữ lại ảnh chụp màn hình của phiên 3081 gốc, cùng ảnh so sánh trước/sau việc sửa GUI do mô hình thực sự điều khiển; việc xác minh dựa trên kết quả quan sát từ bên ngoài của trình duyệt, HTTP, tiến trình và log phiên.

## Bài học

- agent phải biết trước các tiền điều kiện runtime ẩn thì mới có thể hướng dẫn người dùng; chế độ khởi động thuộc về ngữ cảnh ứng dụng, không nên phụ thuộc vào việc truyền miệng trong nhóm.
- HTTP sẵn sàng, build thành công, và manifest khởi động là những sự thật khác nhau. Việc xác minh phải chỉ định rõ chính xác origin, và quan sát từ bên ngoài xem thay đổi được yêu cầu có thực sự có hiệu lực trên origin đó hay không.
- Dịch vụ thay thế không thể chứng minh trang hiện có đã thay đổi. Khi thực sự nhận được yêu cầu khởi động một tiến trình chạy dài, hãy dùng vòng đời tác vụ được quản lý.
- Regression test phải nhắm đúng vào cơ chế thất bại đã báo cáo. Tiến trình timeout không đồng nghĩa với fail nhanh, và cổng khả dụng sau khi tiến trình thoát cũng không chứng minh được rằng cổng đó chưa từng bị bind.
