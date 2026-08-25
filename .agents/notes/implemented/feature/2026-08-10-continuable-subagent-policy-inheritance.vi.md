# Agent Note: Kế thừa chính sách subagent có thể tiếp tục — log con bền vững sở hữu snapshot tại thời điểm ủy quyền

Status: implemented

[English](2026-08-10-continuable-subagent-policy-inheritance.md) | 中文

## Vấn đề

Kể từ [quyết định kế thừa chính sách trong-tiến-trình](2026-07-25-subagent-policy-inheritance.md), driver trong-tiến-trình dùng một lần luôn chèn các override sandbox/phê duyệt của cha vào con của nó, nhưng đường dẫn có thể tiếp tục chưa bao giờ làm vậy: việc vật chất hóa của `SubagentContinuationManager` chỉ áp dụng phần lắp ráp con và registry cài đặt Activation (kích hoạt). Gói tổ hợp mặc định cấu hình cả hai công cụ ủy quyền với `backgroundMode: continuable`, do đó trong triển khai mặc định, mỗi subagent (agent con) chạy nền đều âm thầm quay về giá trị mặc định của triển khai: một agent cha đã chuyển sang `danger-full-access` sẽ sinh ra một subagent kẹt ở `workspace-write`, mỗi thao tác ngoài workspace đều kích hoạt lời nhắc phê duyệt; lập trường phê duyệt không-người-trực `'never'` của cha cũng lùi lại thành hành vi phát lời nhắc ([dsh-external/issues#334](https://github.com/dsh-external/issues/issues/334)).

## Quyết định

Cặp hàm capture/append được chuyển từ driver dùng một lần sang module subagent con dùng chung của seam đó (`dsh-subagent/src/child-agent.ts`), tức nơi duy nhất sở hữu phần lắp ráp con dùng chung đã khai báo: `captureDelegatedPolicyOverrides(parent)` chụp snapshot `sandboxPolicy.overrideOf(parent.session)` qua `ctx.get` tùy chọn, và chốt chính sách phê duyệt của con thành `'never'` ([quyết định chốt phê duyệt](2026-08-10-subagent-approval-pinned-never.md)); `appendDelegatedPolicyOverrides(childSession, overrides)` thêm các sự kiện mang `source: 'delegation'`. Cả driver dùng một lần lẫn trình quản lý tiếp tục đều gọi các hàm này, do đó hai đường không lệch nhau.

`startContinuable` hoàn tất việc capture trước lần await đầu tiên của nó (`prepareContinuable`), tuân theo cùng ranh giới "việc chuyển đổi sau này của cha thuộc về tương lai của cha" như đường dẫn dùng một lần. Snapshot được truyền trong `MaterializeInputs.create`, do đó chỉ có lần vật chất hóa hoàn toàn mới thêm các sự kiện này vào giai đoạn thiết lập chưa công bố, sau bất kỳ seed fork nào. Việc hồi phục nguội (cold resume) không truyền input `create`, và không thêm gì cả: log con bền vững đã mang sẵn các sự kiện ủy quyền, và việc phát lại chính log đó chính là trạng thái. Chính sách hiệu lực của subagent thuộc quyền sở hữu của log con bền vững, chứ không phải Activation hiện tại, cũng không phải cha đang khởi động việc hồi phục, do đó việc cha chuyển đổi giữa các kỷ nguyên residency (residency epoch) không bao giờ hồi tố thay đổi một subagent bền vững.

## Phương án thay thế đã cân nhắc

- **Một đóng góp vào registry cài đặt Activation** (`registerContinuableSetup`): không áp dụng. Đóng góp chỉ nhận ngữ cảnh con, do đó không thể chụp override của cha tại ranh giới ủy quyền; registry đó áp dụng cả khi hồi phục nguội lẫn khi tạo mới hoàn toàn, dẫn đến thêm trùng lặp hoặc chụp trùng lặp; và không có cơ chế nào ràng buộc việc chụp của đóng góp vào tiền tố đồng bộ của lời gọi start, đảm bảo "chụp trước await" sẽ mất đi.
- **Chụp lại override của cha khi hồi phục nguội**: không áp dụng. Subagent hồi phục sẽ âm thầm đổi chính sách theo lần chuyển đổi sau này của cha, phá vỡ ngữ nghĩa "snapshot tại thời điểm ủy quyền", và khiến chính sách hiệu lực phụ thuộc vào thời điểm hồi phục thay vì log của chính con. Cha muốn subagent hồi phục dùng chính sách mới nên ủy quyền lại.
- **Để trình quản lý tiếp tục import logic nội tuyến của driver dùng một lần**: không áp dụng. Gói Service Definition không được phụ thuộc vào gói provider của chính nó, và việc sao chép cặp hàm capture/append trong `continuation.ts` sẽ dẫn đến lệch nhau; `child-agent.ts` đã mang mọi bước lắp ráp dùng chung còn lại.
- **Ghi các sự kiện này vào lượt seed descriptor**: không áp dụng. Seed được lắp ráp cho từng bên gọi, giá trị chụp chưa xác định lúc đó; và tiền lệ của đường dẫn dùng một lần đã xác lập: thêm vào trong giai đoạn thiết lập chưa công bố mới là cách xếp sự thật kế thừa sau lịch sử fork, đồng thời giữ `firstLiveSeq` không đổi.

## Hệ quả

- Ủy quyền nền của gói tổ hợp mặc định (`backgroundMode: continuable`) giờ kế thừa override sandbox tường minh của cha, và chốt con vào phê duyệt `'never'`; tổ hợp không lắp bất kỳ dịch vụ chính sách nào giữ nguyên hành vi cũ.
- `dsh-subagent` thêm kiểu peer tùy chọn cho `dsh-sandbox-policy` và `dsh-user-approval` (tức mẫu `ctx.get` mà driver dùng một lần sử dụng); `dsh-subagent-in-process-driver` gỡ bỏ hoàn toàn peer dịch vụ chính sách và import kiểu của riêng nó, ủy thác cho hàm trợ giúp dùng chung.
- Bộ test tiếp tục (`packages/subagent/subagent/tests/continuation-inheritance.spec.ts`) chốt việc ghi seed khi khởi động mới hoàn toàn, chụp trước await, bỏ giá trị mặc định, độ ổn định snapshot khi hồi phục nguội, và ưu tiên seed fork; kịch bản snapshot ACP `subagent-continuable-inheritance` qua ứng dụng đã lắp ráp chốt các sự kiện ủy quyền của con và ngữ cảnh runtime chỉ-đọc, thất bại ngay khi mất việc chụp.
- Các provider ngoài tiến trình (`acp`, `dsh-sdk`, `claude-code`, `codex`) không hỗ trợ subagent có thể tiếp tục (không có `prepareContinuable`), subagent dùng một lần của chúng giữ chính sách triển khai của riêng mình (`inheritsParentContext = false`); việc lan truyền chính sách xuyên tiến trình vẫn ngoài phạm vi.
