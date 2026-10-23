import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.middleware import GENERIC_ERROR, get_request_id

logger = logging.getLogger("bep_viet.errors")


class DomainError(Exception):
    code = "DOMAIN_ERROR"
    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(
        self,
        message: str,
        *,
        field_errors: dict[str, list[str]] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.field_errors = field_errors or {}


def error_payload(
    *,
    code: str,
    message: str,
    field_errors: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "field_errors": field_errors or {},
        "trace_id": get_request_id(),
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(
                code=exc.code,
                message=exc.message,
                field_errors=exc.field_errors,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        field_errors: dict[str, list[str]] = {}
        for error in exc.errors():
            field = ".".join(str(part) for part in error["loc"] if part != "body") or "request"
            field_errors.setdefault(field, []).append(str(error["msg"]))

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_payload(
                code="VALIDATION_ERROR",
                message="Dữ liệu chưa hợp lệ.",
                field_errors=field_errors,
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            code = "RESOURCE_NOT_FOUND"
            message = "Không tìm thấy tài nguyên được yêu cầu."
        elif exc.status_code >= 500:
            # Không trả chi tiết nội bộ của lỗi máy chủ ra ngoài.
            code = "INTERNAL_ERROR"
            message = GENERIC_ERROR
        else:
            code = "HTTP_ERROR"
            message = str(exc.detail)

        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(code=code, message=message),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        # Chi tiết (traceback) chỉ ghi vào log máy chủ kèm trace_id; người dùng chỉ thấy câu chung.
        logger.exception("Lỗi không mong muốn khi xử lý %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_payload(code="INTERNAL_ERROR", message=GENERIC_ERROR),
        )
