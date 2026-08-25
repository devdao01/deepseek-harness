# DeepSeek Harness

[English](README.md) | Tiếng Việt

DeepSeek Harness (`dsh`) là một agent harness (khung agent) mã nguồn mở do [DeepSeek AI](https://deepseek.com) phát triển.

Nó theo kiến trúc **mọi thứ đều là plugin**, được vận hành bởi [Cordis](https://github.com/cordiverse/cordis), với thiết kế tham khảo bài báo [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Bản xem trước dành cho nhà phát triển

DeepSeek Harness hiện đang ở giai đoạn _bản xem trước dành cho nhà phát triển (developer preview)_, đang trong quá trình lặp nhanh. **Trong tương lai sẽ có những thay đổi phá vỡ khả năng tương thích.**

## Chạy thử

### Chạy qua `npm`

Cài đặt `Node.js`, sau đó chạy:

```sh
npx @deepseek-ai/dsh web
```

Lệnh này sẽ khởi động Web UI, mặc định tại địa chỉ `http://127.0.0.1:3080`. Xem chi tiết tại [hướng dẫn Web UI](docs/user/guide/index.md).

### Chạy từ mã nguồn

Nếu muốn chạy từ mã nguồn của repo:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## Cộng đồng và hỗ trợ

- Hoan nghênh gửi phản hồi hoặc báo cáo bug qua [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Thêm topic [`dsh-plugin`](https://github.com/topics/dsh-plugin) vào repo plugin của bạn để dễ được tìm thấy hơn.
- Hoan nghênh tham gia nhóm WeCom (企微) của DeepSeek Harness: quét mã để thêm trợ lý WeCom và điền khảo sát tham gia nhóm, sau khi hoàn tất trợ lý sẽ mời bạn vào nhóm.

<table>
  <thead>
    <tr>
      <th align="center">Trợ lý WeCom</th>
      <th align="center">Khảo sát tham gia nhóm</th>
      <th align="center">Tài khoản chính thức WeChat</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="assets/community-wecom-assistant.png" alt="Mã QR trợ lý WeCom của DeepSeek Harness" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="assets/community-wecom-survey.png" alt="Mã QR khảo sát tham gia nhóm DeepSeek Harness" width="180" height="180"></a></td>
      <td align="center"><img src="assets/community-wechat-official-account.png" alt="Mã QR tài khoản chính thức WeChat của đội ngũ DeepSeek Harness" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## Tham gia đóng góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md).

## Phát triển

Vui lòng đọc [hướng dẫn phát triển](docs/development.md) và [tài liệu kiến trúc](docs/architecture.md) trước.

Dành cho agent: vui lòng tuân theo [AGENTS.md](AGENTS.md).

## Giấy phép

[MIT](LICENSE)

Xem các phụ thuộc bên thứ ba và giấy phép của chúng tại [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
