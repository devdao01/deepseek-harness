# Triển khai MTIL Harness

Hướng dẫn cài đặt bản fork MTIL (nhánh `dev`, nền `dsh-v0.2.0-rc.2`) cho nhiều công ty, mỗi công ty có Odoo riêng, bao gồm xóa sạch dữ liệu của bản cũ. Bản đồ code fork nằm ở [MTIL-FORK.md](MTIL-FORK.md).

## Mô hình

Mỗi công ty có hai tên miền trên gateway:

| Địa chỉ | Dành cho | Điều kiện truy cập |
|---|---|---|
| `https://<domain Odoo>/` | Odoo của công ty | Như hiện tại |
| `https://<domain Odoo>/mtilai2/` | Giao diện chat (SPA) | Đã đăng nhập Odoo đó và thuộc nhóm **MTIL User** |
| `https://<domain admin>/` | Odoo backend gọi harness (Base URL) và quản trị viên cài đặt | Chỉ IP trong allow-list (LAN, IP máy Odoo); Internet nhận 403 |

```
Internet ──https──► 192.168.9.56  nginx gateway (TLS cho mọi domain)
                      │  <domain Odoo>/          ──────────────────────► Odoo của công ty
                      │  <domain Odoo>/mtilai2/  ── hỏi Odoo: /api/mtil/auth_check ──┐
                      │  <domain admin>/  (chỉ allow-list)                          │ 2xx
                      ▼  http, giữ nguyên Host                                       │
                   192.168.11.68  nginx :80  ◄───────────────────────────────────────┘
                      │  map Host → cổng của công ty
                      │  /mtilai2/            → /var/www/mtilai2 (SPA dùng chung)
                      │  /mtilai2/api|plugins → 127.0.0.1:<cổng>
                      │  <domain admin>/      → 127.0.0.1:<cổng>
                      ▼
                   mtil-harness@<cty>  (user Linux mtil-<cty>, home /srv/mtil/<cty>, 127.0.0.1:<cổng>)
```

| Máy | Vai trò | File trong repo |
|---|---|---|
| `192.168.9.56` | Gateway: TLS, định tuyến domain, kiểm tra đăng nhập Odoo trước `/mtilai2/` | [`apps/mtil-deploy/nginx/gateway.conf`](../apps/mtil-deploy/nginx/gateway.conf), [`mtil-spa.locations`](../apps/mtil-deploy/nginx/mtil-spa.locations) |
| `192.168.11.68` | Các harness instance + nginx cục bộ | [`harness-host.conf`](../apps/mtil-deploy/nginx/harness-host.conf), [`mtil-harness@.service`](../apps/mtil-deploy/systemd/mtil-harness@.service), [`add-company.sh`](../apps/mtil-deploy/add-company.sh), overlay mẫu [`harness-web-lan.patch.yml`](../apps/frontend/deploy/harness-web-lan.patch.yml) |
| Máy Odoo của từng công ty | Odoo 17 + `npei_base` + `npei_agent_harness` | `addons_path` trỏ tới thư mục `apps/` của repo |

### Vì sao mỗi công ty một harness instance

- Vé người dùng (`mtil-ticket`) chỉ chứa id số của user Odoo (`{"u","exp"}`). Hai Odoo dùng chung một harness thì user 7 của công ty A và user 7 của công ty B là cùng một người với harness.
- Vé quản trị `*` của Odoo thấy mọi session của harness đó. Odoo của công ty A sẽ đồng bộ được session, preset và credential của công ty B.
- Preset, model, API key nhà cung cấp LLM và cài đặt nằm trong `~/.dsh` của một harness, nên dùng chung là trộn cấu hình và chi phí giữa các công ty.
- Mỗi instance chạy dưới một user Linux riêng với home `750`, nên lệnh do agent của công ty này chạy không đọc được dữ liệu của công ty khác.

Các instance dùng chung một checkout chỉ đọc (`/opt/mtil/deepseek-harness`) và một bản build SPA. Harness không ghi gì vào checkout khi chạy.

### Vì sao harness bind `127.0.0.1` và có nginx riêng trên `192.168.11.68`

- `dsh --profile web` mặc định bind `127.0.0.1`; CLI từ chối `--host 0.0.0.0`, vì API harness có quyền chạy lệnh trên server.
- nginx cục bộ là cửa duy nhất, chỉ nhận kết nối từ gateway (`ufw`), và chọn instance theo `Host`. Thêm công ty chỉ cần thêm một dòng map.
- nginx cục bộ phục vụ luôn file tĩnh của SPA, nên không cần chép dist sang gateway.

### Ba lớp chặn người chưa đăng nhập Odoo

1. **Gateway** (`mtil-spa.locations`): trước mọi request `/mtilai2/`, nginx hỏi Odoo của chính domain đó `GET /api/mtil/auth_check` kèm cookie phiên Odoo. Odoo trả `204` cho user thuộc **MTIL User** (Manager bao gồm User), `401` khi chưa đăng nhập, `403` khi đã đăng nhập mà không có nhóm (kể cả user portal). Trang chưa đăng nhập được chuyển tới `/web/login` rồi quay lại; API và WebSocket nhận `401`/`403`. Kết quả `204` được nhớ 30 giây theo (domain, cookie phiên Odoo), nên đăng xuất hoặc gỡ nhóm có hiệu lực trong vòng 30 giây.
2. **Harness**: mọi `/api` cần cookie `dsh-auth-*`, chỉ có được bằng launch token của đúng instance đó.
3. **Vé người dùng**: SPA nhận `mtil-ticket` từ Odoo sau khi qua cổng đăng nhập; harness chỉ cho mỗi user thấy session của mình.

### SPA: vẫn cần build, không cần server tĩnh riêng

- `apps/frontend` là ứng dụng Vite riêng; harness không tự phục vụ nó, nên vẫn build bằng `apps/frontend/deploy/build-mtil.sh`.
- Script build với `CONFIG_API_ODOO=/`: cổng đăng nhập trong SPA gọi Odoo của chính domain đang phục vụ trang, nên một bản build dùng cho mọi công ty.
- Không cần `serve`, `vite preview` hay tiến trình nào khác: build thẳng vào `/var/www/mtilai2` và nginx cục bộ phục vụ thư mục đó.

## Yêu cầu

- `192.168.11.68`: Ubuntu, Node hệ thống tại `/usr/bin/node` (`^22.19` hoặc `>=24`, ví dụ từ NodeSource; không dùng nvm vì mỗi công ty là một user Linux khác), `git`, `nginx`, `openssl`, `ufw`, tối thiểu 8 GB RAM cho bước build. User triển khai (ví dụ `mit`) có `sudo`.
- `192.168.9.56`: nginx có module `http_auth_request_module` (`nginx -V 2>&1 | grep -o http_auth_request_module`), chứng chỉ TLS cho domain Odoo và domain admin của từng công ty.
- Odoo của từng công ty: Odoo 17, module `npei_base` (module nội bộ, không nằm trong repo này; cung cấp nhóm `npei_base.npei_group_lock`), module `npei_agent_harness` của repo này, và route `POST /api/mtil/get_config_v2` mà cổng đăng nhập của SPA gọi để lấy vé người dùng (route này không nằm trong repo; cài cùng chỗ với Odoo hiện có của MTIL).

## Phần A — Cài nền trên `192.168.11.68` (một lần)

### A1. Dừng và xóa bản cũ

Bản cũ chạy một harness dưới user `mit`, checkout ở `/home/mit/deepseek-harness`:

```bash
sudo systemctl disable --now mtil-harness 2>/dev/null; tmux kill-session -t dsh 2>/dev/null
STAMP=$(date +%Y%m%d-%H%M)
mv ~/.dsh ~/dsh-backup-$STAMP               # session, settings, credentials, preset, overlay cũ
mv ~/workspace ~/workspace-backup-$STAMP    # thư mục làm việc theo preset
sudo ufw status numbered                    # xóa luật cũ mở cổng 3080: sudo ufw delete <số>
```

Giữ bản sao lưu đến khi hệ thống mới chạy ổn, rồi `rm -rf ~/dsh-backup-* ~/workspace-backup-*` và xóa checkout cũ `/home/mit/deepseek-harness`. Phía Odoo của MTIL được dọn ở bước C4.

### A2. Checkout và build

```bash
sudo mkdir -p /opt/mtil && sudo chown mit: /opt/mtil
git clone --recurse-submodules -b dev git@github-devdao01:devdao01/deepseek-harness.git /opt/mtil/deepseek-harness
cd /opt/mtil/deepseek-harness
corepack enable && corepack prepare pnpm@11.7.0 --activate
pnpm install
NODE_OPTIONS=--max-old-space-size=8192 pnpm run build
ls apps/cli/lib/bin.js                      # launcher mà unit systemd chạy
```

Checkout thuộc user `mit` và để quyền đọc cho mọi user (mặc định `755`/`644`); các instance chỉ đọc nó. Dùng URL clone mà server có quyền truy cập.

### A3. nginx cục bộ và firewall

```bash
sudo cp apps/mtil-deploy/nginx/harness-host.conf /etc/nginx/conf.d/mtil-harness.conf
sudo mkdir -p /etc/nginx/mtil/spa-hosts /etc/nginx/mtil/admin-hosts
sudo nginx -t && sudo systemctl reload nginx
sudo ufw allow from 192.168.9.56 to any port 80 proto tcp
```

Nếu `conf.d` đã có `map $http_upgrade $connection_upgrade`, xóa khối map đó trong `mtil-harness.conf`.

### A4. Build SPA

```bash
sudo mkdir -p /var/www/mtilai2 && sudo chown mit: /var/www/mtilai2
cd /opt/mtil/deepseek-harness/apps/frontend && ./deploy/build-mtil.sh
ls /var/www/mtilai2/index.html
```

## Phần B — Gateway `192.168.9.56` (một lần)

```bash
sudo cp gateway.conf /etc/nginx/conf.d/mtil-gateway.conf          # từ apps/mtil-deploy/nginx/
sudo cp mtil-spa.locations /etc/nginx/snippets/mtil-spa.locations
sudo mkdir -p /var/cache/nginx/mtil_auth
```

Trong `mtil-gateway.conf`, xóa khối server mẫu `mtilai.mtil.mtil.vn` nếu chưa tới bước thêm công ty MTIL (bước C3 thêm lại theo đúng công ty). Xóa các location `/mtilai2/` cũ còn trỏ tới `192.168.8.68:3080` hoặc `/opt/mit/mit_build/mtil_agent_harness/`.

## Phần C — Thêm một công ty (lặp lại cho từng công ty)

Ví dụ dưới đây là công ty MTIL: mã `mtil`, cổng `3081`, domain Odoo `mtil.mtil.vn`, domain admin `mtilai.mtil.mtil.vn`. Công ty tiếp theo dùng mã, cổng và hai domain khác, ví dụ `congtyb 3082 erp.congtyb.vn ai-congtyb.mtil.mtil.vn`.

### C1. Tạo instance trên `192.168.11.68`

```bash
sudo /opt/mtil/deepseek-harness/apps/mtil-deploy/add-company.sh mtil 3081 mtil.mtil.vn mtilai.mtil.mtil.vn
```

Script:

- tạo user Linux `mtil-mtil` (home `/srv/mtil/mtil`, quyền `750`);
- tạo `/etc/mtil-harness/mtil.env` (`MTIL_PORT`, hai domain, `DEEPSEEK_API_KEY` để trống; quyền `640`);
- tạo overlay `/srv/mtil/mtil/.dsh/profiles/web/cordis.patch.yml` với Ticket Secret và launch token mới (quyền `600`);
- ghi hai file map nginx, chạy `nginx -t` và reload;
- cài `mtil-harness@.service`, bật và khởi động `mtil-harness@mtil`;
- in ra **Base URL**, **API Token**, **Ticket Secret** để nhập vào Odoo ở bước C4.

Script từ chối cổng hoặc domain đã thuộc công ty khác. Chạy lại cho cùng công ty thì giữ nguyên env và overlay (tức giữ secret), chỉ cập nhật cổng, domain và nginx. Xem lại secret: `sudo grep -E "ticketSecret|launchToken" /srv/mtil/mtil/.dsh/profiles/web/cordis.patch.yml`.

### C2. API key nhà cung cấp LLM

Điền `DEEPSEEK_API_KEY` trong `/etc/mtil-harness/mtil.env` rồi `sudo systemctl restart mtil-harness@mtil`, hoặc để trống và nhập key ở Odoo → Credentials (bước C4).

### C3. Gateway: hai domain của công ty

1. Trong server block **đang có** của domain Odoo (`mtil.mtil.vn`), thêm hai dòng; `$mtil_odoo` là đích mà `location /` của block đó proxy tới (tên `upstream` hoặc `ip:port`; nếu là tên miền thì thêm `resolver` vào block):

   ```nginx
   set $mtil_odoo http://<upstream Odoo của block này>;
   include snippets/mtil-spa.locations;
   ```

2. Thêm server block cho domain admin theo mẫu trong `gateway.conf` (đổi `server_name`, chứng chỉ). Trong allow-list, giữ dải LAN và thêm IP mà gateway nhìn thấy khi máy Odoo của công ty gọi tới (IP công khai nếu Odoo ở ngoài LAN).
3. DNS: domain admin trỏ về gateway. Máy Odoo phải phân giải và gọi được domain này; nếu router không hỗ trợ NAT hairpin, trỏ domain về `192.168.9.56` bằng DNS nội bộ hoặc `/etc/hosts` của máy Odoo (với Docker: `extra_hosts`).
4. `sudo nginx -t && sudo systemctl reload nginx`.

### C4. Odoo của công ty

1. Cập nhật checkout trong `addons_path` lên nhánh `dev`, restart Odoo, rồi **Apps → MTIL Harness → Upgrade** (cài mới nếu chưa có). Phiên bản này thêm route `GET /api/mtil/auth_check` mà gateway cần.
2. Với Odoo đã dùng bản cũ (MTIL): `Settings → MTIL` → **Clear Data** (quản trị hệ thống) để xóa bản ghi `npei.agent.*` cũ. Thao tác này không gọi sang harness.
3. `Settings → MTIL`: điền **Base URL** (`https://<domain admin>`), **API Token**, **Ticket Secret** đúng như script đã in. Bấm **Test Connection**, rồi **Sync from Harness** cho Providers, Models, Presets, Skills.
4. `Settings → Users`: gán nhóm **MTIL User** cho người được dùng chat, **MTIL Manager** cho người quản trị. User không có nhóm bị gateway trả `403` ở `/mtilai2/`.

Trước khi điền, kiểm tra từ máy Odoo (trong container Odoo nếu chạy Docker): `curl -s -o /dev/null -w '%{http_code}\n' https://<domain admin>/api/boot.payload` phải in `401` (tới được harness, chưa đăng nhập).

### C5. Kiểm tra

1. Trình duyệt chưa đăng nhập Odoo mở `https://<domain Odoo>/mtilai2/`: chuyển tới trang đăng nhập Odoo, đăng nhập xong quay lại SPA.
2. User không có nhóm MTIL User mở `/mtilai2/`: nhận `403`.
3. Tạo preset "Kế toán" trong Odoo: trên harness có `/srv/mtil/<cty>/.dsh/.agent-presets/ke-toan/`.
4. Tạo session cho user A: nằm trong `/srv/mtil/<cty>/workspace/ke-toan`, sidebar SPA hiện Workspace "Kế toán"; user B không thấy session đó.
5. Gửi một prompt và xem câu trả lời chạy dần (WebSocket qua cả hai lớp nginx).
6. Trên trình duyệt từng dùng bản cũ, xóa cookie và site data của domain Odoo trước khi thử.

## Cập nhật phiên bản

```bash
cd /opt/mtil/deepseek-harness
git fetch origin && git reset --hard origin/dev && git submodule update --init --recursive
pnpm install && NODE_OPTIONS=--max-old-space-size=8192 pnpm run build
sudo systemctl restart 'mtil-harness@*'
(cd apps/frontend && ./deploy/build-mtil.sh)                 # khi client đổi
sudo cp apps/mtil-deploy/nginx/harness-host.conf /etc/nginx/conf.d/mtil-harness.conf && sudo nginx -t && sudo systemctl reload nginx   # khi file đổi
```

Trên từng Odoo: pull cùng commit và **Upgrade** module khi `apps/npei_agent_harness` thay đổi. Cập nhật không đụng tới `/srv/mtil/*`; dữ liệu, overlay và secret của các công ty được giữ nguyên.

## Gỡ một công ty

```bash
sudo systemctl disable --now mtil-harness@congtyb
sudo rm /etc/nginx/mtil/spa-hosts/congtyb.map /etc/nginx/mtil/admin-hosts/congtyb.map
sudo nginx -t && sudo systemctl reload nginx
sudo tar -C /srv/mtil -czf /root/mtil-congtyb-$(date +%Y%m%d).tgz congtyb   # sao lưu trước khi xóa
sudo userdel -r mtil-congtyb && sudo rm /etc/mtil-harness/congtyb.env
```

Trên gateway, bỏ hai dòng `set`/`include` khỏi server block Odoo của công ty đó và xóa server block domain admin của nó.

## Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `/mtilai2/` luôn chuyển về `/web/login` dù đã đăng nhập | Module chưa được Upgrade (thiếu `/api/mtil/auth_check`), hoặc `$mtil_odoo` trỏ sai Odoo |
| `/mtilai2/` trả `500` | Gateway không gọi được `$mtil_odoo` (tên miền mà thiếu `resolver`, sai cổng) |
| `/mtilai2/` trả `403` | User không thuộc nhóm MTIL User |
| `/mtilai2/` trả `404` | Thiếu file map của domain này trong `/etc/nginx/mtil/spa-hosts/`, hoặc gateway đổi `Host` |
| `/mtilai2/api/...` trả `401` sau khi vào được trang | Trình duyệt chưa có cookie `dsh-auth` của instance này: mở lại chat từ Odoo (nút mở chat gửi kèm token) |
| `/mtilai2/api/...` trả `403` từ harness | `Host` bị đổi ở một chặng nginx, hoặc thiếu `--trusted-host` (kiểm tra `MTIL_SPA_HOST` trong file env) |
| Không có câu trả lời chạy dần, kết nối liên tục đứt | Một chặng nginx thiếu `Upgrade`/`Connection`, `proxy_buffering off` hoặc `proxy_read_timeout` |
| Odoo **Test Connection** báo `403` | IP máy Odoo không nằm trong allow-list của domain admin trên gateway |
| Odoo báo lỗi DNS, timeout hoặc SSL | Máy Odoo không phân giải hoặc không quay vào được domain admin (NAT hairpin), hoặc chứng chỉ không hợp lệ |
| SPA hiện trang từ chối truy cập | Odoo thiếu route `get_config_v2`, hoặc `Ticket Secret` hai bên không trùng |
| Mọi lệnh gọi báo `gateway/definition-unavailable` | Một package thiếu dependency trong bản build; xem `journalctl -u mtil-harness@<cty>` tìm `typert-loader` và `ERR_MODULE_NOT_FOUND`, rồi `pnpm install && pnpm run build` |

Log: `journalctl -u mtil-harness@<cty> -n 200` cho harness, `/var/log/nginx/error.log` trên từng máy.
