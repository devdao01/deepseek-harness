# Agent Note: Bộ điều phối ghi lưu bền dùng chung

Status: implemented

[English](2026-06-18-shared-persistence-write-coordinator.md) | Tiếng Việt

## Vấn đề

`dsh-session-persistence-jsonl` và `dsh-session-persistence-sqlite` cố ý chứng minh cùng một quy ước `SessionPersistence` trên các phương tiện lưu trữ khác nhau, nhưng chúng lặp lại việc điều phối đường ghi: trạng thái theo từng phiên, việc tiếp quản `session/created`, đọc tiền tố đặc thù theo backend, điều khiển write-behind (ghi trễ), thực thi tuần tự các thao tác theo id, tiêm mầm cho HMR (thay thế module nóng) và xả khi dispose (giải phóng tài nguyên). Việc kiểm tra va chạm tiền tố mầm thuần túy và guard khả tuần tự hóa đã được chuyển vào package Service Definition; phần điều phối còn lại vẫn đòi hỏi tính đúng đắn rất cao, và cùng một bản sửa lại phải áp dụng hai lần. Khác biệt duy nhất nằm ở nguyên thủy lưu trữ (ghi byte vs. INSERT hàng).

## Quyết định

Trích xuất một `PersistenceCoordinator` không phụ thuộc backend vào `dsh-session-persistence`. Bộ điều phối sở hữu thống nhất logic điều phối; mỗi backend hạng nhất kết hợp một thực thể bộ điều phối (`new PersistenceCoordinator(ctx, this)`), hiện thực một giao diện hook `PersistenceBackend` nhỏ gọn, và ủy quyền các phương thức công khai có trạng thái của nó (`create`/`append`/`prepare`/`load`/`inspect`/`readFrom`) cho bộ điều phối. Metadata do backend sở hữu và việc liệt kê phiên bản sửa đổi thì đi vòng qua bộ điều phối.

Kết hợp, chứ không kế thừa. Bộ điều phối là một lớp cụ thể do backend nắm giữ, không phải lớp cơ sở mà backend kế thừa. Nhờ đó tránh được rủi ro backend không theo lệ thường phải vật lộn với cây kế thừa: backend chỉ phơi bày hook, và không thể chạm tới trạng thái điều phối riêng tư của bộ điều phối. Backend bên thứ ba vẫn có thể hoàn toàn không dùng bộ điều phối mà hiện thực trực tiếp service trừu tượng, bao gồm cả kiểm tra logic bất biến, cũng như dự phòng chuẩn bị mặc định thông qua `load`.

Bộ điều phối giữ một mục vòng đời cho mỗi thực thể `Session` còn sống: phần khởi tạo, cộng với một bộ điều khiển ghi riêng tư trong package, chịu trách nhiệm về sự kiện đang chờ, thời hạn gom lô cố định, lần ghi đang hoạt động, việc giữ lại khi thất bại và rào chắn flush dùng chung. Mọi `session/event` đều đi vào đường ghi có giới hạn này, còn `session/flush` thì đi vòng qua phần chờ để quan sát trạng thái dừng hẳn hoàn toàn. Việc gộp bộ điều khiển được định nghĩa bởi [đơn giản hóa bộ điều khiển flush](../simplification/2026-07-23-collapse-persistence-flush-state.md); nhịp lập lịch được định nghĩa bởi [quyết định gom lô có giới hạn](2026-08-08-bounded-session-persistence-write-batching.md).

Bộ điều phối cho phiên nghỉ hưu thông qua `session/disposed`: nó chờ bộ điều khiển hoàn tất khởi tạo và lần flush hiện tại, thực thi tuần tự lần xả cuối cùng, và chỉ gỡ bộ điều khiển cùng trạng thái theo từng id mà nó sở hữu khi thao tác đó thành công. Khi thất bại, bộ điều khiển vẫn ở trạng thái tìm được, để backend teardown (tháo dỡ) thử lại. Đuôi chuỗi đã kết toán của mỗi id chỉ tự gỡ chính nó khi nó vẫn còn là đuôi chuỗi hiện tại, nhờ đó thao tác cũ hoàn tất sẽ không xóa mất thao tác mới của cùng id. Quá trình teardown của backend sẽ hủy đăng ký listener đường ghi, flush từng bộ điều khiển còn lại, chờ mọi thao tác đã tuần tự hóa theo id, và cuối cùng đóng backend.

### Giao diện hook (`PersistenceBackend<TornMarker>`)

Năm thành viên bắt buộc cộng một hook vòng đời tùy chọn tạo thành ranh giới duy nhất giữa bộ điều phối và lớp lưu trữ:

- `name` — nhãn backend, dùng cho `AggregateError` khi dispose thất bại.
- `loadStored(id)` — đọc một tiền tố đã lưu theo id trên mọi phạm vi lưu trữ (mọi thư mục dự án với JSONL; id là duy nhất toàn cục với SQLite). Việc chuẩn bị, nạp/kiểm tra logic, đọc hậu tố vật lý, tiếp quản phiên còn sống và dò va chạm khi tạo đều dùng chung phép tra cứu này. Bộ điều phối sẽ khẳng định id trả về, và từ chối khi cwd của bản ghi đã lưu không khớp với phiên còn sống, trước khi sửa chữa hoặc công bố trạng thái.
- `appendBatch(meta, events, isMaterialized)` — nối bền một lô liên tiếp, đồng thời vật chất hóa phiên một cách nguyên tử và lười biếng nếu nó chưa được vật chất hóa (thao tác ghi vật chất hóa và lô sự kiện đầu tiên phải được commit cùng nhau — nếu sự cố xảy ra giữa hai bước thì không được để lại một phiên đã vật chất hóa nhưng rỗng; đó là lý do không có hook `materialize` riêng).
- `commitRepair(meta, tornMarker, closers)` — làm cho việc sửa chữa sau sự cố trở nên lưu bền: cắt bỏ phần đuôi hỏng (khi và chỉ khi `tornMarker !== undefined`) rồi nối thêm `closers`. **Không yêu cầu tính nguyên tử** — JSONL hợp lý khi fsync theo hai bước (cắt trước, nối sau), còn SQLite thực hiện DELETE+INSERT trong một giao dịch. Dùng cho `prepare`/`load` (cắt bỏ + tổng hợp sự kiện đóng) và cho việc tiếp quản phiên còn sống (chỉ cắt bỏ, `closers = []`).
- `list()` — liệt kê toàn bộ metadata đã lưu.
- `close?()` — dọn dẹp vòng đời tùy chọn (SQLite đóng handle db; JSONL bỏ qua), được await trong effect dispose sau khi đã xả tới trạng thái dừng hẳn hoàn toàn, nên thất bại khi close không che lấp lỗi xả.

### Torn marker mờ đục

Lựa chọn thiết kế duy nhất giữ cho seam gọn gàng: token trả lời "phần đuôi hỏng nằm ở đâu" trong quá trình sửa chữa sau sự cố là mờ đục đối với bộ điều phối. Bộ điều phối tính ra các sự kiện đóng tổng hợp (nó sở hữu `interruptedTurnClosers` từ `dsh-session`), nhưng nó chỉ kiểm tra `tornMarker !== undefined` và truyền nguyên giá trị đó lại cho `commitRepair` — không bao giờ soi nội dung của nó. Mỗi backend tự chọn kiểu marker của mình: JSONL mang độ lệch byte cần cắt tới, cùng mọi sự kiện hoàn chỉnh được giải mã từ khung cuối cùng không trọn vẹn; còn SQLite mang seq để bắt đầu xóa từ đó. Nhờ vậy bộ điều phối không cần biết đến độ dài byte lẫn trạng thái khôi phục khung.

## Kiểm thử

`runPersistenceContract` dùng chung (quy ước API công khai) được chạy cho từng backend, và chứng minh rằng `inspect` sẽ cân bằng lại khung nhìn logic bị gián đoạn nhưng không thay đổi lưu trữ hay phiên bản sửa đổi, sau đó `prepare` hoặc `load` mới commit phần khôi phục. `runCoordinatorContract` (`tests/coordinator-contract.ts`) phủ việc tiếp quản, HMR, va chạm, xả khi dispose phiên và backend, cùng việc sửa chữa đuôi sau sự cố, thông qua một hiện thực tham chiếu trong bộ nhớ, JSONL và SQLite. `persistence.spec.ts`, `preparations.spec.ts` và `write-behind.spec.ts` phủ việc tái sử dụng và giữ chỗ khi chuẩn bị, việc loại thải trạng thái chuẩn bị có giới hạn, các lô kế tiếp theo cửa sổ cố định, việc dọn dẹp bộ điều khiển còn sống, tranh chấp đuôi chuỗi cùng id, việc thử lại lô thất bại và thứ tự đóng. Bản đặc tả kiểm thử của từng backend chỉ giữ lại phần cơ chế lưu trữ. Mỗi backend thật đều có một bài kiểm thử sửa chữa đuôi sau sự cố đi qua bộ điều phối, nhằm phủ nhánh marker mờ đục, bởi vì tình huống sự cố trong quy ước tuy sinh ra sự kiện đóng tổng hợp nhưng lại không sinh ra torn marker.

## Các phương án từng cân nhắc

- **Lớp cơ sở để backend kế thừa** — bị bác bỏ, chuyển sang kết hợp: backend chỉ phơi bày hook, không thể chạm tới trạng thái điều phối riêng tư của bộ điều phối, và backend bên thứ ba vẫn có thể hoàn toàn không dùng bộ điều phối mà hiện thực trực tiếp service trừu tượng.
- **API hook rộng hơn** — mọi hook ứng viên đều bị gộp bỏ: không có phép tra cứu phiên còn sống bị giới hạn theo phạm vi lưu trữ, vì `loadStored` cộng với kiểm tra cwd của bộ điều phối là đủ để duy trì ranh giới va chạm; không có generic cho bộ định vị lưu trữ, vì metadata JSONL đã được xác thực có thể khôi phục đường dẫn của nó, còn SQLite thì đã gắn theo id; không có hook `materialize` riêng, vì lô sự kiện đầu tiên phải được commit nguyên tử cùng việc vật chất hóa; không có phép dò va chạm khi tạo riêng, vì nó chính là `loadStored(id) !== undefined`; và `list()` cũng không truyền xuyên qua bộ điều phối, vì việc liệt kê không cần bất kỳ sự điều phối nào.

## Hệ quả

Bộ điều phối thêm một tầng gián tiếp, một torn marker mờ đục, các tác vụ nghỉ hưu tách khỏi vòng đời phiên, và trạng thái Session đã chuẩn bị có giới hạn, nhưng nó gom về một chỗ phần logic điều phối đòi hỏi tính đúng đắn cao vốn trước đây bị lặp ở từng backend. Việc dispose phiên vẫn chỉ là quan sát sự kiện, nên chủ sở hữu phiên không phải chờ quá trình nghỉ hưu của lớp lưu bền; bộ điều phối sẽ giữ lại thất bại, lưu các sự kiện đang chờ trong bộ điều khiển còn sống, và lấy backend teardown làm ranh giới dừng hẳn hoàn toàn. Bề mặt hook của nó vẫn hẹp: việc kiểm tra định danh, tiếp quản, kiểm tra va chạm, chuẩn bị và kiểm tra bất biến đều dùng chung `loadStored`; việc vật chất hóa được giữ nguyên tử bên trong `appendBatch`; việc liệt kê thì đi vòng qua bộ điều phối. Mô hình đọc dùng `inspect` chứ không dùng `load`, nên khi quan sát một lượt đã được lưu bền nhưng vẫn còn mở thì sẽ không commit sự kiện đóng do gián đoạn; việc tái sử dụng, giữ chỗ và công bố được định nghĩa bởi [quyết định về giai đoạn chuẩn bị Session](2026-08-05-session-preparation.md). Backend mới chỉ cần hiện thực nguyên thủy lưu trữ, mà không phải sao chép lại vòng đời ghi có giới hạn.
