# Agent Note: DSL schema giá trị JSON thống nhất

Status: implemented

[English](2026-07-20-unified-json-value-schema-dsl.md) | Tiếng Việt

## Vấn đề

Tham số tool dùng một bộ DSL schema tinh gọn phía tác giả, còn output có cấu trúc của subagent/workflow lại dùng một tập con JSON Schema gốc và validator khác. Hai bộ từ vựng này không nhất quán về kiểu root, ràng buộc scalar và cách xác thực; nếu tiếp tục giữ cách chia này, quy ước output tool chuẩn đã gõ kiểu (typed) hoặc phải implement lặp lại hai đường, hoặc chỉ có thể chấp nhận một phần schema mà projection không thể cưỡng chế thực thi.

## Quyết định

`dsh-tools` quản lý thống nhất một bộ từ vựng schema giá trị JSON bằng hai hình thức biểu diễn. `ValueSchemaSpec` là hình thức phía tác giả có thể mô tả bất kỳ kiểu root JSON nào; `ParameterSchemaSpec` là hình thức ánh xạ thuộc tính object ngầm định của nó, mỗi thuộc tính có thể đánh dấu `required: true`. `JsonSchemaNode` là hình thức protocol gốc. Cả hai hình thức đều hỗ trợ string, số hữu hạn, integer, boolean, null, array, object, `enum`/`const` dạng scalar đúng kiểu, và `oneOf` yêu cầu khớp đúng một nhánh; `{ type: 'json' }` chỉ là syntactic sugar phía tác giả, sẽ được biên dịch thành node gốc chỉ có annotation, không áp đặt ràng buộc.

Object phía tác giả tường minh phải khai báo `additionalProperties: true | false`. Object root tham số ngầm định và JSON Schema gốc giữ ngữ nghĩa mở mặc định theo chuẩn. Bản ghi schema chỉ được chứa key chuỗi tự sở hữu và có thể liệt kê (enumerable); mảng schema phải là mảng nội tại (built-in) dày đặc (dense); hệ thống chỉ đọc từ khóa được hỗ trợ từ thuộc tính tự sở hữu. Do đó, prototype tùy chỉnh, ràng buộc kế thừa, symbol và nội dung bổ sung không nhìn thấy được với JSON đều không thể khiến việc biên dịch, projection và xác thực quan sát ra khai báo khác biệt. Container Object và Array nội tại thông thường vẫn được coi là container thông thường khi vượt qua các domain runtime JavaScript khác nhau, còn prototype của subclass và constructor giả mạo vẫn bị coi là object không thông thường.

`InferValue<S>` và `InferArgs<P>` suy luận giá trị TypeScript dựa trên cùng một khai báo, `valueSchemaSpecToJsonSchema()` và `parameterSchemaSpecToJsonSchema()` cũng biên dịch các khai báo này thành JSON Schema. Việc suy luận kiểu chính xác lấy 16 lớp container làm ranh giới, vượt quá thì dùng `JsonValue`, nhờ đó tránh giới hạn stack khởi tạo kiểu (type instantiation) của TypeScript hạn chế độ sâu lồng nhau mà tác giả có thể khai báo. `assertSupportedJsonSchema()` sẽ từ chối từ khóa không được hỗ trợ hoặc đặt sai vị trí; `validateJsonSchemaValue()` thì xác thực tập con được hỗ trợ theo ranh giới `JsonValue` không mất dữ liệu, không cho phép `undefined`, số không âm (negative zero), số không hữu hạn, mảng thưa (sparse array), tham chiếu vòng, object không thông thường, function, symbol và các giá trị khác cần ép kiểu. Việc biên dịch schema phía tác giả, việc assert schema gốc, việc xác thực giá trị, việc render schema sang TypeScript, việc tách tham chiếu registry, cùng việc chuẩn hóa và clone xuyên domain runtime của Cordis động đều dùng work stack tường minh, do đó độ sâu lồng nhau khi chạy chỉ bị giới hạn bởi bộ nhớ khả dụng, không bị giới hạn bởi call stack của JavaScript.

Giới hạn root object thuộc về quy tắc phía tiêu thụ, không thuộc về bản thân từ vựng schema. Output có cấu trúc do phía gọi định nghĩa trong subagent và workflow giữ giới hạn root object qua `assertObjectJsonSchema()` và `ObjectJsonSchema`; output tool có thể dùng bất kỳ kiểu root nào. Việc đăng ký Cordis động sẽ tái dựng schema truyền qua từ các domain runtime JavaScript khác nhau thành giá trị JSON do host sở hữu, giữ nguyên ngữ nghĩa mở mặc định của lớp bọc gốc, và yêu cầu object được khai báo trực tiếp bằng DSL phải chọn rõ ràng cách mở, rồi mới gọi cùng một bộ biên dịch. Ranh giới động sẽ từ chối key bản ghi không nhìn thấy được với JSON và mảng schema không thông thường trước khi chuẩn hóa, do đó sẽ không âm thầm bỏ mất ràng buộc, cũng không kích hoạt logic duyệt (iteration) tùy chỉnh.

## Phương án thay thế

- **Giữ hai hệ thống schema độc lập cho tham số và output có cấu trúc:** không chấp nhận. Mỗi khi thêm một cấu trúc output mới, đều phải sửa riêng việc suy luận kiểu, biên dịch, xác thực và sinh code, và sự lặp lại này không tạo thành ranh giới trách nhiệm có ý nghĩa.
- **Dùng Schemastery để xử lý tham số tool:** không chấp nhận. Schemastery hướng tới xác thực và chuyển đổi qua Standard Schema, chứ không phải sinh JSON Schema. Áp dụng nó sẽ thêm một lớp adapter, mà vẫn không thể tạo ra schema protocol hướng tới mô hình hay từ vựng output dùng chung.
- **Dùng JSON Schema đầy đủ hoặc Ajv:** không chấp nhận. Harness phải từ chối mọi cấu trúc không thể chiếu vào SDK sinh ra và validator; nếu chấp nhận một tập con ngôn ngữ lớn hơn, khả năng cưỡng chế thực thi và hướng dẫn mô hình sẽ không khớp với thực tế.
- **Để mọi object mặc định mở hoặc mặc định đóng:** không chấp nhận. Cả hai lựa chọn đều che giấu một quyết định quan trọng của tác giả. Chỉ có object root tham số ngầm định và schema gốc bên ngoài giữ hình thức cũ mới cố ý giữ giá trị mặc định.
- **Định nghĩa `oneOf` là nhánh khớp đầu tiên:** không chấp nhận. Cách này sẽ khiến thứ tự nhánh thay đổi ngữ nghĩa xác thực, các nhánh chồng lấn cũng sẽ che giấu sự mơ hồ của giá trị.

## Ảnh hưởng

- Việc xác thực tham số, xác thực output, sinh code từ schema sang TypeScript, cổng kiểm tra subagent/workflow và đăng ký động dùng chung một bộ từ vựng được cưỡng chế thực thi.
- Khai báo output có thể suy luận kiểu root là object, array, scalar hay null; output có cấu trúc của subagent/workflow vẫn giữ giới hạn root object tại ranh giới dịch vụ hiện có của nó.
- Cách mở object tường minh và ràng buộc literal đúng kiểu khiến khai báo sai định dạng thất bại nhanh ngay khi viết hoặc đăng ký, thay vì kéo dài tới lần gọi mô hình sau đó mới thất bại.
- Việc suy luận kiểu có giới hạn sẽ giữ lại kiểu chính xác hữu ích cho khai báo thông thường, và làm suy thoái cấu trúc đuôi cực sâu thành `JsonValue`; việc cưỡng chế schema tại runtime vẫn giữ chính xác ở bất kỳ độ sâu nào.
- Tool gốc vẫn có thể đăng ký trực tiếp JSON Schema phạm vi rộng hơn, nhưng việc sinh code thống nhất sẽ coi schema không được hỗ trợ là kiểu chưa biết, không giả vờ có thể cưỡng chế thực thi nó.
- `required: true` của mỗi thuộc tính vẫn là quy ước của tác giả tool; sau khi đường suy luận cũ phơi bày lỗ hổng về tính tùy chọn, việc bao phủ hồi quy (regression) ở cấp kiểu sẽ khóa chặt việc key bắt buộc không được là tùy chọn.
- Test runtime và test biên dịch bao phủ mọi kiểu root, hành vi chồng lấn/không khớp khi cần khớp đúng một nhánh, ngữ nghĩa mở mặc định của schema gốc, cách mở tường minh, giá trị JSON có mất dữ liệu, việc suy luận kiểu, việc lồng nhau sâu trong projection lõi và projection động, key không nhìn thấy được với JSON trong đăng ký động, và mảng schema không thông thường.
