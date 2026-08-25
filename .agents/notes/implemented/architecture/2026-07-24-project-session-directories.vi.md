# Agent Note: Thư mục session nhóm theo project

Status: implemented

[English](2026-07-24-project-session-directories.md) | Tiếng Việt

## Vấn đề

Thư mục gốc lưu trữ có thể chỉ phục vụ một project, cũng có thể được nhiều project dùng chung, hoặc là thư mục tạm hay thư mục tập trung. Thư mục phân nhóm thu được từ việc băm cwd đáp ứng được mọi kiểu triển khai này, nhưng lập trình viên không thể nhận ra project từ tên thư mục, nên thư mục gốc dùng chung rất khó duyệt.

Mỗi session JSONL cũng được đặt trực tiếp dưới dạng một tệp đơn trong thư mục phân nhóm theo project. Bố cục này không cung cấp thư mục sở hữu cho các sản phẩm session khác như metadata, tệp đính kèm, tệp tràn hay trạng thái phối hợp.

## Quyết định

Backend JSONL lưu session theo khoá project dễ đọc, và cấp cho mỗi session một thư mục riêng:

```text
<configured-root>/
  --<normalized-cwd>--/
    <encoded-session-id>/
      session.jsonl.zstd
```

Chế độ thô dùng `session.jsonl`, session không có cwd dùng `_no-cwd`. Dấu phân tách đường dẫn hệ thống tệp và dấu phân tách ổ đĩa được chuyển thành `-`, các code unit không an toàn dùng `~XXXX`, còn tên dễ đọc thì bị giới hạn độ dài, để đảm bảo mục thư mục không vượt quá giới hạn của hệ thống tệp.

Khoá project cố ý không mang hậu tố băm. Điều này tuân theo quy ước dễ đọc thường gặp ở coding agent (tác tử), khiến bản thân đường dẫn project sau chuẩn hoá chính là tên thư mục đầy đủ. Quá trình chuẩn hoá có mất mát: các đường dẫn như `/a/b-c` và `/a-b/c`, hoặc những đường dẫn dài có cùng tiền tố được giữ lại, sẽ dùng chung một thư mục project. Các session id khác nhau vẫn chọn thư mục session khác nhau; dùng lại cùng một session id vẫn tạo thành xung đột lưu trữ và hệ thống sẽ từ chối.

Trên hệ thống tệp không phân biệt chữ hoa chữ thường, các khoá project khác nhau về kiểu chữ cũng có thể trỏ tới cùng một thư mục vật lý. Chỉ khi việc chuẩn hoá đường dẫn hệ thống tệp phân giải đường dẫn đã phát hiện và đường dẫn kỳ vọng về cùng một transcript (bản ghi văn bản) thì việc xác thực định danh mới chấp nhận biến thể chính tả này. Nếu đường dẫn sau chuẩn hoá khác nhau thì vẫn bị coi là lưu trữ hỏng; do đó, ngay cả khi tồn tại alias theo kiểu chữ, việc kiểm tra xung đột cùng một id trên kho lưu trữ có phân biệt chữ hoa chữ thường cũng không được nới lỏng.

Thư mục gốc do cấu hình triển khai quyết định. Bố cục này không chọn thư mục gốc toàn cục, cũng không yêu cầu các project dùng chung thư mục gốc. Khi triển khai chọn lưu trữ tập trung, tên thư mục vẫn giúp nhận ra đường dẫn project dễ dàng; khi dùng thư mục gốc cục bộ theo project, cấu trúc tất định tương tự cũng được áp dụng.

Session id đã mã hoá dùng để đặt tên cho thư mục sở hữu, chứ không phải cho chính tệp transcript. `SessionPersistence.locate()` vẫn trả về đường dẫn transcript cố định, nhờ đó giữ nguyên ngữ nghĩa của hook `transcript_path` và `DSH_SESSION_JSONL`. Quá trình phát hiện bỏ qua các mục khác trong thư mục session, nên sau này khi backend thêm các sản phẩm riêng của session thì không cần thay đổi bố cục lần nữa.

Việc hiện thực hoá trễ vẫn lấy transcript làm ranh giới: `create()` không thực hiện I/O hệ thống tệp, lần ghi thêm đầu tiên sẽ tạo thư mục project và thư mục session trước, rồi mới công bố transcript theo cách không xung đột. Thư mục rỗng không được liệt kê thành session. Backend báo cáo lỗi bố cục một cách tường minh và từ chối các sản phẩm phẳng `<project>/<id>.jsonl*`; định dạng tiền phát hành không cung cấp di trú dữ liệu tự động.

## Các phương án đã cân nhắc

**Giữ nguyên băm cwd mờ.** Cách này giữ tên thư mục ngắn gọn, nhưng khi nhiều project dùng chung một thư mục gốc lưu trữ thì không đáp ứng được nhu cầu duyệt theo đường dẫn project.

**Đặt tệp session trực tiếp vào từng thư mục project.** Cách này nhất quán với tổ chức tệp cơ bản của Claude Code và pi, nhưng không cung cấp ranh giới sở hữu ở cấp session cho các sản phẩm trong tương lai.

**Thêm hậu tố băm chống xung đột.** Cách này phân biệt được các đường dẫn có cùng dạng chuẩn hoá, nhưng khiến tên thư mục không còn chỉ là đường dẫn project sau chuẩn hoá. Quy ước được chọn chấp nhận việc gom nhóm project có mất mát để đổi lấy tên đơn giản và dễ nhận ra hơn.

**Bắt buộc dùng thư mục gốc tập trung.** Không áp dụng, vì vị trí lưu trữ thuộc về cấu hình triển khai. Việc gom nhóm theo project hữu ích khi thư mục gốc được dùng chung, và cũng không gây tác động tiêu cực khi không dùng chung.

**Nạp đồng thời cả bố cục phẳng lẫn bố cục thư mục.** Không áp dụng, theo nguyên tắc không cung cấp khả năng tương thích ở giai đoạn tiền phát hành. Chỉ chấp nhận một bố cục giúp việc kiểm tra định danh và quá trình phát hiện luôn tất định.

## Hệ quả

Kho lưu trữ dùng chung có thể được duyệt qua tên project dễ nhận ra, còn thư mục gốc cục bộ và thư mục gốc tuỳ chỉnh vẫn tiếp tục giữ được sự tự do cấu hình hiện có. Mỗi session đều có một thư mục để backend sau này đặt các sản phẩm riêng của mình, còn các bên tiêu thụ transcript hiện tại vẫn nhận được đường dẫn tệp.

Tên thư mục project dài hơn so với băm cwd gồm 12 ký tự thập lục phân trước đây. Khi đường dẫn rất dài, tên thư mục chỉ hiển thị phần tiền tố bị giới hạn độ dài. Việc di chuyển project thường sẽ chọn thư mục khác, nhưng theo thiết kế, các chuỗi cwd khác nhau nếu chuẩn hoá thành cùng một tên thì sẽ dùng chung một thư mục project.
