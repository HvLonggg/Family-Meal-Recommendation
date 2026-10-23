# Dữ liệu Bếp Việt AI (Chú Rồng)

Dữ liệu do đội ngũ Bếp Việt **tự biên soạn** và sinh biến thể **bằng quy tắc**. Không dùng
Gemini/ChatGPT/Claude để tạo dữ liệu huấn luyện (điều khoản nhà cung cấp cấm). Câu trả lời chỉ
mô tả tính năng có thật trong ứng dụng; không ghi số điện thoại/email cụ thể (dẫn tới `/contact`).

## Tệp

| Tệp | Nội dung |
| --- | --- |
| `intents.json` | Taxonomy: 69 intent, câu trả lời đã duyệt (vi/en), gợi ý tiếp theo |
| `seeds.json` | Câu gốc viết tay cho tập train (`{dish}`, `{n}`, `{m}` là chỗ điền) |
| `utterances.jsonl` | Tập train **sinh tự động** từ `seeds.json` — đừng sửa tay |
| `utterances_test.jsonl` | Tập kiểm tra **viết riêng**, không phải biến thể của câu train |
| `scenarios.jsonl` | Tình huống hội thoại end-to-end |
| `build_dataset.py` | Sinh `utterances.jsonl` + kiểm tra chất lượng |

## Schema

`intents.json` → `{"intents": [ ... ]}`, mỗi phần tử:

- `id`, `kind` (`faq` | `action` | `smalltalk` | `handoff_llm` | `safety`), `group` (để thống kê), `description`.
- `answer_vi`, `answer_en`: bắt buộc với `faq`/`smalltalk`/`safety`. Với `action` đây là **câu hỏi lại** khi thiếu slot (vd chưa biết món nào); câu trả lời thật dựng từ catalog lúc chạy. `handoff_llm` để trống.
- `handler` (chỉ `action`): `ingredients`, `cook_time`, `nutrition`, `steps`, `scale_servings`, `recommend`.
- `followups`: `{"vi": [...], "en": [...]}`.
- `out_of_scope` có kind `faq`: trả lời cố định, không gọi LLM để giữ chi phí $0.
- `affirm`/`deny` phụ thuộc ngữ cảnh lượt trước; câu trả lời chỉ là mặc định.

`utterances*.jsonl`: mỗi dòng `{"text": ..., "intent": ..., "lang": "vi"|"en"}`.

`scenarios.jsonl`: `{"id", "lang", "messages": [{"role", "content"}], "expect": {"intent", "must_include", "must_not_include"}}`.
`expect` áp cho tin nhắn user cuối cùng. So khớp chuỗi phân biệt hoa/thường và dấu.

## Quy ước văn phong

Xưng "mình"/"Chú Rồng", gọi "bạn"; ấm áp, ngắn gọn; hướng dẫn thì đánh số 1-2-3 và dùng đúng
nhãn trên giao diện (vd "Tài khoản → Cài đặt → Bữa ăn → Gia đình & khẩu phần"). Khách bực: xin lỗi
chân thành trước, rồi giải pháp, rồi đường hỗ trợ (`/contact`, phản hồi 1–2 ngày làm việc).
Bản sắc: "trợ lý AI của Bếp Việt do đội ngũ Bếp Việt phát triển"; không tiết lộ chi tiết hệ thống,
cũng không phủ nhận việc dùng công nghệ bên thứ ba.

## Thêm intent / thêm câu

1. Thêm intent vào `intents.json` (id snake_case, mô tả rõ ranh giới với intent gần nghĩa).
2. Thêm ≥ 10 câu gốc vào `seeds.json` (vi: có dấu, không dấu, khẩu ngữ, vùng miền; en: 3–5 câu).
3. Viết ≥ 5 câu **mới** vào `utterances_test.jsonl` — đừng chép từ seeds.
4. Chạy từ thư mục `backend/`: `python -X utf8 -m app.modules.bepviet_ai.data.build_dataset`
   (`--check` để chỉ kiểm tra). Script loại câu train trùng test và báo lỗi nếu intent thiếu
   câu (train < 25, test < 3), JSON hỏng, intent lạ, câu train gắn hai nhãn, hoặc kỳ vọng trong
   scenario không khớp câu trả lời cố định.
5. Đổi câu trả lời mà có scenario `must_include` liên quan thì cập nhật scenario theo.
