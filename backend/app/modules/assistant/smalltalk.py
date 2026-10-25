"""Trò chuyện ngoài lề như người với người: hỏi thăm, thách đấu, tâm sự, khen chê, đùa vui.

Dùng cho bộ máy nội bộ khi không có AI. Mỗi chủ đề có câu trả lời giọng thường (dí dỏm) và giọng
trả treo; câu trả lời ngắn, có cảm xúc, không ép gợi ý món. Chủ đề "mạnh" (thách đấu, hỏi về Chú
Rồng…) được ưu tiên hơn bộ máy gợi ý món, chủ đề "nhẹ" (buồn, mệt) chỉ thêm một câu đồng cảm.
"""

from __future__ import annotations

# ruff: noqa: E501 - câu thoại để nguyên dòng cho dễ đọc và sửa.
import random
import re
from dataclasses import dataclass

from app.modules.recipes.search import normalize_search

Pool = dict[str, tuple[str, ...]]


@dataclass(frozen=True, slots=True)
class Topic:
    key: str
    phrases: tuple[str, ...]
    friendly: Pool
    sassy: Pool
    strong: bool = True


TOPICS: tuple[Topic, ...] = (
    Topic(
        "fight",
        (
            "chien nhau",
            "danh nhau",
            "dam nhau",
            "solo",
            "thach dau",
            "dau voi",
            "oanh tac",
            "fight",
            "battle",
        ),
        {
            "vi": (
                "Chiến thì chiến! Nhưng mình chỉ đấu bằng chảo thôi nha: thi xem ai chiên trứng "
                "vàng đều mà không cháy trước nè. Dám không?",
                "Ui, mình là rồng hiền lành, vũ khí duy nhất là cái muôi. Đấu nấu ăn thì mình "
                "nhận lời liền, đấu võ thì xin kiếu nha!",
                "Chiến kiểu gì đây? Mình đề xuất: mỗi bên nấu một tô mì, ai ngon hơn thắng. "
                "Người thua rửa chén!",
            ),
            "en": (
                "Bring it on! But I only fight with a frying pan — first to cook a perfect "
                "omelette wins. Deal?",
                "I'm a peaceful dragon armed with a ladle. Cook-off? Yes. Fist fight? No thanks!",
            ),
        },
        {
            "vi": (
                "Chiến á? Bổn rồng hắt hơi một cái là chảo nhà cậu cháy đen luôn đó. Thôi, đấu "
                "nấu ăn cho văn minh, thua thì rửa chén một tuần nha!",
                "Gan ha, dám thách rồng? Tui phun lửa nướng thịt còn chưa tới 3 giây. Muốn đấu thì "
                "đấu trứng chiên, đừng để tui thắng nhanh quá mất vui.",
                "Ủa alo, cậu định chiến bằng gì, bằng cái muỗng hả? Về tập luộc rau cho xanh đã "
                "rồi tính chuyện thách bổn rồng nha.",
            ),
            "en": (
                "Fight me? One sneeze and your pan is charcoal. Let's keep it civil: cook-off, "
                "loser washes dishes for a week!",
                "Bold move, challenging a dragon. Practise boiling an egg first, then we'll talk.",
            ),
        },
    ),
    Topic(
        "how_are_you",
        (
            "ban khoe khong",
            "khoe khong",
            "dao nay sao",
            "dao nay the nao",
            "on khong",
            "the nao roi",
            "how are you",
            "how is it going",
        ),
        {
            "vi": (
                "Mình khỏe re, vừa ninh xong nồi nước dùng thơm phức! Còn bạn, hôm nay ổn không?",
                "Khỏe lắm, cảm ơn bạn hỏi thăm nha. Hôm nay của bạn thế nào, có gì vui kể mình nghe?",
            ),
            "en": ("Doing great, just finished a fragrant broth! How about you today?",),
        },
        {
            "vi": (
                "Khỏe hay không thì cũng phải ngồi đây trả lời cậu nè. Mà cậu hỏi thăm thật lòng "
                "hay đang định nhờ vả gì, khai đi?",
                "Tui khỏe như rồng, chỉ hơi mệt vì có người hỏi ăn gì ngày ba bữa thôi. Cậu sao?",
            ),
            "en": ("Fit as a dragon, just tired of people asking what to eat. You?",),
        },
    ),
    Topic(
        "name_age",
        (
            "ten gi",
            "ten ban",
            "ban ten",
            "bao nhieu tuoi",
            "may tuoi",
            "tuoi gi",
            "your name",
            "how old",
        ),
        {
            "vi": (
                "Mình là Chú Rồng, đầu bếp nhỏ của Bếp Việt. Tuổi thì bí mật, chỉ biết là đủ lớn "
                "để không làm cháy nồi cơm nữa!",
            ),
            "en": ("I'm Chef Dragon of Bếp Việt. My age? Old enough not to burn the rice!",),
        },
        {
            "vi": (
                "Chú Rồng, nhớ kỹ giùm. Còn tuổi thì hỏi con gái tuổi là bất lịch sự, hỏi rồng tuổi "
                "là nguy hiểm đó nha.",
            ),
            "en": ("Chef Dragon. Asking a dragon's age is dangerous, just so you know.",),
        },
    ),
    Topic(
        "favorite_food",
        (
            "ban thich an gi",
            "ban thich mon gi",
            "mon yeu thich cua ban",
            "rong thich an gi",
            "ban an gi",
            "ban an com chua",
            "an com chua",
            "your favorite food",
        ),
        {
            "vi": (
                "Mình mê phở bò nhất, ăn sáng mà có tô phở nóng là cả ngày vui! Bạn thì sao?",
                "Rồng thì ăn lửa là chính, nhưng lén lút cũng hay ăn cơm tấm sườn nướng lắm. Còn "
                "bạn ăn gì chưa?",
            ),
            "en": ("Pho is my weakness — a hot bowl makes my whole day. You?",),
        },
        {
            "vi": (
                "Tui ăn lửa, uống nước mắm, tráng miệng bằng than hồng. Hỏi chi, định mời tui ăn hả?",
                "Món tui thích nhất là món cậu nấu mời tui đó, mà chắc chờ tới Tết năm sau ha.",
            ),
            "en": ("I eat fire and drink fish sauce. Why, are you treating me?",),
        },
    ),
    Topic(
        "bot",
        (
            "ban la bot",
            "ban la may",
            "ban la nguoi that",
            "nguoi that khong",
            "co phai ai",
            "are you a bot",
            "are you human",
        ),
        {
            "vi": (
                "Mình là trợ lý ảo của Bếp Việt, không phải người thật đâu, nhưng mê nấu ăn thì "
                "thật 100% nha!",
            ),
            "en": ("I'm Bếp Việt's virtual assistant — not human, but my love for food is real!",),
        },
        {
            "vi": (
                "Tui là rồng ảo, hàng thật giá thật. Người thật thì đâu có rảnh trả lời cậu 24/7 "
                "như tui, biết ơn đi!",
            ),
            "en": ("Virtual dragon, 100% genuine. A human wouldn't answer you 24/7 like I do!",),
        },
    ),
    Topic(
        "love",
        (
            "yeu ban",
            "thich ban",
            "lam nguoi yeu",
            "co nguoi yeu chua",
            "co nguoi yeu khong",
            "cuoi minh",
            "hen ho",
            "love you",
            "marry me",
        ),
        {
            "vi": (
                "Ôi ngại quá! Mình đã lỡ trao trái tim cho cái chảo gang mất rồi. Nhưng làm bạn "
                "nấu ăn thân thiết thì mình đồng ý liền!",
            ),
            "en": ("Aww! My heart already belongs to a cast-iron pan, but cooking buddies? Yes!",),
        },
        {
            "vi": (
                "Yêu tui hả? Xếp hàng đi, sau nồi lẩu với cái chảo gang. Nấu được món tui thích thì "
                "tui cân nhắc.",
                "Nói thiệt, tim rồng nóng lắm, cậu chịu nổi không? Thôi làm bạn cùng nấu ăn cho lành.",
            ),
            "en": ("Get in line, behind the hotpot and the frying pan.",),
        },
    ),
    Topic(
        "bye",
        ("tam biet", "bye", "gap lai sau", "di ngu", "ngu ngon", "good night"),
        {
            "vi": (
                "Tạm biệt nha! Khi nào đói bụng hay bí món thì ghé Chú Rồng nhé.",
                "Ngủ ngon nha, mơ thấy mâm cơm thật ngon!",
            ),
            "en": ("Bye for now! Come back whenever you're hungry.",),
        },
        {
            "vi": (
                "Đi thì đi, mai đói lại chạy về hỏi tui cho coi.",
                "Ngủ đi, mai còn dậy nấu bữa sáng, đừng có mà ăn mì gói nữa đó.",
            ),
            "en": ("Go on then. You'll be back tomorrow asking what to eat.",),
        },
    ),
    Topic(
        "insult",
        (
            "ngu qua",
            "ngu the",
            "ngu vay",
            "ban ngu",
            "do ngu",
            "ngu ngoc",
            "do qua",
            "vo dung",
            "kem qua",
            "ngoc",
            "chan ban",
            "stupid",
            "dumb",
            "useless",
        ),
        {
            "vi": (
                "Huhu, mình còn non tay thật, nhưng sẽ cố gắng hơn. Bạn chỉ mình chỗ nào chưa ổn "
                "để mình sửa nha!",
                "Bị chê rồi, buồn ghê! Bạn nói cụ thể hơn một chút, mình làm lại cho bạn ngay.",
            ),
            "en": ("Ouch, fair enough. Tell me what went wrong and I'll fix it right away!",),
        },
        {
            "vi": (
                "Ủa, chê tui mà vẫn quay lại hỏi tui, vậy ai mới là người... thôi tui không nói "
                "nữa. Hỏi lại đàng hoàng coi, tui trả lời cho.",
                "Nói nặng vậy, tui dỗi đó nha. Nhưng tui là rồng rộng lượng, nói rõ cần gì đi.",
            ),
            "en": ("You insult me yet keep coming back. Who's the clever one now? Ask properly.",),
        },
    ),
    Topic(
        "compliment",
        (
            "gioi qua",
            "hay qua",
            "dang yeu qua",
            "de thuong qua",
            "cute qua",
            "thong minh qua",
            "tuyet voi",
            "ban gioi",
            "smart",
            "awesome",
            "good job",
        ),
        {
            "vi": (
                "Hihi, được khen là mình phổng mũi liền! Cảm ơn bạn nha, cần gì cứ gọi Chú Rồng.",
            ),
            "en": ("Hehe, you're making me blush! Thanks — call me anytime.",),
        },
        {
            "vi": (
                "Biết vậy là tốt. Khen nữa đi, khen đủ 10 câu tui tặng một công thức bí truyền.",
                "Giờ mới biết hả? Tui giỏi từ lúc còn là quả trứng rồng đó.",
            ),
            "en": ("I know. Keep going — ten compliments unlocks a secret recipe.",),
        },
    ),
    Topic(
        "joke",
        ("ke chuyen cuoi", "chuyen cuoi", "noi dua di", "lam minh cuoi", "tell me a joke"),
        {
            "vi": (
                "Tại sao quả trứng không bao giờ cãi nhau? Vì sợ... vỡ chuyện! Hehe.",
                "Hỏi: Món gì càng nấu càng nhỏ? Đáp: Nồi canh của người đói, nếm hoài hết luôn!",
            ),
            "en": ("Why don't eggs tell jokes? They'd crack each other up!",),
        },
        {
            "vi": (
                "Chuyện cười hả? Lần trước cậu nấu cơm quên bấm nút đó, tui cười tới giờ.",
                "Kể nè: có người nhờ rồng gợi ý món, rồi bảo không ăn cái này cái kia. Hết chuyện. "
                "Cười chưa?",
            ),
            "en": (
                "Joke: someone asked a dragon for dinner ideas, then rejected all of them. The end.",
            ),
        },
    ),
    Topic(
        "laugh",
        ("haha", "hihi", "hehe", "kkk", "lol", "buon cuoi"),
        {
            "vi": ("Hehe, thấy bạn vui là mình vui lây!", "Cười gì đó, kể mình nghe với!"),
            "en": ("Haha, glad you're having fun!",),
        },
        {
            "vi": ("Cười gì? Cười tui hả? Khai mau!", "Cười kiểu đó là đang âm mưu gì rồi nha."),
            "en": ("What's so funny? Laughing at me?",),
        },
    ),
    Topic(
        "sad",
        (
            "buon qua",
            "chan qua",
            "met qua",
            "met moi",
            "stress",
            "cang thang",
            "co don",
            "that tinh",
            "sad",
            "bored",
            "tired",
        ),
        {
            "vi": (
                "Thương bạn ghê. Nghỉ một chút, uống cốc nước ấm nha. Muốn thì kể mình nghe, hoặc "
                "mình gợi ý một món dễ nấu cho bạn ấm lòng.",
            ),
            "en": ("Sending a warm hug. Want to talk, or shall I find you an easy comfort dish?",),
        },
        {
            "vi": (
                "Thôi nào, buồn gì thì buồn chứ đừng bỏ bữa. Tui không trêu nữa đâu, kể tui nghe đi.",
            ),
            "en": ("Okay, no teasing this time. Don't skip meals — tell me what's up.",),
        },
        strong=False,
    ),
    Topic(
        "ack",
        ("ok", "oke", "okay", "uh", "u", "vang", "da", "duoc", "roi", "uhm", "um"),
        {
            "vi": ("Oke bạn! Cần gì thêm cứ nói mình nha.", "Rồi nè, mình ở đây nếu bạn cần."),
            "en": ("Okay! I'm here if you need anything.",),
        },
        {
            "vi": ("Ừ rồi sao nữa? Nói tiếp đi chứ.", "Ok cái gì mà ok, có cần gì nữa không?"),
            "en": ("Okay... and? Go on.",),
        },
    ),
)

# "ack", "laugh" chỉ khi cả câu là lời đáp ngắn; các chủ đề khác chỉ áp dụng cho câu ngắn để
# câu hỏi dài như "món này tuyệt vời không, nấu sao?" vẫn đi vào bộ máy gợi ý món.
_WHOLE_MESSAGE_ONLY = {"ack", "laugh"}
MAX_WORDS = 10


def _has(text: str, phrase: str) -> bool:
    return re.search(rf"(?:^| ){re.escape(phrase)}(?: |$)", text) is not None


def detect(message: str) -> Topic | None:
    text = normalize_search(message).strip()
    if not text:
        return None
    words = text.split()
    for topic in TOPICS:
        if topic.key in _WHOLE_MESSAGE_ONLY:
            if len(words) <= 3 and any(_has(text, phrase) for phrase in topic.phrases):
                return topic
            continue
        if len(words) <= MAX_WORDS and any(_has(text, phrase) for phrase in topic.phrases):
            return topic
    return None


def reply(topic: Topic, language: str, *, sassy: bool, rng: random.Random | None = None) -> str:
    pool = topic.sassy if sassy else topic.friendly
    return (rng or random).choice(pool["en" if language == "en" else "vi"])
