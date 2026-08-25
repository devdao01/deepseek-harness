# Agent Note: seam phê duyệt — quyết định quyền một lần dựa trên bộ đáp ứng waterfall (sự kiện kiểu thác nước)

Status: implemented

[English](2026-07-06-approval-seam.md) | Tiếng Việt

## Vấn đề

Hai bên gọi cần cùng một quyết định đóng — «thao tác cụ thể này có được tiếp tục không?»: quyết định `ask` của `tools/pre-execute` (bao gồm cả `permissionDecision: ask` của cầu nối hook Claude-Code) và lần thử lại nâng quyền một lần sau khi bị từ chối trong [Agent Note về sandbox](2026-07-06-sandbox.md). Một seam dùng chung giúp chúng không phải tự phát minh ra bộ từ vựng kết quả, cách định tuyến kênh, cơ chế hủy và dấu vết kiểm toán riêng, đồng thời bảo đảm rằng một deployment không có bộ đáp ứng sẽ không bao giờ phê duyệt một yêu cầu không thể được đáp ứng. Bộ đáp ứng có thể là một host tương tác, cũng có thể là một bộ điều khiển tự động hóa.

Cốt lõi của vấn đề định tuyến là quyền sở hữu: yêu cầu quyền phải đến được kênh sở hữu agent (tác tử) đã phát ra yêu cầu, phải fail-closed đối với agent không thuộc về ai, và không được xâm lấn vào các deployment không có bộ đáp ứng được kết hợp vào.

## Quyết định

Một package `dsh-user-approval` (`packages/interaction/user-approval`) chịu trách nhiệm định nghĩa bộ từ vựng và service `ctx.approval` — tức là cơ chế. Chính sách — ai đáp ứng, một session nào đó có cần bị hỏi hay không — không nằm trong đó: bộ đáp ứng là listener waterfall `approval/request`, do plugin sở hữu kênh đăng ký (cầu nối ACP (Agent Client Protocol), adapter của host, script kiểm thử), còn tầng chính sách theo từng session có thể ra quyết định trước khi bất kỳ kênh nào can thiệp. Bên tiêu thụ (định tuyến ask của `dsh-tools` và cổng nâng quyền của sandbox) phân giải câu hỏi thành một kết quả đóng, rồi từ đó suy ra kết quả công cụ của riêng mình. Đây là thiết kế có chủ đích thành một package, chứ không phải tách ba package như một capability seam (xem «Phương án thay thế»).

### Deployment sử dụng nó như thế nào

Một mục `cordis.yml` mount seam này. Không nạp nó chính là lối thoát mặc định từ chối yêu cầu: ngay cả khi không đăng ký bất kỳ mã phê duyệt nào, bên tiêu thụ vẫn từ chối những yêu cầu không thể được đáp ứng.

```yaml
- id: approval
  name: '@deepseek-ai/dsh-user-approval'
  # config:
  #   policy: never   # deployment default for sessions without an override; 'ask' when omitted
```

Chỉ riêng mục này thì chỉ cung cấp cơ chế, không cung cấp kênh: khi không có bộ đáp ứng nào được kết hợp vào, mỗi lần ask đều phân giải thành `unavailable`, và lời gọi công cụ đã phát ra yêu cầu sẽ bị từ chối — fail-closed mà không cần cấu hình gì. Kết hợp thêm ứng dụng ACP (`@deepseek-ai/dsh-acp-demo`, ví dụ [cây mặc định của ví dụ acp-agent](../../../../examples/acp-agent/README.md)) là khép kín vòng: [tầng cầu nối chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md) của nó đăng ký một bộ đáp ứng, gửi `session/request_permission` tới client sở hữu session đó, kèm theo id lời gọi công cụ chính xác và các lựa chọn allow/reject một lần. `policy: never` là tư thế không người trực: mỗi lần ask đều bị tự động từ chối một cách xác định, và giá trị hiện hành cũng được thêm vào ảnh chụp runtime context. `policy` được kiểm tra đối chiếu với một danh sách đóng lúc plugin được nạp; giá trị không hợp lệ sẽ ném exception ngay.

Hành vi quan sát được của deployment đã kết hợp: `allowed-once` chỉ cho phép đúng lời gọi đó tiếp tục; từ chối, đóng prompt và thiếu kênh sẽ từ chối với ba lý do khác nhau mà mô hình có thể phân biệt được; yêu cầu thành công trong một lượt sẽ ghi một cặp sự kiện bền vững `approval/asked`/`approval/decided` vào session log của agent đã phát ra yêu cầu; quyền được cấp không tồn tại tiếp sau khi lời gọi phát ra yêu cầu kết thúc. Yêu cầu lúc rảnh hoặc lỗi ghi bổ sung bản kiểm toán sẽ bị từ chối, chứ không trả về một quyết định chưa được kiểm toán.

Dưới đây là một lần ask trong tổ hợp đó, trích từ kịch bản `escalation-approved` được ghi lại của ví dụ sandbox — mô hình yêu cầu nâng quyền sandbox, cổng phát ra ask, client tự động hóa chọn Allow once:

```
tool/call        bash {"command": "printf 'escalated\n' > escalated.txt && cat escalated.txt",
                       "sandbox_permissions": "workspace-write",
                       "justification": "the user asked to write escalated.txt in the workspace"}
approval/asked   {"toolName": "bash", "callId": "call_00_…",
                  "reason": "escalate sandbox to workspace-write: the user asked to write escalated.txt in the workspace"}
  → session/request_permission {"toolCall": {"toolCallId": "call_00_…"},
                  "options": [{"optionId": "allow-once", "name": "Allow once", "kind": "allow_once"},
                              {"optionId": "reject-once", "name": "Reject",     "kind": "reject_once"}]}
  ← the client selects "Allow once"
approval/decided {"outcome": "allowed-once"}
tool/result      "escalated" — this one call ran under the wider mode; the grant died with it
```

Kịch bản song sinh `escalation-rejected` kết thúc bằng `{"outcome": "rejected"}`: không thực thi thao tác nào, và kết quả gửi cho mô hình mang nguyên văn phần văn bản fail-closed của bên phát ra yêu cầu (`the user rejected escalating this command to "workspace-write"`). `permissionDecision: ask` của hook đi qua đúng cùng một giao thức; chỉ khác ở bên phát ra yêu cầu và văn bản từ chối (§ Định tuyến ask trong dsh-tools). Khi không có bộ đáp ứng, cùng yêu cầu đó kết toán thẳng thành `unavailable`.

### Chi tiết thiết kế

#### seam: tách cơ chế khỏi chính sách

Sau khi kiểm tra hợp lệ và ghi bổ sung `approval/asked` thành công, service phân giải waterfall `approval/request` thành `allowed-once`, `rejected`, `cancelled` hoặc `unavailable`. Service chuyển tiếp nguyên vẹn phần định danh yêu cầu chỉ đọc và signal, coi việc abort là `cancelled`, chuyển đổi đồng nhất lỗi của bộ đáp ứng và giá trị trả về không hợp lệ thành `unavailable`, loại bỏ các phản hồi đến muộn, và ghi bổ sung sự kiện `approval/decided` tương ứng. Lỗi kiểm toán trước khi commit sẽ từ chối; lỗi của bên quan sát sau khi đã ghi bổ sung không thể hoàn tác sự kiện có thẩm quyền. `allowed-once` chỉ cấp quyền cho đúng thao tác đã được hỏi, còn `request()` từ chối mọi lời gọi nằm ngoài lượt đang diễn ra, để bảo đảm bản kiểm toán nằm trong biên commit bền vững.

Bộ đáp ứng là listener waterfall `approval/request`. Không có listener nào thì rơi thẳng xuống `unavailable`; listener nhận diện được agent đó sẽ chiếm ô quyết định theo nguyên tắc đến trước được trước, còn listener không nhận diện được thì phải gọi `next()` để ủy thác. Listener được dispose (giải phóng tài nguyên) cùng với fiber của nó, nên sau khi gỡ kênh, yêu cầu sẽ mặc định bị từ chối khi có sự cố. Vì thứ tự đăng ký của các plugin anh em là không xác định, deployment nên kết hợp một bộ đáp ứng cuối chuỗi, và dành `prepend` cho các cổng «quyết định hoặc ủy thác».

`ApprovalRequest` mang theo `agent` phát ra yêu cầu, `toolName`, `callId` chính xác tùy chọn, `reason` đọc được bởi con người và `signal` tùy chọn. Nó dùng brand `CallId` mà không import `dsh-tools` — package vốn phụ thuộc vào seam này. Adapter kênh có thể liên kết bất kỳ trạng thái lời gọi phong phú hơn theo `callId`; bản thân yêu cầu phê duyệt không lặp lại tham số công cụ.

#### Định tuyến ask trong dsh-tools

`ToolRuntime.execute()` phân giải `ask` trước khi điều phối: `allowed-once` thì tiếp tục thực thi, còn từ chối, hủy và kênh không khả dụng sinh ra ba lý do từ chối khác nhau. Việc tiêu thụ `ctx.get('approval')` theo kiểu cơ hội cho phép service thiếu hoặc chưa được mount fail-closed mà không chặn fiber của registry. Việc thực thi không có agent cũng fail-closed, vì nó vừa không có session để kiểm toán, vừa không có chủ sở hữu kênh.

#### Tầng chính sách theo từng session

seam còn sở hữu chính sách cấp session `'ask' | 'never'` được mô tả trong [Agent Note về sandbox](2026-07-06-sandbox.md). Chính sách hiệu lực được gấp lại từ các lần chuyển đổi được ghi trong log, đặt trên giá trị mặc định của deployment. `'never'` phân giải thành `rejected` ngay bên trong `request()`, trước khi bất kỳ bộ đáp ứng nào chạy; còn `'ask'` thì điều phối yêu cầu, nếu không sẽ ủy thác dọc chuỗi tới `unavailable`. Cả hai giá trị hiện hành đều được thêm vào ảnh chụp runtime context nguyên tử trước mỗi request tới mô hình, nên việc chuyển đổi chính sách không cần thuật lại riêng; mỗi yêu cầu phê duyệt vẫn ghi một cặp kiểm toán.

#### Bộ đáp ứng ACP

Cầu nối ACP chỉ đáp ứng đúng đối tượng agent mà bản đồ session của nó sở hữu. Nó gửi `session/request_permission` kèm theo `callId` sẵn có, khai báo các lựa chọn allow/reject một lần, ánh xạ riêng trường hợp hủy, và không bao giờ phê duyệt một lựa chọn lạ. Yêu cầu không thuộc cầu nối này hoặc không có định danh lời gọi sẽ tiếp tục được ủy thác; lỗi RPC phía client được chuyển thành `unavailable`. Hook và `tools/pre-execute` mới là nơi quyết định một lời gọi có cần hỏi hay không. Kênh này là chính sách máy giữa client tự động hóa và agent của nó, không phải tầng trình bày của ACP.

Bộ đáp ứng được định tuyến qua phép kiểm tra quyền sở hữu agent chính xác của cầu nối, được mô tả trong [Agent Note ACP chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md), giữ nguyên quyền sở hữu quyền theo từng session mà [Agent Note đa session](2026-06-14-acp-multi-session.md) yêu cầu.

#### Kiểm toán, và mô hình thấy những gì

`approval/asked` và `approval/decided` là sự kiện bền vững chỉ ghi log; mô hình chỉ thấy kết quả công cụ thông thường được suy ra từ kết quả phê duyệt. Khi hoàn tất thành công, mỗi `asked` đều commit một `decided`, kể cả trường hợp hủy cũng như lỗi của bộ đáp ứng đã được chuyển thành kết quả đóng. Yêu cầu lúc rảnh không ghi bổ sung sự kiện nào; lỗi trước khi commit sẽ từ chối, còn lỗi ở lần ghi bổ sung thứ hai có thể để lại một `asked` đã commit mà không có cặp tương ứng.

#### Thực thể và phụ thuộc

`dsh-user-approval` phụ thuộc vào Cordis, cùng với session, agent và quy ước lời gọi có brand; `dsh-tools` và `dsh-acp` tiêu thụ nó. Bộ thực thi sandbox vẫn độc lập, vì yêu cầu nâng quyền thuộc sở hữu của `dsh-tool-bash`. Dịch vụ điều phối và kiểm toán cố định vẫn là một package; bộ đáp ứng có thể thay thế thì nằm lại trong từng chủ sở hữu kênh. Việc ủy quyền năng lực tĩnh và phần đáp ứng quyền phía con của `subagent-acp` vẫn là những mối quan tâm riêng biệt.

### Kiểm thử

Unit test cố định các kết quả, cơ chế ủy thác đến trước được trước, việc chuyển đổi lỗi, hủy, định tuyến theo phạm vi, cặp kiểm toán, chính sách `'never'` không thể vòng qua, các lý do từ chối của công cụ, cũng như phần ánh xạ quyền sở hữu／kết quả của ACP thông qua một cầu nối theo kịch bản thật.

Snapshot ghi lại việc phê duyệt và từ chối nâng quyền sandbox qua `session/request_permission`, cùng toàn bộ phần đóng góp vào runtime context của `'ask'` và `'never'`. Prompt quyền không có phản hồi theo kịch bản sẽ bị hủy và fail-closed.

## Hoãn lại

- **Kho lưu quyền cấp `allow_always`**: hiện thực hóa quyền bền vững đồng nghĩa với việc phải thiết kế kho lưu, định danh phạm vi (lời gọi? đường dẫn? tiền tố? session? cửa sổ thời gian?) và cơ chế thu hồi; trước khi thiết kế xong, chỉ hiển thị lựa chọn một lần ([Agent Note về sandbox](2026-07-06-sandbox.md) § Escalation ghi lại các câu hỏi còn bỏ ngỏ về phạm vi).
- **Ghi lại `ask` do hook điều khiển thông qua một bộ đáp ứng đã kết hợp**: định dạng giao thức quyền (wire format) đã được ghi lại qua nhánh nâng quyền của ví dụ sandbox. `hook-cc-pretool-ask` trong ma trận hook cố định hành vi từ chối dự phòng khi không có ApprovalService, còn tổ hợp giữa bên sản sinh hook và bộ đáp ứng vẫn nằm ở tầng unit test.
- **Định tuyến phê duyệt của agent con về session cha**: phía con của `subagent-acp` tự động đáp ứng yêu cầu quyền của chính nó; ủy thác việc đó cho bộ điều khiển cha là một thiết kế riêng.

## Các phương án đã cân nhắc

- **Một nhà cung cấp đăng ký duy nhất thay vì listener waterfall**: bác bỏ. API `registerProvider()` buộc mọi vấn đề kết hợp — tiền lọc theo danh sách cho phép, bên quyết định là hook bên ngoài, phản hồi kiểm thử theo kịch bản, cổng chính sách đứng trước con người — phải nhồi hết vào một hiện thực nhà cung cấp. Waterfall tái sử dụng thẳng khả năng kết hợp sẵn có của runtime, hành vi mặc định từ chối khi thiếu, và cơ chế giải phóng tài nguyên của HMR (thay thế module nóng); JSDoc của seam cố định ngữ nghĩa ô quyết định đơn bằng quy ước, thay vì phát minh một registry nhà cung cấp.
- **Nội tuyến cổng quyền `tools/pre-execute` vào cầu nối ACP**: bác bỏ. Bật prompt cho mọi lời gọi mà cầu nối sở hữu sẽ hardcode chính sách yêu cầu vào tầng truyền tải, không phục vụ được bên phát ra yêu cầu thứ hai (nâng quyền sandbox xảy ra sau khi đã bắt đầu thực thi, không có thời điểm pre-execute), và quyết định `ask` do hook sinh ra sẽ không có cơ chế dùng chung.
- **seam tương tác người dùng tổng quát (`ctx.userQuestions`)**: bác bỏ với tư cách cơ chế phê duyệt. Bộ khung của hai bên khá giống nhau (định tuyến theo agent, chặn chờ con người, xử lý trường hợp thiếu), nhưng quy ước của phê duyệt hẹp hơn ở mọi chiều then chốt: bộ từ vựng kết quả đóng thay vì văn bản tự do, prompt nguyên bản của giao thức gắn vào lời gọi công cụ thay vì biểu mẫu tổng quát, bắt buộc fail-closed khi thiếu, và các sự kiện kiểm toán. Vì vậy phê duyệt không đi theo con đường thu thập thông tin `packages/interaction/user-questions` / `ask_user_question` đã phát hành — biểu mẫu thu thập thông tin không phải prompt quyền, phản hồi văn bản tự do không phải kết quả đóng; nếu về sau hai bên hội tụ, việc dùng chung đường ống nhà cung cấp vẫn còn để ngỏ.
- **Tiêm phụ thuộc tùy chọn tĩnh trong `dsh-tools`**: bác bỏ. Kiểu `Inject` của Cordis được vendor không có cờ optional — dạng object ánh xạ tên service sang cấu hình chặn, và inject đã khai báo sẽ chặn fiber. `ctx.get('approval')` là mẫu tiêu thụ cơ hội đã được ghi tài liệu (tra cứu owner-token của `tool-bash`, thăm dò persistence của loop), đọc sự tồn tại theo từng lời gọi, suy giảm đúng cách qua HMR, không cần thêm cơ chế nào.
- **Tách ba package như một capability seam**: bác bỏ. Service Definition/Service Provider/Consumer phù hợp với những seam có Service Provider thay thế được (bash-local vs bash-sandbox). Ở đây thân service là cơ chế cố định, còn phần biến thiên là những listener nằm lại trong plugin sở hữu kênh tương ứng — tách ra chỉ tạo ra một package Service Provider rỗng («đừng tách phòng ngừa»).
- **Cung cấp `allow_always` ngay bây giờ**: bác bỏ. Giao thức có thể biểu đạt được nó, nhưng hiện thực hóa nó đồng nghĩa với việc phải thiết kế kho lưu quyền, định danh phạm vi và cơ chế thu hồi (§ Hoãn lại). Hiển thị một lựa chọn mà harness không thể thực hiện chỉ tạo ra những lần cấp quyền chắc chắn thất bại.

## Hệ quả

Quy ước sau khi triển khai được cố định bởi bộ kiểm thử liệt kê ở mục «Kiểm thử»:

- `allowed-once` điều phối một thao tác; mọi kết quả khác đều từ chối với lý do khác nhau, còn `'never'` từ chối trước cả khi hiện prompt.
- Các đường phản hồi thiếu, ở ngoài, không có agent, ném exception, không hợp lệ hoặc mất kết nối đều fail-closed.
- Yêu cầu thành công được định tuyến theo quyền sở hữu agent chính xác, và ghi bổ sung một cặp sự kiện kiểm toán có thể phát lại, không hiển thị với mô hình; yêu cầu lúc rảnh và yêu cầu lỗi trước commit sẽ bị từ chối.
- Quyền sở hữu của ACP giới hạn quyết định trong phạm vi session của nó, còn deployment không có service này thì không sinh ra yêu cầu hay sự kiện kiểm toán nào.

Cái giá phải trả và những giới hạn đã chấp nhận:

- **Hai bộ đáp ứng đều ra quyết định trực tiếp sẽ tranh nhau cùng một ô.** Thứ tự listener của các plugin anh em là không xác định, và seam không thể phân xử giữa những bộ đáp ứng cuối chuỗi cạnh tranh nhau. Điều này được giảm nhẹ bằng quy ước (mỗi deployment một bộ đáp ứng cuối chuỗi; chỉ dùng `prepend` cho cổng «quyết định trước hoặc ủy thác»), chứ không phải bằng cơ chế ưu tiên mà event bus không có.
- **Đường sản xuất chỉ được kiểm chứng trong một tổ hợp.** `ask` có hai họ bên sản sinh — cầu nối hook qua `tools/pre-execute`, và nâng quyền sandbox qua cổng riêng của nó — với định dạng giao thức được ghi lại trong bộ snapshot của ví dụ sandbox; vì vậy cho tới khi có thêm deployment kết hợp nó, phạm vi phủ thực tế của seam chỉ là đúng một tổ hợp này.
- **Quyền sở hữu được khóa theo định danh của đối tượng `Agent`.** Bộ đáp ứng trước tiên phân giải bản ghi bản đồ session tại `agent.session.id`, rồi đòi hỏi bản ghi đó sở hữu đúng đối tượng agent; mọi đường hiện tại đều truyền cùng một đối tượng giữa loop và các seam, nhưng nếu sau này có biên nào clone hoặc proxy agent, cầu nối sẽ ủy thác và fail-closed, và khi đó sẽ cần một quy ước sở hữu khác.

## Câu hỏi thường gặp

- **Điều gì xảy ra trong deployment hoàn toàn không có bộ đáp ứng (headless, CI)?** Mỗi lần ask sẽ rơi xuống `unavailable` dọc theo waterfall rỗng, và lời gọi công cụ bị từ chối với lý do «no approval channel is available». Fail-closed là hành vi mặc định khi không có listener, không phải cấu hình.
- **Quyền có thể được lưu bền vững không — «luôn cho phép»?** Không. `allowed-once` chỉ cấp quyền cho đúng một thao tác đã hỏi, và service không lưu gì giữa các yêu cầu; `allow_always` được cố ý không hiển thị cho tới khi thiết kế xong kho lưu quyền (§ Hoãn lại).
- **Mô hình thấy gì về phê duyệt?** Chỉ thấy kết quả công cụ do bên phát ra yêu cầu suy ra từ kết quả phê duyệt — cặp kiểm toán không bao giờ đi vào transcript (bản ghi văn bản). Ba lý do không cấp quyền là khác nhau, nên mô hình phân biệt được giữa con người nói «không», prompt bị đóng, và thiếu kênh.
- **Ai quyết định một lời gọi có cần ask hay không?** Bên sản sinh chính sách: hook trả về `permissionDecision: ask`, bất kỳ listener `tools/pre-execute` nào, hoặc cổng nâng quyền sandbox. seam và cầu nối chỉ chịu trách nhiệm định tuyến và đáp ứng; cả hai đều không áp phán đoán riêng về «cái gì đáng bật prompt».
- **Điều gì xảy ra khi người dùng đóng prompt hoặc lượt bị abort giữa lúc đang ask?** Việc đóng được ánh xạ thành `cancelled` kèm văn bản từ chối riêng. Signal đã abort thì kết toán thẳng thành `cancelled` mà không điều phối; abort giữa lúc đang ask thì loại bỏ phản hồi đến muộn. Khi cả hai lần ghi bổ sung kiểm toán đều commit, cả hai đường đều ghi đúng một cặp sự kiện, không bao giờ hai cặp.
- **Nếu client phản hồi bằng một lựa chọn mà harness chưa từng cung cấp thì sao?** Mọi lựa chọn ngoài `allow_once` đã được cung cấp đều ánh xạ thành `rejected` — optionId lạ từ client không tuân thủ không bao giờ có thể cấp quyền.
- **Phê duyệt của subagent được định tuyến ra sao?** Không định tuyến: việc ủy thác ghim mọi agent con trong tiến trình vào `'never'` ([quyết định ghim phê duyệt](2026-08-10-subagent-approval-pinned-never.md)), nên mọi lần ask của agent con đều phân giải thành `rejected` trước bất kỳ bộ đáp ứng nào, và agent con biết điều đó ngay từ đầu qua runtime context của nó. Phần tự động đáp ứng phía con của `subagent-acp` là chuyện riêng; việc định tuyến ask của agent con tới bộ điều khiển cha đã bị hoãn (§ Hoãn lại).
- **`policy: 'never'` thực sự thay đổi gì lúc runtime?** Service phân giải mọi lần ask của session đó thành `rejected` trước khi điều phối bất kỳ bộ đáp ứng nào (bên trong service, nên không thứ tự đăng ký nào vòng qua được); ảnh chụp runtime context nguyên tử kế tiếp sẽ khai báo chính sách đó; và mỗi lần tự động từ chối thành công đều ghi một cặp kiểm toán.
- **Điều gì xảy ra khi hot reload hoặc bộ đáp ứng bị gỡ giữa chừng session?** Bộ đáp ứng được dispose cùng fiber sở hữu nó, nên lần ask kế tiếp suy giảm thành `unavailable` thay vì treo trên một kênh đã chết; mount lại sẽ đăng ký lại bộ đáp ứng, không cần trạng thái bù đắp.
- **Client lấy ngữ cảnh phê duyệt từ đâu?** Yêu cầu mang theo `callId` chính xác và `reason` đọc được bởi con người của bên phát ra; adapter kênh có thể tự liên kết trạng thái lời gọi công cụ phong phú hơn mà không cần lặp lại tham số trong seam phê duyệt.

## Tiền lệ

Những tiền lệ trong kho mã mà thiết kế này tái sử dụng hoặc đối chiếu:

- Cổng `fs/write-intent` (`packages/fs/fs/`) — ngữ nghĩa waterfall ô quyết định đơn đã được ghi tài liệu (đến trước được trước, ủy thác qua `next()`), mà quy ước bộ đáp ứng tái sử dụng.
- `hook/invoked`/`hook/result` — tiền lệ cặp kiểm toán chỉ ghi log mà `approval/asked`/`approval/decided` kế thừa; [Agent Note về cầu nối hook](2026-06-30-hook-bridges.md) đã đưa ra `permissionDecision: ask`, tức bên sản sinh đầu tiên.
- [Agent Note về điểm mở rộng chặn bắt](2026-06-30-interception-extension-points.md) — bộ từ vựng `allow`/`deny`/`ask` của `tools/pre-execute`, mà seam này phục vụ phần `ask` trong đó.
- [Agent Note ACP chỉ dành cho tự động hóa](../simplification/2026-07-23-acp-automation-only-protocol.md) — phép kiểm tra quyền sở hữu agent chính xác trên bản đồ session khi định tuyến bộ đáp ứng; [Agent Note đa session](2026-06-14-acp-multi-session.md) — hạng mục chặn về quyền sở hữu quyền theo từng session mà thiết kế này hiện thực hóa.
- Mẫu tiêu thụ `ctx.get()` theo kiểu cơ hội (tra cứu owner-token của `tool-bash`, thăm dò persistence của loop) — cách `dsh-tools` tiêu thụ seam này mà không chặn fiber của nó.
