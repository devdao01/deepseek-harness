# Agent Note: Input ảnh đa phương thức Web và attachment bền vững

Status: implemented

[English](2026-07-22-web-multimodal-image-input-and-durable-attachments.md) | 中文

## Vấn đề

Trước thay đổi này, khu vực input Web chỉ chấp nhận văn bản: `InputBar` nhận draft dạng chuỗi, `ConversationController.send()` tạo nội dung văn bản, host chuyển tiếp nội dung đó cho agent (tác tử). Người dùng không thể dán ảnh, xem trước ảnh trước khi gửi, gửi prompt chỉ chứa ảnh, cũng không thể khôi phục ảnh đã gửi từ lịch sử.

Đây không chỉ là thiếu tính năng ở khu vực input. Tầng core cần khối nội dung ảnh bền vững, bên cung cấp cần xử lý modality một cách tường minh, và log phiên phải dựng lại được toàn bộ nội dung model nhìn thấy. [Quyết định gỡ khối nội dung ảnh trước đây](../../implemented/simplification/2026-07-04-drop-image-content-block.md) đã bác bỏ một thiết kế chưa hoàn chỉnh có thể âm thầm làm mất ảnh hoặc làm phẳng nó. URL object của trình duyệt, đường dẫn cục bộ, URL bên cung cấp hay dữ liệu base64 đều không thể trở thành nội dung phiên chuẩn.

[Kiến trúc Web client](../../implemented/architecture/2026-07-19-gui-web-client-architecture.md) yêu cầu component giữ tính thuần, và đặt trạng thái khu vực input của mỗi phiên trong `ctx.conversation`; [Phân tầng GUI và giao thức RPC](../../implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md) yêu cầu event bền vững trở thành nguồn sự thật chung cho cả render thời gian thực lẫn replay lịch sử. Do đó, việc nhận, lưu bền vững, chuyển đổi bên cung cấp và render ảnh cần tuân theo cùng một vòng đời rõ ràng.

Các sản phẩm tương tự thường đặt thanh attachment phía trên editor, nhưng phương án lưu trữ khác nhau. Các đường dẫn kiểu Codex như `/var/folders/.../codex-clipboard-*.png` phù hợp làm vị trí tạm khi nhận input, nhưng không thể làm định danh message bền vững: hệ điều hành có thể xóa file, một host khác không thể đọc file, phiên sau khi khôi phục cũng không thể dựa vào việc file vẫn tồn tại.

## Quyết định

Ảnh raster được dán hoặc kéo-thả là ứng dụng đầu tiên của khu vực input Web cho năng lực attachment bền vững. File chưa gửi vẫn là trạng thái draft tạm thời do client giữ. Mỗi adapter tiếp nhận nội dung phong phú tự giải mã khối theo giao thức riêng, chứng minh năng lực định tuyến, và ủy thác toàn bộ batch ảnh cho attachment service trước khi nối thêm event message. Adapter bên cung cấp sinh output ảnh có cấu trúc cũng phải commit bền vững output trước khi nối thêm khối trợ lý tương ứng. Nội dung người dùng chuẩn và nội dung trợ lý chỉ chứa tham chiếu `ImageBlock` không phụ thuộc vai trò.

Phiên bản đầu hỗ trợ dán và kéo-thả PNG, JPEG, WebP và GIF, hỗ trợ prompt chỉ ảnh hoặc hỗn hợp, hỗ trợ render ảnh người dùng và ảnh trợ lý trong lịch sử, và hỗ trợ xem trước ảnh gốc bằng một cú click (chi tiết hiển thị và tương tác được thay thế bởi [Note căn chỉnh hiển thị attachment](2026-08-11-web-attachment-display-alignment.md)). Chọn file, file tổng quát, PDF, audio, video, sao chép ảnh và menu ngữ cảnh tùy chỉnh vẫn là công việc riêng cho các giai đoạn sau.

### Hành vi sản phẩm

- Sau khi dán hoặc kéo-thả một hoặc nhiều ảnh được hỗ trợ, thumbnail sẽ hiển thị theo thứ tự phía trên ô văn bản, nhưng không chèn văn bản giữ chỗ. Khi kéo file vào khu vực input, đích thả sẽ được highlight.
- Cùng một `InputBar` thường trực sẽ render thanh attachment cả ở Hero của phiên trống lẫn layout phiên đang hoạt động. Thanh attachment ẩn khi rỗng, dùng cuộn ngang để tránh làm phình khu vực input.
- Mỗi thumbnail có kích thước 64 × 64 pixel, nút xóa nằm bên trong card, hiện khi hover; click mở ảnh gốc draft, phần tràn dùng mũi tên hai đầu để lật trang thay vì thanh cuộn hiển thị.
- Prompt có thể chứa cả văn bản lẫn ảnh, hoặc chỉ ảnh. Khi dán văn bản thuần, giữ hành vi gốc của trình duyệt; khi dán nội dung clipboard hỗn hợp, văn bản được chèn bình thường, file được thêm đồng thời vào thanh attachment; chỉ khi dán riêng file mới chặn xử lý mặc định của trình duyệt. Khi thả file vào khu vực input luôn chặn điều hướng của trình duyệt, và báo lỗi cục bộ với file không được hỗ trợ.
- Khi gửi thất bại, draft văn bản và ảnh đầy đủ được khôi phục, nhưng không ghi đè văn bản hoặc ảnh mới thêm trong lúc request đang bay. Xóa, gửi thành công, giải phóng scope phiên, giải phóng lịch sử đã render và giải phóng ứng dụng đều thu hồi các object URL mà mỗi bên đang giữ.
- Ảnh người dùng và ảnh trợ lý trong lịch sử dùng chung một control `MessageImage`. Ảnh inline giữ đúng tỷ lệ khung hình gốc, không phóng to, và bị giới hạn trong hộp biên 240 × 240 pixel.
- Click vào ảnh trong message sẽ mở modal chứa ảnh gốc đã lưu, không vượt quá viewport. Nhấn Escape, kích hoạt control đóng hoặc kích hoạt vùng nền đều đóng modal và khôi phục focus.
- Phiên bản đầu không ghi đè menu ngữ cảnh của trình duyệt, cũng không cung cấp thao tác sao chép ảnh tường minh.

### Vòng đời và quy thuộc lưu trữ

Ranh giới bền vững là khi message được chấp nhận, không phải khi ảnh được dán:

| Trạng thái | Biểu diễn được phép | Tính bền vững và thứ tự |
| --- | --- | --- |
| Draft người dùng chưa gửi | `File` trình duyệt cộng object URL; client native có thể dùng file tạm hệ điều hành như `/var/...` | Tạm thời và do client giữ. Có thể biến mất sau khi reload hay tiến trình thoát, không bao giờ xuất hiện trong event phiên. |
| Ảnh người dùng đã chấp nhận | Đối tượng bất biến dưới `DSH_HOME` cộng `ImageAttachmentRef` | Host commit từng ảnh trước khi `agent.send()` hoặc `agent.steer()` có thể nối thêm event người dùng sở hữu nó. |
| Output ảnh model có cấu trúc | Đối tượng bất biến dưới `DSH_HOME` cộng `ImageAttachmentRef` | Adapter bên cung cấp commit byte trước khi phát khối ảnh hoặc event message trợ lý đã hoàn thành. Không cho phép URL tạm, đường dẫn hay base64 trong event. |

Trạng thái `InputMachine` của mỗi phiên lưu danh sách định danh attachment có thứ tự chỉ dùng lúc runtime cạnh draft thời gian thực. Chat store do framework giữ chỉ nhận bản chiếu (mirror) bền vững dạng văn bản thuần của draft, còn `ConversationController` giữ registry `File` và object URL riêng cho trình duyệt tương ứng:

```ts
import type { Branded } from '@deepseek-ai/dsh-brand'

type DraftAttachmentId = Branded<'DraftAttachmentId'>

interface ChatStoreState {
  selection: object | null
  draft: string
  view: string | null
}

interface InputState {
  draft: string
  imageIds: readonly DraftAttachmentId[]
}

interface ComposerAttachment {
  kind: 'image'
  id: DraftAttachmentId
  file: File
  previewUrl: string
}
```

Việc tách này dùng hook input và action trong kênh provide của phiên làm đường subscribe duy nhất cho trạng thái khu vực input thời gian thực, đồng thời tránh ghi đối tượng trình duyệt không thể tuần tự hóa vào JSON bền vững. Chỉ bản chiếu draft dạng văn bản thuần dùng `localStorage`; định danh attachment, đối tượng `File` của trình duyệt và object URL đều giới hạn trong scope của vỏ (shell) input phiên thời gian thực. Do đó ảnh chưa gửi không thể giữ lại qua reload hay giải phóng scope phiên. Khi chuyển Workspace, chỉ vỏ đích chấp nhận toàn bộ batch ảnh, draft hỗn hợp văn bản-ảnh mới di chuyển; khi bị từ chối, cả văn bản lẫn ảnh đều ở lại vỏ nguồn. Client native có thể tạm lưu input trong thư mục tạm hệ điều hành, nhưng phải đối xử với đường dẫn đó giống object URL của trình duyệt: xóa khi không cần nữa, và sao chép byte vào lưu trữ bền vững trước khi message được chấp nhận.

Backend attachment cục bộ giải quyết lần lượt `dshHome` tường minh, `$DSH_HOME`, và `~/.dsh`. Nó lưu đối tượng định địa chỉ theo nội dung (content-addressed) tại `$DSH_HOME/attachments/v1/objects/<prefix>/<sha256>`, và đặt quyền chỉ chủ sở hữu truy cập được cho thư mục và file. Mỗi tiến trình lần đầu lưu đối tượng cho một home sẽ tạo home đó, và đồng bộ từng cấp thư mục tổ tiên cho đến gốc hệ thống file; không thể coi sự tồn tại là tính bền vững, vì một tiến trình khác có thể vẫn đang ở giữa `mkdir` và `fsync` thư mục cha. Sau đó, service ghi và đồng bộ file tạm, rồi publish nguyên tử, và thực hiện đồng bộ thư mục trên đường dẫn đã publish để nó bền vững (POSIX; Windows dựa vào journal metadata hệ thống file), rồi mới trả về tham chiếu. Digest nội dung được mã hóa trong định danh mờ (opaque) `sha256:<digest>`. Cả việc ghi lúc kiểm tra chấp nhận lẫn việc đọc đều giải mã đầy đủ ảnh raster được hỗ trợ trước khi chấp nhận định dạng và kích thước của nó; mỗi lần đọc còn kiểm tra digest, độ dài byte và metadata đã ghi.

Phiên bản đầu không thực hiện tự động xóa trên lưu trữ. Ảnh người dùng đã gửi và ảnh do model sinh ra sẽ được giữ lại mãi mãi, phục vụ lịch sử, khôi phục và fork. Garbage collection nhận biết tham chiếu cần thiết kế riêng, vì việc dọn dẹp chỉ theo thời gian có thể xóa dữ liệu vẫn đang được phiên bền vững tham chiếu. Giới hạn byte và pixel của triển khai là chính sách kiểm tra chấp nhận lúc ghi; lúc đọc sẽ kiểm tra digest và metadata đã ghi, nhưng không áp lại giới hạn chấp nhận hiện tại, do đó việc siết chính sách không làm mất hiệu lực lịch sử cũ.

### Nội dung bền vững và giao thức prompt

Seam attachment công khai thao tác ghi ảnh bất biến và đọc đã kiểm tra. Metadata chuẩn có chủ đích hẹp hơn bản ghi file tổng quát:

```ts
import type { Branded } from '@deepseek-ai/dsh-brand'

type AttachmentId = Branded<'AttachmentId'>

interface ImageAttachmentRef {
  attachmentId: AttachmentId
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  bytes: number
  width: number
  height: number
  name?: string
}

interface ImageBlock {
  type: 'image'
  attachment: ImageAttachmentRef
}
```

`ImageBlock` được thêm vào `ContentBlockMap` cốt lõi có thể mở rộng qua merge, có hiệu lực trong cả nội dung người dùng lẫn nội dung trợ lý. Nó không bao giờ mang base64, object URL, đường dẫn hệ thống file, hay locator do bên cung cấp giữ. Do đó, event phiên cùng kho lưu trữ đối tượng bất biến đủ để cùng nhau dựng lại chính xác ảnh model đã nhìn thấy. Từ vựng LLM do đó chỉ phụ thuộc vào seam attachment ở tầng kiểu; phụ thuộc runtime bên cung cấp vẫn do từng adapter giữ.

Trình duyệt không thể sinh tham chiếu bền vững, do đó `session.prompt` nhận một union tiếp nhận có phạm vi hẹp, thay vì `ContentBlock[]` chuẩn:

```ts
export {}

type PromptInputPart =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
      data: string
      name?: string
    }
```

Base64 chỉ vượt qua ranh giới giao thức một lần, và bị loại bỏ sau khi lưu bền vững. Mỗi điểm vào kiểm tra hình dạng base64 chuẩn và MIME đã khai báo, rồi gọi `AttachmentStore.saveImages()` với batch đã giải mã đầy đủ. Service chịu trách nhiệm về số lượng ảnh, tổng byte, byte từng ảnh, việc MIME khai báo có khớp với ảnh raster đã giải mã đầy đủ hay không, kích thước gốc và số pixel đã giải mã; nó kiểm tra từng thành viên batch trước khi lưu bất kỳ thành viên nào, do đó một ảnh sai định dạng sẽ không để lại các thành viên hợp lệ trong batch thành đối tượng không có tham chiếu. Sau đó, việc commit lưu trữ thực hiện theo thứ tự để giới hạn bộ nhớ dùng cho bộ giải mã raster đầy đủ. Nếu thao tác I/O lưu trữ tiếp theo thất bại, bên gọi sẽ không nối thêm event model nhìn thấy, cũng không nhận tham chiếu một phần, nhưng các đối tượng bất biến định địa chỉ theo nội dung trước đó có thể vẫn ở trạng thái không có tham chiếu; phiên bản đầu để việc dọn dẹp cho garbage collection nhận biết tham chiếu trong tương lai, không thêm rollback phá hủy vào kho lưu trữ khử trùng lặp. Chỉ khi mọi ảnh đều thành công, điểm vào mới gọi agent với văn bản đã chuẩn hóa và các khối ảnh bền vững theo đúng thứ tự giao thức. Khi thất bại, không công khai bất kỳ đường dẫn attachment hay byte gốc nào.

`session.attachment` là endpoint chỉ đọc, có phạm vi theo phiên. Chỉ khi event bền vững trong phiên đó tham chiếu định danh attachment được yêu cầu, host mới cung cấp byte. Khi phiên đang ở trạng thái render, client sẽ khử trùng lặp thao tác tải theo cặp phiên và định danh attachment; khi phiên đã render được giải phóng, các URL đã resolve sẽ bị thu hồi, và các lazy load đã mất hiệu lực sẽ bị từ chối trước khi cấp object URL, để tránh phiên đã unmount hoặc service đã giải phóng ghi lại cache.

### Năng lực model và hành vi bên cung cấp

Mục danh mục model thêm khai báo modality input tùy chọn, có thể mở rộng qua merge. Thiếu khai báo nghĩa là chưa biết; khai báo tồn tại nhưng không chứa `image` nghĩa là tường minh không hỗ trợ ảnh.

Host là ranh giới kiểm tra trước có thẩm quyền. Nó giải quyết bên cung cấp và model mà phiên đang định tuyến gần nhất, và khi thiếu sẽ fallback lần lượt về option của agent rồi giá trị mặc định của host; nếu model đó loại trừ tường minh input ảnh, host sẽ từ chối prompt trước khi ghi bất kỳ attachment hay event nào, client thì khôi phục draft. Việc kiểm tra chấp nhận prompt chứa ảnh và việc chọn model dùng chung một ranh giới tuần tự hóa theo từng agent, và prompt đã dequeue vẫn ở trạng thái chờ publish cho đến khi event message bền vững của nó được phát ([quyết định thứ tự](../bug-fix/2026-07-29-atomic-web-image-admission.md)); còn payload steering tham gia ngưỡng ngay từ khi enqueue cho đến khi event `steering/message` của nó được phát, bịt lỗ hổng cửa sổ outbox không bao giờ vào bản chiếu hàng đợi. Khi ảnh đang chờ publish hoặc vẫn tồn tại trong lịch sử suy ra hiện tại của phiên, việc chọn model sẽ từ chối mục tiêu chỉ-văn-bản. Nén (compaction) có thể xóa ảnh cũ, khiến việc chọn mục tiêu chỉ-văn-bản sau đó trở nên hợp lệ; khi chuyển sang idle mà không publish event nào, payload queued đã được nhận sẽ được giải phóng, còn steering vẫn nằm trong outbox luôn bị ràng buộc ngưỡng cho đến khi publish hoặc bị hủy. Việc chỉnh sửa của `session.updateQueue` chỉ chấp nhận nội dung văn bản, do đó việc sửa hàng đợi không thể vòng qua ranh giới kiểm tra chấp nhận này để tiêm ảnh. Khi năng lực chưa biết, hệ thống vẫn tiếp tục vào kiểm tra cưỡng chế của adapter, để các định danh model chưa được liệt kê vẫn khả dụng. Trình duyệt sẽ từ chối loại media ảnh đã khai báo không hỗ trợ trước khi cấp URL xem trước, nhưng không giữ snapshot cho giới hạn triển khai hay năng lực model: snapshot bắt tay không thể biểu diễn mục tiêu hiện tại của phiên sau `session.selectModel`, chính sách triển khai cũng có thể thay đổi độc lập. Host kiểm tra toàn bộ batch theo số byte từng ảnh hiện tại, số lượng ảnh, tổng byte, loại media, kích thước, số pixel và chính sách model đang định tuyến, trước khi ghi bất kỳ attachment hay event nào; việc từ chối được thông báo qua toast ngắn của composer.

Adapter Pi-AI là đường input thị giác đầu tiên: nó giải quyết `ctx.attachments` tại thời điểm request, chuyển đổi đệ quy từng tham chiếu ảnh bền vững, kể cả tham chiếu lồng trong kết quả tool, và chỉ sinh nội dung ảnh gốc của bên cung cấp cho model đã khai báo hỗ trợ input ảnh. Tổ hợp giao là đồng thời đăng ký các tuyến OpenAI, Anthropic của Pi-AI, và tuyến DeepSeek mặc định chỉ hỗ trợ văn bản; việc chọn bên cung cấp/model hiện tại vẫn do tổ hợp hoặc cấu hình host đảm nhiệm, không phải chức năng của CLI (giao diện dòng lệnh) input ảnh. Việc giải quyết service tại thời điểm request tránh việc thứ tự tải Cordis cố định hóa tính khả dụng của attachment service tùy chọn. Adapter DeepSeek viết tay sẽ ném lỗi định kiểu `UNSUPPORTED_CONTENT` khi gặp ảnh ở bất kỳ vị trí nào trong request, kể cả ảnh lồng trong kết quả tool. Không adapter nào được phép làm phẳng hay bỏ qua ảnh.

Tầng core hỗ trợ khối ảnh trợ lý có cấu trúc, nhưng hiện chưa có đường bên cung cấp production nào được xác thực qua output ảnh. Bất kỳ adapter nào trong tương lai hỗ trợ output đều phải lấy byte bên cung cấp trong chính sách kích thước và thời gian có giới hạn, kiểm tra và lưu bền vững byte qua cùng attachment service, rồi mới có thể publish `ImageBlock` một cách nguyên tử. URL trong Markdown trợ lý vẫn là văn bản, không bao giờ tự động tải xuống.

Ước tính token độc lập bên cung cấp không đoán giá thị giác dựa trên kích thước ảnh; mức dùng do bên cung cấp trả về vẫn là giá trị có thẩm quyền. ACP (Agent Client Protocol) chỉ công bố năng lực prompt ảnh khi đúng tuyến đã cấu hình và triển khai attachment có thể chấp nhận ảnh; nó lưu bền vững input inline trước khi publish event người dùng, và đọc lại tham chiếu ảnh trợ lý đã commit để gửi update ảnh ACP gốc. MCP giữ khối gốc chuẩn cho bên gọi lập trình, đồng thời chiếu ảnh đã được chấp nhận thành khối core bền vững; Code Mode chuyển tiếp mọi sub-result đã kết toán và chứa ảnh qua kết quả bên ngoài kèm quy thuộc nguồn và đã ghi log.

Nén sẽ replay một tiền tố phiên đã chọn (chứa tham chiếu ảnh) vào đường sinh tóm tắt đã cấu hình. Đường hỗ trợ thị giác sẽ giải quyết các tham chiếu này qua adapter; đường chỉ-văn-bản sẽ fail tường minh, thay vì âm thầm bỏ ngữ cảnh thị giác. Checkpoint tổng hợp vẫn chỉ chứa văn bản, `compaction-basic` sẽ từ chối output tóm tắt chứa ảnh với `UNSUPPORTED_CONTENT`.

### Render lịch sử và xem trước ảnh gốc

Việc gấp (fold) lịch sử giữ lại `ImageBlock` trong cả message người dùng lẫn trợ lý. Ảnh người dùng canh cuối, phía trên văn bản; ảnh trợ lý giữ nguyên vị trí khối nội dung gốc trong luồng tường thuật canh đầu. `MessageImage` suy ra hộp biên inline ổn định từ kích thước đã ghi, giải quyết byte qua loader được phiên ủy quyền, dùng `object-fit: contain`, và chuyển đổi đối tượng thiếu hoặc hỏng thành control lỗi có thể thử lại.

Thumbnail khu vực input và mỗi `MessageImage` tự giữ trạng thái xem trước ảnh gốc tạm thời riêng, và gọi cùng một `ImageLightbox` thuần. Modal dùng object URL gốc đã resolve, chỉ giới hạn kích thước hiển thị; nó focus vào control đóng, và khôi phục focus về mục tiêu trước đó khi đóng.

### Giới hạn và ranh giới tin cậy

Phiên bản đầu chỉ chấp nhận PNG, JPEG, WebP và GIF. Không chấp nhận SVG và URL từ xa. Giới hạn mặc định là 5 MiB mỗi ảnh, 20 ảnh mỗi message và tổng 100 MiB byte ảnh, cùng 40 triệu pixel gốc mỗi ảnh. Các giới hạn thay đổi theo triển khai này thuộc cấu hình backend đã kiểm tra, và được host cưỡng chế trước khi lưu bền vững. Payload kết nối client đặt giới hạn `maxRequestBodyBytes` riêng, có thể cấu hình (mặc định 160 MiB) cho mỗi API request; nếu giới hạn đó không đủ chứa tổng giới hạn ảnh của attachment service sau khi bị phình to bởi base64 và bọc request, việc tải sẽ thất bại. Do đó, việc hạ chính sách ảnh không bao giờ âm thầm hạ giới hạn payload hiệu lực cho văn bản hay RPC khác. Request body không khai báo độ dài sẽ bị từ chối ngay khi vượt giới hạn, không phải sau khi đọc hết.

Base64 sai định dạng, media không hỗ trợ hoặc không khớp, dữ liệu ảnh bị cắt, vượt giới hạn byte, vượt số lượng ảnh, vượt giới hạn pixel, đối tượng thiếu và không khớp tính toàn vẹn đều trả về lỗi có cấu trúc ổn định. Tên file gốc chỉ giữ lại phần cuối để hiển thị, ký tự điều khiển bị loại bỏ, và bất kỳ đường dẫn cục bộ nào cũng không được ghi log hay trả về trình duyệt.

### Thay đổi package và interface

| Interface | Trách nhiệm |
| --- | --- |
| `packages/attachment/attachment` | Định danh attachment mờ, tham chiếu ảnh, giới hạn, lỗi, và kiểm tra chấp nhận đơn/batch qua `ctx.attachments`. |
| `packages/attachment/attachment-local` | Lưu trữ định địa chỉ theo nội dung riêng tư, giải mã raster đầy đủ, kiểm tra toàn vẹn và cấu hình. |
| `packages/llm/llm` | `ImageBlock` không phụ thuộc vai trò và metadata modality input. |
| `packages/llm/llm-pi-ai` | Giải quyết input ảnh bền vững và được hỗ trợ thành nội dung gốc bên cung cấp. |
| `packages/llm/llm-deepseek` | Từ chối tường minh nội dung ảnh. |
| `packages/compaction/compaction-basic` | Giữ ảnh trong input tóm tắt, và từ chối tường minh output checkpoint không phải văn bản. |
| `packages/host/apiproxy` và `packages/bundle/base` | Giao thức upload phạm vi hẹp, kiểm tra chấp nhận batch dùng chung, giới hạn và kiểm tra trước model đang định tuyến, thứ tự lưu bền vững trước rồi mới nối thêm event, đọc được phiên ủy quyền, và tổ hợp profile mặc định. |
| `packages/client/connection` và `packages/client/runtime` | Buffer request có giới hạn, kiểu giao thức, ảnh fixture (dữ liệu tiền đề cho test), upload prompt, đọc attachment và gấp tham chiếu bền vững. |
| `packages/client/ui-conversation` | Ảnh draft theo từng phiên, thanh attachment, control ảnh người dùng và trợ lý, và xem trước ảnh gốc. |
| `packages/acp/acp` | Năng lực ảnh gốc có điều kiện, kiểm tra chấp nhận ảnh inline nguyên tử, và việc giao ảnh trợ lý đã kiểm tra. |
| `packages/mcp/mcp-client` | Kết quả MCP chuẩn không mất mát, chiếu ảnh bền vững qua cổng năng lực, và chẩn đoán tường minh cho khối phong phú không được hỗ trợ. |
| `packages/core/tools` | Chuyển tiếp tổng quát sub-result Code Mode đã kết toán và chứa ảnh sau kết quả bên ngoài. |

Package attachment cấu thành cả interface lẫn phần triển khai của một seam năng lực. Hành vi khu vực input ở lại tầng đối tượng phiên, chuyển đổi bên cung cấp ở lại trong adapter, không cần sửa `agent-loop`.

### Triển khai

Phạm vi đã triển khai gồm ranh giới attachment service và kiểm tra chấp nhận batch dùng chung, khối ảnh không phụ thuộc vai trò, chuyển đổi input Pi-AI, từ chối DeepSeek, thứ tự lưu bền vững cho Web/ACP/MCP, giao thức upload và đọc Web, hỗ trợ giao thức ảnh ACP có điều kiện, kết quả chuẩn MCP không mất mát và chiếu ảnh bền vững, chuyển tiếp kết quả phong phú Code Mode tổng quát, cưỡng chế giới hạn ảnh hiện tại, request body Web giới hạn kích thước, ảnh draft trong bộ nhớ, thanh attachment dán và kéo-thả, render ảnh lịch sử người dùng và trợ lý, xem trước bằng một click, xử lý nén, và lớp phủ Web và ACP đã lắp ráp không cần key.

Giao thức prompt tiền phát hành không cần lớp wrapper tương thích; khi đưa vào lát cắt tương ứng, mọi điểm gọi và fixture sẽ được sửa cùng lúc.

## Các phương án thay thế đã cân nhắc

### Giữ mỗi ảnh dán trong `/var` hoặc thư mục tạm khác

Lưu trữ tạm phù hợp để dùng trước khi gửi, cũng phù hợp cho client native nhận file clipboard qua hệ điều hành. Nhưng nó không phù hợp để dùng tiếp sau khi message được chấp nhận: việc dọn dẹp nằm ngoài kiểm soát của harness, đường dẫn khác nhau tùy host, phiên sau khi khôi phục hoặc fork cũng có thể tồn tại lâu hơn file. Đề xuất cho phép tạm lưu, nhưng sẽ sao chép byte đã chấp nhận vào `DSH_HOME` trước khi nối thêm event.

### Lưu bền vững ngay sau khi dán hoặc kéo-thả

Lưu bền vững ngay lập tức giúp draft tồn tại sau reload, nhưng sẽ tạo đối tượng bền vững trước khi phiên hoặc message giữ nó, do đó phải định nghĩa quota, vòng đời đối tượng mồ côi và chính sách dọn dẹp. Phiên bản đầu giữ draft chưa gửi ở trạng thái tạm, và lấy việc gửi được chấp nhận làm ranh giới bền vững.

### Nhúng base64 inline trong message và log phiên

Cách này sẽ nhân bản dữ liệu nhị phân trong RPC, event, phân trang lịch sử, fork, nén và lưu trữ trình duyệt, còn dụ việc đo token nhầm văn bản đã mã hóa thành văn bản model. Một đối tượng bất biến duy nhất kèm tham chiếu nhỏ có thể giữ biểu diễn bền vững có giới hạn.

### Dùng object URL trình duyệt, đường dẫn cục bộ hoặc URL bên cung cấp làm nội dung chuẩn

Object URL mất hiệu lực khi document đóng, đường dẫn cục bộ không di chuyển được, URL bên cung cấp có thể hết hạn, theo dõi người xem hoặc lộ credential. Chúng chỉ có thể tồn tại như chi tiết truyền tải tạm thời hoặc xem trước.

### Dùng một `AttachmentBlock` tổng quát cho ảnh, file, audio và video

Hiển thị khu vực input có thể dùng thanh attachment tổng quát, nhưng ngữ nghĩa bên cung cấp phụ thuộc vào modality cụ thể. Ảnh là input đa phương thức gốc; PDF có thể là file bên cung cấp hoặc văn bản đã trích xuất; video có thể được model hỗ trợ gốc, xử lý theo khung hình hoặc không được hỗ trợ. `ImageBlock` cụ thể buộc mỗi bên tiêu thụ phải xử lý hoặc từ chối modality đó một cách tường minh.

### Dựa vào kiểm tra năng lực UI hoặc lọc ảnh âm thầm

Trạng thái UI có thể lỗi thời, cũng không thể bảo vệ đường SDK trực tiếp, ACP, replay hay model chưa được liệt kê. Việc lọc âm thầm sẽ thay đổi ý định người dùng. Kiểm tra cưỡng chế bên cung cấp vẫn là bắt buộc, kiểm tra UI chỉ là phản hồi sớm tùy chọn.

### Thêm service RichContent tổng quát trên từ vựng nội dung core

Không áp dụng, vì core đã có từ vựng `ContentBlock` không phụ thuộc vai trò và tham chiếu attachment. Một service tổng quát thứ hai sẽ lặp lại ngữ nghĩa thứ tự, năng lực, log và vòng đời, trong khi mỗi adapter giao thức vẫn phải tự giải quyết giao thức riêng. Xây dựng adapter ảnh phạm vi hẹp trên nền core hiện có giúp giữ rõ quy thuộc, và để audio/resource tự thiết lập hợp đồng vòng đời riêng khi thực sự cần.

### Chuẩn hóa kết quả MCP thành nội dung core, và dùng nó làm giá trị tool chuẩn

Không áp dụng, vì Code Mode và bên gọi lập trình cần khối JSON MCP đầy đủ cùng `structuredContent` tùy chọn; thay giá trị đó bằng bản chiếu Native sẽ làm cầu nối mất mát. MCP giữ giá trị giao thức, và chuẩn bị bản chiếu model riêng; chính sách post-execute cuối cùng vẫn có thẩm quyền.

### Thực hiện đọc/ghi attachment trong renderer output đồng bộ

Không áp dụng, vì renderer tool phải thuần, đồng bộ và có thể replay. MCP chuẩn bị bản chiếu ảnh trong lúc thực thi bất đồng bộ, chỉ cài đặt tại ranh giới finalize của registry; ACP thực hiện kiểm tra chấp nhận bất đồng bộ và chuyển đổi output trong vòng đời truyền tải riêng của nó. Chuyển tiếp Code Mode quan sát nội dung cuối cùng đã kết toán, thay vì để mỗi tool ảnh tự xử lý hành vi token cha riêng tư.

## Kiểm thử

- Test lưu trữ bao phủ khử trùng lặp định địa chỉ theo nội dung, quyền riêng tư, thất bại kiểm tra chấp nhận, thất bại khi đối tượng hỏng hoặc thiếu, và đọc dữ liệu lịch sử sau khi siết giới hạn triển khai.
- Test host và giao thức bao phủ thứ tự lưu bền vững trước rồi mới nối thêm event, log không chứa base64, ủy quyền theo phạm vi phiên, từ chối do năng lực, giới hạn upload, request body HTTP giới hạn kích thước, race condition giữa kiểm tra chấp nhận ảnh và chọn model (cả đặt trong hàng đợi lẫn steering), trạng thái chờ publish, giải phóng ngưỡng khi chuyển idle mà chưa publish, sửa hàng đợi chỉ-văn-bản, và việc chọn dựa trên lịch sử suy ra hiện tại sau nén.
- Unit test client bao phủ dán và kéo-thả, văn bản clipboard hỗn hợp, gửi chỉ-ảnh, khôi phục draft, thứ tự, dọn object URL ở cấp draft, phiên và ứng dụng, và một lần đọc lịch sử lazy hoàn tất sau khi giải phóng; kênh sản phẩm build đã lắp ráp không cần key (`apps/web/tests/image-display.snapshot.ts`, `DSH_EXAMPLE_MODE=lib pnpm run test:snapshot`) bao phủ gallery ảnh người dùng và trợ lý trong lịch sử được render qua tuyến attachment đã ủy quyền, lightbox ảnh gốc, và thanh thumbnail dán ở composer.
- Test adapter và nén bao phủ chuyển đổi ảnh gốc Pi-AI, tổ hợp attachment service sau này, từ chối chỉ-văn-bản, ảnh lồng đệ quy trong kết quả tool, giữ input tóm tắt, và từ chối tường minh output ảnh.
- Test attachment, MCP, ACP và Code Mode bao phủ kiểm tra toàn bộ thành viên trước khi ghi, thứ tự văn bản-ảnh hỗn hợp, event bền vững không chứa base64 inline, cổng năng lực đúng tuyến, chẩn đoán tường minh cho nội dung không hỗ trợ, ưu tiên thay thế/chặn của post-execute, hủy trong lúc kiểm tra chấp nhận, giao ảnh trợ lý đã kiểm tra, và chuyển tiếp ảnh lồng tổng quát. Snapshot ACP không cần key đã lắp ráp gửi một PNG inline thật, và chỉ cố định tham chiếu bền vững của nó trong log phiên.
- Test API thật cần credential gửi một PNG qua tuyến Anthropic `claude-opus-4-8`, và yêu cầu model nhận diện mã QR bên trong.
- Bộ adapter production hiện tại chưa có tuyến output ảnh đã được xác thực; việc xác thực bên cung cấp output vẫn nằm ngoài phạm vi phiên bản đầu.

## Hệ quả

- Lưu trữ bền vững sẽ tiếp tục tăng khi không có garbage collection. Phiên bản đầu chọn an toàn cho replay, thay vì xóa quá sớm.
- Đối tượng thiếu hoặc hỏng sẽ khiến request model không thể dựng lại chính xác. Việc fail tường minh giữ tính toàn vẹn, nhưng có thể chặn phiên đó tiếp tục chạy cho đến khi được sửa.
- Base64 JSON-RPC làm tăng bộ nhớ upload, và mang theo chi phí mã hóa khoảng một phần ba. Giới hạn của phiên bản đầu có thể ràng buộc chi phí này; media lớn hơn cần streaming hoặc giao thức truyền nhị phân.
- Ảnh chưa gửi không thể giữ lại qua reload. Draft bền vững cần quota và dọn dẹp đối tượng mồ côi, không phải tái sử dụng ngầm định kho lưu trữ message.
- Xem trước ảnh gốc giải mã nhiều pixel hơn số pixel control inline hiển thị. Giới hạn pixel, chỉ mở một preview mỗi lần, và giải phóng object URL có thể ràng buộc nhưng không loại bỏ được mức dùng bộ nhớ tức thời của trình duyệt.
- Metadata năng lực có thể thiếu hoặc lỗi thời. Kiểm tra trước của host có thể cải thiện phản hồi, kiểm tra cưỡng chế của adapter vẫn là kết quả có thẩm quyền.
- Bên cung cấp output trong tương lai có thể cần tải xuống đã xác thực để hoàn thành ảnh trợ lý, điều này làm tăng độ trễ và tạo điểm lỗi mới. Thứ tự lưu bền vững trước rồi mới nối thêm event ưu tiên đảm bảo tính toàn vẹn replay.
- Chọn file, file tổng quát và PDF, audio và video, tạm lưu draft bền vững, sao chép ảnh, menu ngữ cảnh tùy chỉnh, xác thực bên cung cấp output và garbage collection nhận biết tham chiếu vẫn là các thiết kế độc lập.
