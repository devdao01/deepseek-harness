# Agent Note: Child agents join their parent's preset composition

Status: implemented

[English](2026-08-10-child-agents-join-their-parent-preset.md) | 中文

## Vấn đề

Khả năng hiển thị của tool và prompt section được kế thừa dọc theo chuỗi cha của `dsh-scope`, còn scope key của agent lại được đúc ra mà không có cha. [Agent preset theo từng phiên](../architecture/2026-08-03-per-session-agent-presets.md) đã chuyển toàn bộ hàng vi hướng tới model sang mặt phẳng agent, và biến `AgentPresets.mount()` thành con đường duy nhất để gắn chuỗi cha đó — điểm gọi nằm trên các đường tạo phiên, khôi phục và fork của api-proxy. Hai driver subagent trong tiến trình lắp ráp sub agent thông qua `applyChildComposition()`, nhưng nó chỉ cài đặt persona và giới hạn tool theo từng sub agent, nên chuỗi scope của sub agent chỉ dài một, view registry của nó chỉ phân giải được đến tầng global.

Trong bất kỳ deployment nào có cấu hình preset roster, tầng đó giờ đây trống rỗng: patch layer web-app đã tắt toàn bộ hàng vi tool ở mặt phẳng host. Do đó một sub agent one-shot khi đến với model sẽ có số tool bằng không, sub agent có thể tiếp tục chỉ còn lại `report` ở mặt phẳng host, cả hai đều không mang theo persona, ngữ cảnh workspace, section plan-mode và catalog kỹ năng của cha. Đường fork trước đây đã được xử lý theo cùng lý do đó; delegation thì chưa.

Header lưu bền vững của sub agent càng làm vấn đề nặng thêm. `childSessionMeta()` không ghi lại bất kỳ preset nào, nên đọc nguội một sub session sẽ phân giải ra mặc định của deployment — một bộ tool mà sub agent đó chưa từng chạy qua, đây chính xác là điều mà quy tắc "model-visible ⟺ đã ghi log" muốn ngăn chặn.

## Quyết định

`AgentPresets.composeFrom(agentCtx, parentCtx)` cho phép một agent gia nhập vào bản lắp ráp thường trú (standing) đang chạy của một agent khác, và trả về id của preset đã gia nhập. Nó định vị chỗ mount của cha thông qua `standingMountFor()` — key của agent nhận cha là standing key của preset của nó, chính là quan hệ mà `serviceForAgent()` đọc — rồi gắn key của child vào cùng standing key đó, quyền sở hữu handle gắn vẫn do cơ chế re-chain riêng của roster nắm giữ. Cha không gia nhập bất kỳ preset nào sẽ không tạo ra việc gia nhập, cũng không báo lỗi — đó chính là deployment không có roster: hàng vi hướng tới model của nó nằm trong bản lắp ráp của host, sub agent đã có thể phân giải chúng qua tầng global.

Đây là nhận cha, chứ không phải mount, và cả hai điểm khác biệt đều quan trọng. Sub agent nhận được đúng thế hệ (generation) đó của cha, nên tệp lắp ráp bị chỉnh sửa sau khi cha khởi động không thể trao cho nó một thế hệ khác với thế hệ mà lịch sử của cha đã tạo ra, và một preset bị xóa sau đó cũng không thể khiến một sub agent mà cha vẫn đang chạy bị lỗi. Nó cũng đồng bộ, đây chính là điều kiện tiên quyết để dùng được trong cửa sổ tạo sub agent — cả hai driver trong tiến trình đều hoàn tất việc lắp ráp trong `setup` đồng bộ.

`applyChildComposition(childCtx, parent, composition)` nhận cha, và hoàn tất việc gia nhập trước khi áp dụng đăng ký của riêng sub agent. Tham số này chính là điểm mấu chốt: nó khiến việc "lắp ráp sub agent mà không thực hiện gia nhập" trở nên không thể diễn đạt được ở từng điểm gọi, thay vì để lại bước thứ hai cho mỗi driver mới phải tự nhớ. `childSessionMeta()` ghi lại id đã gia nhập thông qua `AgentPresets.composedPreset()`, giá trị này được đọc từ chuỗi scope **đang sống** của cha chứ không phải từ header của cha, vì một cha đã chuyển preset trong khoảng thời gian rỗi (idle) sẽ chạy trên bản lắp ráp mới hơn, còn header của nó vẫn ghi cái cũ.

`dsh-subagent` chạm tới roster thông qua `ctx.get('agentPresets')` bằng cách import cấp kiểu (type-level) cộng peer dependency tùy chọn — đây chính là mẫu tiêu thụ cơ hội (opportunistic) đã có tài liệu rõ ràng mà `sandboxPolicy` và `approval` đang dùng.

Sau khi trao tool của cha cho sub agent, lộ ra lỗi thứ hai do chính lần dịch chuyển mặt phẳng agent đó gây ra: `ToolRuntime` loại trừ đăng ký ở **cấp scope** khỏi giới hạn — chỉ lọc tầng global — nên khi toàn bộ hàng vi hướng tới model trở thành đóng góp từ tổ tiên (ancestor), `toolFilter` của sub agent không còn ràng buộc được gì cả — và khi tầng global rỗng, `restrict()` sẽ coi mọi tên nhận được là không xác định và khiến việc tạo sub agent thất bại ngay lập tức. Tập miễn trừ đáng lẽ phải là các tool **do chính scope đó đăng ký**, chứ không phải các tool tình cờ nằm ở tầng global; cách đọc sau chỉ đúng khi hai tập đó trùng nhau. `view()` giờ đây lọc mọi thứ scope kế thừa được — cả tầng global lẫn từng tầng tổ tiên — chỉ miễn trừ đúng tầng của chính nó. Sự miễn trừ ở tầng tự thân này mang tính chịu tải, không phải phụ trợ: delegation runtime đăng ký `report` và tool output có cấu trúc của sub agent vào đúng tầng riêng của sub agent, và một filter chỉ nêu tên các năng lực khả dụng của sub agent không bao giờ được phép tước luôn cả cơ chế mà nó dựa vào để báo cáo kết quả.

## Các phương án thay thế đã cân nhắc

**Mount lại preset của cha theo id trong setup của sub agent.** Bị bác bỏ vì sai cả về ngữ nghĩa lẫn cơ chế. Nó sẽ đọc lại roster và stat lại tệp lắp ráp, nên một lần chỉnh sửa sau khi cha khởi động sẽ khiến sub agent tách nhánh sang một thế hệ khác, và một preset bị xóa sau đó sẽ khiến sub agent lỗi trong khi cha vẫn chạy bình thường. `mount()` còn là bất đồng bộ, cửa sổ tạo đồng bộ không thể chấp nhận nó mà không tái cấu trúc cả hai driver.

**Gắn key của sub agent vào key của chính cha** thay vì vào standing mount. Bị bác bỏ, vì điều này thay đổi những gì sub agent kế thừa: tầng scope của chính cha mang theo giới hạn riêng từng agent của nó, những giới hạn đó sẽ giao với mọi hậu duệ, còn một sub agent sống lâu hơn cha sẽ treo trên một agent key đã bị dispose. Gia nhập standing mount chỉ trao cho sub agent đúng bản lắp ráp của cha, không hơn không kém.

**Mở rộng registry setup activation có thể tiếp tục để bao phủ cả sub agent one-shot.** Bị bác bỏ, vì kiểu đóng góp của registry đó là đồng bộ `(childCtx) => () => void` kèm undo cài đặt theo từng lần, mô hình hóa năng lực deployment đến rồi đi, còn việc gia nhập preset là nhận cha một lần, tự thân không có gì để undo. Mở rộng nó sẽ khiến bất kỳ driver nào lách qua registry đó lại có khả năng bị bỏ sót y hệt.

**Cho `dsh-subagent` import `resolveSessionPreset` rồi mount theo id đã phân giải.** Bị bác bỏ, vì điều này tạo ra ranh giới module cứng cho một package vốn phải hoạt động được cả khi không có roster, và cuối cùng vẫn quay về đúng ngữ nghĩa mount lại nêu trên.

**Lọc mọi tầng trong chuỗi, kể cả tầng của chính scope đó.** Bị bác bỏ, vì điều đó sẽ khiến bộ lọc năng lực riêng từng sub agent xóa luôn cả tool report và output có cấu trúc của chính sub agent đó — những tool được delegation runtime đăng ký vào đúng tầng của sub agent — khiến một `allow` chỉ nêu tên "sub agent này có những năng lực nào" lại làm nó hoàn toàn không thể báo cáo kết quả.

**Chỉ sửa việc gia nhập đang sống, không đụng đến header lưu bền vững.** Bị bác bỏ, vì khi đó sub agent đang sống và chính sub agent đó khi đọc nguội sẽ cho ra câu trả lời khác nhau về "bản lắp ráp nào đã tạo ra đoạn lịch sử này" — cùng một loại lỗi, chỉ bị dời chỗ chứ không được sửa.

## Kiểm thử

`packages/preset/agent-presets/tests/mount.spec.ts` bao phủ việc gia nhập này bằng lắp ráp fixture thật: sub agent thấy được tool và prompt section của cha, không mount ra thế hệ thứ hai, việc gia nhập vẫn đúng sau khi cha đã dispose (sub agent chạy nền sống lâu hơn cha), id báo cáo nhất quán, cha không có preset thì không tạo ra việc gia nhập, và context không có scope thì bị từ chối.

`packages/core/tools/tests/scoped.spec.ts` bao phủ trực tiếp quy tắc giới hạn này: bộ lọc của sub agent xóa được tool nó kế thừa từ scope tổ tiên, đăng ký của chính sub agent sống sót qua bộ lọc của chính nó, giới hạn của tổ tiên vẫn tác động lên mỗi scope lồng bên trong nó.

`packages/subagent/subagent-in-process-driver/tests/preset-inheritance.spec.ts` trên một bản lắp ráp host không chứa bất kỳ hàng vi hướng tới model nào, khẳng định kết quả model-visible thông qua `startInProcessRun()`: schema trong request của chính sub agent, prompt section của cha, preset đã ghi trong header, `toolFilter` áp lên các tool preset kế thừa được, và cha đã chuyển preset trong khoảng rỗi — chuyển sang một preset **khác** để assertion có thể phân biệt được "đọc chuỗi scope đang sống của cha" với "đọc header tạo của cha".

Tầng ghi log bản lắp ráp dùng e2e trên bản lắp ráp Web shipped thật, chứ không dùng snapshot không cần key. Toàn bộ example có thể chạy trong repo này không lắp ráp preset roster nào, nên lỗi này hoàn toàn không thể quan sát được trong snapshot harness: muốn làm kịch bản snapshot thì trước hết phải có một example vừa mount roster vừa khởi tạo delegation. Web e2e khởi động `base` + patch layer `web-app` thật cùng hai preset shipped, đây chính là bằng chứng lắp ráp mà chính sách kiểm thử yêu cầu; golden subagent trên lane trình duyệt Web chứa đựng hệ quả có thể nhìn thấy — ghi lại rằng sub agent có preset giờ hiển thị đúng badge preset giống cha.

## Hệ quả

Delegation giờ chỉ tốn một lần nhận cha ở cấp scope cho mỗi sub agent, không hơn — không có instance plugin thêm, không đọc roster, không có kiểu lỗi mới. Năng lực của sub agent đúng bằng năng lực của cha, trừ đi phần bị `toolFilter` của chính nó loại bỏ; preset theo từng subagent ("loại agent") vẫn chưa được xây dựng, đó sẽ là một trường request mới, chứ không phải thay đổi trong lần gia nhập này.

Hình dạng của `applyChildComposition()` đã thay đổi, nên trong tương lai bất kỳ driver trong tiến trình nào ngoài repo này cũng buộc phải cung cấp cha. Đây là cái giá cố ý phải trả: chữ ký trước đây cho phép bên gọi lắp ráp ra một sub agent hoàn toàn không có năng lực mà không báo lỗi gì.

Một sub agent có thể tiếp tục sau khi khôi phục nguội sẽ gia nhập vào bản lắp ráp **hiện tại** của cha, chứ không phải bản mà header của chính nó đã ghi. Cửa sổ này rất hẹp — cha phải tạo child trước, giữ trạng thái rỗi, chuyển preset, rồi mới đánh thức nó dậy; sub agent đang thường trú sẽ không gia nhập lại, sub agent one-shot cũng không khôi phục — và các phương án thay thế còn tệ hơn: phân giải theo id mà chính sub agent đã ghi sẽ phải đọc lại roster, mời lại đúng kiểu lỗi "preset đã bị xóa" mà việc nhận cha này cố tình né tránh. Header của sub agent vẫn ghi lại bản lắp ráp tại thời điểm nó khởi động, nên sự khác biệt này là có thể quan sát được, không hề âm thầm.

`ToolRuntime` giờ đọc tập miễn trừ của giới hạn là "những gì chính scope đó tự đăng ký" thay vì "tầng global", điều này thay đổi một hành vi sẵn có nằm ngoài phạm vi delegation: tool do scope **tổ tiên** đóng góp giờ đây sẽ chịu ràng buộc của bộ lọc hậu duệ, trong khi trước đây chỉ tool ở tầng global mới bị vậy. Phần miễn trừ còn lại trong chuỗi không đổi — đăng ký của chính scope vẫn nằm ngoài bộ lọc của chính nó, đây chính là tính chất mà delegation runtime dựa vào.
