# Agent Note: Chiếu tài liệu chuẩn (authoritative) lên website

Status: implemented

[English](2026-07-13-documentation-site-projection.md) | Tiếng Việt

## Vấn đề

Repo cần một website tài liệu có thể điều hướng được, nhưng không được để thư mục website trở thành nguồn tài liệu thứ hai. Sao chép hướng dẫn package, trang kiến trúc hoặc catalog được sinh ra vào một cây thư mục riêng cho website sẽ khiến hai bản sao lệch nhau theo thời gian; để VitePress trỏ thẳng vào gốc repo lại khiến URL công khai và điều hướng bị gắn chặt vào cách bố trí file nội bộ. Các liên kết tương đối trong repo trên website cũng cần trỏ tới vị trí khác: trang đã publish nên ở lại trong site, còn file nguồn và tài liệu contributor chưa publish nên trỏ tới GitHub.

## Quyết định

Markdown chuẩn (authoritative) vẫn ở lại đúng cấp trong repo mà nó thuộc về. Hướng dẫn hướng tới sản phẩm nằm ở `docs/user/`, tài liệu tham chiếu được sinh ra vẫn nằm trong thư mục sinh sẵn có, các trang kiến trúc và trang cookbook cũng giữ nguyên đường dẫn `docs/` hiện có.

`website/docs.ts` là một manifest publish tường minh. Mỗi entry ánh xạ một file nguồn chuẩn tới một route công khai ổn định, sidebar, phân vùng và thứ tự. Vì vậy, thêm hoặc bỏ một trang đã publish là một thay đổi manifest có thể review được, chứ không phải kết quả của việc quét thư mục ngầm định.

Trước khi VitePress khởi động hoặc build, `scripts/project-doc-site.ts` sẽ chiếu manifest vào thư mục `website/.generated/` bị ignore. Cây thư mục được sinh ra tuân theo route công khai, giúp điều hướng VitePress, phát hiện locale và tìm kiếm cục bộ dùng chung một cách đặt tên route. Mỗi trang nhận một trường frontmatter `editSource` trỏ về file repo chuẩn của nó; callback link chỉnh sửa chỉ đọc dữ liệu của trang đó, nên URL công khai độc lập với cách bố trí file nguồn.

Phần chiếu trang chủ của từng locale chỉ giữ lại YAML frontmatter chuẩn. Phần thân hướng tới repo giữ nguyên H1 và liên kết tới file nguồn song ngữ; frontmatter thực hiện [chuyển hướng quick start giữ nguyên locale](../simplification/2026-08-11-quickstart-documentation-home.md), điều hướng website chịu trách nhiệm chuyển locale.

Bộ chiếu (projector) giải quyết liên kết Markdown nhưng không tuần tự hóa lại tài liệu. Liên kết trỏ tới một file nguồn đã publish khác sẽ trở thành route tương đối trong site; liên kết trỏ tới file repo chưa publish sẽ trở thành liên kết file nguồn dưới trang chủ repo `deepseek-ai/deepseek-harness`; ảnh trong repo sẽ được copy vào cây được sinh ra và tham chiếu từ đó ([lý do](2026-08-06-doc-site-carries-its-images.md)). Khi đích tương đối không tồn tại, việc chiếu sẽ thất bại. Unit test khóa chặt các hành vi chuyển đổi này, `docs:check` chạy test của bộ chiếu và build production VitePress, đưa cả hai vào `doc-sync` và các gate tài liệu song song.

`verify-public-repository-links` từ chối các tham chiếu trong file đã tracked trỏ tới repo cũ không còn khả dụng. Liên kết file nguồn và liên kết chỉnh sửa dùng trang chủ repo hiện tại.

`website/AGENTS.md` là file Markdown duy nhất được duy trì trong cây con website. Test của bộ chiếu liệt kê toàn bộ file đã tracked và file chưa tracked không bị ignore, từ chối mọi Markdown khác trong website, nên bản sao locale, route, API hoặc file nguồn được sinh riêng cho website không thể lách qua manifest publish.

Mermaid render các biểu đồ chuẩn. Workspace website khai báo tường minh rằng `vitepress-plugin-mermaid` cần Vite pre-bundle 5 package, vì cơ chế cô lập dependency nghiêm ngặt của pnpm sẽ khiến dev server cục bộ không dùng được các transitive dependency này; Knip ghi nhận cách dùng chỉ-tại-runtime này như một ngoại lệ dependency có chủ đích.

Việc publish website tách biệt với build website. Một workflow GitHub Actions riêng chạy các gate tài liệu hiện có, upload `website/.dist` như artifact Pages, và chỉ deploy sau khi build thành công. `actions/configure-pages` cấp base path cho vị trí đích tại thời điểm build cho VitePress, nên site Pages riêng tư, đường dẫn dự án công khai trong tương lai và domain tùy chỉnh không cần cấu hình checked-in riêng cho từng trường hợp. Khả năng hiển thị của Pages vẫn là cài đặt hosting của repo, không phải quyền của workflow.

## Các phương án thay thế đã cân nhắc

**Commit Markdown sao chép dưới `website/`.** Cách này giúp cấu hình VitePress trực tiếp hơn, nhưng mỗi hướng dẫn hoặc bảng API được sao chép sẽ có thêm một nơi sở hữu, và cần một quy ước đồng bộ không thể nhận diện bản sao chuẩn.

**Để `website/` trở thành nơi sở hữu chuẩn cho mỗi trang đã publish.** Cách này vẫn chỉ có một bản sao duy nhất, nhưng chỉ để phục vụ renderer, lại đưa kiến trúc, tài liệu tham chiếu được sinh ra và tài liệu hướng tới contributor ra khỏi cấp sở hữu repo riêng của chúng.

**Tự động phát hiện toàn bộ file Markdown.** Cách này giảm thiểu bảo trì manifest, nhưng có thể vô tình publish tài liệu nội bộ, biến việc di chuyển file nguồn thành thay đổi URL, và sinh điều hướng dựa trên thứ tự thư mục ngẫu nhiên.

**Dùng symlink hệ thống file.** Symlink giữ được nguồn duy nhất, nhưng không giải quyết được vấn đề route công khai hoặc liên kết tương đối trong repo, và hành vi của nó không đủ dự đoán được trong dev cục bộ, công cụ package và môi trường CI hosting.

**Chỉ build trong workflow deploy.** Job deploy có thể phát hiện lỗi render sau khi merge. Đưa build production vào `doc-sync` giúp cùng một lỗi bộc lộ cục bộ và trong CI thông thường, bất kể có deploy công khai hay không.

**Hard-code đường dẫn dự án công khai.** Base cố định `/deepseek-harness/` phù hợp với URL dự án công khai, nhưng không phù hợp với origin duy nhất được cấp cho site Pages riêng tư, cũng không phù hợp với domain tùy chỉnh trong tương lai. Dùng metadata của Pages giúp các vị trí đích này dùng chung một quy ước build.

## Hệ quả

Sự thật tài liệu chỉ có một nơi sở hữu có thể chỉnh sửa, route công khai vẫn ổn định sau khi file nguồn di chuyển, và website có thể tích hợp tài liệu tham chiếu được sinh ra mà không cần commit thêm một bản sinh khác. Dev cục bộ theo dõi (watch) input chuẩn và tái sinh phần chiếu dùng một lần. Gate về bố cục sẽ biến cây thư mục Markdown riêng cho website đã lỗi thời thành lỗi merge, thay vì một input build bị bỏ qua. Merge ảnh hưởng tới website tài liệu sẽ deploy kết quả đã kiểm tra lên Pages, còn trigger thủ công cung cấp lối vào để khôi phục và xác thực.

Manifest publish là một allowlist cần bảo trì, phần chiếu liên kết cũng đưa vào một lớp adapter build riêng cho repo. Thêm một loại hành vi liên kết Markdown mới cần thêm test cho bộ chiếu. Hỗ trợ Mermaid cũng làm tăng kích thước bundle client, nhưng giữ được các biểu đồ đã dùng trong tài liệu chuẩn.
