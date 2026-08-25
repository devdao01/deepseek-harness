# Agent Note: Phát hành baseline NPM ưu tiên sản phẩm build

Status: proposed

[English](2026-08-04-artifact-first-npm-baseline-publication.md) | Tiếng Việt

## Vấn đề

Mã nguồn chạy được trong monorepo không chứng minh được rằng gói sau khi phát hành cũng chạy được. workspace link, TypeScript paths, việc nạp mã nguồn bằng tsx và thư mục `lib/` còn sót lại trong cây làm việc đều có thể bù đắp cho các tệp hoặc phụ thuộc bị thiếu trong tarball phát hành. Ngay cả khi kiểm thử sản phẩm build hiện có dùng Node thuần, nó vẫn đọc trực tiếp `lib/` trong cây làm việc, không xác minh `package.json#files` rốt cuộc chọn ra những gì, cũng không xác minh bố cục tệp sau khi trình quản lý gói cài đặt. Vì vậy, một lần chạy bình thường ở chế độ phát triển vẫn có thể được phát hành thành gói thiếu bundle chunk, tệp khai báo, cấu hình hoặc tài nguyên.

Việc phát hành nhiều gói `@deepseek-ai` phụ thuộc lẫn nhau còn sinh ra vấn đề nhất quán ở cấp tập hợp. Nếu script cứ pack xong một gói là publish ngay, thì khi một lần pack hoặc xác minh sau đó thất bại, registry đã tồn tại sẵn nửa đầu các phiên bản không dùng được như một baseline hoàn chỉnh. Registry npm không có giao dịch xuyên gói, nên "phát hành một lần" ở đây không thể hứa hẹn commit nguyên tử, mà chỉ có thể hứa rằng tập hợp phát hành được tạo và xác minh đầy đủ trước bất kỳ thao tác ghi từ xa nào, rồi một lệnh điều phối có khả năng khôi phục sẽ phát hành tập hợp bất biến đó.

Baseline hiện tại còn đòi hỏi con người tự thực hiện việc suy ra phiên bản, xác thực, pack, phát hành và thử lại ngay trên máy cục bộ. Workflow GitHub Actions về sau phải tái sử dụng đúng bộ gói phát hành và logic xác minh đó, không được dựng lại một bộ tarball khác chưa qua kiểm thử phía tiêu thụ sau khi việc phát hành đã được phê duyệt.

## Đề xuất

Quy trình phát hành lấy một release bundle (tập hợp gói phát hành) bất biến làm ranh giới. Giai đoạn pack build toàn bộ gói mục tiêu từ một Git commit xác định, tạo toàn bộ tarball, kiểm tra nội dung tarball và vượt qua kiểm thử tích hợp sau cài đặt; giai đoạn publish chỉ đọc bộ tarball đó cùng manifest (bảng kê metadata) của nó, cấm build lại hoặc pack lại.

Tập hợp mục tiêu chỉ gồm các gói workspace được đặt tên `@deepseek-ai/*` trong `packages/*/*/package.json` và `apps/*/package.json`. Dự án gốc, `website/`, vendor, workspace Python và native không thuộc baseline NPM này. Cơ chế phát hiện phải từ chối tên gói trùng lặp, phiên bản cơ sở khác nhau, trạng thái `private` phát hành ngoài dự kiến và các gói lạ trong tập hợp, thay vì duy trì thêm một danh sách tên gói thủ công.

Phiên bản tiền phát hành gồm phiên bản cơ sở ổn định của gói, dấu thời gian UTC chính xác đến giây tại lúc lệnh khởi động, và SHA rút gọn 10 ký tự của commit mục tiêu: `<base>-<YYYYMMDDHHmmss>-<short-commit>`. dist-tag được suy ra từ phiên bản cơ sở thành `dev-<base>`. Ví dụ, phiên bản cơ sở `0.0.1`, thời gian `2026-08-04T00:32:00Z` và commit `909292dd7b` sinh ra phiên bản `0.0.1-20260804003200-909292dd7b` và tag `dev-0.0.1`. Lần thử lại của cùng một release bundle phải giữ nguyên phiên bản và manifest ban đầu; pack lại sẽ sinh phiên bản mới theo thời điểm khởi động lệnh mới.

Giai đoạn pack thực hiện theo thứ tự sau:

1. Phân giải ref thành một commit bất biến, thu thập dấu thời gian UTC, suy ra phiên bản từ manifest gốc của commit đó, và hiển thị commit, dấu thời gian, phiên bản, tag, registry cùng đường dẫn đầu ra. Lúc này cả `pack` lẫn `release` đều chờ Enter trước khi bắt đầu các thao tác tốn kém; tự động hóa có thể dùng `--yes` để bỏ qua bước xác nhận đó.
2. Cài đặt với frozen lockfile trong một detached worktree tách biệt, và chạy các ràng buộc phát hành trên manifest nguồn trước khi staging; các tệp chưa commit và sản phẩm build cũ trong cây làm việc của bên gọi không được tham gia vào việc phát hành.
3. Staging toàn bộ manifest mục tiêu về phiên bản đã suy ra, bỏ nhãn `private` khi phát hành, và viết lại toàn bộ phụ thuộc workspace nội bộ trong `dependencies`, `devDependencies`, `optionalDependencies` và `peerDependencies` thành cùng một phiên bản chính xác.
4. Build đầy đủ commit mục tiêu, rồi chạy publint và các bất biến của gói đã build.
5. Thực hiện pack cho từng gói trong tập hợp mục tiêu, nhưng không thực hiện bất kỳ thao tác ghi nào lên registry.
6. Kiểm tra package manifest, bảng kê tệp, phiên bản phụ thuộc nội bộ, tên gói và phiên bản bên trong tarball, đồng thời từ chối các tarball thiếu, trùng lặp hoặc dư thừa.
7. Sinh release manifest và tệp checksum chứa commit, phiên bản, tag, registry, đường dẫn tarball của từng gói, SHA-256 và npm integrity.
8. Cài đặt một bên tiêu thụ tách biệt từ các tarball cục bộ, chạy các phép thăm dò sản phẩm ở trạng thái đã cài đặt mà bản hiện thực hiện tại đã có, và mở rộng các phép thăm dò đó thành ma trận kiểm thử tích hợp mặt phẳng sản phẩm đầy đủ được định nghĩa bên dưới.
9. Chỉ khi toàn bộ tập hợp vượt qua thì mới xuất ra một lệnh publish có thể chạy trực tiếp; bản thân lệnh pack luôn giữ nguyên tắc không ghi từ xa.

Lệnh `release` cục bộ kết hợp pack và publish. Nó xác định trước dấu thời gian và phiên bản dự kiến thông qua bước xác nhận pack nói trên, rồi chờ Enter lần thứ hai sau khi pack thành công, sau đó phát hành chính manifest đó; `release --yes` bỏ qua cả hai lần xác nhận. Các lệnh độc lập `pack` và `publish --manifest` vẫn là thao tác nền tảng dùng cho việc tách job trong CI và khôi phục từ điểm dừng.

## Ranh giới của bản hiện thực hiện tại

Lệnh pack đã commit hiện thực hóa việc staging trên commit cố định, cố định chính xác phụ thuộc nội bộ, kiểm tra tĩnh và kiểm tra payload tarball, manifest bất biến, cùng một lần cài npm tách biệt trong đó mỗi tarball phát hành đều là phụ thuộc cấp cao nhất cục bộ. Trước khi in ra lệnh publish, nó dùng Node thuần chạy các điểm vào `dsh --version` và `dsh --dump-default-config` sau cài đặt, rồi khởi động TUI mặc định sau cài đặt trong một POSIX PTY, chờ tín hiệu sẵn sàng `main-session-` của nó, và thoát bằng `/exit`. Publish hỗ trợ khôi phục theo integrity, tách kiểm tra registry chỉ đọc khỏi kiểm tra danh tính xác thực, và kết thúc bằng việc xác minh đầy đủ integrity từ xa cùng dist-tag.

CI của PR (Pull Request) không gọi lệnh pack; phép thăm dò điểm vào ở trạng thái đã cài đặt thuộc về kiểm tra phát hành cục bộ, không phải cổng gác hợp nhất. Việc chạy CI không cần thông tin xác thực, các phép thăm dò riêng của từng gói cho mỗi bin và điểm vào runtime công khai còn lại, việc truyền workflow artifact và job publish được bảo vệ vẫn nằm trong phạm vi đề xuất.

## Quy ước payload phát hành

Gói phát hành chỉ mang theo sản phẩm build mà bên tiêu thụ cần. `package.json#files` cấm chứa `src` và `lib/types/**/*.d.ts.map`; cổng gác nội dung tarball còn phải xác nhận độc lập rằng không tồn tại bất kỳ `package/src/**` và `package/**/*.d.ts.map` nào, tránh việc pattern trong manifest hoặc hành vi pack lách qua ràng buộc tĩnh. JS runtime, tệp khai báo `.d.ts`, cấu hình, tài nguyên, tệp worker và dynamic chunk của bundle phải được thu thập đủ theo bao đóng điểm vào thực tế.

Manifest nguồn có thể giữ `exports["./src/*"]` để phục vụ việc phân giải mặt phẳng nguồn của repo này; export đó không có nghĩa mã nguồn sẽ đi vào payload phát hành, cũng không thuộc quy ước dành cho bên tiêu thụ của gói đã phát hành. Cổng gác tĩnh phải kiểm tra riêng mặt phẳng nguồn và payload phát hành, không được xóa source export để che giấu việc phân giải workspace sai, cũng không được phát hành `src` để vá cho sản phẩm build bị thiếu.

Mỗi tarball phải không chứa specifier `workspace:`, và mọi phụ thuộc nội bộ cùng phụ thuộc đối tác (peer dependency) trỏ tới tập hợp phát hành lần này đều phải bằng chính xác phiên bản suy ra lần này, cấm dùng `^`, `~` hay các dải semver khác vượt qua baseline commit. Ngoài `exports["./src/*"]` vốn được nêu rõ là chỉ dùng cho mặt phẳng nguồn, mọi điểm vào dành cho bên tiêu thụ được khai báo trong package manifest đều phải trỏ tới tệp tồn tại trong tarball; dynamic import, đường dẫn ghép ở runtime và tài nguyên không nằm trong export không thể chỉ dựa vào kiểm tra manifest, mà phải được bao phủ bằng thực thi sau cài đặt.

## Kiểm thử tích hợp mặt phẳng sản phẩm

Kiểm thử tích hợp chạy sau khi toàn bộ tarball đã được tạo và trước mọi thao tác publish. Nó tạo một dự án tạm hoàn toàn mới bên ngoài monorepo, cài bao đóng phụ thuộc đã khai báo thông qua các tệp `.tgz` cục bộ trong release manifest lần này, và thực thi từ thư mục cài đặt. Kiểm thử phải dùng Node thuần và `node_modules` do trình quản lý gói sinh ra; cấm tsx, tsconfig paths, workspace link, đường dẫn mã nguồn của repo, `lib/` trong cây làm việc và gói cùng phiên bản trên registry đã phát hành tham gia vào việc phân giải. Kiểm thử còn phải khẳng định rằng đường dẫn thực của các module và bin then chốt nằm bên trong dự án tiêu thụ tạm thời.

Việc cài đặt dùng hành vi client được chọn cho lần phát hành này. Việc tải lên registry phải dùng `npm` CLI (giao diện dòng lệnh), để đáp ứng chính sách của registry riêng chỉ chấp nhận client npm; việc điều phối build vẫn có thể dùng pnpm. Kiểm thử tarball không được phát hành các gói này lên registry thật trước, cũng không được pack lại sau khi kiểm thử.

Kiểm thử tối thiểu phải bao phủ các mặt thực thi sau:

- `dsh --version` và `dsh --dump-default-config` sau khi cài `@deepseek-ai/dsh` thành công dưới Node thuần, lần lượt bao phủ điểm vào CLI tĩnh và một điểm vào chế độ động.
- `dsh` mặc định sau cài đặt hoàn tất một lần khởi động TUI không cần khóa trong PTY, và thoát dưới sự kiểm soát của kiểm thử sau khi đạt tín hiệu ready đã định. Đường dẫn này phải nạp dynamic chunk TUI thật, nên việc thiếu tệp phát hành kiểu `lib/tui-*.js` sẽ làm cổng gác thất bại.
- Mỗi `bin` đã phát hành khác đều định nghĩa một lệnh smoke ở cấp gói, không truy cập dịch vụ thật và không sửa đổi trạng thái người dùng. Các CLI khác nhau không bắt buộc dùng chung `--help`; kiểm thử phải chạy điểm vào cài đặt thật của chúng và kiểm tra tín hiệu thoát hoặc ready đã quy ước.
- Các điểm vào runtime công khai tương thích Node được nạp từ thư mục cài đặt; các điểm vào dành cho trình duyệt, worker hoặc buộc phải do giao thức của host điều khiển thì dùng fixture (dữ liệu tiền đề của kiểm thử) tách biệt tương ứng, nhưng đầu vào vẫn chỉ được lấy từ tarball lần này.

Các kiểm thử này xác minh khả năng thực thi, chứ không thay thế unit test, snapshot, e2e API thật hay publint. Fixture kiểm thử nên tái sử dụng các khẳng định hành vi của những kịch bản built-bin và PTY hiện có, nhưng phải đổi điểm vào thành kết quả cài đặt từ tarball; kiểm thử chạy trực tiếp `lib/bin.js` trong cây làm việc không được tính cho cổng gác này.

## Phát hành và khôi phục

Lệnh publish trước tiên xác minh release manifest, toàn bộ checksum cục bộ, registry mục tiêu, `npm ping` và `npm whoami`, rồi tải tarball lên theo thứ tự xác định. Lệnh chỉ chấp nhận manifest do giai đoạn pack sinh ra, không chấp nhận thư mục workspace làm đầu vào phát hành. Registry mặc định là `https://registry.npm.harnessment.com/`, và mỗi lần publish đều truyền tường minh registry cùng tag đã suy ra, tránh để `.npmrc` ở cấp người dùng làm đổi đích.

npm không cung cấp giao dịch nguyên tử đa gói, việc tải lên vẫn diễn ra theo từng gói. Bộ điều phối thu hẹp mặt thất bại bằng khôi phục idempotent: nếu từ xa không tồn tại `<name>@<version>` thì tải lên; nếu đã tồn tại và integrity trùng với release manifest thì bỏ qua; nếu đã tồn tại nhưng nội dung khác thì thất bại ngay. Việc kiểm tra dist-tag chỉ đọc ánh xạ tag, không phân giải phiên bản mà tag mặc định trỏ tới, nên ngay cả khi phiên bản mà một tag không liên quan trỏ tới đã không còn tồn tại thì cũng không chặn việc khôi phục. Sau khi hoàn tất, phải xác nhận theo từng gói rằng integrity của phiên bản và dist-tag đều trỏ tới phiên bản lần này; chỉ khi cả tập hợp vượt qua xác minh cuối cùng thì workflow mới báo phát hành thành công.

Nếu pack, kiểm tra tarball hoặc kiểm thử tích hợp sau cài đặt thất bại, registry phải giữ nguyên trạng thái không ghi. Nếu publish thất bại sau khi đã tải lên một phần, người vận hành khôi phục bằng cách chạy lại lệnh publish với cùng release manifest đó, không được pack lại và sinh một phiên bản có dấu thời gian khác để thay cho việc khôi phục. Chỉ khi cần tarball khác sau khi sửa mã hoặc thay đổi đầu vào build thì mới thực hiện lại toàn bộ pack và kiểm thử.

## Tích hợp GitHub Actions

GitHub Actions chia thành job pack-and-test không cần thông tin xác thực và job publish được bảo vệ. Job đầu checkout đúng commit, gọi cùng điểm vào pack như ở cục bộ, chạy kiểm thử phía tiêu thụ trên tarball, và tải toàn bộ release bundle lên làm workflow artifact. Job sau phụ thuộc vào thành công của job đầu, tải bundle từ workflow artifact, kiểm tra lại manifest và checksum, rồi gọi cùng một điểm vào publish; nó không được checkout rồi build lại.

PR và push thông thường có thể chạy tín hiệu pack-and-test không cần thông tin xác thực, nhờ đó phát hiện hồi quy payload trước khi hợp nhất. Việc phát hành lên registry riêng thực tế trước hết được cung cấp qua `workflow_dispatch`, với đầu vào chỉ gồm ref mục tiêu; dấu thời gian UTC do job pack sinh ra, còn phiên bản cơ sở, SHA rút gọn, tag, registry và bảng kê gói đều được suy ra từ trạng thái repo hoặc cấu hình được quản lý phiên bản. Cách kích hoạt phát hành ổn định không nằm trong phạm vi của đề xuất baseline này.

Token registry chỉ được tiêm vào job publish, và do một GitHub Environment được bảo vệ kiểm soát việc phê duyệt thủ công, các nhánh hoặc tag được phép, và mức đồng thời. Job pack-and-test không được đọc thông tin xác thực phát hành. Thời gian lưu giữ workflow artifact có thể ngắn, nhưng job publish phải dùng bundle do chính workflow run đó sinh ra, không được đi tìm tarball theo số phiên bản từ những vị trí không đáng tin.

## Các phương án đã cân nhắc

**Publish đệ quy trực tiếp từ workspace.** Không áp dụng, vì lệnh sẽ đan xen pack với việc ghi lên registry, không thể chứng minh cả tập hợp là đầy đủ trước lần ghi đầu tiên, đồng thời dễ để việc phân giải workspace và trạng thái cây làm việc của bên gọi ảnh hưởng tới kết quả phát hành.

**Chỉ kiểm thử `lib/` đã build trong cây làm việc.** Không áp dụng, vì cái được xác minh là cây build, không phải tarball do `package.json#files` chọn ra. Dynamic chunk tồn tại trong cây làm việc nhưng bị bỏ sót trong tarball chính là kiểu thất bại mà đề xuất này phải bắt được.

**Chỉ chạy `dsh --help`.** Không áp dụng, vì Commander có thể in trợ giúp rồi thoát trước khi nạp điểm vào động của TUI, Web hay headless. Nó không chứng minh được đường khởi động production mặc định là đầy đủ.

**Phát hành cả `src` và declaration map để giảm rủi ro sót tệp.** Không áp dụng, vì mặt phẳng nguồn không phải đường dự phòng cho runtime production; mở rộng payload sẽ che giấu lỗi bao đóng bundle, và biến sản phẩm gỡ lỗi cục bộ thành quy ước phát hành ngoài ý muốn.

**Yêu cầu phát hành nguyên tử xuyên gói thực sự.** Không áp dụng, vì registry npm không có giao dịch tương ứng. Release bundle bất biến, xác minh toàn bộ trước khi phát hành, so khớp integrity và khôi phục idempotent cung cấp một ranh giới khả thi, đồng thời nêu rõ giới hạn rằng việc tải lên một phần có thể lộ ra trong thời gian ngắn.

**Để job phát hành build lại sau khi được phê duyệt.** Không áp dụng, vì tarball đã vượt qua kiểm thử và tarball thực sự được tải lên sẽ không còn cùng danh tính nội dung. Workflow artifact và checksum phải chuyển thẳng đầu vào đã kiểm thử sang bước phát hành.

## Tiêu chí nghiệm thu

- Một điểm vào pack phát hiện toàn bộ gói mục tiêu trong `packages/*/*` và `apps/*` từ một commit xác định, sinh và hiển thị phiên bản theo dấu thời gian UTC đến giây cùng commit rút gọn, rồi chờ Enter; nó tạo release bundle đầy đủ trước bất kỳ thao tác ghi registry nào, và in ra một lệnh publish có thể sao chép; `release` chờ thêm một lần nữa sau pack, còn `--yes` bỏ qua cả hai lần xác nhận.
- Cả cổng gác manifest tĩnh lẫn cổng gác nội dung tarball đều từ chối phát hành `src` và `.d.ts.map`, đồng thời vẫn giữ `exports["./src/*"]` trong manifest nguồn.
- Release bundle ghi lại tập hợp gói đầy đủ, commit, phiên bản suy ra, tag, registry và integrity của từng tarball; mọi phụ thuộc nội bộ đều được cố định chính xác về phiên bản đó, và publish chỉ tiêu thụ bundle đó, tuyệt đối không build lại.
- Một kiểm thử tích hợp tách biệt cài bên tiêu thụ từ tarball cục bộ, và dùng Node thuần khởi động TUI `dsh` mặc định sau cài đặt; xóa bất kỳ dynamic chunk cần thiết nào cũng khiến kiểm thử đó thất bại một cách ổn định.
- Mọi bin đã phát hành và các điểm vào runtime công khai phù hợp đều có bao phủ thực thi sau khi cài từ tarball, và đường dẫn phân giải chứng minh không có việc quay về monorepo.
- publish có thể chạy lại an toàn với cùng manifest sau khi thành công một phần; integrity trùng thì bỏ qua, integrity khác thì bị từ chối, và xác minh cuối cùng yêu cầu mọi phiên bản và tag đều nhất quán.
- Job không cần thông tin xác thực của GitHub Actions tạo và kiểm thử bundle, job được bảo vệ tải lên đúng bundle đó, và token phát hành chỉ tồn tại ở job sau.

## Rủi ro

Pack, cài đặt và khởi động toàn bộ sẽ làm tăng thời gian CI và kích thước workflow artifact. Bản hiện thực nên cache phụ thuộc bên ngoài và pnpm store, nhưng không được cache hay tái dùng sản phẩm workspace đã cài của các gói mục tiêu; chạy song song các probe phía tiêu thụ an toàn có thể giảm độ trễ.

Cài toàn bộ tarball làm phụ thuộc cấp cao nhất của dự án tạm có thể che giấu các phụ thuộc nội bộ chưa khai báo. Bộ sinh kiểm thử nên cài theo bao đóng đệ quy khai báo của ứng dụng được kiểm thử, kết hợp với các cổng gác phụ thuộc hiện có; với `@deepseek-ai/dsh` có mặt phụ thuộc gần như phủ toàn bộ, vẫn phải dựa vào package manifest và kiểm tra đồ thị tĩnh để phát hiện cạnh chưa khai báo.

Optional dependency, native addon, PTY và điểm vào trình duyệt trên các nền tảng khác nhau có thể cần probe riêng theo nền tảng. Giai đoạn đầu tối thiểu phải bao phủ việc khởi động `dsh` chính trên Linux runner dùng để phát hành và một đường dẫn macOS cục bộ, ma trận về sau mở rộng theo nền tảng phát hành thực tế; không được dùng cách bỏ qua probe không ổn định để đưa đường dẫn production ra khỏi cổng gác.

Cơ chế khôi phục không loại bỏ được tính hiển thị một phần của npm. Trong lúc phát hành thất bại, registry có thể tạm thời chứa một phần các gói của phiên bản lần này; người vận hành và tự động hóa phải lấy kết quả xác minh bundle cuối cùng, chứ không phải thành công của từng lệnh `npm publish`, làm tín hiệu cho biết baseline đã dùng được.
