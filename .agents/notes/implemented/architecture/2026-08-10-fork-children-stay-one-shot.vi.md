# Agent Note: child được fork ra vẫn giữ one-shot

Status: implemented

[English](2026-08-10-fork-children-stay-one-shot.md) | 中文

## Vấn đề

Khác biệt duy nhất giữa fork và spawn là Session của child sẽ lấy tiền tố các lượt (turn) đã hoàn thành của parent làm nội dung khởi tạo (xem [subagent-fork-in-process](../../../../packages/subagent/subagent-fork-in-process/README.md)). Nội dung khởi tạo này có chi phí token thực sự — lịch sử kế thừa sẽ được gửi lại trong mỗi request của child — trong khi lợi ích duy nhất chắc chắn của nó là tái sử dụng tiền tố (prefix) phía provider: với điều kiện provider và model giống nhau, một request của child có các byte khởi đầu giống hệt từng byte với parent thì không cần prefill lại đoạn dùng chung này. Bất kỳ nội dung nào được thêm vào bởi scope của child *trước* lịch sử kế thừa đều sẽ tiêu tốn mất lợi ích này, vì việc tái sử dụng dừng lại ngay tại byte khác biệt đầu tiên.

Kênh trả về `report` cục bộ theo scope hiện là khoản bổ sung lớn nhất trong số này, và kể từ [nghĩa vụ report](../feature/2026-08-06-continuable-child-report-obligation.md) nó là hai khoản bổ sung chứ không phải một: schema tool `report`, và phần system prompt `tool:report`. Cả hai đều nằm ở phần đầu request — block hệ thống và block công cụ đứng trước toàn bộ message — do đó một fork child có thể tiếp tục (continuable) sẽ làm mất hiệu lực tái sử dụng ngay trước lượt kế thừa đầu tiên, và phải prefill lại toàn bộ transcript (bản ghi văn bản) mà việc fork ban đầu vốn nhằm để tái sử dụng. Sự kết hợp này phải trả chi phí sao chép của fork nhưng lại không nhận được lợi ích của nó, trong khi parent vẫn đang giữ một tiền tố có thể tái sử dụng mà lẽ ra child có thể dùng chung.

## Quyết định

Tất cả các tổ hợp đi kèm đều gán tool ủy quyền fork với `backgroundMode: one-shot`: [bundle base](../../../../packages/bundle/base/cordis.patch.yml), [ví dụ ACP](../../../../examples/acp-agent/cordis.yml) và [ví dụ headless](../../../../examples/headless-agent/cordis.yml). Bundle base giữ `run_in_background` vì nó có gắn dịch vụ task; hai ví dụ đặt `enableRunInBackground: false` vì cả hai đều không gắn dịch vụ task, nếu không một lần khởi động one-shot ở nền sẽ thất bại khi gọi vì thiếu dịch vụ `tasks`.

Child one-shot — cả foreground lẫn background — được tạo qua `SubagentRuntime.start()`, đường dẫn này không bao giờ đi vào registry activation setup có thể tiếp tục, do đó `report` và phần prompt của nó đều không được cài đặt. Vì vậy system prompt và tool schema của một fork child one-shot giống hệt parent của nó, chỉ khác biệt ở phần bổ sung `persona` và `toolFilter` mà từng tool ủy quyền chủ động lựa chọn theo triển khai.

`spawn` vẫn giữ `backgroundMode: continuable`. Đối với provider mà child ngay từ đầu vốn không có tiền tố kế thừa nào cần bảo vệ, hành vi child có thể tiếp tục và nghĩa vụ report đi kèm không đổi, do đó quyết định này không khiến kênh report phải trả bất kỳ chi phí nào.

### Giới hạn nằm ở tổ hợp, không nằm ở mã nguồn

`ForkInProcessProvider.prepareContinuable` vẫn được triển khai đầy đủ, `ctx.subagents.startContinuable()` vẫn chấp nhận `fork`; thứ thay đổi chỉ là các dòng `cordis.yml` đi kèm. `tool-subagent` khi được gắn vào đồng thời biết cả `inheritsParentContext` của provider lẫn `backgroundMode` của chính nó, do đó việc kiểm tra từ chối tổ hợp này tại thời điểm load là khả thi, nhưng ở đây cố tình không thêm: tổ hợp đó không phải lúc nào cũng sai. Nó chỉ sai khi có một khoản bổ sung theo scope của child nằm trước lịch sử kế thừa, và gói tạo ra khoản bổ sung đó — [`dsh-tool-subagent-report`](../../../../packages/subagent/tool-subagent-report/README.md) — được cài đặt độc lập, và theo đúng thiết kế của nó thì `tool-subagent` không nhìn thấy nó. Một triển khai không cài gói report có thể chạy fork child có thể tiếp tục mà tiền tố vẫn nguyên vẹn. Việc viết hệ quả của một danh sách plugin cụ thể thành bất biến của tool ủy quyền sẽ khiến tool đó khẳng định một sự thật mà nó không thể quan sát được.

Điều kiện để mở lại được ghi chú bằng đánh dấu `TODO(fork-continuable-prefix-reuse)` trên phương thức `prepareContinuable` — các tổ hợp đi kèm không gọi phương thức này — và được theo dõi bởi issue #2124: fork có thể tiếp tục có thể được mở lại khi system prompt và tool schema của child có thể khớp từng byte với parent của nó.

## Phương án thay thế

**Từ chối tổ hợp `inheritsParentContext` và `continuable` tại thời điểm gắn.** Một lỗi ồn ào tại thời điểm load có thể ngăn việc âm thầm đưa nó trở lại, điều mà thay đổi cấu hình không làm được. Bị bác bỏ vì tool ủy quyền không nhìn thấy gói report, và khi không có nó thì tổ hợp này hợp lệ; đối với triển khai không bao giờ cài bất kỳ khoản bổ sung nào theo scope của child, bất biến này là sai, và `tool-subagent` sẽ khẳng định một sự thật thuộc quyền sở hữu của danh sách plugin.

**Đơn giản là không gắn provider fork.** Đây là dạng triệt để hơn của giới hạn này. Bị bác bỏ vì fork ở foreground *chính là* tình huống tái sử dụng tiền tố, và không bị ảnh hưởng bởi kênh report, do đó việc cấm toàn diện sẽ từ bỏ năng lực này mà không đổi lấy được gì thêm so với gán one-shot — và các tổ hợp đi kèm sẽ không còn session nào có nội dung khởi tạo để diễn tập.

**Vẫn đi kèm fork child có thể tiếp tục như bình thường và chấp nhận khoản mất mát này.** Bị bác bỏ vì khoản mất mát này là toàn phần chứ không phải biên: việc tái sử dụng đã bị ngắt trước cả lịch sử kế thừa, do đó child phải trả toàn bộ chi phí prefill cho một transcript mà chính nó sao chép lại, với mục đích ban đầu là không phải trả chi phí đó. Triển khai nào cần một child dài hạn không có ngữ cảnh kế thừa thì vốn đã có `spawn`.

**Làm cho `report` khả kiến với mọi Agent.** Đăng ký toàn cục sẽ khôi phục tiền tố giống hệt từng byte bằng cách cho parent và child có cùng schema và section. Bị bác bỏ vì root agent, one-shot child, remote child và bên gọi không có agent đều sẽ khai báo một tool mà không suy ra được người nhận, còn việc từ chối tại thời điểm thực thi sẽ khiến khả kiến của schema mâu thuẫn với quyền hạn — đây chính là quyết định cục bộ theo scope đã được [Agent Note về tool report](../feature/2026-07-30-continuable-subagent-report-tool.md) chốt từ trước.

**Cài đặt khoản bổ sung theo scope của child sau lịch sử kế thừa.** Bị bác bỏ vì không thể diễn đạt được: trong định dạng giao thức của mỗi provider, system prompt và tool schema đều là cấu trúc phần đầu request, do đó bất kỳ thứ tự nào bên trong chúng cũng không thể đặt khoản bổ sung chỉ thuộc về child ra sau danh sách message.

## Hệ quả

- Không có tổ hợp đi kèm nào tạo fork child có thể tiếp tục; `subagent_fork` trả kết quả về lượt của bên gọi, còn `send_message` chỉ định địa chỉ tới child được spawn ra.
- Trừ khi triển khai cấu hình `persona` hoặc `toolFilter` trên tool ủy quyền fork, tiền tố request của fork child giống hệt từng byte với parent của nó, do đó chi phí token của nội dung khởi tạo đã đổi lại được lợi ích tái sử dụng phía provider.
- Đường dẫn có thể tiếp tục của provider fork không có bên gọi trong sản xuất, cũng không có độ bao phủ ở tầng lắp ráp tổng thể. Nó vẫn giữ test riêng trong gói của mình, seam cũng vẫn chấp nhận nó, do đó một dòng bundle hoặc lớp overlay `--patch` có thể đưa nó trở lại mà không cần đổi mã nguồn, và cũng không có cảnh báo nào.
- Schema hướng tới model của `subagent_fork` có thay đổi: cách diễn đạt background có thể tiếp tục trong bundle base bị thay bằng cách diễn đạt task one-shot, còn trong hai ví dụ thì biến mất hoàn toàn. File đi kèm schema tool snapshot keyless bị ảnh hưởng đã được ghi lại lại trong cùng một lần thay đổi.
- Trong các triển khai đi kèm, phạm vi bao phủ của nghĩa vụ report thu hẹp lại chỉ còn child được spawn ra. Lịch trình mặc định `wakeup`, mô hình quyền hạn và các override của nó đều giữ nguyên không đổi.

### Rủi ro đã chấp nhận

Giới hạn này tồn tại trong ba file cấu hình và một chú thích mã nguồn, chứ không nằm trong cổng chặn (gate). Trong tương lai, một dòng bundle hoặc bản vá profile có thể đặt `backgroundMode: continuable` trên tool fork, từ đó âm thầm đưa lại khoản mất mát về tiền tố; sẽ không có gì thất bại một cách ồn ào. Đây chính là cái giá phải trả cho việc không đưa hệ quả của một danh sách plugin cụ thể vào `tool-subagent`.
