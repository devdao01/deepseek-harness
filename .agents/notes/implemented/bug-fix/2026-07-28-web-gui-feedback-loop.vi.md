# Agent Note: Thay đổi Web GUI khép kín trên URL hiện có

Status: implemented

[English](2026-07-28-web-gui-feedback-loop.md) | Tiếng Việt

## Vấn đề

Web agent (tác tử thông minh) vừa không nhận diện được GUI đang chứa phiên hiện tại, vừa không biết người dùng đang xem URL nào. [Quyết định về runtime context](2026-07-28-web-agent-runtime-context.md) cung cấp dữ kiện thứ nhất, nhưng việc chỉnh sửa GUI vẫn không có mục tiêu nghiệm thu khả thi: chỉnh sửa mã nguồn, build sản phẩm, tiến trình đang lắng nghe và trang người dùng đã mở chỉ là những quan sát rời rạc, không liên hệ với nhau. Các lối vào mà repository cung cấp khiến những phương án thay thế sai lầm trông có vẻ hợp lý, bởi `apps/web/package.json` phơi bày `vite` dưới dạng script `dev`, còn Vite trần vẫn trả về HTTP 200 ngay cả khi không thể inject `window.__DSH_BOOT__`.

[Bản phân tích sự cố](../../../../docs/postmortem/0003-web-agent-gui-feedback-loop.md) ghi lại tập trung dòng thời gian nhật ký sự kiện và giải thích vì sao các kiểm tra cũ lại chấp nhận nhầm trang, tiến trình và cổng.

## Quyết định

Tổ hợp `dsh web` thông thường sẽ mount plugin `web-runtime` của bundle Web, và plugin này phát ra một URL loopback chuẩn tắc, đồng thời đưa nó vào vừa dưới dạng thông tin định vị giao diện mà model nhìn thấy được, vừa dưới dạng dữ kiện shell được quản lý. Đoạn prompt `app:web-surface` nêu rõ: các tham chiếu không giới hạn sẽ trỏ tới GUI này, và cung cấp URL; `DSH_WEB_URL` truyền cùng dữ kiện đó vào mỗi lần gọi bash tiền cảnh hoặc bash nền được quản lý. Đoạn này giữ nguyên ranh giới «không ngầm có được DOM, route hay ảnh chụp màn hình», và cũng không khẳng định rằng bí danh trong mạng LAN đồng nhất với địa chỉ thực tế trong trình duyệt. Profile sở hữu prompt đầy đủ sẽ đặt `surfaceContext` của dòng cấu hình đó thành false, và sẽ không nhận đoạn prompt này lẫn biến được quản lý này; bộ khởi động Web cũng dùng chính thiết lập đó để chặn đoạn prompt về source checkout của nó.

Prompt giao cho agent, chứ không phải người dùng, trách nhiệm với các quy ước khởi động ẩn. Đầu nhận HMR (thay thế module nóng) luôn được mount, nhưng để plugin phía client tự động nạp lại thì còn cần tiến trình lắng nghe `pnpm run dev:web` chạy trong cùng một checkout, và agent sẽ xác minh điều này trước khi cam kết rằng có thể cập nhật mà không cần refresh. Thay đổi ở lớp vỏ và các package thông thường khác vẫn cần build lại sản phẩm bị ảnh hưởng rồi refresh URL hiện có. Trừ khi người dùng yêu cầu, agent sẽ không khởi động một GUI thay thế.

Cả script dev của `apps/web` lẫn cấu hình Vite đều từ chối chế độ serve trước khi mở cổng. Thông tin chẩn đoán sẽ chỉ ra rằng `apps/web` chỉ là một lớp vỏ dùng cho việc build, giải thích rằng chỉ `dsh web` mới inject `window.__DSH_BOOT__`, và đưa ra đường dẫn tới lối vào production và lối vào HMR. Chế độ build của Vite giữ nguyên.

Khi sản phẩm tĩnh thay đổi, không cần khởi động lại hay thay thế server chỉ vì lý do đó. Host đọc `index.html` và tài nguyên tĩnh ở mỗi request, bundle phía client cũng được phục vụ từ tệp hiện tại và đặt `no-cache`; do đó, sau khi build lại lớp vỏ liên quan và bundle plugin, refresh URL hiện có chính là đường nghiệm thu. Khởi động một server khác chỉ chứng minh được rằng server khác đó chạy được. Nếu người dùng nêu rõ yêu cầu khởi động thêm một server chạy dài, thì quy ước tác vụ nền được quản lý hiện có chịu trách nhiệm về vòng đời và thông báo hoàn tất của nó; `&` của shell không thay thế được cơ chế vòng đời này.

## Kiểm chứng

Kịch bản trình duyệt fresh-round-trip không cần khóa sẽ khởi động tổ hợp Web đã bàn giao, điều khiển một phiên phát lại thật, tạo snapshot cho tiền tố system prompt có chứa URL, rồi gọi công cụ bash đã lắp ráp, chứng minh `$DSH_WEB_URL` khớp với runtime thực sự đang bind. Bài smoke test CLI thật sẽ khởi động `dsh web` và bắt request tới nhà cung cấp model, qua đó cố định trọn vẹn quy ước phát triển hai lệnh. Bài test watcher `dev:web` sẽ build lại bundle client biệt lập sau khi mã nguồn thay đổi; kịch bản HMR trên trình duyệt sẽ khởi động `dsh web`, sửa một bundle trong roster ban đầu, và quan sát DOM mới trong khi identity của trang không đổi. Bài test tiến trình con Vite thật yêu cầu chế độ serve thoát một cách tự nhiên sau khi đưa ra thông báo sửa lỗi khuyên chuyển sang dùng host đầy đủ, đồng thời dùng `Server.listen()` được đo đạc để chứng minh nó chưa từng được gọi. Bài test web server loader thật sẽ ghi đè tài nguyên tĩnh sau khi tiến trình hoàn tất bind, và chứng minh cùng cổng đó trả về các byte mới. Các khẳng định này kiểm tra trạng thái prompt, trạng thái thoát của tiến trình, đầu ra shell, identity của DOM và byte HTTP, chứ không phải lời tuyên bố thành công của agent.

## Các phương án đã cân nhắc

**Chỉ mở rộng system prompt.** Không áp dụng, vì như vậy công cụ vẫn không có được mục tiêu, giữ lại lối đi Vite trần gây hiểu nhầm, và không chứng minh được tiến trình hiện có quan sát sản phẩm vừa build lại như thế nào.

**Xóa script dev của `apps/web` nhưng không thêm bảo vệ cho Vite.** Không áp dụng, vì lệnh thực sự được dùng trong sự cố là `npx vite`, vốn đi vòng qua script của package. Bản thân chế độ serve phải thất bại.

**Tự động khởi động lại hoặc thay thế tiến trình Web hiện tại sau mỗi lần chỉnh sửa.** Không áp dụng, vì server tĩnh vốn đã đọc sản phẩm hiện tại ở mỗi request, việc khởi động lại còn làm gián đoạn chính phiên đã phát ra yêu cầu chỉnh sửa, còn việc nạp lại plugin phía client do chuỗi HMR luôn được mount cộng với watcher `pnpm run dev:web` đảm nhiệm.

**Gửi DOM, route hoặc ảnh chụp màn hình ở mỗi request.** Hoãn lại cho một cơ chế đầu vào có ghi nhận, được thiết kế riêng. Định danh URL ổn định là đủ để khép kín vòng phản hồi lần này, đồng thời không khẳng định rằng host nắm được trạng thái trình duyệt mà nó không hề nhận được.

## Ảnh hưởng

Prompt Web thông thường sẽ có thêm một đoạn URL động, nên việc tái sử dụng tiền tố của nhà cung cấp model sẽ thay đổi theo cổng được bind. Tiến trình Bash tương ứng sẽ có thêm một biến môi trường được quản lý, không nhạy cảm. Vite trần không còn dùng được như một sandbox thị giác chỉ dựa vào shell; nhà phát triển nên chuyển sang dùng host đầy đủ hoặc chế độ build. Đổi lại, công việc GUI có một mục tiêu duy nhất mà cơ chế có thể quan sát được, agent có thể giải thích cho người dùng chính xác tiến trình đang thực sự chứa phiên của họ được cập nhật ra sao, và các lối khởi động không được hỗ trợ sẽ thất bại trước khi xuất hiện màn hình trắng. Quy ước URL sẽ dẫn dắt agent tránh dùng cổng thay thế, nhưng không cấm lệnh shell tùy ý khởi động dịch vụ thay thế. Profile tắt `surfaceContext` cũng từ bỏ chỉ dẫn khép kín vòng phản hồi này cùng với context shell.
