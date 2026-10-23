"""Cổng chấm điểm: intent nào của mô hình riêng đủ tốt để thay Gemini.

Một intent qua cổng khi, trên tập test ĐỘC LẬP và chỉ tính các câu mô hình dám trả lời
(độ tin cậy ≥ ngưỡng, không OOD):
- precision ≥ `min_precision` (mặc định 0.95) với ít nhất `min_support` câu được trả lời;
- recall ≥ `min_recall` (không qua cổng nhờ né gần hết câu);
- nếu đã chấm Gemini trên cùng bộ tình huống (`llm_baseline.json`): tỷ lệ đạt của mô hình
  riêng ≥ Gemini cho intent đó.
Intent loại `handoff_llm` không bao giờ qua cổng.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.modules.bepviet_ai.dataset import HANDOFF
from app.modules.bepviet_ai.model import MODEL_DIR

GATE_FILE = "gate.json"
BASELINE_FILE = "llm_baseline.json"
SCENARIO_FILE = "scenario_scores.json"


@dataclass(frozen=True, slots=True)
class GateRules:
    min_confidence: float = 0.8
    min_precision: float = 0.95
    min_recall: float = 0.5
    min_support: int = 5


@dataclass(frozen=True, slots=True)
class Outcome:
    """Kết quả một câu test: nhãn đúng, nhãn dự đoán, độ tin cậy, có bị coi là OOD không."""

    gold: str
    predicted: str
    confidence: float
    ood: bool


def per_intent_at_threshold(
    outcomes: Sequence[Outcome], intents: Sequence[str], threshold: float
) -> dict[str, dict[str, float]]:
    stats: dict[str, dict[str, float]] = {}
    for intent in intents:
        answered = [
            item
            for item in outcomes
            if item.predicted == intent and not item.ood and item.confidence >= threshold
        ]
        correct = sum(item.gold == intent for item in answered)
        gold = sum(item.gold == intent for item in outcomes)
        stats[intent] = {
            "answered": len(answered),
            "correct": correct,
            "gold": gold,
            "precision": round(correct / len(answered), 4) if answered else 0.0,
            "recall": round(correct / gold, 4) if gold else 0.0,
        }
    return stats


def _rate(entry: Mapping[str, Any] | None) -> float | None:
    if not entry or not entry.get("total"):
        return None
    return float(entry["passed"]) / float(entry["total"])


def decide(
    outcomes: Sequence[Outcome],
    kinds: Mapping[str, str],
    rules: GateRules,
    *,
    llm_baseline: Mapping[str, Any] | None = None,
    inhouse_scenarios: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    stats = per_intent_at_threshold(outcomes, sorted(kinds), rules.min_confidence)
    intents: dict[str, Any] = {}
    for intent, row in stats.items():
        reasons: list[str] = []
        if kinds.get(intent) == HANDOFF:
            reasons.append("handoff_intent")
        if row["answered"] < rules.min_support:
            reasons.append(f"support<{rules.min_support}")
        if row["precision"] < rules.min_precision:
            reasons.append(f"precision<{rules.min_precision}")
        if row["recall"] < rules.min_recall:
            reasons.append(f"recall<{rules.min_recall}")
        llm = _rate((llm_baseline or {}).get(intent))
        own = _rate((inhouse_scenarios or {}).get(intent))
        if llm is not None and (own is None or own < llm):
            reasons.append("below_llm")
        intents[intent] = {
            **row,
            "kind": kinds.get(intent, ""),
            "llm_pass_rate": None if llm is None else round(llm, 4),
            "inhouse_pass_rate": None if own is None else round(own, 4),
            "passed": not reasons,
            "reasons": reasons,
        }
    return {
        "rules": {
            "min_confidence": rules.min_confidence,
            "min_precision": rules.min_precision,
            "min_recall": rules.min_recall,
            "min_support": rules.min_support,
        },
        "passed": sorted(name for name, row in intents.items() if row["passed"]),
        "intents": intents,
    }


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def write_json(path: Path, data: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


@dataclass(frozen=True, slots=True)
class Gate:
    passed: frozenset[str]
    min_confidence: float

    def allows(self, intent: str) -> bool:
        return intent in self.passed


class GateHolder:
    """Đọc gate.json một lần (lười, an toàn đa luồng); thiếu tệp → không intent nào qua."""

    def __init__(self, directory: Path = MODEL_DIR) -> None:
        self.directory = directory
        self._lock = threading.Lock()
        self._gate: Gate | None = None

    def get(self) -> Gate:
        if self._gate is not None:
            return self._gate
        with self._lock:
            if self._gate is None:
                data = read_json(self.directory / GATE_FILE) or {}
                rules = data.get("rules") or {}
                self._gate = Gate(
                    passed=frozenset(str(name) for name in data.get("passed") or []),
                    min_confidence=float(rules.get("min_confidence") or 1.0),
                )
            return self._gate

    def reset(self, directory: Path | None = None) -> None:
        with self._lock:
            if directory is not None:
                self.directory = directory
            self._gate = None


HOLDER = GateHolder()
