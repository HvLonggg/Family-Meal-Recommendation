"""AI riêng của Bếp Việt: phân loại ý định + trích thông tin + trả lời từ dữ liệu món thật.

Mô hình tuyến tính nhỏ (thuần Python, không phụ thuộc thư viện nặng) chạy ngay trong backend;
câu nào chưa chắc hoặc intent chưa qua cổng chấm điểm thì chuyển cho LLM (Gemini).
Điểm vào duy nhất cho phần còn lại của ứng dụng: `router.decide()`.
"""
