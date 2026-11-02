# Sơn Tự · Metamong — Chùa 3D tiếng Việt, có đa người chơi

Bản dựng độc lập lấy cảm hứng từ trải nghiệm công khai của [Sansa / 산사](https://sansatemple.com/). Không sử dụng tài nguyên, mã nguồn đóng, thương hiệu hay máy chủ của Sansa. Các tên địa danh và nghi thức trong thế giới 3D được mô phỏng bằng hình học tự tạo.

## Những gì đang chạy được

| Nhóm | Tính năng | Trạng thái |
|---|---|---|
| Không gian | Three.js **0.180.0 / r180**; chính điện Thanh Duyên Đường, sân **100 đệm 10×10**, bệ tượng tạo bằng hình học, hai tượng phụ, đèn đá, cây, hai ao sen, cổng, **Sân trăng** với DJ/lều và đèn | Có — geometry tự dựng, không phải asset gốc |
| Thời gian | Đồng hồ `Asia/Seoul`, 06:00–18:00 ngày; ngoài giờ là đêm | Có |
| Di chuyển | WASD, mũi tên, joystick; **click sàn = A\*** tìm đường; kéo để xoay, wheel/pinch để zoom | Có |
| Nghi lễ | **Lạy 108 lần tự động** (1/E/Space bật/tắt); **108 hạt/27 hạt hiển thị** (2); chắp tay (3); nhảy sân trăng (4); gõ mõ tự động Web Audio (5); dâng hương (6), nhang 2 phút, tối đa 5 cây | Có (mô phỏng đơn giản) |
| Âm thanh | Thiên nhiên tổng hợp (Web Audio), hiệu ứng mõ, nút kinh có đồng bộ mốc Seoul 05:00/18:00 | Có; **không kèm bản thu thương mại hoặc chưa xác minh bản quyền** |
| Multiplayer | Cloudflare Durable Objects WebSocket; 100 người hoạt động/phòng, 50 người trong hàng chờ, 100 phòng × 16 instance × 6 region dạng nhãn logic; gói trạng thái 10B/26B; ack/sequence/sync; hàng đợi dâng hương | Code sẵn; **phải tự triển khai Worker và điền endpoint** |
| Hiệu năng | `InstancedMesh` cho 100 đệm và nhân vật mạng; pacing 60/30/15 fps; nút đồ họa thấp/cao/tự động | Có; chưa benchmark tải thực tế |
| Trợ năng | UI tiếng Việt chuẩn UTF-8, role/aria, phím tắt, `prefers-reduced-motion` | Có |

**Không có chat, đăng nhập, tài khoản, xếp hạng, theo dõi người dùng hoặc thanh toán.** Hòm công đức chỉ là màn hình giải thích, không thu tiền.

## Chạy cục bộ

```bash
python -m http.server 8080
```

Mở `http://localhost:8080`. Cần Internet để tải **Three.js** từ CDN. Website tĩnh vẫn hoạt động với khách NPC mô phỏng khi `apiBase` trống. Node.js 20+ dùng để chạy kiểm thử:

```bash
npm test
npm run check
```

## GitHub Pages

Có `.github/workflows/pages.yml`. Trong **Settings → Pages**, chọn **Source → GitHub Actions**; `push main` tự xuất bản tại `https://xulytiengviet.github.io/metamong/` khi cấu hình Pages đã bật. Tất cả đường dẫn nội bộ tương đối.

## Cloudflare Worker / Durable Objects — đa người thật

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

Sửa `src/config.js`:

```js
export const CONFIG = {
  apiBase: 'https://metamong-presence.TEN_TAI_KHOAN.workers.dev',
  chant: { url: '', title: '', creator: '', license: '' },
  partyTracks: [],
  maxPeersRendered: 100
};
```

`apiBase` để trống = **mô phỏng**; có backend hợp lệ = **người thực**. Chọn phòng `maru-1`…`maru-100`, instance `0`…`15`, vùng `apac/eur/nam/sam/oce/afr`; đây là **logic sharding** chứ không có bằng chứng về vị trí máy chủ vật lý hay hiệu suất theo vùng.

Endpoint: `/health` trả JSON trạng thái, `/ws` nâng cấp WebSocket. Server kiểm tra `Origin` theo `ALLOWED_ORIGIN`, giới hạn thông điệp và tốc độ/di chuyển, `serializeAttachment` giữ trạng thái khi Durable Object hibernates. Không có fallback Supabase tự động vì chưa có tài khoản, khóa hoặc chính sách của người dùng.

`MAX_ACTIVE=100` và `MAX_WAITING=50` là **giới hạn ứng dụng**; không phải bằng chứng có thể xử lý 100/10000 người trơn tru. Muốn production cần tải thử, chống lạm dụng, quan sát lỗi và giám sát chi phí.

## Âm thanh và giấy phép

Không sao chép âm thanh, file `buddha.glb`/`monk.glb`, ảnh, nhạc hoặc giao thức nội bộ của Sansa. Có thể gắn âm thanh hợp pháp bằng `CONFIG.chant`: trường `url` dẫn đến tài sản mà bạn được phép công khai, `title`, `creator`, `license` cần ghi rõ. Giờ cầu kinh chung 05:00 và 18:00 là **theo Seoul** và chỉ đồng bộ thời điểm chạy nếu người nghe chủ động bật. Cách này dựa vào đồng hồ/timestamp, không phát hiện lịch nghi lễ thật.

Các bài nhạc gợi ý trong `CONFIG.partyTracks` chỉ có tiêu đề và tên người sáng tạo theo mô tả người dùng; **chưa có file và chưa thể phát**, cần xác nhận quyền sử dụng, URL, giấy phép.

## Phạm vi và tính trung thực kỹ thuật

- Đây là bản **tái dựng chức năng**, không phải sao chép 1:1 hình học, shader, âm thanh hay code minified của Sansa; không tuyên bố đạt chất lượng đồ họa tương đương bản gốc.
- A* dùng lưới, tránh một số vật cản cố định (bệ phía sau, ao nước, quầy DJ), chưa phải navmesh tổng quát cho mọi geometry.
- Multiplayer hiện dùng **gói dữ liệu nhị phân 10/26B**, không phải tái sử dụng giao thức riêng của máy chủ Sansa. Phòng chờ và nhang server-side chỉ hoạt động sau khi Worker được triển khai.
- Âm thanh tự tắt khi tab ẩn, không triển khai thanh toán/thu thập danh tính.

**Tác giả bản dựng:** Long Ngo. **Giấy phép phần mã nguồn độc lập:** MIT. Three.js giữ giấy phép riêng của dự án gốc.
