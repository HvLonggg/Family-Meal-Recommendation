# Hướng dẫn cộng tác trong repo

- Với yêu cầu có nhiều domain hoặc khối lượng lớn, tra `docs/TECH_TEAM.md` để phân công đúng chuyên môn khi chỉ dẫn của phiên cho phép dùng agent.
- Mỗi agent cần phạm vi file/module, đầu ra và cách kiểm chứng riêng; tránh sửa chồng lấn. Agent tích hợp chịu trách nhiệm review kết quả cuối.
- Agent là cộng tác viên theo tác vụ, không phải tiến trình nền thường trực. Không tuyên bố đã chạy test, Docker hay dịch vụ bên ngoài nếu chưa thực hiện.
- Giữ nguyên thay đổi người dùng và trạng thái workspace hiện có; trước khi sửa file đã thay đổi, kiểm tra phần liên quan và không hoàn tác nội dung ngoài phạm vi.
- Tuân theo `CODING_UI_STANDARDS_PYTHON_REACT_V2_SENIOR.md`, các ADR trong `docs/adr/` và chính sách nội dung tại `docs/CONTENT_SOURCE_POLICY.md`.
