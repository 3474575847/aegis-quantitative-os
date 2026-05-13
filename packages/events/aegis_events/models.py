from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class Event(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    event_type: str
    occurred_at: datetime
    data: dict[str, Any]
    metadata: dict[str, Any] = Field(default_factory=dict)
