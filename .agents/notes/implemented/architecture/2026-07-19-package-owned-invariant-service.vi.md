# Agent Note: Giao ước service bất biến do gói sở hữu

Status: implemented

[English](2026-07-19-package-owned-invariant-service.md) | Tiếng Việt

## Vấn đề

Việc kiểm tra bất biến lúc chạy trải rộng qua quỹ đạo phiên, trạng thái agent (tác tử thông minh), dispatch theo phạm vi và việc dựng lại yêu cầu. Nếu đặt mọi kiểm tra vào một gói chẩn đoán duy nhất, gói đó buộc phải import từ vựng của những lĩnh vực sản phẩm chẳng liên quan gì đến nhau, và test cũng rời xa chủ sở hữu thật sự; mỗi lần một gói sản phẩm thêm hay bớt kiểm tra, đều phải sửa gói trung tâm.

Những triển khai chọn bật chẩn đoán còn cần mức kiểm soát mịn hơn "có nạp một plugin hay không". Loại tổ hợp này mang theo các đóng góp bất biến đã biết, đồng thời cho phép tắt toàn cục hoặc chọn chẩn đoán theo từng gói. Khi một gói được nạp muộn hơn hoặc nạp lại dưới HMR (thay thế mô-đun nóng), kết quả lựa chọn phải giữ nguyên; và những đóng góp bị lọc ra cũng không được để hai plugin chiếm cùng một tên gói trong im lặng.

Quyền sở hữu theo gói còn phải phủ trọn vẹn. Nếu không có quy tắc cơ giới ở cấp kho mã, một gói mới có thể thiếu plugin đi kèm, thiếu phụ thuộc hoặc cấu hình phát hành, và mãi không lọt vào phạm vi chẩn đoán cho tới khi người bảo trì phát hiện ra lỗ hổng đó.

## Quyết định

### Một service registry, đóng góp thuộc về gói

`@deepseek-ai/dsh-invariants` là plugin service Cordis độc lập với sản phẩm, đăng ký `ctx.invariants`. Nó chỉ chịu trách nhiệm về cấu hình, tính duy nhất khi đăng ký, vòng đời fiber con và thất bại có quy thuộc về gói; nó không import các gói session, agent, scope hay agent-loop, và cũng không chứa kiểm tra của những gói đó.

Mỗi gói trong workspace đều phát hành plugin đi kèm `./invariant`, đăng ký chính tên gói npm đầy đủ và chính xác của mình. Nếu chủ sở hữu có quan hệ sự kiện hoặc dữ liệu khả biến có ý nghĩa thì companion sẽ kiểm tra quan hệ đó; nếu không, installer rỗng phải mang lời giải thích riêng của chủ sở hữu ấy. [Agent Note về giao ước lúc chạy](2026-07-19-package-invariant-runtime-contracts.md) tiếp theo cấm các chỗ giữ chỗ quyền sở hữu do sinh mã và các khẳng định hình thái API được chế ra. Entry gốc của gói không import hay đăng ký chẩn đoán một cách ngầm định, nên việc nạp gói gốc không làm thay đổi kiểm tra lúc chạy, và cũng không đòi hỏi service bất biến phải tồn tại.

### Cấu hình và lựa chọn

```ts
interface Config {
  enabled?: boolean
  package_allowlist?: string[]
  package_blocklist?: string[]
}
```

Giá trị mặc định là `enabled: true`, `package_allowlist: []` và `package_blocklist: []`. Quy tắc lựa chọn trên tên đăng ký đầy đủ:

```ts
export function selected(enabled: boolean, package_allowlist: RegExp[], package_blocklist: RegExp[], packageName: string): boolean {
  return enabled
    && (
      package_allowlist.length === 0
      || package_allowlist.some(pattern => pattern.test(packageName))
    )
    && !package_blocklist.some(pattern => pattern.test(packageName))
}
```

Khớp blocklist được ưu tiên hơn khớp allowlist. Mỗi mục là một chuỗi nguồn biểu thức chính quy JavaScript phân biệt hoa thường, được biên dịch qua `new RegExp(pattern)`. Trừ khi bên gọi cung cấp `^` và `$`, việc khớp không neo; hệ thống không phân tích cú pháp bao bởi dấu gạch chéo hay các flag. Lúc khởi động, service từ chối các chuỗi nguồn rỗng, có khoảng trắng ở đầu/cuối, không hợp lệ, hoặc trùng lặp trong cùng một danh sách. Một chuỗi nguồn hợp lệ nhưng không khớp gói nào đang được nạp vẫn hợp lệ, bởi thứ tự đăng ký, việc nạp muộn và HMR không nên làm thay đổi tính hợp lệ của cấu hình.

### Đăng ký và quy thuộc thất bại

Ranh giới đăng ký công khai là `ctx.invariants.register(packageName, installer)`. Ngay cả khi bộ lọc cấm cài đặt, nó vẫn giữ đúng một đăng ký hoạt động duy nhất cho mỗi tên gói npm đầy đủ, và trả về effect disposer. Gỡ plugin đi kèm hoặc gỡ service đều giải phóng tên đăng ký cùng toàn bộ trạng thái đóng góp.

Các installer được bật sẽ chạy trong một fiber con Cordis riêng do service sở hữu. `InvariantInstaller.inject` khai báo tường minh API service của fiber con đó; registry không mang metadata phụ thuộc riêng cho sản phẩm. Service sẽ chờ promise mà installer trả về trước khi coi là đăng ký thành công, nên các kiểm tra khởi động bất đồng bộ vẫn có tính giao dịch. Installer nhận một reporter `fail(message)` đã được ràng buộc. Gọi nó sẽ ném ra một lớp con của `Error` tên là `InvariantError`, giữ mã ổn định `INVARIANT` và ghi lại `packageName` của bên đăng ký; lỗi này không kế thừa lớp lỗi cơ sở nào trong gói sản phẩm.

Việc khởi động đăng ký có tính giao dịch. Nếu installer thất bại sau khi đã đăng ký listener, fiber con sẽ được giải phóng trọn vẹn và nhả tên gói trước khi lỗi lan ra ngoài. Đăng ký bị lọc thì không tạo fiber con, nhưng vẫn giữ chỗ tên cho tới khi dispose (giải phóng tài nguyên). Khi plugin đi kèm được nạp lại, nó luôn bắt đầu từ trạng thái installer sạch; các đóng góp có trạng thái sẽ dựng lại đường cơ sở từ service sở hữu chúng.

Entry plugin dạng hàm cũ và constructor `InvariantError` một tham số không được giữ lại như API tương thích. Kho mã đang ở giai đoạn tiền phát hành, nên mọi bên gọi được di trú cùng lúc sang service và lỗi có quy thuộc về gói.

### Lô plugin đi kèm có trạng thái đầu tiên và quyền sở hữu trọn vẹn

| Entry đi kèm | Tên đăng ký | Kiểm tra được sở hữu |
|---|---|---|
| `@deepseek-ai/dsh-session/invariant` | `@deepseek-ai/dsh-session` | Chuỗi thứ tự của phiên, quan hệ bao quanh lượt/bước, và quỹ đạo call/result trong cùng một bước |
| `@deepseek-ai/dsh-agent/invariant` | `@deepseek-ai/dsh-agent` | Chuyển trạng thái agent |
| `@deepseek-ai/dsh-scope/invariant` | `@deepseek-ai/dsh-scope` | Sự tồn tại của carrier trong sự kiện phạm vi và tính nhất quán của subject |
| `@deepseek-ai/dsh-agent-loop/invariant` | `@deepseek-ai/dsh-agent-loop` | Dựng lại yêu cầu mô hình |

Bốn chủ sở hữu này cung cấp lô kiểm tra có trạng thái đầu tiên. Quyết định về giao ước lúc chạy tiếp theo bổ sung kiểm tra cho mười bảy chủ sở hữu khác thực sự có quan hệ sự kiện hoặc dữ liệu khả biến, và ghi nhận companion rỗng có lý do cho các gói còn lại. Mỗi entry đi kèm là một export `./invariant` được đóng gói riêng, có khai báo độc lập và hình thái plugin namespace an toàn với Loader; plugin đi kèm của chính gói service thì import kiểu service cục bộ để tránh tạo ra phụ thuộc vòng vào chính nó.

`verify-package-invariants` phát hiện mọi gói workspace, và từ chối: thiếu mã nguồn plugin đi kèm, dấu hiệu sinh mã, installer rỗng không có giải thích, installer không rỗng mà thiếu hoặc không dùng reporter báo lỗi, tên đăng ký nằm ngoài hoặc không phân giải được, thiếu export `./invariant` hoặc thiếu tệp phát hành, thiếu phụ thuộc ngang hàng (peer dependency) về bất biến, thiếu dev dependency và project reference, cũng như cấu hình build tùy biến bỏ sót entry đi kèm.

### Ánh xạ ngữ nghĩa sự kiện phạm vi

Bảng phân giải subject của sự kiện phạm vi được sinh ra nằm trong `dsh-scope`, kề bên giao ước và bất biến tiêu thụ nó. `gen-scoped-events` dùng TypeScript Program gốc để liệt kê các khai báo `this: Scoped<Base>`, suy ra kiểu khóa định tuyến từ các lời gọi `scopeTarget(base, key)` thật, và đòi hỏi subject payload duy nhất, không nhập nhằng, hoặc một nhãn unsupported tường minh. Ánh xạ lúc chạy được commit không import gói sở hữu sự kiện, nên tính toàn vẹn ngữ nghĩa không làm phình bao đóng phụ thuộc lúc chạy của gói service hay gói scope.

### Tổ hợp ví dụ và đầu ra SDK

Bộ khung agent ví dụ sẽ gắn service cùng bốn subpath đi kèm có trạng thái, và chuyển tiếp `enabled`, `package_allowlist` và `package_blocklist` tới service. Đầu ra tổ hợp Cordis của SDK được sinh ra cũng chứa những mục y hệt. Các mục subpath bổ sung gói npm gốc cài đặt được, mà không nhầm subpath thành tên gói. Theo [quyết định về cấu hình bàn giao](../simplification/2026-08-03-omit-invariants-from-shipped-config.md), cây cấu hình `dsh` TUI và Web được bàn giao sẽ bỏ qua service này cùng plugin đi kèm của nó.

Ràng buộc workspace nhận biết bundle bất biến độc lập; exports của gói, project reference, cấu hình build, khai báo phụ thuộc và lockfile cùng mô tả một bộ metadata phát hành duy nhất. Danh mục cấu hình, đồ thị mô-đun và tài liệu API được sinh ra đều dẫn xuất từ các nguồn này.

## Kiểm thử

Test của service phủ giá trị mặc định, tắt toàn cục, lựa chọn allow/block, thứ tự ưu tiên của blocklist, khớp có neo và không neo, phân biệt hoa thường, cấu hình không hợp lệ, mẫu không khớp gì, đăng ký trễ, sở hữu trùng lặp, dispose, rollback và đăng ký lại dưới HMR. Chủ sở hữu có kiểm tra thực thi được thì giữ hành vi thuận và nghịch ngay bên cạnh mã nguồn companion.

Test tổ hợp phủ việc chuyển tiếp của bộ khung tiêu chuẩn và các mục SDK được sinh ra. Test Loader chốt lại từng namespace đi kèm, còn smoke test Node thuần sau khi build thì phủ export subpath đã biên dịch. Cổng kiểm tra độ tươi của sự kiện phạm vi sẽ chạy lại phân tích Program ngữ nghĩa.

Mỗi cấu hình Vitest đều nạp một test host; trước khi plugin đầu tiên khởi động trên context Cordis gốc thông thường, host sẽ gắn service được bật tường minh và thêm plugin đi kèm của gói đang được test. Một topo đầy đủ sẽ gắn plugin đi kèm của mọi gói cùng một lúc; các test tập trung của service và của chủ sở hữu tự dựng topo bất biến riêng, nhờ đó phủ được việc tắt, lọc, rollback và nạp lại mà không gây xung đột sở hữu trùng lặp. Test cổng kiểm tra còn thực thi hàm `apply` của từng plugin đi kèm và kiểm chứng rằng nó gọi `register` bằng tên gói trong manifest (bản kê metadata), chứ không chỉ kiểm tra văn bản mã nguồn.

## Các phương án đã cân nhắc

- **Giữ toàn bộ kiểm tra trong `dsh-invariants`.** Không chọn, vì registry vẫn phải import mọi lĩnh vực sản phẩm được kiểm tra, thay đổi của chủ sở hữu vẫn cần sửa ở trung tâm, và test vẫn tiếp tục nằm xa giao ước mà nó bảo vệ.
- **Khi `ctx.invariants` tình cờ tồn tại thì để entry gốc của gói ngầm đăng ký kiểm tra.** Không chọn, vì hành vi của entry gốc sẽ phụ thuộc vào thứ tự kết hợp và sự tồn tại tùy chọn của service, chẩn đoán không chọn được độc lập, và việc nạp gói sẽ giấu đi một effect đăng ký không nằm trong plugin đi kèm tường minh.
- **Tự động phát hiện mọi tệp `invariant.ts` lúc chạy.** Không chọn, vì hệ tệp hay việc phát hiện gói không phải là giao ước sở hữu lúc chạy, sẽ làm ý nghĩa phát hành bundle trở nên mù mờ, và cũng không diễn đạt được thứ tự nạp Cordis tường minh hay việc cài đặt phụ thuộc. Việc sinh và kiểm chứng lúc build cùng test host thì có thể liệt kê cây mã nguồn, vì thứ chúng kiểm chứng là tính toàn vẹn của kho mã, chứ không phải việc kết hợp một bản triển khai đã phát hành.
- **Kiểm chứng các mục allow/block dựa trên tập gói đang được nạp.** Không chọn, vì một mẫu không khớp gì có thể cố ý nhắm tới đóng góp được nạp muộn hoặc nạp qua HMR; thứ tự nạp hiện tại không được quyết định tính hợp lệ của cấu hình.

## Hệ quả

- Gói sản phẩm sở hữu và tự test các khẳng định quan hệ của mình, còn service thì giữ được tính độc lập với sản phẩm.
- Mỗi gói đều gánh chi phí phát hành và phụ thuộc của companion; chỉ những chủ sở hữu có quan hệ lúc chạy có ý nghĩa mới thêm chi phí listener hoặc trạng thái trace.
- Tổ hợp có gắn chẩn đoán có thể tắt toàn bộ kiểm tra hoặc chọn theo tên gói mà không cần sửa cây plugin.
- Mục đi kèm tường minh khiến chi phí chẩn đoán và quyền sở hữu hiện rõ trong cấu hình Cordis và trong exports của gói.
- Mỗi đóng góp thực thi được và được chọn sẽ thêm một fiber con cùng chi phí listener/trạng thái của nó; đóng góp rỗng được chọn thì không thêm chi phí listener hay trạng thái trace, còn đăng ký bị lọc thì chỉ giữ chỗ tên gói.
- Chuỗi nguồn biểu thức chính quy thuộc về cấu hình triển khai, và giữ cố định cho tới khi service được nạp lại.
- Context gốc Vitest thông thường sẽ cài đặt các plugin đi kèm được chọn trong gói đang được test; một topo đầy đủ chỉ trả chi phí toàn bộ fiber con một lần, để phủ việc đăng ký của toàn kho mã.
- Việc kiểm chứng lưu trữ phiên, snapshot, đóng băng, kiểm chứng sự kiện nguồn được tham chiếu và quy tắc chấp nhận surface luôn được bật, không chịu ảnh hưởng của lựa chọn bất biến.
