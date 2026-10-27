import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr


class CompanyInterestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class CompanyInterestSubmitted(BaseModel):
    detail: str


class CompanyInterestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    status: Literal["pending", "invited", "dismissed"]
    created_at: datetime
    reviewed_at: datetime | None = None


class CompanyInterestPage(BaseModel):
    requests: list[CompanyInterestOut]


class CompanyInterestUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["dismissed"]
