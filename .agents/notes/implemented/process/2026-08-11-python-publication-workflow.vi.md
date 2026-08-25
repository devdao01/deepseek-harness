# Agent Note: Workflow publish công khai cho Python SDK

Status: implemented

[English](2026-08-11-python-publication-workflow.md) | 中文

## Vấn đề

Python SDK gồm một wheel client độc lập nền tảng và ba wheel runtime native, chúng phải dùng cùng một phiên bản và được cài đặt như một bộ. Upload lên public PyPI sẽ công khai ngay lập tức metadata và file của package, không thể thay thế file đã upload cùng tên; nếu dependency runtime của đúng phiên bản đó chưa sẵn sàng, sẽ tạo ra một SDK tạm thời không thể sử dụng được. Repo private cần chạy toàn bộ quy trình build và xác minh native mà không publish bất kỳ artifact nào ra ngoài.

## Quyết định

Workflow `Release (Python)` của GitHub cung cấp xác minh không cần credential cho pull request có nhãn `python-release-dry-run` và cho lần chạy thủ công đặt `publish=false`. Cả hai đường đều gọi bộ build wheel native cho cả ba nền tảng, cài đặt tập hợp bản phân phối Linux trên Python 3.10 và 3.14, tải về bốn artifact thu được, xác minh chính xác tên file và metadata package, thực thi giới hạn kích thước file mặc định của PyPI, ghi lại hash SHA-256, và giữ lại một bản tổng hợp candidate release. Các job này chỉ có quyền đọc repo, không có credential registry hay quyền OIDC, sự kiện pull request không thể vào bất kỳ job publish nào.

Khi đặt `publish=true`, lần chạy phải dùng nhãn `python-v<repository-version>` trên repo automation private, khớp `github.repository` của repo đó với biến cấp repo `PYPI_PUBLISHER_REPOSITORY`, tìm thấy `PUBLIC_PYPI_RELEASE_ENABLED=true`, và lần lượt nhận được phê duyệt từ environment GitHub `pypi-runtime` và `pypi` cho việc publish runtime và SDK. Mirror công khai chỉ đọc cung cấp URL metadata package nhưng không chạy Action publish. Chỉ hai job publish có `id-token: write`; PyPI Trusted Publishing sẽ đổi identity của repo private thành credential dự án ngắn hạn, nên repo không lưu PyPI token.

Quá trình publish dùng chính artifact tổng hợp đã được tạo và kiểm tra trong cùng một lần chạy workflow. Mỗi job publish sẽ xác minh `SHA256SUMS` đã giữ lại trước khi chọn file để upload. Một job runtime upload cả ba wheel nền tảng trước, rồi job SDK phụ thuộc vào nó mới upload wheel SDK, vì upload PyPI không phải thao tác nguyên tử, còn SDK sẽ ghim distribution runtime vào đúng phiên bản đó. Cả hai job đều không checkout source code, cũng không rebuild wheel. Việc tách chúng ra giúp cơ chế retry job thất bại của GitHub có thể tiếp tục thực thi khi upload SDK thất bại, mà không cố thay thế file runtime bất biến.

Cả hai action publish đều tắt public attestation. Action vẫn dùng Trusted Publishing để xác thực danh tính, đồng thời không upload provenance vì nó sẽ tiết lộ repo publish private thay vì mirror source công khai.

Phiên bản repo có thể là bản ổn định, hoặc dùng cách viết prerelease được hỗ trợ. Tag giữ nguyên cách viết của repo, còn tên file wheel, metadata, việc ghim phiên bản dependency và tra cứu artifact dùng cách viết PEP 440 đã chuẩn hóa.

`platforms.json` của package runtime là nguồn sự thật cho tag wheel native và tên file thực thi. Bộ build release của repo và Hatch build hook cách ly sẽ lần lượt xác minh và nạp file này. GitHub Actions và GitLab CI đều dùng cùng một kiểm tra deployment target macOS tự có của repo cho file thực thi runtime và spawn helper bắt buộc của nó, nên mỗi file Mach-O trong wheel đều phải khớp với tag nền tảng đã khai báo.

Cả hai build system Python đều ghim dependency dùng Hatchling 1.30.1. Phiên bản Hatchling khả dụng tiếp theo sẽ sinh ra Core Metadata 2.5, mà validator Twine 6.2.0 đang ghim sẽ từ chối phiên bản đó; việc ghim chính xác builder giúp output ở local, GitHub và GitLab giữ nhất quán cho đến khi toolchain xác minh hỗ trợ phiên bản metadata đó.

## Phương án thay thế từng cân nhắc

**Dùng TestPyPI để diễn tập.** TestPyPI là index công khai, upload sẽ lộ tên package, metadata và nội dung wheel trước khi repo mở. Artifact tổng hợp không cần credential cùng package registry GitLab private hiện có có thể bao phủ việc xác minh và diễn tập giao thức upload mà không gây lộ như vậy.

**Dùng PyPI API token dài hạn.** Token được lưu sẽ khiến các bước workflow không liên quan tiếp cận được một secret có thể tái sử dụng, và cần xoay vòng thủ công. Trusted Publishing giới hạn credential vào repo, workflow và environment đã đăng ký, và chỉ sinh credential cho mỗi job publish được bảo vệ.

**Rebuild lại trong job publish.** Build lần hai có thể khác với candidate artifact đã qua smoke test native. Quá trình publish tải về và dùng đúng bộ file đã giữ lại đó, không checkout bất kỳ source code nào.

**Upload SDK trước, rồi mới upload runtime.** Nếu upload sau đó thất bại, SDK sẽ được công khai trước trong khi dependency chính xác của nó vẫn chưa sẵn sàng. Thứ tự ưu tiên runtime giúp thất bại một phần không tạo ra client có thể cài đặt nhưng trỏ đến file bị thiếu.

**Publish từ mirror công khai.** Mirror công khai là source projection chỉ đọc, không chạy Action publish. Nếu gắn PyPI Publisher vào mirror đó, sẽ không có workload nào cung cấp được identity OIDC đã đăng ký.

**Publish public attestation.** Hành vi mặc định của action sẽ làm identity của repo Trusted Publisher có thể xác minh công khai. Provenance đó nhận diện repo automation private chứ không phải mirror source công khai của package, nên job publish tắt nó.

## Hệ quả

Cả candidate release đầy đủ lẫn publish công khai đều chạy từ repo automation private. Khi chọn `publish=true`, chỉ khi biến repo publish, công tắc publish và tag đồng thời xác định đó là một lần publish công khai có chủ đích, workflow mới vào job publish được bảo vệ, nếu không sẽ fail sớm. Mirror code không sao chép các thiết lập repo private này, nên mirror công khai chỉ đọc không thể thỏa mãn kiểm tra ủy quyền.

Owner và tên repo automation private, tên file workflow, cùng environment của từng job (runtime dùng `pypi-runtime`, SDK dùng `pypi`) đều là một phần của identity Trusted Publisher. Khi repo source chuyển chủ, workflow đổi tên hoặc environment đổi tên, phải cập nhật PyPI Publisher bị ảnh hưởng; khi identity repo thay đổi cũng phải cập nhật biến repo publish. Khi mirror công khai chỉ đọc thay đổi, thứ cần sửa là URL metadata package, không phải publish identity.

Publish PyPI giữa hai dự án phân phối vẫn không phải thao tác nguyên tử. Thứ tự ưu tiên runtime thu hẹp trạng thái thất bại có thể thấy được; job publish độc lập và xác minh checksum giúp upload SDK thất bại có thể tiếp tục từ đúng file đã kiểm tra, và không bao giờ thay thế file cùng tên đã upload.

Tắt public attestation nghĩa là từ bỏ provenance mật mã học công khai cho identity upload. Trusted Publishing vẫn xác thực mỗi lần upload, còn artifact tổng hợp được giữ lại sẽ lưu hash wheel đã kiểm tra bên trong workflow publish private.

Khi nâng cấp Hatchling, phải dùng phiên bản Twine đã ghim của pipeline publish để xác minh phiên bản Core Metadata mà nó sinh ra trước, rồi mới sửa đồng thời dependency build của cả hai package.
