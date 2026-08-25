# Agent Note: Thứ tự thống nhất của các nguồn cấu hình, và những gì file được phát hiện không được phép quyết định

Status: implemented

[English](2026-08-04-configuration-source-ownership.md) | Tiếng Việt

## Problem

`$DSH_HOME/.env` vừa [trở thành một lớp môi trường thông thường](2026-08-04-credentials-yaml-and-user-environment-layer.md), khiến harness khi resolve giá trị hướng tới người dùng phải đối mặt với một `process.env` đã bị làm phẳng, không còn nói rõ được một giá trị đến từ đâu nữa. Từ đó sinh ra ba hệ quả.

Key được lưu qua trang Web vẫn bị key cũ hơn trong `.env` của chính người dùng che khuất, vì provider credential so sánh "môi trường" với file của chính nó, mà giờ môi trường đã bao gồm cả file đó. Ngõ cụt di trú mà lần tách này lẽ ra phải loại bỏ chỉ đơn giản là đổi chỗ.

endpoint có thể bị dự án chuyển hướng lại. `.env` của thư mục lời gọi cũng sẽ được vật chất hóa giống mọi lớp khác, mà base URL quyết định key API đã resolve sẽ được gửi tới đâu — vì vậy `DEEPSEEK_BASE_URL` được ghi vào workspace mà model có thể chỉnh sửa sẽ gửi cả credential riêng của người dùng, lẫn prompt mang theo code của họ, tới bất kỳ host nào mà file đó chỉ định. View đã bị làm phẳng không thể phân biệt việc này với việc vận hành export tường minh cùng một biến.

Còn `!!js process.env.X` trong các lắp ráp đã giao lại khiến cùng một giá trị có hai con đường để tới: một qua entry config, một qua ladder riêng của từng consumer, và bên nào thắng phụ thuộc vào thứ tự lớp chứ không phải ngữ nghĩa của giá trị đó.

## Decision

**Giá trị không phải bí mật đi theo cùng một thứ tự.** Mỗi giá trị có thể cấu hình mà bản thân nó không phải là credential đều được resolve theo cùng một thứ tự; khác biệt giữa các domain chỉ nằm ở việc lớp nào tồn tại.

```text
explicit for this run     per-operation override, CLI argument
> user settings           settings.yaml
> composition             profile bundles, user patch layers, --patch overlays
> this launch's shell     inherited process environment
> discovered file         <invocation cwd>/.env, then $DSH_HOME/.env
> defaults                schema default, provider public default
```


settings đứng trên composition, vì [settings seam](2026-07-28-user-settings-seam.md) chính là làm như vậy: plugin đăng ký cordis entry config của chính nó làm lớp `base`, section của người dùng chồng lên trên nó, mà seam không thể phân biệt một giá trị là do bundle của profile đặt, hay do lớp patch người dùng của nó, hay do một overlay `--patch` nào đó đặt — chúng đều tới dưới dạng entry config. CLI (giao diện dòng lệnh) sản phẩm không có cách nào đứng trên settings đã tồn tại, nên bên triển khai nào cần ghim cứng một trường, không cho settings đã tồn tại của người dùng ghi đè, nên tự mang theo cây cấu hình bin hoặc loader riêng, hoặc đơn giản là không mount provider settings. composition vẫn cao hơn môi trường, nên `DEEPSEEK_BASE_URL` cũ trong shell không thể viết đè lên endpoint đã được cấu hình.

**Credential giữ một thứ tự độc lập hẹp hơn**, note này không gộp nó vào bảng trên:

```text
inherited process environment      (read-only, wins)
> $DSH_HOME/.credentials.yaml      (provider-managed, writable)
> <invocation cwd>/.env
> $DSH_HOME/.env
```

Môi trường kế thừa được ưu tiên trước, vì `DEEPSEEK_API_KEY=… dsh`, secret CI và `-e` của container là loại ghi đè mà vận hành phải áp dụng được theo từng lần, mà không cần thay đổi trạng thái của máy; và vì nó không thể sửa được từ bên trong tiến trình, nó phải *hiển nhiên* chỉ đọc (read-only). Cấu hình lẽ ra chỉ nên mang theo *tham chiếu* — resolve tên nào — bản thân cái tên đó tuân theo thứ tự không-phải-bí-mật ở trên.

**Dự án mà harness được khởi động bên trong mặc định được tin cậy, và không hỏi han.** Một checkout có thể mang theo endpoint riêng, biến thông thường riêng và key riêng của nó; key được xếp dưới managed storage, nên key được lưu qua trang Models không bao giờ bị key mà checkout tình cờ mang theo đè lên. `LaunchEnvironmentSnapshot.getFrom(name, sources)` vẫn chỉ tìm kiếm trong các lớp mà bên gọi nêu tên, việc bỏ qua một lớp nào đó vẫn là từ chối chứ không phải hạ cấp — cơ chế này được chuẩn bị cho những quyết định kiểu "một lớp nào đó bắt buộc phải không thể tiếp cận được", mà lớp dự án hiện nay không nằm trong số đó.

**Sự tin cậy không mở rộng tới việc thay đổi chính harness.** `loadLayeredEnv` sẽ từ chối, ngay lúc load và trước khi vật chất hóa bất kỳ nội dung nào, mọi `.env` có thiết lập các biến sau: những biến quyết định tiến trình khởi động như thế nào (`PATH`, `SHELL`, `NODE_OPTIONS`, `LD_PRELOAD`), những biến quyết định runtime thực thi code nào trước khi chạy chương trình được yêu cầu (`BASH_ENV`, `PERL5OPT`, `PYTHONSTARTUP`, `RUBYOPT`, `JAVA_TOOL_OPTIONS`, lệnh hook của Git), những biến quyết định chỉ thị model có thể thấy được nạp từ đâu (toàn bộ namespace `DSH_*`, `HOME`, `XDG_*`), và những biến quyết định cách truy cập mạng cũng như cách thiết lập niềm tin (biến proxy và CA). Việc khớp không phân biệt hoa thường, nên `https_proxy` không phải là cách để né tránh.

Ranh giới ở đây là: chúng có hiệu lực mà không cần bất kỳ hành động nào của người dùng, trước khi bất kỳ turn nào bắt đầu, và nằm ngoài chính sách quyền và sandbox. `DSH_PERMISSION_MODE` sẽ tắt đi chính bước duyệt (approval) làm cho "tin cậy dự án" trở nên có ý nghĩa, còn `BASH_ENV` sẽ thực thi file do dự án chỉ định mỗi khi bash tool phát ra `bash -c` — code của dự án chạy dưới chính sách của agent (tác nhân) là quy ước, dự án viết lại chính sách đó thì không phải. Liệt kê từng biến một là một trò chơi thua chắc, nên toàn bộ namespace `DSH_*` bị từ chối thay vì chỉ từ chối một tập con đã được review, và cũng vì lý do đó danh sách này được tổ chức theo *biến làm gì*, chứ không phải theo runtime nào sở hữu nó. Không đặt lối thoát: bản thân lối thoát luôn phải đọc từ đâu đó, và bất cứ thứ gì mà một file được phát hiện có thể thiết lập, chính là cái lỗ hổng đó.

**`packages/util/launch-environment` sở hữu snapshot này**, cố ý làm thành một utility chứ không phải seam năng lực ba package. Snapshot bị đóng băng trước khi Cordis khởi động, và được launcher inject một lần duy nhất, nên không tồn tại cách triển khai runtime nào cần chuyển đổi; consumer chỉ cần kiểu và hàm thuần, mà package `util/` có thể cung cấp những thứ đó mà không cần phụ thuộc vào package UI. `launchEnvironmentOf(ctx)` trả về snapshot của launcher, hoặc trả về chỉ lớp môi trường kế thừa — SDK host hay `cordis.yml` trần chưa từng phát hiện file nào, lớp duy nhất của nó thực sự chính là môi trường lúc nó được khởi động, nên cùng một truy vấn tin cậy đó vẫn tiếp tục hoạt động nguyên trạng ở đó.

**`verify-config-source-ownership`** chỉ đóng vai trò một cổng kiểm tra hẹp, kiểm tra cách viết inline `apiKey`/`baseURL`/`headers` từ môi trường theo kiểu một dòng thông thường trong cấu hình Cordis đã giao. Việc xóa các inline này chính là lý do tầng "triển khai" có ý nghĩa — sau khi cây cấu hình đã giao giữ im lặng về `baseURL`, "có giá trị" có nghĩa là "có người hoặc bên triển khai đã đặt nó". Việc resolve thực tế thuộc trách nhiệm của adapter; cổng kiểm tra này không tuyên bố bao phủ việc truy cập `process.env` trên phạm vi toàn repo.

## Consequences

- Form credential trên Web giờ có thể ghi đè key cũ hơn trong `.env` của người dùng; chỉ có key được export trong shell khởi động mới khiến nó trở thành chỉ đọc, và chẩn đoán cũng sẽ nói như vậy.
- `.env` chứa `DSH_*`, `PATH` hoặc biến proxy sẽ khiến khởi động thất bại thay vì được áp dụng. Developer đã đặt công tắc trong `.env` của repo cần chuyển sang đặt trong shell — đây là một sự phá vỡ có chủ đích và lớn tiếng.
- composition không còn bị endpoint cũ trong shell ghi đè nữa. Nhưng nó vẫn bị `settings.yaml` đã tồn tại của người dùng ghi đè, đây là cách phân lớp của settings seam, note này không thay đổi điều đó; CLI sản phẩm không có cờ nào đứng trên nó, nên bên triển khai cần ghi đè settings đã tồn tại phải tự mang theo cây cấu hình bin hoặc loader riêng.
- Chưa được giải quyết: các lớp vẫn sẽ được vật chất hóa vào `process.env`, nên biến dự án thông thường vẫn tiếp tục tới được tiến trình con theo quy tắc lọc tiến trình con. Biến bootstrap hoàn toàn không được phép đến từ file; package environment ghi nhận việc các biến còn lại vẫn có thể tới được tiến trình con như một giới hạn.
- Exa và Perplexity vẫn chụp key lúc load, chứ không qua credential seam. Chúng không còn đọc `process.env` trần nữa — chuyển sang resolve qua lớp được tin cậy — nhưng việc cải tạo chúng để resolve credential theo từng request là một việc khác.

## Alternatives considered

**Gộp credential vào thứ tự không-phải-bí-mật theo tiêu chí "nguồn do ai viết".** Đã thử và từ bỏ: đọc lên nghe rất xuôi, nhưng settings seam đã cố định composition ở *bên dưới* section người dùng, nên "do bên triển khai viết" hoàn toàn không phải một lớp mà seam đó có thể biểu đạt; còn nâng `.credentials.yaml` lên trên môi trường khởi động sẽ tước mất loại ghi đè duy nhất mà CI, container và `DEEPSEEK_API_KEY=…` một lần dùng dựa vào. Hai quy tắc, mỗi quy tắc tự mô tả thứ tự ưu tiên của riêng nó, tốt hơn một quy tắc mà cả hai phía đều mô tả không chính xác.

**Không trao năng lực route và credential cho dự án cho tới khi nó được tin cậy tường minh.** Bị bác bỏ như một lập trường sản phẩm: checkout mặc định được tin cậy, không hỏi han, cũng không lưu bản ghi tin cậy. Rủi ro còn sót lại là có thật và đáng được ghi rõ — clone một repo mang theo `.env` chỉ định một endpoint hoặc key khác, sẽ khiến session đó đi qua nó — nơi xử lý việc này là cổng kiểm tra project trust sau này, chứ không phải một quy tắc buộc mọi tình huống thông thường đều phải qua nghi thức.

**Review ra một whitelist `DSH_*` mà `.env` được phép thiết lập.** Bị bác bỏ: mỗi lần thêm một công tắc mới đều phải review lại, mà kiểu thất bại do bỏ sót lại là âm thầm. Từ chối toàn bộ namespace là an toàn khi lỗi (fail safe).

**Xếp biến bootstrap dưới lớp process, thay vì từ chối nó.** Bị bác bỏ: `PATH` và `NODE_OPTIONS` không có hành vi "sau khi thua" nào có ý nghĩa — người dùng viết nó vào `.env` cho rằng nó có hiệu lực, mà việc âm thầm bỏ qua chính là kiểu "cấu hình của tôi không có tác dụng" mà quyết định này muốn loại bỏ.

**Biến snapshot thành seam năng lực ba package (`environment` / `environment-local` / consumer).** Bị bác bỏ vì đây là tách quá sớm: bên sinh ra chạy trước khi Cordis tồn tại, và cũng không có cách triển khai thứ hai nào cần lựa chọn. Quy tắc của repo là không tách trước khi cần.

**Không còn vật chất hóa các lớp vào `process.env` nữa.** Hoãn lại chứ không bác bỏ: nó có thể khiến biến dự án hoàn toàn không vào được tiến trình con, nhưng sẽ âm thầm phá vỡ bất kỳ lớp patch người dùng nào đọc `!!js process.env.X`. Snapshot đã là căn cứ để harness resolve mọi thứ, nên việc này dù sau này mới hiện thực hóa cũng không thay đổi bất kỳ ladder nào.
