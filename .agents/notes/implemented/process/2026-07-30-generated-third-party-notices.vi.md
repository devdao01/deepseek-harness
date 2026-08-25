# Agent Note: Thông báo bên thứ ba được sinh tự động

Status: implemented

[English](2026-07-30-generated-third-party-notices.md) | Tiếng Việt

## Vấn đề

Việc mở mã nguồn repo này đòi hỏi phải công bố các phần mềm bên thứ ba mà repo phụ thuộc vào, cùng giấy phép tương ứng của từng phần. Việc công bố này phải đầy đủ, phải luôn đúng theo thời gian khi dependency thay đổi, và phải cung cấp thông tin thực sự hữu ích cho người đọc: package nào cuối cùng sẽ đến máy người dùng, package nào chỉ dùng để build và test.

Danh sách viết tay không thể thỏa mãn lâu dài bất kỳ điều nào trong số đó. Khoảng một trăm dòng tên package và định danh giấy phép được suy ra thủ công từ các manifest (tệp khai báo metadata), chỉ cần có dependency mới được thêm, gỡ bỏ, hoặc đổi giấy phép là sẽ âm thầm sai lệch, mà không có bất kỳ kiểm tra nào phát hiện ra.

## Quyết định

[`THIRD_PARTY_NOTICES.md`](../../../../THIRD_PARTY_NOTICES.md) được sinh ra bởi [`scripts/gen-third-party-notices.ts`](../../../../scripts/gen-third-party-notices.ts) dựa trên manifest của từng workspace, `vendor/README.md`, `pyproject.toml` và `pnpm-workspace.yaml`. Cả hai phía của README gốc song ngữ đều liên kết từ mục "Giấy phép" tới file này.

**Độ mới được chủ động duy trì, chứ không chỉ được kiểm tra.** Chỉ cần bất kỳ input nào của generator được stage — bất kỳ manifest nào, khai báo workspace, lockfile gốc, `vendor/README.md`, một `pyproject.toml` nào đó, chính generator, hoặc script nắm giữ pin thời điểm build — task pre-commit sẽ sinh lại file này và stage nó, người thay đổi dependency không cần phải quay lại chạy thủ công generator sau đó. Các byte đã commit sau đó được assert bởi [`scripts/gen-third-party-notices.spec.ts`](../../../../scripts/gen-third-party-notices.spec.ts), mà lane test vốn dĩ đã chạy file này — việc xác thực này không thêm tiến trình gate, không chiếm slot lịch trình, cũng không thêm bước CI nào. Khi cần xác thực riêng, `pnpm run verify-third-party-notices` vẫn có thể dùng.

Có một khoảng trống trigger được chấp nhận chứ không phải bị bỏ qua: lefthook chỉ xem xét các file tồn tại trên đĩa, nên việc **xóa** một manifest sẽ không kích hoạt bất kỳ task nào, việc gỡ bỏ một package sẽ rơi vào assertion của lane test. Cách tái cấu trúc danh sách file được stage để bao gồm cả việc xóa không khả thi — dù danh sách được cho thế nào, lefthook cũng sẽ lọc lại theo cây thư mục làm việc. Tình huống này đang được assertion đảm bảo.

Mặc định file chỉ công bố dependency **trực tiếp**. Toàn bộ closure npm cùng phiên bản đã khóa được ghi trong `pnpm-lock.yaml` (có thể render bằng `pnpm licenses list`), closure Python được ghi trong `python/sdk/uv.lock`; chép lại bằng văn xuôi một lần nữa chỉ tạo ra một bản sao tệ hơn. Dependency gián tiếp duy nhất được công bố rõ ràng là tập hợp payload nền tảng Claude chính thức mà `@anthropic-ai/claude-agent-sdk` khai báo qua `optionalDependencies`, vì các package này mang theo executable Claude Code được phân phối kèm sản phẩm, chứ không phải chi tiết triển khai thư viện thông thường.

**Việc phân lớp dựa trên khu vực bên khai báo, chứ không phải tên trường trong manifest.** Chỉ cần bất kỳ manifest nào ngoài `DEV_ONLY_AREAS` — tức là manifest gốc, `packages/test-support/`, `packages/test-support/client-runtime/`, `website/`, `examples/`, ngoài `native/` — nêu tên một package trong `dependencies` hoặc `optionalDependencies`, thì nó là dependency runtime. Chỉ nhìn tên trường sẽ sai theo cả hai hướng: package hỗ trợ test khai báo `vitest` trong `dependencies` nhưng lại không phân phối nó; còn script chạy nguồn ở thư mục gốc thực thi qua `tsx`, mà không có manifest nào khai báo nó là dependency runtime, chỉ có thể được generator đánh dấu tường minh.

Lớp runtime cố tình bao phủ **mọi plugin có thể mount được**, chứ không chỉ những plugin mà CLI, Web UI và runtime Python mặc định tải. Khi chạy từ nguồn, người dùng có thể mount bất kỳ package plugin nào qua `cordis.yml`; do đó, `@modelcontextprotocol/sdk` và dòng OpenTelemetry vẫn tiếp cận người dùng thật ngay cả khi không có bất kỳ lắp ráp mặc định nào đưa chúng vào. Đối với công bố pháp lý, công bố thiếu mới là hướng có cái giá đắt hơn.

Tập hợp manifest được suy ra từ thành viên `packages:` do `pnpm-workspace.yaml` gốc khai báo, bao gồm cả workspace Landlock và các package công khai của nó, nên khu vực thành viên mới sẽ được đọc ngay từ ngày khai báo, mà không cần chờ ai nhớ ra để bổ sung vào danh sách. Giấy phép và địa chỉ repo được lấy từ pnpm store đã cài đặt của workspace gốc và trường link cục bộ của package; nếu một package không resolve được ở cả hai nơi thì sẽ fail thẳng, thay vì để lại ô trống. `OVERRIDES` thu thập các package mà manifest đã publish không trả lời được: các package executable npm xây dựng bằng Rust bỏ trường `license` khi publish, và dòng `modelcontextprotocol/servers` — repo này đang trong quá trình cấp lại giấy phép từ MIT sang Apache-2.0, điều khoản thực tế tùy theo từng đóng góp. Giấy phép của dependency runtime nếu không nằm trong danh sách permissive sẽ fail cứng: phân phối copyleft là một quyết định phân phối, không nên bị một lần sinh lại âm thầm hấp thụ. Các package được nạp vào mã nguồn sẽ được đối chiếu chéo với `vendor/README.md`, xuất hiện giấy phép không phải MIT sẽ báo lỗi; `patchedDependencies` của `pnpm-workspace.yaml` được liệt vào bảng runtime, vì pnpm áp các patch này ngay từ khi cài đặt — thứ mà artifact phân phối mang theo là `@earendil-works/pi-tui` và `node-pty` đã bị chỉnh sửa, bản thân file patch chính là bản ghi đầy đủ của thay đổi.

Chủ sở hữu dự án ủy quyền phân phối riêng cho từng phiên bản `@anthropic-ai/claude-agent-sdk` chính thức, cùng với CLI Claude Code chính thức và payload nền tảng mà phiên bản đó khai báo qua `optionalDependencies`. Generator biểu diễn điều này như một ngoại lệ khớp chính xác với định danh package trực tiếp, chứ không phải như một override giấy phép permissive: `SEE LICENSE IN README.md` và `SEE LICENSE IN LICENSE.md` vẫn được phân loại là không permissive, mọi dependency runtime không permissive không liên quan khác vẫn fail theo hướng từ chối mặc định. Khi SDK này tồn tại, generator sẽ đọc manifest đã cài đặt của nó, từ chối định danh package tùy chọn không khớp tiền tố payload SDK chính thức, suy ra phiên bản SDK, CLI và payload hiện tại, xác minh định danh, phiên bản và trường giấy phép khai báo của payload host đã cài đặt, và render tập hợp payload đầy đủ mà SDK khai báo trong một mục công bố riêng. Việc phiên bản, giấy phép khai báo và tập hợp payload thay đổi không cần ủy quyền định danh mới, nhưng vẫn phải qua review dependency, lockfile, tương thích, điều khoản và công bố như thông thường.

## Kiểm thử

Cùng một spec assert độ mới cũng dùng manifest fixture (dữ liệu tiền đề kiểm thử) để khóa quy tắc phân lớp, bao phủ hai kịch bản đã thúc đẩy quy tắc này: mục `dependencies` của package hỗ trợ test, và package plugin không có ứng dụng nào mount. Nó còn khóa các resolver ở những dạng vốn dĩ sẽ khiến một package âm thầm biến mất: bảng `vendor/README.md` không bao phủ hết mọi thư mục đã nạp, mảng dependency có extras (`"httpx[http2]"`), dependency hoàn toàn không có phiên bản, bảng `[dependency-groups]` do tác giả tự đặt tên, và bất kỳ khu vực thành viên workspace nào không nằm trong danh sách hardcode. Đây đều là các đường dẫn bỏ sót âm thầm — chính là kiểu thất bại mà file công bố không thể chấp nhận nhất.

Test phân phối Claude chứng minh: chỉ định danh SDK trực tiếp khớp chính xác mới vượt qua được việc từ chối runtime không permissive thông thường; ngoại lệ này không thay đổi việc phân loại giấy phép; tập hợp payload đến từ manifest SDK, chứ không phải từ danh sách cho phép theo phiên bản hoặc nền tảng. Test sẽ fail khi định danh SDK sai, payload thiếu, hoặc tồn tại định danh package tùy chọn không liên quan.

## Các phương án đã cân nhắc

**Giữ file viết tay, rà soát thủ công khi phát hành.** Rà soát bằng mắt hàng trăm dòng dữ liệu suy diễn chính là việc mà generator có thể làm đúng; hơn nữa, giữa hai lần phát hành, không ai xác minh câu tự nhận "liệt kê toàn bộ dependency trực tiếp" của file này còn đúng hay không.

**Dùng gate `doc-sync` (gate đồng bộ tài liệu) chuyên dụng.** Các artifact được sinh ra khác trong repo đều được kiểm soát theo cách này, thay đổi lần này ban đầu cũng ở dạng đó. Nhưng nó sẽ chiếm thêm một tiến trình gate và một slot lịch trình trong ma trận vốn đã dài; tệ hơn, cách fail duy nhất của nó là thông báo cho ai đó quay lại chạy generator vài phút sau khi họ đã push xong một lần nâng cấp dependency không liên quan. Việc sinh lại khi commit loại bỏ gián đoạn này, còn việc đặt assertion vào spec vốn dĩ đã chạy trong lane test giữ được bảo đảm này mà không tốn thêm chi phí CI nào.

**Liệt kê toàn bộ closure gián tiếp.** Closure có hàng nghìn package, lockfile đã có phiên bản chính xác, liệt kê hết chỉ làm chìm đi những dependency trực tiếp mà người đọc thực sự cần đánh giá. File thay vào đó trỏ đến lockfile và `pnpm licenses list`.

**Phân lớp theo trường manifest (`dependencies` và `devDependencies`).** Về mặt máy móc là đơn giản nhất, nhưng trên dữ liệu thực tế sẽ sai theo cả hai hướng, lý do đã nêu ở đoạn phân lớp phía trên.

**Chỉ phân lớp theo khả năng tiếp cận từ lắp ráp đã phân phối** (`apps/*` cộng `python/sdk-runtime`). Cách này cho lớp runtime gọn hơn, nhưng sẽ đánh giá client MCP và exporter OpenTelemetry là chỉ dùng để phát triển — trong khi người dùng chạy repo đã cài đặt hoàn toàn có thể mount chúng. Điều này sẽ đánh giá thấp việc công bố, sai về phía nguy hiểm hơn đối với thông báo pháp lý.

**Coi điều khoản Claude SDK là điều khoản permissive, hoặc thêm danh sách cho phép không permissive có thể tái sử dụng.** Cả hai phương án đều sẽ mô tả sai công bố thượng nguồn, và khiến các dependency runtime không liên quan kế thừa một ủy quyền chưa từng được cấp cho chúng. Ngoại lệ hẹp này chỉ khớp định danh SDK trực tiếp chính thức; định danh payload tùy chọn của nó chỉ được chấp nhận như dữ liệu do SDK đó khai báo, và tiếp tục được phân loại rõ ràng là không permissive.

**Làm file công bố thành cặp song ngữ.** Các tài liệu gốc khác đều thành cặp, nhưng file này là bảng gồm tên package thượng nguồn, định danh SPDX và địa chỉ web, phần có thể dịch chỉ là vài đoạn dẫn nhập mục lục ngắn ngủi. Phạm vi phát hiện của `scripts/translation-pairing.ts` giới hạn ở `README*`, `.agents/notes/**`, `docs/**` và `python/**`, các file không phải README ở thư mục gốc theo cấu trúc vốn không thuộc kho ngữ liệu song ngữ; điểm vào song ngữ do cặp README đảm nhiệm.

## Hệ quả

Từ nay khi thay đổi dependency, file công bố được sinh lại sẽ vào cùng một commit. Các commit chạm vào manifest phải trả thêm một lần chạy generator — khoảng một giây; các commit khác không bị ảnh hưởng. Nếu commit bỏ qua hook, cái giá đó bị đẩy thành một lần fail ở lane test, mà thông báo lỗi sẽ chỉ ra lệnh khắc phục.

Generator cần cây dependency đã cài đặt, nên nặng hơn generator chỉ dùng nguồn thuần túy; package mới không có metadata publish cần bổ sung một mục `OVERRIDES`, thay vì âm thầm render ra giấy phép trống. Cả hai loại lỗi này đều báo rõ ràng và chỉ ra cách khắc phục.

Quy tắc phân lớp là một chính sách được mã hóa trong một constant. Nếu thêm khu vực workspace mới không tham gia phân phối — hạ tầng test lớp thứ hai, một site khác — thì phải đồng thời mở rộng `DEV_ONLY_AREAS`, nếu không dependency của nó sẽ bị công bố nhầm thành dependency runtime.

Ngoại lệ định danh Claude cố tình hẹp hơn phạm vi công bố payload mà nó kích hoạt. Nâng cấp SDK không cần ủy quyền chủ sở hữu mới, nhưng nếu SDK đã cài đặt không tự công bố phiên bản của nó, phiên bản CLI, và ít nhất một payload nền tảng chính thức, hoặc payload host hiện tại không khớp với khai báo của SDK, việc sinh lại sẽ fail. Người bảo trì vẫn phải review điều khoản và tính tương thích khi có thay đổi; generator chỉ ngăn việc ủy quyền âm thầm mở rộng sang các package khác.
