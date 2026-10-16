from __future__ import annotations

import asyncio
import csv
import io
import secrets
from datetime import datetime, timedelta
from html import escape
from typing import Any
from uuid import UUID
from xml.etree import ElementTree

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AccountDeletionRequest,
    Application,
    CandidateProfile,
    CandidateRequest,
    ChatMessage,
    CVAsset,
    Friendship,
    InterviewFeedback,
    MissionAttempt,
    Notification,
    NotificationPreference,
    OAuthAccount,
    Offer,
    PasswordRecovery,
    SavedRecommendation,
    User,
)
from app.services.avatar_storage import delete_avatar
from app.services.cv_storage import delete_cv
from app.services.email_outbox import enqueue_email_delivery


DELETION_GRACE_DAYS = 7
DELETION_LEASE_MINUTES = 10


def serialize_account_export(payload: dict[str, Any], export_format: str) -> tuple[str, str]:
    """Serialize one export without evaluating user data as markup or formulas."""
    if export_format == "json":
        import json

        return json.dumps(payload, ensure_ascii=False, separators=(",", ":")), "application/json"
    if export_format == "csv":
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(("section", "record", "field", "value"))

        def rows(section: str, value: Any) -> None:
            records = value if isinstance(value, list) else [value]
            for index, record in enumerate(records):
                if isinstance(record, dict):
                    for field, item in record.items():
                        text = "" if item is None else str(item)
                        if text.startswith(("=", "+", "-", "@")):
                            text = "'" + text
                        writer.writerow((section, index, field, text))
                else:
                    writer.writerow((section, index, "value", "" if record is None else str(record)))

        for section, value in payload.items():
            rows(section, value)
        return output.getvalue(), "text/csv; charset=utf-8"
    if export_format == "xml":
        root = ElementTree.Element("coditent-account-export", version="1")

        def append(parent: ElementTree.Element, key: str, value: Any) -> None:
            safe_key = key if key.replace("_", "").isalnum() and not key[0].isdigit() else "item"
            node = ElementTree.SubElement(parent, safe_key)
            if safe_key == "item" and key != "item":
                node.set("name", key)
            if isinstance(value, dict):
                for child_key, child_value in value.items():
                    append(node, str(child_key), child_value)
            elif isinstance(value, list):
                for child_value in value:
                    append(node, "item", child_value)
            elif value is not None:
                node.text = str(value)

        for key, value in payload.items():
            append(root, key, value)
        return ElementTree.tostring(root, encoding="unicode", xml_declaration=True), "application/xml"
    raise ValueError("Unsupported account export format")


def _value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat() + ("Z" if value.tzinfo is None else "")
    if isinstance(value, UUID):
        return str(value)
    if hasattr(value, "value"):
        return value.value
    return value


def _record(instance: Any, fields: tuple[str, ...]) -> dict[str, Any]:
    return {field: _value(getattr(instance, field, None)) for field in fields}


async def build_account_export(db: AsyncSession, user: User) -> dict[str, Any]:
    """Build an authenticated, point-in-time export without storing a second copy."""
    profile = (
        await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == user.id))
    ).scalar_one_or_none()
    applications = list(
        (await db.execute(select(Application).where(Application.candidate_id == user.id))).scalars()
    )
    attempts = list(
        (await db.execute(select(MissionAttempt).where(MissionAttempt.candidate_id == user.id))).scalars()
    )
    messages = list(
        (
            await db.execute(
                select(ChatMessage)
                .where(or_(ChatMessage.sender_id == user.id, ChatMessage.receiver_id == user.id))
                .order_by(ChatMessage.created_at.asc())
            )
        ).scalars()
    )
    cv_assets = list(
        (await db.execute(select(CVAsset).where(CVAsset.owner_id == user.id))).scalars()
    )
    offers = list(
        (
            await db.execute(
                select(Offer).where(
                    or_(Offer.created_by == user.id, Offer.recruiter_id == user.id)
                )
            )
        ).scalars()
    )
    interview_feedback = list(
        (
            await db.execute(
                select(InterviewFeedback).where(InterviewFeedback.reviewer_id == user.id)
            )
        ).scalars()
    )
    notifications = list(
        (
            await db.execute(
                select(Notification)
                .where(Notification.user_id == user.id)
                .order_by(Notification.created_at.asc())
            )
        ).scalars()
    )
    candidate_requests = list(
        (
            await db.execute(
                select(CandidateRequest).where(
                    or_(
                        CandidateRequest.candidate_id == user.id,
                        CandidateRequest.recruiter_id == user.id,
                    )
                )
            )
        ).scalars()
    )
    return {
        "format": "coditent-account-export-v1",
        "generated_at": _value(datetime.utcnow()),
        "account": _record(
            user,
            ("id", "email", "full_name", "role", "company_id", "company_role", "created_at"),
        ),
        "profile": _record(
            profile,
            (
                "city", "phone", "headline", "bio", "field_of_study", "university",
                "study_level", "skills", "years_of_experience", "linkedin_url",
                "portfolio_url", "languages", "desired_opportunity_type", "desired_location",
                "search_timeline", "desired_fields", "preferred_work_mode", "career_stage",
                "overall_score", "validated_skills", "updated_at",
            ),
        ) if profile else None,
        "cv_assets": [
            _record(item, ("id", "version", "original_filename", "content_type", "size_bytes", "created_at"))
            for item in cv_assets
        ],
        "applications": [
            _record(item, ("id", "opportunity_id", "status", "cover_letter", "interview_scheduled_at", "created_at", "updated_at"))
            for item in applications
        ],
        "practice_attempts": [
            _record(item, ("id", "mission_id", "attempt_number", "evidence", "status", "score", "validated_skills", "feedback", "created_at"))
            for item in attempts
        ],
        "messages": [
            _record(item, ("id", "sender_id", "receiver_id", "application_id", "content", "created_at", "read_at"))
            for item in messages
        ],
        "offers_created": [
            _record(item, ("id", "title", "company_id", "region", "field", "type", "description", "requirements", "work_mode", "deadline", "opportunity_status", "posted_at"))
            for item in offers
        ],
        "interview_feedback_authored": [
            _record(item, ("id", "application_id", "rating", "recommendation", "strengths", "concerns", "notes", "created_at", "updated_at"))
            for item in interview_feedback
        ],
        "notifications": [
            _record(item, ("id", "category", "title", "body", "action_url", "read_at", "created_at"))
            for item in notifications
        ],
        "candidate_requests": [
            _record(item, ("id", "candidate_id", "company_id", "recruiter_id", "message", "status", "created_at"))
            for item in candidate_requests
        ],
    }


async def claim_due_deletion(db: AsyncSession, worker_id: str) -> UUID | None:
    now = datetime.utcnow()
    request = (
        await db.execute(
            select(AccountDeletionRequest)
            .where(
                AccountDeletionRequest.status.in_(("scheduled", "retry", "processing")),
                AccountDeletionRequest.next_attempt_at <= now,
                or_(
                    AccountDeletionRequest.lease_expires_at.is_(None),
                    AccountDeletionRequest.lease_expires_at <= now,
                ),
            )
            .order_by(AccountDeletionRequest.next_attempt_at.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
    ).scalar_one_or_none()
    if request is None:
        return None
    request.status = "processing"
    request.attempts += 1
    request.lease_owner = worker_id[:100]
    request.lease_expires_at = now + timedelta(minutes=DELETION_LEASE_MINUTES)
    await db.commit()
    return request.id


async def _delete_private_storage(db: AsyncSession, user: User) -> None:
    paths = list(
        (await db.execute(select(CVAsset.storage_path).where(CVAsset.owner_id == user.id))).scalars()
    )
    for path in paths:
        await asyncio.to_thread(delete_cv, path)
    if user.avatar_storage_path:
        await asyncio.to_thread(delete_avatar, user.avatar_storage_path)


async def execute_deletion(db: AsyncSession, request_id: UUID, worker_id: str) -> bool:
    request = (
        await db.execute(
            select(AccountDeletionRequest)
            .where(AccountDeletionRequest.id == request_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if request is None or request.status != "processing" or request.lease_owner != worker_id[:100]:
        return False
    user = (
        await db.execute(select(User).where(User.id == request.user_id).with_for_update())
    ).scalar_one_or_none()
    if user is None:
        request.status = "completed"
        request.completed_at = datetime.utcnow()
        request.lease_owner = None
        request.lease_expires_at = None
        await db.commit()
        return True
    try:
        await _delete_private_storage(db, user)
    except Exception as exc:
        request.status = "retry"
        request.last_error_type = type(exc).__name__[:120]
        request.next_attempt_at = datetime.utcnow() + timedelta(
            minutes=min(24 * 60, 2 ** min(request.attempts, 10))
        )
        request.lease_owner = None
        request.lease_expires_at = None
        await db.commit()
        return False

    profile = (
        await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == user.id))
    ).scalar_one_or_none()
    if profile is not None:
        for field in (
            "city", "phone", "headline", "bio", "field_of_study", "university", "study_level",
            "skills", "years_of_experience", "linkedin_url", "portfolio_url", "languages",
            "current_cv_asset_id", "cv_url", "desired_opportunity_type", "desired_location",
            "search_timeline", "desired_fields", "preferred_work_mode", "career_stage",
            "onboarding_completed_at", "overall_score", "validated_skills",
        ):
            setattr(profile, field, None)
        profile.onboarding_completed = False

    assets = list((await db.execute(select(CVAsset).where(CVAsset.owner_id == user.id))).scalars())
    for asset in assets:
        asset.storage_path = f"deleted/{asset.id}"
        asset.original_filename = "deleted"
        asset.content_type = "application/octet-stream"
        asset.size_bytes = None
    await db.execute(update(Application).where(Application.candidate_id == user.id).values(cv_url=None, cover_letter=None))
    await db.execute(update(MissionAttempt).where(MissionAttempt.candidate_id == user.id).values(evidence="[deleted by account owner]"))
    await db.execute(update(ChatMessage).where(ChatMessage.sender_id == user.id).values(content="[deleted by account owner]"))
    await db.execute(update(CandidateRequest).where(CandidateRequest.candidate_id == user.id).values(message=None))
    for model in (OAuthAccount, PasswordRecovery, SavedRecommendation, Notification, NotificationPreference):
        await db.execute(delete(model).where(model.user_id == user.id) if hasattr(model, "user_id") else delete(model).where(model.candidate_id == user.id))
    await db.execute(
        delete(Friendship).where(
            or_(
                Friendship.requester_id == user.id,
                Friendship.addressee_id == user.id,
            )
        )
    )

    await enqueue_email_delivery(
        db,
        kind="account_data_confirmation",
        dedupe_key=f"account-deletion-completed:{request.id}",
        resource_type="account_deletion",
        resource_id=request.id,
        to_email=user.email,
        subject="CODITENT account deletion completed",
        html=(
            f"<p>Hello {escape(user.full_name)},</p>"
            "<p>Your CODITENT account deletion has completed. Private files and direct personal fields were removed, "
            "and integrity records were anonymized.</p>"
        ),
        text=(
            f"Hello {user.full_name},\n\nYour CODITENT account deletion has completed. "
            "Private files and direct personal fields were removed, and integrity records were anonymized."
        ),
    )

    user.email = f"deleted+{user.id}@example.invalid"
    user.password_hash = "deleted:" + secrets.token_urlsafe(48)
    user.full_name = "Deleted user"
    user.is_active = False
    user.is_approved = False
    user.auth_version = int(user.auth_version or 0) + 1
    user.oauth_provider = None
    user.oauth_id = None
    user.avatar_url = None
    user.avatar_storage_path = None
    user.company_id = None
    user.company_role = None
    user.is_2fa_enabled = False
    user.totp_secret_encrypted = None
    user.totp_last_used_step = None
    user.backup_codes = None
    user.pending_email = None
    user.pending_email_otp_hash = None
    user.pending_email_expires_at = None
    user.pending_email_attempts = 0
    request.status = "completed"
    request.completed_at = datetime.utcnow()
    request.last_error_type = None
    request.lease_owner = None
    request.lease_expires_at = None
    await db.commit()
    return True


async def run_account_deletion_cycle(db: AsyncSession, worker_id: str, limit: int = 5) -> int:
    completed = 0
    for _ in range(limit):
        request_id = await claim_due_deletion(db, worker_id)
        if request_id is None:
            break
        if await execute_deletion(db, request_id, worker_id):
            completed += 1
    return completed
