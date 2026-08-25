# Thực hành: Thêm thẻ cài đặt (settings card)

[English](adding-a-settings-card.md) | Tiếng Việt

Cách một plugin đưa cấu hình của chính nó lên trang cài đặt Web. Không bước nào trên đường đi này cần sửa đổi repo này: Host phục vụ (serve) mọi namespace settings đã đăng ký, còn phân khu **Plugin Configuration** dùng namespace mà thẻ đó chỉnh sửa làm khóa, do đó khi cả hai nửa plugin cùng đăng ký thì chúng sẽ tự động được ghép cặp với nhau.

Cả hai nửa nằm trong cùng một package — nửa Host ở `src/`, nửa trình duyệt ở `src/client/`, export qua `./client` và khai báo bằng `dsh.client`. [`packages/client/ui-theme`](../../packages/client/ui-theme) là một ví dụ có sẵn cho kiểu đóng gói này; các thẻ của chính phân khu này nằm ở [`packages/client/ui-settings-plugins`](../../packages/client/ui-settings-plugins).

## 1. Đăng ký namespace (nửa Host)

Namespace chính là khóa dùng để ghép cặp, nên chỉ chọn một lần, và viết ra ở cả hai nửa. Bên tiêu thụ đã có entry `cordis.yml` nên đăng ký qua `installSettingsSection` — hàm này xếp entry chồng lên tài liệu người dùng, và vẫn hoạt động bình thường khi không có settings provider nào được mount:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

declare function assertReachable(endpoint: string | undefined): void
declare function rebuildFromSettings(config: Config): void

export const MY_PLUGIN_NS = settingsNamespace('my-plugin')

export interface Config {
  endpoint?: string
  retries?: number
}

export const Config: z<Config> = z.object({
  endpoint: z.string(),
  retries: z.number().step(1).min(0).default(3),
})

export function apply(ctx: Context, config: Config) {
  let source = () => config
  installSettingsSection(ctx, MY_PLUGIN_NS, Config, config, {
    // Constraints the schema cannot express refuse the write, not the next use.
    validate: value => void assertReachable(value.endpoint),
    setSource: (current) => { source = current },
    onChange: () => { rebuildFromSettings(source()) },
  })
}
```

`role('secret')` trên một trường khiến giá trị của nó không xuất hiện trong bất kỳ response nào. Thẻ ghi các trường loại này vào payload `update`/`mutate`, hoặc thay bằng cách định địa chỉ một tham chiếu credential qua domain `credentials`. `applies: 'restart'` báo cho tầng cấu hình biết: bên sở hữu phải chờ đến lần khởi động tiếp theo thì thay đổi mới có hiệu lực.

## 2. Đăng ký thẻ (nửa trình duyệt)

Thẻ đăng ký vào `settings.plugin.item` bằng namespace của chính nó làm khóa, và sở hữu toàn bộ mọi thứ trong đó — giao diện, control và văn bản. Nó đọc/ghi qua `ctx.settingsScope`, thành phần này dùng revision tại thời điểm đọc để rào (fence) mỗi lần ghi:

```ts ignore-check
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the keyed slot's declaration. Cross-plugin collaboration goes
// through cordis services; a value import fails the client bundle-purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

export function apply(ctx: ClientContext): void {
  const card = new MyPluginCardController(ctx.settingsScope.bind({ namespace: 'my-plugin' }))
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'my-plugin',
    locale: 'settings.myPlugin',
    inject: () => card.inject(),
  }, MyPluginCard),
  )
}
```

Snapshot của scope mang theo mọi thứ mà form cần: `value` đã phân giải, `base` tầng tổ hợp, và tầng `user` gốc — một trường có bị ghi đè hay không phụ thuộc vào việc nó có **xuất hiện** trong tầng `user` hay không, chứ không phụ thuộc vào giá trị của nó. `scope.set(field, value)` lưu một trường, `scope.unset(field)` trả nó về giá trị tổ hợp.

## 3. Trang tab dùng nó ra sao

Trang tab **Plugin Configuration** đọc xem Host đang phục vụ những namespace nào, và phân phối một slot key cho từng namespace. Khi Host phục vụ khóa của một thẻ nào đó thì thẻ đó được render, ngược lại bị bỏ qua, do đó một deployment chưa từng lắp nửa Host sẽ không để lại bất kỳ dấu vết nào của thẻ đó. Namespace được phục vụ nhưng không có ai nhận thì không render gì cả — các namespace thuộc về trang khác (`ui-theme`, `permission`, `llm-*`) chính là được để ngoài trang tab này theo cách như vậy.

Thẻ xuất hiện theo thứ tự chúng đăng ký vào slot đó; entry có khóa không khai báo `order` riêng của mình.

## Đóng gói

Nửa trình duyệt được [hệ thống module client](../../packages/client/modules) cung cấp cho trang: nó quét các package đã khai báo `dsh.client` trong các entry Loader đã bật, và cung cấp export `./client` mà mỗi package đó build ra. Do đó, chỉ cần `cordis.yml` mount plugin đó, nó sẽ xuất hiện trên trang — không cần build lại ứng dụng Web.

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings-plugins"] } }
}
```

bundle bắt buộc phải là sản phẩm factory lazy-CJS của loader. Trong repo này, `tsdown.config.ts` chỉ là ba dòng dựa trên preset dùng chung:

```ts ignore-check
import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@deepseek-ai/dsh-client-my-plugin', ['lib/types/index.js', 'lib/types/invariant.js'])
```

Preset này hiện chưa được publish, nên các package ngoài repo này phải tự nhân bản cùng một định dạng đầu ra. Cổng gác độ tinh khiết (purity) của bundle đồng thời từ chối cả import value xuyên plugin, nên thẻ không thể import giao diện của thẻ ở phân khu này hay model form tạm (staging) của nó — nó tự render phần của mình, và tự sở hữu việc tạm lưu cùng cơ chế rào revision. Cả hai giới hạn này đều được ghi trong [giới hạn đã biết của phân khu này](../../packages/client/ui-settings-plugins/README.md#known-limitations-and-deferred-work).
