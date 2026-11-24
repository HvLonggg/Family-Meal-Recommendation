# Đối chiếu ID sidecar và danh mục

Rà soát ngày 11/11/2026 phát hiện 11 hồ sơ trong sidecar batch cũ mang ID đang thuộc về món khác trong danh mục tĩnh. Trường `catalog_sync_status: identity_conflict` giữ hồ sơ cũ để tra cứu. Script đồng bộ frontend bỏ qua chúng; importer backend lấy bản ghi `content` hiện hành từ catalog tĩnh theo đúng ID để không ghi đè món đang xuất bản hoặc làm thiếu món khi dựng CSDL mới.

| ID cũ | Hồ sơ sidecar | Món đang giữ ID trong danh mục | Xử lý |
| --- | --- | --- | --- |
| BV355 | Canh cải ngọt thịt băm | Canh khổ qua nhồi thịt | Phục hồi với ID BV801 |
| BV358 | Gỏi cá Nam Ô Đà Nẵng | Nem bưởi chay Tây Ninh | Phục hồi với ID BV802 |
| BV370 | Cà tím kho chay | Đậu hũ sả ớt chay | Giữ ngoài danh mục; trùng gần với cà tím kho đậu hũ chay |
| BV423 | Cá lóc kho chuối xanh | Cá kho Vũ Đại | Phục hồi với ID BV803 |
| BV429 | Cá trê kho gừng | Bún thang Hà Nội | Phục hồi với ID BV804 |
| BV430 | Bánh đúc nóng Hà Nội | Bún mắm nêm Đà Nẵng | Giữ ngoài danh mục; danh mục đã có bánh đúc nóng |
| BV484 | Cá nướng riềng mẻ | Chả cá Lã Vọng Hà Nội | Phục hồi với ID BV805 |
| BV533 | Cá diêu hồng hấp hành gừng | Bánh tôm Hồ Tây | Phục hồi với ID BV806 |
| BV534 | Bí đỏ xào tỏi | Bánh canh Trảng Bàng | Phục hồi với ID BV807 |
| BV535 | Miến lươn Nghệ An | Cháo lươn Vinh Nghệ An | Phục hồi với ID BV808 |
| BV538 | Cháo canh tôm cá Quảng Bình | Cháo canh Quảng Bình | Giữ ngoài danh mục; chưa xác minh được ảnh riêng đúng biến thể |

Tám hồ sơ phục hồi có ảnh Bếp Việt nền trong suốt, nguồn biên tập và bản dịch tiếng Anh; nội dung vẫn ghi rõ chưa nấu thử. Ba hồ sơ chưa đưa vào batch công khai để tránh trùng hoặc sai ảnh. Các mã liên tiếp BV801–BV808 dành riêng cho tám món đã đối chiếu.
