# Agent Note: Agent soạn preset tự mount để xác thực thành phần cấu tạo của chính mình

Status: implemented

[English](2026-08-11-preset-authoring-agent-validates-its-own-composition.md) | 中文

## Vấn đề

Preset `cordis` đi kèm phát hành `editing-cordis-compositions`, đây là nguồn hướng dẫn duy nhất khi agent soạn preset. Bốn phát biểu trong đó không đúng với thực tế, và hai phát biểu nặng ký nhất lại đúng vào phần mà skill này tự nhận là "quy tắc dễ khiến người ta vấp ngã nhất".

Nó lấy `tool-bash` làm ví dụ cho "tên hàng vi không cho thấy nó publish dịch vụ" — "trông như tool, nhưng thực ra provides `bashEnv`". `tool-bash` không publish bất kỳ dịch vụ nào cả, nó khai báo `inject: ['tools', 'bash', 'systemPrompt', 'bashEnv']`, còn `bashEnv` đến từ hàng vi `shell-env` của chính bản lắp ráp host. Agent làm theo hướng dẫn này sẽ bọc `tool-bash` vào realm `isolate`, khiến hàng vi này vĩnh viễn chờ một dịch vụ bị chính realm của nó chặn lại, toàn bộ preset mount thất bại.

Ví dụ về `isolate` của nó gộp `jobs-local` và `tool-jobs` vào cùng nhóm. `jobs-local` nằm ở mặt phẳng host, còn chính bản lắp ráp đã phát hành đã ghi rõ trong comment của nó: bọc `tool-jobs` vào realm entry-local sẽ khiến `run_in_background` trả lời "background jobs unavailable". Ví dụ đó mâu thuẫn với chính tệp nằm ngay cạnh nó.

Nó mô tả string realm label như thể chia sẻ một instance chung xuyên nhiều subtree. Label chỉ đơn thuần là gia nhập cùng một realm, `provide()` khi đăng ký lần thứ hai dưới cùng một realm symbol vẫn sẽ throw lỗi — comment ở đầu file `standard` đã ghi rõ điều này từ lâu.

Nó bảo agent đọc README của package để xác định một hàng vi có publish dịch vụ hay không. Mỗi package harness đều khai báo `files`, và không package nào khai báo bao gồm chính README của nó, nên trong bản deployment đã cài đặt thì không có README nào cả. Ở đó, chỉ dẫn này hoàn toàn không thể thực hiện được.

Bên dưới bốn điều này còn có một khẳng định về năng lực: agent "không tự mình khởi động được phiên", nên việc xác thực bị thoái hóa thành kiểm tra trường YAML bằng mắt thường, rồi giao kết quả cho người dùng thông qua dấu đỏ trên trang settings. Dấu đó chỉ là kiểm tra cấu trúc ở giai đoạn phát hiện, yếu hơn rất nhiều so với ấn tượng mà câu nói đó tạo ra.

## Quyết định

skill dạy agent tự mount để xác thực thành phần cấu tạo của chính mình thông qua `ctx.agentPresets`, mọi ví dụ còn lại đều lấy từ chính bản lắp ráp đã phát hành trong cùng repo này.

`standingKeyFor(id)` là công cụ xác thực. Nó đi qua `ensureStanding()` — hoàn toàn cùng một lượt mount thật như khi khởi động phiên, chỉ khác là không tạo agent — nên có thể từ chối hàng vi mà package không phân giải được, hàng vi có cấu hình không hợp lệ, hàng vi publish dịch vụ vào root realm, và hàng vi vĩnh viễn không kích hoạt được. Mount thất bại sẽ xóa mục standing và dispose scope của nó, không để lại tồn dư; mount thành công sẽ lắp đúng thế hệ standing mà phiên thật đầu tiên vốn dĩ cũng sẽ lắp. Vì vậy skill sắp xếp bước này thành kiểm tra cuối cùng sau khi hoàn tất chỉnh sửa, chứ không phải vòng lặp qua từng hàng vi.

skill ghi rõ tường minh: trường `broken` của `list()` **không phải** là xác thực. Kiểm tra sức khỏe ở giai đoạn phát hiện chỉ chứng minh được tệp có thể được phân tích bởi phương ngữ của Loader và hàng vi có `name`, cả bốn loại lỗi nêu trên đều vượt qua được kiểm tra đó.

Agent chạm tới dịch vụ roster theo đúng cách mà tài liệu của chính `cordis_mount` mô tả: mount một plugin tạm thời khai báo `inject: ['agentPresets', 'tools']`, và tự đăng ký một tool cho chính mình — vì việc mount chỉ trả về xác nhận của chính nó, còn tool đã đăng ký mới là con đường để kết quả dịch vụ đến được model ở bước tiếp theo. skill đính kèm nguyên văn plugin đó. `agentPresets` nằm trong catalog `cordis_inspect what:"api"` được sinh ra kèm JSDoc đầy đủ, sandbox façade chỉ cho phép dịch vụ dựa trên `fiber.inject` chứ không phải whitelist, nên đường này không có bất kỳ ngoại lệ nào dành riêng cho skill.

`copy(from, id, name)` được chỉ định là công cụ ghi khi soạn thảo, thay cho copy bằng shell: nó xác thực id, từ chối bất kỳ id nào root đã cung cấp, rollback khi thất bại, viết lại `preset.yml` của bản sao, và chạy ở phía host mà không cần nâng quyền sandbox. Ghi chú về nâng quyền sandbox vẫn được giữ lại, chuyển đến đúng nơi thực sự áp dụng — việc chỉnh sửa `agent.cordis.yml` sau đó vẫn nằm ngoài workspace của phiên.

Câu hỏi "một hàng vi có publish dịch vụ hay không" giờ được trả lời bằng `cordis_inspect what:"services"`, nó cho biết fiber đang nắm giữ mỗi dịch vụ còn sống.

Hướng dẫn vẫn giữ `${DSH_HOME:-$HOME/.dsh}/.agent-presets/` như câu trả lời cho "preset của tôi ở đâu", đồng thời chuyển đường dẫn mà agent thực sự đọc hoặc chỉnh sửa sang dùng `list()` hoặc `resolve()`. Viết ra đường dẫn đó là đúng khi nói với người, nhưng sai khi đưa vào tool file: deployment có thể cấu hình thư mục root khác, và `list()` không thể tiết lộ một user root vẫn còn trống.

Đường dẫn này giờ là thuộc tính của package này, chứ không phải thuộc tính của một launcher cụ thể. Trừ khi `includeUserRoot` là false, `AgentPresets` tự suy ra `<dshHome>/.agent-presets` làm root `user`, giống như cách [`dsh-skill-filesystem`](../../../../packages/skill/skill-filesystem/README.md) suy ra `<dshHome>/skills`; `apps/cli` chỉ cung cấp root **đi kèm** — đó là đường dẫn chỉ app đã cài đặt mới phân giải được. Sự bất đối xứng mà nó thay thế từng phải trả giá: khi cả hai root đều do một launcher duy nhất bổ sung vào, roster do `dsh run` khởi động không có root nào cả, việc phân giải `standard` thất bại thẳng (cách sửa lúc đó là mỗi launcher đều phải tự thực hiện patch đó). Root được suy ra sẽ nối vào sau tất cả các root đã cấu hình, nên id đi kèm vẫn che khuất thư mục home directory nếu nó chiếm cùng id, và `writableRoot()` vẫn ưu tiên root `user` đã cấu hình tường minh. Nó chỉ phân giải một lần tại thời điểm khởi tạo: nếu tập root thay đổi giữa một lần `list()` và một lần `copy()` dựa trên kết quả đó, thứ được ghi ra sẽ là thư mục mà bên gọi chưa từng thấy.

Ràng buộc cấm chỉnh sửa những gì được cài đặt kèm bản phát hành, từ một đoạn trong bước soạn thảo được nâng lên thành mục `## Off-limits` ở đầu, và mở rộng thêm để cấm cả việc chỉnh sửa bản lắp ráp host để lách qua. Lệnh gọi tự xác thực mới thêm vào không làm suy yếu điều này: `copy()` từ chối bất kỳ id nào root đã cung cấp, `remove()` từ chối preset được phát hành kèm deployment.

## Measured behavior

Mỗi dòng trong bảng dưới đây đều thu được bằng cách khởi động bản lắp ráp Web đã phát hành, và gọi tool thông qua `ctx.tools.execute` trên agent do `cordis` lắp ráp ra — hoàn toàn không có model tham gia.

| Bản lắp ráp được kiểm | `broken` của `list()` | `standingKeyFor()` |
|---|---|---|
| Hàng vi trỏ đến package không tồn tại | Trống | `Cannot find package '@deepseek-ai/dsh-does-not-exist'` |
| Hàng vi dịch vụ không bọc realm, tên host đã cung cấp | Trống | `service "tasks" has been registered at <LocalJobRegistry>` |
| Hàng vi dịch vụ không bọc realm, tên host chưa cung cấp | Trống | `row(s) published process-global service(s) [workflows]; …` |
| Cùng hàng vi đó đặt trong `isolate` | Trống | Mount thành công |
| Hàng vi consumer không có ai cung cấp dịch vụ | Trống | `1 row(s) did not activate: … waiting for workflows` |
| Hàng vi thiếu trường cấu hình bắt buộc | Trống | `invalid config: $.allowParallelInProgress missing required value` |

Đoạn mã `cordis_mount` mà skill mang theo được thực thi nguyên văn qua registry tool: nó mount thành công, tool `preset_check` của nó xuất hiện trong danh mục của agent lắp ráp ra nó ở lần đọc tiếp theo, trả lời `mounted OK` với preset hợp lệ, và trả lời lý do bị từ chối mount với preset không hợp lệ.

## Các phương án thay thế đã cân nhắc

**Để việc xác thực cho người dùng, chỉ sửa bốn lỗi đó.** Các lỗi này cùng nguồn gốc với khẳng định về năng lực kia — hướng dẫn được viết theo bề mặt công khai cấp preset, chứ không theo những gì agent được lắp ráp ra thực sự chạm tới được — và một agent không thể tự kiểm tra sẽ giao ra một bản lắp ráp mà trang settings cũng không nhìn thấy lỗi của nó.

**Dạy trường `broken` của `list()` như công cụ xác thực.** Đây chính là trường mà trang settings hiển thị, trông như câu trả lời mong đợi. Nó bỏ qua mọi lỗi quan trọng, và chính việc coi nó là xác thực là lý do khiến hướng dẫn gốc trông có vẻ đầy đủ.

**Thêm một tool xác thực preset hạng nhất cho preset.** Đường ghép đã tồn tại sẵn, và được chính schema của `cordis_mount` ghi lại; một tool chuyên dụng sẽ thêm một hàng vi hướng tới model nữa cho một preset vốn dĩ đã có thể chạm tới runtime mà không cần tool chuyên dụng.

## Hệ quả

- Xác thực thành công sẽ để lại một thế hệ standing không bao giờ bị thu hồi, đây chính là cái giá mà [standing mount](../architecture/2026-08-08-per-preset-standing-mounts.md) theo từng thế hệ vốn dĩ đã phải trả cho roster — do agent trả một lần khi kết thúc chỉnh sửa, thay vì do người dùng trả ở phiên đầu tiên.
- skill giờ phụ thuộc vào catalog API do `cordis_inspect` sinh ra để giữ `agentPresets` luôn cập nhật; `verify-cordis-api` trong `doc-sync` là chốt chặn giữ điều này đúng.
- Có hai ví dụ giờ đây tham chiếu đến bản lắp ráp `standard`. Nếu nhóm `delegation` trong tệp đó thay đổi, chúng sẽ bị lệch, mà e2e `web-agent-presets` không bắt được điều đó.
- Bốn phát biểu bị sửa lại từng là minh họa cụ thể duy nhất của skill này cho quy tắc realm. Chọn cách thay thế thay vì xóa bỏ để quy tắc vẫn còn dạy được; ví dụ thay thế chỉ cần đọc một tệp đã phát hành là kiểm chứng được.

## Liên quan

Thay thế điều khoản về hướng dẫn chế độ soạn thảo trong [preset lỗi là hàng vi roster](2026-08-09-broken-preset-roster-rows.md), quyết định về kiểm tra sức khỏe của note đó vẫn còn hiệu lực — note này chỉ lật lại kết luận "agent không khởi động được phiên; dấu đỏ trên trang settings là công cụ kiểm tra của người dùng". Hình thái soạn thảo chỉ-được-copy do [soạn preset chỉ-được-copy](../simplification/2026-08-08-copy-only-preset-authoring.md) phụ trách.
