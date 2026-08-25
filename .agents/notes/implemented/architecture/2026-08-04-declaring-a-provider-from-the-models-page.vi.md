# Agent Note: Khai báo một provider trên trang Models

Status: implemented

[English](2026-08-04-declaring-a-provider-from-the-models-page.md) | Tiếng Việt

## Problem

Hai lớp bên dưới đã biến route pi-ai thành [một khai báo](2026-08-03-pi-ai-declared-provider-catalog.md), và trao cho host năng lực [dò hỏi endpoint nháp](2026-08-04-draft-provider-endpoint-interrogation.md). Nhưng cả hai đều chưa tới được tay người không chỉnh sửa YAML: trang Models vẫn chỉ cung cấp cho mỗi provider một ô nhập API key và một khu vực gấp lại chứa địa chỉ API, nên việc kết nối một gateway có nghĩa là phải mở `$DSH_HOME/settings.yaml` và biết hình dạng của profile, việc sửa lại một context window cũ cũng vậy. Năng lực đã tồn tại sẵn, nhưng giao diện chưa phơi bày nó.

Cái còn thiếu là hai thứ, và hình dạng của chúng không giống nhau. Chỉnh sửa model của một route đã tồn tại là một *trường* trên một card đã tồn tại sẵn; khai báo một route lại là một lần *tạo mới*: route id đang được chọn ngay tại đây, và trước khi được chọn thì hoàn toàn không có địa chỉ settings nào có thể chỉnh sửa được.

## Decision

Danh sách model là component dùng chung cho cả hai luồng; việc tạo mới thì có card riêng của nó.

`ModelListEditor` chỉnh sửa mảng `models` của profile — mỗi dòng một model, gồm id, tên hiển thị, context window và giới hạn output — và nắm giữ hành động fetch. Danh sách rỗng có nghĩa là "dùng catalog tích hợp sẵn của route đó", nên mỗi dòng chỉ được thêm vào một cách có chủ đích; xóa trắng một trường tùy chọn sẽ loại bỏ nó, chứ không lưu vào một giá trị mà schema sẽ từ chối, còn dung lượng không phải số nguyên dương thì hoàn toàn không được lưu.

Việc fetch sẽ hỏi endpoint mà form **đang hiển thị hiện tại** — địa chỉ API đã sửa nhưng chưa lưu, key đã gõ nhưng chưa được lưu trữ — nên việc thêm một provider mới đi trọn một chuyến, chứ không phải kiểu "lưu trước rồi quay lại sau". Phản hồi sẽ mở ra một hộp lựa chọn thay vì ghi thẳng vào: ứng viên đã cấu hình từ trước mặc định không được tick chọn, nên việc chấp nhận một lựa chọn tuyệt đối không ghi đè dung lượng mà người dùng đã sửa lại. Provider không thể được dò hỏi chỉ là một đường vòng chứ không phải ngõ cụt; thông báo riêng của adapter sẽ xuất hiện cạnh các dòng, mà những dòng này vẫn có thể chỉnh sửa thủ công.

`CustomProviderCard` khai báo route mà pi-ai chưa cung cấp. Nó là một card độc lập chính vì route id được chọn ngay tại đây: một lần `settings.mutate` thiết lập toàn bộ profile trên `providers.<route>`, còn key thì được truyền riêng qua `credentials.set`, dùng cách dẫn xuất `<ROUTE>_API_KEY` giống hệt các provider hiện có. Ba thứ mà route khai báo thủ công không thể có giá trị mặc định — endpoint, giao thức, ít nhất một model — sẽ khóa nút tạo, nên thất bại sẽ nêu tên đúng lúc người dùng vẫn còn đang nhìn vào trường đó.

Các lựa chọn giao thức đến từ **schema của chính namespace đó**, được đọc ra qua descriptor settings mà trang vốn dĩ đã fetch (`providers.*.api` là một union của `supportedProtocols()` của adapter). Không có trường wire mới nào được thêm, không có hằng số nào trong client, và các lựa chọn được cung cấp cũng không có cách nào bị lệch khỏi tập được chấp nhận.

Với route mà danh mục báo cáo là **đã khai báo**, editor với tới được hai trường mà nó tự đặt tên cho chính mình — tên hiển thị và giao thức đó. Card tạo mới đòi hỏi một trường mà editor không sửa được, tương đương với việc để trường đó ở vị trí chỉ có `settings.yaml` mới chạm tới được, mà đó chính xác là tư thế mà note này muốn chấm dứt. Cả hai đều được render trong khu vực gấp lại, sát ngay cạnh endpoint, giao thức đọc từ cùng một schema. Xóa trắng tên tức là hủy thiết lập, và route sẽ rơi về lớp bên dưới lớp mà trường đó đang chỉnh sửa — `cordis.yml` có thể ghim một tên cho route mà danh mục chưa cung cấp, nên placeholder đọc lớp lắp ráp, chỉ khi không ai ghim tên thì mới báo route id. Giao thức không có phương án dự phòng để rơi về. Vì giờ một lần lưu có thể đổi tên, biên nhận lưu sẽ nêu tên route này theo danh mục đã được refresh, chứ không phải theo target đã chụp lúc card được mở. Route danh mục tích hợp sẵn không được cấp cả hai: tên của nó dựa vào mục nhập danh mục làm dự phòng, mỗi model của nó tự mang giao thức riêng, giao thức cấp route chỉ có thể ghi đè hết tất cả chúng.

**Provider ID** là trường duy nhất được giữ cố định trên card tạo mới, lý do không phải là chưa làm control cho nó. Nó là key từ điển `providers.<route>`, nên sửa nó là một lần di chuyển chứ không phải một lần chỉnh sửa, mà editor lại được định địa chỉ đúng bằng `settingsPath` mà lần di chuyển đó sẽ làm mất hiệu lực. Nó còn được tham chiếu bên ngoài namespace này — `agent-default-model` lưu một chuỗi `provider`, mỗi `request/header` trong từng session log cũng đã ghi lại một chuỗi như vậy — nên việc đổi tên sẽ âm thầm rút ruột những tham chiếu mà trang này không nhìn thấy được. Nó đồng thời là gốc từ để dẫn xuất tham chiếu credential: trang có thể ghi key nhưng không bao giờ đọc lại được, nên không thể chuyển `OLD_API_KEY` sang `NEW_API_KEY`, việc đổi tên sẽ hoặc là khiến key đã lưu trở thành mồ côi, hoặc khiến profile trỏ tới một tham chiếu vẫn còn mang tên cũ. Khai báo route mới rồi xóa route cũ thực hiện tường minh cả ba việc này, mà trang vốn dĩ đã cung cấp sẵn hai nửa đó.

## Alternatives considered

**Thêm trường vào `ProviderEditor` để khai báo provider.** Hai card trở thành một, nhưng editor được định địa chỉ bằng `settingsPath`, mà route đang được đặt tên thì chưa có path. Tính lại path theo từng phím gõ sẽ khiến card bị remount và mất bản nháp; hoãn việc tính toán lại có nghĩa là toàn bộ đường ghi của editor không còn mô tả đúng thứ nó đang chỉnh sửa.

**Thêm một trường giao thức riêng cho danh sách giao thức.** Tường minh. Nhưng settings schema vốn dĩ đã vượt qua tầng giao thức, vốn dĩ đã chứa union đó, nên bản sao thứ hai có thể không nhất quán với bản đầu tiên — mà adapter cưỡng chế thực thi đúng bản schema đó.

**Mở cho chỉnh sửa Provider ID, để trang tự hoàn thành lần di chuyển này.** Card có thể hủy key cũ và thiết lập profile mới trong cùng một lần `settings.mutate`, phần còn lại chỉ là đổi tên. Nhưng credential không thể đi theo — trang chỉ nắm trong tay descriptor đã ẩn đi (redacted), không bao giờ có giá trị thực — và tham chiếu trong namespace khác cũng như trong session đã ghi lại hoàn toàn không có đường đổi tên nào, nên phiên bản trung thực của tính năng này chính là "tạo mới trước rồi xóa sau" mà trang đã có sẵn.

**Cung cấp giao thức cho mọi route pi-ai, kèm theo một tùy chọn "kế thừa".** Đối xứng với địa chỉ API ngay bên cạnh, và việc trỏ route danh mục tích hợp sẵn tới một gateway nói giao thức khác đúng là điều có người sẽ muốn. Nhưng hiện chưa có consumer nào đưa ra nhu cầu này, một lần chọn sai sẽ âm thầm trỏ lại mọi model trên route đó, còn tùy chọn "kế thừa" sẽ trở thành con đường duy nhất để viết một route đã khai báo thành một profile mà adapter từ chối. Việc triển khai thực sự muốn làm vậy vẫn có thể biểu đạt bằng `settings.yaml`.

**Khởi tạo fetch dựa trên profile đã lưu thay vì form thời gian thực.** Với provider chưa được lưu, key sẽ không rời khỏi form. Nhưng luồng cần fetch nhất chính là luồng "chưa lưu gì cả", và form đã sửa endpoint sẽ âm thầm dò hỏi địa chỉ cũ.

**Ghi thẳng ứng viên đã chấp nhận vào danh sách.** Ít click hơn, nhưng một lần fetch sẽ ghi đè dung lượng người dùng đã sửa lại, còn danh sách chỉ công bố id sẽ thay số liệu thật bằng ô trống.

## Consequences

Gateway, service tự dựng, hoặc model mới hơn catalog đã cài đặt, giờ đây có thể cấu hình mà không cần rời khỏi trình duyệt, và model id do chính endpoint cung cấp khi endpoint có thể cung cấp được. Trang có thêm hai component và một list editor dùng chung; khu vực gấp lại pi-ai của card chỉnh sửa đã lớn lên từ hai trường thành một danh sách, route đã khai báo còn có thêm một ô nhập tên và một hộp chọn giao thức.

Cái giá phải trả: chỉ có route pi-ai mới có thể khai báo thủ công, vì `llm-pi-ai` là namespace duy nhất có profile mô tả toàn bộ provider — route `llm-deepseek` vẫn là sự thật thuộc mặt lắp ráp. Việc dò hỏi chỉ bao phủ endpoint tương thích OpenAI, nên gateway nói giao thức khác sẽ tự báo cáo là không thể dò hỏi được, model của nó cần gõ tay. Ngoài ra, trang sẽ lưu key trong state của component trong lúc fetch, điều này giống hệt mặt phơi bày mà `credentials.set` đã có sẵn, và không tồn tại lâu hơn thời gian sống của card.

## Testing

`packages/client/ui-settings-models/tests/provider-form.client.spec.tsx` điều khiển trang đã render trên nền một mặt giao thức được scripted: thêm, sửa và xóa dòng; trường tùy chọn bị xóa trắng sẽ rời khỏi profile, dung lượng không phải số nguyên không bao giờ được nhập vào; việc dò hỏi mang theo endpoint đã sửa, key chưa lưu, và giao thức riêng của profile; việc chọn mặc định của hộp lựa chọn, bật/tắt tick, hủy, và "chấp nhận vẫn giữ lại dòng đã tinh chỉnh"; ba đường danh sách rỗng, bị từ chối, transport bị từ chối; việc tạo mới ghi một profile cộng với credential của nó; mỗi lớp khóa trên nút tạo; và tư thế chỉ đọc. `protocolChoices` được bao phủ cho cả hai loại schema "đã khai báo union đó" và "chưa khai báo". Style gate đọc mã nguồn của chính package này, bất kỳ `<select>` nào chỉ lấy `.input` mà không lấy `.selectInput` đều thất bại — nếu không mũi tên hệ thống mà nó giữ lại sẽ dính sát vào cạnh phải của giới hạn 240px mà `select.input` đặt ra. Danh sách trường riêng của editor có assertion khác nhau theo từng loại route — route danh mục tích hợp sẵn dừng ở key và endpoint, route đã khai báo còn kèm theo giao thức — đồng thời bao phủ việc thay đổi giao thức chỉ truyền ra đúng một path op `api`, đổi tên chỉ truyền ra đúng một path op `displayName`, xóa trắng tên là hủy thiết lập chứ không phải lưu vào một chuỗi rỗng mà adapter sẽ từ chối, và profile đã khai báo không ghi giao thức thì không chọn gì cả, chứ không chọn ứng viên đầu tiên. `apps/web/tests/models-settings.e2e.ts` mở lại route đã khai báo này qua tầng giao thức thật, chụp lại card đó, và khẳng định giao thức đã chọn cùng tên mới đều đã tới `settings.yaml`, dòng đó cũng được đăng ký lại với tên mới.
