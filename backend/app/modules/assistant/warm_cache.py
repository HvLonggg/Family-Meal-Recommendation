"""Bộ nhớ đệm "dùng bản cũ trong lúc dựng bản mới" cho dữ liệu nặng của Chú Rồng.

Khi kho món hoặc kho tri thức vừa đổi (đồng bộ embedding chạy nền, admin thêm món…), câu chat
không phải chờ dựng lại chỉ mục: nó dùng ngay bản đang có, bản mới được dựng ở luồng nền.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable, Hashable

from sqlalchemy.orm import Session

from app.core.config import get_settings

logger = logging.getLogger("bep_viet.assistant.cache")


class StaleWhileRevalidate[T]:
    def __init__(self, name: str) -> None:
        self.name = name
        self._lock = threading.Lock()
        self._build_lock = threading.Lock()
        self._value: tuple[Hashable, T] | None = None
        self._refreshing = False

    def reset(self) -> None:
        with self._lock:
            self._value = None
            self._refreshing = False

    def get(self, session: Session, key: Hashable, build: Callable[[Session], T]) -> T:
        with self._lock:
            current = self._value
            if current is not None and current[0] == key:
                return current[1]
            # Môi trường test dựng đồng bộ để kết quả xác định.
            stale_ok = current is not None and get_settings().app_env != "test"
            if stale_ok and self._refreshing:
                return current[1]  # type: ignore[index]
            if stale_ok:
                self._refreshing = True
        if stale_ok:
            assert current is not None
            bind = session.get_bind()
            threading.Thread(
                target=self._refresh, args=(bind, key, build), daemon=True, name=self.name
            ).start()
            return current[1]
        # Chưa có bản nào: chỉ một luồng dựng (vd. luồng làm nóng lúc khởi động), luồng khác chờ
        # kết quả đó thay vì dựng song song tranh CPU.
        with self._build_lock:
            with self._lock:
                current = self._value
                if current is not None and current[0] == key:
                    return current[1]
            value = build(session)
            with self._lock:
                self._value = (key, value)
            return value

    def _refresh(self, bind: object, key: Hashable, build: Callable[[Session], T]) -> None:
        try:
            with Session(bind=bind) as session:  # type: ignore[arg-type]
                value = build(session)
            with self._lock:
                self._value = (key, value)
        except Exception as exc:  # Bản cũ vẫn dùng được; lần sau sẽ thử dựng lại.
            logger.warning("Không dựng lại được %s (%s).", self.name, type(exc).__name__)
        finally:
            with self._lock:
                self._refreshing = False
