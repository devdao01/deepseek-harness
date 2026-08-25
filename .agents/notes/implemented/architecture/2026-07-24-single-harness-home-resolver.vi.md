# Agent Note: Bộ phân giải harness home duy nhất

Status: implemented

[English](2026-07-24-single-harness-home-resolver.md) | Tiếng Việt

## Vấn đề

Với câu hỏi "dữ liệu người dùng của DeepSeek Harness được lưu ở đâu", trong harness tồn tại hai quy ước không nhất quán với nhau:

- `@deepseek-ai/dsh-home` phân giải theo `configured ?? $DSH_HOME ?? ~/.dsh`.
- `@deepseek-ai/dsh-home-paths` lại cung cấp **một** `resolveDshHome` **thứ hai**, cùng thứ tự ưu tiên nhưng có thêm phần mở rộng dấu ngã — nó gần như là bản cài đặt trùng lặp của `dsh-home`, nhưng không cổng kiểm tra nào phát hiện ra, vì hai bên thuộc hai package khác nhau, và chúng đã trôi dạt từ lâu (chỉ một bên mở rộng dấu ngã).

Một sự thật xuyên suốt mà có hai bộ phân giải thì có nghĩa là không tồn tại một chính sách home duy nhất.

## Quyết định

Một bộ phân giải duy nhất nắm giữ harness home, đặt tại `@deepseek-ai/dsh-home-paths`, dùng một thư mục gốc duy nhất:

```
explicit configured path  >  $DSH_HOME  >  ~/.dsh
```

`$DSH_HOME` rỗng hoặc chỉ chứa khoảng trắng được coi như chưa được đặt; nếu không, `resolve('')` sẽ âm thầm đặt home vào thư mục làm việc hiện tại. Harness đặt toàn bộ dữ liệu người dùng dưới cùng một thư mục gốc; không có việc tách config/data/cache theo XDG. `dshHomePath(...segments)` ghép các đường dẫn con do bên triển khai chịu trách nhiệm vào bên dưới thư mục gốc đó, và `dsh-app-boot` phơi bày nó cho biểu thức cấu hình `!!js` của Loader trước khi mount các entry, nhờ vậy các tổ hợp mặc định có thể dẫn xuất `sessions` và `storages` mà không cần sao chép bộ phân giải. `dshHomeDisplay()` đặt tên cho thư mục gốc đã phân giải dưới dạng ký hiệu trong các đường dẫn hướng tới người dùng — home mặc định hiển thị thành `~/.dsh`, còn mọi home đã được cấu hình hiển thị thành `$DSH_HOME` — nhờ đó nhãn `AGENTS.md` ở phạm vi toàn cục của người dùng sẽ không bao giờ làm lộ đường dẫn tuyệt đối trên máy. Nó thay thế phần phán đoán tuỳ chỉnh "giá trị mặc định vs `$DSH_HOME`" trong agent-instructions.

`@deepseek-ai/dsh-home` bị xoá. Ba bên tham chiếu tới nó (`dsh-tool-bash`, `dsh-skill-filesystem`, `dsh-agent-spine-demo`) import `resolveDshHome` từ `dsh-home-paths`.

`dsh-telemetry` cùng chính sách home độc lập của nó đã biến mất theo [việc gỡ bỏ chuỗi công cụ project của SDK](../simplification/2026-08-11-remove-sdk-project-toolchain.md), nên bộ phân giải này là chính sách home duy nhất.

## Phương án thay thế

**Giữ lại hai bản sao `resolveDshHome`.** Chúng đã trôi dạt từ lâu (một bên mở rộng dấu ngã, một bên thì không), và mã hoá cùng một sự thật xuyên suốt tới hai lần. Ý nghĩa của tầng `util/` chính là để hợp nhất, nên bộ phân giải trùng lặp là một bug phân kỳ tiềm ẩn.

**Áp dụng XDG (tuân theo `$XDG_CONFIG_HOME`, hoặc tách config/data/cache thành các cây thư mục riêng).** Sau khi cân nhắc thì bỏ, chuyển sang dùng một thư mục gốc hiển nhiên. Sự thật nền tảng duy nhất `$DSH_HOME || ~/.dsh` nhất quán với `~/.claude` / `~/.aws`, không cần phân loại lại từng bên tiêu thụ `~/.dsh` theo hạng mục, và cũng không để lại bất kỳ sự bất đối xứng nào giữa các bộ phân giải cần phải điều hoà.

## Ảnh hưởng

- Một sự thật home duy nhất, một bộ phân giải duy nhất. `dsh-home-paths` là bên sở hữu duy nhất; nhóm `util/` mất đi package `home`.
