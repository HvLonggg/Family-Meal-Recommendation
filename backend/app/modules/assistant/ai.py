"""Trả lời bằng Claude hoặc Gemini khi có API key; mọi lỗi đều quay về bộ máy nội bộ.

Chỉ gửi nội dung trò chuyện, tệp đính kèm, ghi nhớ khẩu vị do chính người dùng lưu và tài liệu
liên quan lấy từ kho (RAG); không gửi tên, email hay thông tin tài khoản của người dùng.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import get_settings
from app.modules.assistant.engine import Language, RecipeEntry
from app.modules.assistant.profile import brand_context
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


GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_STREAM_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse"
)
# Quá tải/hết hạn mức/lỗi tạm thời phía Google: chuyển sang model dự phòng.
RETRY_STATUSES = {429, 500, 502, 503, 504}
# Chat thời gian thực: model chính phải bắt đầu trả lời trong ngần này giây, quá hạn thì chuyển
# ngay sang model dự phòng (Google hay xếp hàng model flash lúc cao điểm, có khi 20-30 giây).
FIRST_CHUNK_TIMEOUT = 5.0
# Model vừa chậm/quá tải được tạm bỏ qua để các câu sau không phải chờ lại; hết hạn mức (429)
# thường kéo dài hơn một lượt chậm nhất thời.
SLOW_MODEL_PAUSE = 60.0
BUSY_MODEL_PAUSE = 180.0
_paused_models: dict[str, float] = {}


def _secret(value: Any) -> str:
    # docker compose truyền chuỗi rỗng khi chưa cấu hình: coi như chưa bật AI.
    return value.get_secret_value().strip() if value is not None else ""


def _api_key() -> str:
    return _secret(get_settings().anthropic_api_key)


def active_provider() -> str | None:
    settings = get_settings()
    claude, gemini = bool(_api_key()), bool(_secret(settings.gemini_api_key))
    if settings.assistant_provider == "claude":
        return "claude" if claude else None
    if settings.assistant_provider == "gemini":
        return "gemini" if gemini else None
    return "claude" if claude else "gemini" if gemini else None


def ai_enabled() -> bool:
    return active_provider() is not None


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
    knowledge: str = "",
    memories: str = "",
    persona: str = "",
    moment: str = "",
) -> str | None:
    """Trả về câu trả lời của AI đang bật, hoặc None để dùng bộ máy nội bộ."""
    kwargs: dict[str, Any] = {
        "message": message,
        "history": history,
        "candidates": candidates,
        "attachments": attachments,
        "language": language,
        "knowledge": knowledge,
        "memories": memories,
        "persona": persona,
        "moment": moment,
    }
    provider = active_provider()
    if provider == "gemini":
        return _gemini_reply(**kwargs)
    if provider == "claude":
        return _claude_reply(**kwargs)
    return None


def _supports_thinking_config(model: str) -> bool:
    # Bản "lite" từ chối thinkingConfig (400); bản flash/pro mặc định "suy nghĩ" khá lâu.
    return "lite" not in model


def _gemini_body(
    *,
    model: str,
    message: str,
    history: list[tuple[str, str]],
    candidates: list[RecipeEntry],
    attachments: list[AttachmentPayload],
    language: Language,
    knowledge: str,
    memories: str,
    persona: str,
    moment: str,
) -> dict[str, Any]:
    contents: list[dict[str, Any]] = []
    for role, content in history[-12:]:
        if content.strip():
            contents.append(
                {"role": "model" if role == "assistant" else "user", "parts": [{"text": content}]}
            )
    while contents and contents[0]["role"] != "user":
        contents.pop(0)

    parts: list[dict[str, Any]] = []
    for item in attachments:
        if item.kind in ("image", "pdf"):
            media_type = "application/pdf" if item.kind == "pdf" else item.media_type
            parts.append({"inline_data": {"mime_type": media_type, "data": item.base64_data}})
        elif item.text:
            parts.append({"text": f'<tep ten="{item.name}">\n{item.text}\n</tep>'})
    for block in (memories, knowledge):
        if block:
            parts.append({"text": block})
    parts.append({"text": _catalog_block(candidates, language)})
    parts.append({"text": message or "(Người dùng chỉ gửi tệp đính kèm.)"})
    contents.append({"role": "user", "parts": parts})

    generation: dict[str, Any] = {
        "maxOutputTokens": 1024,
        # Trả treo cần sáng tạo hơn; nội dung vẫn bám tài liệu nhờ prompt.
        "temperature": 0.8 if "che_do_tra_treo" in persona else 0.5,
    }
    if _supports_thinking_config(model):
        # Trò chuyện cần phản hồi tức thì: tắt bước "suy nghĩ" (giảm hơn một nửa thời gian chờ).
        generation["thinkingConfig"] = {"thinkingBudget": 0}
    return {
        "systemInstruction": {
            "parts": [
                {"text": SYSTEM_PROMPT},
                {"text": brand_context(language)},
                *([{"text": moment}] if moment else []),
                *([{"text": persona}] if persona else []),
            ]
        },
        "contents": contents,
        "generationConfig": generation,
    }


def _gemini_models() -> list[str]:
    """Thứ tự thử model; model đang bị tạm bỏ qua xếp cuối (vẫn dùng nếu mọi model đều bận)."""
    settings = get_settings()
    models = list(dict.fromkeys([settings.gemini_model, *settings.gemini_fallback_models]))
    now = time.monotonic()
    ready = [model for model in models if _paused_models.get(model, 0.0) <= now]
    return ready + [model for model in models if model not in ready]


def _pause_model(model: str, seconds: float = BUSY_MODEL_PAUSE) -> None:
    _paused_models[model] = time.monotonic() + seconds


def reset_model_pauses() -> None:
    _paused_models.clear()


def _gemini_reply(**kwargs: Any) -> str | None:
    settings = get_settings()
    response: httpx.Response | None = None
    for model in _gemini_models():
        try:
            response = httpx.post(
                GEMINI_URL.format(model=model),
                headers={"x-goog-api-key": _secret(settings.gemini_api_key)},
                json=_gemini_body(model=model, **kwargs),
                timeout=settings.assistant_timeout_seconds,
            )
        except httpx.HTTPError:
            logger.warning("Không kết nối được Gemini (%s).", model)
            response = None
            continue
        if response.status_code in RETRY_STATUSES:
            # Model đang quá tải (503) hoặc hết hạn mức (429): thử model dự phòng.
            logger.warning("Gemini %s trả lỗi %s; thử model dự phòng.", model, response.status_code)
            _pause_model(model)
            continue
        break
    if response is None or response.status_code != 200:
        # 400/403: key hoặc model chưa đúng; mọi model đều bận thì dùng bộ máy nội bộ.
        status_code = response.status_code if response is not None else "network"
        logger.warning("Gemini không trả lời được (%s); dùng bộ máy nội bộ.", status_code)
        return None
    try:
        text, finish = _gemini_chunks(response.json())
    except (KeyError, IndexError, TypeError, ValueError, AttributeError):
        logger.warning("Phản hồi Gemini không đúng định dạng; dùng bộ máy nội bộ.")
        return None
    if finish not in (None, "STOP", "MAX_TOKENS"):
        return None
    return text.strip() or None


def _gemini_chunks(event: dict[str, Any]) -> tuple[str, str | None]:
    candidate = (event.get("candidates") or [{}])[0]
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts if not part.get("thought"))
    return text, candidate.get("finishReason")


def _pump_gemini(
    model: str,
    kwargs: dict[str, Any],
    out: queue.Queue[tuple[str, Any]],
    stop: threading.Event,
) -> None:
    """Đọc luồng SSE của một model ở luồng riêng, đẩy từng sự kiện vào hàng đợi."""
    settings = get_settings()
    try:
        with httpx.stream(
            "POST",
            GEMINI_STREAM_URL.format(model=model),
            headers={"x-goog-api-key": _secret(settings.gemini_api_key)},
            json=_gemini_body(model=model, **kwargs),
            timeout=httpx.Timeout(settings.assistant_timeout_seconds, connect=5.0),
        ) as response:
            if response.status_code in RETRY_STATUSES:
                out.put(("busy", response.status_code))
                return
            if response.status_code != 200:
                out.put(("fail", response.status_code))
                return
            for line in response.iter_lines():
                if stop.is_set():
                    return
                if not line.startswith("data:"):
                    continue
                try:
                    text, finish = _gemini_chunks(json.loads(line[5:]))
                except (ValueError, TypeError, AttributeError, IndexError):
                    continue
                if text:
                    out.put(("text", text))
                if finish not in (None, "STOP", "MAX_TOKENS"):
                    # Bị chặn giữa chừng (an toàn, bản quyền…): dừng, phần đã gửi vẫn giữ.
                    break
        out.put(("end", None))
    except httpx.TimeoutException:
        out.put(("timeout", None))
    except httpx.HTTPError:
        out.put(("error", None))


def _gemini_stream(**kwargs: Any) -> Iterator[str]:
    """Trả lời theo luồng với hạn chót tính theo đồng hồ thật cho chữ đầu tiên.

    Mỗi model chạy ở luồng riêng: quá FIRST_CHUNK_TIMEOUT giây chưa có chữ nào (Google đang
    xếp hàng, mạng chậm…) thì bỏ qua và hỏi ngay model kế tiếp; model chậm bị tạm gác lại.
    """
    settings = get_settings()
    models = _gemini_models()
    for position, model in enumerate(models):
        last = position == len(models) - 1
        first_wait = settings.assistant_timeout_seconds if last else FIRST_CHUNK_TIMEOUT
        out: queue.Queue[tuple[str, Any]] = queue.Queue()
        stop = threading.Event()
        threading.Thread(
            target=_pump_gemini, args=(model, kwargs, out, stop), daemon=True, name="gemini"
        ).start()
        deadline = time.monotonic() + first_wait
        emitted = False
        try:
            while True:
                wait = (
                    settings.assistant_timeout_seconds
                    if emitted
                    else max(0.0, deadline - time.monotonic())
                )
                try:
                    kind, value = out.get(timeout=wait)
                except queue.Empty:
                    if emitted:
                        logger.warning("Gemini %s ngừng giữa chừng; giữ phần đã trả lời.", model)
                        return
                    logger.warning(
                        "Gemini %s chậm quá %ss; chuyển model dự phòng.", model, first_wait
                    )
                    _pause_model(model, SLOW_MODEL_PAUSE)
                    break
                if kind == "text":
                    emitted = True
                    yield value
                elif kind == "end":
                    return
                elif kind == "busy":
                    logger.warning("Gemini %s trả lỗi %s; thử model dự phòng.", model, value)
                    _pause_model(model)
                    break
                elif kind == "fail":
                    logger.warning("Gemini không trả lời được (%s).", value)
                    return
                else:
                    if emitted:
                        logger.warning("Mất kết nối Gemini khi đang trả lời (%s).", model)
                        return
                    if kind == "timeout":
                        _pause_model(model, SLOW_MODEL_PAUSE)
                    logger.warning(
                        "Gemini %s không phản hồi (%s); thử model dự phòng.", model, kind
                    )
                    break
        finally:
            # Người dùng rời đi hoặc đã chuyển model: luồng đọc tự dừng ở dòng kế tiếp.
            stop.set()
    logger.warning("Gemini không trả lời được; dùng bộ máy nội bộ.")


def stream_reply(**kwargs: Any) -> Iterator[str]:
    """Trả lời từng đoạn ngay khi AI viết ra; không có đoạn nào thì nơi gọi dùng bộ máy nội bộ."""
    provider = active_provider()
    if provider == "gemini":
        yield from _gemini_stream(**kwargs)
    elif provider == "claude":
        text = _claude_reply(**kwargs)
        if text:
            yield text


def _claude_reply(
    *,
    message: str,
    history: list[tuple[str, str]],
    candidates: list[RecipeEntry],
    attachments: list[AttachmentPayload],
    language: Language,
    knowledge: str = "",
    memories: str = "",
    persona: str = "",
    moment: str = "",
    max_tokens: int = 4096,
    system_override: str | None = None,
) -> str | None:
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
    for block in (memories, knowledge):
        if block:
            blocks.append({"type": "text", "text": block})
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
        "max_tokens": max_tokens,
        "system": [{"type": "text", "text": system_override}]
        if system_override
        else [
            {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": brand_context(language)},
            *([{"type": "text", "text": moment}] if moment else []),
            *([{"type": "text", "text": persona}] if persona else []),
        ],
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


# Hỏi nhanh có cấu trúc (JSON) — dùng cho phụ bếp khi vào bếp: câu ngắn, cần trả lời tức thì.
JSON_TIMEOUT = 6.0
# Trần tổng cho mọi model: phụ bếp cần phản hồi ngay, quá hạn thì máy khách tự hiểu lệnh.
JSON_TOTAL_BUDGET = 9.0


def generate_json(
    *,
    system: str,
    prompt: str,
    schema: dict[str, Any],
    history: list[tuple[str, str]] | None = None,
    max_tokens: int = 400,
) -> dict[str, Any] | None:
    """Trả về object JSON theo `schema`, hoặc None khi AI tắt/lỗi để nơi gọi tự xử lý."""
    provider = active_provider()
    if provider == "gemini":
        return _gemini_json(
            system=system,
            prompt=prompt,
            schema=schema,
            history=history or [],
            max_tokens=max_tokens,
        )
    if provider == "claude":
        text = _claude_reply(
            message=f"{prompt}\n\nChỉ trả lời bằng một object JSON hợp lệ, không kèm chữ nào khác.",
            history=history or [],
            candidates=[],
            attachments=[],
            language="vi",
            max_tokens=max_tokens,
            system_override=system,
        )
        return _parse_json(text)
    return None


def _parse_json(text: str | None) -> dict[str, Any] | None:
    if not text:
        return None
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        value = json.loads(cleaned)
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def _gemini_json(
    *,
    system: str,
    prompt: str,
    schema: dict[str, Any],
    history: list[tuple[str, str]],
    max_tokens: int,
) -> dict[str, Any] | None:
    settings = get_settings()
    contents: list[dict[str, Any]] = [
        {"role": "model" if role == "assistant" else "user", "parts": [{"text": text}]}
        for role, text in history[-8:]
        if text.strip()
    ]
    while contents and contents[0]["role"] != "user":
        contents.pop(0)
    contents.append({"role": "user", "parts": [{"text": prompt}]})
    deadline = time.monotonic() + JSON_TOTAL_BUDGET
    for model in _gemini_models():
        remaining = deadline - time.monotonic()
        if remaining < 1.0:
            logger.warning("Phụ bếp hết thời gian chờ AI; máy khách tự xử lý.")
            return None
        generation: dict[str, Any] = {
            "maxOutputTokens": max_tokens,
            "temperature": 0.4,
            "responseMimeType": "application/json",
            "responseSchema": schema,
        }
        if _supports_thinking_config(model):
            generation["thinkingConfig"] = {"thinkingBudget": 0}
        try:
            response = httpx.post(
                GEMINI_URL.format(model=model),
                headers={"x-goog-api-key": _secret(settings.gemini_api_key)},
                json={
                    "systemInstruction": {"parts": [{"text": system}]},
                    "contents": contents,
                    "generationConfig": generation,
                },
                timeout=min(JSON_TIMEOUT, remaining),
            )
        except httpx.TimeoutException:
            logger.warning("Gemini %s chậm khi trả lời phụ bếp; thử model dự phòng.", model)
            _pause_model(model, SLOW_MODEL_PAUSE)
            continue
        except httpx.HTTPError:
            logger.warning("Không kết nối được Gemini (%s).", model)
            continue
        if response.status_code in RETRY_STATUSES:
            logger.warning("Gemini %s trả lỗi %s; thử model dự phòng.", model, response.status_code)
            _pause_model(model)
            continue
        if response.status_code != 200:
            logger.warning("Gemini không trả lời được (%s).", response.status_code)
            return None
        try:
            text, finish = _gemini_chunks(response.json())
        except (ValueError, TypeError, AttributeError, IndexError):
            return None
        if finish not in (None, "STOP", "MAX_TOKENS"):
            logger.warning("Gemini dừng câu trả lời phụ bếp (%s).", finish)
            return None
        parsed = _parse_json(text)
        if parsed is None:
            logger.warning("Gemini trả JSON không hợp lệ cho phụ bếp.")
        return parsed
    return None
