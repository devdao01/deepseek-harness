# Agent Note: Kiểm chứng pull request bắt buộc cho Python runtime

Status: implemented

[English](2026-08-12-required-python-runtime-pull-request-ci.md) | Tiếng Việt

## Vấn đề

CI của pull request thông thường chạy toàn bộ bộ pytest của Python SDK đối chiếu với một đầu bên kia runtime kiểu fake, trong khi snapshot của Node lại dùng client và expected output khác. Client Python thật, tệp thực thi JSON-RPC đã đóng gói, snapshot dành riêng cho exe, gói wheel ở dạng phát hành và bản cài đặt sạch chỉ hội tụ trong workflow tệp thực thi đơn tùy chọn hoặc trong workflow phát hành Python. Vì vậy, sau khi sự kiện runtime hay closure thay đổi, một projection Python đã lỗi thời hoặc một đường dẫn gói wheel bị hỏng vẫn có thể được merge, và chỉ thất bại về sau khi có người dựng bản ứng viên phát hành Python.

## Quyết định

Mỗi pull request đều chạy job `python-runtime` bắt buộc trong [CI](../../../../.github/workflows/ci.yml). Job này không dùng bộ lọc đường dẫn, gọi [bộ dựng tệp thực thi đơn](../../../../.github/workflows/build-exe-for-python-sdk.yml) dùng chung để dựng `node24-linux-x64`, và tham gia vào `all checks passed`. Workflow được gọi sẽ dựng tệp thực thi thật, chạy toàn bộ các vòng đầy đủ không cần khóa của Python cùng các kịch bản chạy binary trực tiếp (bao gồm hai snapshot đã được check in), dựng gói wheel cho SDK và runtime, cài cả hai vào một virtual environment sạch, kiểm tra phụ thuộc GLIBC của tệp thực thi và native addon, rồi chạy gói wheel đã cài trong container manylinux 2.28.

Job bắt buộc dùng chung bộ dựng với [workflow phát hành Python](../process/2026-08-11-python-publication-workflow.md). Khóa concurrency của nó bao gồm cả workflow gọi, nên CI bắt buộc và bước kiểm chứng phát hành đầy đủ tường minh trên cùng một ref không hủy lẫn nhau. Ma trận đầy đủ linux-x64, linux-arm64 và macos-arm64 vẫn thuộc về kiểm chứng phát hành: hành vi của runtime, SDK và snapshot vốn không phụ thuộc nền tảng nên chỉ cần một vật mang native chặn merge, còn hành vi phụ thuộc kiến trúc của tệp thực thi, addon, nhãn gói wheel và mục tiêu triển khai vẫn cần kiểm chứng trên toàn bộ mục tiêu phát hành trước khi phát hành.

Snapshot exe nâng cao sẽ chuẩn hóa các định danh mờ của session, message, subagent và lần chạy workflow trước khi so sánh. Nhờ vậy, một sự kiện workflow được lưu bền mới thêm vào sẽ làm thay đổi expected output đã qua review, nhưng không ghi các định danh lần chạy ngẫu nhiên vào trong đó. [Snapshot model-visible](2026-08-13-python-minimal-model-visible-snapshot.md) của kịch bản tối giản bao phủ phần system prompt đã lắp ráp, tool schema và danh sách message mà snapshot này thay bằng placeholder.

## Các phương án đã cân nhắc

**Chạy toàn bộ ma trận native trên mỗi pull request.** Cách này lặp lại hành vi vòng đầy đủ và snapshot vốn không phụ thuộc nền tảng ở ba job, đồng thời khiến mỗi thay đổi đều tiêu tốn dung lượng ARM64 Linux và macOS. Workflow phát hành Python vẫn giữ phần bằng chứng này ở khâu thực sự cần cả ba artifact.

**Chạy snapshot đối chiếu vật mang Node dùng cho phát triển.** Cách này bắt được trôi lệch ở giao thức và projection sự kiện, nhưng không chứng minh được việc lắp ráp pkg, closure runtime sau khi triển khai, staging native addon, dựng gói wheel, phiên bản phụ thuộc chính xác và bản cài đặt sạch. Đường exe Linux bắt buộc bao phủ trực tiếp đường phát hành.

**Chọn job này qua bộ lọc đường dẫn hoặc nhãn.** Hành vi của Python phụ thuộc vào phần code agent, session, workflow, subagent, nạp plugin và đóng gói dùng chung nằm ngoài `python/`. Bộ lọc phụ thuộc không đầy đủ sẽ lại gây phát hiện muộn, còn nhãn sẽ khiến bằng chứng trở thành tùy chọn.

## Hệ quả

Mỗi pull request đều gánh một lần dựng exe và gói wheel trên Linux hosted tiêu chuẩn, và `all checks passed` cũng chờ job này. Điều đó biến việc phân phối Python first-party thành một cam kết tại thời điểm merge, đồng thời tái sử dụng phần hiện thực phát hành thay vì duy trì một pipeline thay thế nhỏ hơn.

Một kiến trúc bắt buộc duy nhất không phát hiện được hồi quy đóng gói trên macOS hay Linux ARM64. Trước khi phát hành vẫn phải thực hiện bước kiểm chứng phát hành đầy đủ tường minh, và bước kiểm chứng đó chịu trách nhiệm cho các kết quả đặc thù nền tảng này.
