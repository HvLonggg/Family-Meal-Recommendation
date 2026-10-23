"""Đọc dữ liệu huấn luyện của Bếp Việt AI; thiếu tệp thì trả rỗng thay vì lỗi."""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, cast

logger = logging.getLogger(__name__)

PACKAGE_DIR = Path(__file__).resolve().parent
DATA_DIR = PACKAGE_DIR / "data"
FIXTURE_DIR = PACKAGE_DIR.parents[2] / "tests" / "fixtures" / "bepviet_ai"

Kind = Literal["faq", "action", "smalltalk", "handoff_llm", "safety"]
KINDS: tuple[str, ...] = ("faq", "action", "smalltalk", "handoff_llm", "safety")
HANDOFF = "handoff_llm"


@dataclass(frozen=True, slots=True)
class IntentSpec:
    id: str
    kind: Kind
    description: str = ""
    answer_vi: str = ""
    answer_en: str = ""
    followups: tuple[str, ...] = ()
    followups_en: tuple[str, ...] = ()
    # Tùy chọn: tên bộ xử lý action ("ingredients", "cook_time"…); bỏ trống thì đoán theo id.
    handler: str | None = None

    def answer(self, language: str) -> str:
        if language == "en":
            return self.answer_en or self.answer_vi
        return self.answer_vi or self.answer_en


@dataclass(frozen=True, slots=True)
class Utterance:
    text: str
    intent: str
    lang: str = "vi"


@dataclass(frozen=True, slots=True)
class Scenario:
    messages: tuple[dict[str, str], ...]
    intent: str
    must_include: tuple[str, ...] = ()
    must_not_include: tuple[str, ...] = ()
    language: str = "vi"
    id: str = ""


@dataclass(slots=True)
class Dataset:
    directory: Path
    intents: dict[str, IntentSpec] = field(default_factory=dict)
    train: list[Utterance] = field(default_factory=list)
    test: list[Utterance] = field(default_factory=list)
    # Tập "mù" thứ hai: chỉ để báo điểm cuối, không dùng cho bất kỳ quyết định nào.
    test2: list[Utterance] = field(default_factory=list)
    scenarios: list[Scenario] = field(default_factory=list)
    data_hash: str = ""

    @property
    def available(self) -> bool:
        return bool(self.intents and self.train)


def _strings(value: Any) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value,) if value.strip() else ()
    if isinstance(value, list):
        return tuple(str(item) for item in value if str(item).strip())
    return ()


def _read_structured(path: Path) -> Any:
    text = path.read_text(encoding="utf-8")
    if path.suffix in (".yaml", ".yml"):
        # PyYAML đi kèm uvicorn[standard]; vẫn cho phép dùng JSON nếu máy thiếu.
        import yaml  # type: ignore[import-untyped]

        return yaml.safe_load(text)
    return json.loads(text)


def _intent_file(directory: Path) -> Path | None:
    for name in ("intents.yaml", "intents.yml", "intents.json"):
        path = directory / name
        if path.is_file():
            return path
    return None


def load_intents(directory: Path) -> dict[str, IntentSpec]:
    path = _intent_file(directory)
    if path is None:
        return {}
    try:
        raw = _read_structured(path)
    except Exception as exc:  # Dữ liệu hỏng không được làm sập ứng dụng.
        logger.warning("Bep Viet AI: cannot read %s (%s).", path.name, type(exc).__name__)
        return {}
    items = raw.get("intents", raw) if isinstance(raw, dict) else raw
    if isinstance(items, dict):
        items = [{"id": key, **(value or {})} for key, value in items.items()]
    specs: dict[str, IntentSpec] = {}
    for item in items or []:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        kind = str(item.get("kind") or "faq")
        if kind not in KINDS:
            logger.warning("Bep Viet AI: intent %s has unknown kind %s.", item["id"], kind)
            kind = HANDOFF
        followups = item.get("followups")
        followups_en: tuple[str, ...] = _strings(item.get("followups_en"))
        if isinstance(followups, dict):
            followups_en = _strings(followups.get("en"))
            followups = followups.get("vi")
        specs[str(item["id"])] = IntentSpec(
            id=str(item["id"]),
            kind=cast(Kind, kind),
            description=str(item.get("description") or ""),
            answer_vi=str(item.get("answer_vi") or "").strip(),
            answer_en=str(item.get("answer_en") or "").strip(),
            followups=_strings(followups),
            followups_en=followups_en,
            handler=str(item["handler"]) if item.get("handler") else None,
        )
    return specs


def _jsonl(path: Path) -> Iterator[dict[str, Any]]:
    if not path.is_file():
        return
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("//"):
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            logger.warning("Bep Viet AI: skip bad JSON line %s:%d.", path.name, number)
            continue
        if isinstance(row, dict):
            yield row


def load_utterances(path: Path) -> list[Utterance]:
    rows: list[Utterance] = []
    for row in _jsonl(path):
        text, intent = str(row.get("text") or "").strip(), str(row.get("intent") or "").strip()
        if text and intent:
            rows.append(Utterance(text=text, intent=intent, lang=str(row.get("lang") or "vi")))
    return rows


def load_scenarios(path: Path) -> list[Scenario]:
    scenarios: list[Scenario] = []
    for index, row in enumerate(_jsonl(path)):
        expect = row.get("expect") or {}
        raw_messages = row.get("messages") or []
        messages: list[dict[str, str]] = []
        for item in raw_messages:
            if isinstance(item, str):
                messages.append({"role": "user", "content": item})
            elif isinstance(item, dict) and item.get("content"):
                messages.append(
                    {"role": str(item.get("role") or "user"), "content": str(item["content"])}
                )
        if not messages or not expect.get("intent"):
            continue
        scenarios.append(
            Scenario(
                messages=tuple(messages),
                intent=str(expect["intent"]),
                must_include=_strings(expect.get("must_include")),
                must_not_include=_strings(expect.get("must_not_include")),
                language=str(row.get("lang") or row.get("language") or "vi"),
                id=str(row.get("id") or index + 1),
            )
        )
    return scenarios


def _hash(directory: Path) -> str:
    digest = hashlib.sha256()
    names = ("intents.yaml", "intents.yml", "intents.json", "utterances.jsonl")
    for name in (*names, "utterances_test.jsonl", "utterances_test2.jsonl", "scenarios.jsonl"):
        path = directory / name
        if path.is_file():
            digest.update(name.encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()[:16]


def resolve_dir(directory: Path | None = None) -> Path:
    """Thư mục dữ liệu: tham số → data/ thật (nếu đã có) → bộ mẫu trong tests/fixtures."""
    if directory is not None:
        return directory
    if _intent_file(DATA_DIR) and (DATA_DIR / "utterances.jsonl").is_file():
        return DATA_DIR
    return FIXTURE_DIR


def load(directory: Path | None = None) -> Dataset:
    folder = resolve_dir(directory)
    dataset = Dataset(directory=folder)
    dataset.intents = load_intents(folder)
    dataset.train = load_utterances(folder / "utterances.jsonl")
    dataset.test = load_utterances(folder / "utterances_test.jsonl")
    dataset.test2 = load_utterances(folder / "utterances_test2.jsonl")
    dataset.scenarios = load_scenarios(folder / "scenarios.jsonl")
    dataset.data_hash = _hash(folder)
    rows = (*dataset.train, *dataset.test, *dataset.test2)
    unknown = {row.intent for row in rows} - set(dataset.intents)
    if unknown and dataset.intents:
        logger.warning("Bep Viet AI: utterances use undeclared intents %s.", sorted(unknown))
    return dataset


def load_intents_only(directory: Path | None = None) -> dict[str, IntentSpec]:
    """Dùng lúc chạy: chỉ cần câu trả lời đã duyệt, không đọc dữ liệu huấn luyện."""
    return load_intents(resolve_dir(directory))


def spec_to_dict(spec: IntentSpec) -> dict[str, Any]:
    """Nhúng câu trả lời đã duyệt vào tệp mô hình: lúc chạy không cần thư mục data/."""
    return {
        "kind": spec.kind,
        "answer_vi": spec.answer_vi,
        "answer_en": spec.answer_en,
        "followups": list(spec.followups),
        "followups_en": list(spec.followups_en),
        "handler": spec.handler,
    }


def spec_from_dict(intent: str, data: dict[str, Any]) -> IntentSpec:
    kind = str(data.get("kind") or HANDOFF)
    return IntentSpec(
        id=intent,
        kind=cast(Kind, kind if kind in KINDS else HANDOFF),
        answer_vi=str(data.get("answer_vi") or ""),
        answer_en=str(data.get("answer_en") or ""),
        followups=_strings(data.get("followups")),
        followups_en=_strings(data.get("followups_en")),
        handler=str(data["handler"]) if data.get("handler") else None,
    )
