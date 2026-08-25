# Agent Note: Giá trị trả về của công cụ có kiểu (typed) trong Code Mode

Status: implemented

[English](2026-07-20-code-mode-typed-tool-returns.md) | Tiếng Việt

## Vấn đề

Trước đây, Code Mode chiếu lại (re-project) kết quả của mỗi công cụ được gọi lồng thành một chuỗi ký tự từ `ContentBlock[]`. Cách này tuy giữ được phần hiển thị Native phù hợp cho con người đọc, nhưng lại làm mất kết quả chuẩn (canonical) mà công cụ đã tạo ra: chương trình chỉ có thể trích job id và id mount động từ ngôn ngữ tự nhiên; kết quả tìm kiếm có cấu trúc và kết quả workflow mất hình thái gốc; còn các khối phi văn bản thì trở thành placeholder. SDK được sinh ra có thể mô tả tham số, nhưng bất kể đầu ra thực tế của công cụ là gì, nó chỉ có thể cam kết `Promise<string>`.

Runtime còn coi giá trị đã bind và giá trị trả về cuối cùng của chương trình như dữ liệu trình diễn (display data). Log và giá trị hoàn tất (completion value) có giới hạn riêng biệt, khiến giá trị hoàn tất quá lớn hoặc không thể clone có thể bị thay thế bằng văn bản đã được kiểm duyệt sinh ra sau đó, trong khi giá trị trung gian vốn dĩ không bao giờ đi vào ngữ cảnh mô hình. Thiết kế này khiến việc kết hợp mang tính lập trình (programmatic composition) bị mất thông tin, đồng thời làm nhòe ranh giới giữa bộ nhớ và ranh giới prompt.

[Quy ước đầu ra công cụ chuẩn (canonical)](../architecture/2026-07-20-canonical-tool-output-contract.md) đã thiết lập một giá trị thời gian thực thi (execution-time) duy nhất, đã được xác thực, và tách nó khỏi bộ render Native. Code Mode nên tiêu thụ trực tiếp giá trị đó, giữ nguyên vẹn nó khi vượt qua ranh giới worker, và chỉ giới hạn đầu ra cuối cùng mà chương trình chủ động trả về cho mô hình.

## Quyết định

Code Mode là một phép chiếu có kiểu (typed projection) của registry công cụ hiển thị được. Mỗi lệnh gọi bind thành công sẽ được phân giải thành `JsonValue` chuẩn cuối cùng, sau khi đã qua xử lý của chính sách post-execute; lệnh gọi bind thất bại sẽ từ chối Promise bằng một `ToolCallError` thật. Giá trị trung gian chỉ tồn tại trong lần chạy này và vượt ranh giới worker một cách nguyên vẹn. Log, giá trị hoàn tất, hoặc chẩn đoán lỗi của `run_code` ở tầng ngoài sẽ đi vào sổ cái đầu ra (output ledger) có thể cấu hình cùng đường ống ghi đầu ra ra đĩa dành cho mô hình; nếu một lệnh gọi con đã chốt kết quả thành công có nội dung Native cuối cùng chứa ảnh, toàn bộ nội dung có thứ tự của nó sẽ được chuyển tiếp muộn qua kết quả của cha để trở thành ngữ cảnh đã ghi log và có gắn nguồn gốc (source attribution).

Tài liệu này định nghĩa quy ước giá trị trả về và thất bại được xếp chồng lên trên [nền tảng Code Mode ban đầu](2026-06-15-code-mode.md). Từ vựng schema thống nhất do [Agent Note về DSL schema giá trị JSON](../architecture/2026-07-20-unified-json-value-schema-dsl.md) định nghĩa; việc render Native và chiếu chính sách vẫn do Agent Note về đầu ra chuẩn định nghĩa.

### SDK được sinh ra

Mỗi lần tổng hợp prompt, registry sẽ chiếu schema tham số của từng công cụ hiển thị được cùng schema đầu ra chuẩn tách biệt của nó thành một khai báo xác định:

```ts ignore-check
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

interface ToolArgsMap {
  // one exact inferred entry per visible tool
}

interface ToolOutputMap {
  // one exact inferred entry per visible tool
}

type ToolName = keyof ToolOutputMap

declare class ToolCallError extends Error {
  readonly name: 'ToolCallError'
  readonly toolName: ToolName
}

declare const tools: {
  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>
}
```

`jsonSchemaToTs()` bao phủ mọi node mà schema thống nhất hỗ trợ: object, array, string, number, integer, boolean, null, JSON không ràng buộc, `enum`/`const` vô hướng, và `oneOf`. Trong lúc sinh prompt, cấu trúc gốc không được hỗ trợ sẽ lùi về `unknown`, thay vì làm quá trình tổng hợp thất bại. Tên công cụ giữ nguyên khóa chính xác, kể cả những tên bắt buộc phải truy cập bằng dấu ngoặc kép.

### Giá trị đã bind và thất bại

Trước khi phân phát, lớp cầu nối (bridge) sẽ chụp nhanh (snapshot) tham số đã bind thành JSON không mất mát, rồi tạo thêm một snapshot cho giá trị đã tách biệt để dùng cho sự kiện tóm tắt bền vững độc lập. Việc tách giá trị phía host, xử lý bất biến dữ liệu thực thi, và chiếu schema đầu ra đều dùng duyệt lặp (iterative traversal), không dùng structured clone lồng nhau hay đóng băng đệ quy. `undefined`, số không hữu hạn, `-0`, mảng thưa (sparse array), tham chiếu vòng, hàm, và object không thuần túy sẽ khiến lệnh gọi đó bị từ chối trước khi công cụ chạy. Việc phân phát thành công trả về `ToolExecutionResult.value`; `content` Native, metadata và thông tin lỗi nội bộ không được truyền vào chương trình. Nội dung cuối cùng có chứa ảnh không phải là bản sao thứ hai của giá trị đã bind: lớp cầu nối sẽ chuyển tiếp nó sau kết quả tầng ngoài, để yêu cầu mô hình tiếp theo có thể thấy ảnh bền vững; việc chặn hoặc thay thế nội dung của post-execute vẫn có tính quyết định, kết quả văn bản thuần túy không bị lặp lại.

Code Mode khai báo khả năng từ chối Promise bằng ngoại lệ của mình thông qua `{ name: "ToolCallError", memberNameProperty: "toolName" }` trong yêu cầu runtime. Service Definition của runtime chỉ coi các tên này là dữ liệu: worker sẽ sinh động (dynamically generate) và inject constructor thật sự dùng để xử lý thất bại của binding `tools`, nên không cần runtime tổng quát phải hiểu về công cụ, và `error instanceof ToolCallError` vẫn đúng. Worker dùng constructor `Error` và các phương thức built-in về property definition đã được chụp lại từ lúc khởi tạo module, kết hợp property descriptor với prototype null, để dựng object lỗi và định nghĩa các field công khai của nó, nên việc mô hình sửa code không thể biến việc reject theo quy ước thành lỗi worker. Lỗi này bao gồm message `Error` chuẩn và `toolName` chính xác, đồng thời cố ý bỏ qua `ToolFailure.info`, mã lỗi và nội dung Native. Đây là một quy ước ngoại lệ dùng cho control flow, chứ không phải một union lỗi để chương trình phân loại.

Tham số đã bind và giá trị trả về đã bind sẽ được xác thực lại thành JSON không mất mát ở cả hai đầu của giao thức worker không tin cậy, không đặt giới hạn byte. Mỗi giá trị đã tách biệt sẽ được mã hóa thành một luồng token tiền tố (pre-order) phẳng có độ sâu lồng giới hạn trong cấu trúc truyền tải, trước khi được structured clone qua ranh giới; bên nhận sẽ dựng lại giá trị đó bằng cách lặp. Do đó, độ sâu lồng của dữ liệu ứng dụng hợp lệ không bị giới hạn bởi giới hạn độ sâu call stack của JavaScript, cũng không bị giới hạn nền tảng cụ thể đối với structured clone lồng nhau. Khi khởi tạo module, worker sẽ chụp tham chiếu tới `Array.prototype` và `Object.prototype` trong chính domain thực thi JavaScript của nó, chỉ dùng để nhận diện prototype container thuần túy của các domain khác, các hàm built-in có thể lấy source code gốc, và toàn bộ phương thức built-in mà ranh giới JSON dùng để xử lý cấu trúc và đo lường. Việc ghi thuộc tính dùng property descriptor với prototype null; các thao tác mảng và tập hợp nội bộ gọi trực tiếp các phương thức đã chụp, không truy cập slot toàn cục hay prototype có thể thay đổi. Do đó, dù mô hình sửa code có thay `Object.keys`, `Array.isArray`, các phương thức tập hợp, phương thức chuỗi, hay các hàm trợ giúp như `Buffer.byteLength`, ghi đè slot constructor của prototype built-in, hoặc thêm field dạng property descriptor vào `Object.prototype`, thì việc xác thực, truyền giao thức hay đo byte cũng không thay đổi. Việc kiểm tra source code hàm gốc nhắm vào các domain khác vẫn từ chối các constructor do người dùng viết giả mạo `Object` hoặc `Array`. Để giữ phụ thuộc gọn nhẹ, Service Definition của runtime đặt tên kiểu tương đương về cấu trúc là `CodeJsonValue`, nhờ đó không cần phụ thuộc vào kiểu chuẩn do phía phiên (session) sở hữu; SDK và API công cụ được sinh ra thì dùng `JsonValue`. Những giá trị này không đi qua việc cắt bớt prompt, spill ngữ cảnh, hay lưu bền vững. Do đó, chương trình có thể lọc đầy đủ các giá trị tìm kiếm, workflow, task, filesystem và MCP đã thu thập được, trong khi giới hạn thu thập của bên cung cấp và executor vẫn có hiệu lực thực tế.

### Kết quả tầng ngoài và sổ cái đầu ra

Runtime chấp nhận giá trị hoàn tất chính xác, không mất mát, với gốc là bất kỳ kiểu JSON nào. Trả về `undefined` nghĩa là bỏ qua giá trị hoàn tất; trả về `null` là một kết quả tường minh. `run_code` phơi bày giá trị tầng ngoài chuẩn `{ logs: string[], result?: JsonValue }`. Bộ render Native của nó xuất log trước; kết quả dạng chuỗi giữ nguyên văn, mọi giá trị gốc JSON khác dùng bộ render pretty-print theo kiểu lặp. Tổng độ dài thụt lề giới hạn ở 10 ký tự, các cây con sâu hơn giữ định dạng gọn, vừa giữ được văn bản nông hiện có, vừa đảm bảo việc duyệt không bị giới hạn bởi độ sâu call stack, và kích thước đầu ra đã định dạng tỉ lệ tuyến tính với kích thước JSON chuẩn.

`WorkerThreadCodeRuntime` thay giới hạn log và giá trị độc lập nhau bằng `maxOutputBytes` có thể cấu hình, mặc định là `67_108_864` byte. Worker tính vào sổ cái số byte chính xác của log đã thu thập sau khi serialize thành chuỗi JSON, và trước khi gửi thông điệp trạng thái cuối, sẽ kiểm tra trước (precheck) giá trị hoàn tất đã tách biệt hoặc ngoại lệ của chương trình dựa trên hạn mức còn lại của sổ cái kết hợp. Do đó, dù chuỗi hoặc stack bị ném ra có cực lớn, thứ đi qua cổng worker cũng chỉ là chẩn đoán `output-limit` cố định. Phía host lặp lại bộ xác thực sổ cái này dành cho đối tác không tin cậy, nhằm đối phó với luồng dữ liệu giả mạo và việc ghi vào pipe gốc mà worker không thể quan sát được. Tên field cố định của `CodeRunResult`, dấu ngoặc nhọn, nhãn kiểu lỗi có giới hạn, và khoảng trắng hiển thị theo sau đều cố ý không tính vào sổ cái tải trọng biến đổi này. Cả hai giai đoạn đều không thực sự sinh ra kết quả serialize của giá trị hoàn tất vượt quá giới hạn. Kết quả không vượt giới hạn sẽ giữ nguyên chính xác. Khi giá trị hoàn tất không thể chụp snapshot dưới dạng JSON không mất mát, sẽ thất bại với `invalid-output`; khi giá trị, chẩn đoán, hoặc kết quả kết hợp có log vượt giới hạn, sẽ thất bại với `output-limit`, chứ không biến thành văn bản đã kiểm duyệt định dạng hay bị cắt bớt.

Log sẽ được chảy ra (stream out) ngay khi tạo ra, nên khi việc chạy bị chấm dứt, đầu ra đã tính vào hạn mức vẫn được giữ lại. Việc ghi native stdout và stderr, vòng qua entry point ghi luồng đã bị ghi đè trong worker, sẽ đi qua các pipe độc lập, nên runtime vẫn tiếp tục thu thập đầu ra trong giới hạn suốt giai đoạn chốt kết quả cuối, cho đến khi worker chấm dứt hoàn toàn, rồi mới lắp ráp kết quả. Khi vượt giới hạn, runtime sẽ trả về một thất bại có giới hạn tường minh, kèm theo phần tiền tố đã thu thập có thể chứa được. Kết quả tầng ngoài này sau đó đi qua bộ render `run_code` và chính sách spill thông thường; chính sách có thể lưu văn bản đã thu thập, và phơi bày phần xem trước đầu/cuối theo cấu hình của nó. Tầng spill không thể khôi phục các byte mà runtime đã từ chối vượt ngoài giới hạn cứng.

Thời gian tính toán, thời gian đồng hồ treo tường, bộ nhớ heap của worker, việc hủy bỏ, và việc cô lập bằng cách dùng worker hoàn toàn mới cho mỗi lần chạy vẫn là các giới hạn độc lập với nhau. Sổ cái tầng ngoài không bao giờ tính vào giá trị trung gian đã bind, nên việc sinh snapshot, việc mã hóa/giải mã định dạng giao thức phẳng, chi phí structured clone, và bộ nhớ khả dụng của tiến trình hoặc worker mới là ranh giới thực tế cho các giá trị này.

### Handle có kiểu và vòng đời

Bên sản sinh nền (background) trả về handle chuẩn có kiểu, ví dụ `{ kind: 'background', jobId }`, đồng thời vẫn giữ câu Native hiện có. Lệnh gọi nền đã bị abort trước vẫn là thất bại, vì đầu ra thành công cam kết trả về id, nhưng lúc đó task chưa được tạo. Sau khi `ctx.jobs.start()` phát hành id, công việc được điều khiển bởi cơ chế hủy riêng của task: lệnh gọi `run_code` bên ngoài hoàn tất, hoặc sau đó bị hủy, đều không chấm dứt task đó. Chương trình về sau có thể truyền id trả về cho `job_output`; việc hủy task do `job_kill`, dispose (giải phóng) của chủ sở hữu, hoặc quy trình teardown dịch vụ đảm nhiệm. Việc thực thi ở foreground vẫn gắn liền với tín hiệu của lệnh gọi hiện tại. Quy ước vòng đời task do [Agent Note về runtime task nền tổng quát](../architecture/2026-06-20-generic-long-running-tool-runtime.md) định nghĩa.

Plugin Cordis tạm thời tuân theo cùng quy tắc: `cordis_mount` trả về `{ id, pluginName, state, provides, waitingFor }`, nên chương trình có thể đọc trực tiếp `mounted.id`, kiểm tra trạng thái active hay pending, và truyền id đó cho `cordis_unmount`, không cần parse câu Native ổn định.

### Lưu bền vững, metadata và spill

Việc phân phát lồng ghi lại `content`/`isError` đã render đầy đủ của lệnh gọi con tại `tool/code-dispatch`, nhưng không lưu bền vững giá trị chuẩn. `tool/result` tiếp tục chỉ lưu bền vững nội dung đã render, lỗi và metadata tùy chọn. Chuỗi nội dung cuối thành công có chứa ảnh sẽ được bọc thành tin nhắn người dùng có gắn nguồn gốc và chuyển tiếp muộn qua kết quả tầng ngoài; sự kiện phiên thông thường giúp đầu vào mà mô hình nhìn thấy có thể được dựng lại. `SESSION_FORMAT_VERSION` không đổi (thay đổi hình thái ở giai đoạn tiền phát hành không tăng số phiên bản), và replay cũng không thể dựng lại giá trị trung gian chuẩn của chương trình.

Token `exec.parent` không minh bạch (opaque) dùng để định danh lệnh gọi lồng. Vì các lệnh gọi này không có thẻ kết quả tương ứng trực tiếp, và giá trị chuẩn của chúng không bao giờ đi vào ngữ cảnh, metadata hiển thị cũng như chiếu spill tổng quát hay riêng của công cụ đều bỏ qua chúng. Chỉ lệnh gọi `run_code` tầng ngoài mới sinh ra một thẻ, và có thể thực hiện spill trên phần hiển thị cuối cùng sau khi qua chính sách; `run_code` cố ý không khai báo bộ hiển thị kết quả lẫn metadata hiển thị, nên adapter UI sẽ dùng cơ chế fallback nội dung gốc tổng quát để bổ sung thẻ đó bằng `tool/result.content` đã lưu bền vững.

## Kiểm thử

Test biên dịch và test snapshot cố định chính xác `ToolArgsMap`, `ToolOutputMap`, `ToolName`, độ bao phủ khi chuyển schema sang TypeScript, tên đặc biệt, và việc chuyển tiếp ảnh Code Mode sau khi tổng hợp. Test registry và test worker thật bao phủ giá trị vô hướng, mảng, object và null; render nguyên văn chuỗi; `undefined` khi vắng mặt; lớp ngoại lệ do bên tiêu thụ khai báo và thực sự dùng để từ chối Promise, bao gồm `ToolCallError`; tham số và giá trị hoàn tất không hợp lệ, bao gồm prototype giả mạo built-in; các global object của ranh giới JSON, phương thức prototype, slot constructor, và field property descriptor kế thừa mà mô hình sinh code sửa đổi; thất bại binding có kiểu sau các sửa đổi trên; giá trị trung gian đã bind lớn không giới hạn; ngăn chặn ghi đầu ra lồng ra đĩa; việc chuyển tiếp muộn ngữ cảnh chứa ảnh tổng quát cùng ưu tiên thay thế/chặn của post-execute; đo lường chính xác trong và ngoài giới hạn 64 MiB; đo kết hợp log, giá trị và chẩn đoán; stack quá lớn bị ném ra; ghi đầu ra ra đĩa của thất bại có giới hạn; luồng dữ liệu giả mạo từ đối tác không tin cậy; và việc thực thi gói đã build.

Test tích hợp worker thật không cần khóa (keyless) cố định hai luồng công việc dùng handle mà kết quả ngôn ngữ tự nhiên không thể hỗ trợ an toàn. Lệnh gọi bash nền trả về job id, lần chạy tầng ngoài kết thúc, sau đó lần chạy tiếp theo poll dựa trên id đó cho tới khi task hoàn tất; các use case khác lần lượt chứng minh việc abort trước không tạo task, việc hủy lệnh gọi sau khi đã phát hành id vẫn giữ task lại, việc thực thi foreground vẫn gắn với tín hiệu, và `job_kill` chịu trách nhiệm hủy. Chương trình Cordis đọc trực tiếp id và field `waitingFor` của mount đang active hoặc pending, gỡ mount theo id đó, và xác nhận mount đã bị gỡ mà không cần parse văn bản đã render.

## Các phương án thay thế đã cân nhắc

**Trả về văn bản Native kèm JSON tùy chọn:** không chọn. Chương trình sẽ đối mặt với hai quy ước thành công cạnh tranh nhau; khi giá trị tùy chọn không tồn tại, vẫn cần dùng quy tắc parse riêng của từng công cụ. Giá trị chuẩn mới là API; nội dung Native chỉ là phần hiển thị của nó.

**Để mỗi binding trả về union thành công/thất bại:** không chọn. Thất bại không có hệ thống phân loại lập trình ổn định. Reject giữ control flow `try`/`catch` thông thường, và chỉ phơi bày tên công cụ cùng thông điệp dễ đọc cho con người.

**Giới hạn từng giá trị trung gian đã bind:** không chọn. Giá trị trung gian không đi vào ngữ cảnh mô hình, việc cắt bớt tùy tiện sẽ phá vỡ việc kết hợp mang tính lập trình. Ranh giới rõ ràng vẫn là quy ước thu thập của bên sản sinh và bộ nhớ tiến trình.

**Âm thầm kiểm duyệt định dạng hoặc cắt bớt giá trị hoàn tất quá lớn:** không chọn. Biến giá trị JSON thành chuỗi vừa mất mát vừa vi phạm kiểu. Thất bại `output-limit` tường minh cho phép mô hình chọn trả về kết quả nhỏ hơn, trong khi log và chẩn đoán được giữ lại vẫn có thể dùng cơ chế spill tầng ngoài thông thường.

**Yêu cầu mỗi công cụ lá giàu nội dung tự kiểm tra `exec.parent` và tự chuyển tiếp muộn.** Không chọn, vì điều này sẽ gắn chặt công cụ lá với cơ chế nội bộ của Code Mode, xử lý chính sách lặp lại, và bỏ sót các công cụ giàu nội dung trong tương lai. Lớp cầu nối phân phát chịu trách nhiệm chuyển tiếp tổng quát từ kết quả cuối đã chốt.

**Phơi bày nội dung giàu (rich) Native như một phần của giá trị chuẩn cho mỗi binding.** Không chọn, vì giá trị chuẩn là JSON không mất mát và do công cụ định nghĩa; khối đính kèm là phép chiếu của mô hình với ngữ nghĩa vòng đời bền vững. Giữ giá trị và phép chiếu tách biệt vừa bảo toàn chương trình có kiểu, vừa không làm mất ảnh khỏi ngữ cảnh mô hình về sau.

## Hệ quả

Chương trình Code Mode có thể kết hợp công cụ qua giá trị ổn định, không cần parse ngược ngôn ngữ tự nhiên Native. Native và Both Mode giữ nguyên phần hiển thị văn bản và UI hiện có, còn Code Mode có được kiểu schema đầu ra và JSON runtime chính xác. Tác giả công cụ phải coi giá trị chuẩn là API lập trình, và đưa việc định dạng chỉ dùng để hiển thị vào bộ render.

Worker truyền dữ liệu bằng định dạng giao thức phẳng có độ sâu lồng giới hạn và thực hiện xác thực không mất mát, nhưng không giảm chi phí của giá trị trung gian, cũng không làm nó trở nên bền vững. Việc tràn đầu ra tầng ngoài sẽ khiến việc chạy thất bại một cách tường minh, và việc xử lý lỗi cố ý được con người dẫn dắt, thay vì dựa vào một union mã lỗi có phiên bản.

## Giới hạn đã biết và các việc hoãn lại

- Dù đầu ra công cụ có thể dùng gốc JSON bất kỳ, đầu ra có cấu trúc do bên gọi định nghĩa trong subagent và workflow vẫn giữ giới hạn gốc là object thông qua cổng ở cấp bên tiêu thụ.
- Post-execute cung cấp riêng biệt phép chiếu giá trị và phép chiếu hiển thị; nội dung thay thế không phải là cơ chế bảo mật, nên nếu chính sách cần giấu nội dung khỏi bên gọi lập trình, nó phải chặn lệnh gọi hoặc thay thế giá trị.
- Giá trị chuẩn trung gian chỉ tồn tại trong khi thực thi, không thể dùng cho replay, vì sự kiện bền vững chỉ lưu phần hiển thị và tóm tắt có giới hạn.
- Giá trị trung gian không có giới hạn byte, có thể làm cạn bộ nhớ tiến trình hoặc worker do việc giữ lại giá trị, bản sao định dạng giao thức phẳng, hoặc chi phí structured clone.
- Giới hạn cứng 64 MiB chỉ áp dụng cho tải trọng biến đổi tầng ngoài, không tính cú pháp bọc kết quả cố định và khoảng trắng hiển thị; spill không thể khôi phục các byte bị từ chối vượt giới hạn đó.
- Giới hạn thu thập của bên cung cấp hoặc executor có thể đã loại bỏ một phần dữ liệu nguồn trước khi giá trị chuẩn đến được Code Mode.
- Schema đầu ra MCP không được hỗ trợ sẽ lùi về `JsonValue`; ảnh MCP đã được chấp nhận dùng phép chiếu chuyển tiếp muộn tổng quát, còn tải trọng audio và embedded resource vẫn chỉ có chẩn đoán.
- Mỗi lệnh gọi `run_code` tầng ngoài chỉ có một thẻ kết quả, các lệnh gọi lồng không tự sinh thẻ riêng.
- Thất bại của Code Mode chỉ phơi bày message và tên công cụ của `ToolCallError`, không cung cấp union mã lỗi để chương trình dùng.
