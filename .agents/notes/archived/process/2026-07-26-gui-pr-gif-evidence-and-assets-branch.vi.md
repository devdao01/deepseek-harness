# Agent Note: Bằng chứng GIF cho PR GUI và phát hành lên nhánh assets

Status: implemented

Archived: 2026-07-27

[English](2026-07-26-gui-pr-gif-evidence-and-assets-branch.md) | 中文

## Vấn đề

PR (Pull Request) thay đổi hành vi mà người dùng sản phẩm nhìn thấy trong GUI, trước đây chỉ có thể được review qua mô tả bằng văn bản và tên test, cả hai đều không thể hiện được kết quả render. Skill (kỹ năng) tương ứng [Ghi hình GIF demo trình duyệt](../../../skills/record-browser-gif/SKILL.md) có thể sinh ra GIF local đáng tin cậy và trung thực, nhưng cố ý dừng lại ở sản phẩm local, nên mỗi PR muốn trình bày GIF lại phải tự mò mẫm lại cách phát hành; trong khi việc commit GIF vào nhánh của PR chưa bao giờ được chấp nhận: media nhị phân đi vào lịch sử sẽ tăng vĩnh viễn kích thước của mọi lần clone sau này.

Bản thân quy trình ghi hình cũng đang liên tục học lại từ những lần thất bại: ảnh chụp ghi ra ngoài thư mục gốc được công cụ trình duyệt cho phép hoặc ghi vào thư mục không tồn tại sẽ thất bại ngay khi chụp; trạng thái UI thoáng qua khi polling qua nhiều lượt gọi công cụ sẽ bị mất, vì giữa các lượt gọi đã settle xong; dùng khớp substring để phán đoán hoàn thành sẽ trúng phải phần echo lại của chính prompt người dùng; gán biến môi trường nội tuyến trên lệnh encoder thì không có tác dụng vì tham số được mở rộng trước khi gán.

## Quyết định

Mỗi PR thay đổi hành vi GUI mà người dùng sản phẩm nhìn thấy đều đi kèm một GIF demo được ghi bằng [record-browser-gif skill](../../../skills/record-browser-gif/SKILL.md), nguồn của nó phải là thật: khởi động từ chính cây nhánh của PR đó, server thật, API key thật, lượt chạy model thật, và ghi rõ nguồn tại nơi nhúng. Chỉ được dùng nguồn fixture (dữ liệu chuẩn bị trước cho test) khi người dùng yêu cầu rõ ràng.

GIF được phát hành lên một nhánh assets mồ côi (orphan) chuyên dụng: nhánh này không có commit cha, chỉ chứa media, GIF không bao giờ vào nhánh riêng của PR; một nhánh assets phục vụ cho cả một chuỗi PR (các nhánh hiện có: `code-mode-ui-assets`, `pr-613-assets`). Việc phát hành thực hiện trong một bản clone tạm thời, nông, một nhánh duy nhất, message commit có dạng `assets: <what it shows> gif (#<pr>)`, phần thân PR nhúng bằng blob URL kèm hậu tố `?raw=true` bắt buộc. Nhánh assets chỉ cho phép thêm vào (append-only): phần thân PR đã merge sẽ tham chiếu URL của nó vĩnh viễn, do đó nhánh assets không bao giờ được rewrite hay xóa.

Bản thân việc ghi hình vẫn không gây tác dụng phụ; việc phát hành là một bước hoàn thiện có ranh giới, chỉ được skill thực hiện khi tác vụ bao gồm việc đính GIF vào PR. [record-browser-gif skill](../../../skills/record-browser-gif/SKILL.md) vẫn là hợp đồng hiện hành cho phần ghi hình.

Skill này còn tiếp thu kinh nghiệm vận hành đúc kết từ thực tiễn ghi hình: file frame đặt trong thư mục `.playwright-mcp/` bị `.gitignore` của repo bỏ qua và được tạo trước khi chụp, vì công cụ trình duyệt chỉ có thể ghi vào thư mục gốc được phép của nó, tên file tương đối cũng được phân giải tương đối so với gốc repo; mỗi PR khởi động service từ chính cây nhánh mà nó tự build, kèm thư mục làm việc tạm thời hoàn toàn mới, mỗi kịch bản ghi hình mở một session mới, khi dừng server thì khớp chính xác theo PID thay vì dùng mẫu tên tiến trình rộng; trạng thái thoáng qua được chụp bằng cách điều khiển một thao tác foreground chậm, và polling một dấu hiệu DOM cụ thể trong cùng một lượt gọi script trình duyệt; phán đoán hoàn thành khớp phần tử văn bản chính xác thay vì substring; encoder chạy sau một dòng export `GIF_SKILL_DIR` riêng biệt, thời lượng từng frame để trạng thái ổn định cuối cùng dừng lâu nhất, và đối chiếu cả tóm tắt JSON lẫn kiểm tra bằng mắt GIF đã encode.

## Các phương án thay thế đã cân nhắc

**Commit GIF vào nhánh của PR.** Media nhị phân được merge vào nhánh mặc định sẽ ở lại trong lịch sử, ảnh hưởng tới mọi lần clone và pull sau này; giá trị của GIF demo chỉ dừng lại ở khâu review, nhưng cái giá thì không bao giờ biến mất.

**Upload dưới dạng đính kèm GitHub.** Upload `user-attachments` tạo ra bằng thao tác kéo-thả không dùng được cho workflow dòng lệnh, không thể tái tạo hay kiểm toán từ repo, và vòng đời của media cũng nằm ngoài tầm kiểm soát của repo.

**Lưu GIF bằng Git LFS.** LFS vẫn gắn media vào lịch sử của nhánh code, thêm một dependency hạ tầng cho mỗi lần clone và pull CI, so với nhánh cô lập mà git thường đã hỗ trợ sẵn thì không có lợi ích gì thêm.

**Mỗi PR một nhánh assets.** Tạo nhánh theo từng PR sẽ khiến namespace ref lan rộng, và nhân bản clone tạm thời trong một chuỗi lên nhiều lần; mỗi chuỗi một nhánh giúp việc phát hành chỉ cần một lần push, đồng thời vẫn cô lập khỏi lịch sử code.

**Để việc phát hành nằm ngoài skill ghi hình.** Đây là trạng thái trước đây; nó giữ được ranh giới sạch, nhưng khiến mỗi PR phải tự mò lại cùng một quy trình. Ranh giới này giờ được giữ lại dưới dạng điều kiện tường minh: chỉ phát hành khi tác vụ bao gồm việc đính GIF vào PR, chứ không thể hiện qua việc bỏ sót.

**Để GIF là tùy chọn trong mỗi PR.** Bằng chứng tùy chọn chính là thứ sẽ biến mất dưới áp lực tiến độ đúng lúc cần nó nhất; review thay đổi GUI mà không có bản ghi hình đồng nghĩa với việc yêu cầu người review tự tưởng tượng kết quả render hoặc tự build lại nhánh.

## Hệ quả

Mỗi PR GUI đều mang theo bằng chứng trực quan có ghi rõ nguồn, người review không cần build lại nhánh vẫn thấy được thay đổi. Lịch sử repo vẫn không chứa media; cái giá chuyển sang nhánh assets chỉ-thêm-vào: chúng sẽ tiếp tục tăng trưởng, có thể clone nông với chi phí thấp, và không bao giờ được xóa. Việc bắt buộc ghi hình từ nguồn thật thêm một lượt chạy dùng key thật, lượt model thật vào workflow của mỗi PR GUI, đây là chủ đích, vì chính lượt chạy đó là bằng chứng. Phần ghi hình vẫn có thể hoàn tác ở local; tác vụ không yêu cầu đính GIF vào PR vẫn kết thúc bằng một sản phẩm local đã được kiểm chứng.
