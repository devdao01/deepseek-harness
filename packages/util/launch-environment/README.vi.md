# dsh-launch-environment

[English](README.md) | Tiếng Việt

Đóng băng môi trường của lần chạy này thành một snapshot bất biến, và ghi nhớ **mỗi giá trị đến từ tầng nào**. Bên tiêu thụ dùng nó thay vì `process.env` để phân giải các giá trị hướng tới người dùng, vì mức độ tin cậy giữa các tầng không giống nhau, còn view đã làm phẳng thì không thể phân biệt chúng.

| Tầng | id nguồn | Nó là gì |
|---|---|---|
| Môi trường tiến trình kế thừa | `process` | Thứ được truyền vào từ shell khởi động, tác vụ CI, hoặc container — ý định rõ ràng của lần chạy này |
| `<invocation cwd>/.env` | `project-env` | Dự án nơi harness được khởi động; sản phẩm tin tưởng nó để cấu hình agent (tác tử) của chính mình |
| `$DSH_HOME/.env` | `user-env` | Giá trị mặc định ở tầng máy của chính người dùng |

Các giá trị này cũng đi vào `process.env` — vì cây `--config` của người dùng và các thư viện bên thứ ba cần đọc nó — nhưng view đã làm phẳng đó không phải là căn cứ để harness phân giải bất kỳ giá trị nào.

## Phân giải

`get(name)` tìm kiếm qua tất cả các tầng theo mức tin cậy từ cao xuống thấp. `getFrom(name, sources)` chỉ tìm kiếm các tầng được chỉ định, không thay đổi thứ tự tin cậy này.

**Bỏ qua một tầng là từ chối, không phải giảm cấp** — bên gọi tuyệt đối không được chấp nhận việc không liệt kê một tầng nào đó, và bất kỳ sự sắp xếp lại nào sau đó cũng không thể khôi phục nó. Adapter của bên cung cấp liệt kê đủ cả ba tầng, vì sản phẩm tin tưởng dự án mà nó đang chạy; cơ chế này dành cho những quyết định "không phải như vậy".

Tên biến được khớp theo quy tắc riêng của nền tảng: khớp chính xác trên POSIX, không phân biệt hoa thường trên Windows. Tìm kiếm phân biệt hoa thường trên Windows sẽ chọn sai tầng — `deepseek_api_key` trong shell và `DEEPSEEK_API_KEY` trong `.env` của dự án, đối với hệ điều hành là cùng một biến; coi chúng là hai biến khác nhau sẽ khiến dự án thắng.

```ts
import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'

declare const ctx: Context
const endpoint = launchEnvironmentOf(ctx).get('DEEPSEEK_BASE_URL')?.value
```

Khi CLI (giao diện dòng lệnh) của sản phẩm khởi động cây này, `launchEnvironmentOf(ctx)` trả về snapshot của bộ khởi động (launcher); nếu không, nó trả về tầng chỉ chứa môi trường kế thừa. Việc dự phòng này không làm suy yếu quy tắc: SDK host hay `cordis.yml` trần chưa bao giờ phát hiện được bất kỳ file nào, do đó những gì nó có chính là môi trường tại thời điểm nó được khởi động.

## Giới hạn đã biết và việc còn hoãn lại

- **Snapshot không phải là ranh giới tiến trình con**: mỗi tầng cũng được vật chất hóa (materialize) vào `process.env`, do đó các biến thông thường trong dự án sẽ tới tiến trình con theo quy tắc làm sạch của [`dsh-subprocess`](../../subprocess/subprocess/README.md). [Ước định `.env`](../../boot/app-boot/README.md#profiles) của bộ khởi động sản phẩm sẽ từ chối các biến bootstrap trước khi vật chất hóa.
- **Không có tầng phân theo workspace**: tầng dự án là thư mục *gọi lệnh (invocation)*, cố định tại thời điểm khởi động. Workspace được chọn sau đó trong Web UI không đóng góp bất kỳ nội dung nào, đây là chủ đích: nếu theo nó thì sẽ để workspace của chính model thay đổi môi trường harness giữa chừng phiên làm việc.
