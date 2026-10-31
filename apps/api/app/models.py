import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    UUID,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    CANDIDATE = "CANDIDATE"
    RECRUITER = "RECRUITER"  # legacy — kept for reading pre-migration rows, do not create new
    ADMIN = "ADMIN"  # legacy — use PLATFORM_ADMIN
    PLATFORM_ADMIN = "PLATFORM_ADMIN"
    COMPANY_USER = "COMPANY_USER"


class StudyLevel(str, enum.Enum):
    BAC = "BAC"
    LICENCE = "LICENCE"
    MASTER = "MASTER"
    DOCTORAT = "DOCTORAT"


class OfferType(str, enum.Enum):
    JOB = "JOB"
    INTERNSHIP = "INTERNSHIP"


class CompanyRole(str, enum.Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    HR = "HR"
    RECRUITER = "RECRUITER"
    HIRING_MANAGER = "HIRING_MANAGER"


class CompanyStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class OfferStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    closed = "closed"


class ApplicationStatus(str, enum.Enum):
    applied = "applied"
    under_review = "under_review"
    shortlisted = "shortlisted"
    interview = "interview"
    accepted = "accepted"
    rejected = "rejected"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("auth_version >= 0", name="ck_users_auth_version"),
        CheckConstraint(
            "pending_email_attempts >= 0", name="ck_users_pending_email_attempts"
        ),
        CheckConstraint(
            "(pending_email IS NULL AND pending_email_otp_hash IS NULL "
            "AND pending_email_expires_at IS NULL) OR "
            "(pending_email IS NOT NULL AND pending_email_otp_hash IS NOT NULL "
            "AND pending_email_expires_at IS NOT NULL)",
            name="ck_users_pending_email_bundle",
        ),
        CheckConstraint(
            "(company_id IS NULL) = (company_role IS NULL)",
            name="ck_users_company_membership_pair",
        ),
        CheckConstraint(
            "company_role IS NULL OR company_role IN "
            "('OWNER', 'ADMIN', 'HR', 'RECRUITER', 'HIRING_MANAGER')",
            name="ck_users_company_role",
        ),
        Index("ix_users_role", "role"),
        Index("ix_users_is_active", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    # Explicitly records whether the user knows a usable local password.
    # OAuth-created accounts still carry a non-usable random hash for legacy
    # compatibility, so password_hash alone cannot answer this question.
    password_login_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CANDIDATE, nullable=False)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Account availability is deliberately separate from registration or
    # recruiter approval. Administrative suspension must invalidate sessions
    # without pretending that the account never verified its email.
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=true(),
        nullable=False,
    )
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    oauth_provider: Mapped[str | None] = mapped_column(String(30), nullable=True)
    oauth_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_storage_path: Mapped[str | None] = mapped_column(String, nullable=True)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    company_role: Mapped[str | None] = mapped_column(String, nullable=True)
    is_2fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auth_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    totp_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_last_used_step: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    backup_codes: Mapped[str | None] = mapped_column(Text, nullable=True)
    pending_email: Mapped[str | None] = mapped_column(String, nullable=True)
    pending_email_otp_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pending_email_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    pending_email_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


    company: Mapped["Company | None"] = relationship("Company", back_populates="recruiters", foreign_keys=[company_id])
    profile: Mapped["CandidateProfile | None"] = relationship(
        "CandidateProfile", back_populates="user", uselist=False
    )
    offers: Mapped[list["Offer"]] = relationship("Offer", back_populates="recruiter", foreign_keys="Offer.recruiter_id")
    recommendations: Mapped[list["SavedRecommendation"]] = relationship(
        "SavedRecommendation", back_populates="candidate"
    )
    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship(
        "OAuthAccount", back_populates="user", cascade="all, delete-orphan"
    )


class NotificationPreference(Base):
    """Per-user product notification choices.

    Missing rows deliberately mean the documented defaults. This lets older
    accounts receive important in-app events without a backfill race while a
    row is created only after the user changes a preference.
    """

    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    application_updates: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    interview_updates: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    message_updates: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class Notification(Base):
    """A durable, owner-scoped in-app notification."""

    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "category IN ('application', 'interview', 'message', 'system')",
            name="ck_notifications_category",
        ),
        UniqueConstraint("user_id", "dedupe_key", name="uq_notifications_user_dedupe"),
        Index("ix_notifications_user_created", "user_id", "created_at"),
        Index("ix_notifications_user_unread", "user_id", "read_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    resource_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(200), nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class AccountDeletionRequest(Base):
    """Durable, cancelable account-erasure workflow with worker recovery."""

    __tablename__ = "account_deletion_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('scheduled', 'processing', 'retry', 'completed', 'canceled')",
            name="ck_account_deletion_status",
        ),
        UniqueConstraint("user_id", name="uq_account_deletion_user"),
        Index("ix_account_deletion_due", "status", "next_attempt_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(30), default="scheduled", nullable=False)
    execute_after: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    lease_owner: Mapped[str | None] = mapped_column(String(100), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Institution(Base):
    __tablename__ = "institutions"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'inactive')", name="ck_institutions_status"),
        CheckConstraint(
            "license_plan IN ('community', 'standard', 'enterprise')",
            name="ck_institutions_license_plan",
        ),
        CheckConstraint("seat_limit BETWEEN 1 AND 100000", name="ck_institutions_seat_limit"),
        Index("ix_institutions_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(180), unique=True, nullable=False)
    domain: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    license_plan: Mapped[str] = mapped_column(String(30), default="community", nullable=False)
    seat_limit: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    license_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class InstitutionMembership(Base):
    __tablename__ = "institution_memberships"
    __table_args__ = (
        UniqueConstraint("institution_id", "user_id", name="uq_institution_membership"),
        CheckConstraint(
            "role IN ('ADMIN', 'ADVISOR', 'STUDENT')",
            name="ck_institution_membership_role",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive')",
            name="ck_institution_membership_status",
        ),
        Index("ix_institution_memberships_user", "user_id", "status"),
        Index("ix_institution_memberships_institution", "institution_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    institution: Mapped[Institution] = relationship("Institution")
    user: Mapped[User] = relationship("User")


class OAuthAccount(Base):
    """A stable external identity explicitly linked to one local account."""

    __tablename__ = "oauth_accounts"
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_oauth_accounts_provider_subject"),
        UniqueConstraint("user_id", "provider", name="uq_oauth_accounts_user_provider"),
        Index("ix_oauth_accounts_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    issuer: Mapped[str] = mapped_column(String(255), nullable=False)
    email_at_link: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="oauth_accounts")


class CVAsset(Base):
    """Immutable, owner-bound CV version.

    Candidate profiles point at the current version while applications retain
    the exact version submitted at apply time. Assets remain until neither a
    profile nor an application references them.
    """

    __tablename__ = "cv_assets"
    __table_args__ = (
        UniqueConstraint("id", "owner_id", name="uq_cv_assets_id_owner"),
        UniqueConstraint("owner_id", "version", name="uq_cv_assets_owner_version"),
        UniqueConstraint("storage_path", name="uq_cv_assets_storage_path"),
        Index("ix_cv_assets_owner_id", "owner_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String, nullable=False)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"
    __table_args__ = (
        CheckConstraint(
            "onboarding_step BETWEEN 1 AND 7",
            name="ck_candidate_profiles_onboarding_step",
        ),
        CheckConstraint(
            "overall_score IS NULL OR overall_score BETWEEN 0 AND 100",
            name="ck_candidate_profiles_overall_score",
        ),
        ForeignKeyConstraint(
            ["current_cv_asset_id", "user_id"],
            ["cv_assets.id", "cv_assets.owner_id"],
            name="fk_candidate_profiles_current_cv_owner",
            ondelete="RESTRICT",
        ),
        Index("ix_candidate_profiles_current_cv_asset_id", "current_cv_asset_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    headline: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    field_of_study: Mapped[str | None] = mapped_column(String, nullable=True)
    university: Mapped[str | None] = mapped_column(String, nullable=True)
    study_level: Mapped[StudyLevel | None] = mapped_column(Enum(StudyLevel), nullable=True)
    skills: Mapped[str | None] = mapped_column(Text, nullable=True)
    years_of_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String, nullable=True)
    portfolio_url: Mapped[str | None] = mapped_column(String, nullable=True)
    languages: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_cv_asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Compatibility projection for existing API clients. The immutable asset
    # row above is authoritative and all storage/worker access resolves it.
    cv_url: Mapped[str | None] = mapped_column(String, nullable=True)
    desired_opportunity_type: Mapped[str | None] = mapped_column(String, nullable=True)
    desired_location: Mapped[str | None] = mapped_column(String, nullable=True)
    search_timeline: Mapped[str | None] = mapped_column(String(40), nullable=True)
    desired_fields: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_work_mode: Mapped[str | None] = mapped_column(String(30), nullable=True)
    career_stage: Mapped[str | None] = mapped_column(String(30), nullable=True)
    onboarding_step: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    validated_skills: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, onupdate=datetime.utcnow, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="profile")


class Offer(Base):
    """
    Unified Offer / Opportunity table — preserves existing `offers` name for compatibility
    with recommendations. New company-scoped fields are nullable to keep existing data.
    """
    __tablename__ = "offers"
    __table_args__ = (
        CheckConstraint(
            "opportunity_status IN ('draft', 'active', 'closed')",
            name="ck_offers_opportunity_status",
        ),
        CheckConstraint(
            "salary_min IS NULL OR salary_min >= 0", name="ck_offers_salary_min"
        ),
        CheckConstraint(
            "salary_max IS NULL OR salary_max >= 0", name="ck_offers_salary_max"
        ),
        CheckConstraint(
            "salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max",
            name="ck_offers_salary_range",
        ),
        Index("ix_offers_recruiter_id", "recruiter_id"),
        Index("ix_offers_company_id", "company_id"),
        Index("ix_offers_responsible_hr_id", "responsible_hr_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recruiter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    # legacy free-text company name (kept for backward compat) + new FK
    company: Mapped[str] = mapped_column(String, nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # Recruiter responsible for this offer's hiring pipeline. Nullable for
    # backward compat; resolved via created_by/recruiter_id fallback when unset.
    # Never trust client input — set server-side, changeable only by company admins.
    responsible_hr_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    region: Mapped[str] = mapped_column(String, nullable=False)
    field: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[OfferType] = mapped_column(Enum(OfferType), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    requirements: Mapped[str] = mapped_column(Text, nullable=False)
    # enriched per spec §3
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    work_mode: Mapped[str | None] = mapped_column(String, nullable=True)  # remote/hybrid/on-site
    required_skills: Mapped[str | None] = mapped_column(Text, nullable=True)
    required_experience: Mapped[str | None] = mapped_column(String, nullable=True)
    education_requirements: Mapped[str | None] = mapped_column(String, nullable=True)
    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    opportunity_status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    posted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )

    recruiter: Mapped[User] = relationship("User", back_populates="offers", foreign_keys=[recruiter_id])
    responsible_hr: Mapped["User | None"] = relationship("User", foreign_keys=[responsible_hr_id])
    company_obj: Mapped["Company | None"] = relationship("Company", foreign_keys=[company_id])
    recommendations: Mapped[list["SavedRecommendation"]] = relationship(
        "SavedRecommendation", back_populates="offer", passive_deletes=True
    )
    applications: Mapped[list["Application"]] = relationship("Application", back_populates="opportunity")


class SavedRecommendation(Base):
    __tablename__ = "saved_recommendations"
    __table_args__ = (
        CheckConstraint(
            "ai_score BETWEEN 0 AND 100", name="ck_saved_recommendations_ai_score"
        ),
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed')",
            name="ck_saved_recommendations_status",
        ),
        UniqueConstraint("candidate_id", "offer_id", name="uq_saved_recommendations_candidate_offer"),
        Index("ix_saved_recommendations_candidate_id", "candidate_id"),
        Index("ix_saved_recommendations_offer_id", "offer_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offers.id", ondelete="CASCADE"), nullable=False
    )
    ai_score: Mapped[int] = mapped_column(Integer, nullable=False)
    ai_reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    # Candidate match lifecycle: pending -> processing -> completed | failed.
    # Rows are created as pending by the explicit idempotent initialization
    # endpoint; paginated GET remains read-only. A scorer moves them forward.
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    candidate: Mapped[User] = relationship("User", back_populates="recommendations")
    offer: Mapped[Offer] = relationship("Offer", back_populates="recommendations")


class AIJob(Base):
    """Durable transactional outbox and execution state for AI work."""

    __tablename__ = "ai_jobs"
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_ai_jobs_dedupe_key"),
        CheckConstraint(
            "status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'stale')",
            name="ck_ai_jobs_status",
        ),
        CheckConstraint("attempts >= 0 AND max_attempts BETWEEN 1 AND 10", name="ck_ai_jobs_attempts"),
        Index("ix_ai_jobs_dispatch", "status", "available_at", "lease_until"),
        Index("ix_ai_jobs_actor_id", "actor_id"),
        Index("ix_ai_jobs_company_id", "company_id"),
        Index("ix_ai_jobs_resource", "kind", "resource_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), nullable=True
    )
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    source_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    available_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    lease_owner: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class EmailDelivery(Base):
    """Encrypted transactional outbox for provider email delivery."""

    __tablename__ = "email_deliveries"
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_email_deliveries_dedupe_key"),
        CheckConstraint(
            "status IN ('pending', 'processing', 'retry', 'sent', 'failed')",
            name="ck_email_deliveries_status",
        ),
        CheckConstraint(
            "attempts >= 0 AND max_attempts BETWEEN 1 AND 10",
            name="ck_email_deliveries_attempts",
        ),
        Index("ix_email_deliveries_dispatch", "status", "available_at", "lease_until"),
        Index("ix_email_deliveries_resource", "resource_type", "resource_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(255), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    encrypted_payload: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    available_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    lease_owner: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PasswordRecovery(Base):
    __tablename__ = "password_recoveries"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_password_recoveries_token_hash"),
        Index("ix_password_recoveries_user_id", "user_id", "created_at"),
        Index("ix_password_recoveries_expires_at", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class RevokedSession(Base):
    """Durable access-session revocation that survives Redis restarts."""

    __tablename__ = "revoked_sessions"
    __table_args__ = (
        Index("ix_revoked_sessions_expires_at", "expires_at"),
        Index("ix_revoked_sessions_user_id", "user_id"),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class RevokedTrustedDevice(Base):
    """Durable remembered-device revocation for complete logout semantics."""

    __tablename__ = "revoked_trusted_devices"
    __table_args__ = (
        Index("ix_revoked_trusted_devices_expires_at", "expires_at"),
        Index("ix_revoked_trusted_devices_user_id", "user_id"),
    )

    token_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class RequestStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (
        UniqueConstraint("pair_low_id", "pair_high_id", name="uq_friendships_unordered_pair"),
        CheckConstraint("requester_id <> addressee_id", name="ck_friendships_not_self"),
        CheckConstraint("pair_low_id <> pair_high_id", name="ck_friendships_pair_not_self"),
        CheckConstraint("pair_low_id < pair_high_id", name="ck_friendships_pair_ordered"),
        CheckConstraint(
            "status IN ('PENDING', 'ACCEPTED', 'BLOCKED')",
            name="ck_friendships_status",
        ),
        Index("ix_friendships_requester_status", "requester_id", "status"),
        Index("ix_friendships_addressee_status", "addressee_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    addressee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    pair_low_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    pair_high_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (
        CheckConstraint(
            "subscription_plan IN ('free', 'pro', 'enterprise')",
            name="ck_companies_subscription_plan",
        ),
        CheckConstraint(
            "subscription_status IN ('trialing', 'active', 'past_due', 'canceled')",
            name="ck_companies_subscription_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    # enriched profile per spec §1
    logo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    industry: Mapped[str | None] = mapped_column(String, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    website: Mapped[str | None] = mapped_column(String, nullable=True)
    company_size: Mapped[str | None] = mapped_column(String, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String, nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    subscription_plan: Mapped[str] = mapped_column(String(30), default="free", nullable=False)
    subscription_status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    subscription_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    recruiters: Mapped[list["User"]] = relationship("User", back_populates="company", foreign_keys=[User.company_id])
    owner: Mapped["User | None"] = relationship("User", foreign_keys=[owner_id])


class CompanyInvitation(Base):
    """Metadata mapping for the SQL-driven company invitation workflow."""

    __tablename__ = "company_invitations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'accepted', 'expired', 'revoked')",
            name="ck_company_invitations_status",
        ),
        Index("ix_company_invitations_email", "email"),
        Index(
            "uq_company_invitations_pending_email",
            text("lower(email)"),
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String, nullable=False)
    company_name: Mapped[str] = mapped_column(String, nullable=False)
    token_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String, server_default="pending", nullable=False)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String, nullable=True)
    contact_role: Mapped[str | None] = mapped_column(String, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CompanyInterestRequest(Base):
    """Public company contact requests awaiting platform-admin review."""

    __tablename__ = "company_interest_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'invited', 'dismissed')",
            name="ck_company_interest_requests_status",
        ),
        Index("ix_company_interest_requests_created_at", "created_at"),
        Index(
            "uq_company_interest_requests_pending_email",
            text("lower(email)"),
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class EmployeeInvitation(Base):
    """Metadata mapping for the SQL-driven employee invitation workflow."""

    __tablename__ = "employee_invitations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'accepted', 'expired', 'revoked')",
            name="ck_employee_invitations_status",
        ),
        CheckConstraint(
            "role IN ('ADMIN', 'HR', 'RECRUITER', 'HIRING_MANAGER')",
            name="ck_employee_invitations_role",
        ),
        Index("ix_employee_invitations_email", "email"),
        Index(
            "uq_employee_invitations_pending_company_email",
            "company_id",
            text("lower(email)"),
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    token_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String, server_default="pending", nullable=False)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PendingRegistration(Base):
    """Metadata mapping for pre-account email verification records."""

    __tablename__ = "pending_registrations"
    __table_args__ = (
        CheckConstraint("otp_attempts >= 0", name="ck_pending_registrations_otp_attempts"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    otp_hash: Mapped[str] = mapped_column(String, nullable=False)
    otp_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    otp_attempts: Mapped[int] = mapped_column(
        Integer, server_default="0", nullable=False
    )
    last_otp_sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class CandidateRequest(Base):
    __tablename__ = "candidate_requests"
    __table_args__ = (
        Index("ix_candidate_requests_candidate_id", "candidate_id"),
        Index("ix_candidate_requests_company_id", "company_id"),
        # The route-level duplicate check provides a friendly response, while
        # this partial unique index is the concurrency boundary. Two API
        # workers cannot create two live requests for the same candidate and
        # company after both observed an empty result.
        Index(
            "uq_candidate_requests_pending_candidate_company",
            "candidate_id",
            "company_id",
            unique=True,
            postgresql_where="status = 'pending'",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    recruiter_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[RequestStatus] = mapped_column(Enum(RequestStatus), default=RequestStatus.pending, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    candidate: Mapped[User] = relationship("User", foreign_keys=[candidate_id])
    company: Mapped[Company] = relationship("Company")
    recruiter: Mapped[User | None] = relationship("User", foreign_keys=[recruiter_id])


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_sender", "sender_id"),
        Index("ix_chat_messages_receiver", "receiver_id"),
        Index("ix_chat_messages_application_id", "application_id"),
        # Canonical per-application ordering for the single logical
        # recruitment conversation (one application_id = one conversation).
        Index("ix_chat_messages_application_created", "application_id", "created_at"),
        Index(
            "ix_chat_messages_recruitment_unread",
            "application_id",
            "receiver_id",
            "read_at",
        ),
        # Direct/general inbox lookup: only rows with application_id IS NULL.
        # Keeps recruitment messages out of the direct inbox at the index
        # level and documents the separation between the two conversation
        # kinds. NOTE: UNIQUE(application_id) must NOT be applied to this
        # table — one recruitment conversation HOLDS MANY messages. The
        # uniqueness guarantee lives on applications.id (PK) + the single
        # entry per application_id enforced in list_recruitment_chats.
        Index(
            "ix_chat_messages_direct_pair",
            "sender_id",
            "receiver_id",
            "created_at",
            postgresql_where="application_id IS NULL",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Nullable: set only for recruitment chats. NULL = pre-existing general chat.
    # The application is the source of truth for who may talk (candidate ↔
    # responsible HR resolved through offer), so no separate conversation table
    # is needed — one application maps to exactly one logical conversation,
    # which makes duplicates impossible by construction.
    application_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_kind: Mapped[str] = mapped_column(String(32), default="human", nullable=False)
    event_key: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    sender: Mapped[User] = relationship("User", foreign_keys=[sender_id])
    receiver: Mapped[User] = relationship("User", foreign_keys=[receiver_id])
    application: Mapped["Application | None"] = relationship("Application", foreign_keys=[application_id])


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        CheckConstraint("stage_version >= 1", name="ck_applications_stage_version"),
        CheckConstraint(
            "ai_score IS NULL OR ai_score BETWEEN 0 AND 100",
            name="ck_applications_ai_score",
        ),
        CheckConstraint(
            "status IN ('applied', 'under_review', 'shortlisted', 'interview', "
            "'accepted', 'rejected')",
            name="ck_applications_status",
        ),
        CheckConstraint(
            "ai_status IN ('pending', 'processing', 'completed', 'failed')",
            name="ck_applications_ai_status",
        ),
        UniqueConstraint("candidate_id", "opportunity_id", name="uq_applications_candidate_opportunity"),
        ForeignKeyConstraint(
            ["cv_asset_id", "candidate_id"],
            ["cv_assets.id", "cv_assets.owner_id"],
            name="fk_applications_cv_asset_owner",
            ondelete="RESTRICT",
        ),
        Index("ix_applications_candidate_id", "candidate_id"),
        Index("ix_applications_opportunity_id", "opportunity_id"),
        Index("ix_applications_company_id", "company_id"),
        Index("ix_applications_cv_asset_id", "cv_asset_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    opportunity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("offers.id", ondelete="RESTRICT"), nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="applied", nullable=False)
    cv_asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Legacy compatibility snapshot only. Authorization and retrieval never
    # trust this string; they resolve ``cv_asset_id`` and validate its owner.
    cv_url: Mapped[str | None] = mapped_column(String, nullable=True)
    cover_letter: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_report: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    stage_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    interview_scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    interview_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    interview_timezone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    interview_meeting_link: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    interview_location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    interview_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status_changed_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    candidate: Mapped[User] = relationship("User", foreign_keys=[candidate_id])
    opportunity: Mapped[Offer] = relationship("Offer", back_populates="applications")
    company: Mapped[Company | None] = relationship("Company")


class InterviewFeedback(Base):
    __tablename__ = "interview_feedback"
    __table_args__ = (
        UniqueConstraint(
            "application_id", "reviewer_id", name="uq_interview_feedback_reviewer"
        ),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_interview_feedback_rating"),
        CheckConstraint(
            "recommendation IN ('strong_no', 'no', 'neutral', 'yes', 'strong_yes')",
            name="ck_interview_feedback_recommendation",
        ),
        Index("ix_interview_feedback_application", "application_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    recommendation: Mapped[str] = mapped_column(String(30), nullable=False)
    strengths: Mapped[str] = mapped_column(Text, nullable=False)
    concerns: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    reviewer: Mapped[User] = relationship("User", foreign_keys=[reviewer_id])


class PracticeMission(Base):
    __tablename__ = "practice_missions"
    __table_args__ = (
        Index("ix_practice_missions_field_level", "field", "level", "active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    field: Mapped[str] = mapped_column(String(120), nullable=False)
    level: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    skills: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    max_score: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class MissionAttempt(Base):
    __tablename__ = "mission_attempts"
    __table_args__ = (
        UniqueConstraint(
            "mission_id", "candidate_id", "attempt_number",
            name="uq_mission_attempt_number",
        ),
        CheckConstraint("attempt_number BETWEEN 1 AND 5", name="ck_mission_attempt_number"),
        CheckConstraint("score IS NULL OR score BETWEEN 0 AND 100", name="ck_mission_attempt_score"),
        Index("ix_mission_attempts_candidate", "candidate_id", "created_at"),
        Index("ix_mission_attempts_mission", "mission_id", "candidate_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("practice_missions.id", ondelete="CASCADE"), nullable=False
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    evidence: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="submitted")
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    validated_skills: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class AdminActivityLog(Base):
    __tablename__ = "admin_activity_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    admin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    admin_email: Mapped[str] = mapped_column(String, nullable=False)
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    target_user_email: Mapped[str | None] = mapped_column(String, nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'in_progress', 'resolved')", name="ck_support_tickets_status"),
        Index("ix_support_tickets_reporter_created", "reporter_id", "created_at"),
        Index("ix_support_tickets_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), nullable=True)
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    page_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
