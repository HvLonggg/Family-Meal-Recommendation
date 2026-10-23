"""Chấm bộ tình huống (scenarios) qua bộ định tuyến, tùy chọn so với Gemini qua API chat thật.

    python -m app.modules.bepviet_ai.evaluate --scenarios
    python -m app.modules.bepviet_ai.evaluate --scenarios --compare-llm \\
        --base-url http://127.0.0.1:5173 --limit 30

- Mô hình riêng được chấm ở chế độ `inhouse_only` với ngưỡng của cổng: đo năng lực thật của
  nó (câu nào nó dám trả lời thì phải đúng intent + đúng nội dung), ghi `scenario_scores.json`.
- `--compare-llm` gọi POST {base}/api/v1/assistant/chat (mặc định KHÔNG chạy, giới hạn lượt),
  chấm cùng tiêu chí must_include/must_not_include, ghi `llm_baseline.json`. Chạy lại `train`
  để cổng dùng thêm điều kiện "mô hình riêng ≥ Gemini" theo từng intent.
"""

from __future__ import annotations

import argparse
import sys
import time
import unicodedata
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.modules.bepviet_ai import dataset as dataset_module
from app.modules.bepviet_ai import gate as gate_module
from app.modules.bepviet_ai import model as model_module
from app.modules.bepviet_ai import router
from app.modules.bepviet_ai.catalog import SNAPSHOT, SessionRecipeSource, snapshot_factory
from app.modules.bepviet_ai.dataset import HANDOFF, Scenario
from app.modules.bepviet_ai.gate import BASELINE_FILE, SCENARIO_FILE, write_json
from app.modules.bepviet_ai.model import MODEL_DIR

FIXTURE_RECIPES = dataset_module.FIXTURE_DIR / "recipes.json"


@dataclass(slots=True)
class Check:
    scenario: str
    intent: str
    passed: bool
    detail: str
    route: str = ""


def content_ok(content: str, scenario: Scenario) -> tuple[bool, str]:
    """Theo quy ước dữ liệu: chuỗi con, PHÂN BIỆT hoa/thường và dấu ("ngu" ≠ "ngũ"); cùng một
    tiêu chí cho mô hình riêng và Gemini."""
    text = unicodedata.normalize("NFC", content)
    missing = [
        item for item in scenario.must_include if unicodedata.normalize("NFC", item) not in text
    ]
    leaked = [
        item for item in scenario.must_not_include if unicodedata.normalize("NFC", item) in text
    ]
    if missing:
        return False, f"thiếu {missing}"
    if leaked:
        return False, f"có {leaked}"
    return True, "ok"


def _history(scenario: Scenario) -> list[tuple[str, str]]:
    return [(item["role"], item["content"]) for item in scenario.messages[:-1]]


def kinds_of(intents: dict[str, dataset_module.IntentSpec]) -> dict[str, str]:
    return {name: spec.kind for name, spec in intents.items()}


def score_inhouse(
    scenarios: Sequence[Scenario],
    context_factory: Any,
    kinds: dict[str, str],
    *,
    min_confidence: float,
) -> list[Check]:
    checks: list[Check] = []
    for scenario in scenarios:
        context = context_factory()
        context.history = _history(scenario)
        context.mode = "inhouse_only"
        context.min_confidence = min_confidence
        decision = router.decide(
            scenario.messages[-1]["content"], language=scenario.language, context=context
        )
        expect_llm = kinds.get(scenario.intent) == HANDOFF
        if decision.route == "llm":
            # Chuyển LLM đúng lúc (câu mở, món lạ…) vẫn là hành vi đúng của mô hình riêng.
            fine = expect_llm or decision.reason in ("unknown_dish", "missing_data")
            fine = fine and not scenario.must_include
            checks.append(
                Check(scenario.id, scenario.intent, fine, f"llm:{decision.reason}", "llm")
            )
            continue
        # Cùng nhóm định tuyến (vd recipe_ingredients/recipe_scale_servings) = cùng câu trả lời.
        if router.group_of(decision.intent) != router.group_of(scenario.intent):
            checks.append(
                Check(scenario.id, scenario.intent, False, f"intent={decision.intent}", "inhouse")
            )
            continue
        ok, detail = content_ok(decision.answer.content if decision.answer else "", scenario)
        checks.append(Check(scenario.id, scenario.intent, ok, detail, "inhouse"))
    return checks


def score_llm(
    scenarios: Sequence[Scenario],
    base_url: str,
    *,
    limit: int,
    pace: float = 4.5,
    timeout: float = 60.0,
) -> list[Check]:
    """Gọi API chat thật (Gemini phía sau) cho tối đa `limit` tình huống."""
    checks: list[Check] = []
    url = base_url.rstrip("/") + "/api/v1/assistant/chat"
    with httpx.Client(timeout=timeout) as client:
        for scenario in list(scenarios)[:limit]:
            history = [
                {"role": item["role"], "content": item["content"]}
                for item in scenario.messages[:-1]
                if item["role"] in ("user", "assistant")
            ]
            payload = {
                "message": scenario.messages[-1]["content"],
                "language": scenario.language if scenario.language in ("vi", "en") else "vi",
                "history": history,
            }
            try:
                response = client.post(url, json=payload)
                if response.status_code == 429:
                    # Hạn mức khách (~15 lượt/phút): chờ hết cửa sổ rồi thử lại đúng một lần.
                    time.sleep(61)
                    response = client.post(url, json=payload)
                response.raise_for_status()
                body = response.json()
                body = body.get("data", body) if isinstance(body, dict) else {}
                reply = body.get("reply") or {}
                content = str(reply.get("content") or "")
                mode = str(reply.get("mode") or "")
            except (httpx.HTTPError, ValueError) as exc:
                checks.append(Check(scenario.id, scenario.intent, False, type(exc).__name__))
                continue
            ok, detail = content_ok(content, scenario)
            checks.append(Check(scenario.id, scenario.intent, ok, detail, mode))
            time.sleep(pace)  # giữ dưới hạn mức miễn phí
    return checks


def by_intent(checks: Sequence[Check]) -> dict[str, dict[str, int]]:
    table: dict[str, dict[str, int]] = defaultdict(lambda: {"passed": 0, "total": 0})
    for check in checks:
        table[check.intent]["total"] += 1
        table[check.intent]["passed"] += int(check.passed)
    return dict(sorted(table.items()))


def _summary(label: str, checks: Sequence[Check]) -> None:
    passed = sum(check.passed for check in checks)
    print(f"{label}: {passed}/{len(checks)} tình huống đạt")
    for check in checks:
        if not check.passed:
            print(f"  ✗ [{check.scenario}] {check.intent} ({check.route}): {check.detail}")


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Đánh giá Bếp Việt AI trên bộ tình huống")
    parser.add_argument("--scenarios", action="store_true", help="Chấm bộ scenarios.jsonl")
    parser.add_argument("--data", type=Path, default=None)
    parser.add_argument("--model", type=Path, default=MODEL_DIR)
    parser.add_argument("--catalog", type=Path, default=None, help="recipe-catalog.json")
    parser.add_argument("--compare-llm", action="store_true", help="Gọi API chat thật để so")
    parser.add_argument("--base-url", default="http://127.0.0.1:5173")
    parser.add_argument("--limit", type=int, default=20, help="Số lượt tối đa gọi LLM")
    parser.add_argument("--pace", type=float, default=4.5, help="Giây nghỉ giữa hai lượt")
    args = parser.parse_args(argv)
    if not args.scenarios:
        parser.error("Chọn --scenarios.")
    data = dataset_module.load(args.data)
    if not data.scenarios:
        raise SystemExit(f"Không có scenarios.jsonl trong {data.directory}.")
    catalog = args.catalog or (SNAPSHOT if SNAPSHOT.is_file() else FIXTURE_RECIPES)
    factory = snapshot_factory(catalog)
    session = factory()
    model_module.HOLDER.reset(args.model)
    gate_module.HOLDER.reset(args.model)
    router.reset()
    rules = (gate_module.read_json(args.model / gate_module.GATE_FILE) or {}).get("rules") or {}
    threshold = float(rules.get("min_confidence") or 0.8)

    def context_factory() -> router.Context:
        return router.Context(source=SessionRecipeSource(session))

    kinds = kinds_of(data.intents)
    own = score_inhouse(data.scenarios, context_factory, kinds, min_confidence=threshold)
    _summary(f"Mô hình riêng (ngưỡng {threshold})", own)
    write_json(args.model / SCENARIO_FILE, by_intent(own))
    if args.compare_llm:
        llm = score_llm(data.scenarios, args.base_url, limit=args.limit, pace=args.pace)
        _summary(f"LLM qua {args.base_url}", llm)
        write_json(args.model / BASELINE_FILE, by_intent(llm))
        llm_ids = {check.scenario for check in llm}
        own_same = [check for check in own if check.scenario in llm_ids]
        print(
            f"Cùng {len(llm)} tình huống: riêng {sum(c.passed for c in own_same)} đạt · "
            f"LLM {sum(c.passed for c in llm)} đạt. Chạy lại train để cập nhật cổng."
        )
    session.close()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    main()
