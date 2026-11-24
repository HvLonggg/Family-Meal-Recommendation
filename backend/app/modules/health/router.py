from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.db.session import get_db_session
from app.modules.health.schemas import HealthData, HealthResponse, StatusData, StatusResponse

router = APIRouter()


class DatabaseUnavailableError(DomainError):
    code = "DATABASE_UNAVAILABLE"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


# HEAD cho dịch vụ giám sát (UptimeRobot gói free chỉ gửi HEAD).
@router.api_route(
    "/livez",
    methods=["GET", "HEAD"],
    response_model=HealthResponse,
    summary="Check API liveness",
)
def liveness() -> HealthResponse:
    return HealthResponse(data=HealthData(status="ok", service="api"))


@router.get("/readyz", response_model=HealthResponse, summary="Check API readiness")
def readiness(session: Annotated[Session, Depends(get_db_session)]) -> HealthResponse:
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise DatabaseUnavailableError("Cơ sở dữ liệu tạm thời chưa sẵn sàng.") from exc

    return HealthResponse(data=HealthData(status="ready", service="api"))


@router.get("/status", response_model=StatusResponse, summary="Public service status")
def service_status(response: Response) -> StatusResponse:
    """Trạng thái cho giao diện: đang bảo trì hay không, lời nhắn và giờ dự kiến hoạt động lại."""
    settings = get_settings()
    response.headers["Cache-Control"] = "no-store"
    return StatusResponse(
        data=StatusData(
            maintenance=settings.maintenance_mode,
            message=settings.maintenance_message if settings.maintenance_mode else None,
            ends_at=settings.maintenance_ends_at if settings.maintenance_mode else None,
        )
    )
