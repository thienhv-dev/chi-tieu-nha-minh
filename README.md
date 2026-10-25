# Chi tiêu nhà mình

Web app tĩnh (1 file `index.html`) cho 2 vợ chồng cùng xem/sửa chi tiêu theo tháng.
Dữ liệu lưu trong **Google Sheet** qua Apps Script.

Mở `index.html` khi chưa cấu hình `API_URL` = **chế độ demo** (lưu trên trình duyệt) để xem thử.

```
index.html  ──fetch──▶  Apps Script Web App (/exec)  ──▶  Google Sheet
(GitHub Pages)          kiểm tra PIN                      tab Items · Income · Types · Months
```

## 1. Tạo DB + backend (Google Sheet + Apps Script)

1. Tạo **Google Sheet** mới, đặt tên tuỳ ý (VD: `Chi tiêu nhà mình`).
2. Menu **Extensions → Apps Script**, xoá code mẫu, dán toàn bộ [apps-script/Code.gs](apps-script/Code.gs) → 💾 Save.
3. **Đặt PIN** (không nằm trong code): ⚙️ **Project Settings → Script properties → Add script property**
   - Property: `PIN` · Value: mã riêng của 2 vợ chồng (nên ≥ 8 ký tự) → **Save script properties**.
4. **Deploy → New deployment →** ⚙️ chọn loại **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. **Authorize access** → chọn tài khoản → *Advanced → Go to … (unsafe)* → Allow
   (cảnh báo này bình thường vì script do chính bạn viết).
6. Copy **Web app URL** (đuôi `/exec`).

Script tự tạo 4 tab ở lần gọi đầu tiên (hoặc chọn hàm `setup` rồi bấm ▶ Run):

| Tab | Cột | Ý nghĩa |
|---|---|---|
| `Items` | id, month, order, name, amount, status, note, updatedAt, updatedBy, due, details | Khoản chi theo tháng. `status`: `none` / `paid` / `skip`. `due`: hạn nộp (ngày trong tháng). `details`: JSON các dòng chi tiết `[{name, amount, paid, note}]` |
| `Income` | month, name, amount, updatedAt, updatedBy | Các khoản thu theo tháng |
| `Types` | order, name, amount, due, updatedAt, updatedBy | Loại khoản chi: dropdown khi thêm khoản + dùng cho "Tạo từ mẫu" |
| `Months` | month, name, updatedAt, updatedBy | Tên riêng của tháng (VD "Tháng cưới") |

> Không lưu lịch sử thay đổi (cho nhẹ). Sheet cũ còn tab `History` thì có thể xoá tay.

> Kiểm tra nhanh: mở `<URL>/exec?action=list&key=<PIN>&month=2026-10` trên trình duyệt → thấy `{"ok":true,...}` là chạy.

**Sửa `Code.gs` sau này:** dán code mới → **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. URL giữ nguyên.
(Đừng bấm *New deployment* — sẽ ra URL mới.)

## 2. Gắn URL vào app

Trong `index.html`, tìm `CONFIG` và dán URL:

```js
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/XXXX/exec',
  USERS: [{ id: 'Chồng', color: '#2f7cf6' }, { id: 'Vợ', color: '#e5486a' }],
  ...
```

Có thể đổi tên `USERS` (VD: "Tuyền", "Lan").

## 3. Đưa lên mạng (GitHub Pages, miễn phí)

```bash
git init && git add . && git commit -m "Chi tiêu nhà mình"
gh repo create chi-tieu-nha-minh --public --source=. --push
```

Trên GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
Sau ~1 phút có link `https://<user>.github.io/chi-tieu-nha-minh/`.

Hoặc **Netlify Drop**: kéo thả thư mục vào https://app.netlify.com/drop.

Trên điện thoại: mở link → Chia sẻ → **Thêm vào MH chính** để dùng như app (có icon riêng, mở toàn màn hình).

## Dùng

- Lần đầu chọn **Chồng/Vợ** và nhập PIN (lưu trên máy).
- **Nhập tiền nhanh**: gõ `2tr5`, `500k`, `1.2tr`; hoặc dùng nút `000` / `+100k` / `+500k` / `+1tr` dưới ô số tiền.
- Chạm nút trạng thái để đổi nhanh → có **Hoàn tác** trong 5 giây nếu lỡ tay.
- **Đổi tên tháng**: chạm vào tháng đang chọn (có ✏️) → đặt tên riêng; bỏ trống để về "Tháng N".
- **Tổng quan**: còn dư/thiếu của tháng, các khoản còn phải trả, thay đổi gần đây.
- **Loại chi** (tab riêng ở thanh dưới): định nghĩa danh sách loại = tên + số tiền + hạn mặc định.
  Khi thêm khoản, chọn loại trong **dropdown** → tự điền tiền/hạn; khoản phát sinh chọn **Khác (tự nhập)**.
- **Chi tiết trong khoản** (VD Vợ sinh hoạt 2,5tr → Điện thoại 500k, Máy tính góp 900k): số tiền của khoản là ngân sách,
  mỗi dòng chi tiết đánh dấu đã trả riêng (trong màn sửa khoản, bấm ✓ rồi Lưu). Có dòng đã trả → khoản thành **Đang trả**, hiện số còn lại.
- **Khoản chi**: bảng tóm tắt dự kiến chi / đã trả / thu nhập / dư-âm; chạm nút trạng thái để đổi nhanh *Chưa trả → Đã trả → Hoãn*; chạm tên để sửa số tiền, **hạn nộp**, ghi chú, xoá.
- **Thu nhập**: nhập nhiều khoản thu (tên + tiền); tháng mới tự gợi ý từ tháng trước.
- **Dòng tiền**: tiền đang có, lịch trả theo hạn, phần tiền **để không ≥ 14 ngày** (có thể đầu tư tạm).
- Tháng mới trống: **Sao chép từ tháng trước** (giữ hạn nộp + thu nhập, trạng thái reset) hoặc **Tạo từ mẫu** (theo danh sách loại).
- **Nhanh dù Apps Script chậm**: dữ liệu lưu sẵn trên máy (mở app là thấy ngay), mọi thao tác hiện ngay và được lưu ở nền
  theo thứ tự (chấm *Đang lưu… / ✓ Đã lưu / ⚠ Chưa lưu được / Ngoại tuyến* cạnh tên tháng; thay đổi chờ lưu được giữ cả khi tắt app).
- App tự làm mới mỗi 20 giây và khi mở lại tab. Backend đệm kết quả 10 phút: **sửa tay trong Sheet** thì app thấy sau tối đa 10 phút
  (muốn ngay: chạy hàm `setup` trong Apps Script).

## Bảo mật

- Link trang và URL Apps Script là public, nhưng đọc/ghi dữ liệu cần **PIN**.
- PIN nằm trong **Script properties** của Apps Script, không có trong code → push repo public vẫn an toàn.
- Đây là mức bảo vệ "gia đình": đừng dùng PIN trùng mật khẩu quan trọng.
- Đổi PIN: sửa Script property `PIN` (không cần deploy lại) → 2 người nhập lại PIN mới.
