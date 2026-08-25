# @deepseek-ai/dsh-compaction

[English](README.md) | Tiếng Việt

**`CompactionEngine`** (`ctx.compaction`) định nghĩa compaction (nén) làm gì, tức là xác định lịch sử có quá lớn hay không, và tóm tắt một khoảng trước đó thành một node surface duy nhất, nhưng không quy định cách thực hiện.

Package này đảm nhận vai trò Service Definition của năng lực compaction, nhờ đó mỗi vai trò có thể tiến hóa độc lập, cũng có thể thay thế độc lập:

| Package | Trách nhiệm |
|---|---|
| `@deepseek-ai/dsh-compaction` (package này) | Service Definition: dịch vụ trừu tượng + sự kiện `compaction/*` + `CompactionResult` + hàm khởi tạo nguồn checkpoint liên kết + helper ranh giới cặp công cụ |
| `@deepseek-ai/dsh-compaction-basic` | Service Provider: áp lực `ctx.tokenMeter` + dự trữ ngân sách token + tóm tắt `llm.stream()` |
| `@deepseek-ai/dsh-command-compact` | Consumer: lệnh `/compact` hướng tới con người, được triển khai dựa trên `ctx.compaction.compactNow()` |

Không giống seam bash, Service Definition này phụ thuộc vào `@deepseek-ai/dsh-session` và `@deepseek-ai/dsh-llm`. Các động từ trong quy ước dựa trên định nghĩa `Session`, đầu ra của nó dùng từ vựng `ContentBlock`, do đó không thể diễn đạt mà không nêu tên các package này. Sự đi chệch có chủ đích khỏi chỉ dẫn "Service Definition chỉ phụ thuộc cordis" này được ghi lại trong [Agent Note về capability seam của compaction](../../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md).

## API dịch vụ (`ctx.compaction`)

Cả ba thao tác đều là **phương thức trừu tượng**: chiến lược kích hoạt, giữ lại, thứ tự sự kiện và tóm tắt đều thuộc về backend. Việc đo lường request có thể tái sử dụng là dịch vụ độc lập [`ctx.tokenMeter`](../../llm/token-meter/README.md), không phải một phần của Service Definition này.

| Thành viên | Ngữ nghĩa |
|---|---|
| `compactIfNeeded(agent, trigger, signal)` | Xác định có cần compaction tự động hay không dựa trên `trigger: 'pressure' \| 'context-overflow'`. Kích hoạt do áp lực có thể áp dụng ngưỡng và chính sách giữ lại đuôi của backend; tràn đã xác nhận có thể buộc thực hiện thu nhỏ cân bằng hiệu quả. Trả về `CompactionResult`, hoặc `null` nếu không có phạm vi an toàn. Request tóm tắt của backend là một lệnh gọi `ctx.llm.stream()` trực tiếp (không phải một step của agent loop), do đó mỗi lệnh gọi đều có thể bị chặn tại `llm/stream`. |
| `compactNow(agent, signal)` | Compaction tường minh một khoảng trước đó hợp lệ, cân bằng, ngay cả khi chưa đạt áp lực tự động. Thao tác này sẽ đồng bộ dự trữ chỗ tiếp nhận lượt rảnh rỗi trước khi nhường quyền điều khiển; không ghi gì nếu không có phạm vi hợp lệ; ghi lại một lần thử `compaction/* { turn: null }` độc lập trước khi tóm tắt; chờ checkpoint bền vững của nó trước khi giải phóng dự trữ. Lỗi thao tác dự kiến dùng `ManualCompactionError`; việc hủy sẽ ném lại nguyên trạng lý do abort. |
| `compactRegion(start, end, agent, signal?)` | Buộc tóm tắt các node surface `[start, end]` (bao gồm cả hai đầu, theo seq) từ `agent.session` thành một node thay thế duy nhất, nguồn của nó được tạo bởi `compactCheckpointSource(compactionId)`. **Ném ngoại lệ** nếu compaction đang diễn ra, `start`/`end` không phải node surface, hoặc `start` nằm sau `end` trên surface. Phạm vi này là phạm vi vị trí surface, không phải khoảng seq số học: khi một lần replace trước đó đặt node tóm tắt seq cao mới sinh vào vị trí sau phạm vi đã bị che khuất, thứ tự surface không còn theo thứ tự seq nữa. |

`CompactionResult` giữ lại cho bên gọi bản tóm tắt gốc và seq sự kiện ghi lại quá trình thao tác, đồng thời giữ phạm vi bị che khuất và số đo token; cấu trúc của nó được bảo vệ bởi kiểm tra drift, định nghĩa xem tại [Tài liệu tham khảo cấu trúc dữ liệu compaction](../../../docs/subsystems/compaction.md#compactionresult).

`compactIfNeeded` và `compactNow` bắt buộc phải truyền `signal`; tham số này của `compactRegion` là tùy chọn. Backend tóm tắt thông qua `ctx.llm.stream()` **bắt buộc** phải chuyển tiếp nó tới `GenerateOptions.signal` của lệnh gọi, do đó abort hoặc fiber dispose (giải phóng tài nguyên) sẽ dừng việc tóm tắt đang diễn ra. Cặp nhãn tự động và phạm vi tường minh sẽ khôi phục quyền sở hữu dạng số từ lượt đang mở hiện tại. Cặp nhãn thủ công không yêu cầu tồn tại lượt đang mở, và đánh dấu `turn: null`.

`ManualCompactionError.code` là tập hợp đóng `busy | changed | summary | commit | persistence`. `changed` và `summary` cho biết surface phiên đã chọn chưa bị thay thế, nhưng log vẫn ghi lại lần thử thất bại. `commit` cố ý không xác định có xảy ra thay đổi một phần hay không; `persistence` cho biết bracket trong bộ nhớ đã đóng, nhưng flush tường minh thất bại.

## Ranh giới cặp công cụ

Service Definition này xuất `toolPairingBalancedBefore(session, seq)` và `toolPairingBalancedAfter(session, seq)`, dùng để căn chỉnh và xác thực ranh giới compaction. Ranh giới an toàn sẽ không bao giờ vượt qua một tool call của assistant chưa được trả lời. Mỗi helper sẽ xác thực seq sự kiện đã cho nằm trên surface hiện tại, và trả về kết quả dựa trên trạng thái cặp của từng điểm cắt được cache theo thứ tự surface.

Cache riêng của mỗi phiên dùng `session.surface.replaceGeneration` và số mục surface đã xử lý làm key. Khi generation không đổi, chỉ cần đưa các mục đuôi chưa xử lý vào kết quả tích lũy; nếu chỉ thêm vào log mà không thêm mục surface mới, sẽ không đọc sự kiện. Khi replace generation thay đổi thì sẽ xây dựng lại quan hệ thành viên hiện tại và trạng thái cặp. Seq sự kiện bị thiếu, cũng như `tool/result` không có lệnh gọi chưa đóng trước đó tương ứng, đều bị coi là trạng thái surface bị hỏng và bị từ chối.

## Quy ước surface

`SurfaceEventType` là hợp đóng: chỉ `user/message`, `assistant/message` và `tool/result` mới có thể mang `surfaceOp`. Do đó sự kiện `compaction/*` **không thể** xuất hiện trên surface. Thay vào đó, compaction thành công sẽ:

1. Thêm `compaction/start` (chỉ log): giành khóa;
2. Tóm tắt phạm vi đó;
3. Thêm `compaction/summary` (chỉ log), ghi lại bản tóm tắt, phạm vi, seq bị che khuất, số token và envelope lệnh gọi nhà cung cấp/mô hình;
4. Thêm một `user/message` duy nhất, mang `source: compactCheckpointSource(compactionId, sourceCommandId?)` và `surfaceOp: { op: 'replace', start, end }` chứa bản tóm tắt: đây là **thay đổi surface duy nhất** của thao tác này;
5. Thêm `compaction/end` (chỉ log): giải phóng khóa.

Thay đổi surface (bước 4) nằm **bên trong** phạm vi bắt đầu-kết thúc của khóa: `compaction/end` là sự kiện cuối cùng, do đó khóa sẽ không bao giờ được giải phóng trước khi thay đổi surface được ghi nhận. Nếu xảy ra crash giữa `compaction/start` và `compaction/end`, sẽ để lại một khóa còn sót có thể phát hiện được (một `compaction/start` không có `compaction/end` khớp), thay vì một `compaction/end` giả mạo tuyên bố compaction đã hoàn tất trong khi surface chưa từng bị che khuất.

Cặp nhãn này biểu thị thời điểm giành và giải phóng khóa, không phải một vùng chứa sự kiện độc quyền. Trong lúc chờ tóm tắt thủ công, `inject()` lúc rảnh rỗi có thể thêm ngữ cảnh không liên quan giữa start và end. Do đó, kiểm tra ổn định thủ công sẽ xác thực lại đúng span đã chọn, thay vì yêu cầu toàn bộ surface bằng nhau; việc thay thế vị trí sẽ giữ ngữ cảnh được inject đó hiển thị sau checkpoint. Compaction tự động thì yêu cầu toàn bộ surface trong lượt đang hoạt động của nó phải bằng nhau.

`deriveMessages()` sau đó sẽ render bản tóm tắt thành message vai trò user, theo sau là các node đã giữ lại. Sự kiện bị che khuất vẫn được giữ trong log gốc, do đó việc phát lại có tính xác định.

## Chặn

Compaction được tuần tự hóa bởi một khóa ghi log dùng chung cho mọi entry point. Kiểm tra đuôi sẽ tìm riêng biệt `compaction/start` chưa khớp cặp mới nhất và `session/end-seed` mới nhất. Start chưa khớp cặp nằm sau ranh giới đó là khóa đang hoạt động và báo `busy`; start chưa khớp cặp cũ hơn là bằng chứng lỗi thời từ vòng đời tiến trình trước, không chặn. Cùng một chuyển tiếp end-seed sẽ xóa trạng thái theo dõi phát lại của thành phần bất biến đi kèm. Cặp nhãn đang hoạt động không được vượt qua `turn/start` hoặc `turn/end`; khi tiếp quản phiên, nếu end-seed sau đó chứng minh cặp nhãn đang mở đã lỗi thời, ranh giới sửa chữa được kế thừa từ tiền tố vẫn có thể phát lại.

Khóa chính là cặp nhãn bền vững, không phải `WeakSet`, mutex lớp bọc, hay anchor phía client. `compaction/start` sẽ được thêm đồng bộ trước khi tóm tắt nhường quyền điều khiển. Sau đó, mỗi lỗi sẽ thử đúng một lần thêm `compaction/end { error }`; nếu bản thân việc thêm sự kiện đóng đó thất bại, start chưa khớp cặp sẽ tiếp tục đóng vai trò tín hiệu busy được giữ lại có chủ đích, và sẽ không thử flush. Lần thử thủ công đã đóng thành công, dù báo `changed` hay `summary`, vẫn sẽ flush, nhờ đó giữ lại bản ghi này trước khi giải phóng dự trữ tiếp nhận lượt.

## Sự kiện

Sự kiện `compaction/*` mở rộng `SessionEventMap` (bản đồ có thể gộp mở rộng) thông qua declaration merging: chúng là sự kiện phiên, không phải `Events` của cordis, và cả ba đều chỉ tồn tại trong log (không có `surfaceOp`). Payload và ngữ nghĩa từng sự kiện xem tại [Danh mục sự kiện log bền vững](../../../docs/persistence-catalog.md) đã được sinh ra.

## Triển khai backend

Kế thừa `CompactionEngine`, triển khai `compactIfNeeded`, `compactNow` và `compactRegion`, rồi nạp lớp con như một plugin: nó sẽ được đăng ký làm `ctx.compaction`. Mỗi backend thành công đều dùng `compactCheckpointSource(compactionId, sourceCommandId?)` để tạo nguồn cho message user thay thế; `compactionId` bắt buộc sẽ liên kết checkpoint với giao dịch `compaction/*` tương ứng, còn `isCompactCheckpointSource()` có thể nhận diện nhãn đó sau khi bền vững hóa hoặc clone, mà không cần dựa vào danh tính backend. Các triển khai dựa trên template hoặc mô hình có thể đặt trong package ngang hàng, không cần thay đổi bên gọi hay token meter dùng chung.

## Nhận diện checkpoint bên ngoài chương trình host (`./checkpoint`)

`compactCheckpointSource()`, `CompactionCheckpointSource` và `isCompactCheckpointSource()` được khai báo tại subpath `@deepseek-ai/dsh-compaction/checkpoint`, và được re-export từ gốc package, do đó bên tiêu thụ phía host vẫn đọc chúng từ gốc. Hàm khởi tạo yêu cầu truyền vào `CompactionId` sở hữu, ngăn backend ghi nhãn thiếu quan hệ liên kết mà chắc chắn sẽ bị bất biến của package từ chối. Lá này không import cordis, cũng không khai báo bất kỳ module augmentation nào (tức hình dạng của [`dsh-commands/brand`](../../interaction/commands/README.md)), và chính điều này là lý do khiến chương trình client hoặc wire có thể đặt tên nguồn checkpoint đó: **gốc** của package không thể vào được các chương trình dạng này, vì nó sẽ chạm tới gốc của `dsh-session`, và việc gộp `Context` ở đó sẽ khiến dịch vụ `sessions` của host xung đột với dịch vụ của chính client (`TS2717` — mỗi bên một chương trình, xem [development.md](../../../docs/development.md#typescript-project-layout)). Adapter transcript (bản ghi văn bản) của Web client dùng import chỉ-type để ghim literal plugin của nó vào type nguồn của lá này, do đó việc đổi id plugin ở đây sẽ khiến phía đó biên dịch thất bại.

## Trải nghiệm mô hình

### Lịch sử phiên khi gọi backend

#### Nội dung mô hình nhìn thấy

Triển khai thành công sẽ thay thế phạm vi surface trước đó bằng một checkpoint tóm tắt vai trò user, tức một `user/message` mang `surfaceOp: { op: 'replace', start, end }`; sự kiện gốc vẫn được ghi lại, nhưng không còn xuất hiện trong message mô hình được suy ra. Bản thân seam không thực hiện việc viết lại.

#### Ảnh hưởng Token

Service Definition này không trực tiếp tạo ra token. Backend đổi nhiều token lịch sử vốn được giữ lại lấy một bản tóm tắt, và giữ nguyên phần đuôi gần đây.

#### Ảnh hưởng KV Cache

Thay thế thành công của backend sẽ làm mất hiệu lực tái sử dụng kể từ token lịch sử bị che khuất đầu tiên; bản thân seam không thay đổi request.

## Giới hạn đã biết & công việc hoãn lại

- **Lệnh hướng tới người dùng, không phải công cụ mô hình**: `@deepseek-ai/dsh-command-compact` phơi bày `/compact` không tham số thông qua `ctx.commands`; không đăng ký công cụ compaction hướng tới mô hình.
- **Tràn đơn vị một phần nằm ngoài quy ước**: tóm tắt cân bằng không thể chia tách một đơn vị không thể chia tách. Khi phần chính có thể loại bỏ trong một cặp công cụ đã đóng là kết quả công cụ mang văn bản, dịch vụ đi kèm cắt tỉa tùy chọn vẫn có thể khắc phục cặp công cụ đó; không thể compaction node lớn không thuộc công cụ, hoặc đơn vị công cụ có phần còn lại không thể cắt tỉa quá lớn.
- **Envelope tự thân gần bằng kích thước cửa sổ không thuộc công việc compaction surface**: compaction chỉ thu nhỏ lịch sử được suy ra, không bao giờ thu nhỏ system prompt, công cụ hay tiền tố phiên.
