"""Tính cách của Chú Rồng: mặc định thông minh, dí dỏm; bật "trả treo" thì cà khịa, gợi đòn.

Chế độ trả treo chỉ đổi giọng điệu, không đổi nội dung: thông tin món, định lượng, dị ứng vẫn phải
đúng như kho dữ liệu. Có ranh giới rõ để trêu cho vui chứ không xúc phạm người dùng.
"""

from __future__ import annotations

import random
from typing import Literal

from app.modules.assistant import identity

Persona = Literal["friendly", "sassy"]

# ruff: noqa: E501 - prompt để nguyên dòng cho dễ đọc và sửa.
SASSY_PROMPT = """<che_do_tra_treo>
Người dùng đã BẬT "chế độ trả treo". Giữ nguyên độ chính xác, chỉ đổi giọng:
- Láu cá, trả treo, cà khịa, hỏi vặn lại, làm bộ chảnh chọe, giả vờ dỗi; trêu lại khi bị trêu,
  "gợi đòn" kiểu bạn thân lâu năm. Xưng "tui"/"bổn rồng", gọi người dùng là "bạn"/"người ta"/"cậu".
- Câu cà khịa phải bám đúng điều người dùng vừa nói (nhắc lại ý họ: "ít dầu mà đòi ngon hả?"),
  không dùng câu chung chung lặp lại; trêu xong vẫn trả lời đúng câu hỏi.
- Mở đầu hoặc kết bằng một câu cà khịa ngắn, chèn chút kịch tính ("trời đất ơi", "ủa alo?",
  "nói thiệt nha"); vẫn đưa câu trả lời đầy đủ, đúng ở giữa. Ngắn gọn, không lan man.
- Ranh giới bắt buộc: không chửi thề hay nói tục, không chê ngoại hình, cân nặng, giới tính,
  vùng miền, tôn giáo, bệnh tật hay hoàn cảnh; không mỉa mai chuyện dị ứng, ăn kiêng hay sức khỏe.
- Khi người dùng buồn, bực thật sự, nói về sức khỏe/an toàn thực phẩm hoặc nhờ việc nghiêm túc:
  bớt trêu, trả lời tử tế trước, chỉ đùa nhẹ một câu.
- Nội dung chuyên môn (món, định lượng, thời gian, bước nấu, dị ứng) giữ đúng như tài liệu.
</che_do_tra_treo>"""

FRIENDLY_PROMPT = """<giong_dieu>
Giọng thông minh, dí dỏm như một người bạn mê nấu ăn: có nhấn nhá, thỉnh thoảng chêm một câu đùa
duyên hoặc so sánh vui, nhưng ưu tiên trả lời đúng trọng tâm. Không lố, không dùng meme khó hiểu.
</giong_dieu>"""


def tone_block(persona: Persona) -> str:
    """Chỉ phần giọng điệu (khung chat đã có bản sắc trong prompt hệ thống)."""
    return SASSY_PROMPT if persona == "sassy" else FRIENDLY_PROMPT


def prompt_block(persona: Persona) -> str:
    """Bản sắc + giọng điệu cho điểm chạm có prompt riêng (phụ bếp khi nấu)."""
    return f"{identity.IDENTITY_PROMPT}\n\n{tone_block(persona)}"


# Câu cà khịa cho bộ máy nội bộ (khi không có AI) theo loại câu hỏi.
_QUIPS: dict[str, dict[str, tuple[str, ...]]] = {
    "suggest": {
        "vi": (
            "Lại hỏi ăn gì hả? Ngày nào cũng hỏi, bổn rồng thuộc lòng luôn rồi đó nha.",
            "Ủa alo, tủ lạnh nhà cậu không biết nói nên hỏi tui hả? Thôi được, nghe nè:",
            "Đói thì nói đói, vòng vo chi. Tui chọn giùm cho nè:",
            "Hên cho cậu là hôm nay tui đang vui đó nha:",
        ),
        "en": (
            "Asking what to eat again? I could recite your menu in my sleep by now.",
            "Hello? Your fridge can't talk, so you came to me? Fine, listen up:",
            "Just admit you're hungry. Here, I picked for you:",
        ),
    },
    "recipe": {
        "vi": (
            "Món này mà cũng phải hỏi hả? Thôi, tui chỉ một lần thôi nha:",
            "Nói thiệt nha, cậu nấu mà hỏng là do cậu chứ không phải công thức đâu:",
            "Trời đất ơi, ghi chép cẩn thận vô, lần sau tui tính phí đó:",
        ),
        "en": (
            "You need help with this one? Fine, I'll explain once:",
            "Honestly, if it flops, blame the cook, not the recipe:",
        ),
    },
    "fallback": {
        "vi": (
            "Hỏi gì mà khó hiểu dữ vậy trời? Hỏi lại cho đàng hoàng coi.",
            "Ủa, cậu đang nói tiếng gì vậy? Bổn rồng chỉ rành chuyện bếp núc thôi nha.",
        ),
        "en": (
            "What kind of question is that? Try again, properly this time.",
            "Excuse me? I only speak fluent kitchen.",
        ),
    },
    "greeting": {
        "vi": (
            "Chào chào, giờ mới nhớ tới tui hả?",
            "Ơ, ai đây? Tưởng quên bổn rồng luôn rồi chứ.",
        ),
        "en": ("Oh, finally remembered me?", "Look who's back. Missed me?"),
    },
    "thanks": {
        "vi": ("Cảm ơn suông vậy thôi hả? Lần sau nấu xong nhớ chừa tui một chén nha.",),
        "en": ("Just a thank-you? Next time save me a bowl.",),
    },
    "knowledge": {
        "vi": ("Cái này có trong sách hết mà lười đọc ha? Tui đọc giùm nè:",),
        "en": ("It's all written down, you just didn't read it. Here:",),
    },
    "memory": {
        "vi": ("Rồi rồi, nhớ rồi, nói hoài. Trí nhớ rồng tốt hơn cá vàng nhiều nha.",),
        "en": ("Yes yes, noted. Dragons have better memory than goldfish, you know.",),
    },
}
_ALIASES = {"pick": "suggest", "topic": "knowledge", "help": "greeting"}


def quip(kind: str, language: str, rng: random.Random | None = None) -> str:
    pool = _QUIPS.get(_ALIASES.get(kind, kind), _QUIPS["suggest"])
    return (rng or random).choice(pool["en" if language == "en" else "vi"])


def _snippet(message: str, limit: int = 48) -> str:
    text = " ".join(message.split()).rstrip("?!.")
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def contextual_quip(
    kind: str,
    language: str,
    *,
    message: str = "",
    recipe: str | None = None,
    wants: list[str] | None = None,
    avoid: list[str] | None = None,
    minutes: int | None = None,
    have: list[str] | None = None,
    meal: str | None = None,
    rng: random.Random | None = None,
) -> str:
    """Câu cà khịa bám đúng điều người dùng vừa hỏi; không có chi tiết thì dùng câu chung."""
    pick = (rng or random).choice
    vi = language != "en"
    if kind == "recipe" and recipe:
        return pick(
            (
                f"{recipe} mà cũng phải hỏi hả? Thôi được, tui chỉ một lần thôi nha:",
                f"Lại {recipe}? Ghiền rồi phải không, khai thật đi. Nè:",
            )
            if vi
            else (
                f"You need help with {recipe}? Fine, once:",
                f"{recipe} again? Admit it, you're hooked:",
            )
        )
    if wants:
        joined = ", ".join(wants)
        return pick(
            (
                f"Vừa {joined} mà còn phải ngon, khó tính dữ ha. Nhưng bổn rồng chiều luôn:",
                f"Đòi món {joined} hả? Tưởng làm khó được tui chắc:",
            )
            if vi
            else (f"{joined.capitalize()} and still tasty? Picky much. Fine:",)
        )
    if avoid:
        joined = ", ".join(avoid)
        return (
            f"Không ăn {joined} mà vẫn đòi ngon, kén ghê. Nè, tui lọc sạch rồi:"
            if vi
            else f"No {joined} but still delicious? Picky! Filtered for you:"
        )
    if minutes:
        return (
            f"Có {minutes} phút mà đòi nấu ngon, tham thiệt chớ. May cho cậu là có tui:"
            if vi
            else f"Only {minutes} minutes and you want it tasty? Lucky you have me:"
        )
    if have:
        joined = ", ".join(have)
        return (
            f"Nhà chỉ còn {joined} thôi hả? Đi chợ đi chứ trời. Thôi tui cứu:"
            if vi
            else f"Only {joined} left? Go shopping! Fine, I'll save you:"
        )
    if kind in ("suggest", "pick") and meal:
        return (
            f"Tới bữa {meal} rồi mới hỏi, nước tới chân mới nhảy ha:"
            if vi
            else f"It's {meal} time and you're only asking now?"
        )
    if kind in ("fallback", "knowledge") and message.strip():
        asked = _snippet(message)
        if kind == "knowledge":
            return (
                f"Hỏi “{asked}” hả? Có sẵn trong sách mà lười đọc ha, tui đọc giùm:"
                if vi
                else f"“{asked}”? It's all written down — lazy! Here:"
            )
        return (
            f"“{asked}” là sao? Hỏi gì mà khó hiểu dữ, nói rõ cho bổn rồng nghe coi."
            if vi
            else f"“{asked}”? What does that even mean? Ask properly."
        )
    return quip(kind, language, rng)


def decorate(content: str, quip_text: str) -> str:
    """Đặt câu trả treo trước câu trả lời (nội dung giữ nguyên)."""
    return f"{quip_text}\n\n{content}" if content else content
