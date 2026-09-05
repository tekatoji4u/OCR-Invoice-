# Trích xuất Hóa đơn OCR (bản Web/Mobile) — VietinBank

Công cụ trích xuất thông tin hóa đơn (PDF/ảnh) và xuất ra Excel, chạy **ngay trên
trình duyệt** (kể cả điện thoại) — không có backend, không upload file lên server
nào. Có thể deploy miễn phí bằng GitHub Pages hoặc Vercel để chia sẻ link cho
mọi người dùng.

Design by **Hải Đăng**.

## Vì sao an toàn khi chia sẻ công khai?

Toàn bộ xử lý OCR và tạo file Excel diễn ra bằng JavaScript ngay trong trình
duyệt của người dùng (thư viện Tesseract.js, PDF.js, SheetJS — đã đóng gói sẵn
trong thư mục `libs/` và `tessdata/`). Trang web chỉ là các file tĩnh
(HTML/CSS/JS) — **không có server xử lý dữ liệu**, người dùng nào mở link cũng
chỉ đang chạy công cụ trên máy/điện thoại của chính họ. File hóa đơn của họ
không rời khỏi thiết bị của họ.

## Cách deploy

### Cách 1 — GitHub Pages (miễn phí)

1. Tạo một repo mới trên GitHub (ví dụ `invoice-ocr-web`).
2. Copy toàn bộ nội dung thư mục này vào repo rồi push lên:
   ```bash
   git init
   git add .
   git commit -m "Invoice OCR web app"
   git branch -M main
   git remote add origin https://github.com/<ten-user>/invoice-ocr-web.git
   git push -u origin main
   ```
3. Vào repo trên GitHub → **Settings → Pages** → mục "Build and deployment" →
   Source chọn **Deploy from a branch** → Branch chọn **main** / thư mục **/(root)** → Save.
4. Sau 1-2 phút, trang sẽ chạy tại:
   `https://<ten-user>.github.io/invoice-ocr-web/`

### Cách 2 — Vercel (miễn phí, nhanh hơn)

1. Push code lên GitHub như bước 1-2 ở trên (hoặc dùng Vercel CLI để deploy trực
   tiếp từ máy, xem bên dưới).
2. Vào https://vercel.com → **Add New → Project** → chọn repo vừa tạo → bấm
   **Deploy** (không cần chỉnh gì, đây là static site nên Vercel tự nhận diện).
3. Vercel sẽ cấp cho bạn 1 link dạng `https://invoice-ocr-web.vercel.app`.

Deploy thẳng từ máy bằng CLI (không cần GitHub):
```bash
npm i -g vercel
cd invoice-ocr-web
vercel --prod
```

## Cấu trúc thư mục (giữ nguyên khi deploy)

```
index.html          giao diện chính
style.css           giao diện responsive (desktop + mobile)
app.js              toàn bộ logic: đọc file, OCR, trích xuất, xuất Excel
libs/               PDF.js, Tesseract.js, SheetJS (đã tải sẵn, không gọi CDN)
tessdata/           dữ liệu ngôn ngữ OCR tiếng Việt + tiếng Anh (~2.4MB)
vercel.json         cấu hình content-type/cache khi host trên Vercel (tuỳ chọn)
```

⚠️ Không xoá hay đổi tên các file trong `libs/` và `tessdata/` — `app.js` gọi
đích danh các file này theo đường dẫn tương đối.

## Giới hạn cần biết

- Lần đầu người dùng mở trang, trình duyệt cần tải khoảng ~10MB thư viện + dữ
  liệu ngôn ngữ (chỉ 1 lần, sau đó trình duyệt tự cache). Trên mạng 4G chậm có
  thể mất vài giây đến vài chục giây.
- OCR chạy bằng CPU của máy/điện thoại người dùng — điện thoại đời cũ có thể xử
  lý chậm hơn máy tính, đặc biệt với file PDF nhiều trang hoặc ảnh độ phân giải
  rất cao.
- Độ chính xác OCR phụ thuộc chất lượng ảnh/scan. Giao diện luôn cho phép sửa
  tay kết quả trước khi xuất Excel.
- Đây là static site thuần — nếu sau này muốn thêm tính năng cần backend (ví
  dụ lưu lịch sử nhiều người dùng, xác thực đăng nhập...) sẽ cần bổ sung thêm
  server riêng, ngoài phạm vi bản này.
