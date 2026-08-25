# Agent Note: What stays host-plane once presets own the agent plane

Status: implemented

[English](2026-08-10-host-plane-ownership-after-presets.md) | 中文

## Vấn đề

[Agent preset theo từng phiên](2026-08-03-per-session-agent-presets.md) đã chuyển mọi dòng hướng tới model lên mặt phẳng agent, và kể từ đó mỗi lần sửa lỗi đều là một điểm đọc vẫn được viết theo thế giới trước khi di chuyển. `tasks` đã phải chuyển về host vì các dòng preset ngoài realm cần phân giải nó; `goals` cũng vì lý do tương tự nên chưa từng rời đi; và khi mọi tool hướng tới model đều trở thành đóng góp từ tổ tiên (ancestor), `toolFilter` của sub agent cũng đã được sửa ([sub agent gia nhập preset của parent](../bug-fix/2026-08-10-child-agents-join-their-parent-preset.md)).

Vẫn còn hai điểm đọc đứng sai phía của lằn ranh này.

`dsh-token-meter` bị tắt ở phía host, chuyển sang gắn vào realm `compaction` của mỗi preset. Nó không nhận bất kỳ cấu hình nào, mỗi lần gộp (fold) đều dùng `Session` làm key, và cũng không đăng ký tool hay prompt segment nào — nhưng nó sở hữu ba đơn vị chiếu (projection): `tokenUsage`, `contextPressure` và `contextBreakdown`, còn `sessionProjections` là một bảng cấp tiến trình, không phân lớp theo scope. Do đó một đơn vị được đăng ký từ bên trong một preset sẽ trả lời thay cho tất cả các phiên: việc một phiên `minimal` có hiển thị context meter hay không phụ thuộc vào việc kể từ lần khởi động này có phiên **khác** nào từng gắn `standard` hay chưa; còn tiến trình chỉ từng chạy `minimal` thì hoàn toàn không hiển thị gì.

Agent không gia nhập bất kỳ preset nào cũng không ai chỉ ra. Việc gia nhập là một liên kết trong scope parent chain; thiếu nó, các view của `tools`, `system-prompt` và `skill` đều phân giải về lớp toàn cục rỗng, model không nhận được gì cả — không báo lỗi, cũng không có thư mục rỗng để xem, chỉ là một agent không thể hành động. Sub agent được ủy quyền đã chạy như vậy trong suốt cả khoảng thời gian preset tồn tại, và cùng một lỗ hổng vẫn mở ở mọi entry point có trước preset.

## Quyết định

**Meter thuộc về mặt phẳng host.** `dsh-token-meter` quay về lắp ráp ở host và rời khỏi bản đồ `isolate` của từng preset, nhờ đó `compaction-basic` và `tool-result-pruner` trong realm của chính chúng sẽ phân giải về đúng một instance host đó. Preset vẫn giữ realm và backend nén — thứ preset lựa chọn là agent của nó có nén hay không, chứ không phải token của nó có được đếm hay không. Đây chính là tiêu chí mà `tasks` và `goals` đã áp dụng, chỉ là lần này áp dụng cho một Service không nên thuộc về preset vì bề mặt tiếp xúc là **projection**: khi giá trị rỗng và giá trị thật của một đơn vị không thể phân biệt được, chừng nào bảng mà nó đăng ký vào còn ở cấp tiến trình thì nó không thể thuộc về từng tổ hợp riêng lẻ.

**Agent chưa gia nhập được chỉ ra ở hai điểm khác nhau, hai lần.** Với điều kiện có cấu hình danh sách, `AgentPresets` ghi một cảnh báo cho mỗi agent được phát hành mà có độ dài chuỗi scope bằng một. Phần đi kèm về bất biến (invariant) thì trực tiếp thất bại — và xảy ra tại `system-prompt/assemble` chứ không phải tại thời điểm phát hành, vì một agent chưa gia nhập vẫn hợp lệ cho tới khi nó nói chuyện với model: `recompose` liên kết chính xác một agent như vậy làm liên kết đầu tiên của nó; và việc lắp ráp prompt là bên gọi duy nhất cung cấp scope agent, do đó lắp ráp ở host và gắn thường trú đều đúng đắn khi nằm ngoài phạm vi kiểm tra.

Có ba giới hạn không được sửa ở đây, mà được ghi chú tại nơi chúng thực sự gây ảnh hưởng: việc key projection có tồn tại hay không không thể dùng làm tín hiệu năng lực theo từng phiên ([`dsh-session-projection`](../../../../packages/session/session-projection/README.md)); thế hệ thường trú bị thay thế không bao giờ được thu hồi, và quy trình chỉnh sửa trang cài đặt biến nó thành chi phí cho mỗi lần lưu ([`dsh-agent-presets`](../../../../packages/preset/agent-presets/README.md)); plugin tạm thời gắn qua `cordis_mount` thuộc về lắp ráp chứ không thuộc về phiên đã gắn nó ([`dsh-tool-cordis`](../../../../packages/extensions/tool-cordis/README.md)).

## Test

`apps/cli/tests/web-agent-presets.e2e.ts` đọc `ctx.get('tokenMeter')` trên một lắp ráp Web đã khởi động, **trước khi** bất kỳ preset nào trong file này được gắn — meter phía preset sẽ nằm trong realm `isolate`, không khả kiến với `ctx.get`, do đó lần đọc này là một khẳng định quyền sở hữu chứ không phải sự trùng hợp về thứ tự gắn — sau đó khẳng định snapshot của một phiên `minimal` có đủ cả ba đơn vị.

`packages/preset/agent-presets/tests/mount.spec.ts` khẳng định cảnh báo được kích hoạt đúng một lần với agent trần, và hoàn toàn không kích hoạt với agent đã gia nhập. `tests/invariant.spec.ts` đảm nhận vai trò kiểm soát âm: lắp ráp của agent chưa gia nhập bị từ chối, còn lắp ráp của agent đã gia nhập cũng như lắp ráp host không có scope đều được thông qua.

## Các phương án đã cân nhắc

**Giữ meter ở preset, đổi sang phân lớp registry projection.** Đây là cách sửa chính xác hơn, nhưng cái giá phải trả lớn hơn nhiều: `snapshot`, `checkpoint` và việc chủ động điều khiển đều cần một lần phân giải "phiên → scope", trong khi đọc nguội (cold read) lại không có sẵn khi không có `presenterScopeFor` của api-proxy. So với một Service hoàn toàn không có trạng thái per-preset, điều này không tương xứng, do đó thay vào đó là viết quy tắc chung lên registry.

**Từ chối phát hành đối với agent chưa gia nhập.** Ồn ào tốt hơn im lặng, và registry cũng hỗ trợ điều này — một listener đồng bộ `agent/created` ném lỗi sẽ khiến toàn bộ việc tạo bị rollback. Bị bác bỏ vì: việc lắp ráp agent ngoài danh sách vẫn hợp lệ — `recompose` ghi rõ chính agent trần mà nó sẽ liên kết sau đó, và ACP bridge, SDK server và headless bundle hiện nay đều tạo ra một agent như vậy. Từ chối sẽ biến một lỗ hổng năng lực thành một lỗi sự cố.

**Cho phần đi kèm cũng kiểm tra việc gia nhập tại `agent/created`.** Bị bác bỏ: tại thời điểm phát hành, không thể phân biệt được giữa việc gia nhập bị bỏ sót và một agent sẽ được liên kết sau đó, do đó việc kiểm tra này sẽ từ chối một đường dẫn đã được ghi rõ. Việc lắp ráp prompt thì phân biệt được.

**Dựa trên cùng lý do về projection, cũng chuyển `plan-mode` và `tool-todo` ra khỏi mặt phẳng agent.** Bị bác bỏ: cả hai đều thực sự là năng lực theo từng preset, và với các phiên chưa bao giờ dùng chúng, đơn vị của chúng tính ra đúng là giá trị rỗng, còn client vốn đã đọc theo giá trị (`plan.active`, danh sách rỗng). Chỉ những đơn vị mà giá trị rỗng và giá trị thật không thể phân biệt được — meter — mới buộc phải thuộc về host.

## Hệ quả

Context meter trở thành sự thật theo từng phiên, chứ không còn là hàm của lịch sử gắn kết. Cái giá phải trả là preset không còn có thể chọn không tính token nữa; không có preset đi kèm nào làm vậy, `minimal` giờ đây cũng ghi rõ nó chỉ từ bỏ việc tự động nén chứ không phải việc ghi nhận.

Cảnh báo đó chỉ mang tính khuyến nghị, do đó triển khai gắn danh sách vào entry point ACP hoặc SDK server vẫn sẽ khởi động agent không có tool nào — chỉ khác là mỗi agent sẽ nói ra một lần, thay vì im lặng. Invariant chỉ tiếp xúc tới lắp ráp có nạp `dsh-invariants`, do đó nó chỉ kiểm soát test gói và host phát triển, chứ không phải host đi kèm.
