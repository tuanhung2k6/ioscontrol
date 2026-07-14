# iOSControl Custom License & Web IDE Server

Dự án này là máy chủ quản lý bản quyền (License Server) cục bộ và lưu trữ giao diện Web IDE cho tweak iOSControl. Mã nguồn được cấu trúc gọn nhẹ, sạch sẽ để dễ dàng đẩy lên GitHub cá nhân của bạn mà không kéo theo các tệp nhị phân cồng kềnh.

## 📂 Cấu trúc thư mục dự án

```text
ioscontrol_custom_project/
├── .gitignore              # Cấu hình bỏ qua các file nhị phân lớn khi push lên Git
├── README.md               # Tài liệu hướng dẫn sử dụng này
├── rebuild.py              # Script đóng gói Tweak thành file .deb
├── patch_port.py           # Script vá cổng mạng và hiển thị Premium trong Tweak
├── make_sileo_repo.py      # Script đồng bộ dữ liệu vào sileo_repo
├── build/                  # Thư mục chứa file build .deb đầu ra (tự động tạo, bị Git bỏ qua)
├── tweak_package/          # Toàn bộ cấu trúc Tweak (DEBIAN, App iOS, dylibs, plist, ...)
├── static/                 # Giao diện Web IDE tĩnh đã được tối ưu hóa hiển thị Premium
│   ├── index.html
│   ├── settings.html
│   └── style.css / app.js
└── server/                 # Mã nguồn máy chủ Node.js & Database
    ├── package.json
    ├── database.js         # Quản lý cơ sở dữ liệu SQLite (Key & UDID)
    ├── database.sqlite     # Cơ sở dữ liệu SQLite (Tự sinh ra và được .gitignore bỏ qua)
    └── server.js           # Khởi tạo Server & định nghĩa các API Router
```

---

## 🚀 Hướng dẫn cài đặt và khởi chạy

### Bước 1: Cài đặt Dependencies
Mở Terminal/PowerShell tại thư mục `server/` và chạy lệnh:
```bash
cd server
npm install
```

### Bước 2: Khởi chạy máy chủ
Chạy lệnh khởi động máy chủ API:
```bash
npm start
```
Máy chủ sẽ chạy tại địa chỉ mặc định: **`http://localhost:3000`**

---

## 🛠 Hướng dẫn sử dụng các APIs Quản trị (Admin)

### 1. Tạo một License Key mới
Gửi một yêu cầu **`POST`** đến địa chỉ: `http://localhost:3000/admin/keys/create`

**JSON Body (Tùy chọn):**
```json
{
  "plan": "Premium",
  "expires_at": "Lifetime",
  "days_left": 99999
}
```
**Dữ liệu trả về (Response):**
```json
{
  "success": true,
  "message": "Tạo key mới thành công / License key created",
  "license": {
    "key": "IOSC-ABCD-EFGH-1234",
    "plan": "Premium",
    "expires_at": "Lifetime",
    "days_left": 99999
  }
}
```

### 2. Xem danh sách Key và thiết bị đã kích hoạt
Gửi yêu cầu **`GET`** đến địa chỉ: `http://localhost:3000/admin/keys/list`

**Dữ liệu trả về (Response):**
```json
{
  "success": true,
  "licenses": [
    {
      "key": "IOSC-ABCD-EFGH-1234",
      "plan": "Premium",
      "expires_at": "Lifetime",
      "days_left": 99999,
      "udid": "305d0d4b4fda9e886643bdfe73c07cf257f29d46",
      "activated_at": "2026-07-14 21:38:00"
    }
  ]
}
```

---

## 📱 Hướng dẫn sử dụng APIs Client / Tweak (kết nối từ iPhone)

### 1. Kích hoạt bản quyền cho iPhone
Gửi yêu cầu **`POST`** đến địa chỉ: `http://localhost:3000/api/license/verify`

**JSON Body:**
```json
{
  "key": "IOSC-ABCD-EFGH-1234",
  "udid": "305d0d4b4fda9e886643bdfe73c07cf257f29d46"
}
```
**Dữ liệu trả về (Response):**
```json
{
  "success": true,
  "licensed": true,
  "expires_at": "Lifetime",
  "days_left": 99999,
  "udid": "305d0d4b4fda9e886643bdfe73c07cf257f29d46",
  "_sig": "MOCKED_SIG_FOR_305d0d4b4fda9e886643bdfe73c07cf257f29d46_KEY_IOSC-ABCD-EFGH-1234"
}
```

### 2. Kiểm tra bản quyền của thiết bị
Gửi yêu cầu **`GET`** đến địa chỉ: `http://localhost:3000/api/license?udid=305d0d4b4fda9e886643bdfe73c07cf257f29d46`

---

## 🔒 Cấu hình Đẩy lên GitHub (.gitignore)
Các tệp tin sau đã được cấu hình trong `.gitignore` để không bị đẩy lên GitHub, tránh làm lộ cơ sở dữ liệu thực tế và giữ kho lưu trữ nhẹ:
*   `node_modules/` (Thư viện tải về của Node.js)
*   `*.sqlite` và `*.db` (File cơ sở dữ liệu SQLite chứa danh sách key kích hoạt thực tế)
*   `build/` (Thư mục đầu ra của file `.deb` khi build)
*   `*.deb`, `*.tar.gz`, `*.zip` (Các tệp tin nén cài đặt cồng kềnh)

---

## 🛠 Hướng dẫn Đóng gói & Phát hành Tweak (.deb)

Dự án này tích hợp sẵn các công cụ tự động hóa để bạn chỉnh sửa và đóng gói lại tweak trực tiếp trong thư mục dự án mới này:

### Bước 1: Vá cổng mạng và giao diện hiển thị Premium
Nếu bạn sửa đổi hoặc cập nhật thêm các file nhị phân mới và cần vá lại cổng kết nối về `9898` cũng như hiển thị nhãn Premium trên điện thoại, hãy chạy:
```bash
python patch_port.py
```
*(Script sẽ tự động quét và sửa đổi trực tiếp các file nhị phân tĩnh bên trong thư mục `tweak_package`)*

### Bước 2: Đóng gói thành file `.deb`
Chạy script đóng gói Python để nén toàn bộ thư mục `tweak_package` thành file cài đặt:
```bash
# Tạo thư mục build nếu chưa có
mkdir build
# Đóng gói tweak
python rebuild.py tweak_package -o build/com.tuanhungdz.ioscontrol_1.7.4_iphoneos-arm64_rebuilt.deb
```

### Bước 3: Đồng bộ vào kho lưu trữ Sileo (GitHub Pages)
Sau khi build xong file deb, chạy script sau để tự động tính toán dung lượng, mã băm SHA256 và cập nhật các tệp tin cấu hình (`Packages`, `Release`) của Sileo Repo:
```bash
python make_sileo_repo.py
```

### Bước 4: Đẩy cập nhật lên GitHub
Tiến hành đẩy thư mục `sileo_repo` lên repository GitHub của bạn để hoàn tất cập nhật trên Sileo:
```bash
cd sileo_repo
git add .
git commit -m "Update tweak in sileo repo"
git push
```

