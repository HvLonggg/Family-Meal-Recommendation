"""Trả lời bằng Claude khi có BEP_VIET_ANTHROPIC_API_KEY; mọi lỗi đều quay về bộ máy nội bộ."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.core.config import get_settings
from app.modules.assistant.engine import Language, RecipeEntry
from app.modules.assistant.prompt import SYSTEM_PROMPT

logger = logging.getLogger("bep_viet.assistant")

# Các model có bộ phân loại an toàn, nên bật fallback phía máy chủ khi bị từ chối.
FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}


@dataclass(slots=True)
class AttachmentPayload:
    kind: str
    media_type: str
    base64_data: str
    text: str = ""
    name: str = ""


def _api_key() -> str:
    secret = get_settings().anthropic_api_key
    # docker compose truyền chuỗi rỗng khi chưa cấu hình: coi như chưa bật AI.
    return secret.get_secret_value().strip() if secret is not None else ""


def ai_enabled() -> bool:
    return bool(_api_key())


def _catalog_block(candidates: list[RecipeEntry], language: Language) -> str:
    if not candidates:
        return "<kho_mon>(không có món phù hợp)</kho_mon>"
    lines = [
        f"- {entry.name} | {entry.category} | {entry.region} | {entry.minutes} phút"
        f" | {entry.difficulty} | {entry.excerpt[:140]}"
        for entry in candidates
    ]
    note = "Người dùng đang dùng giao diện tiếng Anh." if language == "en" else ""
    return "<kho_mon>\n" + "\n".join(lines) + "\n</kho_mon>" + (f"\n{note}" if note else "")


def generate_reply(
    *,
    message: str,
    history: list[tuple[str, str]],
    candidates: list[RecipeEntry],
    attachments: list[AttachmentPayload],
    language: Language,
) -> str | None:
    """Trả về câu trả lời của Claude, hoặc None để dùng bộ máy nội bộ."""
    settings = get_settings()
    api_key = _api_key()
    if not api_key:
        return None
    try:
        import anthropic
    except ImportError:  # pragma: no cover - thiếu gói khi chưa build lại container
        logger.warning("Chưa cài gói anthropic; dùng bộ máy nội bộ.")
        return None

    messages: list[dict[str, Any]] = []
    for role, content in history[-12:]:
        if content.strip():
            messages.append({"role": role, "content": content})
    # API yêu cầu tin đầu tiên là của người dùng.
    while messages and messages[0]["role"] != "user":
        messages.pop(0)

    blocks: list[dict[str, Any]] = []
    for item in attachments:
        if item.kind == "image":
            blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": item.media_type,
                        "data": item.base64_data,
                    },
                }
            )
        elif item.kind == "pdf":
            blocks.append(
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": item.base64_data,
                    },
                }
            )
        elif item.text:
            blocks.append(
                {
                    "type": "text",
                    "text": f'<tep ten="{item.name}">\n{item.text}\n</tep>',
                }
            )
    blocks.append({"type": "text", "text": _catalog_block(candidates, language)})
    blocks.append({"type": "text", "text": message or "(Người dùng chỉ gửi tệp đính kèm.)"})
    messages.append({"role": "user", "content": blocks})

    client = anthropic.Anthropic(
        api_key=api_key,
        timeout=settings.assistant_timeout_seconds,
        max_retries=1,
    )
    request: dict[str, Any] = {
        "model": settings.assistant_model,
        "max_tokens": 4096,
        "system": [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        "messages": messages,
        # Trò chuyện ngắn: mức effort thấp cho phản hồi nhanh và tiết kiệm.
        "output_config": {"effort": "low"},
    }
    try:
        if settings.assistant_model in FALLBACK_MODELS:
            response = client.beta.messages.create(
                betas=["server-side-fallback-2026-07-01"], fallbacks="default", **request
            )
        else:
            response = client.messages.create(**request)
    except anthropic.AuthenticationError:
        logger.error("API key Claude không hợp lệ; dùng bộ máy nội bộ.")
        return None
    except anthropic.RateLimitError:
        logger.warning("Claude đang giới hạn tần suất; dùng bộ máy nội bộ.")
        return None
    except anthropic.APIStatusError as exc:
        logger.warning("Claude trả lỗi %s; dùng bộ máy nội bộ.", exc.status_code)
        return None
    except anthropic.APIConnectionError:
        logger.warning("Không kết nối được Claude; dùng bộ máy nội bộ.")
        return None

    if response.stop_reason == "refusal":
        return None
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    return text or None
