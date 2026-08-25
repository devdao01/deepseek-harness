# `@deepseek-ai/dsh-cmdline`

[English](README.md) | Tiếng Việt

Dòng lệnh mà launcher dsh giao lại cho ứng dụng mà nó khởi động. Launcher chỉ phân tích các flag thuộc về chính nó (`--profile`, `--patch`, dump cấu hình), và giao lại **mọi thứ phía sau** nguyên vẹn cho cây cấu hình, vì vậy các họ flag, văn bản `--help` và lỗi phân tích đều do ứng dụng tự giữ, launcher không cần biết về chúng.

## Giá trị do launcher cung cấp

Launcher gọi `provideCmdline(ctx, host)` trước khi bất kỳ entry nào trong cây cấu hình được gắn vào, cung cấp:

- `ctx.cmdlineArgs`: các tham số ở lớp trong của lần gọi này. `get()` chính là toàn bộ giao diện của nó, trả về một bản chụp nhanh: `dsh --profile tui --resume abc` cho ra `['--resume', 'abc']`.
- `ctx.appExit`: một yêu cầu thoát tiến trình có giới hạn, được gắn vào bộ điều khiển tắt (shutdown controller) của launcher.

Host nhúng không có dòng lệnh cung cấp danh sách rỗng; đây là câu trả lời trung thực, không phải giá trị bị thiếu.

## Provider thông thường và cấu hình injection

Bất kỳ plugin ứng dụng nào cũng có thể inject `cmdlineArgs`, phân tích nó, rồi phát hành một service riêng của ứng dụng như một service thông thường. `parseCmdline(ctx, program)` chỉ thích ứng với commander; việc xác thực và service được phát hành đều do action riêng của program tự giữ:

```ts ignore
export const name = 'web-startup'
export const inject = ['cmdlineArgs']

export function apply(ctx: Context): void {
  const program = webCommand()
  program.action(() => ctx.provide('webStartup', webValuesFrom(program)))
  parseCmdline(ctx, program)
}
```

Dòng Loader của nó không mang cờ launcher, cũng không có kiểu đặc biệt nào:

```yaml
- id: web-startup
  name: '@deepseek-ai/dsh-web-app/startup'
```

Tất cả các dòng được cấu hình bởi các giá trị này đều dùng service injection thông thường, và truy cập service đó trực tiếp trong cấu hình lazy:

```yaml
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
  inject: [webStartup]
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3080
```

`parseCmdline` từ chối khi tải nếu toàn bộ cây lệnh không có bất kỳ lệnh nào khai báo action cho program, gắn việc thoát và đầu ra của mỗi lệnh vào launcher (commander chỉ sao chép các thiết lập này vào lệnh con khi đăng ký), rồi phân tích các tham số bất biến; khi phân tích thành công, commander chạy action đồng bộ của lệnh được gọi. Action từ chối lệnh gọi không hợp lệ bằng `program.error(...)` — phải từ chối trước rồi mới phát hành, vì các câu lệnh viết trước khi từ chối đã được thực thi. Khi gặp `--help`, `--version`, lỗi phân tích hoặc sự từ chối này, bộ điều hợp này xuất văn bản của commander và yêu cầu thoát; provider không phát hành gì cả, do đó các dòng phụ thuộc không được kích hoạt.

### Injection sắp xếp việc tính toán cấu hình như thế nào

Loader hoãn việc nội suy `!!js` của một dòng cho đến khi tất cả các injection được khai báo trên dòng đó được kích hoạt, rồi mới tính toán dựa trên ngữ cảnh plugin của dòng đó. Vì vậy ví dụ trên có thể đọc trực tiếp `ctx.webStartup`: trước khi Loader lấy cấu hình của `webserver`, Cordis đã điền sẵn service injection này. Cây Include giữ lại các node biểu thức lồng nhau cho đến khi từng dòng mục tiêu đạt đến thời điểm này. Việc thay thế provider và patch reload đang hoạt động đều nội suy lại dựa trên service injection hiện tại, vì vậy các flag khởi động không bị âm thầm đặt lại.

### Chia sẻ tham số bất biến

`get()` không tiêu thụ hay sửa đổi argv. Nhiều plugin có thể phân tích cùng một bản chụp nhanh, và phát hành service riêng biệt. Launcher không kiểm tra chủ sở hữu dòng lệnh trong tổ hợp; profile không có bên đọc chỉ đơn giản bỏ qua tham số ứng dụng của chính nó.

Plugin ngoài cây mang theo bản sao commander riêng của nó, vì vậy lỗi luồng điều khiển của commander được nhận diện theo cấu trúc, chứ không theo danh tính lớp; phán đoán theo danh tính sẽ ném help đã in ra thành lỗi tải nghiêm trọng.

## Trải nghiệm Model

Không có. Gói này phân tích dòng lệnh của chính tiến trình trước khi bất kỳ session nào tồn tại.

#### Tác động KV Cache

Không có; gói này không lắp ráp cũng không gửi yêu cầu provider.

## Hạn chế đã biết và công việc hoãn lại

- **Flag của launcher phải được viết trước tham số ứng dụng**: việc phân tách dựa trên vị trí, token đầu tiên mà launcher không nhận ra chính là điểm bắt đầu của tham số lớp trong, vì vậy `--patch` viết sau một flag ứng dụng thuộc về ứng dụng. Bộ phân tích của launcher sẽ tiêu thụ một `--`, do đó phải có `--` theo nghĩa đen để tham số của ứng dụng cần viết thành `-- --`.
- **Service riêng của ứng dụng không có provider khai báo tĩnh**: dòng tiêu thụ chỉ định nó qua điểm injection thông thường; tổ hợp thiếu provider sẽ thất bại khi kết toán, do entry đang chờ chỉ định service đó, chứ không thất bại khi tải.
- **Nếu patch của người dùng thay thế toàn bộ `config` của một dòng, biểu thức trong đó cũng sẽ bị mất theo**: flag thắng thế là giá trị viết cạnh biểu thức, chứ không phải kết quả sau khi người dùng thay thế biểu thức bằng giá trị nghĩa đen; giữ nguyên biểu thức mới giữ được thứ tự ưu tiên của flag.
