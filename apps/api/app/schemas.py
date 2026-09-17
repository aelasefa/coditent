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
    is_approved: bool
    full_name: str
    avatar_url: str | None = None
    company_id: uuid.UUID | None = None
    company_role: str | None = None


class RegisterRequest(APIModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2)
    role: Literal["CANDIDATE"]  # public registration only for candidates; company users via invitation


class VerifyEmailRequest(APIModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=12)


class ResendVerificationRequest(APIModel):
    email: EmailStr


class LoginRequest(APIModel):
    email: EmailStr
    password: str


class OAuthCompleteRegistrationRequest(APIModel):
    role: Literal["candidate", "recruiter"]


class AdminLoginRequest(APIModel):
    email: EmailStr
    password: str


class TokenResponse(APIModel):
    token: str
    user: UserOut


class OAuthCompleteRegistrationResponse(APIModel):
    handoff_code: str
    attempt_id: str
    provider: str


class OAuthHandoffExchangeRequest(APIModel):
    code: str = Field(min_length=20, max_length=200)


class OAuthHandoffExchangeResponse(TokenResponse):
    is_new_registration: bool
    user: UserOut


class ProfileUpdate(APIModel):
    city: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=30)
    headline: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=1500)
    field_of_study: str | None = Field(default=None, max_length=120)
    university: str | None = Field(default=None, max_length=160)
    study_level: Literal["BAC", "LICENCE", "MASTER", "DOCTORAT"] | None = None
    skills: str | None = Field(default=None, max_length=500)
    years_of_experience: int | None = Field(default=None, ge=0, le=40)
    linkedin_url: str | None = Field(default=None, max_length=255)
    portfolio_url: str | None = Field(default=None, max_length=255)


class ProfileOut(APIModel):
    id: uuid.UUID
    user_id: uuid.UUID
    city: str | None
    phone: str | None
    headline: str | None
    bio: str | None
    field_of_study: str | None
    university: str | None
    study_level: str | None
    skills: str | None
    years_of_experience: int | None
    linkedin_url: str | None
    portfolio_url: str | None
    cv_url: str | None = None
    updated_at: datetime | None


class OnboardingStepUpdate(APIModel):
    step: int = Field(ge=1, le=6)
    value: str | list[str]


class OnboardingStateOut(APIModel):
    search_timeline: str | None = None
    desired_opportunity_type: str | None = None
    desired_fields: list[str] = Field(default_factory=list)
    desired_location: str | None = None
    preferred_work_mode: str | None = None
    career_stage: str | None = None
    onboarding_step: int
    onboarding_completed: bool
    onboarding_completed_at: datetime | None = None


class AvatarUpdate(APIModel):
    avatar_url: str = Field(max_length=5_000_000)


class UserMeOut(APIModel):
    id: uuid.UUID
    email: str
    role: str
    is_approved: bool
    full_name: str
    avatar_url: str | None = None
    company_id: uuid.UUID | None = None
    company_role: str | None = None
    profile: ProfileOut | None


class RecruiterApprovalOut(APIModel):
    id: uuid.UUID
    email: str
    role: str
    is_approved: bool
    full_name: str
    created_at: datetime


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
    # Company scope + responsible recruiter (optional: backward compatible).
    company_id: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    responsible_hr_id: uuid.UUID | None = None


class ResponsibleHrUpdate(APIModel):
    responsible_hr_id: uuid.UUID


class RecommendationRequest(APIModel):
    field: str
    region: str
    type: Literal["JOB", "INTERNSHIP"]


class RecommendationOut(APIModel):
    id: uuid.UUID
    ai_score: int
    ai_reasoning: str
    offer: OfferOut


class AdminStatsOut(APIModel):
    total_users: int
    total_candidates: int
    total_recruiters: int
    total_offers: int
    total_companies: int = 0
    active_companies: int = 0
    pending_company_invitations: int = 0
    expired_company_invitations: int = 0
    active_offers: int = 0


class CompanyCreate(APIModel):
    name: str = Field(min_length=2, max_length=120)
    region: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    logo_url: str | None = None
    industry: str | None = None
    location: str | None = None
    website: str | None = None
    company_size: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None


class CompanyOut(APIModel):
    id: uuid.UUID
    name: str
    region: str | None
    description: str | None
    logo_url: str | None = None
    industry: str | None = None
    location: str | None = None
    website: str | None = None
    company_size: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    status: str
    owner_id: uuid.UUID | None = None
    created_at: datetime
    recruiter_count: int = 0


class CandidateRequestCreate(APIModel):
    company_id: uuid.UUID
    recruiter_id: uuid.UUID | None = None
    message: str | None = Field(default=None, max_length=1000)


class CandidateRequestOut(APIModel):
    id: uuid.UUID
    candidate_id: uuid.UUID
    company_id: uuid.UUID
    recruiter_id: uuid.UUID | None
    message: str | None
    status: str
    created_at: datetime
    candidate: UserOut | None = None
    company: CompanyOut | None = None
    recruiter: UserOut | None = None


class ChatMessageCreate(APIModel):
    receiver_id: uuid.UUID
    content: str = Field(min_length=1, max_length=2000)


class ChatMessageOut(APIModel):
    id: uuid.UUID
    sender_id: uuid.UUID
    receiver_id: uuid.UUID
    content: str
    created_at: datetime
    sender: UserOut | None = None
    application_id: uuid.UUID | None = None


class RecruitmentMessageCreate(APIModel):
    content: str = Field(min_length=1, max_length=2000)


class RecruitmentPeer(APIModel):
    id: uuid.UUID
    full_name: str
    avatar_url: str | None = None
    role: str | None = None
    company_role: str | None = None


class RecruitmentChatContext(APIModel):
    application_id: uuid.UUID
    status: str
    chat_enabled: bool
    offer_id: uuid.UUID
    offer_title: str
    company_id: uuid.UUID | None = None
    company_name: str | None = None
    peer: RecruitmentPeer | None = None
    messages: list[ChatMessageOut] = []


class AdminActivityOut(APIModel):
    id: uuid.UUID
    action: str
    admin_id: uuid.UUID
    admin_email: str
    target_user_id: uuid.UUID | None
    target_user_email: str | None
    details: str | None
    created_at: datetime


class CVExtractedOut(APIModel):
    skills: list[str] = []
    years_of_experience: int | None = None
    field_of_study: str | None = None
    university: str | None = None
    study_level: str | None = None
    city: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    portfolio_url: str | None = None


class CVParseOut(APIModel):
    extracted: CVExtractedOut
    warnings: list[str] = []
    has_cv: bool = True
    meta: dict[str, int] = Field(default_factory=dict)


class CVMetaOut(APIModel):
    cv_url: str
    filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
