# @deepseek-ai/dsh-settings-file

[English](README.md) | Tiếng Việt

Nhà cung cấp thiết lập dựa trên tệp. Một tài liệu YAML hoặc JSON chứa toàn bộ các phân đoạn namespace; các chỉnh sửa từ bên ngoài được phát hành nóng qua `ctx.settings`, còn `update()` đọc lại tài liệu dưới write lock rồi ghi lại nguyên tử, giữ nguyên chú thích YAML của người dùng, các phân đoạn thuộc về những plugin hiện chưa nạp, và mọi thay đổi trên đĩa mà tiến trình này chưa quan sát được.

## Cấu hình

| Trường | Ý nghĩa | Mặc định |
|---|---|---|
| `path` | Đường dẫn tài liệu thiết lập; phần mở rộng quyết định định dạng (`.yaml`/`.yml`/`.json`) | `settings.yaml` dưới harness home |
| `dshHome` | Harness home dùng khi bỏ qua `path` | `$DSH_HOME` hoặc `~/.dsh` |
| `watch` | Theo dõi tài liệu và phát hành nóng các chỉnh sửa từ bên ngoài | `true` |
| `debounceMs` | Cửa sổ ổn định ghi của watcher (mili giây) | `100` |

Việc phân giải giá trị mặc định là một bước `resolveSpec(config)` tường minh; phần mở rộng không được hỗ trợ sẽ báo lỗi lúc nạp.

## Hành vi

- **Khởi động thất bại thì báo lỗi rõ ràng, tải lại thì giữ giá trị khả dụng cuối cùng.** Tài liệu tồn tại nhưng không hợp lệ sẽ khiến plugin nạp thất bại; các chỉnh sửa lúc đang chạy mà không đọc được hoặc không phân tích được chỉ cảnh báo và giữ lại phân đoạn khả dụng cuối cùng. Khi tài liệu không tồn tại, mọi namespace được phân giải theo giá trị mặc định và `base`; xóa tài liệu cũng phát hành trạng thái rỗng tương tự.
- **Mỗi lần ghi là một chu trình đọc-sửa-ghi.** Persist đọc lại tài liệu trước và phát hành mọi khác biệt vào seam — dù đó là chỉnh sửa bên ngoài vẫn còn trong cửa sổ debounce của watcher, thay đổi mà watcher bỏ sót, hay lần ghi của một tiến trình khác — rồi mới dựng lại dựa trên văn bản mới này, nhờ vậy việc ghi không bao giờ làm sống lại tài liệu cũ và cũng không đánh mất các phân đoạn ngang hàng chưa được quan sát. Nếu tài liệu trên đĩa đã trở nên không hợp lệ, thao tác ghi sẽ báo lỗi rõ ràng và từ chối thực hiện, thay vì ghi đè lên phần chỉnh sửa thủ công của người dùng.
- **Việc ghi giữ write lock xuyên tiến trình.** Quy trình đọc-dựng-rename chạy dưới sự bảo vệ của tệp khóa ngang hàng `<file>.lock` được tạo bằng `wx`, có backoff lũy thừa và thời hạn giành khóa 2 s. Bên tranh chấp sẽ timeout nhưng không gỡ khóa hiện có, vì tuổi của khóa không phân biệt được chủ sở hữu đã sập với bên ghi bị tạm dừng nhưng vẫn còn sống; việc khôi phục khóa sót lại phải do người vận hành thực hiện. Bên đọc không bao giờ lấy khóa: việc commit bằng rename là nguyên tử, nên tải lại luôn nhất quán.
- **Ghi lại nguyên tử, chỉ chủ sở hữu truy cập được, chống symlink.** Bản dựng được tạo độc quyền trong tệp tạm ngang hàng có hậu tố ngẫu nhiên với quyền `0600` (`wx` từ chối đi theo symlink cài sẵn), sau đó rename để ghi đè đích, và dọn tệp tạm khi thất bại.
- **Chỉnh sửa YAML là diff ở mức lá.** Thao tác ghi chỉ đặt các giá trị thay đổi và chỉ xóa các khóa bị loại bỏ, nên chú thích, anchor và cách trình bày được giữ nguyên ở mọi nút không bị đụng tới cũng như ở khóa của mọi cặp khóa-giá trị bị đổi; mảng bị đổi (hoặc các giá trị không phải map khác) được thay thế toàn bộ, kèm theo chú thích bên trong cũng bị thay theo. JSON được tuần tự hóa lại, không có chú thích.
- **Tải lại và ghi dùng chung một chuỗi thao tác.** Việc làm mới của watcher và các lần persist từ hàng đợi của từng namespace được thực thi lần lượt theo thứ tự hàng đợi; mỗi lần dựng đều dựa trên văn bản sau khi thao tác trước đã commit.
- **Tín hiệu ready của watcher thực hiện một lần đối soát.** Có tranh chấp giữa lần nạp ban đầu và việc watcher tự thiết lập, nên các thay đổi ghi trong khoảng đó không bao giờ kích hoạt sự kiện; việc đối soát lúc ready sẽ bù đắp khoảng trống khởi động này.
- **Watcher gốc nhận đường dẫn đã chuẩn hóa.** Trước khi Chokidar mở đích, nhà cung cấp thực hiện phân giải realpath trên đường dẫn tổ tiên tồn tại ở tầng sâu nhất, rồi ghép lại phần hậu tố còn thiếu. Việc truy cập tệp và các chẩn đoán hiển thị cho người dùng vẫn dùng đường dẫn đã cấu hình, nhờ đó tránh được việc Windows trộn lẫn bí danh 8.3 với đường dẫn sự kiện dạng dài bên trong libuv.
- **dispose (giải phóng tài nguyên) bảo đảm dừng hẳn ở mọi chế độ watch.** Việc gỡ tải trước hết đánh dấu nhà cung cấp là đã đóng, đóng watcher nếu có, rồi đợi mọi thao tác tài liệu đã xếp hàng hoặc đang chạy hoàn tất, sau đó không còn phát hành gì nữa.
- **Chặn tự-ghi theo nội dung.** Nhà cung cấp lưu đệm văn bản khả dụng cuối cùng; sự kiện watcher có nội dung trùng với bộ đệm (kể cả lần ghi của chính nó) sẽ là no-op.
- **Adapter cấu hình Host nhận đường dẫn đã phân giải.** `ctx.settings.documentPath` là tên tệp tuyệt đối do `resolveSpec()` suy ra, bao gồm cả đường dẫn YAML/JSON tùy chỉnh; `prepareDocument()` giữ lại tệp hiện có, hoặc tạo độc quyền tệp rỗng còn thiếu với quyền chỉ chủ sở hữu truy cập được trước khi Host mở tài liệu. Trình duyệt chỉ nhận cờ khả dụng, không bao giờ dựng lại `$DSH_HOME`, và không bao giờ commit đích trên hệ thống tệp.

## Trải nghiệm mô hình

Gián tiếp: nhà cung cấp này chỉ lưu trữ và phát hành các phân đoạn namespace, mọi tác động lên mô hình đều phát sinh qua các bên tiêu thụ của `ctx.settings` và được mô tả trong tài liệu giao diện của chính các bên đó.

#### Ảnh hưởng KV Cache

Không có việc mất hiệu lực trực tiếp; mọi thay đổi tiền tố yêu cầu đều do plugin tiêu thụ chịu trách nhiệm.

## Hạn chế đã biết và phần tạm hoãn

- **Xung đột trong cùng một namespace vẫn theo nguyên tắc ghi sau thắng** — write lock cộng với đọc-sửa-ghi khiến các bên ghi đồng thời không đánh mất namespace của nhau, nhưng khi hai bên ghi cùng chỉnh một namespace thì lần ghi sau vẫn thắng; không có hợp nhất theo giá trị, cũng không có kiểm tra revision.
- **Sự kiện watcher bị bỏ sót vẫn không nhìn thấy được cho tới tín hiệu tiếp theo** — thao tác đọc không bao giờ stat lại tệp, nên thay đổi mà watcher bỏ lỡ chỉ được hợp nhất vào ở sự kiện tiếp theo, lần ghi tiếp theo, hoặc khi khởi động lại.
- **Giữ chú thích chỉ áp dụng cho YAML và chỉ ở dạng map** — tài liệu JSON được tuần tự hóa lại, không có chú thích (bản thân JSON không có), và chú thích bên trong mảng bị đổi (hoặc chú thích gắn trên cùng dòng với giá trị vô hướng bị đổi) sẽ bị thay theo giá trị mà chúng mô tả.
- **Không có tham chiếu gián tiếp giá trị** — phân đoạn lưu giá trị nguyên văn; tham chiếu kiểu `${env:VAR}` hướng tới khóa bí mật là tính năng ở tầng seam còn tạm hoãn.
