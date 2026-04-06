import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(APIModel):
    id: uuid.UUID
    email: str
    role: str
    full_name: str


class RegisterRequest(APIModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2)
    role: Literal["CANDIDATE", "RECRUITER"]


class LoginRequest(APIModel):
    email: EmailStr
    password: str


class TokenResponse(APIModel):
    token: str
    user: UserOut


class ProfileUpdate(APIModel):
    city: str | None = None
    phone: str | None = None
    field_of_study: str | None = None
    university: str | None = None
    study_level: Literal["BAC", "LICENCE", "MASTER", "DOCTORAT"] | None = None


class ProfileOut(APIModel):
    id: uuid.UUID
    user_id: uuid.UUID
    city: str | None
    phone: str | None
    field_of_study: str | None
    university: str | None
    study_level: str | None
    updated_at: datetime | None


class UserMeOut(APIModel):
    id: uuid.UUID
    email: str
    role: str
    full_name: str
    profile: ProfileOut | None


class OfferCreate(APIModel):
    title: str = Field(min_length=2)
    company: str = Field(min_length=2)
    region: str
    field: str
    type: Literal["JOB", "INTERNSHIP"]
    description: str = Field(min_length=10)
    requirements: str = Field(min_length=10)


class OfferOut(APIModel):
    id: uuid.UUID
    recruiter_id: uuid.UUID
    title: str
    company: str
    region: str
    field: str
    type: str
    description: str
    requirements: str
    active: bool
    posted_at: datetime


class RecommendationRequest(APIModel):
    field: str
    region: str
    type: Literal["JOB", "INTERNSHIP"]


class RecommendationOut(APIModel):
    id: uuid.UUID
    ai_score: int
    ai_reasoning: str
    offer: OfferOut
