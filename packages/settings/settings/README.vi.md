# @deepseek-ai/dsh-settings

[English](README.md) | Tiếng Việt

Service Definition thiết lập người dùng (`ctx.settings`). Một nhà cung cấp giữ tài liệu thô được chia phân đoạn theo namespace; các plugin đăng ký schema namespace và đọc giá trị được phân giải phân tầng: giá trị mặc định của schema, rồi `base` tổng hợp của bên đăng ký (tập con cấu hình entry trong cordis.yml của nó), cuối cùng là phân đoạn trong tài liệu người dùng. Khi không gắn nhà cung cấp, hành vi của bên tiêu thụ không đổi: vẫn chỉ phân giải theo cấu hình entry, nên mọi tổ hợp đều hoạt động dù có hay không có settings.

## API dịch vụ

- `documentPath` — khi nhà cung cấp sở hữu một tệp người dùng có thể chỉnh sửa, trường này là đường dẫn tuyệt đối của tệp; nhà cung cấp không dựa trên tệp giữ nguyên `undefined`. Adapter cấu hình Host dựa vào đây để suy ra tính khả dụng, còn giao thức trình duyệt chỉ phơi bày một cờ năng lực boolean, không bao giờ phơi bày đích trên hệ thống tệp.
- `prepareDocument()` — chuẩn bị tài liệu sẵn sàng cho trình soạn thảo gốc mở, rồi trả về đường dẫn đó. Cài đặt ở lớp cơ sở trả về `documentPath`; nhà cung cấp dựa trên tệp có thể tạo trước tài liệu còn thiếu.
- `register(ns, schema, { base?, applies? })` — trả về `SettingsScope` của owner (`get`/`watch`/`update`). Việc đăng ký là một effect trên fiber plugin của bên gọi: dispose (giải phóng tài nguyên) fiber đó sẽ gỡ namespace cùng các observer của nó. Phân đoạn tồn sẵn bị schema từ chối sẽ khiến chính việc đăng ký thất bại; namespace trùng lặp báo lỗi ngay lập tức.
- `describe(options?)` — mỗi namespace một mô tả (bao `schema.toJSON()`, giá trị đã phân giải, các tầng `base`/`user` được tách riêng, `applies`) dùng cho giao diện cấu hình; một trường xuất hiện trong `user` tức là nó được người dùng ghi đè. `describe({ redactSecrets: true })` bóc các trường `role('secret')` khỏi mọi tầng và kèm theo danh sách slot `secrets` (`{ path, set }`); mọi giao diện giao thức đều bắt buộc truyền nó, và bộ duyệt thuần `redactSecrets(schema, value)` đã được export để dùng cho các wire khác.
- `get(ns)` — giá trị đã phân giải; `undefined` khi chưa đăng ký.
- `update(ns, patch)` — hợp nhất sâu một patch dạng đối tượng thuần vào phân đoạn người dùng (không bao giờ vào `base`), kiểm tra giá trị ứng viên sau phân giải, rồi commit sau khi nhà cung cấp lưu bền. Patch chỉ được chứa dữ liệu tương thích JSON: Date, Map, BigInt, số không hữu hạn hoặc tham chiếu vòng sẽ bị từ chối trước khi bất kỳ nội dung nào được lưu bền, kèm đường dẫn lấy `$` làm gốc (kho lưu YAML/JSON sẽ âm thầm thay đổi các giá trị như vậy khi tải lại). Kiểm tra thất bại thì từ chối trước khi lưu bền; nhà cung cấp chỉ đọc (`writable: false`) từ chối mọi thao tác ghi. Các thao tác ghi vào cùng một namespace được tuần tự hóa theo thứ tự gọi.
- `replace(ns, section)` — thay thế toàn bộ phân đoạn người dùng: đây là một lần đặt lại có chủ ý (`replace({})` kế thừa lại `base` và giá trị mặc định của schema).
- `mutate(ns, ops)` — áp dụng lần lượt các chỉnh sửa `{ op: 'set' | 'unset', path }` lên phân đoạn tại đúng thời điểm thao tác ghi lên đầu hàng đợi. Đây là đường xóa dành cho mọi bên gọi chỉ nắm giữ một góc nhìn **không đầy đủ**: giao diện cấu hình đọc được descriptor đã che giấu, dựng lại phân đoạn từ đó rồi thay thế toàn bộ sẽ xóa mất mọi bí mật mà wire chưa từng trả về, trong khi một op chỉ nêu đích danh đúng trường mà nó thật sự muốn đổi.
- Mỗi thao tác ghi có thể mang theo `expectedRevision` tùy chọn. Mỗi descriptor mang `revision` của namespace đó — một bộ đếm đơn điệu tính trên phân đoạn **thô** của nó; thao tác ghi có giá trị kỳ vọng không còn khớp sẽ bị từ chối bằng `SettingsConflictError` (`code: 'SETTINGS_CONFLICT'`, kèm cả hai revision) thay vì ghi đè lên bên ghi đã hoàn tất trước. Hàng đợi ghi chỉ đảm bảo thứ tự trước sau của các thao tác ghi, tự nó không phân biệt được bên ghi nắm snapshot mới với bên ghi nắm snapshot cũ.
- Giá trị đã phân giải là snapshot đóng băng sâu. Sau mỗi lần commit, observer nhận `(next, prev)`: các lần gọi cùng một callback được thực thi bất đồng bộ, lần lượt, theo thứ tự commit (lần gọi cũ và chậm không bao giờ có hiệu lực muộn hơn lần gọi mới hơn), và ngoại lệ — cả ném đồng bộ lẫn từ chối bất đồng bộ — đều được cô lập. Sau khi disposer của watch trả về thì không còn lần gọi mới nào được khởi động (lần đã xếp hàng sẽ bị bỏ qua); lần gọi đã khởi động vẫn kết toán. Sự kiện `settings/updated` phát tán theo từng listener, một listener ném lỗi không làm các listener còn lại chết đói; việc từ chối của listener bất đồng bộ được cô lập và ghi log, đó chính là lý do các lỗi mã hóa `INVARIANT` chỉ được ném lại từ listener đồng bộ.
- Việc gỡ tải dịch vụ trước hết từ chối các thao tác ghi mới và việc khởi động lời gọi observer, rồi chỉ hoàn tất sau khi đã rút cạn toàn bộ thao tác ghi đã xếp hàng và các lời gọi observer đã khởi động; khi fiber của bên đăng ký bị dispose giữa chừng một thao tác ghi, thao tác đó vẫn tới được kho lưu nhưng không được commit và không thông báo cho ai.

## Quy ước nhà cung cấp

Lớp con hiện thực `writable`, `load()`, `persist(ns, section)`, có thể ghi đè `documentPath` và `prepareDocument()` cho một tệp người dùng cục bộ có thể chỉnh sửa, và đẩy tài liệu quan sát được từ bên ngoài qua `publish(doc)` được bảo vệ. Phần init của dịch vụ cơ sở nạp và phát hành tài liệu một lần trước khi dịch vụ có thể được inject; nhà cung cấp có init riêng (watcher, kết nối) sẽ ủy quyền cho lớp cơ sở trước bằng `yield* super[Service.init]()`. Khi publish, mỗi namespace đã đăng ký được phân giải lại độc lập: phân đoạn không hợp lệ sẽ giữ giá trị khả dụng cuối cùng của namespace đó và cảnh báo — hot reload không bao giờ kéo sập tiến trình; còn việc kiểm tra lúc khởi động và lúc đăng ký thì báo lỗi ngay.

## Sự kiện

`settings/updated (ns, next, prev, source)` phát sau mỗi lần commit; `source` là `update` (ghi trong tiến trình) hoặc `provider` (thay đổi từ bên ngoài). Không bao giờ phát khi giá trị đã phân giải bằng nhau sâu — sự kiện này hướng tới bên tiêu thụ, mà bên tiêu thụ chỉ quan tâm giá trị của chính mình có đổi hay không.

`settings/document-updated (ns, revision)` phát khi phân đoạn người dùng **thô** thay đổi, bất kể giá trị đã phân giải có đổi theo hay không. Giao diện cấu hình cần đúng sự kiện này: lưu một giá trị ghi đè trùng với `base` tổng hợp không làm đổi giá trị đã phân giải, nhưng lại đổi điều mà tài liệu nói (trường đó chuyển từ kế thừa sang ghi đè) và cũng đẩy tiến revision mà mọi trình soạn thảo đang mở đang giữ. Ngoại lệ của listener được cô lập giống như với `settings/updated`.

Cả hai khai báo đều nằm ở lối ra đường dẫn con `./types` an toàn cho client, cùng chỗ với các kiểu `SettingsNamespace`, `SettingsUpdateSource` mà chữ ký của chúng nêu đích danh; gốc gói tiếp tục re-export các kiểu này. Nhờ đó, bên tiêu thụ ngoài mặt biên dịch của Host đọc đúng chữ ký mà Host phát ra, không phải viết lại lần nữa.

## Trải nghiệm mô hình

Gián tiếp: các plugin tiêu thụ phân giải từ namespace của mình những giá trị ảnh hưởng tới mô hình (ví dụ tuyến định tuyến mô hình mặc định); tác động được mô tả trong tài liệu giao diện của chính từng bên tiêu thụ.

#### Ảnh hưởng KV Cache

Không có việc mất hiệu lực trực tiếp; bên tiêu thụ đưa giá trị thiết lập vào tiền tố yêu cầu chịu trách nhiệm về thay đổi đó.

## Hạn chế đã biết và phần tạm hoãn

- **Chỉ một tầng người dùng** — việc phân giải chỉ biết đến giá trị mặc định của schema, một `base` tổng hợp và một tài liệu người dùng; nó chưa ghi lại tầng nào cung cấp từng giá trị đã phân giải.
- **`redactSecrets` không phải một biên giao thức có thể chứng minh được**: walker chỉ đi theo `object`/`dict`/`array`, nên `role('secret')` chỉ tới được qua union, intersection hoặc transform sẽ được trả về **nguyên trạng**, với danh sách `secrets` rỗng; đồng thời `schema.toJSON()` sẽ mang luôn `.default(...)` của trường bí mật tới mọi client. Cả hai trường hợp đều không bị từ chối; schema có bí mật không thể tới được qua các container được duyệt thì tuyệt đối không được đăng ký vào namespace phơi bày ra giao thức. Câu trả lời thực sự là một `describeForWire()` fail-closed — nó từ chối mọi schema mà bản thân nó không chứng minh được là an toàn, đồng thời làm sạch bao tuần tự hóa và văn bản lỗi — và việc này đang tạm hoãn.
- **Đồng thời xuyên tiến trình do nhà cung cấp định nghĩa** — seam chỉ tuần tự hóa thao tác ghi theo namespace trong phạm vi tiến trình; đồng thời xuyên tiến trình hội tụ theo hành vi của nhà cung cấp (nhà cung cấp tệp cục bộ đọc-sửa-ghi dưới write lock, nên namespace không bị mất khi có nhiều bên ghi đồng thời, còn xung đột trong cùng namespace được giải quyết theo nguyên tắc ghi sau thắng).
