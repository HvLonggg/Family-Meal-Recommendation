import asyncio
import contextvars
import logging
import re
import time
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

_request_id_context: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default="system"
)
logger = logging.getLogger("bep_viet.request")

# Mã yêu cầu do client gửi chỉ nhận khi đúng dạng an toàn (chống chèn nội dung giả vào log).
_SAFE_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{8,64}")
# Lớn hơn tệp hợp lệ lớn nhất (tài liệu dạy Chú Rồng ~11 MB base64), chặn request khổng lồ.
MAX_BODY_BYTES = 16 * 1024 * 1024
GENERIC_ERROR = "Hệ thống đang bận hoặc gặp sự cố. Vui lòng thử lại sau."

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Permitted-Cross-Domain-Policies": "none",
}
# API chỉ trả JSON/ảnh: không cho chạy script hay nhúng khung. Trang tài liệu (/docs) cần CDN.
API_CSP = "default-src 'none'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"
DOC_PATHS = ("/docs", "/redoc", "/openapi.json")
MAINTENANCE_MESSAGE = "Bếp Việt đang bảo trì để nâng cấp hệ thống. Vui lòng quay lại sau ít phút."
# Vẫn trả lời khi bảo trì: để giao diện và giám sát biết khi nào hệ thống hoạt động lại.
MAINTENANCE_OPEN_SUFFIXES = ("/status", "/livez", "/readyz")
OVERLOADED_MESSAGE = (
    "Bếp Việt đang đông khách, hệ thống đang xử lý chậm. Vui lòng thử lại sau ít giây."
)
# 429 không kèm Retry-After (vd. HTTPException ở router) vẫn cho client biết lúc nào thử lại.
DEFAULT_RATE_LIMIT_RETRY_AFTER = "60"


def overloaded_response(retry_after: int, request_id: str | None = None) -> JSONResponse:
    """503 OVERLOADED: máy chủ đang quá tải, client nên chờ Retry-After giây rồi thử lại."""
    return JSONResponse(
        status_code=503,
        headers={"Retry-After": str(retry_after)},
        content={
            "code": "OVERLOADED",
            "message": OVERLOADED_MESSAGE,
            "field_errors": {},
            "trace_id": request_id or get_request_id(),
        },
    )


def _maintenance_response(request: Request, request_id: str) -> Response | None:
    from app.core.config import get_settings

    settings = get_settings()
    path = request.url.path
    if not settings.maintenance_mode or not path.startswith("/api/"):
        return None
    if path.endswith(MAINTENANCE_OPEN_SUFFIXES) or request.method == "OPTIONS":
        return None
    ends_at = settings.maintenance_ends_at
    headers = {"Retry-After": "120"}
    if ends_at is not None:
        remaining = int(ends_at.timestamp() - time.time())
        headers["Retry-After"] = str(max(60, min(remaining, 3600)))
    return JSONResponse(
        status_code=503,
        headers=headers,
        content={
            "code": "MAINTENANCE",
            "message": settings.maintenance_message or MAINTENANCE_MESSAGE,
            "field_errors": {},
            "trace_id": request_id,
        },
    )


def get_request_id() -> str:
    return _request_id_context.get()


def _request_id(request: Request) -> str:
    incoming = request.headers.get("X-Request-ID", "")
    return incoming if _SAFE_REQUEST_ID.fullmatch(incoming) else str(uuid4())


def _too_large(request: Request) -> bool:
    length = request.headers.get("Content-Length")
    # Body chunked không khai báo độ dài sẽ lách giới hạn: từ chối với API ghi dữ liệu.
    if (
        length is None
        and "chunked" in request.headers.get("Transfer-Encoding", "").lower()
        and request.method in {"POST", "PUT", "PATCH"}
        and request.url.path.startswith("/api/")
    ):
        return True
    try:
        return length is not None and int(length) > MAX_BODY_BYTES
    except ValueError:
        return True


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: object, *, hsts: bool = False) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self.hsts = hsts

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = _request_id(request)
        token = _request_id_context.set(request_id)
        started_at = time.perf_counter()

        try:
            maintenance = _maintenance_response(request, request_id)
            if maintenance is not None:
                response: Response = maintenance
            elif _too_large(request):
                response = JSONResponse(
                    status_code=413,
                    content={
                        "code": "PAYLOAD_TOO_LARGE",
                        "message": "Dữ liệu gửi lên quá lớn.",
                        "field_errors": {},
                        "trace_id": request_id,
                    },
                )
            else:
                try:
                    response = await call_next(request)
                except Exception:
                    # Traceback chỉ vào log máy chủ (kèm trace_id); người dùng thấy câu chung.
                    logger.exception("Lỗi không mong muốn: %s %s", request.method, request.url.path)
                    response = JSONResponse(
                        status_code=500,
                        content={
                            "code": "INTERNAL_ERROR",
                            "message": GENERIC_ERROR,
                            "field_errors": {},
                            "trace_id": request_id,
                        },
                    )
            has_identity = bool(
                request.headers.get("Authorization") or request.headers.get("Cookie")
            )
            is_auth_response = request.url.path.startswith("/api/v1/auth/")
            if request.url.path.startswith("/api/") and (has_identity or is_auth_response):
                if "ETag" in response.headers and not is_auth_response:
                    # Dữ liệu công khai có ETag (kho món): cho trình duyệt giữ bản riêng nhưng
                    # luôn hỏi lại máy chủ, để nhận 304 thay vì tải lại hàng MB mỗi lần.
                    response.headers["Cache-Control"] = "private, no-cache"
                else:
                    response.headers["Cache-Control"] = (
                        "no-store, no-cache, must-revalidate, private"
                    )
                    response.headers["Pragma"] = "no-cache"
                    response.headers["Expires"] = "0"
                vary = {item.strip() for item in response.headers.get("Vary", "").split(",")}
                vary.update({"Authorization", "Cookie"})
                response.headers["Vary"] = ", ".join(sorted(filter(None, vary)))
            if response.status_code == 429:
                response.headers.setdefault("Retry-After", DEFAULT_RATE_LIMIT_RETRY_AFTER)
            self._secure(request, response)
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

    def _secure(self, request: Request, response: Response) -> None:
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if not request.url.path.startswith(DOC_PATHS):
            response.headers.setdefault("Content-Security-Policy", API_CSP)
        if self.hsts:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"


class ConcurrencyLimitMiddleware:
    """Giới hạn số request API xử lý cùng lúc trong tiến trình (máy chủ 0,1 CPU/512 MB).

    Khi đầy, request mới chờ tối đa ``wait_seconds``; vẫn đầy thì trả ngay 503 OVERLOADED
    kèm Retry-After thay vì xếp hàng vô hạn (người dùng thấy "đang đông khách", không treo).
    Kiểm tra trạng thái (/status, /livez, /readyz) và preflight CORS luôn được phục vụ.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        limit: int,
        wait_seconds: float = 2.0,
        retry_after_seconds: int = 15,
    ) -> None:
        self.app = app
        self.limit = limit
        self.wait_seconds = wait_seconds
        self.retry_after_seconds = retry_after_seconds
        self._semaphore = asyncio.Semaphore(limit) if limit > 0 else None

    def _exempt(self, scope: Scope) -> bool:
        path: str = scope.get("path", "")
        return (
            not path.startswith("/api/")
            or path.endswith(MAINTENANCE_OPEN_SUFFIXES)
            or scope.get("method") == "OPTIONS"
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self._semaphore is None or scope["type"] != "http" or self._exempt(scope):
            await self.app(scope, receive, send)
            return
        semaphore = self._semaphore
        if not await self._acquire(semaphore):
            logger.warning("Quá tải: từ chối %s %s", scope.get("method"), scope.get("path"))
            await overloaded_response(self.retry_after_seconds)(scope, receive, send)
            return
        try:
            await self.app(scope, receive, send)
        finally:
            semaphore.release()

    async def _acquire(self, semaphore: asyncio.Semaphore) -> bool:
        if not semaphore.locked():
            await semaphore.acquire()
            return True
        if self.wait_seconds <= 0:
            return False
        try:
            await asyncio.wait_for(semaphore.acquire(), timeout=self.wait_seconds)
        except TimeoutError:
            return False
        return True
