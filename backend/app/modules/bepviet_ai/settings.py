"""Cấu hình Bếp Việt AI, đọc từ `core.config.Settings` (BEP_VIET_AI_MODE, _MIN_CONFIDENCE,
_MIN_PRECISION). Test ghi đè bằng biến môi trường + `get_settings.cache_clear()`, hoặc truyền
`Context(mode=..., min_confidence=...)` cho từng lần gọi.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

from app.core.config import get_settings

logger = logging.getLogger(__name__)

Mode = Literal["off", "shadow", "auto", "inhouse_only"]
MODES: tuple[str, ...] = ("off", "shadow", "auto", "inhouse_only")
DEFAULT_MODE: Mode = "shadow"
DEFAULT_MIN_CONFIDENCE = 0.8
DEFAULT_MIN_PRECISION = 0.95


@dataclass(frozen=True, slots=True)
class AiSettings:
    mode: Mode = DEFAULT_MODE
    min_confidence: float = DEFAULT_MIN_CONFIDENCE
    min_precision: float = DEFAULT_MIN_PRECISION


def current() -> AiSettings:
    """Settings đã cache nên rẻ; cấu hình hỏng không được làm hỏng lượt chat → mặc định an toàn."""
    try:
        settings = get_settings()
    except Exception as exc:
        logger.warning("Bep Viet AI: invalid settings (%s); using shadow.", type(exc).__name__)
        return AiSettings()
    return AiSettings(
        mode=settings.ai_mode,
        min_confidence=settings.ai_min_confidence,
        min_precision=settings.ai_min_precision,
    )
