import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from app.services.passwords import NewPassword
from app.utils.sanitizer import sanitize_input_text


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _naive_utc(value: datetime | None) -> datetime | None:
    """Normalize API datetimes for the database's UTC-naive columns."""
    if value is not None and value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value



class UserOut(APIModel):
    id: uuid.UUID
    email: str
    role: str
    is_approved: bool
    is_active: bool = True
    full_name: str
    avatar_url: str | None = None
    company_id: uuid.UUID | None = None
    company_role: str | None = None


class RegisterRequest(APIModel):
    email: EmailStr
    password: NewPassword
    full_name: str = Field(min_length=2, max_length=100)
    # Compatibility-only: the server always assigns CANDIDATE. Company users
    # are created exclusively through company or employee invitations.
    role: Literal["CANDIDATE"] | None = None

class RegistrationStarted(APIModel):
    detail: str
    email: EmailStr
    registration_id: uuid.UUID
    expires_in_seconds: int
    delivery_status: Literal["pending", "processing", "retry", "sent", "failed"]


class VerifyEmailRequest(APIModel):
    email: EmailStr
    registration_id: uuid.UUID
    otp: str = Field(min_length=4, max_length=12)


class ResendVerificationRequest(APIModel):
    email: EmailStr
    registration_id: uuid.UUID


class LoginRequest(APIModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    trusted_device_token: str | None = Field(default=None, max_length=2048)


class PasswordRecoveryRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class PasswordRecoveryConfirm(APIModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=32, max_length=512)
    new_password: NewPassword


class AdminLoginRequest(APIModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)



class TokenResponse(APIModel):
    token: str
    user: UserOut
    trusted_device_token: str | None = None


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

    @field_validator("headline", "bio", "city", "field_of_study", "university", "skills", mode="before")
    @classmethod
    def sanitize_text(cls, v: str | None) -> str | None:
        return sanitize_input_text(v)


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


class AccountNameUpdate(APIModel):
    full_name: str = Field(min_length=2, max_length=100)


class SensitiveAccountRequest(APIModel):
    current_password: str = Field(min_length=1, max_length=128)
    two_factor_code: str | None = Field(default=None, min_length=6, max_length=20)


class EmailChangeRequest(SensitiveAccountRequest):
    new_email: EmailStr


class EmailChangeConfirm(APIModel):
    otp: str = Field(min_length=6, max_length=6)


class PasswordChangeRequest(SensitiveAccountRequest):
    new_password: NewPassword


class AccountDataExportRequest(SensitiveAccountRequest):
    model_config = ConfigDict(extra="forbid")


class AccountDeletionCreate(SensitiveAccountRequest):
    model_config = ConfigDict(extra="forbid")
    confirmation: Literal["DELETE"]


class AccountDeletionOut(APIModel):
    id: uuid.UUID
    status: Literal["scheduled", "processing", "retry", "completed", "canceled"]
    execute_after: datetime
    requested_at: datetime
    canceled_at: datetime | None = None
    completed_at: datetime | None = None


class InvitationAccountAcceptRequest(APIModel):
    token: str = Field(min_length=1, max_length=512)
    password: NewPassword
    full_name: str = Field(min_length=2, max_length=100)

    @field_validator("full_name", mode="before")
    @classmethod
    def normalize_full_name(cls, full_name: str) -> str:
        return full_name.strip() if isinstance(full_name, str) else full_name


class CompanyInviteAcceptRequest(InvitationAccountAcceptRequest):
    pass


class EmployeeInviteAcceptRequest(InvitationAccountAcceptRequest):
    pass


class CompanyInviteCreateRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    company_name: str = Field(min_length=2, max_length=150)
    contact_name: str | None = Field(default=None, max_length=100)
    contact_role: str | None = Field(default=None, max_length=100)

    @field_validator("company_name", "contact_name", "contact_role", mode="before")
    @classmethod
    def normalize_invitation_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = sanitize_input_text(value.strip())
        return normalized or None


class EmployeeInviteCreateRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    role: Literal["ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"]


class EmployeeInviteResendRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    invitation_id: uuid.UUID


class EmployeeInviteExistingAcceptRequest(APIModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=10, max_length=512)


class InvitationDeliveryOut(APIModel):
    detail: Literal["invited", "resent"]
    invitation_id: uuid.UUID
    invitation_url: str
    email_sent: bool
    email_error: str | None = None
    delivery_id: uuid.UUID | None = None
    delivery_status: Literal["pending", "processing", "retry", "sent", "failed"]


class UserMeOut(APIModel):
    id: uuid.UUID
    email: str
    role: str
    is_approved: bool
    is_active: bool = True
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
    is_active: bool = True
    full_name: str
    created_at: datetime


class AdminUserCreate(APIModel):
    """Create a platform-managed candidate account.

    Company membership remains invitation-only and platform administrators are
    provisioned through the documented seed/rotation path.
    """

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: NewPassword
    full_name: str = Field(min_length=2, max_length=100)
    role: Literal["CANDIDATE"] = "CANDIDATE"

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        cleaned = sanitize_input_text(value).strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must contain at least two characters")
        return cleaned


class AdminUserUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=100)
    is_active: bool | None = None

    @field_validator("full_name")
    @classmethod
    def clean_optional_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = sanitize_input_text(value).strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must contain at least two characters")
        return cleaned


class AdminMutationOut(APIModel):
    id: uuid.UUID
    detail: str
    is_active: bool | None = None
    affected_users: int = 0
    closed_offers: int = 0


class OfferCreate(APIModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    title: str = Field(min_length=2, max_length=150)
    # Compatibility input only. The backend derives the authoritative company
    # name and ID from the authenticated membership.
    company: str | None = Field(default=None, min_length=2, max_length=150)
    region: str = Field(min_length=2, max_length=100)
    field: str = Field(min_length=2, max_length=100)
    type: Literal["JOB", "INTERNSHIP"]
    description: str = Field(min_length=10, max_length=10000)
    requirements: str = Field(min_length=10, max_length=10000)
    location: str | None = Field(default=None, max_length=160)
    work_mode: Literal["remote", "hybrid", "on-site"] | None = None
    required_skills: str | None = Field(default=None, max_length=2000)
    required_experience: str | None = Field(default=None, max_length=500)
    education_requirements: str | None = Field(default=None, max_length=1000)
    salary_min: int | None = Field(default=None, ge=0, le=1_000_000_000)
    salary_max: int | None = Field(default=None, ge=0, le=1_000_000_000)
    deadline: datetime | None = None
    opportunity_status: Literal["draft", "active"] = "active"

    @field_validator(
        "title",
        "company",
        "description",
        "requirements",
        "region",
        "field",
        "location",
        "required_skills",
        "required_experience",
        "education_requirements",
        mode="before",
    )
    @classmethod
    def sanitize_offer_text(cls, v: str | None) -> str | None:
        return sanitize_input_text(v)

    @field_validator("deadline")
    @classmethod
    def normalize_deadline(cls, value: datetime | None) -> datetime | None:
        return _naive_utc(value)

    @model_validator(mode="after")
    def validate_salary_range(self) -> "OfferCreate":
        if self.salary_min is not None and self.salary_max is not None and self.salary_min > self.salary_max:
            raise ValueError("salary_min must be less than or equal to salary_max")
        return self


class OfferUpdate(APIModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    title: str | None = Field(default=None, min_length=2, max_length=150)
    company: str | None = Field(default=None, min_length=2, max_length=150)
    region: str | None = Field(default=None, min_length=2, max_length=100)
    field: str | None = Field(default=None, min_length=2, max_length=100)
    type: Literal["JOB", "INTERNSHIP"] | None = None
    description: str | None = Field(default=None, min_length=10, max_length=10000)
    requirements: str | None = Field(default=None, min_length=10, max_length=10000)
    location: str | None = Field(default=None, max_length=160)
    work_mode: Literal["remote", "hybrid", "on-site"] | None = None
    required_skills: str | None = Field(default=None, max_length=2000)
    required_experience: str | None = Field(default=None, max_length=500)
    education_requirements: str | None = Field(default=None, max_length=1000)
    salary_min: int | None = Field(default=None, ge=0, le=1_000_000_000)
    salary_max: int | None = Field(default=None, ge=0, le=1_000_000_000)
    deadline: datetime | None = None

    @field_validator(
        "title",
        "company",
        "description",
        "requirements",
        "region",
        "field",
        "location",
        "required_skills",
        "required_experience",
        "education_requirements",
        mode="before",
    )
    @classmethod
    def sanitize_offer_text(cls, value: str | None) -> str | None:
        return sanitize_input_text(value)

    @field_validator("deadline")
    @classmethod
    def normalize_deadline(cls, value: datetime | None) -> datetime | None:
        return _naive_utc(value)

    @model_validator(mode="after")
    def validate_update(self) -> "OfferUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one offer field must be provided")
        if self.salary_min is not None and self.salary_max is not None and self.salary_min > self.salary_max:
            raise ValueError("salary_min must be less than or equal to salary_max")
        return self



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
    location: str | None = None
    work_mode: str | None = None
    required_skills: str | None = None
    required_experience: str | None = None
    education_requirements: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    deadline: datetime | None = None
    opportunity_status: str
    active: bool
    posted_at: datetime
    closed_at: datetime | None = None
    updated_at: datetime | None = None
    # Company scope + responsible recruiter (optional: backward compatible).
    company_id: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    responsible_hr_id: uuid.UUID | None = None
    # Denormalized branding for candidate-facing cards/detail. Storage path
    # is resolved via GET /companies/{id}/logo — never a raw storage URL.
    company_logo_url: str | None = None


class OfferListOut(APIModel):
    offers: list[OfferOut]


class CompanyLogoMetaOut(APIModel):
    logo_url: str
    filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None


class ResponsibleHrUpdate(APIModel):
    responsible_hr_id: uuid.UUID


ApplicationStage = Literal[
    "applied",
    "under_review",
    "shortlisted",
    "interview",
    "accepted",
    "rejected",
]


class ApplicationCreate(APIModel):
    model_config = ConfigDict(extra="forbid")

    opportunity_id: uuid.UUID
    cover_letter: str | None = Field(default=None, max_length=5000)
    # Compatibility-only. The backend deliberately ignores this storage key
    # and snapshots the authenticated candidate's current owned CV asset.
    cv_url: str | None = Field(default=None, max_length=2048)


class ApplicationCreatedOut(APIModel):
    id: uuid.UUID
    status: ApplicationStage
    stage_version: int
    ai_job_id: uuid.UUID


class ApplicationStatusUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")

    status: ApplicationStage
    expected_version: int = Field(ge=1)
    interview_scheduled_at: datetime | None = None
    interview_notes: str | None = Field(default=None, max_length=2000)

    @field_validator("interview_scheduled_at")
    @classmethod
    def normalize_interview_time(cls, value: datetime | None) -> datetime | None:
        return _naive_utc(value)

    @field_validator("interview_notes", mode="before")
    @classmethod
    def sanitize_interview_notes(cls, value: str | None) -> str | None:
        return sanitize_input_text(value)


class ApplicationStatusOut(APIModel):
    id: uuid.UUID
    status: ApplicationStage
    stage_version: int
    chat_enabled: bool
    interview_scheduled_at: datetime | None = None
    interview_notes: str | None = None
    status_changed_at: datetime | None = None


InterviewRecommendation = Literal["strong_no", "no", "neutral", "yes", "strong_yes"]


class InterviewFeedbackCreate(APIModel):
    model_config = ConfigDict(extra="forbid")

    rating: int = Field(ge=1, le=5)
    recommendation: InterviewRecommendation
    strengths: str = Field(min_length=2, max_length=5_000)
    concerns: str | None = Field(default=None, max_length=5_000)
    notes: str | None = Field(default=None, max_length=10_000)

    @field_validator("strengths", "concerns", "notes", mode="before")
    @classmethod
    def sanitize_feedback(cls, value: str | None) -> str | None:
        return sanitize_input_text(value)


class InterviewFeedbackUpdate(InterviewFeedbackCreate):
    expected_version: int = Field(ge=1)


class InterviewFeedbackOut(APIModel):
    id: uuid.UUID
    application_id: uuid.UUID
    reviewer_id: uuid.UUID
    reviewer_name: str
    rating: int
    recommendation: InterviewRecommendation
    strengths: str
    concerns: str | None = None
    notes: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class InterviewFeedbackListOut(APIModel):
    feedback: list[InterviewFeedbackOut]


class ApplicationScreeningOut(APIModel):
    id: uuid.UUID
    ai_status: str


class ApplicationCandidateOut(APIModel):
    full_name: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    skills: str | None = None
    headline: str | None = None
    city: str | None = None


class ApplicationProfileOut(APIModel):
    headline: str | None = None
    bio: str | None = None
    field_of_study: str | None = None
    university: str | None = None
    study_level: str | None = None
    skills: str | None = None
    years_of_experience: int | None = None
    city: str | None = None
    linkedin_url: str | None = None
    portfolio_url: str | None = None


class ApplicationCVOut(APIModel):
    filename: str
    download_url: str


class ApplicationOpportunityOut(APIModel):
    id: uuid.UUID
    title: str
    company: str
    company_id: uuid.UUID | None = None
    company_logo_url: str | None = None


class ApplicationOut(APIModel):
    id: uuid.UUID
    candidate_id: uuid.UUID | None = None
    opportunity_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    status: str
    stage_version: int = 1
    chat_enabled: bool = False
    cover_letter: str | None = None
    ai_score: int | None = None
    ai_report: str | None = None
    ai_status: str | None = None
    interview_scheduled_at: datetime | None = None
    interview_notes: str | None = None
    status_changed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    candidate: ApplicationCandidateOut | None = None
    profile: ApplicationProfileOut | None = None
    cv: ApplicationCVOut | None = None
    opportunity: ApplicationOpportunityOut | None = None


class ApplicationListOut(APIModel):
    applications: list[ApplicationOut]


class RecommendationRequest(APIModel):
    field: str
    region: str
    type: Literal["JOB", "INTERNSHIP"]


class RecommendationOut(APIModel):
    id: uuid.UUID
    ai_score: int
    ai_reasoning: str
    status: str = "completed"
    error: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    offer: OfferOut


class RecommendationPage(APIModel):
    recommendations: list[RecommendationOut]
    total: int
    limit: int
    offset: int
    has_more: bool


class RecommendationInitialization(APIModel):
    created: int
    active_offers: int


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
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    name: str = Field(min_length=2, max_length=120)
    region: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    industry: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=160)
    website: str | None = Field(default=None, max_length=500)
    company_size: str | None = Field(default=None, max_length=80)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=30)


class CompanyUpdate(APIModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=120)
    region: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    industry: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=160)
    website: str | None = Field(default=None, max_length=500)
    company_size: str | None = Field(default=None, max_length=80)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=30)

    @model_validator(mode="after")
    def require_update_field(self) -> "CompanyUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one company field must be provided")
        return self


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
    subscription_plan: Literal["free", "pro", "enterprise"] = "free"
    subscription_status: Literal["trialing", "active", "past_due", "canceled"] = "active"
    subscription_expires_at: datetime | None = None
    owner_id: uuid.UUID | None = None
    created_at: datetime
    recruiter_count: int = 0


class CompanyListOut(APIModel):
    companies: list[CompanyOut]


class CompanyMemberOut(APIModel):
    id: uuid.UUID
    full_name: str
    email: str
    avatar_url: str | None = None
    company_role: str | None = None
    is_approved: bool = False


class CompanyMembersOut(APIModel):
    members: list[CompanyMemberOut]
    recruiters: list[CompanyMemberOut] | None = None


class CompanyMemberRoleUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")

    company_role: Literal["ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"]


class CompanyMemberRoleOut(APIModel):
    id: uuid.UUID
    company_role: str


class CompanySubscriptionOut(APIModel):
    company_id: uuid.UUID
    status: str
    owner_id: uuid.UUID | None = None
    plan: Literal["free", "pro", "enterprise"]
    subscription_status: Literal["trialing", "active", "past_due", "canceled"]
    expires_at: datetime | None = None
    limits: dict[str, int]
    usage: dict[str, int]


class CompanySubscriptionUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")

    plan: Literal["free", "pro", "enterprise"]
    subscription_status: Literal["trialing", "active", "past_due", "canceled"]
    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def normalize_expiry(cls, value: datetime | None) -> datetime | None:
        return _naive_utc(value)


class FriendOut(APIModel):
    id: uuid.UUID
    full_name: str
    avatar_url: str | None = None
    role: str
    online: bool
    last_seen: datetime | None = None


class FriendListOut(APIModel):
    friends: list[FriendOut]
    total: int


MissionLevel = Literal["beginner", "intermediate", "advanced"]


class PracticeMissionCreate(APIModel):
    model_config = ConfigDict(extra="forbid")

    field: str = Field(min_length=2, max_length=120)
    level: MissionLevel
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=10, max_length=10_000)
    evidence_prompt: str = Field(min_length=10, max_length=5_000)
    skills: list[str] = Field(min_length=1, max_length=12)

    @field_validator("field", "title", "description", "evidence_prompt", mode="before")
    @classmethod
    def sanitize_mission_text(cls, value: str) -> str:
        return sanitize_input_text(value)

    @field_validator("skills", mode="before")
    @classmethod
    def sanitize_mission_skills(cls, values: list[str]) -> list[str]:
        cleaned = [sanitize_input_text(value) for value in values]
        if any(not value or len(value) > 80 for value in cleaned):
            raise ValueError("Each skill must contain 1-80 characters")
        return list(dict.fromkeys(cleaned))


class MissionAttemptCreate(APIModel):
    model_config = ConfigDict(extra="forbid")
    evidence: str = Field(min_length=20, max_length=20_000)

    @field_validator("evidence", mode="before")
    @classmethod
    def sanitize_mission_evidence(cls, value: str) -> str:
        return sanitize_input_text(value)


class MissionAttemptReview(APIModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)
    status: Literal["validated", "rejected"]
    score: int = Field(ge=0, le=100)
    validated_skills: list[str] = Field(default_factory=list, max_length=12)
    feedback: str = Field(min_length=2, max_length=5_000)

    @field_validator("feedback", mode="before")
    @classmethod
    def sanitize_mission_feedback(cls, value: str) -> str:
        return sanitize_input_text(value)

    @field_validator("validated_skills", mode="before")
    @classmethod
    def sanitize_validated_skills(cls, values: list[str]) -> list[str]:
        cleaned = [sanitize_input_text(value) for value in values]
        if any(not value or len(value) > 80 for value in cleaned):
            raise ValueError("Each skill must contain 1-80 characters")
        return list(dict.fromkeys(cleaned))


class MissionAttemptOut(APIModel):
    id: uuid.UUID
    mission_id: uuid.UUID
    candidate_id: uuid.UUID
    attempt_number: int
    evidence: str
    status: str
    score: int | None = None
    validated_skills: list[str]
    feedback: str | None = None
    reviewed_by: uuid.UUID | None = None
    reviewed_at: datetime | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class PracticeMissionOut(APIModel):
    id: uuid.UUID
    field: str
    level: str
    title: str
    description: str
    evidence_prompt: str
    skills: list[str]
    active: bool
    created_at: datetime
    latest_attempt: MissionAttemptOut | None = None


class PracticeMissionListOut(APIModel):
    missions: list[PracticeMissionOut]


class MissionProgressOut(APIModel):
    completed: int
    attempted: int
    average_score: int | None = None
    validated_skills: list[str]
    attempts: list[MissionAttemptOut]


class MissionReviewQueueItem(APIModel):
    attempt: MissionAttemptOut
    mission_title: str
    mission_skills: list[str]
    candidate_name: str
    candidate_email: str


class MissionReviewQueueOut(APIModel):
    attempts: list[MissionReviewQueueItem]


NotificationCategory = Literal["application", "interview", "message", "system"]


class NotificationOut(APIModel):
    id: uuid.UUID
    category: NotificationCategory
    title: str
    body: str
    action_url: str | None = None
    resource_type: str | None = None
    resource_id: uuid.UUID | None = None
    read_at: datetime | None = None
    created_at: datetime


class NotificationListOut(APIModel):
    notifications: list[NotificationOut]
    total: int
    unread: int
    page: int
    limit: int


class NotificationUnreadOut(APIModel):
    unread: int


class NotificationPreferenceUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")

    application_updates: bool = True
    interview_updates: bool = True
    message_updates: bool = True


class NotificationPreferenceOut(NotificationPreferenceUpdate):
    user_id: uuid.UUID
    updated_at: datetime | None = None


class InstitutionCreate(APIModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=180)
    domain: str | None = Field(default=None, max_length=255, pattern=r"^[A-Za-z0-9.-]+$")
    license_plan: Literal["community", "standard", "enterprise"] = "community"
    seat_limit: int = Field(default=100, ge=1, le=100_000)
    license_expires_at: datetime | None = None

    @field_validator("name", "domain", mode="before")
    @classmethod
    def normalize_institution_text(cls, value: str | None) -> str | None:
        cleaned = sanitize_input_text(value)
        return cleaned.lower() if cleaned and "." in cleaned else cleaned

    @field_validator("license_expires_at")
    @classmethod
    def normalize_license_expiry(cls, value: datetime | None) -> datetime | None:
        return _naive_utc(value)


class InstitutionLicenseUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["active", "inactive"]
    license_plan: Literal["community", "standard", "enterprise"]
    seat_limit: int = Field(ge=1, le=100_000)
    license_expires_at: datetime | None = None

    @field_validator("license_expires_at")
    @classmethod
    def normalize_license_expiry(cls, value: datetime | None) -> datetime | None:
        return _naive_utc(value)


class InstitutionMembershipCreate(APIModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    role: Literal["ADMIN", "ADVISOR", "STUDENT"]


class InstitutionMemberOut(APIModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str
    role: Literal["ADMIN", "ADVISOR", "STUDENT"]
    status: Literal["active", "inactive"]
    created_at: datetime


class InstitutionOut(APIModel):
    id: uuid.UUID
    name: str
    domain: str | None = None
    status: Literal["active", "inactive"]
    license_plan: Literal["community", "standard", "enterprise"]
    seat_limit: int
    seats_used: int = 0
    license_expires_at: datetime | None = None
    created_at: datetime


class InstitutionListOut(APIModel):
    institutions: list[InstitutionOut]


class InstitutionMembershipListOut(APIModel):
    institution: InstitutionOut
    members: list[InstitutionMemberOut]


class CandidateRequestCreate(APIModel):
    model_config = ConfigDict(extra="forbid")

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


class CandidateRequestListOut(APIModel):
    requests: list[CandidateRequestOut]


class CandidateRequestStatusUpdate(APIModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["accepted", "rejected"]


class ChatMessageCreate(APIModel):
    receiver_id: uuid.UUID
    content: str = Field(min_length=1, max_length=2000)


class ChatMessageOut(APIModel):
    id: uuid.UUID
    sender_id: uuid.UUID
    receiver_id: uuid.UUID
    content: str
    created_at: datetime
    read_at: datetime | None = None
    sender: UserOut | None = None
    application_id: uuid.UUID | None = None


class RecruitmentMessagesReadOut(APIModel):
    message_ids: list[uuid.UUID]
    read_at: datetime | None = None


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
    company_logo_url: str | None = None
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


class TwoFactorSetupOut(APIModel):
    secret: str
    otpauth_uri: str
    qr_code: str


class TwoFactorEnableRequest(APIModel):
    code: str = Field(min_length=6, max_length=6)


class TwoFactorEnableOut(APIModel):
    detail: str
    backup_codes: list[str]


class TwoFactorDisableRequest(APIModel):
    password: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=6, max_length=20)


class TwoFactorChallengeResponse(APIModel):
    require_2fa: bool = True
    mfa_token: str
    is_new_registration: bool = False


class TwoFactorVerifyRequest(APIModel):
    mfa_token: str
    code: str = Field(min_length=6, max_length=20)



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
