# Kho món: thu gọn bộ lọc và kiểm thử (19/11/2026)

## Phạm vi

Tiếp tục phần kho món đang dở trong workspace; giữ công việc khác hiện có.
Tác nhân: người duyệt kho món, khách hoặc tài khoản có bộ sưu tập riêng.
Không đổi contract API, quyền truy cập hay nội dung công thức.

## Hành vi và ca nghiệm thu

| Luồng                 | Kết quả cần giữ                                                                                            | Kiểm chứng                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Bộ lọc                | Mặc định đóng; mở/đóng giữ lựa chọn; 6 tùy chọn đầu mỗi nhóm; xem thêm/thu gọn                             | Component + browser                 |
| Lựa chọn đang áp dụng | Hiện tối đa 3 chip; có xem thêm, bỏ riêng từng điều kiện, xóa hết                                          | Component + browser                 |
| Kết hợp lọc           | OR trong nhóm nguyên liệu/cách nấu; AND giữa các nhóm, vùng, cá nhân hóa và tìm kiếm                       | Unit + component                    |
| Tab và sắp xếp        | Giữ từ khóa; đổi tab xóa nguyên liệu/cách nấu cũ; trở về trang đầu                                         | Component + browser                 |
| Phân trang            | Giới hạn trang hợp lệ; trước/sau đúng; giữ bộ lọc; nút đủ lớn trên di động                                 | Component + browser                 |
| Tìm kiếm và lịch sử   | Không mất chữ khi thao tác nhanh; hủy debounce khi Back; không phục hồi bản nháp cũ; Forward khôi phục URL | Component + browser                 |
| Không có kết quả      | Có nút xóa tìm kiếm/lọc và giữ tab/sắp xếp                                                                 | Component + browser                 |
| Yêu thích             | Loading, lỗi/retry, rỗng, khách, chuyển tài khoản, phản hồi đến muộn và xóa món                            | Component; browser dùng API giả lập |
| Di động               | Danh mục một hàng cuộn; tab đang chọn nhìn thấy; trợ lý nằm cuối danh sách khi đóng, không che nút lưu     | Browser + ảnh                       |
| Metadata ảnh cũ       | 8 mô tả bị hỏng dấu được phục hồi; snapshot, registry và bản dịch đồng nhất; không đổi công thức           | Localization + semantic diff        |
| Ghi JSON              | Ghi file tạm rồi đổi tên; thử lại có giới hạn khi Windows khóa file; không cắt file đích khi lỗi           | Chạy lại prepare:catalog            |

## Bằng chứng

- Toàn bộ frontend: `corepack pnpm exec vitest run --maxWorkers=2` đạt 507/507 test trong 56 file.
- `corepack pnpm build` đạt, gồm tái tạo catalog, TypeScript và Vite; build còn cảnh báo bundle lớn có sẵn.
- ESLint và Prettier các file thay đổi đạt.
- Agent QA: 61 test mục tiêu đạt (27 trang kho món, 26 bộ lọc dữ liệu, 8 băng chuyền).
- Localization: 6 test đạt; catalog vẫn đủ 812 món; semantic diff giới hạn ở metadata ảnh của 8 món.
- Browser: 51/51 kiểm tra đạt, không lỗi JavaScript. Bảy viewport bắt buộc và landscape không tràn ngang; phân trang đo thực tế 44px trên mobile/tablet, 45px desktop.
- [Báo cáo browser và giới hạn](../output/ui-review/catalog-2026-11-19/README.md), [chi tiết từng kiểm tra](../output/ui-review/catalog-2026-11-19/report.json).

Browser dùng Chromium headless, tài khoản/yêu thích giả lập và catalog offline thật.
Reflow tương đương 200% đã kiểm; chưa kiểm browser zoom native, Safari/iOS thật,
screen reader hoặc backend production. Không triển khai production trong tác vụ này.

Các test timeout khi chạy quá nhiều worker đã được chạy lại với `--maxWorkers=2`.
Không tăng timeout hoặc bỏ assertion để né lỗi.
