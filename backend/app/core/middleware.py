import contextvars
import logging
import time
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

_request_id_context: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default="system"
)
logger = logging.getLogger("bep_viet.request")


def get_request_id() -> str:
    return _request_id_context.get()


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid4())
        token = _request_id_context.set(request_id)
        started_at = time.perf_counter()

        try:
            response = await call_next(request)
            has_identity = bool(
                request.headers.get("Authorization") or request.headers.get("Cookie")
            )
            is_auth_response = request.url.path.startswith("/api/v1/auth/")
            if request.url.path.startswith("/api/") and (has_identity or is_auth_response):
                response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
                response.headers["Pragma"] = "no-cache"
                response.headers["Expires"] = "0"
                vary = {item.strip() for item in response.headers.get("Vary", "").split(",")}
                vary.update({"Authorization", "Cookie"})
                response.headers["Vary"] = ", ".join(sorted(filter(None, vary)))
            duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
            response.headers["X-Request-ID"] = request_id
            logger.info(
                "%s %s %s %.2fms",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )
            return response
        finally:
            _request_id_context.reset(token)
