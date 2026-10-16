import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

SupportStatus = Literal["open", "in_progress", "resolved"]
SupportCategory = Literal["technical", "account", "application", "other"]


class SupportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: uuid.UUID
    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=160)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=5000)]
    category: SupportCategory = "technical"
    page_path: Annotated[str, StringConstraints(max_length=500, pattern=r"^/[^?#]*$")] | None = None

    @field_validator("page_path")
    @classmethod
    def local_path_only(cls, value: str | None) -> str | None:
        if value and (value.startswith("//") or "\\" in value or any(ord(c) < 32 for c in value)):
            raise ValueError("Use a local page path without query parameters")
        return value


class SupportUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: SupportStatus
    response: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None


class SupportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject: str
    description: str
    category: SupportCategory
    page_path: str | None
    status: SupportStatus
    response: str | None
    created_at: datetime
    updated_at: datetime


class AdminSupportOut(SupportOut):
    reporter_name: str
    reporter_email: str
    reporter_role: str
    company_name: str | None


class SupportPage(BaseModel):
    tickets: list[SupportOut]
    total: int


class AdminSupportPage(BaseModel):
    tickets: list[AdminSupportOut]
    total: int
