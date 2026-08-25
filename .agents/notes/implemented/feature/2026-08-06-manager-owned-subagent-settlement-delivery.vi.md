# Agent Note: Việc gửi settlement thuộc về continuation manager

Status: implemented

[English](2026-08-06-manager-owned-subagent-settlement-delivery.md) | Tiếng Việt

## Vấn đề

Việc ủy thác background continuable là thao tác bất đồng bộ duy nhất mà model có thể khởi động nhưng không thể chạm tới điểm kết thúc. Mọi hình thái khác đều có nguyên hàm lấy lại kết quả hoặc giá trị trả về: lệnh bash chạy nền và one-shot background subagent đều settle qua Task, `job_output(wait: true)` có thể block chờ; workflow và foreground subagent trả kết quả về cho bên gọi. Continuable background child chỉ trả về id đã persist của nó, còn phía parent thì vừa không có đối tượng nào để chờ, vừa không được giao bất cứ thứ gì.

[Nghĩa vụ báo cáo](2026-08-06-continuable-child-report-obligation.md) đã bù lại nửa hợp tác của khoảng trống này, bằng cách yêu cầu child báo cáo trước khi kết thúc. Chỉ dẫn thì không thể bù lại phần còn lại. Những child bị chấm dứt bởi giới hạn token, model lỗi, hủy bỏ hoặc tháo dỡ sẽ không bao giờ đi tới được bước có thể tuân thủ — không phải hiếm khi, mà là không bao giờ — trong khi đây chính là những kiểu kết thúc mà parent đang chờ cần được biết nhất. Các triệu chứng downstream có thể quan sát được bao gồm: parent bận rộn polling `list_agents`, gửi lại tin nhắn liên tục cho child đã settle, và các triển khai từ bỏ `subagent` để chuyển sang `workflow` vì workflow ít ra còn trả về thứ gì đó.

Bản thân tín hiệu đã tồn tại từ lâu. Kể từ khi continuable Activation ra mắt, `subagent/end` luôn mang theo `stopReason` và `lastAssistantMessage`. Thứ còn thiếu là bên tiêu thụ biến nó thành context mà model của parent nhìn thấy được.

## Quyết định

Continuation manager tự gửi bản ghi này, ngay bên trong giao dịch dispose kết thúc Activation.

Khi một Activation đang lưu trú settle, `notifySettlement()` phân giải parent trực tiếp đã persist của child đó, và gửi cho nó một tin nhắn vai trò user: trước tiên là một câu mô tả kết quả mà parent có thể hành động, sau đó là nội dung assistant cuối cùng của child, hoặc một câu nói rằng nó không tạo ra nội dung nào. Với mỗi child mà bên gọi thực sự đã nhận được id, việc gửi là vô điều kiện. Nó không kiểm tra xem child đã báo cáo hay chưa, và không giữ bất kỳ bản ghi nào có thể biến lời cam kết này thành có điều kiện — chính tính vô điều kiện này mới cho phép `tool-subagent` cam kết một thông báo runtime chứa kết cục và có thể có tin nhắn assistant cuối cùng. Việc vật thể hóa bị rollback trước khi tin nhắn đầu tiên được chấp nhận vẫn giữ im lặng, vì bên gọi đã được thông báo rằng child đó chưa được thiết lập.

### Thông tin nguồn

Thông báo này mang `{ kind: 'subagent-settled', form: 'notice', summary, senderSessionId }`, cố tình không tái sử dụng kind `subagent-report` sẵn có. Báo cáo là nội dung do child chọn; còn tin nhắn này là do runtime phát biểu về những gì sau này đã xảy ra với child đó. Gộp hai thứ lại sẽ gán cho child những lời nó chưa bao giờ nói, và khiến log persist không thể phân biệt giữa "child nói nó đã làm xong" và "harness quan sát thấy nó dừng lại". Hình thái `notice` cũng cho UI kiểu hiển thị một dòng thu gọn mà tin nhắn này cần, trong khi `relay` sẽ trình bày nó như thư từ qua lại.

### Hai quy tắc thứ tự, và vì sao chúng thuộc về manager

Một listener `ctx.on('subagent/end')` bên ngoài trông có vẻ tách rời hơn, nhưng nó sai. `SubagentRunEndInfo` không nêu tên parent; khi cạnh đó kích hoạt thì child handle đã bị dispose, nên không thể khôi phục parent từ đó; và việc giải phóng quyền sở hữu đánh thức watcher settlement của chính parent cũng đã được thực hiện rồi. Manager giữ tham chiếu tới parent trong suốt toàn bộ quá trình dispose, nên những rào cản này không tồn tại đối với nó.

**Việc gửi xảy ra trước `releaseOwnership`.** Tại thời điểm này parent vẫn đang tính child này, nên `stateOf(parent)` là `waiting`, và về mặt cấu trúc parent không thể bị xem là đã settle. Nếu gửi sau khi giải phóng, nó sẽ cạnh tranh với một watcher hồi phục ở microtask kế tiếp: watcher đó sẽ thấy mình không còn child nào và đang tĩnh lặng, rồi dispose một Agent, mà `cancel()` của Agent đó sẽ xóa sạch inbox đang chứa thông báo này. Biểu hiện của lỗi là một tin nhắn bị mất âm thầm, không báo lỗi ở đâu cả.

**Parent đang lưu trú nhận nó qua `admitWaking`.** Việc đăng ký id tin nhắn trước khi gửi đồng bộ chính là lý do khiến khoảng hở giữa `followup()` và microtask xác nhận nó không bị đọc nhầm thành tĩnh lặng. Đây không phải là bảo hiểm dư thừa cho quy tắc thứ nhất: `Agent.status` gộp việc bảo trì context lại thành `idle`, và một wakeup gửi trong lúc bảo trì chỉ đặt trước đúng một wakeup trễ, nên một parent đang nén context sẽ bị cả `status` lẫn tập child đang sở hữu đánh giá là tĩnh lặng ngay tại thời điểm việc giải phóng quyền sở hữu có hiệu lực.

Cả hai quy tắc đều có test cố định: đảo ngược thứ tự hoặc bỏ bản ghi này đi, test sẽ thất bại.

### Điều phối

Parent đang idle nhận một lượt tiếp theo bình thường. Parent đang bận thì được steer tới ranh giới step gần nhất của nó, vì `Inbox.claim()` sẽ nhận toàn bộ next-step theo lô tại một ranh giới: bốn child settle cùng lúc do đó chỉ tiêu tốn một step, chứ không phải bốn lượt. Việc chọn steer thay vì inject là có chủ đích — trong khi driver đang chạy, wakeup này là no-op, đồng thời nó đóng khoảng hở "driver thoát ra giữa việc đọc trạng thái và gửi tin"; nếu không, thông báo sẽ nằm chờ không ai nhận cho đến khi một sự kiện khác đánh thức parent. Đây là quy tắc đúng đắn chứ không phải một sở thích triển khai, nên nó không trở thành một trường `Config`.

Có một loại parent `running` không thể steer được: lượt đã bị cancel nhưng chưa thoát. `Agent.send()` sẽ chuyển hướng input wakeup được gửi sau khi hủy sang lượt tiếp theo, chốt (latch) wakeup này, và replay nó sau khi driver bị hủy hội tụ — chỉ riêng việc hủy do disposal là không bao giờ chốt, đó thuộc quy tắc tháo dỡ bên dưới. Do đó thông báo vẫn sẽ mở lượt riêng của nó, không cần chờ input không liên quan; cái giá là một ranh giới lượt bị chuyển hướng, chứ không phải bản thân tin nhắn.

**Parent đã tự bắt đầu tháo dỡ sẽ không được đánh thức.** Wakeup không phải là thao tác đưa vào hàng đợi: gọi `Agent.followup()` trên một Agent đang tĩnh lặng sẽ mở một lượt, còn gọi `cancel()` trên một Agent idle là no-op đã được ghi rõ trong tài liệu, không phòng vệ cho các lượt sau đó. Do đó mỗi đường tháo dỡ cuối cùng đều đối mặt với một parent online, đã bị hủy, vẫn còn trong registry — chính ACP bridge layer gọi `drainContinuableDescendants()` giữa việc hủy session agent của nó và việc dispose chúng — nên một thông báo không được bảo vệ sẽ khởi động một request model thật trên một Agent sắp bị hủy, và mỗi tầng cây một lần, vì thông báo của mỗi tầng lại đánh thức tầng phía trên nó. `notifySettlement()` sẽ hỏi đúng câu hỏi mà `assertAdmitting()` hỏi (việc admit continuable của lineage này đã bị đóng chưa?), và thay vào đó inject. Inject không phải mailbox bền vững — dispose của chính parent sẽ làm gì với nó được ghi trong phần "Rủi ro đã chấp nhận" — nhưng đó là cách gửi duy nhất có thể đến được với một parent vẫn đang đọc inbox của chính nó mà không đặt trước một lượt trên một parent lẽ ra không nên được đánh thức; và những gì wakeup lẽ ra có thể gửi tới cũng không hề bị mất: chính lượt do wakeup mở ra cũng sẽ bị dispose giữa chừng.

Việc gửi tuyệt đối không bao giờ block hay khiến việc tháo dỡ thất bại. Gửi bị từ chối sẽ được ghi log rồi bỏ đi, vì giữ child lại để retry một thông báo sẽ ghim vĩnh viễn toàn bộ chuỗi tổ tiên của nó ở trạng thái `waiting`; và việc parent đã rời khỏi registry là kết quả bình thường, không phải lỗi.

### Log của epoch tự nó là toàn bộ lời giải trình

`epochStopReason()` đọc kết cục từ log của chính epoch, vì việc tháo dỡ có thành công hay không chẳng nói lên điều gì về việc model có báo lỗi, có chạm giới hạn, hay có bị dừng lại. Việc chỉ đọc lượt đã sai hai lần, và cả hai lần đều có cùng hình dạng: một lượt bị dừng trước step đầu tiên có `turn/end` giống hệt lượt cân bằng "quay không tải" sinh ra từ "bị từ chối" hoặc "claim bị xóa sạch", nên bộ lọc dùng để bỏ qua loại sau cũng bỏ qua luôn kết cục thật, rồi trả lời bằng phần kết thúc sạch sẽ của lượt trước đó. Checkpoint persist (`dsh-session-checkpoint-policy`, có mặt trong mọi profile đi kèm) và việc lắp ráp prompt đều chạy tại ranh giới này và đều lan truyền ra ngoài, trong khi `Inbox.claim()` đã lấy tin nhắn đi mất — thế là parent được báo rằng child đã hoàn thành, trong khi chính việc gửi mà nó đang chờ lại bị nuốt mất. Theo quy ước thông báo settle tự động đã công bố, đây chính xác là kiểu thất bại mà parent không thể nhận biết, và cũng không retry.

Sự kiện còn thiếu chưa bao giờ thuộc về lượt, mà thuộc về inbox. `Inbox` sẽ ghi lại mỗi thay đổi kèm theo `removedCount`, và gắn cho việc hủy nhãn `outcome: 'canceled'`, điều này phân biệt được "một lượt đã nhận input của nó" với "công việc bị bỏ đi và chưa bao giờ chạy". `foldConsumedWork()` trong `dsh-agent` gộp hai bộ từ vựng này thành một câu trả lời: lượt gần nhất có thể giải trình cho công việc đã tiêu thụ — lượt đã vào step, hoặc lượt đã nhận rồi thất bại, bị dừng, hoặc bị từ chối — và sau đó liệu có công việc đã được chấp nhận nào bị hủy mà không có lượt nào mở ra cho nó hay không. Một lượt đã nhận input, kết thúc với `blocked` cũng là một lời giải trình: việc từ chối pre-step tạo ra nó — hook deny, plugin chính sách — đã bỏ luôn tin nhắn mà lượt đó đã nhận, nên thông báo sẽ nói child từ chối nhiệm vụ, chứ không phải hoàn thành nhiệm vụ. Chỉ những lượt `blocked` không nhận input nào mới vẫn còn vô hình.

Suy luận từ log thay vì từ trạng thái hoạt động mới khiến nó trọn vẹn. Các phiên bản trước đây lấy mẫu Activation của chính manager ngay trước khi hủy, và cách đó chỉ thấy được việc hủy sắp thực hiện của chính manager này: một `interrupt()` từ tổ tiên, hoặc một plugin đang unload hủy các Agent nó theo dõi, đều có thể khiến việc lấy mẫu đó sai, và thông báo vẫn nói `finished` như cũ. Nó cũng khiến trường hợp "đã được chấp nhận nhưng chưa bao giờ được nhận" không có test nào phân biệt được nó với "tiêu chí đó không tồn tại". Một phép gộp trên log bao phủ mọi bên khởi xướng, và cả hai nửa đều khiến test riêng của chúng thất bại khi bị loại bỏ.

Thứ tự ưu tiên thuộc về bên tiêu thụ: thất bại hoặc giới hạn đã ghi lại được ưu tiên hơn hủy, vì dừng một child đã thất bại sẵn không biến thất bại đó thành một lần hủy. `dsh-agent` sở hữu phép gộp này vì nhãn inbox mà câu trả lời phụ thuộc vào thuộc sở hữu của nó, và hai bên tiêu thụ vốn đã phụ thuộc vào nó — epoch continuable ở đây, và `readResult()` one-shot (có cùng lỗ hổng này).

Ảnh hưởng của cả hai vượt ra ngoài bản thân thông báo: `subagent/end` gửi `stopReason` tới jsonrpc UI và Claude hook bridge layer, và trước đây chúng báo child bị tháo dỡ giữa lượt đang chạy thành `completed`.

### Phạm vi bao phủ của snapshot

Ba kịch bản ACP lắp ráp tổng thể bao phủ thông báo này: một child không bao giờ báo cáo, một child báo cáo trước, và một child được điều khiển qua nhiều lượt follow-up. Cả ba đều cần rào chắn rõ ràng. Thông báo chỉ đến sau khi child hoàn tất tháo dỡ, cạnh tranh với việc parent đang làm gì lúc đó, nên mỗi kịch bản giữ child cho tới khi lượt khởi động của parent kết thúc, rồi chờ lượt của parent do thông báo đó mở ra (`waitForTurnStart` tới lượt đó, rồi `waitForTurnEnd`), sau đó script mới tiếp tục. Chờ một lượt chạy mà rào chắn không đảm bảo sẽ xảy ra thì không tính là bao phủ: một khi thông báo rơi vào lượt đang chạy sẵn, đó là một lần timeout.

`subagent-continuable` là kịch bản cố định kết cục thất bại. Lượt cuối cùng của child trong đó chết ở một checkpoint persist bị ép buộc, và không vào step nào cả, do đó transcript này chính là nơi có thể quan sát đầu-cuối quy tắc lý do chấm dứt ở trên: thông báo nói rằng child này **thất bại**, mang theo `SECOND_OK` trước đó như nội dung cuối cùng nó tạo ra chứ không phải kết quả, và lượt xác nhận riêng của parent sẽ đến được với ACP client.

Còn có một snapshot headless Loader keyless bao phủ đầu-cuối đường dẫn người dùng thấy được. Parent replay của nó bỏ qua `run_in_background` để bao phủ đường dẫn mặc định background continuable, không bao giờ gọi `list_agents`, `send_message` hay công cụ Task, tiêu thụ thông báo `subagent-settled` do manager ghi, rồi đưa ra câu trả lời cuối cùng. Child không bao giờ gọi `report`, do đó transcript này không thể nào đi qua được nhờ đường dẫn báo cáo hợp tác. Một rào chắn Loader chỉ dùng cho test sẽ giữ request sau khi parent khởi động cho đến khi thông báo thật của manager vào inbox của nó, loại trừ sai biệt về lịch điều phối nền tảng khỏi transcript, nhưng không giả mạo thông báo đó.

`subagent-report` cần thêm một bước nhượng bộ nữa. Với giá trị mặc định wakeup upon report đi kèm, kịch bản này có hai lần wakeup parent độc lập với nhau — báo cáo và settlement — và việc lần thứ hai kéo dài lượt đầu tiên hay mở một lượt khác là một đồng xu thật, đo thực tế qua nhiều lần chạy vào khoảng năm-năm. Không transcript viết tay nào có thể chứa cả hai thứ tự cùng lúc. Vì vậy overlay của nó cố định `reportDelivery: quiet`, khiến settlement là wakeup duy nhất; một rào chắn pre-step chỉ dùng cho snapshot khác sẽ giữ child cho đến khi lượt khởi động của parent kết thúc, để wakeup này mở một lượt xác định và nhận cả hai tin nhắn cùng lúc. Việc bao phủ giá trị mặc định wakeup upon report vẫn nằm trong test của chính gói report.

Hai cách diễn đạt bị từ chối và bị ngắt được cố định từng chữ trong test đơn vị, không đưa vào replay transcript: kích hoạt chúng cần một plugin chính sách từ chối, hoặc một lần hủy bị rào chắn giữ lại ở ranh giới step, mà bản thân lắp ráp keyless không mang theo; kênh thông báo tự nó đã được cố định đầu-cuối bởi các kịch bản lắp ráp tổng thể.

## Các phương án thay thế đã cân nhắc

**Đưa Task vào cho continuable child.** Task là một hợp đồng one-shot: một producer, một lần settle, một kết quả. Activation thực hiện nhiều lượt, sống lâu hơn bất kỳ lượt nào trong số đó, và có thể được resume sau khi kết thúc. Bọc nó bằng Task sẽ tái dựng đúng cái lệch pha vòng đời mà continuable child ban đầu được sinh ra để loại bỏ, và còn khiến một lượt nào đó trông như là kết cục.

**Gắn một listener `subagent/end` bên ngoài.** Bị bác bỏ vì ba lý do đã nêu ở trên — payload không nêu tên parent, child handle đã bị dispose, và listener không thể ảnh hưởng tới thứ tự. Listener còn phải đồng bộ nghiêm ngặt để kịp trước khi giải phóng, và không có gì tại seam đó buộc điều này, nên phiên bản đúng chỉ đúng nhờ may mắn.

**Chỉ gửi khi child chưa báo cáo.** Đây là thiết kế ban đầu. Nó cần ghi sổ theo từng Activation, vẫn bỏ sót child "đã báo tiến độ, rồi chết trước khi đưa ra kết quả", và quan trọng nhất: nó khiến lời cam kết với parent trở thành có điều kiện. "Thông thường bạn sẽ được thông báo" không phải là hợp đồng mà mô tả công cụ có thể phát biểu, và model không thể dựa vào thông báo đó dù sao cũng sẽ đi polling.

**Biến việc gửi thành có thể cấu hình.** Công tắc triển khai sẽ biến văn bản hướng tới model trở lại thành "thông thường", chính điều mà thay đổi này muốn loại bỏ. Hằng số giao thức và bất biến an toàn giữ nguyên cố định; đây là một trong số đó.

**Sửa `subagent/end` để nó mang theo parent, để plugin lo việc gửi.** Điều đó sẽ mở rộng payload đã công bố cho một bên tiêu thụ nội bộ gói, giữ lại toàn bộ rủi ro thứ tự, và khiến kênh trả về trở lại thành plugin tùy chọn. Mở rộng `ActivationObserver` riêng tư của gói bằng `terminal(failure)` chỉ giữ lại đúng một chỗ tính toán sự kiện chấm dứt, và không thay đổi bất kỳ bề mặt công khai nào.

**Luôn dùng `followup`.** Đơn giản hơn và thống nhất hơn, nhưng một lô child settle cùng lúc sẽ mỗi cái tiêu tốn một lượt parent riêng. Ngữ nghĩa theo lô ở ranh giới step vốn đã tồn tại, dùng nó là miễn phí.

## Hệ quả

- Parent của continuable child sẽ nhận một tin nhắn cho mỗi Activation đã settle. Do đó, các triển khai làm fan-out sẽ tăng số lượt parent; steer sẽ nén một lô settle cùng lúc thành một step.
- `tool-subagent` cam kết thông báo này trong schema của nó, vì kênh trả về là hành vi dịch vụ, không phải plugin tùy chọn.
- `Activation` mang theo `parentSession` và `announced`. Cái trước tồn tại vì child handle đã bị dispose trước khi gửi; cái sau giữ im lặng cho việc vật thể hóa bị rollback.
- `foldConsumedWork()` thay thế `findLastMessageTurnEnd()` của `dsh-session`, và được chuyển sang `dsh-agent` — nơi sở hữu nhãn inbox mà phép gộp này đọc; đường one-shot in-process gộp cùng một câu trả lời, không phân loại một one-shot child bị cắt ngang giữa chừng thành `completed`.
- Test đơn vị cố định cam kết vô điều kiện, từng lý do chấm dứt, hai kiểu điều phối idle và bận, ngữ nghĩa theo lô, hồi quy trong lúc bảo trì, thứ tự trước khi giải phóng, parent đã biến mất, và một lần gửi bị từ chối không được phép khiến tháo dỡ thất bại.
- Ba kịch bản ACP dùng rào chắn settlement rõ ràng, `subagent-report` có overlay cấu hình cố định việc gửi báo cáo im lặng.
- Một snapshot headless Loader keyless cố định đường dẫn "khởi động nền → thông báo settlement do manager ghi → câu trả lời cuối cùng của parent", không có polling, cũng không có lệnh gọi `report` nào từ child.

### Rủi ro đã chấp nhận

Thông báo chỉ được gửi, chứ không được xác nhận. Không có mailbox persist, biên nhận hay retry: parent offline sẽ mất nó, Session của child vẫn là bản ghi persist duy nhất. Muốn bù đắp điều này cần một giao thức mailbox offline với quy tắc địa chỉ hóa, xác thực quyền và replay của riêng nó.

Khi parent bị dispose ngay sau đó (mỗi bên gọi tháo dỡ đều làm vậy), thông báo được inject trong quá trình tháo dỡ sẽ không được model đọc: cancel của dispose sẽ xóa tin nhắn chưa được nhận này, còn log giữ lại cặp insert/cancel như một bản ghi. Muốn việc gửi trong quá trình tháo dỡ vẫn đọc được sau khi resume, cần hoặc mailbox offline nói trên, hoặc thay đổi cách dispose xử lý công việc đang chờ persist. Dispose sẽ bỏ mọi mục inbox chưa được nhận, kể cả input của người dùng, nên thay đổi hành vi đó là một quyết định của core-agent, không phải chi tiết của việc gửi settlement. Parent sau khi resume có thể phát hiện ra child, nhưng sẽ không nhận được kết cục: `list_agents` chỉ báo cáo sự tồn tại và trạng thái "online/chỉ lưu trữ" — `SubagentListEntry.activity` được viết như vậy — muốn lấy lại kết cục, phải hỏi chính child đó qua `send_message`.

Việc quy kết lý do chấm dứt là một nỗ lực hết sức có thể dựa trên từ vựng splice sẵn có của log, thiên về việc không bao giờ đánh giá cao thành công. `Inbox.remove()` và `clear()` của tháo dỡ viết ra splice hủy giống hệt nhau, nên việc xóa một tin nhắn mà nội dung vẫn còn ở nơi khác — `agent-instructions` dọn dẹp bản refresh instructions đang chờ, hoặc chính việc cancel của settlement xóa một tin nhắn tương tự vẫn đang chờ — có thể bị đọc nhầm thành "công việc bị bỏ đi và chưa bao giờ chạy", báo một child đã hoàn thành thành bị dừng. Phân biệt hai trường hợp này cần `dsh-agent` cung cấp từ vựng xóa phong phú hơn; trước khi từ vựng đó khả dụng, phạm vi đọc nhầm này hẹp, và hướng sai luôn là khiến parent kiểm tra lại một child đã hoàn thành, chứ không bao giờ tin một child chưa hoàn thành.

Với các cây sâu hoặc rộng, việc khuếch đại lượt là có thật, và theo thiết kế thì không thể cấu hình. Ngữ nghĩa theo lô ở ranh giới step chỉ có thể giới hạn trường hợp settle cùng lúc, không thể giới hạn các child settle rải rác.

Hai nguồn wakeup độc lập không thể sắp thứ tự trong transcript viết tay. Bao phủ lắp ráp tổng thể cố định từng cái riêng biệt, chứ không cố định cách chúng đan xen nhau.
