# Agent Note: Thu hẹp seam dòng lệnh về đúng các interface đã có

Status: implemented

[English](2026-08-11-cmdline-seam-trim.md) | Tiếng Việt

## Vấn đề

Dòng lệnh do ứng dụng tự sở hữu ([ghi chú](2026-08-06-app-owned-command-line.md)) khi giao đã mang theo ba seam rộng hơn nhu cầu của consumer: một máy trạng thái kích hoạt row trong bộ nhớ được vendor (`Entry.enableRuntime`, cộng thêm `enableRow` xuất từ `dsh-cmdline` — một package dòng lệnh lại sở hữu khái niệm của Loader) mà công dụng duy nhất là row reload có điều kiện `--dev`, một protocol symbol `EntryConfigResolver` được vendor mà chỉ có duy nhất Include hiện thực, và bộ khởi động vẫn nhận diện row `headless-runner` — dùng nó để chọn exit code cho SIGTERM, gác việc theo dõi user patch, và cung cấp seam `headlessIo` trùng lặp với `ctx.appExit`.

## Quyết định

Cả ba đều chuyển sang biểu đạt bằng các interface đã tồn tại sẵn:

- **Không còn dev row có điều kiện.** Chuỗi reload không còn mang tính điều kiện: `dsh-web-app` mount row `client-hmr` vô điều kiện, `--dev` bị xóa cùng với cấu hình `mode` của web runtime, quy ước prompt rẽ nhánh theo mode và biến bash `DSH_WEB_MODE`. Khi không có watcher rebuild (`pnpm run dev:web`) ghi lại client bundle, các file mà chuỗi này poll không bao giờ thay đổi và giữ trạng thái nhàn rỗi, nên một row luôn bật chỉ tốn một chu kỳ poll stat và một route SSE. `Entry.enableRuntime`, hai trường trạng thái của nó và `enableRow` bị xóa mà không có gì thay thế.
- **Cấu hình vật mang cây.** Include chuyển sang khai báo marker `EntryGroup.key` đã có sẵn, không còn hiện thực `EntryConfigResolver`; hook của Loader giữ cấu hình của mỗi vật mang cây ở dạng literal. Bản thân `path` của Include mất hỗ trợ `!!js` — chưa từng có cấu hình nào dùng nó, bài test cố định hành vi đó chuyển sang khẳng định quy ước vật mang cây dạng literal.
- **Kiến thức về ứng dụng của bộ khởi động.** Bộ khởi động không còn nhận diện bất kỳ row ứng dụng nào. SIGTERM là một yêu cầu dừng thông thường từ tiến trình giám sát, thoát với mã 0 trên mọi surface (SIGINT vẫn là 130); bộ khởi động không có cách nào biết ứng dụng có coi công việc là đã hoàn thành hay chưa, còn mã 143 trước đây phụ thuộc vào việc gọi đích danh row headless. Mỗi lần khởi động đều theo dõi lớp user patch — surface chạy một lần thoát qua quá trình shutdown có giới hạn, khi shutdown sẽ dispose watcher trước rồi mới rút cạn event loop. headless runner thoát qua `ctx.appExit` như mọi ứng dụng khác; luồng output của nó là seam test `internals` trong package, `ctx.headlessIo` bị xóa.

## Các phương án đã cân nhắc

- **Giữ `enableRuntime` nhưng chuyển `enableRow` ra khỏi `dsh-cmdline`**: việc di dời sửa được ranh giới package, nhưng vẫn giữ lại máy trạng thái được vendor, mà ngữ nghĩa của nó (vẫn có hiệu lực sau khi apply lại, rollback khi thất bại) phải suy luận lại mỗi lần đồng bộ upstream.
- **`entry.update({ disabled: null })`**: ghi lại tùy chọn được serialize của entry, lần include apply lại kế tiếp sẽ khôi phục `disabled: true` và unmount row đó giữa phiên.
- **Giữ SIGTERM 143 cho surface chạy một lần thông qua signal handler do ứng dụng đăng ký**: handler của chính bộ khởi động sẽ cạnh tranh exit code với nó; để thắng cuộc đua đó cần một interface mới ở bộ khởi động, mà đây đúng là chi phí mà thay đổi lần này muốn loại bỏ.
- **Giữ `--dev`, chuyển sang tạo row đó lúc runtime**: đây là hình thái trung gian của thay đổi lần này; nó vẫn cần rẽ nhánh theo mode trong quy ước prompt, biến `DSH_WEB_MODE`, và việc phân xử giữa row tạo ra với row do người dùng tự sở hữu, tất cả chỉ để tiết kiệm một vòng poll nhàn rỗi có chi phí không đáng kể.

## Hệ quả

- Các deployment giám sát `dsh --profile headless` bằng SIGTERM giờ quan sát thấy exit code 0 thay vì 143; tín hiệu là do chính bên gọi gửi, và trên stdout không có câu trả lời nào.
- Chuỗi reload chạy trong mọi tiến trình `dsh web`; deployment nào không được phép phơi bày `/plugins/events` nên tắt row `client-hmr` ở lớp patch của mình.
- Lần chạy một lần sẽ mount row theo dõi cấu hình vốn trước đây bị bỏ qua, khởi động tốn thêm vài mili-giây.
- Độ lệch của Loader/Include được vendor giảm đi một protocol symbol và một máy trạng thái, `rescope-vendor:check` lại pass (mục rescope trong nhật ký sửa đổi quay về đúng vị trí mà anchor chỉnh sửa chính xác của nó yêu cầu).
