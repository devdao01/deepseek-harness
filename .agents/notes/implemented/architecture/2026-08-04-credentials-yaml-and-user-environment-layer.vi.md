# Agent Note: Tách kho lưu trữ credential khỏi lớp môi trường người dùng

Status: implemented

[English](2026-08-04-credentials-yaml-and-user-environment-layer.md) | Tiếng Việt

## Problem

`$DSH_HOME/.env` đồng thời gánh hai công việc không tương thích với nhau. Nó là kho lưu trữ key có thể ghi của [`credentials-local`](../../../../packages/credentials/credentials-local/README.md), nên không bề mặt nào được phép nâng nó lên `process.env` — một khi bị nâng lên, mỗi key đã lưu sẽ bị đọc thành một override chỉ đọc lúc khởi động, từ đó chặn đứng việc xoay vòng key từ trang Models. Nhưng tên file và định dạng dotenv của nó lại hứa hẹn là một file môi trường, nên người dùng đặt giá trị không phải bí mật vào đó, mà những giá trị đó chẳng đi tới đâu cả: trong cùng một file, `DEEPSEEK_BASE_URL` nằm cạnh một `DEEPSEEK_API_KEY` dùng được sẽ bị âm thầm bỏ qua, vì chỉ có provider credential đọc document này, và nó chỉ định địa chỉ theo tham chiếu credential.

Một file không thể vừa là kho lưu trữ do Harness sở hữu và cô lập, vừa là một lớp lan truyền theo quy tắc môi trường thông thường. [Quyết định về credential cấp request](2026-07-29-request-level-llm-config-credentials.md) trước đây chọn dotenv để khớp với `.env` ở home của các sản phẩm cùng loại, và sự trộn lẫn này chỉ lộ ra khi có giá trị không phải bí mật cần dùng chung file đó.

## Decision

Hai công việc được tách thành hai file dưới home của Harness.

**`.credentials.yaml` là kho lưu trữ do provider quản lý.** Một mapping YAML nghiêm ngặt từ `CredentialRef` sang chuỗi không rỗng, không có trường `version`, cũng không có lớp bọc:

```yaml
DEEPSEEK_API_KEY: sk-…
OPENAI_API_KEY: sk-…
```

Vì document này chỉ lưu credential, không có gì khác, mọi sự sai lệch đều bị từ chối chứ không phải bỏ qua entry: node gốc không phải là mapping, key không phải định danh POSIX, giá trị không phải chuỗi, chuỗi rỗng, key trùng lặp, và YAML sai định dạng — tất cả đều thất bại; báo lỗi lớn tiếng lúc khởi động và lúc ghi, còn hot reload lúc đang chạy thì cảnh báo và giữ lại snapshot khả dụng cuối cùng. Một key bị âm thầm bỏ qua đọc lên giống như "key tôi đã lưu không có tác dụng", mà đây chính xác là kiểu thất bại mà thay đổi lần này muốn loại bỏ. Bộ chỉnh sửa dòng vật lý dotenv được thay thế bằng việc vá (patch) trực tiếp document đã parse, nên comment và cách trình bày của entry chưa bị chạm tới đều được giữ nguyên, bất kỳ giá trị chuỗi nào cũng có thể lưu và đọc lại (round-trip) được (kể cả nhiều dòng), cũng không còn entry nào không thể ghi được vì thiếu kiểu dấu ngoặc dùng được. Khóa ghi, đọc-sửa-ghi (read-modify-write), ghi nguyên tử `0600` dưới thư mục `0700`, watcher theo đường dẫn chính xác, việc ức chế tự-ghi theo so sánh nội dung bằng nhau, và việc dừng hẳn hoàn toàn lúc dispose, đều giữ nguyên không đổi.

**`$DSH_HOME/.env` là lớp môi trường thông thường của người dùng.** `loadLayeredEnv` trong [`dsh-app-boot`](../../../../packages/boot/app-boot/README.md) resolve `.env` của thư mục lời gọi trước, rồi mới resolve `.env` ở home của Harness, và chỉ vật chất hóa mỗi giá trị đã được chấp nhận khi tiến trình không có giá trị lớp cao hơn, từ đó có được `người dùng < dự án < kế thừa`. Home của Harness được resolve xong từ môi trường kế thừa *trước khi* hai file được load, nên `.env` của dự án không thể thay đổi việc document người dùng nào được đọc. Chỉ có CLI (giao diện dòng lệnh) sản phẩm mới chồng hai file này lên nhau; SDK và bin ví dụ vẫn load thư mục riêng của chúng qua `loadEnv`, tuyệt đối không kế thừa `$DSH_HOME` của developer.

Thứ tự ưu tiên credential sẽ phân biệt môi trường kế thừa với file được phát hiện: giá trị kế thừa vẫn là override chỉ đọc theo từng lần, tiếp theo là document được quản lý, rồi tới giá trị dự phòng vẫn có thể ghi được trong `.env` của dự án và người dùng. Do đó `set` sẽ thay thế giá trị trong file được phát hiện, chứ không bị từ chối chỉ vì view `process.env` đã bị làm phẳng cho rằng việc ghi sẽ bị che khuất.

Không thực hiện di trú. Key đã có sẵn trong `$DSH_HOME/.env` sẽ tiếp tục được resolve như giá trị dự phòng; một khi trang Models lưu tham chiếu đó, document được quản lý sẽ được ưu tiên.

## Consequences

- Đánh đổi: key còn lại trong `$DSH_HOME/.env` sẽ được vật chất hóa vào `process.env`, do đó sẽ tới được tiến trình con theo quy tắc [xóa credential của tiến trình con](../../../../packages/subprocess/subprocess/README.md), chứ không còn nằm bên trong provider nữa. Nó vẫn là giá trị dự phòng có thể ghi bên dưới `.credentials.yaml`; key cần được Harness sở hữu và cô lập thì thuộc về document được quản lý, mà document đó không bao giờ được vật chất hóa.
- Đổi lại được: giá trị không phải bí mật trong `.env` của người dùng cuối cùng cũng có hiệu lực, đây chính là lỗi ban đầu; định dạng document có thể từ chối nội dung mà nó không thể chứa; `0600` bảo vệ một file chỉ lưu key, chứ không phải một file mà chúng ta đồng thời bảo người dùng ghi cấu hình thông thường vào.
- `0600` mà provider dùng lúc ghi cũng ràng buộc luôn cả nội dung nó đọc: trên POSIX, hễ document mang bất kỳ bit quyền group hay other nào, khởi động sẽ thất bại trước cả khi đọc nội dung — kiểm tra cả lúc khởi động lẫn mỗi lần reload, chẩn đoán đưa ra lệnh sửa `chmod 600`. Windows không có mode nào để kiểm tra (ACL của nó không thể biểu đạt điều này ở đây), nên bỏ qua việc kiểm tra thay vì giả lập nó.
- Ranh giới `0600` này vẫn chỉ chặn người dùng OS khác, không chặn được model, lần tách này không thay đổi điều đó — giới hạn này cùng mục hoãn lại về provider keychain thuộc về [README của provider](../../../../packages/credentials/credentials-local/README.md).

## Alternatives considered

**Giữ một `$DSH_HOME/.env` duy nhất, để CLI nâng nó lên.** Bị bác bỏ: bản thân việc nâng kho lưu trữ lên chính là lý do khiến key đã lưu không thể xoay vòng, đây cũng là lý do [app-boot trước đây từng ghi lại việc loại trừ này](../../../../packages/boot/app-boot/README.md). Xung đột đến từ hai công việc của file này, không phải từ loader.

**`$DSH_HOME/.credentials.env` — file dotenv thứ hai.** Bị bác bỏ: dotenv phù hợp cho lớp môi trường, nhưng không thể biểu đạt "một document được quản lý, đánh chỉ mục theo tham chiếu credential". Nó không thể từ chối key không phải chuỗi hoặc không thể định địa chỉ, hơn nữa bộ chỉnh sửa dòng của nó vốn dĩ đã từ chối giá trị không thể thêm dấu ngoặc, để lại những entry đọc được nhưng không ghi được.

**Thêm trường `version` cho document mới.** Bị bác bỏ: định dạng này chỉ có một mapping chuỗi bị ràng buộc bởi schema, không có biến thể lịch sử nào cần phân biệt. Ở giai đoạn chưa phát hành, sửa cấu trúc trực tiếp và từ chối cấu trúc cũ tốt hơn là cam kết trước một giao thức di trú.

**Di trú các key trông giống credential ra khỏi `$DSH_HOME/.env` lúc chạy lần đầu.** Bị bác bỏ: code di trú sẽ biến một định dạng đoản mệnh thành một mặt bảo trì lâu dài, mà việc phán đoán key nào trong một file không rõ nguồn gốc là key bí mật chính là sự mơ hồ mà lần tách này muốn loại bỏ. File cũ tiếp tục hoạt động như một môi trường, đây là một kết quả trung thực, chứ không phải một kết quả âm thầm.

**Loại bỏ hoàn toàn lớp `.env` của người dùng, chỉ giữ lại môi trường kế thừa.** Bị bác bỏ ở đây vì nằm ngoài phạm vi: bản thân nó là một thiết kế tự nhất quán (ít lớp hơn, mỗi giá trị chỉ có một nguồn), nhưng sẽ loại bỏ workflow sẵn có của người dùng, mà vấn đề phân lớp thuộc về quyết định ưu tiên bị hoãn lại đó, không thuộc về lần tách này.
