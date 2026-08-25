# Agent Note: GIF trình duyệt giữ một chuỗi bằng chứng duy nhất

Status: implemented

[English](2026-08-08-browser-gif-evidence-chain.md) | Tiếng Việt

## Vấn đề

Storyboard của bản demo trình duyệt có thể gồm toàn ảnh chụp màn hình thật, nhưng vẫn không chứng minh được rằng các ảnh chụp đó đến từ cùng một lần thực thi thật. Tái sử dụng trạng thái toàn cục của ứng dụng có thể lẫn vào cấu hình hoặc session cũ; tự động hóa việc ghi hình có thể vô tình gộp cảnh quay của các lần chạy mô hình khác nhau; transcript (bản ghi văn bản) chat có thể cho thấy việc xử lý fallback thành công, mà không hề hé lộ việc từ chối tool nào đã kích hoạt fallback đó. Việc so khớp mờ theo tên khả năng tiếp cận (accessibility name) cũng có thể nhầm lẫn phần echo của prompt hay văn bản phái sinh thành kết quả mong đợi.

Việc ghi hình môi trường production ở chế độ headless còn có thêm hai ranh giới. Cấu hình mặc định của sản phẩm có thể mở giao diện hệ điều hành gốc mà tự động hóa không thao túng được, mà việc thay thế giao diện đó bằng mock hay hook test đồng nghĩa GIF không còn thể hiện đường dẫn production nữa. Sau khi publish, việc git push thành công cũng không chứng minh được GIF trong repo riêng tư có thể truy cập được, hay GitHub có thể nhận diện Markdown của PR (Pull Request) là hình ảnh.

## Quyết định

Luồng công việc [`record-browser-gif`](../../../skills/record-browser-gif/SKILL.md) coi một bộ storyboard là bằng chứng đầy đủ cho cùng một lần thực thi, và gắn cố định vào head chính xác của PR. Trước khi build, luồng công việc yêu cầu worktree sạch và ghi lại commit SHA của nó. Mỗi lần chạy dùng `DSH_HOME`, `DSH_AGENTS_HOME`, workspace, session và trạng thái trình duyệt cô lập hoàn toàn mới; mọi khung hình phát hành đều đến từ cùng một server và cùng một lần thực thi kịch bản do mô hình điều khiển. Khi không thể tạo context trình duyệt hoàn toàn mới, phải xóa cookie và storage của origin đó trước khi điều hướng. Chỉ khi người dùng yêu cầu hoặc thực sự cần thiết mới được dùng trạng thái trình duyệt sẵn có của người dùng; phải ghi chú việc dùng trạng thái đó cạnh GIF, và không được lấy nó làm bằng chứng cho trạng thái client hoàn toàn mới. Khi ghi hình thất bại, hãy bỏ lần chạy đó và thực thi lại từ thư mục gốc trạng thái hoàn toàn mới, không gộp với lần chạy khác.

Tự động hóa trình duyệt sẽ đợi trạng thái ngữ nghĩa duy nhất và chính xác. Nếu cần chứng minh việc gọi tool, từ chối hay khôi phục, storyboard phải chứa khung hình chi tiết hoặc khung hình dấu vết: nêu rõ tool, hiển thị trạng thái hoặc mã lỗi ổn định của nó, và trình bày kết quả tiếp theo. GIF được encode cuối cùng luôn là đối tượng cần xác thực; nếu người xem không thể phát hoạt hình, phải decode khung hình đại diện từ chính GIF đó, không được coi ảnh chụp nguồn là bằng chứng tương đương.

Vẫn nên ưu tiên dùng luồng công việc điều khiển trình duyệt sẵn có. Nếu luồng đó không khả dụng, chương trình ghi hình nên dùng dependency Playwright đã khai báo trong repo trong một trình duyệt headless cô lập, thay vì cài driver khác hay mở trình duyệt của người dùng. Chỉ khi chọn backend production chính thức và có thể thao tác bằng trình duyệt thông qua cấu hình ứng dụng bình thường, mới được thay thế giao diện production gốc, và phải ghi chú việc override này cạnh GIF. Fixture (dữ liệu tiền đề kiểm thử), tầng transport mock, sự kiện tổng hợp và hook chỉ dùng cho test đều không thể làm căn cứ cho tuyên bố về triển khai production thật.

Khâu publish sẽ xác minh lại ranh giới một lần nữa. Branch assets chỉ chứa file media, byte đã stage và đã publish phải khớp với artifact đã xác thực; đối với asset trong repo riêng tư, nên kiểm tra đường dẫn, kích thước byte, checksum, trạng thái phản hồi và loại media qua API đã xác thực hoặc request nội dung thô. Điều này chỉ chứng minh được đường dẫn truy cập review của thành viên repo; [quyết định về ảnh trên trang tài liệu](2026-08-06-doc-site-carries-its-images.md) giải thích lý do site công khai không thể phụ thuộc vào URL nội dung thô riêng tư. Trước khi sửa nội dung PR, phải xác nhận lại head online vẫn giống head lúc ghi hình. Sau khi sửa cũng phải kiểm tra lại head online, và nó phải giữ nguyên giá trị đã ghi nhận; renderer Markdown của GitHub thì cần sinh riêng ảnh mong đợi.

## Các phương án đã cân nhắc

**Cho phép dùng cảnh quay từ các lần chạy khác nhau miễn là trạng thái quan sát được trông tương đương.** Sự giống nhau về mặt hình ảnh không chứng minh được các cảnh quay chia sẻ cùng trạng thái, có thứ tự nhân quả, hoặc đến từ cùng một lần thực thi kịch bản. Việc ghi hình lại cần thực hiện thêm một lượt mô hình thật, nhưng giữ được tuyên bố mà toàn bộ storyboard thể hiện.

**Coi transcript chat là bằng chứng đầy đủ cho việc khôi phục tool.** Câu trả lời cuối cùng chứng minh được nhiệm vụ đã hoàn thành, nhưng có thể che giấu việc tool nào đã được gọi, lỗi có phải lỗi có cấu trúc hay không, và mô hình có khôi phục từ lỗi đó hay không. Khung hình dấu vết hoặc khung hình chi tiết có thể mang trực tiếp các sự kiện này.

**Dùng fixture hoặc hook test để thay thế UI gốc không truy cập được.** Cách này đơn giản hóa tự động hóa bằng cách thay đổi đường dẫn sản phẩm được quan sát. Chọn backend production chính thức qua cấu hình bình thường vừa giữ được triển khai được test là thật, vừa nêu rõ chế độ chạy hẹp hơn được sử dụng.

**Tin tưởng việc push branch assets thành công, hoặc dựa vào request ẩn danh.** Push chỉ chứng minh git đã chấp nhận các byte tương ứng, còn repo riêng tư sẽ cố tình từ chối request nội dung thô chưa xác thực. Việc xác thực byte có xác thực và xác minh render Markdown của GitHub bao phủ hai ranh giới publish mà người review thực sự sử dụng.

## Hệ quả

Bằng chứng GUI giờ chứng minh được một lần thực thi có quan hệ nhân quả, không còn coi các cảnh quay đáng tin từ các lần thực thi khác nhau là bằng chứng cho cùng một lần thực thi; người review có thể kiểm tra cả lỗi tool có cấu trúc lẫn kết quả hoàn thành cuối cùng. Trước khi nội dung PR được coi là hoàn tất, việc xác minh publish có thể phát hiện head PR cũ, file media hỏng hoặc sai vị trí, và Markdown ảnh không hợp lệ.

Luồng công việc này chiếm thêm trạng thái tạm; sau khi ghi hình thất bại, có thể cần chạy lại thêm một lượt kịch bản do mô hình thật điều khiển; thường sẽ tăng thêm một khung hình chi tiết và một lần kiểm tra publish có xác thực. So với desktop tương tác, ghi hình headless có ít backend production khả dụng hơn; mỗi backend được chọn sẽ được ghi chú cạnh GIF.
