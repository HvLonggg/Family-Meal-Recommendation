from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.db.session import get_db_session
from app.modules.health.schemas import HealthData, HealthResponse

router = APIRouter()


class DatabaseUnavailableError(DomainError):
    code = "DATABASE_UNAVAILABLE"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


@router.get("/livez", response_model=HealthResponse, summary="Check API liveness")
def liveness() -> HealthResponse:
    return HealthResponse(data=HealthData(status="ok", service="api"))


@router.get("/readyz", response_model=HealthResponse, summary="Check API readiness")
def readiness(session: Annotated[Session, Depends(get_db_session)]) -> HealthResponse:
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise DatabaseUnavailableError("Cơ sở dữ liệu tạm thời chưa sẵn sàng.") from exc

    return HealthResponse(data=HealthData(status="ready", service="api"))
