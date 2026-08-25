# Agent Note: Chính sách retry request theo từng provider

Status: implemented

[English](2026-07-24-provider-retry-policies.md) | Tiếng Việt

## Vấn đề

Cùng một tiến trình có thể định tuyến request model tới những provider có ràng buộc về độ tin cậy và chi phí khác nhau. Một bộ phân loại lỗi tạm thời duy nhất cùng ngân sách retry hữu hạn không diễn đạt được nhu cầu triển khai này: đa số provider chỉ cần khôi phục có giới hạn, nhưng một trong số đó bắt buộc phải retry liên tục mỗi khi request model thất bại, cho tới khi request thành công hoặc bên gọi hủy bỏ.

Chính sách provider phải bám theo request thực sự thất bại, bao gồm cả route mà `agent/request` đã chọn, chứ không bám theo các option ban đầu của agent (tác tử). Chính sách vô hạn cũng không được lưu giá trị JavaScript `Infinity` vào sự kiện session lâu bền; văn bản lỗi của provider và phần output cục bộ bị loại bỏ đều không được lọt vào request model kế tiếp.

## Quyết định

Mỗi adapter cụ thể đều nhận `retryPolicy` tùy chọn trong cấu hình provider của nó. Adapter chịu trách nhiệm kiểm tra và phân giải chính sách, còn `ctx.llm` thì bắt giữ chính sách tại thời điểm route provider cụ thể đó được đăng ký. Khi lời gọi đi tới ranh giới adapter cuối cùng, `ctx.llm` sẽ gắn vào lời gọi đó chính sách bất biến thuộc về mục đăng ký thực sự cung cấp dịch vụ; ngay cả khi route bị dispose (giải phóng tài nguyên) hay bị thay thế trong lúc request đang diễn ra, agent loop (vòng lặp tác tử) vẫn chuyển chính sách đó cho việc khôi phục bước đã đóng. `@deepseek-ai/dsh-llm-retry` sẽ kết hợp chính sách gắn với lời gọi đó cùng định danh provider đã persist của bước thất bại. Lời gọi chưa tới được adapter cuối cùng thì không có chính sách phục vụ thực tế, nên sẽ ủy quyền cho xử lý phía sau. Provider không cấu hình `retryPolicy` sẽ dùng giá trị mặc định normal.

```yaml
providers:
  - provider: deepseek
    retryPolicy:
      mode: normal
      maxRetries: 2
      retryableCodes: [EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT]
      backoff:
        initialDelayMs: 500
        maxDelayMs: 10000
        jitterRatio: 0.1
  - provider: internal
    retryPolicy:
      mode: always
      backoff:
        initialDelayMs: 1000
        maxDelayMs: 30000
        jitterRatio: 0.2
```

Listener đọc provider từ `request/header` đã persist còn hiệu lực tại thời điểm bước thất bại đóng lại; các thay đổi sinh ra từ những lần khôi phục sau đó không tham gia vào việc lựa chọn, nhưng nó tuyệt đối không phân giải lại chính sách từ registry provider có thể thay đổi. Nó sinh khóa chuẩn tắc dựa trên toàn bộ các trường của chính sách phục vụ thực tế đã phân giải; vì việc có retry được hay không được phán định theo quan hệ thành viên tập hợp, nên khi sinh khóa sẽ sắp xếp `retryableCodes`. Lịch sử retry chỉ được nối tiếp cho cùng một provider và cùng một khóa chuẩn tắc. Vì vậy, ngay cả khi mode không đổi, chỉ cần sau khi thay route mà số lần tối đa, thành viên mã lỗi hoặc backoff khác đi thì bộ đếm retry và độ trễ ban đầu đều bắt đầu lại. Mode normal giữ nguyên hành vi xử lý lỗi tạm thời có giới hạn: nó retry các mã lỗi đã cấu hình, số lần không vượt quá `maxRetries`; các trường hợp khác thì ủy quyền cho xử lý phía sau.

Mode always trước tiên yêu cầu khôi phục ở phía dưới, để những chính sách chuyên biệt như nén ngữ cảnh (compaction) khi tràn có cơ hội tiến triển. Nếu phía dưới quyết định retry thì lấy quyết định đó làm chuẩn. Nếu phía dưới quyết định thất bại hoặc quá trình khôi phục ném lỗi thì lùi về retry vô hạn cùng một request provider; lỗi được ném ra sẽ ghi vào log. Listener retry sẽ giữ và rút cạn các lần khôi phục đã ủy quyền, việc hủy lượt hay dispose plugin chỉ có thể hoàn tất sau khi chúng kết thúc; sau đó listener sẽ thực hiện thao tác abort tương ứng, chứ không áp dụng quyết định đến muộn từ phía dưới. Thành công, hủy lượt và dispose plugin là những đường kết thúc duy nhất.

Độ trễ cục bộ của cả hai mode đều tăng theo cấp số nhân, từ `initialDelayMs` lên tới `maxDelayMs`. `jitterRatio` nhân mỗi giá trị mục tiêu với một mẫu ngẫu nhiên đều trong khoảng `[1 - jitterRatio, 1 + jitterRatio]`, rồi mới áp trần. `Retry-After` dương do provider đưa ra, nếu không vượt trần, thì được giữ chính xác và không thêm jitter. Nếu độ trễ của provider vượt trần, mode normal sẽ ủy quyền cho xử lý phía sau; còn mode always thì chuyển sang dùng backoff cục bộ đã cấu hình, nhằm duy trì bảo đảm retry vô hạn.

Mỗi lần sắp lịch retry đều nối thêm một sự kiện `llm/retry` không đi vào tầng surface, trong đó có provider thất bại, mode chính sách, khóa chuẩn tắc của chính sách đã phân giải, số thứ tự retry trong phạm vi chính sách của provider, độ trễ và sự kiện thất bại. Sự kiện normal chứa `maxRetries` hữu hạn; sự kiện always bỏ qua trường này, UI sẽ render trần là `∞`. Cả sự kiện này lẫn bản ghi `assistant/chunk` thất bại đều không sinh ra message ở tầng surface, nên trừ khi có chính sách khôi phục khác cố ý thay đổi tầng surface, request kế tiếp sẽ chứa ngữ cảnh phái sinh giống hệt request đã thất bại.

## Các phương án từng cân nhắc

**Một công tắc `always` toàn cục duy nhất**: không chọn, vì nó không giới hạn được rủi ro chi phí và độ trễ vô hạn vào đúng provider thực sự cần, mà còn có thể âm thầm có hiệu lực sau khi định tuyến lại lúc runtime.

**Duy trì một danh sách provider chỉ định riêng trên `dsh-llm-retry`**: không chọn, vì nó sẽ lặp lại tên route provider bên ngoài cấu hình adapter sở hữu, và khiến việc đăng ký provider lệch pha với chính sách khôi phục.

**Đặt số lần retry hữu hạn rất lớn**: không chọn, vì rốt cuộc nó vẫn vi phạm giao ước retry liên tục, và biến một trần vận hành chọn tùy tiện thành con số trông như có ý nghĩa khi serialize.

**Dùng cơ chế retry của SDK provider**: không chọn, vì những lần thử bị che giấu sẽ chồng lên ngân sách ở tầng agent, không tận dụng được ranh giới lâu bền của bước đã đóng, và còn có thể ghép nối hoặc vứt bỏ output streaming mà không có bản ghi retry nào để dựng lại.

**Đưa lỗi vào ngữ cảnh model**: không chọn, vì thông tin chẩn đoán về vận chuyển hay provider thuộc trạng thái vận hành, không phải nội dung hội thoại. Nó có thể lộ chi tiết nhạy cảm của provider, và sẽ làm thay đổi request retry, khiến không thể lặp lại đúng request đã thất bại ban đầu.

## Kiểm chứng

Test adapter kiểm tra chính sách lồng nhau khi provider được nạp, chứng minh luồng đăng ký bắt giữ cả chính sách đã cấu hình lẫn chính sách mặc định, và chứng minh rằng sau khi thay route trong lúc request đang diễn ra thì chính sách phục vụ thực tế vẫn được giữ. Test đơn vị chọn chính sách theo mục đăng ký mà request thất bại thực sự dùng, tách riêng lịch sử retry giữa các provider khác nhau và sau khi chính sách thay đổi, kiểm chứng rằng mode always có thể vượt qua ngân sách normal, cố định jitter và trần độ trễ, chứng minh thứ tự khôi phục phía dưới, chứng minh việc hủy và dispose sẽ rút cạn các lần khôi phục đã ủy quyền rồi mới dừng hẳn hoàn toàn, và chứng minh cả hai đều dừng được lần chờ backoff đang diễn ra. Phần bao phủ ở cấp request so sánh toàn bộ message giữa lần thử thất bại và lần thử retry, đồng thời loại trừ văn bản lỗi của provider cùng phần output cục bộ bị loại bỏ. Một snapshot `stream-json` headless không cần khóa chạy luồng thất bại, retry và thành công qua ứng dụng đã lắp ráp, cố định toàn bộ bản ghi `llm/retry`, và từ chối mọi thay đổi message model giữa các lần thử. Test JSONL và SQLite đọc-ghi khứ hồi sự kiện always không chứa `Infinity`; test bất biến gắn định danh provider vào header request, kiểm chứng sự kiện thất bại và ranh giới bộ đếm thời gian của từng mode, và gắn số thứ tự retry vào khóa chính sách của provider; test TUI render cả trần hữu hạn lẫn trần vô hạn.

## Hệ quả

Mode normal vẫn là chính sách mặc định hữu hạn; chính sách always tường minh có thể tiêu tốn vô hạn số request và vô hạn thời gian cho các lỗi vĩnh viễn về xác thực, hạn ngạch, request không hợp lệ, giao thức hay ngữ cảnh. Bên vận hành phải trang bị cho mode always những bên gọi có thể hủy và biện pháp kiểm soát chi phí nhắm vào provider. Trạng thái retry vẫn quan sát được và được persist, nhưng không hiển thị với model; việc bắt giữ mục đăng ký phục vụ thực tế cũng ngăn các thay đổi vòng đời adapter quay ngược lại làm thay đổi giao ước khôi phục của request đang diễn ra.

Quyết định này mở rộng thiết kế về khôi phục bước đã đóng, một lần thử adapter hiển thị duy nhất, thất bại có cấu trúc và trạng thái persist đã xác lập trong [khôi phục có giới hạn cho request LLM (mô hình ngôn ngữ lớn) thất bại tạm thời](../architecture/2026-06-21-bounded-llm-request-recovery.md).
