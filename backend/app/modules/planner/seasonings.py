"""Phân loại nguyên liệu trong danh sách đi chợ: gia vị nêm nếm hay nguyên liệu tươi.

Nhóm "Gia vị" trong công thức gồm cả hành, tỏi, gừng, sả, rau thơm… Đó là đồ tươi phải mua
ngoài chợ, nên chỉ những thứ nêm nếm để sẵn trong bếp (mắm, muối, đường, mì chính, dầu ăn,
nước tương, tiêu, giấm, bột gia vị…) mới được xếp vào cột gia vị.
"""

import re
import unicodedata

# Cụm từ (đã bỏ dấu) xác định gia vị nêm nếm; so khớp theo nguyên từ.
SEASONING_PHRASES = (
    "muoi",
    "nuoc mam",
    "mam tom",
    "mam ruoc",
    "mam nem",
    "mam tep",
    "mam ca",
    "mam ca linh",
    "duong",
    "mi chinh",
    "bot ngot",
    "hat nem",
    "bot nem",
    "bot canh",
    "dau an",
    "dau hao",
    "dau me",
    "dau dieu",
    "dau lac",
    "dau oliu",
    "dau olive",
    "dau thuc vat",
    "dau hat cai",
    "nuoc tuong",
    "xi dau",
    "tuong",
    "giam",
    "tieu",
    "nuoc mau",
    "mat ong",
    "mat mia",
    "sa te",
    "me loc",
    "me rang",
    "ngu vi huong",
    "hoa hoi",
    "que",
    "thao qua",
    "dinh huong",
    "hat mui",
    "bot nghe",
    "bot ca ri",
    "bot cari",
    "bot ot",
    "bot toi",
    "bot tieu",
    "bot bo kho",
    "bot no",
    "bot xa xiu",
    "sot",
    "xot",
    "mayonnaise",
    "tuong ca",
    "tuong ot",
    "ruou",
    "tinh dau",
    "mu tat",
)
# Tên trùng chữ với gia vị nhưng thực ra là đồ tươi (húng quế, đậu phộng…).
INGREDIENT_PHRASES = (
    "hung que",
    "la que",
    "dau que",
    "dau phong",
    "dau dua",
    "hu tieu",
    "nuoc dung",
    "chao trang",
)

_SEASONING = re.compile(rf"(?:^| )(?:{'|'.join(map(re.escape, SEASONING_PHRASES))})(?: |$)")
_INGREDIENT = re.compile(rf"(?:^| )(?:{'|'.join(map(re.escape, INGREDIENT_PHRASES))})(?: |$)")


def normalize_name(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.casefold().replace("đ", "d"))
    return re.sub(
        r"[^a-z0-9]+", " ", "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    ).strip()


def is_pantry_seasoning(name: str) -> bool:
    normalized = normalize_name(name)
    if not normalized or _INGREDIENT.search(normalized):
        return False
    return normalized == "chao" or _SEASONING.search(normalized) is not None
