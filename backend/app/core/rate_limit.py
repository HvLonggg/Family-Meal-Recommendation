"""Bộ đếm cửa sổ trượt trong bộ nhớ tiến trình (đủ cho một máy chủ nhỏ) để chống dò mật khẩu."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    def __init__(self, *, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _trim(self, key: str, now: float) -> deque[float]:
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        return hits

    def blocked(self, key: str, *, now: float | None = None) -> bool:
        with self._lock:
            return len(self._trim(key, now or time.monotonic())) >= self.limit

    def hit(self, key: str, *, now: float | None = None) -> None:
        with self._lock:
            now = now or time.monotonic()
            self._trim(key, now).append(now)

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)
