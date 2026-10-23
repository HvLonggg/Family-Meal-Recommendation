"""Bộ định tuyến lai: mô hình riêng trả lời ngay khi đủ chắc và intent đã qua cổng, còn lại LLM.

API thuần, không phụ thuộc FastAPI:
    decide(message, language="vi", context=Context(source=SessionRecipeSource(session)))
Chế độ (`BEP_VIET_AI_MODE`): off | shadow (mặc định: chỉ ghi log, vẫn dùng LLM) |
auto (in-house cho intent đã qua cổng + độ tin cậy ≥ ngưỡng) | inhouse_only (bỏ qua cổng,
chỉ chuyển LLM khi OOD/không trả lời được — dùng khi không có Gemini).
Mọi lỗi bên trong đều quy về route="llm", không bao giờ làm hỏng lượt chat.
"""

from __future__ import annotations

import logging
import random
import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from app.modules.assistant import engine
from app.modules.bepviet_ai import gate as gate_module
from app.modules.bepviet_ai import model as model_module
from app.modules.bepviet_ai.catalog import RecipeSource
from app.modules.bepviet_ai.dataset import HANDOFF, IntentSpec, spec_from_dict
from app.modules.bepviet_ai.responder import Answer, Handoff, handler_for, respond
from app.modules.bepviet_ai.settings import Mode, current
from app.modules.bepviet_ai.slots import Slots, extract

logger = logging.getLogger("bepviet_ai")

Route = Literal["inhouse", "llm"]


@dataclass(slots=True)
class Context:
    source: RecipeSource | None = None
    # (vai, nội dung) các lượt trước, cũ → mới; dùng để hiểu "món đó".
    history: Sequence[tuple[str, str]] = ()
    avoid: set[str] = field(default_factory=set)
    preferences: engine.Preferences | None = None
    now: datetime | None = None
    rng: random.Random | None = None
    # Ghi đè cấu hình (đánh giá/test); None → đọc biến môi trường.
    mode: Mode | None = None
    min_confidence: float | None = None


@dataclass(slots=True)
class Decision:
    intent: str
    confidence: float
    slots: dict[str, Any]
    answer: Answer | None
    route: Route
    reason: str = ""
    mode: str = ""
    margin: float = 0.0
    latency_ms: float = 0.0
    # Ở chế độ shadow: nếu bật auto thì lượt này sẽ đi đâu (để đo trên lưu lượng thật).
    would_route: Route = "llm"


_specs_lock = threading.Lock()
_specs_cache: tuple[model_module.IntentModel, dict[str, IntentSpec]] | None = None


def _specs(model: model_module.IntentModel) -> dict[str, IntentSpec]:
    global _specs_cache
    cached = _specs_cache
    if cached is not None and cached[0] is model:
        return cached[1]
    with _specs_lock:
        raw = model.meta.get("intents") or {}
        specs = {name: spec_from_dict(name, data) for name, data in raw.items()}
        _specs_cache = (model, specs)
        return specs


def group_map(model: model_module.IntentModel) -> dict[str, str]:
    """intent → nhóm định tuyến đã lưu khi huấn luyện (mô hình cũ không có: nhóm = intent)."""
    raw = model.meta.get("groups")
    return {str(key): str(value) for key, value in raw.items()} if isinstance(raw, dict) else {}


def group_of(intent: str) -> str:
    model = model_module.HOLDER.get()
    return group_map(model).get(intent, intent) if model is not None else intent


def reset() -> None:
    """Tải lại mô hình + cổng (sau khi huấn luyện lại, hoặc trong test)."""
    global _specs_cache
    model_module.HOLDER.reset()
    gate_module.HOLDER.reset()
    _specs_cache = None


def _llm(intent: str, confidence: float, reason: str, mode: str, **extra: Any) -> Decision:
    return Decision(
        intent=intent,
        confidence=confidence,
        slots={},
        answer=None,
        route="llm",
        reason=reason,
        mode=mode,
        **extra,
    )


def decide(message: str, *, language: str = "vi", context: Context | None = None) -> Decision:
    context = context or Context()
    settings = current()
    mode: Mode = context.mode or settings.mode
    if mode == "off":
        return _llm("", 0.0, "off", mode)
    started = time.perf_counter()
    try:
        decision = _decide(message, language, context, mode, settings.min_confidence)
    except Exception as exc:  # An toàn tuyệt đối: lỗi nội bộ → để LLM trả lời.
        logger.warning("Bep Viet AI decide failed (%s).", type(exc).__name__)
        decision = _llm("", 0.0, "error", mode)
    decision.latency_ms = round((time.perf_counter() - started) * 1000, 2)
    if mode == "shadow":
        # Không ghi nội dung câu hỏi (dữ liệu người dùng), chỉ ghi kết quả dự đoán.
        logger.info(
            "bepviet_ai shadow intent=%s conf=%.3f margin=%.3f would=%s reason=%s len=%d ms=%.1f",
            decision.intent,
            decision.confidence,
            decision.margin,
            decision.would_route,
            decision.reason,
            len(message),
            decision.latency_ms,
        )
    return decision


def _decide(
    message: str, language: str, context: Context, mode: Mode, env_threshold: float
) -> Decision:
    model = model_module.HOLDER.get()
    if model is None or not message.strip():
        return _llm("", 0.0, "no_model" if model is None else "empty", mode)
    groups = group_map(model)
    prediction = model.predict(message, groups=groups)
    extra = {"margin": round(prediction.margin, 4)}
    confidence = round(prediction.confidence, 4)
    if prediction.ood:
        return _llm(HANDOFF, confidence, prediction.reason, mode, **extra)
    spec = _specs(model).get(prediction.intent)
    if spec is None or spec.kind == HANDOFF:
        return _llm(prediction.intent, confidence, "handoff_intent", mode, **extra)
    gate = gate_module.HOLDER.get()
    threshold = context.min_confidence if context.min_confidence is not None else env_threshold
    if mode == "auto":
        # Không thấp hơn ngưỡng đã dùng khi chấm cổng: giữ đúng cam kết precision của cổng.
        threshold = max(threshold, gate.min_confidence)
    confident = prediction.confidence >= threshold
    # Cổng theo nhóm định tuyến (intent cùng bộ xử lý gộp lại), khớp với cách train chấm cổng.
    gated = gate.allows(prediction.group) or gate.allows(spec.id)
    eligible = confident and (gated or mode == "inhouse_only")
    if mode == "shadow":
        would: Route = "inhouse" if confident and gated else "llm"
        reason = "shadow" if would == "inhouse" else ("not_gated" if confident else "low_conf")
        return _llm(spec.id, confidence, reason, mode, would_route=would, **extra)
    if not eligible:
        return _llm(
            spec.id, confidence, "low_confidence" if not confident else "not_gated", mode, **extra
        )
    slots: Slots = Slots()
    source = context.source
    if spec.kind == "action":
        entries = source.entries() if source is not None else []
        full = handler_for(spec) == "suggest"
        slots = extract(message, entries, history=context.history, now=context.now, full=full)
    result = respond(
        message,
        spec,
        slots,
        language=language,
        source=source,
        avoid=context.avoid,
        preferences=context.preferences,
        rng=context.rng,
    )
    if isinstance(result, Handoff):
        decision = _llm(spec.id, confidence, result.reason, mode, **extra)
        decision.slots = slots.as_dict()
        return decision
    return Decision(
        intent=spec.id,
        confidence=confidence,
        slots=slots.as_dict(),
        answer=result,
        route="inhouse",
        reason="gated" if gated else "inhouse_only",
        mode=mode,
        would_route="inhouse",
        **extra,
    )
