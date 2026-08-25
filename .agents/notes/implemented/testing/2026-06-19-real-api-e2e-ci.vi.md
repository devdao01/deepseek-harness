# Agent Note: Chạy kiểm thử e2e với API thật trên DeepSeek API bên ngoài trong CI

Status: implemented

[English](2026-06-19-real-api-e2e-ci.md) | Tiếng Việt

## Vấn đề

Theo chính sách, harness phụ thuộc rất nhiều vào kiểm thử với API thật: [docs/testing.md](../../../../docs/testing.md) chỉ rõ rằng bộ kiểm thử không cần khóa API chỉ chứng minh được đường ống, chứ không chứng minh được sản phẩm; còn [postmortem sự cố inject của ACP (Agent Client Protocol)](../../../../docs/postmortem/0001-acp-default-export-drops-inject.md) là bằng chứng thường trực — trong khi 178 kiểm thử không cần khóa vẫn xanh, phiên ACP với client thật lại sập ngay lập tức. Bộ e2e với API thật (`pnpm run test:e2e`, tức các tệp `*.e2e.ts`) tồn tại chính là để lấp khoảng trống này: nó điều khiển agent (tác tử) trên DeepSeek API trực tuyến — lời gọi mô hình thật, tool bash thật, nhiều lượt, khôi phục, ACP-over-stdio.

Cổng kiểm soát mặc định ([.github/workflows/ci.yml](../../../../.github/workflows/ci.yml)) cố ý không dùng khóa API: nó không mang secret và fork có thể chạy được. `test:e2e` tự bỏ qua khi không có khóa (`describe.skipIf(!process.env.DEEPSEEK_API_KEY)`), nên thêm nó vào workflow đó chỉ khiến kết quả báo xanh chứ không thực sự chạy bộ kiểm thử thật. Muốn độ bao phủ với API thật trở thành tín hiệu merge thì cần một workflow riêng có mang secret.

## Quyết định

Một workflow chuyên dụng tách khỏi ci.yml — [.github/workflows/e2e.yml](../../../../.github/workflows/e2e.yml) — dùng repo secret để chạy trên API bên ngoài và chỉ chạy `pnpm run test:e2e`, chỉ kích hoạt trên các sự kiện đáng tin cậy, kèm một bước preflight: biến secret bị thiếu thành lỗi rõ ràng thay vì màu xanh giả. Workflow không cần khóa vẫn giữ độc lập, nhờ đó cổng chất lượng có thể fork và cổng API thật tiêu thụ secret mỗi bên có chính sách kích hoạt và chính sách thông tin đăng nhập riêng.

### Workflow riêng, không phải một job trong ci.yml

Giá trị của ci.yml nằm ở chỗ nó không cần khóa, fork được, luôn xanh: mọi người đóng góp (kể cả fork bên ngoài) đều nhận được tín hiệu đầy đủ không cần khóa, còn secret thì nằm ngoài bán kính ảnh hưởng. Thêm một job tiêu thụ secret vào đó sẽ gắn cổng luôn-xanh này với tính sẵn có của thông tin đăng nhập và với một chính sách kích hoạt khác. Đặt phần công việc mang secret vào một tệp riêng giúp cách ly secret, điều kiện kích hoạt và chính sách concurrency, đồng thời giữ nguyên đặc tính của ci.yml cho fork. Vòng đời khác nhau → tệp khác nhau.

### Ràng buộc không phải chi phí, mà là độ tin cậy

Chi phí inference (suy luận) nội bộ không phải yếu tố giới hạn, nên workflow được tối ưu cho độ bao phủ và tín hiệu. Nó chạy tất cả các tệp `*.e2e.ts` khớp mẫu trên nhiều điều kiện kích hoạt và trên mọi PR (Pull Request) đáng tin cậy, nhằm hiện thực hóa chính sách có khóa trong [docs/testing.md](../../../../docs/testing.md).

### Điều kiện kích hoạt: chỉ các sự kiện đáng tin cậy

`workflow_dispatch` + `push` vào `main`/`master` + `schedule` hằng đêm (`17 0 * * *`, tức 08:17 giờ Bắc Kinh) + `pull_request`. push cung cấp tín hiệu sau merge; schedule bắt hiện tượng trôi lệch của API bên ngoài; dispatch là lối thoát thủ công; PR đáng tin cậy thì có cổng kiểm soát trước merge. Tín hiệu trước merge này cố ý chấp nhận bề mặt phơi nhiễm khóa lớn hơn như mô tả ở § Bảo mật.

### Cổng kiểm soát cho PR không đáng tin cậy

GitHub giữ lại repo secret đối với hai loại PR: PR đến từ **fork**, và PR của **Dependabot** (nhánh cùng repo, `head.repo.fork == false`, nhưng secret vẫn bị giữ lại). Một `if:` ở cấp job sẽ bỏ qua toàn bộ job cho cả hai:

```
github.event_name != 'pull_request'
  || !(github.event.pull_request.head.repo.fork || github.event.pull_request.user.login == 'dependabot[bot]')
```

Mệnh đề Dependabot dựa trên **tác giả** PR (`pull_request.user.login`) chứ không dựa trên `github.actor` (người kích hoạt lần chạy): khi maintainer mở lại hoặc chạy lại PR của Dependabot, `github.actor` sẽ thành một con người, nhưng PR đó vẫn không có khóa; phán đoán dựa trên tác giả vẫn đúng trong tình huống này. Job bị bỏ qua bởi `if:` ở **cấp job** sẽ được báo cáo là check *thành công* (khác với việc bỏ qua ở cấp workflow/trigger sẽ giữ trạng thái pending), nên nếu cần đánh dấu workflow này là required status check thì cũng an toàn — check xanh-nhưng-bị-bỏ-qua của PR fork/Dependabot sẽ không chặn merge.

Cổng này là *một tiện ích để bỏ qua sạch sẽ*, không phải ranh giới bảo mật của secret (xem § Bảo mật — ranh giới chính là cơ chế giữ lại secret của bản thân GitHub đối với fork dưới `pull_request`). Không có cổng này thì fork vẫn không đọc được khóa; chỉ là sẽ gặp lỗi cứng khó hiểu ở bước preflight và lãng phí tài nguyên tính toán.

### Preflight: lỗi rõ ràng, tuyệt đối không báo xanh giả

Vì job chỉ chạy trên các sự kiện đáng tin cậy nơi secret lẽ ra phải tồn tại, preflight là một phép kiểm tra sự tồn tại vô điều kiện: khóa rỗng → `exit 1` kèm chú thích `::error::` chỉ rõ tên secret cần cấu hình. Đây chính là mấu chốt giúp một bộ kiểm thử tự-bỏ-qua có thể an toàn đóng vai trò cổng kiểm soát. Không có nó, secret bị xóa/đổi tên/cấu hình sai sẽ khiến `test:e2e` bỏ qua toàn bộ bộ kiểm thử thật và báo cáo xanh hết — cả tấm lưới an toàn suy thoái trong im lặng. Bộ bảo vệ này biến "secret bị thiếu" từ một lần pass giả vô hình thành một lỗi nhìn thấy được. (Tính đúng đắn của nó đã được kiểm chứng trong thực tế: lần chạy trước khi secret tồn tại đã thất bại đúng tại bước này.)

### Ánh xạ secret và vệ sinh an toàn

Repo secret được đặt tên là `DEEPSEEK_API_KEY_EXTERNAL`; nó được ánh xạ sang biến môi trường `DEEPSEEK_API_KEY` mà adapter và kiểm thử đọc (`process.env.DEEPSEEK_API_KEY`). Tên secret riêng biệt ghi lại ý định (đây là khóa API công khai *bên ngoài*, không phải khóa của endpoint nội bộ), và cho phép khóa của endpoint nội bộ sau này cùng tồn tại mà không xung đột. Các lựa chọn vệ sinh an toàn dưới đây đều mang tính phòng thủ:

- **Secret ở cấp bước.** `DEEPSEEK_API_KEY` chỉ được đặt trong `env:` của bước preflight và bước e2e, không bao giờ ở cấp job — nhờ đó checkout/setup-node/install không bao giờ nhìn thấy nó. Script vòng đời lúc cài đặt bị xâm nhập trong một dependency không thể đọc được secret không có trong môi trường của nó.
- **`permissions: contents: read`.** Job chỉ đọc repo để chạy kiểm thử; không cần quyền ghi (không bình luận PR, không ghi status), nên `GITHUB_TOKEN` bị hạ xuống mức quyền tối thiểu.
- **`DEEPSEEK_BASE_URL` được cố định** thành `https://api.deepseek.com` ở bước e2e. Adapter vốn mặc định dùng giá trị này khi không được đặt ([packages/llm/llm-deepseek/src/index.ts](../../../../packages/llm/llm-deepseek/src/index.ts) `PUBLIC_BASE_URL`), nhưng cố định tường minh thì tự mô tả và kín kẽ — tệp `.env` ở thư mục gốc repo (nếu tồn tại, `vitest.e2e.config.ts` sẽ nạp nó) không thể âm thầm chuyển hướng lần chạy sang endpoint khác.
- **Không echo secret.** preflight chỉ in `DEEPSEEK_API_KEY present.` — không in giá trị hay độ dài.

### Phạm vi và hình thái lúc chạy

Job chỉ chạy `test:e2e` trên Node 24; cổng không cần khóa và tính tương thích phiên bản thuộc về workflow CI chính. Kiểm thử chạy ở dạng chưa build thông qua ánh xạ workspace paths, dùng pool worker có giới hạn và cấu hình được, retry theo từng kiểm thử và timeout ở cấp job. Các lần chạy PR bị thay thế sẽ bị hủy, còn lần chạy push và schedule thì chạy trọn vẹn để cung cấp tín hiệu sau merge.

Phép thăm dò `web_search` gốc của DeepSeek đã được đăng ký nhưng sẽ bị bỏ qua. Endpoint tương thích Anthropic trực tuyến có thể trả về phản hồi thành công nhưng không có khối nguồn có cấu trúc, nên việc khẳng định dương tính về sự tồn tại của nguồn không phải tín hiệu merge đáng tin cậy; kiểm thử đơn vị vẫn khóa hành vi phân tích phản hồi, nhưng CI không kiểm chứng định dạng giao thức (wire format) của khối nguồn do endpoint trực tuyến trả về.

## Bảo mật

Secret CI đầu tiên của repo cần một mô hình mối đe dọa được ghi chép, vì quyền truy cập của PR cùng repo, PR từ fork và PR của Dependabot là khác nhau, và nó sẽ thay đổi khi repo được công khai.

### Hiện tại ai chạm được tới secret (repo private)

- **Không có quyền ghi (PR từ fork): không.** Hai sự thật độc lập ngăn điều đó. Thứ nhất, workflow dùng `pull_request` chứ **không** dùng `pull_request_target` — GitHub không truyền repo secret cho lần chạy `pull_request` của PR fork, nên `secrets.DEEPSEEK_API_KEY_EXTERNAL` được phân giải thành rỗng trên runner của fork. Thứ hai, cổng `if:` bỏ qua hoàn toàn PR từ fork. Việc giữ lại secret mới là ranh giới thực sự; cổng chỉ là phòng thủ theo chiều sâu và trải nghiệm người dùng.
- **Có quyền ghi (push): có.** PR từ nhánh cùng repo sẽ nhận được secret, nên tác giả có quyền ghi có thể sửa mã kiểm thử (hoặc script vòng đời cài đặt, hoặc YAML workflow trên nhánh của họ) để lấy cắp khóa. Đây **là đặc tính cố hữu của GitHub Actions, không phải do tài liệu này tạo ra**: bất kỳ ai có quyền push vào bất kỳ repo nào cũng có thể viết một workflow để lấy cắp bất kỳ Actions secret nào của repo đó. Quyền ghi ⇒ quyền truy cập secret, luôn luôn như vậy. Biện pháp giảm thiểu nằm ở việc ai được cấp quyền ghi và ở branch protection, chứ không nằm ở tệp này.

Vì vậy, nói "ai mở PR cũng lấy cắp được nó" là sai: chỉ những người trong tập có quyền ghi mới làm được, mà những người đó thì vốn dĩ đã có thể lấy cắp bất kỳ secret nào repo đang giữ.

### Bề mặt phơi nhiễm dôi thêm do trigger `pull_request`

Do đã bật lần chạy trên PR, khóa sẽ được trao cho **mã nằm trên nhánh PR của tác giả có quyền ghi** trước khi merge. Điều này tạo bề mặt phơi nhiễm lớn hơn so với chỉ `push` + `schedule` + `workflow_dispatch`, và được chấp nhận để có tín hiệu trước merge trong tập người có quyền ghi đáng tin cậy. Nếu đánh đổi này thay đổi, có thể bỏ trigger `pull_request` mà vẫn giữ độ bao phủ sau merge, hằng đêm và theo yêu cầu.

### Điều gì thay đổi khi repo được công khai

**Thông qua workflow này**, secret vẫn được bảo vệ trước công chúng: `pull_request` hành xử nhất quán trên repo công khai — PR từ fork (giờ ai cũng mở được) vẫn không nhận được secret, và trên repo công khai GitHub còn yêu cầu thêm việc maintainer phê duyệt lần chạy của PR fork, mà ngay cả sau khi phê duyệt thì lần chạy đó cũng không nhận được secret (phê duyệt lần chạy không đồng nghĩa với trao khóa). Tập người có quyền ghi không thay đổi theo khả năng hiển thị, nên thực tế đối với người bên trong cũng không đổi.

Thứ trở nên tệ hơn là mô hình *xung quanh*, và dưới đây là những việc cần xử lý trước khi đảo khả năng hiển thị:

- **Log trở nên đọc được trên toàn cầu.** Một lần echo secret bất cẩn mà hôm nay chỉ rò rỉ cho thành viên tổ chức, sau khi công khai sẽ rò rỉ ra toàn bộ Internet và bị thu thập trong vài phút. Kỷ luật xử lý secret (không echo giá trị/độ dài — đã làm được) trở nên quan trọng hơn rất nhiều.
- **Cái bẫy `pull_request_target` trở nên thảm khốc.** Nếu ai đó chuyển trigger sang `pull_request_target` để "sửa" lần chạy trên PR, workflow sẽ chạy mã fork không đáng tin cậy trong ngữ cảnh base-repo và **mang theo** secret — một vector rò rỉ khóa hoàn chỉnh. Trong repo private thì điều này tạm coi là vô hại, còn trong repo công khai thì là thảm họa. Chú thích `SECURITY —` trên phần trigger trong e2e.yml cấm thay đổi này và trỏ tới tài liệu này.
- **Xoay khóa khi đảo trạng thái.** Khóa đã từng tồn tại trong CI của một repo private; hãy coi việc công khai là "giả định đã bị lộ" và xoay `DEEPSEEK_API_KEY_EXTERNAL` ngay tại thời điểm đó.
- **Đưa secret vào tầm kiểm soát.** Xác nhận Settings → Actions → *"Send secrets to workflows from fork pull requests"* vẫn **tắt** (đây là thiết lập duy nhất thực sự phá vỡ ranh giới fork), và cân nhắc chuyển khóa vào một **Environment** của GitHub có required reviewers, để ngay cả mã đã merge cũng chỉ dùng được nó trong điều kiện được kiểm soát, và việc xoay khóa có một đầu mối chịu trách nhiệm duy nhất.

Không điều nào ở trên đòi phải sửa workflow mới công khai được; chúng là các bước vận hành, cộng với chú thích bảo vệ chống `pull_request_target` đã được thêm vào.

## Các phương án đã cân nhắc

- **Thêm một job tiêu thụ secret vào ci.yml**: bác bỏ. Sẽ gắn cổng không-cần-khóa, fork-được, luôn-xanh với tính sẵn có của thông tin đăng nhập và với chính sách trigger/concurrency khác; vòng đời khác nhau thì tệp khác nhau.
- **Bỏ trigger `pull_request`** (bề mặt phơi nhiễm khóa nhỏ hơn): bác bỏ để giữ tín hiệu trước merge; phần Bảo mật chứa phân tích phơi nhiễm đã được chấp nhận.

## Hệ quả

Thêm một workflow CI và secret đầu tiên của repo cần được duy trì. Bộ kiểm thử API thật giờ đây đóng vai trò cổng merge (cổng trước merge trên PR đáng tin cậy, cổng sau merge trên nhánh chính) và chạy hằng đêm, nhờ đó các lỗi thật trong tương tác giữa agent và API bên ngoài sẽ lộ ra trong CI thay vì chỉ xuất hiện ở lần chạy cục bộ của lập trình viên — cái giá là mỗi PR đáng tin cậy và mỗi lần merge đều phát sinh lời gọi API thật (dù nội bộ thì miễn phí). Preflight khiến việc cấu hình sai secret tự tố cáo chính nó thay vì âm thầm vô hiệu hóa tấm lưới an toàn.

Thiết kế này đi kèm một bề mặt ràng buộc đã được ghi chép: đánh đổi về phơi nhiễm khóa của trigger `pull_request` (bỏ nó đi sẽ tăng mức bảo vệ), sự phụ thuộc của cổng `if:` vào phép kiểm tra Dependabot dựa trên tác giả, và lệnh cấm nghiêm ngặt đối với `pull_request_target`. Danh sách kiểm tra cho repo công khai ở trên là phần đi kèm về vận hành — maintainer tương lai nên đọc lại Agent Note này trước khi thay đổi tập trigger hoặc chuyển đổi khả năng hiển thị của repo, thay vì tự suy dẫn lại mô hình fork/secret từ đầu.

Trigger schedule sẽ tự động bị vô hiệu hóa sau 60 ngày repo không hoạt động (hành vi của GitHub); push/PR/dispatch là phương án dự phòng, và một monorepo đang hoạt động sẽ không chạm tới giới hạn này. Giả định là runner có kết nối ra ngoài tới `https://api.deepseek.com` — `ubuntu-latest` do GitHub lưu trữ đáp ứng điều kiện này; runner tự lưu trữ bị hạn chế kết nối ra ngoài thì cần xác nhận kết nối trước khi dựa vào lần chạy hằng đêm.
