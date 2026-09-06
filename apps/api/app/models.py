import enum
import uuid
from datetime import datetime

from sqlalchemy import UUID, Boolean, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint
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
    assessment_required = "assessment_required"
    assessment_completed = "assessment_completed"
    interview = "interview"
    accepted = "accepted"
    rejected = "rejected"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_email", "email"),
        Index("ix_users_role", "role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CANDIDATE, nullable=False)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    oauth_provider: Mapped[str | None] = mapped_column(String(30), nullable=True)
    oauth_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    company_role: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    company: Mapped["Company | None"] = relationship("Company", back_populates="recruiters", foreign_keys=[company_id])
    profile: Mapped["CandidateProfile | None"] = relationship(
        "CandidateProfile", back_populates="user", uselist=False
    )
    offers: Mapped[list["Offer"]] = relationship("Offer", back_populates="recruiter", foreign_keys="Offer.recruiter_id")
    recommendations: Mapped[list["SavedRecommendation"]] = relationship(
        "SavedRecommendation", back_populates="candidate"
    )


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

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
    cv_url: Mapped[str | None] = mapped_column(String, nullable=True)
    desired_opportunity_type: Mapped[str | None] = mapped_column(String, nullable=True)
    desired_location: Mapped[str | None] = mapped_column(String, nullable=True)
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
        Index("ix_offers_recruiter_id", "recruiter_id"),
        Index("ix_offers_company_id", "company_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recruiter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    # legacy free-text company name (kept for backward compat) + new FK
    company: Mapped[str] = mapped_column(String, nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
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

    recruiter: Mapped[User] = relationship("User", back_populates="offers", foreign_keys=[recruiter_id])
    company_obj: Mapped["Company | None"] = relationship("Company", foreign_keys=[company_id])
    recommendations: Mapped[list["SavedRecommendation"]] = relationship(
        "SavedRecommendation", back_populates="offer"
    )
    applications: Mapped[list["Application"]] = relationship("Application", back_populates="opportunity")


class SavedRecommendation(Base):
    __tablename__ = "saved_recommendations"
    __table_args__ = (
        UniqueConstraint("candidate_id", "offer_id", name="uq_saved_recommendations_candidate_offer"),
        Index("ix_saved_recommendations_candidate_id", "candidate_id"),
        Index("ix_saved_recommendations_offer_id", "offer_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    offer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("offers.id"), nullable=False)
    ai_score: Mapped[int] = mapped_column(Integer, nullable=False)
    ai_reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    candidate: Mapped[User] = relationship("User", back_populates="recommendations")
    offer: Mapped[Offer] = relationship("Offer", back_populates="recommendations")


class RequestStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (Index("ix_companies_name", "name"),)

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
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    recruiters: Mapped[list["User"]] = relationship("User", back_populates="company", foreign_keys=[User.company_id])
    owner: Mapped["User | None"] = relationship("User", foreign_keys=[owner_id])


class CandidateRequest(Base):
    __tablename__ = "candidate_requests"
    __table_args__ = (
        Index("ix_candidate_requests_candidate_id", "candidate_id"),
        Index("ix_candidate_requests_company_id", "company_id"),
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
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    sender: Mapped[User] = relationship("User", foreign_keys=[sender_id])
    receiver: Mapped[User] = relationship("User", foreign_keys=[receiver_id])


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("candidate_id", "opportunity_id", name="uq_applications_candidate_opportunity"),
        Index("ix_applications_candidate_id", "candidate_id"),
        Index("ix_applications_opportunity_id", "opportunity_id"),
        Index("ix_applications_company_id", "company_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    opportunity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("offers.id", ondelete="CASCADE"), nullable=False)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="applied", nullable=False)
    cv_url: Mapped[str | None] = mapped_column(String, nullable=True)
    cover_letter: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_report: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, onupdate=datetime.utcnow, nullable=True)

    candidate: Mapped[User] = relationship("User", foreign_keys=[candidate_id])
    opportunity: Mapped[Offer] = relationship("Offer", back_populates="applications")
    company: Mapped[Company | None] = relationship("Company")


class Assessment(Base):
    __tablename__ = "assessments"
    __table_args__ = (
        Index("ix_assessments_application_id", "application_id"),
        Index("ix_assessments_candidate_id", "candidate_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False)
    candidate_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    report: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    application: Mapped[Application] = relationship("Application")
    candidate: Mapped[User] = relationship("User", foreign_keys=[candidate_id])


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
