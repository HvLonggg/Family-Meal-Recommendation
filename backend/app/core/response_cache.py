"""Bộ đệm phản hồi JSON công khai trong tiến trình, kèm bản nén gzip và ETag.

Dùng cho dữ liệu lớn, đọc nhiều, ít đổi (kho món ~1 MB mỗi trang): dựng và nén một lần, các
request sau chỉ trả bytes có sẵn hoặc 304. Máy chủ 0,1 CPU không phải tuần tự hóa lại hàng MB.
"""

from __future__ import annotations

import gzip
import hashlib
import threading
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable
from dataclasses import dataclass

from starlette.requests import Request
from starlette.responses import Response


@dataclass(frozen=True)
class CachedBody:
    body: bytes
    gzip_body: bytes
    etag: str
    created_at: float


def _etag_matches(header: str, etag: str) -> bool:
    candidates = {item.strip().removeprefix("W/") for item in header.split(",")}
    return etag in candidates or "*" in candidates


class JsonResponseCache:
    def __init__(self, *, ttl_seconds: float = 300, max_entries: int = 32) -> None:
        self.ttl = ttl_seconds
        self.max_entries = max_entries
        self._entries: OrderedDict[Hashable, CachedBody] = OrderedDict()
        self._lock = threading.Lock()
        # Chỉ một luồng dựng dữ liệu mỗi lúc: hàng trăm request cùng lúc khi bộ đệm trống
        # không cùng tải cả kho món từ DB (thundering herd).
        self._build_lock = threading.Lock()

    def _fresh(self, key: Hashable, now: float) -> CachedBody | None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None or now - entry.created_at > self.ttl:
                return None
            self._entries.move_to_end(key)
            return entry

    def get_or_build(self, key: Hashable, build: Callable[[], bytes]) -> CachedBody:
        entry = self._fresh(key, time.monotonic())
        if entry is not None:
            return entry
        with self._build_lock:
            entry = self._fresh(key, time.monotonic())
            if entry is not None:
                return entry
            body = build()
            entry = CachedBody(
                body=body,
                gzip_body=gzip.compress(body, compresslevel=6),
                etag=f'"{hashlib.sha256(body).hexdigest()[:32]}"',
                created_at=time.monotonic(),
            )
            with self._lock:
                self._entries[key] = entry
                self._entries.move_to_end(key)
                while len(self._entries) > self.max_entries:
                    self._entries.popitem(last=False)
            return entry

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


def cached_json_response(request: Request, entry: CachedBody) -> Response:
    # no-cache: được lưu nhưng luôn hỏi lại máy chủ (ETag) để không dùng bản cũ sau khi sửa món.
    headers = {"ETag": entry.etag, "Vary": "Accept-Encoding", "Cache-Control": "no-cache"}
    if _etag_matches(request.headers.get("If-None-Match", ""), entry.etag):
        return Response(status_code=304, headers=headers)
    if "gzip" in request.headers.get("Accept-Encoding", "").lower():
        # Đã nén sẵn: GZipMiddleware thấy Content-Encoding nên không nén lại.
        headers["Content-Encoding"] = "gzip"
        return Response(entry.gzip_body, media_type="application/json", headers=headers)
    return Response(entry.body, media_type="application/json", headers=headers)
