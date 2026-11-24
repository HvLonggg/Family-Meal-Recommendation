"""Bộ đếm cửa sổ trượt trong bộ nhớ tiến trình (đủ cho một máy chủ nhỏ) để chống dò mật khẩu."""

from __future__ import annotations

import threading
import time
from collections import deque

# Mỗi email/IP lạ tạo một khóa; dọn khóa đã hết hạn khi vượt ngưỡng để kẻ tấn công không thể
# làm phình bộ nhớ tiến trình bằng hàng triệu email ngẫu nhiên.
MAX_KEYS = 50_000


class SlidingWindowLimiter:
    def __init__(self, *, limit: int, window_seconds: float, max_keys: int = MAX_KEYS) -> None:
        self.limit = limit
        self.window = window_seconds
        self.max_keys = max_keys
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _trim(self, key: str, now: float) -> deque[float] | None:
        hits = self._hits.get(key)
        if hits is None:
            return None
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if not hits:
            del self._hits[key]
            return None
        return hits

    def _prune(self, now: float) -> None:
        stale = [k for k, hits in self._hits.items() if not hits or now - hits[-1] > self.window]
        for key in stale:
            del self._hits[key]
        if len(self._hits) >= self.max_keys:
            # Vẫn đầy sau khi dọn: bỏ các khóa có lần ghi gần nhất cũ nhất.
            oldest = sorted(self._hits, key=lambda k: self._hits[k][-1])
            for key in oldest[: len(self._hits) - self.max_keys + 1]:
                del self._hits[key]

    def blocked(self, key: str, *, now: float | None = None) -> bool:
        with self._lock:
            hits = self._trim(key, now if now is not None else time.monotonic())
            return hits is not None and len(hits) >= self.limit

    def hit(self, key: str, *, now: float | None = None) -> None:
        with self._lock:
            now = now if now is not None else time.monotonic()
            hits = self._trim(key, now)
            if hits is None:
                if len(self._hits) >= self.max_keys:
                    self._prune(now)
                hits = self._hits[key] = deque()
            hits.append(now)

    def size(self) -> int:
        with self._lock:
            return len(self._hits)

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)
