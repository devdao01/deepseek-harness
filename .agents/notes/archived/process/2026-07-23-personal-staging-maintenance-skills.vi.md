# Agent Note: Skill bảo trì nhánh tích hợp cá nhân

Status: implemented

Archived: 2026-08-10

[English](2026-07-23-personal-staging-maintenance-skills.md) | 中文

## Vấn đề

Việc tùy biến dsh cá nhân cần một phương pháp có thể lặp lại được, dùng để định vị mã nguồn đã cài đặt, cô lập thay đổi của từng tác vụ, tích hợp thay đổi tuần tự, và hợp nhất thay đổi upstream mà không ghi đè lên checkout mà session đang chạy sử dụng. Hướng dẫn local của người dùng có thể giải quyết vấn đề trong một bộ cài đặt cụ thể, nhưng không thể hướng dẫn người dùng khác, cũng không thể liên tục đồng bộ với hành vi của script cài đặt của repo.

## Quyết định

Repo phân phối [`dsh-customize`](../../../../skills/dsh-customize/SKILL.md), [`dsh-upgrade`](../../../../skills/dsh-upgrade/SKILL.md) và [`dsh-upstream-customization`](../../../../skills/dsh-upstream-customization/SKILL.md) từ thư mục `skills/` ở gốc repo. Mô tả của chúng vừa nói rõ nội dung thao tác, vừa nói rõ yêu cầu người dùng nào nên chọn skill (kỹ năng) đó. TUI được phân phối cung cấp thư mục này cho bên cung cấp skill local khi khởi động, với thứ tự ưu tiên phát hiện đứng sau thư mục gốc project và thư mục gốc người dùng. Các skill này định vị checkout và nhánh tích hợp đang hiệu lực hiện tại dựa trên launcher đã cài đặt, chứ không dựa trên đường dẫn cá nhân hay tên nhánh, tuân theo hướng dẫn trong repo, yêu cầu dùng task worktree, và tận dụng `.agents/merge.lock` sẵn có của worktree chứa nhánh tích hợp để thực thi tuần tự từng lần sửa nhánh tích hợp cá nhân.

Quy trình nâng cấp kiểm tra Git log và phạm vi commit trước khi rebase, để nhận diện thay đổi upstream, commit cá nhân, nội dung trùng lặp và các vùng có thể xảy ra xung đột sẽ đưa vào lần nâng cấp. Nó loại bỏ các tùy biến mà upstream đã cung cấp sẵn; nếu các tùy biến đó ở local chỉ còn khác biệt về tài liệu, cũng sẽ bị loại bỏ, trừ khi phần mô tả đó chứa quy ước hiện hành mà upstream còn thiếu và có thể dùng độc lập. Mỗi lần thử nâng cấp dùng chung một timestamp định dạng UTC cơ bản, dùng cho bản clone anh em độc lập `dsh-staging-<timestamp>`, nhánh local `dsh-upgrade/prepare-<timestamp>`, nhánh mới `dsh-staging/<timestamp>`, tham chiếu upstream riêng tư và tham chiếu khôi phục, cùng bản sao lưu launcher. Tên của bản clone anh em không suy ra từ tên thư mục hiện tại, xung đột tên sẽ thất bại trực tiếp, thay vì thêm hậu tố tạm thời. Quy trình suy ra vị trí mã nguồn của tiến trình DSH hiện tại dựa trên lệnh tiến trình và môi trường runtime, chứ không dựa trên thư mục làm việc của shell, sau đó coi repo và checkout mà launcher đã cài đặt trỏ tới là bất biến, ngoại trừ trường hợp duy nhất là đang giữ khóa merge sẵn có của nó.

Sau khi kiểm chứng thành công trong bản clone độc lập, workflow sẽ tạo và kiểm chứng nhánh tích hợp có timestamp, rồi chuyển launcher một cách nguyên tử (atomic) từ checkout nhánh tích hợp cũ (vẫn giữ nguyên không đổi) sang checkout nhánh tích hợp mới. Launcher không bao giờ trỏ tới checkout đang chuẩn bị, đang phát triển tính năng, đang review, đang phát hành, hoặc đang ở trạng thái detached. Lỗi xảy ra trước khi chuyển sẽ giữ nguyên checkout và launcher đã cài đặt; lỗi xảy ra sau khi chuyển sẽ khôi phục và kiểm chứng bản sao lưu launcher. Checkout nhánh tích hợp cũ, nhánh của nó, tham chiếu khôi phục và bản sao lưu launcher sẽ được giữ lại cho tới khi tiến trình sau khi khởi động lại chứng minh DSH đang chạy trên nhánh tích hợp mới, và người dùng phê duyệt rõ ràng việc dọn dẹp rollback.

`dsh-upstream-customization` độc lập với việc bảo trì và nâng cấp local, chịu trách nhiệm phát hành lên upstream. Nó đề xuất các bản fix bug, tính năng plugin dạng bổ sung không xung đột, và cải tiến giao diện; thay đổi mang tính xâm lấn cần được maintainer phê duyệt trước. Khi kết thúc nâng cấp, agent sẽ phân loại các tùy biến còn lại, giải thích giá trị của chúng đối với upstream, đề xuất có nên submit hay không, và hỏi người dùng muốn đóng góp ứng viên nào có tên cụ thể lên upstream. Chỉ khi người dùng đưa ra lựa chọn thì workflow phát hành mới được load; mỗi tính năng vẫn phải được phê duyệt rõ ràng trước khi push hoặc tạo PR (Pull Request) nháp. Các thay đổi được phê duyệt đều bắt đầu từ `master` hiện tại của upstream, không mang theo commit cá nhân không liên quan. PR nháp cho tính năng TUI khuyến nghị đính kèm ảnh chụp màn hình ứng dụng đã lắp ráp sau khi loại bỏ credential và dữ liệu cá nhân. `dsh-customize` yêu cầu kiểm chứng hành vi TUI tương tác trong một session tmux chuyên dụng trước khi tích hợp.

## Phương án thay thế

**Giới hạn các workflow này ở phạm vi local của người dùng.** Cách này giữ được sự linh hoạt cho sử dụng cá nhân, nhưng người dùng khác không thể phát hiện cùng bộ quy tắc an toàn đó, và workflow cũng có thể dần lệch khỏi hành vi của script cài đặt mà repo phân phối.

**Rebase tại chỗ ngay trong checkout nhánh tích hợp hiện tại.** Phương án này đơn giản hơn, nhưng sẽ sửa đổi nhiều file trong lúc chuẩn bị, có thể ảnh hưởng tới việc khởi động dsh mới, cũng không đạt được phát hành nguyên tử hay cung cấp một checkout rollback giữ nguyên không đổi.

**Cập nhật checkout nhánh tích hợp hiện có sau khi đã di chuyển launcher đi nơi khác.** Phương án này có thể giữ một đường dẫn nhánh tích hợp duy nhất, nhưng yêu cầu launcher trỏ tới một đích không phải nhánh tích hợp giữa chừng quá trình nâng cấp, và vẫn sẽ ghi đè lên checkout có thể đang mang tiến trình đang chạy.

**Chỉ khóa ở bước chuyển nhánh cuối cùng.** Cách này rút ngắn thời gian giữ khóa, nhưng cho phép bên ghi tiếp tục tích hợp thay đổi tùy biến dựa trên baseline cũ trong lúc chuẩn bị rebase, khiến lịch sử đã chuẩn bị bị vô hiệu.

**Phát hành mọi thay đổi cá nhân bằng một PR upstream duy nhất.** Cách này giảm công việc quản lý nhánh, nhưng sẽ phát hành cả các tùy biến không liên quan, và xóa bỏ ranh giới phê duyệt theo từng tính năng của người dùng.

## Ảnh hưởng

Quy trình chuẩn bị nâng cấp giữ khóa merge của nhánh tích hợp đã cài đặt trong lúc cài dependency và chạy kiểm tra, do đó việc tích hợp tùy biến local phải chờ kết quả nhất quán. Một lần nâng cấp sẽ tạo bản clone và nhánh tích hợp có timestamp độc lập, thực hiện một lần chuyển launcher nguyên tử, và yêu cầu khởi động lại một lần sau khi chuyển; ngoại trừ việc giữ khóa sẵn có của nó, nâng cấp không bao giờ ghi vào repo hay checkout mà launcher đang trỏ tới. Các workflow ghi lại điều kiện tiên quyết, kiểm tra lại trước khi sửa đổi, kiểm tra trạng thái sau khi việc sửa đổi bị gián đoạn, khôi phục bản sao lưu launcher khi chuyển thất bại, chạy lại kiểm tra thất bại sau khi sửa, và báo cáo trạng thái cuối cùng. Checkout nhánh tích hợp cũ được giữ lại làm lưu trữ rollback cho tới khi người dùng phê duyệt rõ ràng việc dọn dẹp. Đánh giá trong repo bao phủ việc chọn skill, bảo vệ mã nguồn tiến trình, trạng thái repo không an toàn, rollback và ủy quyền phát hành; kiểm tra tài liệu của repo kiểm chứng liên kết và định dạng của skill, tính đúng đắn của thao tác Git và hệ thống file vẫn thuộc trách nhiệm review kỹ thuật.
