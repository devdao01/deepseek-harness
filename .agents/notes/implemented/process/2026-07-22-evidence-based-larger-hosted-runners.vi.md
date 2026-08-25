# Agent Note: Chọn runner lớn do GitHub host dựa trên bằng chứng thực chứng

Status: implemented

[English](2026-07-22-evidence-based-larger-hosted-runners.md) | 中文

## Vấn đề

Topology CI chia shard mạnh mẽ đạt mục tiêu độ trễ bằng cách phân tán công việc Node chính thành 40 job Linux, phân tán công việc Windows thành 9 job. Phần lớn thời gian của bản thân gate ngắn hơn các giai đoạn chuẩn bị như checkout code, thiết lập runner, khôi phục cache và cài đặt dependency, nên việc thực hiện nhiều vòng thiết lập lặp lại vừa tăng chi phí, vừa gây dao động độ trễ. Job Linux chậm nhất trong một lần chạy host mất 49 giây, trong khi một shard Windows lint lại mất tới 231 giây, riêng checkout code, khôi phục cache và cài đặt đã chiếm 158 giây.

Runner lớn có thể để CI chỉ chịu chi phí thiết lập một lần, rồi để scheduler nội bộ của repo thực thi song song, nhưng không thể chỉ dựa vào số core để chọn ra cấu hình có giá trị thực tế. Cải thiện hiệu năng trong benchmark trên các kênh then chốt không biến đổi đơn điệu, và điểm nghẽn mà quy trình aggregate toàn repo phơi bày cũng khác với điểm nghẽn khi chạy riêng type check hay build website.

## Quyết định

Doanh nghiệp giữ lại pool runner lớn Ubuntu và Windows x64 x86 chỉ dành riêng cho repo này. Pull request thông thường chỉ định trực tiếp 3 pool runner 32 core: Ubuntu 24.04 cho coverage đầy đủ, Ubuntu latest cho phần checklist Node 24 chính còn lại, Windows 2025 cho quy ước Windows chặn. IP công khai đã bị tắt; concurrency của workflow vẫn có giới hạn, vì trần auto-scale không phân bổ máy nhàn rỗi, cũng không có nghĩa là công việc của repo có thể mở rộng vô hạn.

Đường chính bắt buộc phụ thuộc vào các pool runner cấp doanh nghiệp này. Job host chuẩn của GitHub giữ lại quy ước tương thích Node 22.19, Node 26 và Python SDK, trong khi [ranh giới khôi phục portable](2026-07-23-portable-required-pull-request-ci.md) và [quy trình tham chiếu tuần tự](2026-07-21-serial-cross-platform-ci-reference.md) tiếp tục cung cấp bằng chứng runner chuẩn đầy đủ trên `master`. `suite=larger-runner-benchmark` so sánh các kênh then chốt độc lập trên cấu hình đã được cấp phát trước, còn `suite=consolidated-runner-benchmark` so sánh quy trình aggregate hoàn chỉnh. Mỗi benchmark đều báo cáo dung lượng processor và bộ nhớ thực đo trước khi chạy công việc của repo.

Các job chia shard theo cấp gate và theo luồng chính thô cũ đã bị xoá khỏi workflow. Các selector chia shard tương ứng cho static, lint, coverage, snapshot và scenario cũng đã bị xoá khỏi repo, do đó các đường chẩn đoán không dùng nữa không thể tiếp tục duy trì một kiến trúc CI thứ hai.

Luồng chính Linux dùng 3 job 32 core độc lập với nhau. Coverage chạy riêng, có trần worker của riêng nó; static scheduler chịu trách nhiệm cho các gate source và tài liệu không tiêu thụ output sinh ra. Job thứ ba chịu trách nhiệm cho lần build Linux duy nhất, sau đó để lint, khả năng tương thích runtime Node 24, snapshot phụ thuộc build product, type check tài liệu và mọi bên tiêu thụ product khởi động dựa trên cây thư mục đó. Cách [bên tiêu thụ build độc lập](2026-07-30-independent-ci-consumer-build.md) này giúp cả 3 job đều có thể yêu cầu runner ngay lập tức, mà không cần biên dịch lại hay truyền tải product chỉ dùng cho lần chạy này. Cây thư mục bên tiêu thụ NodeNext được sinh ra không nằm trong phạm vi phát hiện file của Oxlint, vì khi các tiến trình này chạy chồng lấp, việc kiểm tra product sẽ xoá các thư mục đó. pnpm store sẽ được khôi phục, nhưng việc upload cache không nằm trên đường then chốt của pull request; Oxlint không có cache kết quả do repo quản lý. Báo cáo hiệu năng dùng khoảng từ `startedAt` đến `completedAt` của mỗi job; độ trễ xếp hàng của runner là bằng chứng về dung lượng, không phải thời gian thực thi của repo.

Quan hệ phụ thuộc giữa các gate vẫn tường minh. Coverage tiêu thụ source, không chờ build. Type check tài liệu lấy output project-reference hoàn chỉnh của kênh tiêu thụ làm input. Snapshot replay và bên tiêu thụ xác minh phát hành chờ output đã sinh ra, còn job tương thích phiên bản Node xác minh việc nạp source nhạy cảm với runtime, và không lặp lại type check trên đồ thị project source chính. Bộ suite PTY và subprocess tiếp tục dùng concurrency nội bộ có giới hạn của riêng mình, không kế thừa số core của runner.

Ranh giới product vẫn tường minh. `scripts/publint-all.ts` gọi API mà publint hỗ trợ trên một view phát hành trong bộ nhớ; view này được cấu thành từ các file mà mỗi manifest (metadata thanh khai) khai báo và metadata npm yêu cầu, từ đó tránh khởi động một tiến trình pack package manager cho mỗi package. `scripts/verify-built-package-invariants.mjs` stage các file `lib/` đã khai báo vào dưới package thật, và chuẩn hoá import các tham chiếu tự thân đã biên dịch của nó qua cả Node thường và Cordis Loader; quy ước phát hành chỉ cần bỏ sót một shard runtime là kiểm tra đã thất bại.

Trong topology cấp doanh nghiệp bắt buộc này, Windows dùng một lần thiết lập môi trường 32 core để đồng thời gánh build chặn, website sản phẩm và quy ước product quan sát, còn checklist lint, coverage và snapshot lặp lại thì do Linux đảm nhiệm. [Topology Windows kép cho pull request](2026-08-08-native-windows-pull-request-ci.md) sau này thêm một job gốc (native) độc lập được host chuẩn không chặn; job đó thực thi độc lập việc bắt buộc coverage cho source được hỗ trợ, đồng thời không kéo dài đường bắt buộc trả phí này.

Một lần benchmark full-spec chính xác tại đầu nhánh, trước khi sửa logic khởi động build sớm, đã chạy quy trình aggregate Node chính hoàn chỉnh và không chia shard trên mỗi pool Linux:

| Luồng chính Linux hoàn chỉnh | 4 core | 8 core | 16 core | 32 core | 64 core | 96 core |
|---|---:|---:|---:|---:|---:|---:|
| Thời lượng hoạt động | 243 giây | 144 giây | 103 giây | 87 giây | 62 giây | 65 giây |

Gate của repo trong quỹ đạo chạy 96 core mất 39.14 giây. Type check chiếm 25.71 giây, sau đó một phụ thuộc scheduler khiến build mất 2.13 giây và snapshot replay mất 11.29 giây đều phải chờ đến khi type check kết thúc mới khởi động. Cùng lần chạy đó đã lần lượt chứng minh build và type check có thể thực thi độc lập, kênh CPU gốc trước đây cũng từng để hai việc này chạy đồng thời. Sau khi loại bỏ quan hệ phụ thuộc này, lint mất 33.30 giây trở thành gate then chốt thực đo, chỉ còn bên tiêu thụ output build giữ lại quan hệ phụ thuộc. Quỹ đạo chạy 64 core phơi bày cùng một chuỗi nhàn rỗi: type check, build và snapshot chạy tuần tự, tổng cộng 44.85 giây, trong khi lint và build tài liệu độc lập với nhau hoàn thành lần lượt trong 36.83 giây và 36.15 giây. Do đó, chỉ khi scheduler của repo có thể liên tục cung cấp việc cho nhiều core hơn, việc tăng số core mới có giá trị.

Cùng một benchmark cũng đo hạng mục build bắt buộc Windows trên mỗi cấu hình đã được cấp phát trước:

| Build chặn Windows | 4 core | 8 core | 16 core | 32 core | 64 core | 96 core |
|---|---:|---:|---:|---:|---:|---:|
| Thời lượng hoạt động | 152 giây | 104 giây | 104 giây | 92 giây | 103 giây | 110 giây |

Công việc của repo trên Windows thu được lợi ích rất nhỏ khi vượt quá 16 core, nhưng pool 32 core có thể để toàn bộ checklist ngoài khởi động đồng thời. Một lần xác minh phát hành được điều hướng lại đã hoàn thành checklist Windows hoàn chỉnh trên một máy trong 173 giây, bao gồm cả coverage và snapshot replay, do đó Windows tiếp tục dùng cách thực thi hợp nhất.

Sau khi đồ thị phụ thuộc package client tăng lên, cơ chế cache và áp lực scheduler cũng trở thành một phần của khối lượng công việc thực đo. Trong một lần chạy ứng viên chính xác tại đầu nhánh, gate của repo trên Linux mất 39 giây, job hoàn chỉnh mất 69 giây; trên Windows, gate của repo mất 117 giây, job hoàn chỉnh mất 228 giây. Việc tải archive cache pnpm 154 MB trên Windows mất khoảng 2 giây, nhưng giải nén mất 27 giây, sau đó cài đặt mất 23 giây, và việc lưu lại sau khi job kết thúc lại mất 14 giây. Một lần chạy full-spec không có cache đã hoàn thành việc cài đặt trên cùng một runner Windows 32 core đó trong 27 giây. Do đó, nếu tương lai muốn bật runner lớn, cần đo job hoàn chỉnh, chứ không chỉ đo thời lượng gate.

Mọi so sánh đều phải tính đến việc thiết lập máy chủ. Một job Node 26 chuẩn từng dùng 36 giây trong tổng thời lượng 67 giây cho `Set up job`; `actions/setup-node` sau khi tìm thấy Node từ toolcache đã host, vẫn tốn 46.56 giây để xuất chi tiết môi trường Windows đã cache. Một job ứng viên Linux còn mất 18 giây để đăng ký gói Bubblewrap 50 KB, vì image được host đã quét 202,507 file cơ sở dữ liệu package. [`scripts/prepare-ci-bubblewrap.sh`](../../../../scripts/prepare-ci-bubblewrap.sh) được đổi thành xác minh payload phiên bản cố định và giải nén vào thư mục runner tạm thời, thực hiện probe cô lập chức năng, và để công việc chuẩn bị này chồng lấp thời gian với cài đặt dependency.

Trần worker của lớp trong và lớp ngoài là các cơ chế kiểm soát độc lập với nhau. Một thử nghiệm ESLint chính xác tại đầu nhánh dùng 32 worker thread khiến thời lượng lint tăng lên 52.28 giây, coverage tăng lên 42.71 giây; trong cùng lần chạy đó, một test timeout nhàn rỗi của adapter đã thất bại. Sau đó, một quỹ đạo chạy 8 gate đồng thời đã giảm thời lượng coverage xuống 35.17 giây, nhưng build website sản phẩm bị trì hoãn, cho đến khi quy trình aggregate đạt 41.06 giây mới hoàn thành. Do đó, không thể chỉ dựa vào số core để áp dụng trần worker theo cùng tỷ lệ.

Hạng mục coverage bị ràng buộc tiến trình vừa hay chứa 5 file suite. 32 fork từng khiến CJS lexer của Node 24 crash hai lần, sau đó một lần chạy dùng 16 fork lại tái hiện việc mất worker process và kết quả coverage không hợp lệ. Do đó, một lệnh Vitest đơn lẻ sẽ dùng thread cho phần lớn checklist test, chỉ giữ fork cho các suite liên quan đến trạng thái toàn cục của tiến trình, API `process`, hoặc I/O tiến trình nhạy cảm với thời gian. Danh sách fork hạn chế này bao gồm bộ suite đường dẫn tiến trình bash cục bộ và bộ suite adapter pi-ai, vì tranh chấp aggregate làm thay đổi kết quả quan sát trình tự của cả hai. Những lỗi này cho thấy: khi chọn số worker thread, trần được quyết định bởi việc kết quả coverage có giữ được tính xác định hay không, chứ không phải bởi số core danh nghĩa.

Chỉ khi `master` di chuyển, hệ thống mới chạy tham chiếu tuần tự Linux, macOS và Windows hoàn chỉnh. Pull request dùng đường bắt buộc runner cấp doanh nghiệp và job tương thích host chuẩn, các cấu hình runner lớn khác chỉ chạy qua kích hoạt thủ công.

Ngoài ra còn có một tham chiếu Linux tuần tự chạy trên pool self-hosted tự có của công ty (nhãn `vm-backup`: một máy ảo 64 core, chạy 6 instance runner thường trực được quản lý bởi systemd) mỗi khi push vào `master`. Đây là diễn tập standby nóng chứ không phải check bắt buộc: mỗi lần chạy đều chứng minh lại rằng máy ảo bền vững này có thể thực thi quy trình aggregate hoàn chỉnh không chia shard. Cơ chế chuyển đổi thực tế đã được đấu nối sẵn: ba job Linux bắt buộc phân giải pool runner thông qua biến repo `DSH_CI_FAILOVER_LINUX` mà người có quyền ghi có thể quản lý, do đó phản ứng sự cố chỉ là đặt một biến rồi chạy lại — không cần merge (bản thân merge sẽ bị chặn bởi check đang thất bại, tạo thành deadlock) ([runbook chuyển đổi sự cố](2026-07-26-ci-failover-runbook.md)). Kênh standby nóng này được kích hoạt bởi push, và luôn thực thi định nghĩa workflow của chính nhánh cơ sở. Nhưng cần lưu ý: trong lúc chuyển đổi sự cố, job `pull_request` vẫn sẽ mang theo định nghĩa workflow tự có trong merge ref của PR để đến các runner này — ranh giới tin cậy là tư cách thành viên repo (repo là private và tắt fork, selector loại trừ Dependabot), chi tiết xem ghi chép trong [runbook chuyển đổi sự cố](2026-07-26-ci-failover-runbook.md).

## Phương án khác đã cân nhắc

**Giữ lại 3 kênh luồng chính Linux thô.** Job core, CPU và website sản phẩm đều đạt mục tiêu độ trễ, nhưng chúng cần 3 vòng thiết lập, và vẫn chia shard công việc Node chính sau khi runner lớn đã khả dụng. Quỹ đạo chạy full-spec cho thấy điều khiến quy trình aggregate trên một máy vượt quá 1 phút là một quan hệ phụ thuộc không cần thiết, chứ không phải dung lượng máy chủ không đủ.

**Giữ lại topology chia shard cấp gate cũ làm tham chiếu thủ công.** Một topology thứ hai nhàn rỗi sẽ khiến hàng trăm dòng workflow, module selector và hành vi phân vùng scenario tiếp tục tồn tại. Bộ suite full-spec và tuần tự có thể cung cấp đối chiếu về thời gian và tính toàn vẹn mà không cần giữ lại code sản phẩm mà không job bắt buộc nào thực thi.

**Khôi phục dùng package manager pack trong mỗi trình xác minh phát hành.** Không áp dụng, vì cách này sẽ khởi động lặp lại một tiến trình con package manager cho mỗi package. View phát hành được xây dựng từ manifest và các tham chiếu tự thân đã biên dịch đã stage, chỉ cần một checklist trong tiến trình là đủ để giữ quy ước file phát hành.

**Build trước, rồi mới chạy coverage hoặc type check trên mỗi phiên bản Node.** Không áp dụng, vì coverage chỉ tiêu thụ source, phân tích compiler cũng không phụ thuộc runtime. Bên tiêu thụ phụ thuộc build product vẫn chờ output đã sinh ra, còn job tương thích xác minh đường nhạy cảm với runtime trên mỗi phiên bản Node đã khai báo hỗ trợ.

**Dùng pool 64 core để chạy quy trình aggregate chính hoàn chỉnh.** Do thiết lập được host nhanh hơn 9 giây, thời lượng hoạt động thực đo của nó ít hơn kết quả 96 core 3 giây, nhưng gate của repo chậm hơn 5.72 giây. Bộ suite benchmark giữ lại cả hai cấu hình, vì thay đổi liên tục về image hoặc giá cả có thể đảo ngược kết quả so sánh.

**Để build tiếp tục chờ type check.** Phương án này sẽ sắp xếp thứ tự trước sau cho các lệnh gọi compiler độc lập với nhau, và biến snapshot replay thành chuỗi then chốt 3 giai đoạn. Bản thân output build có quan hệ phụ thuộc thành công độc lập, nên chỉ có bên tiêu thụ snapshot và phát hành cần chờ nó.

**Chuyển output build của job static cho bên tiêu thụ sau build.** Product chỉ dùng cho lần chạy này có thể giữ lại cùng một kết quả build, nhưng để workflow tiêu thụ nó, chỉ có thể chờ toàn bộ job static hoàn thành trước, rồi mới yêu cầu một runner khác. [Bên tiêu thụ build độc lập](2026-07-30-independent-ci-consumer-build.md) thay vào đó để bên tiêu thụ thực tế chịu trách nhiệm cho lần build Linux duy nhất.

**Giữ toàn bộ đường bắt buộc trên dung lượng host chuẩn của GitHub.** Phương án này có thể tránh phụ thuộc cấu hình runner bên ngoài repo, nhưng lần chạy chính xác tại đầu nhánh trên runner chuẩn vẫn chậm hơn rõ rệt, và cũng có thể phải xếp hàng lâu hơn do dung lượng dùng chung. Job tương thích host chuẩn và quy trình tham chiếu tuần tự giữ lại bằng chứng portable, không cần biến topology chậm hơn này thành đường chính thông thường.

**Giữ check Windows bắt buộc và check Windows quan sát trong các job khác nhau.** Cách chia này giữ ngữ nghĩa trạng thái ở cấp workflow, nhưng phải trả hai lần chi phí thiết lập. `run-gates` giữ lại cùng sự phân biệt bắt buộc và không chặn trong một tiến trình duy nhất.

**Cài Bubblewrap qua package manager của hệ thống.** Phương án này sẽ dùng cơ sở dữ liệu package của máy chủ, dù nội dung package nhỏ, vẫn có thể chi phối toàn bộ thời lượng job. Cách giải nén phiên bản cố định kết hợp probe cô lập, không cần sửa image được host vẫn giữ được quy ước runtime.

## Kết quả

Mỗi kênh 32 core trong topology bắt buộc chỉ chịu 1 vòng chi phí thiết lập, và không giữ lại selector chia shard. Mỗi pull request thông thường đều tiêu tốn số phút runner Linux và Windows cấp doanh nghiệp trả phí; chỉ khi việc đo lại có giá trị, benchmark thủ công mới thêm các cấu hình khác.

GitHub sẽ làm tròn lên đến phút nguyên cho mỗi lần thực thi runner lớn để tính phí, do đó việc đo job hoàn chỉnh có thể đồng thời thể hiện thời lượng tính phí và độ phức tạp workflow. Việc tách Linux sẽ lặp lại hai vòng thiết lập, nhưng kênh tiêu thụ có duy nhất một cây thư mục đã build, và coverage, gate static và bên tiêu thụ sau build được phân bổ runner riêng biệt; việc hợp nhất Windows thì tránh lặp lại chi phí thiết lập lâu hơn của nó.

Mục tiêu hiệu năng là kết quả quan sát, không phải deadline huỷ bỏ hay yêu cầu về tính đúng đắn. Khi image, dependency, scheduler hoặc giá cả thay đổi cần đo lại, vẫn có thể dùng bộ suite full-spec và tuần tự thủ công.

Khi nhãn runner cấp doanh nghiệp thiếu hoặc bị đổi tên, job chính bắt buộc sẽ liên tục xếp hàng. Job tương thích host chuẩn và quy trình tham chiếu `master` vẫn báo cáo bằng chứng hữu ích, nhưng không thể thay thế quy trình aggregate bắt buộc; do đó, việc phân bổ runner là một phụ thuộc vận hành mà CI của repo không thể tự sửa.
