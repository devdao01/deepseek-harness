# Agent Note: Cắt bỏ các giao diện không dùng đến trong registry skill

Status: rejected — đăng ký skill trực tiếp tại runtime là một đường mở rộng có chủ đích, được dành riêng cho plugin của bên thứ ba.

[English](2026-07-12-prune-unused-skill-registry-api.md) | Tiếng Việt

## Vấn đề

Trong hệ thống con runtime nhúng của dịch vụ skill (kỹ năng), `ctx.skills.register()` không có bên gọi nào trong production. Nó kéo theo một tên nhà cung cấp dành riêng là `runtime`, một bộ map/rank/source ở runtime, chính sách xử lý trùng lặp, một revision thứ hai trong khóa cache, logic chuẩn hóa, hàm dispose (giải phóng tài nguyên) và các test tương ứng — trong khi mọi skill đã bàn giao đều dùng quy ước nhà cung cấp. `SkillSummary.whenToUse` cùng `path` của candidate/definition được phân tích và sao chép, nhưng không có phía tiêu thụ nào trong production đọc chúng: catalog cho mô hình chỉ kết xuất name/description, việc nạp tài nguyên dùng `resourceBase`, còn nhà cung cấp thì tự quản lý bộ định vị của mình. Điểm mở rộng `metadata` vốn được mở có chủ đích thì giữ nguyên.

## Đề xuất

Loại bỏ `SkillRegistry.register()`, `SkillRegistration`, nhà cung cấp giả ở runtime cùng quy tắc tên dành riêng, nhánh revision/cache của runtime, và logic chuẩn hóa source/rank chỉ dùng cho runtime. Các test cần skill nhúng sẽ chuyển sang đăng ký một nhà cung cấp thật cỡ nhỏ. Giữ `providerRevision` làm epoch cho các thao tác khám phá đang diễn ra, nhưng cache catalog đã hoàn tất chỉ lấy cwd làm khóa: mỗi lần nhà cung cấp thay đổi sẽ xóa cache một cách đồng bộ, và việc so sánh revision sau await đã đủ để ngăn chèn kết quả cũ. Loại bỏ `whenToUse`, `SkillCandidate.path` và `SkillDefinition.path` khỏi quy ước skill cũng như bản sao của nhà cung cấp cục bộ, đồng thời giữ lại đường dẫn locator/root của nhà cung cấp; giữ `metadata`, `disableModelInvocation`, `source`, `provider`, `locator` và `resourceBase`, vì chúng hoặc là từ vựng mở rộng được mở có chủ đích, hoặc là trường được tiêu thụ trong production.

Đồng thời sửa lại Agent Note về hệ thống skill, README, JSDoc, các tệp catalog và test. Đoạn system prompt ở phạm vi agent (tác tử), nhà cung cấp công cụ và biến rõ ràng nằm ngoài phạm vi đề xuất này: [quy ước bên đóng góp ở phạm vi agent](../../implemented/architecture/2026-07-08-agent-scope-contexts.md) cố ý cho phép đăng ký cả ba thứ đó thông qua context do agent sở hữu trong lúc `setup(agentCtx)`, nên việc trong repo không có đăng ký phạm vi cố định nào không chứng minh được rằng chúng không được dùng.

## Các phương án đã cân nhắc

**Giữ lại việc đăng ký skill runtime cho bên nhúng.** Đây là giao diện tiện lợi định nghĩa trực tiếp, đồng bộ, được cung cấp có chủ đích trong Agent Note về skill đã triển khai. Một lớp bọc nhà cung cấp cỡ nhỏ có thể phơi bày cùng dữ liệu nhúng đó dưới vòng đời do effect sở hữu, nhưng nó buộc phải cài đặt `list()`/`get()` bất đồng bộ, mang danh tính nhà cung cấp và chấp nhận ngữ nghĩa xử lý trùng lặp của nhà cung cấp. Đề xuất này chọn chỉ giữ một đường dẫn nhà cung cấp thống nhất, thay vì duy trì bộ thứ hai gồm sắp xếp, kiểm tra, vô hiệu hóa cache và tra cứu.

## Tiêu chí nghiệm thu

- Việc thu thập skill chỉ có một đường dẫn do nhà cung cấp điều khiển, cache đã hoàn tất chỉ lấy cwd làm khóa, epoch revision chỉ dùng để vô hiệu hóa các thao tác khám phá đang diễn ra; các trường skill được giữ lại hoặc có bên đọc trong production, hoặc có quy ước mở rộng có chủ đích được ghi nhận.
- Đoạn system prompt ở phạm vi agent, biến, nhà cung cấp công cụ, guard công cụ, cùng hành vi gửi structured-output ở chế độ native và Code Mode đều giữ nguyên.
- Kiểm tra kiểu, độ bao phủ, snapshot, doc-sync (cổng đồng bộ tài liệu), kiểm tra module-graph, build và hygiene đều vượt qua.

## Rủi ro

Đây là một đợt thu gọn ở mức nhìn thấy được khi biên dịch đối với registry skill tiền phát hành. Phía tiêu thụ `list()`/`get()` theo cách lập trình từ bên ngoài sẽ mất gợi ý định tuyến `whenToUse` cùng `path` của candidate/definition; catalog cho mô hình đã bàn giao chưa bao giờ kết xuất chúng, và việc phân giải tài nguyên vẫn giữ `resourceBase` tường minh cộng với locator mờ do nhà cung cấp tự sở hữu, nhưng các trường này không tương đương nhau về mặt quan sát. Việc phân tích frontmatter cục bộ của skill vẫn phải tiếp tục giữ lại và kiểm tra schema metadata được hỗ trợ, còn nhà cung cấp bên ngoài vẫn có thể cung cấp skill từ nguồn nhúng, hệ thống tệp, từ xa hoặc nguồn khác.
