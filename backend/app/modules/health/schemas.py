from typing import Literal

from pydantic import BaseModel


class HealthData(BaseModel):
    status: Literal["ok", "ready"]
    service: Literal["api"]


class HealthResponse(BaseModel):
    data: HealthData
