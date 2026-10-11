from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FavoriteRecipeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    created_at: datetime
