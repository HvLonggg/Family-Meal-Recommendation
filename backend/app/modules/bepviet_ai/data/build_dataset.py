"""Sinh utterances.jsonl từ seeds.json bằng quy tắc (không dùng LLM) và kiểm tra chất lượng dữ liệu.

Cách dùng (từ thư mục backend/):
    python -m app.modules.bepviet_ai.data.build_dataset          # sinh + kiểm tra
    python -m app.modules.bepviet_ai.data.build_dataset --check  # chỉ kiểm tra

Quy tắc biến thể: giữ câu gốc; bản bỏ dấu; bản viết tắt kiểu chat (ko, dc, mik, j, ntn…);
bản thêm từ đệm/xưng hô ("Chú Rồng ơi", "nhé", "với"…); điền tên món thật từ catalog
(frontend/public/data/recipe-catalog.json — CHỈ ĐỌC). Mọi thứ tất định (seed cố định).
Câu nào trùng (sau chuẩn hóa) với tập kiểm tra sẽ bị loại khỏi tập huấn luyện.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent
CATALOG = DATA_DIR.parents[4] / "frontend" / "public" / "data" / "recipe-catalog.json"
SEEDS = DATA_DIR / "seeds.json"
INTENTS = DATA_DIR / "intents.json"
TRAIN = DATA_DIR / "utterances.jsonl"
TEST = DATA_DIR / "utterances_test.jsonl"
# Tập mù cuối cùng: viết riêng, KHÔNG dùng để chỉnh dữ liệu train — chỉ để chấm điểm.
TEST2 = DATA_DIR / "utterances_test2.jsonl"
SCENARIOS = DATA_DIR / "scenarios.jsonl"

RNG_SEED = 20261023
MIN_TRAIN, MAX_TRAIN = 25, 60
KINDS = {"faq", "action", "smalltalk", "handoff_llm", "safety"}

FALLBACK_DISHES = ["Phở bò", "Canh chua cá", "Thịt kho trứng", "Bún chả", "Cá kho tộ", "Gà luộc"]

# Viết tắt kiểu chat: từ đầy đủ → dạng người dùng hay gõ.
ABBREV = [
    ("không", "ko"),
    ("không", "k"),
    ("được", "dc"),
    ("được", "đc"),
    ("mình", "mik"),
    ("gì", "j"),
    ("như thế nào", "ntn"),
    ("vậy", "v"),
    ("rồi", "r"),
    ("bạn", "b"),
    ("biết", "bít"),
    ("muốn", "mún"),
    ("thế nào", "tn"),
    ("bao nhiêu", "bn"),
    ("tài khoản", "tk"),
    ("mật khẩu", "mk"),
    ("với", "vs"),
    ("nhé", "nha"),
    ("cho", "cko"),
]
PREFIXES = [
    "Chú Rồng ơi, ",
    "ad ơi ",
    "cho mình hỏi ",
    "bạn ơi ",
    "rồng ơi cho hỏi ",
    "ơi ",
    "hỏi xíu: ",
]
SUFFIXES = [" nhé", " với", " ạ", " nha", " vậy", " đi", " giúp mình", " ta", " hả", " được không"]
EN_PREFIXES = ["hey, ", "quick question: ", "Chef Dragon, ", "hi, "]
EN_SUFFIXES = [" please", "?", " thanks", " pls"]


def strip_accents(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def norm_key(text: str) -> str:
    """Khóa so trùng: thường, bỏ dấu, chỉ chữ/số."""
    return " ".join(re.findall(r"\w+", strip_accents(text.lower())))


def load_dishes() -> list[str]:
    try:
        rows = json.loads(CATALOG.read_text(encoding="utf-8"))["data"]
    except (OSError, ValueError, KeyError):
        return FALLBACK_DISHES
    names = []
    for row in rows:
        name = str(row.get("name") or "").strip()
        # Bỏ bản ghi thử nghiệm (vd "... QA") và tên quá dài.
        if name and not re.search(r"\b(QA|test)\b", name, re.I) and len(name) <= 40:
            names.append(name)
    return sorted(set(names)) or FALLBACK_DISHES


def abbreviate(text: str, rng: random.Random) -> str:
    out = text
    pairs = ABBREV[:]
    rng.shuffle(pairs)
    changed = 0
    for full, short in pairs:
        if re.search(rf"\b{re.escape(full)}\b", out, re.I) and changed < 3:
            out = re.sub(rf"\b{re.escape(full)}\b", short, out, count=1, flags=re.I)
            changed += 1
    return out


def with_filler(text: str, lang: str, rng: random.Random) -> str:
    if lang == "en":
        return (
            rng.choice(EN_PREFIXES) + text if rng.random() < 0.5 else text + rng.choice(EN_SUFFIXES)
        )
    if rng.random() < 0.5:
        return rng.choice(PREFIXES) + text
    return text + rng.choice(SUFFIXES)


def fill(template: str, dishes: list[str], rng: random.Random) -> str:
    text = template
    while "{dish}" in text:
        dish = rng.choice(dishes)
        text = text.replace("{dish}", dish if rng.random() < 0.7 else dish.lower(), 1)
    text = text.replace("{n}", str(rng.choice([2, 3, 4, 5, 6, 8, 10])))
    return text.replace("{m}", str(rng.choice([10, 15, 20, 30, 45])))


def variants(seed: str, lang: str, dishes: list[str], rng: random.Random) -> list[str]:
    """Câu gốc trước, rồi các biến thể theo quy tắc."""
    copies = 3 if "{dish}" in seed else 1
    base = [fill(seed, dishes, rng) for _ in range(copies)]
    out = list(base)
    for text in base:
        if lang == "vi":
            out.append(strip_accents(text).lower())
            out.append(abbreviate(text.lower(), rng))
            out.append(with_filler(text, lang, rng))
            out.append(strip_accents(abbreviate(with_filler(text, lang, rng), rng)).lower())
        else:
            out.append(with_filler(text, lang, rng))
            out.append(text.lower().rstrip("?!.") if text[0].isupper() else text.capitalize())
    return out


def read_jsonl(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    errors: list[str] = []
    if not path.is_file():
        return rows, [f"{path.name}: thiếu tệp"]
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            errors.append(f"{path.name}:{number} JSON lỗi ({exc.msg})")
    return rows, errors


def build() -> None:
    rng = random.Random(RNG_SEED)
    seeds = json.loads(SEEDS.read_text(encoding="utf-8"))
    dishes = load_dishes()
    test_keys: set[str] = set()
    for path in (TEST, TEST2):
        rows, _ = read_jsonl(path)
        test_keys |= {norm_key(row["text"]) for row in rows if row.get("text")}
    lines: list[str] = []
    for intent, by_lang in seeds.items():
        if intent.startswith("_"):
            continue
        # Xen kẽ: câu gốc của từng seed trước, rồi biến thể — cắt ở MAX_TRAIN vẫn đa dạng.
        pools = []
        for lang in ("vi", "en"):
            for seed in by_lang.get(lang, []):
                pools.append([(text, lang) for text in variants(seed, lang, dishes, rng)])
        chosen: list[tuple[str, str]] = []
        seen: set[str] = set()
        depth = 0
        while len(chosen) < MAX_TRAIN and any(depth < len(pool) for pool in pools):
            for pool in pools:
                if depth < len(pool) and len(chosen) < MAX_TRAIN:
                    text, lang = pool[depth]
                    text = re.sub(r"\s+", " ", text).strip()
                    key = norm_key(text)
                    if key and key not in seen and key not in test_keys:
                        seen.add(key)
                        chosen.append((text, lang))
            depth += 1
        for text, lang in chosen:
            lines.append(
                json.dumps({"text": text, "intent": intent, "lang": lang}, ensure_ascii=False)
            )
    TRAIN.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Đã ghi {len(lines)} câu vào {TRAIN.name} (catalog: {len(dishes)} tên món).")


def check() -> int:
    problems: list[str] = []
    intents_raw = json.loads(INTENTS.read_text(encoding="utf-8"))
    intents = {item["id"]: item for item in intents_raw["intents"]}
    if len(intents) != len(intents_raw["intents"]):
        problems.append("intents.json có id trùng")
    for intent_id, item in intents.items():
        if item.get("kind") not in KINDS:
            problems.append(f"{intent_id}: kind không hợp lệ")
        needs_answer = item.get("kind") in {"faq", "smalltalk", "safety", "action"}
        if needs_answer and not (item.get("answer_vi") and item.get("answer_en")):
            problems.append(f"{intent_id}: thiếu answer_vi/answer_en")
        if not item.get("description"):
            problems.append(f"{intent_id}: thiếu description")

    train, errors = read_jsonl(TRAIN)
    test, errors_test = read_jsonl(TEST)
    test2, errors_test2 = read_jsonl(TEST2)
    scenarios, errors_sc = read_jsonl(SCENARIOS)
    problems += errors + errors_test + errors_test2 + errors_sc

    for name, rows in (("train", train), ("test", test), ("test2", test2)):
        for row in rows:
            if not row.get("text") or row.get("lang") not in {"vi", "en"}:
                problems.append(f"{name}: dòng thiếu text/lang: {row}")
            if row.get("intent") not in intents:
                problems.append(f"{name}: intent lạ {row.get('intent')!r}")
    for index, row in enumerate(scenarios, 1):
        expect = row.get("expect") or {}
        if expect.get("intent") not in intents:
            problems.append(f"scenario {index}: intent lạ {expect.get('intent')!r}")
        if not row.get("messages"):
            problems.append(f"scenario {index}: thiếu messages")
        # Intent có câu trả lời cố định: kỳ vọng phải khớp với chính câu trả lời đã duyệt.
        spec = intents.get(expect.get("intent"), {})
        if spec.get("kind") in {"faq", "safety", "smalltalk"}:
            answer = spec.get("answer_en" if row.get("lang") == "en" else "answer_vi", "")
            label = row.get("id", index)
            for phrase in expect.get("must_include") or []:
                if phrase not in answer:
                    problems.append(f"scenario {label}: câu trả lời thiếu {phrase!r}")
            for phrase in expect.get("must_not_include") or []:
                if phrase in answer:
                    problems.append(f"scenario {label}: câu trả lời chứa {phrase!r}")

    train_count = Counter(row.get("intent") for row in train)
    test_count = Counter(row.get("intent") for row in test)
    test2_count = Counter(row.get("intent") for row in test2)
    for intent_id in intents:
        if train_count[intent_id] < MIN_TRAIN:
            problems.append(f"{intent_id}: train chỉ có {train_count[intent_id]} (< {MIN_TRAIN})")
        for name, counts in (("test", test_count), ("test2", test2_count)):
            if counts[intent_id] < 3:
                problems.append(f"{intent_id}: {name} chỉ có {counts[intent_id]} (< 3)")

    train_keys = defaultdict(set)
    for row in train:
        train_keys[norm_key(row["text"])].add(row["intent"])
    conflicts = [key for key, labels in train_keys.items() if len(labels) > 1]
    dup_train = len(train) - len(train_keys)
    if conflicts:
        problems.append(f"{len(conflicts)} câu train gắn >1 intent, vd: {conflicts[:3]}")
    overlaps: dict[str, int] = {}
    for name, rows in (("test", test), ("test2", test2)):
        hits = [row["text"] for row in rows if norm_key(row["text"]) in train_keys]
        overlaps[name] = len(hits)
        if hits:
            problems.append(f"{len(hits)} câu {name} trùng train (sau chuẩn hóa), vd: {hits[:3]}")
        keys = Counter(norm_key(row["text"]) for row in rows)
        dup = sum(count - 1 for count in keys.values())
        if dup:
            problems.append(f"{dup} câu {name} trùng nhau")
    test1_keys = {norm_key(row["text"]) for row in test}
    cross = [row["text"] for row in test2 if norm_key(row["text"]) in test1_keys]
    if cross:
        problems.append(f"{len(cross)} câu test2 trùng test, vd: {cross[:3]}")
    overlap = [None] * overlaps["test"]

    groups = {item["id"]: item.get("group", "?") for item in intents.values()}
    by_group: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    for intent_id in intents:
        by_group[groups[intent_id]][0] += 1
        by_group[groups[intent_id]][1] += train_count[intent_id]
        by_group[groups[intent_id]][2] += test_count[intent_id]
    print(f"Intent: {len(intents)} | kind: {dict(Counter(i['kind'] for i in intents.values()))}")
    sets = (
        ("Train", train, train_count),
        ("Test", test, test_count),
        ("Test2", test2, test2_count),
    )
    for name, rows, counts in sets:
        langs = Counter(row["lang"] for row in rows)
        low, high = min(counts[i] for i in intents), max(counts[i] for i in intents)
        summary = f"vi {langs['vi']}, en {langs['en']}"
        print(f"{name}: {len(rows)} câu ({summary}) | min/max: {low}/{high}")
    held_out = len(test) + len(test2)
    print(f"Tỷ lệ (test+test2)/tổng: {held_out / max(1, len(train) + held_out):.1%}")
    print(
        f"Scenarios: {len(scenarios)} | trùng train: {dup_train} | test∩train: {len(overlap)}"
        f" | test2∩train: {overlaps['test2']} | test2∩test: {len(cross)}"
    )
    print("Nhóm (số intent / train / test / test2):")
    for group, (count, n_train, n_test) in sorted(by_group.items()):
        n_test2 = sum(test2_count[i] for i in intents if groups[i] == group)
        print(f"  {group:<14} {count:>3} / {n_train:>5} / {n_test:>4} / {n_test2:>4}")
    if problems:
        print(f"\nLỖI ({len(problems)}):")
        for problem in problems[:40]:
            print("  -", problem)
        return 1
    print("\nOK: dữ liệu hợp lệ.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="chỉ kiểm tra, không sinh lại")
    args = parser.parse_args()
    if not args.check:
        build()
    return check()


if __name__ == "__main__":
    sys.exit(main())
