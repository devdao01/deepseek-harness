# Agent Note: Dependabot version update dùng thời gian cooldown 30 ngày

Status: implemented

[English](2026-07-27-dependabot-version-updates.md) | Tiếng Việt

## Vấn đề

Dependency từ package registry và dependency GitHub Actions đều cần một cơ chế cập nhật định kỳ. Áp dụng ngay mỗi phiên bản mới vừa phát hành sẽ làm tăng rủi ro bị ảnh hưởng bởi phiên bản bị xâm nhập và regression sớm; nhưng chỉ dựa hoàn toàn vào cập nhật thủ công lại khiến khoảng cách phiên bản dependency ngày càng lớn. Cordis được đưa vào repo dưới dạng source code không thể xử lý như một dependency registry, còn các workspace dùng chung một lockfile phải cập nhật qua cùng một cây package.

## Quyết định

Branch mặc định chứa [`.github/dependabot.yml`](../../../../.github/dependabot.yml), trong đó cấu hình kiểm tra version update hàng tuần cho workspace pnpm gốc chứa `native/landlock-run`, project uv `python/sdk` và GitHub Actions. Mỗi mục cập nhật đều đặt `cooldown.default-days` thành `30`, nên một phiên bản chỉ đủ điều kiện cập nhật sau khi phát hành ít nhất 30 ngày, và sẽ tạo đề xuất cập nhật vào lần kiểm tra hàng tuần tiếp theo. [Quyết định phát hành Landlock trong repo](2026-08-06-in-repository-landlock-release.md) chịu trách nhiệm về ranh giới workspace dùng chung.

Việc quét version update của workspace pnpm gốc loại trừ `vendor/**`, source code và manifest (metadata catalog) trong đó chỉ có thể thay đổi qua [quy trình vendoring](../../../../vendor/README.md). GitHub chỉ dùng `exclude-paths` cho version update; nếu PR (Pull Request) cập nhật bảo mật liên quan tới manifest được đưa vào repo cùng source code, việc này sẽ do quy trình vendoring xử lý thay thế, chứ không merge nguyên trạng PR được sinh tự động. PR của Dependabot sẽ nhận label loại `kind/dependency` và label khu vực `area/infra` của repo, chạy các kiểm tra PR thông thường, và vẫn phải được maintainer review. Cơ chế tự động này không merge các PR đó.

Cấu hình repo đã bật cảnh báo lỗ hổng dependency và Dependabot security update. GitHub không áp dụng thời gian cooldown version update cho các security update này, nên bản vá bảo mật vẫn có thể đi vào quy trình cập nhật ngay lập tức. Nếu việc resolve dependency của security update cũng chọn thêm transitive dependency vừa mới phát hành khác, PR security update của pnpm vẫn có thể không vượt qua kiểm tra thời hạn phát hành lockfile của repo; loại PR như vậy nên chờ hết giai đoạn cách ly hoặc thu hẹp phạm vi cập nhật, không được nới lỏng chính sách vì lý do này. Ngoại lệ mà repo thiết lập để phối hợp phiên bản vừa phát hành không được đưa vào danh sách loại trừ cooldown của Dependabot: version update tự động thống nhất chờ 30 ngày; cập nhật thủ công đã qua review rõ ràng vẫn có thể theo quy trình phát hành tương ứng.

Mục cập nhật của pnpm giữ cho workspace thống nhất tiếp tục dùng pnpm 11 đã cố định, không hạ phiên bản chỉ để phục vụ tự động hóa. Bộ cập nhật Dependabot hiện tại sẽ cài đặt phiên bản `packageManager` được chỉ định ở gốc, và đọc định dạng `9.0` của lockfile gốc; task cập nhật do provider chạy vẫn được giữ làm kiểm tra tích hợp.

## Các phương án thay thế đã cân nhắc

- **Cập nhật phiên bản ngay lập tức.** Không dùng, vì cách này hủy bỏ giai đoạn cách ly sau phát hành phiên bản theo yêu cầu, khiến dự án áp dụng mỗi phiên bản upstream ngay từ đầu vòng đời phát hành của nó.
- **Tự động merge sau khi CI pass.** Không dùng, vì thay đổi dependency có thể làm thay đổi hành vi runtime, build và phát hành; việc chấp nhận cập nhật hay không vẫn phải qua quyết định review thông thường.
- **Cấu hình quét npm độc lập cho native.** Không dùng, vì manifest Landlock thuộc về workspace gốc và lockfile gốc; tách riêng việc cập nhật sẽ tái tạo một ranh giới sở hữu mà package manager không còn tồn tại. Việc quét gốc chỉ loại trừ manifest được đưa vào cùng source code.
- **Renovate hoặc agent (intelligent agent) chạy định kỳ.** Cả hai đều có thể đề xuất cập nhật cho phiên bản đã phát hành đủ lâu, nhưng service được yêu cầu là Dependabot, và CI của repo đã coi PR của nó là nguồn dependency không đáng tin cậy.
- **Miễn trừ cooldown cho phiên bản vừa phát hành cần phối hợp.** Đường tự động không dùng, vì loại phiên bản này cần quyết định đồng bộ rõ ràng hoặc quyết định danh mục model, không thể thay thế bằng đề xuất cập nhật tổng quát.

## Hệ quả

- Sau khi giai đoạn cách ly kết thúc, cập nhật dependency thông thường sẽ đến dưới dạng PR quy mô nhỏ, dễ review, không cần maintainer định kỳ tự phát hiện cập nhật thủ công.
- Do tư cách cập nhật được đánh giá hàng tuần, PR cập nhật tương ứng thường xuất hiện 30 tới 36 ngày sau khi phát hành phiên bản.
- Dependabot không trì hoãn đề xuất cập nhật bảo mật; kiểm tra của repo vẫn có thể chặn transitive dependency vừa phát hành không liên quan, quy trình review cũng duy trì ranh giới vendoring.
- Maintainer vẫn chịu trách nhiệm quyết định có merge từng cập nhật hay không, và chẩn đoán bất kỳ giới hạn nào từ provider mà task cập nhật pnpm 11 báo cáo.
