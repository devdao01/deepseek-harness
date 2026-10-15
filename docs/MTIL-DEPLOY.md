# Triển khai MTIL Harness

Hướng dẫn cài đặt từ đầu bản fork MTIL (nhánh `dev`, nền `dsh-v0.2.0-rc.2`), bao gồm xóa sạch dữ liệu của bản cũ. Bản đồ code fork nằm ở [MTIL-FORK.md](MTIL-FORK.md).

## Sơ đồ triển khai

```
Internet ──https──► 192.168.9.56  nginx gateway (TLS, mọi domain của các server LAN)
                       │  mtil.mtil.vn/mtilai2/  ─┐
                       │  mtilai.mtil.mtil.vn    ─┤ http, giữ nguyên Host
                       │  mtil.mtil.vn/  ────────►│──────────► Odoo 17
                       ▼                          │
                    192.168.11.68  nginx :80 ◄────┘
                       │  /mtilai2/            → file tĩnh /var/www/mtilai2 (SPA)
                       │  /mtilai2/api|plugins → 127.0.0.1:3080
                       │  :8090 (chỉ Odoo)     → 127.0.0.1:3080
                       ▼
                    harness `dsh --profile web` trên 127.0.0.1:3080
```

| Máy | Vai trò | File cấu hình |
|---|---|---|
| `192.168.9.56` | nginx gateway: TLS, định tuyến domain ra từng server LAN | [`apps/nginx/gateway.conf`](../apps/nginx/gateway.conf) |
| `192.168.11.68` | harness (`127.0.0.1:3080`) + nginx cục bộ: phục vụ SPA và proxy harness | [`apps/nginx/harness-host.conf`](../apps/nginx/harness-host.conf), overlay [`apps/frontend/deploy/harness-web-lan.patch.yml`](../apps/frontend/deploy/harness-web-lan.patch.yml) |
| máy Odoo (`<ODOO_IP>`) | Odoo 17 + module `npei_agent_harness` | `addons_path` trỏ tới thư mục `apps/` của repo |

### Vì sao harness bind `127.0.0.1` và có nginx riêng trên `192.168.11.68`

- `dsh --profile web` mặc định bind `127.0.0.1:3080`. CLI từ chối `--host 0.0.0.0`; bind ra mạng chỉ làm được bằng overlay, và khi đó mọi máy trong LAN chạm thẳng vào một API có quyền chạy lệnh trên server.
- Đặt nginx cạnh harness thì harness không mở cổng nào ra mạng. Chỉ nginx nhận kết nối, và firewall giới hạn nguồn: cổng `80` chỉ từ gateway, cổng `8090` chỉ từ Odoo.
- nginx cục bộ phục vụ luôn file tĩnh của SPA, nên không cần chép dist sang gateway và không cần tiến trình phục vụ file tĩnh riêng.
- Gateway giữ đúng một vai trò như với các server khác: TLS và định tuyến theo domain.

Hai điều kiện bắt buộc của mô hình hai lớp nginx:

1. Mọi chặng giữ nguyên header `Host` của trình duyệt (`proxy_set_header Host $host`). Harness từ chối `/api` khi `Host` không phải loopback và không nằm trong `--trusted-host`; khi trình duyệt gửi `Origin`, `Origin` phải trùng `Host`. Cookie đăng nhập `dsh-auth-*` cũng gắn với `Host`.
2. Mọi chặng chuyển tiếp WebSocket (`Upgrade`/`Connection`) và tắt buffering cho `/mtilai2/api/` và `/mtilai2/plugins/`.

### SPA: vẫn cần build, không cần server tĩnh riêng

- `apps/frontend` là một ứng dụng Vite riêng (cổng đăng nhập Odoo, cờ `__MTIL_UI__`, plugin `public/mtil-*.js`). Harness không tự phục vụ nó, nên vẫn phải build bằng `apps/frontend/deploy/build-mtil.sh`.
- Không cần `serve`/`vite preview` hay tiến trình nào khác để chạy web: build thẳng vào `/var/www/mtilai2` trên `192.168.11.68` và nginx cục bộ phục vụ thư mục đó.
- Chỉ build lại SPA khi code trong `apps/frontend` hoặc các package client thay đổi.

## Yêu cầu

- `192.168.11.68`: Ubuntu, Node `^22.19` hoặc `>=24`, `git`, `nginx`, `ufw`, tối thiểu 8 GB RAM cho bước build. Ví dụ dùng user `mit` và checkout tại `/home/mit/deepseek-harness`; đổi theo thực tế.
- Quyền đọc hai repo `devdao01/deepseek-harness` và `devdao01/frontend-deepseek-harness` (submodule `apps/frontend`).
- `192.168.9.56`: nginx có sẵn chứng chỉ TLS cho `mtil.mtil.vn` và `mtilai.mtil.mtil.vn`.

## Bước 1 — Xóa dữ liệu phía Odoo

1. Đăng nhập Odoo bằng quản trị hệ thống, vào `Settings → MTIL` và bấm **Clear Data**. Thao tác này xóa mọi bản ghi `npei.agent.*` (session, preset, provider, model…), chỉ giữ mẫu provider route, và không gọi sang harness.
2. Trên máy Odoo, cập nhật checkout mà `addons_path` trỏ tới:

   ```bash
   git fetch origin && git checkout dev && git reset --hard origin/dev
   ```

3. Restart Odoo, rồi vào **Apps → MTIL Harness → Upgrade**. Bắt buộc, vì module gọi `mtilPresets/*` thay cho `agentPresets/*` của bản cũ.

## Bước 2 — Dừng harness và xóa dữ liệu cũ trên `192.168.11.68`

```bash
sudo systemctl stop mtil-harness 2>/dev/null; tmux kill-session -t dsh 2>/dev/null
STAMP=$(date +%Y%m%d-%H%M)
mv ~/.dsh ~/dsh-backup-$STAMP               # session, settings, credentials, preset, overlay
mv ~/workspace ~/workspace-backup-$STAMP    # thư mục làm việc theo preset
```

`~/.dsh` chứa cả API key của provider và overlay cũ (kể cả row bind `0.0.0.0` của bản trước), nên sau bước này phải cài lại overlay và nhập lại key. Giữ bản sao lưu đến khi hệ thống mới chạy ổn, rồi xóa bằng `rm -rf ~/dsh-backup-* ~/workspace-backup-*`.

## Bước 3 — Lấy code và build harness

```bash
cd /home/mit/deepseek-harness
corepack enable && corepack prepare pnpm@11.7.0 --activate

git fetch origin
git checkout dev && git reset --hard origin/dev
git submodule sync && git submodule update --init --recursive

pnpm run clean
rm -rf node_modules apps/frontend/node_modules
pnpm install
NODE_OPTIONS=--max-old-space-size=8192 pnpm run build
```

`pnpm install` ở thư mục gốc cài luôn `apps/frontend`, vì đó là workspace member. Thiếu RAM thì bước bundle sẽ dừng vì hết bộ nhớ.

## Bước 4 — Cài overlay

```bash
mkdir -p ~/.dsh/profiles/web
cp apps/frontend/deploy/harness-web-lan.patch.yml ~/.dsh/profiles/web/cordis.patch.yml
openssl rand -hex 32                                    # Ticket Secret (64 ký tự)
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='      # launchToken (43 ký tự)
nano ~/.dsh/profiles/web/cordis.patch.yml
```

| Khóa | Chỗ | Giá trị |
|---|---|---|
| `ticketSecret` | row `session-controller` và row `mtil-presets` | Cùng một chuỗi Ticket Secret, trùng với Odoo ở bước 9 |
| `odooMcpServer` | row `mtil-presets` | Đường dẫn tuyệt đối tới `apps/odoo-mcp/server.mjs`, ví dụ `/home/mit/deepseek-harness/apps/odoo-mcp/server.mjs` |
| `launchToken` | row `connection` (bỏ comment cả row) | Khuyên dùng: token đăng nhập cố định, Odoo không phải cập nhật sau mỗi lần restart |
| `presetWorkspaceRoot` | row `session-controller` | Giữ `~/workspace` trừ khi muốn đặt thư mục làm việc ở chỗ khác |

Overlay không có row `webserver`, vì harness giữ bind mặc định `127.0.0.1:3080`.

## Bước 5 — Chạy harness bằng systemd

Tạo `/home/mit/.config/mtil-harness.env` (quyền `600`) để chứa secret, không đưa vào unit:

```bash
DEEPSEEK_API_KEY=sk-...
```

Tạo `/etc/systemd/system/mtil-harness.service`:

```ini
[Unit]
Description=MTIL Harness (dsh web)
After=network-online.target
Wants=network-online.target

[Service]
User=mit
WorkingDirectory=/home/mit/deepseek-harness
EnvironmentFile=/home/mit/.config/mtil-harness.env
ExecStart=/bin/bash -lc 'exec pnpm dsh --profile web --no-open --trusted-host mtil.mtil.vn --trusted-host mtilai.mtil.mtil.vn --trusted-host 192.168.11.68'
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mtil-harness
journalctl -u mtil-harness -f              # chờ dòng "dsh web: http://127.0.0.1:3080/?token=…"
curl -sI http://127.0.0.1:3080/ | head -1  # harness trả lời trên loopback
```

`bash -lc` nạp `PATH` của user `mit` (nvm hoặc corepack). Mỗi `--trusted-host` là một `Host` mà nginx chuyển tới: hai domain công khai và `192.168.11.68` cho cổng Odoo.

## Bước 6 — Build SPA thẳng vào thư mục nginx

```bash
sudo mkdir -p /var/www/mtilai2 && sudo chown mit: /var/www/mtilai2
cd /home/mit/deepseek-harness/apps/frontend
DEST=/var/www/mtilai2 ./deploy/build-mtil.sh
ls /var/www/mtilai2/index.html
```

Script build với `CONFIG_API_ODOO=mtil.mtil.vn BASE_PATH=/mtilai2/`, xóa nội dung cũ của `DEST` (tên asset có hash) rồi chép dist vào.

## Bước 7 — nginx trên `192.168.11.68`

```bash
sudo cp /home/mit/deepseek-harness/apps/nginx/harness-host.conf /etc/nginx/conf.d/mtil-harness.conf
sudo nano /etc/nginx/conf.d/mtil-harness.conf   # thay <ODOO_IP>; xóa khối map nếu đã có $connection_upgrade
sudo nginx -t && sudo systemctl reload nginx

sudo ufw allow from 192.168.9.56 to any port 80 proto tcp
sudo ufw allow from <ODOO_IP> to any port 8090 proto tcp
sudo ufw status
```

Kiểm tra cục bộ:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: mtil.mtil.vn' http://127.0.0.1/mtilai2/   # 200
```

## Bước 8 — nginx gateway `192.168.9.56`

Gộp khối `location /mtilai2/` trong [`apps/nginx/gateway.conf`](../apps/nginx/gateway.conf) vào server block `mtil.mtil.vn` đang có (giữ nguyên các location của Odoo). Thêm server block `mtilai.mtil.mtil.vn` nếu muốn công khai giao diện gốc của harness. Sau đó:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Nếu gateway trước đây proxy `/mtilai2/` tới `192.168.8.68:3080` hoặc phục vụ dist từ `/opt/mit/mit_build/mtil_agent_harness/`, hãy xóa các location cũ đó.

## Bước 9 — Kết nối Odoo với harness

Vào `Settings → MTIL`:

| Ô | Giá trị |
|---|---|
| **Base URL** | `http://192.168.11.68:8090` |
| **API Token** | `launchToken` ở bước 4, hoặc token trong dòng `dsh web:` của journal |
| **Ticket Secret** | Đúng chuỗi `ticketSecret` trong overlay |

Sau đó:

1. Bấm **Test Connection**.
2. Bấm **Sync from Harness** cho Providers, Models, Presets, Skills.
3. Nếu chưa đặt `DEEPSEEK_API_KEY` ở bước 5, nhập key provider ở mục Credentials.

## Bước 10 — Kiểm tra

1. **Mở SPA:** xóa cookie và site data của `mtil.mtil.vn` trên trình duyệt từng dùng bản cũ, đăng nhập Odoo, rồi mở `https://mtil.mtil.vn/mtilai2/`.
2. **Tạo preset:** tạo preset "Kế toán" trong Odoo, rồi kiểm tra trên harness có thư mục `~/.dsh/.agent-presets/ke-toan/`.
3. **Tạo session:** tạo session cho user A. Session phải nằm trong `~/workspace/ke-toan`, và sidebar SPA hiện Workspace "Kế toán".
4. **Phân quyền:** đăng nhập user B. User B không được thấy session của A.
5. **Gửi một prompt** và xem câu trả lời chạy dần. Câu trả lời chạy dần nghĩa là WebSocket qua cả hai lớp nginx đã thông.
6. **Preset có kết nối Odoo:** lưu tab **Odoo Connection** của preset. Lỗi nhắc `odooMcpServer` nghĩa là đường dẫn trong overlay sai.

## Cập nhật phiên bản về sau

```bash
cd /home/mit/deepseek-harness
git fetch origin && git reset --hard origin/dev && git submodule update --init --recursive
pnpm install && NODE_OPTIONS=--max-old-space-size=8192 pnpm run build
sudo systemctl restart mtil-harness
(cd apps/frontend && DEST=/var/www/mtilai2 ./deploy/build-mtil.sh)   # khi client đổi
```

Trên máy Odoo: pull cùng commit rồi **Upgrade** module khi `apps/npei_agent_harness` thay đổi. Cập nhật không xóa `~/.dsh`; dữ liệu và overlay được giữ nguyên.

## Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `/mtilai2/api/...` trả 403 | `Host` bị đổi ở một chặng nginx, hoặc thiếu `--trusted-host` cho domain đó |
| Trang tải nhưng không có câu trả lời chạy dần, hoặc kết nối liên tục đứt | Một chặng nginx thiếu `Upgrade`/`Connection`, `proxy_buffering off` hoặc `proxy_read_timeout` |
| Odoo **Test Connection** báo 403 | Thiếu `--trusted-host 192.168.11.68` |
| Odoo **Test Connection** báo timeout hoặc kết nối bị từ chối | `allow <ODOO_IP>` hoặc luật `ufw` cổng `8090` sai IP |
| Odoo báo 502 | Base URL hoặc API Token chưa điền, hoặc token đã đổi sau restart (dùng `launchToken` để cố định) |
| SPA hiện trang từ chối truy cập | Chưa đăng nhập Odoo ở `mtil.mtil.vn`, hoặc `Ticket Secret` hai bên không trùng |
| Asset `404` sau khi build lại | Dist chưa được chép đúng vào `/var/www/mtilai2`, hoặc trình duyệt giữ `index.html` cũ |

Log harness: `journalctl -u mtil-harness -n 200`. Log nginx: `/var/log/nginx/error.log` trên từng máy.
