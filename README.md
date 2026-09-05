# DMS Auto Tool (macOS desktop app)

Ứng dụng desktop chạy **local** trên macOS: đọc danh sách khách hàng từ Excel và tự động nhập vào website DMS bằng Playwright (thao tác trên trình duyệt như người dùng thật). Không dùng API DMS, không truy cập database DMS, không có backend cloud.

## Công nghệ

Electron + Node.js + Playwright + React + TypeScript + xlsx (SheetJS) + electron-builder.

## Cấu trúc

```
electron/           # main process
  main.cjs          # cửa sổ app + IPC
  preload.cjs       # bridge an toàn cho renderer
  config.cjs        # đọc/ghi config.json (bản người dùng nằm trong userData)
  excel.cjs         # đọc Excel, mọi giá trị đọc dạng text
  checkpoint.cjs    # checkpoint local, khách Completed sẽ bị bỏ qua
  automation.cjs    # Playwright: persistent profile + workflow nhập liệu
renderer/           # UI React tiếng Việt (Vite)
config.json         # cấu hình mặc định: URL, selector, mapping xe → nguồn lực
vite.electron.config.ts
```

## Lệnh Terminal

Yêu cầu: macOS, Node.js 20+, Google Chrome (khuyến nghị).

```bash
# 1. Cài dependencies
npm install
npx playwright install chromium

# 2. Chạy thử app (dev)
npm run electron:dev

# 3. Build thành .app (macOS)
npm run electron:build

# 4. Mở ứng dụng đã build
open "release/mac-arm64/DMS Auto Tool.app"      # Mac Apple Silicon
open "release/mac/DMS Auto Tool.app"            # Mac Intel
```

Bản build cũng tạo file `.dmg` trong thư mục `release/`. Nếu macOS cảnh báo app chưa ký, bấm chuột phải vào app → Open, hoặc chạy:

```bash
xattr -dr com.apple.quarantine "release/mac-arm64/DMS Auto Tool.app"
```

## Cách dùng

1. Bấm **MỞ DMS** → Chrome mở với profile được lưu (persistent profile). Đăng nhập DMS thủ công một lần; các lần sau phiên đăng nhập vẫn còn. App không bao giờ hỏi mật khẩu DMS.
2. Bấm **Chọn file Excel** → xem tên file, tổng số khách và bảng danh sách.
3. Bấm **TEST 1 KHÁCH** để kiểm tra selector/workflow trước khi chạy toàn bộ.
4. Bấm **BẮT ĐẦU**; có thể **TẠM DỪNG / TIẾP TỤC / DỪNG** bất cứ lúc nào.
5. Theo dõi log realtime, thanh tiến trình và thống kê Tổng khách / Thành công / Lỗi.

## Excel

Các cột cần có: `Họ và tên`, `Số điện thoại`, `CCCD/GPLX`, `Dòng xe lái thử`. Nếu file dùng tên cột khác, đổi trong tab **Cài đặt → Mapping cột Excel**. SĐT và CCCD/GPLX luôn được đọc dạng text nên không mất số 0 đầu và không bị làm tròn.

## Workflow từng khách

Mở form tạo đăng ký mới → điền Họ tên, SĐT, CCCD/GPLX, Dòng xe, Nguồn lực tương ứng → **Lưu & đóng** → kiểm tra trạng thái thật của trang:

- Form đóng / về màn hình danh sách → **Thành công**.
- Form còn mở → chờ giao diện ổn định rồi bấm **Lưu & đóng** lần 2. Đóng được → Thành công.
- Vẫn không đóng hoặc có thông báo lỗi → khách được đánh dấu **Lỗi** và automation dừng lại.

Tối đa 2 lần bấm Lưu & đóng. Việc xác định thành công dựa trên element/trạng thái thật của trang, không dùng delay cố định.

## An toàn dữ liệu

- Checkpoint lưu local (`checkpoint.json` trong thư mục userData của app).
- Khách thành công được đánh dấu Completed; lần chạy sau tự động bỏ qua, không nhập lại.
- Lỗi nghiêm trọng → dừng automation, hiển thị khách đang lỗi kèm log lỗi.
- Nút **Xoá checkpoint** để chạy lại từ đầu khi cần.

## Cấu hình

Toàn bộ selector, URL DMS, mapping cột Excel và mapping dòng xe → nguồn lực nằm trong `config.json` (không hard-code trong logic automation) và chỉnh được trong tab **Cài đặt**. Mapping mặc định: VF3, VF5, VF6, VF7, VF8 → nguồn lực tương ứng.

Selector option dòng xe / nguồn lực dùng placeholder `{value}`, ví dụ:

```
div[role='option']:has-text("{value}")
```

Bản chỉnh sửa được lưu tại `~/Library/Application Support/DMS Auto Tool/config.json`.
