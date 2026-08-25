# Agent Note: code-runtime seam sở hữu tập loại trừ định danh khả chuyển

Status: implemented

[English](2026-07-31-code-runtime-portable-identifier-seam.md) | Tiếng Việt

## Problem

code-runtime seam cam kết: danh sách namespace binding hợp lệ trên một backend cũng hợp lệ trên mọi backend, nhờ đó bên tiêu thụ Code Mode có thể giao cùng một tập binding cho bất kỳ runtime nào đã đăng ký mà không cần biết ngôn ngữ của nó. Backend đầu tiên `dsh-code-runtime-worker-thread` đã tự ý sở hữu các quy tắc định danh vốn thực thi một phần cam kết này: một regex `IDENTIFIER` cho phép ký tự `$` đặc thù của JS, một tập `RESERVED_WORDS` chỉ chứa từ khóa ECMAScript, và một tập `RESERVED_ERROR_PROPERTIES` chứa ba slot `Error` của JS. Các quy tắc này mô tả ngôn ngữ của chính worker, chứ không phải quy ước khả chuyển của seam.

Một backend thứ hai viết cho ngôn ngữ khác (CPython) hoặc phải khai báo lại quy tắc riêng của mình — khiến `lambda` lọt qua worker nhưng thất bại trên Python, hoặc khiến `$tools` lọt qua worker nhưng thất bại trên mọi backend không phải JS — hoặc phải import quy tắc của worker, qua đó đảo ngược phụ thuộc, khiến một Service Provider thò tay sang một Service Provider anh em khác. Cả hai cách đều không làm cho cam kết khả chuyển trở thành sự thật: nó chỉ đúng với đúng backend mà bên gọi tình cờ đã kiểm thử.

## Decision

Package Service Definition (`@deepseek-ai/dsh-code-runtime`) export quy ước loại trừ định danh khả chuyển dưới dạng bốn hằng số có tên, mỗi Service Provider import chúng thay vì khai báo lại:

- `PORTABLE_RESERVED_WORDS` — hợp của các từ khóa dành riêng của ECMAScript và Python. Bất kỳ tên global của namespace hay tên error-class nào khớp một trong số đó đều bị từ chối trên mọi backend, nên `lambda` bị từ chối ngay cả khi nó là tên tham số JS hợp lệ. Thêm một ngôn ngữ mới tức là mở rộng hợp này, và đó là một lần rà soát phá vỡ có chủ ý đối với các tên binding hiện có.
- `RESERVED_BINDING_GLOBALS` — các global mà một backend nào đó sở hữu trong namespace chương trình: `console` (phần bắt log của worker), `__dsh_main__`/`__builtins__`/`__name__` (wrapper và các global module dựng sẵn của Python bootstrap), cùng `__debug__` (không phải slot được seed, mà là hằng số biên dịch của CPython; việc gán sẽ bị từ chối, nên global tiêm vào dưới tên đó là không thể chạm tới — cùng một kiểu phân mảnh khả chuyển, chỉ khác cơ chế). Bị từ chối trên mọi backend, khiến danh sách namespace không thể chọn một tên dùng được trên backend này nhưng xung đột trên backend khác.
- `RESERVED_ERROR_MEMBERS` — các tên error-member mà mọi backend đều từ chối: các slot `Error` của JS (`name`, `message`, `stack`) và các thành viên của giao thức exception Python (`args`, `with_traceback`, `add_note`).
- `DUNDER_MEMBER` — regex dạng dunder (`__x__`, phần giữa không rỗng), bị từ chối trọn vẹn khi làm error member, vì một số trong đó là các descriptor bị ràng buộc của CPython và tập chính xác của chúng là chi tiết theo phiên bản interpreter.

Service Definition đồng thời thu hẹp tập con định danh khả chuyển về `[A-Za-z_][A-Za-z0-9_]*` (được ghi lại trên `CodeBindingNamespace.global` và `CodeBindingErrorClass`), loại bỏ ký tự `$` đặc thù của JS. worker tiêu thụ trực tiếp các hằng số này theo đúng tên export của chúng — tên binding-global và error-class dùng `PORTABLE_RESERVED_WORDS`, các slot do backend sở hữu dùng `RESERVED_BINDING_GLOBALS`, error member dùng `RESERVED_ERROR_MEMBERS` cộng `DUNDER_MEMBER` — không còn đặt bí danh cục bộ; regex `IDENTIFIER` của nó bỏ `$`.

Dù worker là backend duy nhất đã bàn giao, các hằng số này vẫn được đặt ở Service Definition: điểm mấu chốt chính là quy ước đó độc lập ngôn ngữ, và được sở hữu bởi một tầng cao hơn bất kỳ ngôn ngữ đơn lẻ nào. Service Provider nào vi phạm nó mới là bug, còn tập chia sẻ chính là nơi người rà soát tra cứu ý nghĩa của «khả chuyển».

## Scope

Quyết định này chỉ bàn giao phần mở rộng Service Definition và việc worker áp dụng nó. Bộ render `py-types` và phần điều phối ngôn ngữ của Code Mode thuộc về [note điều phối ngôn ngữ](../feature/2026-07-31-code-mode-language-dispatch.md); backend Python chưa tồn tại. Vì vậy README của Service Definition giữ nguyên cách diễn đạt chỉ mô tả worker: liên kết tới một README `dsh-code-runtime-python` không tồn tại sẽ làm hỏng gate kiểm tra liên kết chết.

`RESERVED_BINDING_GLOBALS` mã hóa thiết kế cụ thể của Python bootstrap trước cả khi backend đó tồn tại: nó seed đúng `__builtins__`/`__name__`, và gói chương trình bên dưới `__dsh_main__`. Bất kỳ backend Python nào seed thêm global module (`__doc__`, `__loader__`, `__spec__`, `__file__`, `__package__`, v.v.) đều phải mở rộng tập này trong cùng một thay đổi, đúng như việc thêm một ngôn ngữ mới thì phải mở rộng `PORTABLE_RESERVED_WORDS` — cái tên mà bootstrap seed nhưng lại không nằm trong tập chính là sự phân mảnh khả chuyển mà quy ước này muốn ngăn chặn.

## Alternatives considered

**Mỗi backend khai báo tập loại trừ của riêng mình.** Bị từ chối: điều này khiến cam kết khả chuyển chỉ đúng theo từng backend. Danh sách binding mà bên gọi đã kiểm thử trên worker có thể bị Python từ chối, và đó chính là sự phân mảnh mà seam tồn tại để ngăn chặn.

**Backend Python import các hằng số của worker.** Bị từ chối: điều này đảo ngược phụ thuộc — một Service Provider của seam sẽ thò tay sang triển khai anh em vì một quy ước mà cả hai đều không sở hữu. Quy ước thuộc về tầng trên cả hai, tức là seam.

**Giữ `$` trong tập con định danh khả chuyển.** Bị từ chối: `$` là cách viết đặc thù của JS. Cho phép nó sẽ khiến `$tools` lọt qua worker nhưng thất bại trên mọi backend không phải JS, phá vỡ tính khả chuyển để đổi lấy một lợi ích thuần túy bề mặt.

## Consequences

Được: một nơi duy nhất — package Service Definition — định nghĩa thế nào là một tên binding khả chuyển, và mọi backend thực thi cùng quy ước đó thông qua import. Danh sách namespace hợp lệ trên một backend thì hợp lệ trên mọi backend, và điều này kiểm chứng được, chứ không phụ thuộc vào sự tình cờ bên gọi đã kiểm thử backend nào.

Cái giá: những bên gọi worker hiện đang dùng global chứa `$` giờ sẽ thất bại ở bước kiểm tra định danh. Dưới lập trường tiền phát hành, đây là một lần chỉnh sửa thiết kế nền tảng, chứ không phải phá vỡ tương thích cần shim. Bộ test misuse Service Definition của worker bổ sung các ca như `$tools`, thành viên exception Python (`args`), dunder (`__dict__`) và một global do Python sở hữu (`__dsh_main__`), chứng minh từ phía worker rằng tập chia sẻ thực sự được thực thi.
