# Agent Note: Standing mount theo từng preset dựa trên chuỗi cha của scope

Status: implemented

[English](2026-08-08-per-preset-standing-mounts.md) | Tiếng Việt

## Vấn đề

Việc mount preset theo từng session làm cho view đăng ký hướng tới model trở thành theo từng agent, trong khi ba bên đọc độc lập trong host vẫn giả định nó là tĩnh: đọc nguội `session.history` không tìm thấy presenter (mỗi card lặng lẽ suy biến thành renderer chung — không phân biệt được với «tool vốn không có presenter»), khối projection mất các key do preset đăng ký (client coi key thiếu là năng lực không tồn tại và **xóa** dòng đó), Typert gateway phân giải `goals` trên root của host (`service-unavailable`). Vá từng bên đọc chỉ là đổi kiểu suy biến im lặng này lấy kiểu khác: resume để lấy được presenter sẽ lật fold của projection từ detached sang live, kéo theo việc đếm token bị xóa sạch.

## Quyết định

Một preset là một bản lắp ráp **theo từng process**, không phải theo từng session. roster mount nó một lần dưới một scope standing tổng hợp; mỗi agent tham gia bằng cách bind scope key của mình vào key đã mount (`bindScopeParent(agentKey, standingKey)`). Hai cơ chế của `dsh-scope` gánh toàn bộ việc này: view đăng ký phân giải dọc chuỗi cha (`agent → preset → global`, gần che xa), còn dispatch có scope thì cho qua với các listener mà nhãn của chúng là tổ tiên của key mang tải — chỉ đi lên, listener của các preset anh em vẫn điếc.

## Hệ quả

Standing mount sửa cả lớp vấn đề này chứ không phải một trường hợp riêng lẻ trong đó: các đăng ký mà bên đọc cần luôn tồn tại suốt vòng đời process, được đánh chỉ mục theo preset id, và không cần bất kỳ agent nào. Điều làm cho nó rẻ:

- Các plugin preset có trạng thái (`plan-mode`, `token-meter`, `compaction-basic`) vốn đã lưu trạng thái theo key `Session`/`Agent` — chúng có trước preset. Dùng chung một instance là quay về đúng thiết kế của chúng, không phải viết lại. `jobs-local` cũng có tính chất đó, và từ đó đã rời hẳn khỏi mặt phẳng preset: các bên sản xuất ngoài realm (`tool-bash`, `tool-terminal`, `tool-subagent` không continuable) phân giải registry đó bằng `ctx.get`, mà realm entry-local lại vô hình với chúng, nên nó được compose ở mặt phẳng host, chỉ còn dòng `tool-jobs` hướng tới model là vẫn nằm trong từng preset.
- yml của preset không đổi: mount một lần cho mỗi preset = một Entry cho mỗi preset, và realm entry-local của nó (`isolate: <name>: true`) khiến các service trùng tên của hai preset không liên quan gì nhau, đúng như trước kia nó tách biệt hai session.
- Dùng chung realm label **không phải** là lựa chọn: `provide()` ném lỗi ngay với lần đăng ký thứ hai dưới cùng một realm symbol, label gom chung REALM chứ không phải instance — trong thế giới mount theo session, dùng chung label sẽ làm lần mount thứ hai sụp đổ.

## Chi tiết chịu lực

- **Standing mount được gắn trên `selfCtx` không bị service theo dõi.** Các phương thức gọi qua proxy traceable thấy `this.ctx` bị rebind sang bên gọi và mang theo shadow; trong cây con dẫn xuất từ nó, việc phân giải reflect của mỗi fiber đều bắt đầu từ fiber của shadow, và entry sẽ thất bại trên chính service mà nó khai báo `inject` (`cannot get property "tools" without inject`, dù store của nó rõ ràng có). Tiền lệ selfCtx của `jobs-local` nay đã có bên tiêu thụ thứ hai.
- **Mount một khi đã thành công thì phục vụ liên tục, cho tới khi stamp của file lắp ráp thay đổi.** Bản lắp ráp mà một session đang chạy tham gia phải sống tiếp sau khi file của nó bị sửa hoặc xóa; mỗi thế hệ ghi lại stamp của file (mtime + kích thước), và khi session phát hiện thế hệ hiện tại đã cũ, nó mở thế hệ kế tiếp, nên việc chỉnh sửa file — trình soạn thảo lắp ráp duy nhất sau khi việc tạo mới chuyển sang chỉ sao chép — đến được các session sau mà không cần bất kỳ lệnh tạo nào vứt bỏ con trỏ. Các session đã tham gia giữ nguyên thế hệ của mình, còn thế hệ bị thay thế chỉ được thu hồi bằng cách unmount cả cây — đây là chủ ý, giới hạn trên phụ thuộc tần suất chỉnh sửa, và đã được ghi vào mục Known Limitations của package.
- **`peek()` vẫn không nhìn theo chuỗi.** Giới hạn và guard nhắm vào phần đóng góp của **chính** một scope đơn lẻ; chỉ **view** đăng ký mới kế thừa dọc chuỗi. Các giới hạn trên chuỗi thì giao nhau (bất kỳ scope nào trên chuỗi cũng có thể che một tên đăng ký toàn cục cho mọi thứ lồng bên trong nó).
- **Việc nhận cha lại chỉ có thể đi qua `ScopeParentBinding` do lần bind đầu tiên của mount trả về** — roster giữ riêng handle đó, nên recompose một session trống là đường rebind duy nhất, các bên gọi khác không thể dịch chuyển một agent đã được compose; tính hợp lệ của nó vẫn dựa trên tiền đề rằng mọi sản phẩm sinh ra dưới cha cũ đều không được giữ lại, do bên nắm giữ bảo đảm, bởi quan hệ này không nhìn thấy được trong session log.

## Các phương án đã cân nhắc

resume khi đọc nguội (xóa mất projection detached), thêm cờ toàn vẹn khối projection cho bảng presenter ở mặt host (sửa hai bên đọc, để lại cả lớp vấn đề này), mount template theo từng session (sao chép từng instance chỉ để có được service thuần túy). Lưu hồ sơ: miền `goals` hướng tới gateway dù sao vẫn ở lại mặt phẳng host — bên nhận của phương thức Remote đến từ descriptor được sinh ra và được phân giải trên host, và đó chính là hình ảnh của tiêu chí mặt phẳng host `shell-env` khi đọc từ phía tiêu thụ.
