"""Câu thoại của Chú Rồng (tiếng Việt và tiếng Anh) cho bộ máy trả lời nội bộ."""

# ruff: noqa: E501 - câu thoại để nguyên dòng cho dễ đọc và sửa.
from typing import Literal

Language = Literal["vi", "en"]

TEXT: dict[str, dict[Language, list[str]]] = {
    "greeting": {
        "vi": [
            "Chào bạn! Mình là **Chú Rồng**, đầu bếp của Bếp Việt 🐉👨‍🍳. Hôm nay bạn muốn nấu gì nào?",
            "Chú Rồng đây! Bạn đang tìm món cho bữa nào? Kể mình nghe nhé.",
        ],
        "en": [
            "Hi! I'm **Chef Dragon**, Bếp Việt's head chef 🐉👨‍🍳. What would you like to cook today?",
        ],
    },
    "thanks": {
        "vi": [
            "Không có gì đâu! Chúc bạn nấu ngon miệng nhé 🍲",
            "Chú Rồng luôn sẵn sàng! Cần gì cứ gọi mình.",
        ],
        "en": ["Anytime! Enjoy your meal 🍲"],
    },
    "suggest_intro": {
        "vi": [
            "Chú Rồng chọn giúp bạn{context}:",
            "Thử mấy món này xem sao{context}:",
            "Mình nghĩ bạn sẽ thích{context}:",
        ],
        "en": ["Here are a few ideas{context}:", "How about these{context}:"],
    },
    "suggest_loose": {
        "vi": [
            "Kho món chưa có món khớp hết mọi điều kiện, nhưng mấy món này khá gần ý bạn{context}:",
        ],
        "en": ["Nothing matched every condition, but these come close{context}:"],
    },
    "meal_intro": {
        "vi": ["Một mâm cơm cân bằng cho bạn{context}: món chính, canh và rau đây:"],
        "en": ["A balanced family meal{context} — main, soup and greens:"],
    },
    "none": {
        "vi": [
            "Hmm, mình chưa tìm thấy món phù hợp. Bạn thử bớt điều kiện hoặc kể mình nghe nguyên liệu đang có nhé?",
        ],
        "en": ["I couldn't find a match. Try fewer conditions, or tell me what's in your fridge?"],
    },
    "fallback": {
        "vi": [
            "Chú Rồng chưa hiểu lắm 😅. Bạn có thể hỏi kiểu: *“Tối nay ăn gì?”*, *“Món chay dưới 30 phút”* hay *“Tủ lạnh còn gà và cà chua”*.",
        ],
        "en": [
            "I didn't quite catch that 😅. Try *“What's for dinner?”*, *“Vegetarian under 30 minutes”* or *“I have chicken and tomatoes”*.",
        ],
    },
    "image_only": {
        "vi": [
            "Mình đã nhận ảnh rồi! Hiện Chú Rồng chưa tự nhìn được ảnh, bạn kể giúp mình trong ảnh có nguyên liệu gì để mình gợi ý món nhé.",
        ],
        "en": [
            "Got your photo! I can't see images yet — tell me which ingredients are in it and I'll suggest dishes.",
        ],
    },
    "help": {
        "vi": [
            "Mình có thể:\n- Gợi ý món theo bữa, vùng miền, thời gian hay độ khó\n- Nghĩ món từ nguyên liệu bạn đang có (gửi cả file danh sách cũng được)\n- Lên một mâm cơm đủ món chính, canh, rau\n- Chỉ cách nấu từng món và hướng dẫn dùng Kế hoạch, Đi chợ, Lịch âm\n\nBạn cũng có thể trò chuyện bằng giọng nói nữa đó!",
        ],
        "en": [
            "I can:\n- Suggest dishes by meal, region, time or difficulty\n- Find dishes from ingredients you have (you can attach a list too)\n- Build a full family meal: main, soup and greens\n- Explain any recipe and how to use the Planner, Shopping list and Lunar calendar\n\nYou can talk to me by voice too!",
        ],
    },
}
TOPIC_TEXT: dict[str, dict[Language, tuple[str, list[dict[str, str]]]]] = {
    "planner": {
        "vi": (
            "Ở **Kế hoạch nấu ăn**, bạn chọn ngày, thêm món vào bữa sáng/trưa/tối và đánh dấu đã nấu. Đầu lịch luôn hiện cả ngày dương và ngày âm.",
            [{"label": "Mở Kế hoạch", "to": "/planner"}],
        ),
        "en": (
            "In the **Planner**, pick a day, add dishes to breakfast/lunch/dinner and tick them off once cooked. The header always shows both solar and lunar dates.",
            [{"label": "Open Planner", "to": "/planner"}],
        ),
    },
    "lunar": {
        "vi": (
            "Bếp Việt có **lịch âm theo giờ Việt Nam**. Vào Cài đặt để chọn lịch chính là âm lịch và bật tự đánh dấu ăn chay mùng 1, rằm; ngày chay được tô vàng trên lịch.",
            [
                {"label": "Mở Cài đặt", "to": "/account/settings"},
                {"label": "Xem lịch", "to": "/planner"},
            ],
        ),
        "en": (
            "Bếp Việt has a **Vietnam-time lunar calendar**. In Settings you can make it your main calendar and auto-mark vegetarian days on the 1st and 15th; those days are highlighted in yellow.",
            [{"label": "Open Settings", "to": "/account/settings"}],
        ),
    },
    "shopping": {
        "vi": (
            "Danh sách **đi chợ** tự gộp nguyên liệu của các món trong kế hoạch theo ngày, tuần hoặc tháng; gia vị như mắm, muối, đường được xếp riêng một cột.",
            [{"label": "Mở danh sách đi chợ", "to": "/planner"}],
        ),
        "en": (
            "The **shopping list** merges ingredients from your planned dishes by day, week or month, with pantry seasonings in their own column.",
            [{"label": "Open shopping list", "to": "/planner"}],
        ),
    },
    "favorite": {
        "vi": (
            "Bấm **Lưu món** ở trang công thức để thêm vào Món yêu thích, xem lại bất cứ lúc nào.",
            [{"label": "Món yêu thích", "to": "/favorites"}],
        ),
        "en": (
            "Tap **Save** on any recipe to keep it in Favourites.",
            [{"label": "Favourites", "to": "/favorites"}],
        ),
    },
    "account": {
        "vi": (
            "Bạn có thể đăng nhập bằng email; nếu quên mật khẩu, dùng mục **Quên mật khẩu** để nhận mã qua email.",
            [{"label": "Đăng nhập", "to": "/login"}, {"label": "Tạo tài khoản", "to": "/register"}],
        ),
        "en": (
            "Sign in with your email; if you forget the password, use **Forgot password** to get a code by email.",
            [{"label": "Sign in", "to": "/login"}],
        ),
    },
    "contact": {
        "vi": (
            "Cần hỗ trợ từ đội ngũ Bếp Việt? Gửi yêu cầu ở trang Liên hệ, mình sẽ phản hồi qua email trong 1–2 ngày làm việc.",
            [{"label": "Liên hệ hỗ trợ", "to": "/contact"}],
        ),
        "en": (
            "Need the team? Send a request on the Contact page.",
            [{"label": "Contact support", "to": "/contact"}],
        ),
    },
    "submit": {
        "vi": (
            "Bạn có món ngon muốn chia sẻ? Gửi công thức ở trang **Đề xuất món mới**, đội ngũ sẽ duyệt và đưa vào kho món.",
            [{"label": "Đề xuất món", "to": "/submit-recipe"}],
        ),
        "en": (
            "Share your recipe on the **Submit a recipe** page.",
            [{"label": "Submit a recipe", "to": "/submit-recipe"}],
        ),
    },
}
SUGGESTIONS: dict[Language, list[str]] = {
    "vi": [
        "Tối nay ăn gì?",
        "Gợi ý mâm cơm 4 người",
        "Món chay dưới 30 phút",
        "Tủ lạnh còn trứng và cà chua",
        "Món canh dễ nấu",
        "Món miền Nam cho bữa trưa",
        "Món không cay cho trẻ em",
        "Bữa sáng nhanh gọn",
    ],
    "en": [
        "What's for dinner?",
        "Family meal for 4",
        "Vegetarian under 30 minutes",
        "I have eggs and tomatoes",
        "Easy soup",
        "Southern lunch ideas",
    ],
}
