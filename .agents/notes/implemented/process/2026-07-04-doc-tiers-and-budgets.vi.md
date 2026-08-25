# Agent Note: Cấu trúc, tầng và ngân sách tài liệu

Status: implemented

[English](2026-07-04-doc-tiers-and-budgets.md) | Tiếng Việt

## Vấn đề

Dù đã có hướng dẫn viết lách, tài liệu thường trực vẫn liên tục tích tụ các quy tắc trùng lặp, những sự cố được kể đi kể lại, các ánh xạ gói lặp lại, cùng những tóm tắt Agent Note đã cũ. Hướng dẫn đó cũng không nói rõ vị trí của một tài liệu trong hệ thống tầng giới hạn phạm vi nội dung của nó ra sao, và nội dung dẫn dắt người đọc học theo trình tự khác gì so với tài liệu để tra cứu. Chỉ dựa vào việc duyệt thì không ngăn được sự phình to này, nên ngoài hệ phân loại tài liệu, repo còn cần một bộ ngân sách cưỡng chế tự động được.

## Quyết định

- **Cấu trúc tuân theo cây tài liệu.** [docs/AGENTS.md](../../../../docs/AGENTS.md) là chuẩn tài liệu: một tài liệu chịu trách nhiệm mang nội dung chi tiết cho chủ đề của nó, chỉ tóm lược mục đích, trách nhiệm và hành vi ở mức cao của các mục con trực tiếp, và liên kết tới tài liệu sở hữu nội dung ở tầng sâu hơn. [Agent Note](../../README.md) vẫn không chịu ràng buộc của quy ước cấu trúc này. Mỗi tài liệu hướng tới con người hoặc là một tutorial dẫn dắt người đọc theo trình tự để đạt một kết quả, hoặc là một tài liệu tham chiếu (reference) có phạm vi tra cứu rõ ràng; [khám nghiệm sự cố (postmortem)](../../../../docs/postmortem/README.md) là tài liệu tham chiếu có phạm vi giới hạn ở một sự cố đơn lẻ, với dòng thời gian ghi lại bằng chứng. Tutorial giới thiệu khái niệm theo thứ tự phụ thuộc tiên quyết, gắn với kiến thức khởi điểm của người đọc.
- **Phân tầng sao cho mỗi sự thật chỉ thuộc về một nơi.** Chuẩn tài liệu phân cho mỗi tầng Markdown một trách nhiệm duy nhất, cấm nhắc lại sự thật bên ngoài tầng sở hữu nó, và bao gồm một danh sách kiểm tra dư thừa dùng khi viết hoặc duyệt bất kỳ tài liệu nào.
- **Một lối vào sản phẩm duy nhất.** README gốc chịu trách nhiệm cho lối chạy gói được khuyến nghị, lối chạy từ mã nguồn thay thế, và cách dùng `dsh plugin --profile` vắn tắt. Hướng dẫn người dùng đã xuất bản bắt đầu bằng một tác vụ ngay bên trong Web UI đang chạy, rồi liên kết tới tutorial riêng cho các giao diện khác hoặc tới nơi sở hữu tài liệu tham chiếu về phát triển plugin và cấu hình nâng cao, chứ không lặp lại các bước khởi động Web.
- **Cổng ngân sách phạm vi hẹp và nghiêm ngặt.** [scripts/verify-doc-budgets.ts](../../../../scripts/verify-doc-budgets.ts) gia nhập `doc-sync`: mọi tài liệu được liệt kê trong [scripts/doc-budgets.manifest.json](../../../../scripts/doc-budgets.manifest.json) đều phải nằm dưới giới hạn số từ của nó (theo ngữ nghĩa `wc -w`, đếm toàn bộ tệp); tệp có ngân sách mà thiếu cũng làm cổng thất bại, khiến việc đổi tên không thể âm thầm đánh rơi ngân sách của nó. Phạm vi cố ý chỉ bao gồm các tài liệu thường trực dễ phình to — các tệp `AGENTS.md` ở thư mục gốc và trong cây con, `architecture.md`, `packages/README.md`, cùng các tài liệu chính sách thường trực mà chúng chuyển nội dung sang (`docs/testing.md`, `docs/defensive-patterns.md`). Tài liệu tham chiếu, Agent Note và README của gói không có ngân sách: miễn mỗi dòng đều là sự thật, thì độ dài ở những chỗ đó là hợp lý; việc duyệt và danh sách kiểm tra dư thừa lo phần ràng buộc chúng.
- **Giới hạn là lằn ranh cưỡng chế chỉ tiến không lùi.** Tài liệu đạt hoặc dưới mục tiêu giữ ít nhất 5% dư địa khi giới hạn được hạ dần; tài liệu vượt mục tiêu thì giữ giới hạn đóng băng, không được tăng cho tới khi đạt mục tiêu (`AGENTS.md` gốc ≤ 1.600 từ; `architecture.md` ≤ 1.800; `AGENTS.md` cây con ≤ 600, riêng `packages/AGENTS.md` ≤ 650, `docs/AGENTS.md` ≤ 1.250; `packages/README.md` ≤ 600). Khi cổng đỏ, hãy chuyển nội dung đi hoặc nén lại; chỉ nâng giới hạn khi nêu lý do rõ ràng trong mô tả PR (Pull Request).
- **Skill (kỹ năng) quy trình tinh gọn, quy ước thuộc về tài liệu.** [.agents/skills/dsh-doc-standards](../../../skills/dsh-doc-standards/SKILL.md) mang quy trình đặt tài liệu, kiểm toán và xử lý khi cổng thất bại, và lấy chuẩn tài liệu làm nguồn sự thật — cùng cách phân công như giữa [dsh-translate-docs](../../../skills/dsh-translate-docs/SKILL.md) và các quy ước i18n.

## Các phương án từng cân nhắc

- **Chỉ dựa vào skill và kỷ luật duyệt, không đặt cổng**: bác bỏ. Sự phình to nói trên xảy ra đúng trong lúc quy tắc hiện hành và sự chú ý khi duyệt đều đã có sẵn; một quy tắc hành văn không có bảo đảm tự động đã được chứng minh là không trụ được ở đây, trong khi [lập trường về cổng chất lượng](2026-06-11-quality-gates.md) của chính repo này cho rằng bất biến nào đáng giữ thì đáng được mã hóa.
- **Đặt giới hạn cho toàn bộ mọi tầng tài liệu**: bác bỏ. Giới hạn cào bằng lại đúng là trừng phạt những tài liệu dài chính đáng (như ma trận tính năng hay danh mục kiểu, nơi mỗi dòng đều là sự thật), và sinh ra các thay đổi ngoại lệ theo từng tệp, huấn luyện người đóng góp phê duyệt việc nâng giới hạn một cách máy móc.
- **Duy trì tutorial nhập môn riêng cho từng cửa ngõ tài liệu**: bác bỏ. Các bước thiết lập trùng lặp sẽ phân kỳ về thứ tự lệnh, kết quả đầu tiên và định vị sản phẩm. Lối đi README ngắn nối vào hướng dẫn theo tác vụ vừa làm rõ mối nối giữa hai bên, vừa không phải duy trì những tutorial cạnh tranh nhau.
- **Đặt chuẩn bên trong skill**: bác bỏ. Quy ước thuộc về tài liệu, quy trình thuộc về skill; nếu chuẩn bị nhét vào SKILL.md thì những agent (tác tử) không gọi skill đó mà sửa tài liệu trực tiếp sẽ không thấy nó, trong khi `docs/AGENTS.md` vốn đã được nạp như chỉ dẫn cây con cho bất kỳ ai làm việc dưới `docs/`.

## Hệ quả

- Thêm nội dung vào tài liệu chịu ràng buộc ngân sách đòi hỏi phải dọn chỗ: chuyển phần mới thêm về đúng nơi của nó theo hệ phân loại rồi để lại liên kết, hoặc nén lại hành văn sẵn có để lấy chỗ. Chỉ thêm mà không bớt sẽ khiến CI thất bại.
- Việc duyệt cấu trúc kiểm tra quan hệ sở hữu và thể loại tài liệu trước, rồi mới biên tập ở mức câu chữ, khiến chi tiết thuộc tầng thấp hơn được chuyển về tài liệu sở hữu nó, thay vì được gọt giũa ở sai vị trí.
- Người đọc sẽ vào Web UI chạy được trước, rồi mới gặp thực thi headless, nhúng SDK, profile tùy chỉnh hay tệp settings trực tiếp; các cửa ngõ đó vẫn tiếp cận được từ nơi sở hữu tài liệu tham chiếu tương ứng.
- Tài liệu chịu ràng buộc ngân sách mà vẫn vượt mục tiêu thì không được tăng; sau khi đạt mục tiêu, 5% dư địa làm việc sẽ được khôi phục.
- Số từ là một chỉ số đại diện thô, và điều đó được chấp nhận có chủ ý: nó không phán xét được chất lượng, nhưng nó buộc quyết định di chuyển nội dung phải xảy ra ngay lúc nội dung được thêm vào — chính là lúc tác giả có đủ ngữ cảnh để đặt nó cho đúng chỗ.
