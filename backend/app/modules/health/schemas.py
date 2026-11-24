from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class HealthData(BaseModel):
    status: Literal["ok", "ready"]
    service: Literal["api"]


class HealthResponse(BaseModel):
    data: HealthData


class StatusData(BaseModel):
    maintenance: bool
    message: str | None = None
    ends_at: datetime | None = None


class StatusResponse(BaseModel):
    data: StatusData
