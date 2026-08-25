# Agent Note: Nạp toàn bộ ứng viên chỉ dẫn và khử trùng lặp theo thư mục

Status: implemented

[English](2026-07-21-instruction-load-all-dedup.md) | Tiếng Việt

## Vấn đề

[Plugin agent-instructions](2026-06-24-workspace-context.md) chỉ phân giải ra đúng một file thắng cuộc cho mỗi danh sách ứng viên trong mỗi thư mục: cái tên tồn tại đầu tiên trong `instructionFileCandidates` giành lấy suất cơ sở, rồi [lớp phủ cục bộ](2026-07-21-local-instruction-overlay.md) thêm vào một người thắng nữa. Nhưng `AGENTS.md` và `CLAUDE.md` thường cùng nằm trong một thư mục. Ở phần lớn repo, cái này là symbolic link của cái kia nên nội dung hoàn toàn giống nhau; ở các repo đang trong quá trình chuyển đổi thì chúng là hai file thật độc lập và đã phân kỳ nội dung. Cơ chế ai-đến-trước-thắng-trước sẽ âm thầm vứt bỏ file đã commit không thắng cuộc, khiến một thư mục hợp lý mang hai file chỉ dẫn khác nhau rốt cuộc chỉ phơi bày một trong hai — và phơi bày cái nào lại phụ thuộc vào thứ tự ứng viên chứ không phải nội dung. Yêu cầu đặt ra là đọc cả hai, và chỉ khử trùng lặp khi chúng thực chất là cùng một file.

## Quyết định

Mọi ứng viên tồn tại trong mỗi danh sách đều được nạp — danh sách cơ sở trước, rồi tới danh sách cục bộ — theo thứ tự đã cấu hình. Trong cùng một thư mục, các ứng viên có nội dung giống hệt từng byte sau khi cắt khoảng trắng đầu cuối sẽ được gộp về ứng viên đứng trước nhất trong thứ tự đó, và kết xuất đúng byte gốc của file được giữ lại. Việc khử trùng lặp diễn ra theo từng thư mục chứ không phải toàn cục, và đối xứng giữa danh sách cơ sở với danh sách cục bộ. Cắt khoảng trắng trước khi so sánh giúp dung thứ khác biệt về ký tự xuống dòng ở cuối hay về thụt lề giữa một file và bản sao gần giống của nó, trong khi vẫn kết xuất từng byte của file được giữ lại — đây chính là kiểu so sánh «hết sức thận trọng» mà yêu cầu đòi hỏi.

Symbolic link giờ đi qua cùng luồng xử lý này. Việc tìm chỉ dẫn sẽ phân giải từng ứng viên rồi stat trên đích của nó, thay vì từ chối symbolic link ở đoạn cuối, nên một `CLAUDE.md` là symbolic link trỏ tới `AGENTS.md` cùng cấp sẽ phân giải ra cùng nội dung và được gộp ở đây như bất kỳ bản sao thật nào giống hệt từng byte. Do đó, việc khử trùng lặp theo nội dung sẽ kết xuất bản sao gương bằng symbolic link phổ biến đúng một lần, qua cùng con đường như với bản sao thật. [Ghi chú đi theo symbolic link](2026-07-21-follow-instruction-symlinks.md) sở hữu quyết định đảo ngược đó cùng rủi ro ranh giới tin cậy còn lại của nó.

## Khoá scope chuyển sang chia theo ứng viên

Giờ đây mỗi cặp `(directory, candidateName)` là một scope logic độc lập riêng, được mã hoá thành `directory\u0000candidateName`, trong đó dấu phân tách NUL không thể xuất hiện trong đường dẫn thật. `candidateScopeKey` / `decodeScopeKey` chịu trách nhiệm cho bộ mã hoá này, còn `probeScopeInstruction` thì giải mã tên ứng viên để đọc chính xác file đó. Điều này thay thế khoá scope dạng cột mốc phân tầng mà note về lớp phủ đã đưa vào: một thư mục không còn có «scope cơ sở» và «scope cục bộ», mà mỗi tên ứng viên có một scope, nên `AGENTS.md` và `CLAUDE.md` trong cùng một thư mục là hai scope được hoà giải độc lập với nhau.

Vì một scope giờ chỉ ứng với đúng một file cố định, cơ chế «chuyển ứng viên trong cùng một scope» trước đây — tức một scope `AGENTS.md` lùi về `CLAUDE.md` và ghi tên cũ vào `previousPath` — không còn có thể xảy ra. `previousPath` đã bị gỡ khỏi bản ghi thay đổi, khỏi metadata `context/message` được tuần tự hoá và khỏi văn bản kết xuất; một thay đổi giờ hoặc là `set`, hoặc là `replace` của cùng file đó, hoặc là `remove`. Việc gỡ một ứng viên sẽ phát ra một `remove` cho chính scope của ứng viên đó, còn file cùng cấp khác vẫn giữ nguyên như một scope độc lập.

Việc khử trùng lặp được cưỡng chế trong quá trình hoà giải, chứ không chỉ khi tổ hợp baseline. Mỗi vòng hoà giải sẽ dựng lại theo thứ tự ứng viên một tập hợp «tóm tắt đã cắt khoảng trắng của các file được giữ lại» theo từng thư mục, nên khi một ứng viên đứng trước hội tụ về nội dung của một file nào đó thì một file không hề thay đổi cũng sẽ bị gỡ, còn file cùng cấp trùng lặp mới xuất hiện sẽ bị loại bỏ hoặc gỡ đi. Bộ nhớ đệm phiên bản lưu thêm một `trimmedDigest` bên cạnh tóm tắt nội dung đầy đủ, nhờ vậy đường nhanh có thể phán định lại tính trùng lặp mà không cần đọc lại nội dung.

## Phương án thay thế

**Giữ nguyên ai-đến-trước-thắng-trước cho mỗi danh sách ứng viên.** Bác bỏ: cách này âm thầm vứt bỏ file chỉ dẫn đã commit thứ hai của một thư mục, và khiến người thắng phụ thuộc vào thứ tự ứng viên chứ không phải vào việc các file có thực sự khác nhau hay không — đúng điều bất ngờ mà yêu cầu muốn xoá bỏ.

**Khử trùng lặp toàn cục, xuyên thư mục.** Bác bỏ: cùng một nội dung khuôn mẫu ở hai thư mục khác nhau đều hợp lý nằm trong phạm vi của riêng từng thư mục, và file ở tầng sâu hơn vẫn phải được phơi bày cho công việc diễn ra trong thư mục sâu hơn đó. Gộp xuyên thư mục sẽ giấu đi những chỉ dẫn mà mô hình lẽ ra phải thấy.

**Không cắt khoảng trắng, so sánh thẳng byte gốc.** Bác bỏ: một editor thêm ký tự xuống dòng ở cuối, hay một bản sao sắp xếp lại thụt lề, đều sẽ khiến các file thực chất giống nhau không thể khử trùng lặp. Cắt khoảng trắng trước khi so sánh chính là cái khoá dung thứ mà yêu cầu đòi hỏi, còn file được giữ lại thì vẫn kết xuất đúng byte gốc của nó.

**Đi theo symbolic link để bản sao gương đi qua khử trùng lặp theo nội dung.** Bị bác bỏ cho lần thay đổi này nhằm giữ bất biến «không đi theo», rồi sau đó được chấp nhận riêng: [ghi chú đi theo symbolic link](2026-07-21-follow-instruction-symlinks.md) đã đảo ngược bất biến đó, và từ đó bản sao gương bằng symbolic link được phân giải và đi qua khử trùng lặp theo nội dung như bản sao thật.

## Hệ quả

Một thư mục mang hai file chỉ dẫn thật khác nhau giờ sẽ phơi bày cả hai; một thư mục mà file thứ hai chỉ là bản sao gương thì vẫn chỉ kết xuất một lần, và tình huống symbolic link phổ biến khắp nơi giữ nguyên như cũ. Khác biệt hành vi nhìn thấy được chỉ giới hạn ở các repo đang trong giai đoạn chuyển đổi mang hai file thật khác nhau. Hình thái khoá scope đổi từ cột mốc phân tầng sang chia theo ứng viên, và `previousPath` cũng biến mất khỏi metadata thay đổi được persist; `dsh-session` không cam kết tương thích với session cũ, nên cả hai đều là thay đổi không tốn phí. Dòng trong bộ nhớ đệm phiên bản có thêm trường `trimmedDigest`, và quá trình hoà giải giờ so sánh nội dung đã cắt khoảng trắng theo từng thư mục, nên một file không hề thay đổi có thể bị gỡ do sự hội tụ của file cùng cấp — đây là phép chuyển trạng thái mà [mô hình trạng thái](2026-06-24-workspace-context.md) trước đây không thể sinh ra.
