# Nhóm kỹ thuật Bếp Việt

Tài liệu này định nghĩa các vai trò chuyên môn để phân công và review công việc trong repo. Đây là mô hình phối hợp theo tác vụ, không phải các agent chạy nền thường trực: người điều phối chỉ gọi vai trò phù hợp khi phạm vi công việc và chỉ dẫn hiện hành cho phép. Mỗi phần việc cần có đầu ra, ranh giới file/module và cách kiểm chứng rõ ràng.

## Vai trò

| Vai trò | Phạm vi chính | Đầu ra cần bàn giao |
| --- | --- | --- |
| Frontend và trải nghiệm | React, TypeScript, trang/feature, responsive, trạng thái tải/lỗi/rỗng, tương tác và thiết kế nhất quán | Thay đổi UI gắn với tiêu chí nghiệm thu; keyboard/focus và responsive được rà soát |
| Backend và API | FastAPI, module nghiệp vụ, schema, validation, API contract, truy vấn và migration | Quy tắc nghiệp vụ phía server, contract tương thích, xử lý lỗi và phân quyền |
| Dữ liệu và kho món | Công thức, taxonomy, tìm kiếm, nhập/xuất catalog, nội dung và nguồn tham khảo | Dữ liệu có cấu trúc hợp lệ, món không trùng/sai nhóm, nội dung biên tập riêng và nguồn được ghi nhận |
| Tài khoản, email và bảo mật | Đăng nhập, phiên, RBAC, OTP, email, dữ liệu cá nhân, audit và threat review | Luồng an toàn có kiểm tra quyền ở backend, không lộ bí mật hoặc dữ liệu người dùng |
| QA và DevOps | Ma trận kiểm thử, CI, môi trường, cấu hình, Docker, logging, khôi phục và phát hành | Bằng chứng kiểm tra phù hợp với rủi ro; hướng dẫn vận hành và rollback khi cần |
| Tài sản và accessibility | Ảnh, biểu tượng, kích thước/tối ưu media, attribution, tương phản, nhãn hỗ trợ đọc màn hình | Tài sản đúng nội dung/giấy phép, tải hợp lý, có mô tả thay thế và không làm vỡ bố cục |
| Technical lead / tích hợp | Chốt phạm vi, boundary, API/data contract, phụ thuộc và review thay đổi liên module | Quyết định kỹ thuật được ghi lại; các phần ghép được kiểm tra cùng nhau |

## Cách phân công

1. Chuyển yêu cầu thành mục tiêu và tiêu chí nghiệm thu có thể kiểm tra; xác định người dùng, quyền truy cập và trường hợp lỗi.
2. Chia theo boundary trong kiến trúc modular monolith. Frontend và backend chỉ làm song song sau khi thống nhất contract; tránh giao hai người sửa cùng một file hoặc cùng một nguồn dữ liệu.
3. Mỗi phần việc phải nêu rõ file/module được phép sửa, đầu ra, phụ thuộc và lệnh kiểm chứng. Thay đổi liên quan nhiều domain có một người tích hợp chịu trách nhiệm cuối.
4. Người review kiểm tra hành vi, bảo mật, khả năng truy cập và tương thích dữ liệu/API; không chỉ đọc diff hoặc dựa vào việc build thành công.
5. Chọn kiểm tra theo mức rủi ro. Auth, quyền, migration và dữ liệu cá nhân cần review/kiểm thử hồi quy chặt hơn thay đổi giao diện hoặc tài liệu.

## Quy ước dự án

- Tuân theo [chuẩn phát triển Python và React](../CODING_UI_STANDARDS_PYTHON_REACT_V2_SENIOR.md), kiến trúc modular monolith trong [ADR 0001](adr/0001-modular-monolith.md), và các ADR liên quan trước khi đổi contract hoặc ownership dữ liệu.
- Dữ liệu người dùng phải được giới hạn theo tài khoản ở backend. Không ghi mật khẩu, token, OTP, secret hoặc nội dung riêng tư vào log, fixture công khai hay tài liệu.
- Nội dung món phải được biên tập bằng lời riêng, lưu nguồn tham khảo; ảnh cần đúng món và có quyền sử dụng phù hợp theo [chính sách nguồn nội dung](CONTENT_SOURCE_POLICY.md).
- Không tuyên bố đã chạy test, Docker, gửi email hoặc kiểm tra môi trường nếu chưa thực sự thực hiện. Ghi rõ kiểm tra nào đã chạy và giới hạn còn lại.
- Các phần việc cùng dùng workspace cần tránh chỉnh sửa chồng lấn; trước khi thay đổi dữ liệu hoặc file có sẵn, kiểm tra trạng thái hiện tại và giữ nguyên công việc chưa liên quan.
