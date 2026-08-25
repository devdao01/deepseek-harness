# Agent Note: Ưu tiên chọn dependency được duy trì liên tục thay vì tự viết tay

Status: implemented

[English](2026-07-26-dependencies-over-hand-rolling.md) | Tiếng Việt

## Vấn đề

harness đã tự viết tay một lượng lớn hạ tầng, trong khi các package bên ngoài trưởng thành từ lâu đã cung cấp năng lực tương đương. Một phần trong số đó là có chủ đích — Cordis được thu nạp dưới dạng source ([quyết định đưa vào vendor](2026-06-11-vendor-cordis-as-source.md)), [twin LLM (large language model) adapter](../architecture/2026-06-13-twin-llm-adapters.md), schemastery làm chuẩn config schema — nhưng phần đáng kể còn lại dần tích tụ dưới một kiểu tâm lý ngầm "tránh thêm dependency mới" chưa từng được nói rõ: danh sách dependency bên ngoài ở cấp repo luôn rất nhỏ, nhưng từng package lại tự mọc ra bộ parser SSE (Server-Sent Events), bộ chia khung giao thức (frame), vòng lặp retry và bộ khớp glob của riêng mình. `AGENTS.md` thực ra chưa từng viết ra bất kỳ chính sách dependency nào, agent chỉ có thể tự suy ra một quy tắc từ các pattern có sẵn, và quy tắc suy ra đó ("không thêm dependency") lại nghiêm ngặt hơn bất kỳ điều gì từng thực sự được quyết định. Đây chính là biểu hiện mặc định của ngộ nhận Not Invented Here (không phải do ta phát minh): mỗi bản sao viết tay của một thư viện được duy trì tốt đều là code mà chính chúng ta phải tự kiểm thử, viết tài liệu, review và debug, nhưng lại không được hưởng những bản vá edge case tích lũy từ cả hệ sinh thái.

## Quyết định

Đưa dependency bên ngoài vào là một hình thức đơn giản hóa chính đáng, không phải một ngoại lệ chính sách. Khi một package được duy trì tốt (hoặc năng lực Node built-in mà baseline engine của ta đã sẵn có) bao phủ được một mặt interface tự viết tay, thay thế code tự viết là hướng ưu tiên, và phải tuân theo cùng chuẩn bằng chứng như bất kỳ đơn giản hóa nào khác: việc thay thế này phải thực sự giảm bớt phần ta chịu trách nhiệm duy trì (code, test và mặt convention), chứ không chỉ là dịch chuyển độ phức tạp ra sau một lớp wrapper.

Ngưỡng chấp nhận cho dependency mới:

- **Xóa ròng.** Dependency này thay thế code thực sự do ta duy trì (implementation + test riêng + tài liệu), chứ không phải code tương lai còn trong tưởng tượng. Dependency chỉ bổ sung năng lực thuộc về quyết định tính năng, không phải đơn giản hóa.
- **Mức độ khỏe mạnh.** Được duy trì liên tục, sử dụng rộng rãi, dấu chân transitive dependency hợp lý. Một package nhỏ không ai duy trì chỉ đơn giản là đổi code của ta lấy code đã bị bỏ rơi của người khác.
- **Khớp với ranh giới.** Ngữ nghĩa của package phải bao phủ đúng convention thực tế của ta; phần dư ngữ nghĩa vẫn cần tự viết tay bọc quanh nó phải được tính là điểm trừ cho lần thay thế này.
- **Không đụng vào seam đã chốt.** schemastery (config schema), Cordis được thu nạp dưới dạng source, adapter song sinh `@earendil-works`, và các quyết định khác đã ghi lại trong Agent Note implemented, không bị mở lại vì chính sách này; một lần thay thế làm sụp đổ một thiết kế đã ghi lại phải có lý lẽ mạnh hơn lý lẽ đã ghi lại, chứ không thể chỉ viện dẫn Agent Note này.

Điều lệ "zero-dependency" của `packages/util/` mô tả kỷ luật *export* của nhóm đó (các package util không mang theo dependency harness, nhờ vậy mọi nhóm khác đều có thể phụ thuộc vào chúng), và không cấm dùng package bên ngoài khi việc đó mang lại đơn giản hóa; nếu toàn bộ trách nhiệm của một package util đã được một package bên ngoài được duy trì tốt làm tốt hơn, thì nên thay bằng dependency đó thay vì giữ lại chỉ vì điều lệ.

Đề xuất thay thế dependency được ghi lại như bất kỳ đề xuất loại bỏ nào khác, dưới dạng Agent Note `proposed/simplification`, nêu rõ package ứng viên, mặt interface có thể xóa, phần ngữ nghĩa còn dư và các cân nhắc về supply chain. Chính sách này sẽ làm danh sách dependency tăng lên; việc quét công bố bảo mật và nhịp cập nhật cho danh sách này thuộc trách nhiệm của [đề xuất supply chain](../../proposed/process/2026-06-11-supply-chain-and-vendor-drift.md).

## Phương án thay thế đã cân nhắc

- **Duy trì văn hóa ngầm "không thêm dependency mới".** Không chấp nhận: nó chưa bao giờ là một quyết định được ghi lại, và chi phí của nó là cụ thể — code protocol và parser tự viết tay tái triển khai lại các thư viện đã được kiểm chứng thực chiến, đẩy cao gánh nặng coverage tính theo file, và làm chậm mọi reviewer: họ phải tự suy lại các edge case mà hệ sinh thái đã sửa từ lâu.
- **Một whitelist cứng gồm các package đã được duyệt.** Không chấp nhận: repo đang ở giai đoạn pre-release, tập dependency còn nhỏ; đặt ngưỡng bằng chứng theo từng PR (Pull Request) (xóa ròng, mức độ khỏe mạnh, độ khớp) cộng với review sẽ giữ phán đoán ở đúng nơi có ngữ cảnh, không cần một sản phẩm kiểu ủy ban thường trực mà bản thân nó cũng cần được duy trì.
- **Thu nạp mọi dependency mới dưới dạng source giống như Cordis.** Không chấp nhận: thu nạp dưới dạng source (vendor) chỉ phù hợp với những package ta buộc phải vá, hoặc buộc phải khóa cứng để chống lại thay đổi từ upstream ([quyết định đưa vào vendor](2026-06-11-vendor-cordis-as-source.md)); mở rộng cách này cho mọi dependency sẽ tái tạo lại chính gánh nặng duy trì mà việc thêm dependency vốn định trút bỏ. Cách làm mặc định là dependency NPM thông thường cùng lockfile khóa cứng.

## Hệ quả

- Agent và contributor đi rà soát cơ hội đơn giản hóa giờ đây coi "thay X tự viết tay bằng package Y" là sản phẩm nằm trong phạm vi công việc; [dsh-find-simplifications](../../../skills/dsh-find-simplifications/SKILL.md) mang theo hướng dẫn tương ứng.
- Danh sách dependency sẽ tăng lên, kéo theo mặt tiếp xúc supply chain mở rộng; biện pháp giảm thiểu được ghi lại trong [đề xuất supply chain](../../proposed/process/2026-06-11-supply-chain-and-vendor-drift.md), và chính sách này khiến đề xuất đó trở nên cấp thiết hơn.
- Root `AGENTS.md` mang theo một dòng quy tắc; lý lẽ và ngưỡng chấp nhận do Agent Note này nắm giữ.
