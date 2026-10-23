import contextvars
import logging
import re
import time
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

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


def get_request_id() -> str:
    return _request_id_context.get()


def _request_id(request: Request) -> str:
    incoming = request.headers.get("X-Request-ID", "")
    return incoming if _SAFE_REQUEST_ID.fullmatch(incoming) else str(uuid4())


def _too_large(request: Request) -> bool:
    length = request.headers.get("Content-Length")
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
            if _too_large(request):
                response: Response = JSONResponse(
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
                response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
                response.headers["Pragma"] = "no-cache"
                response.headers["Expires"] = "0"
                vary = {item.strip() for item in response.headers.get("Vary", "").split(",")}
                vary.update({"Authorization", "Cookie"})
                response.headers["Vary"] = ", ".join(sorted(filter(None, vary)))
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
