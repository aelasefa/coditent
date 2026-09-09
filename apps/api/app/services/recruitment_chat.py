"""Candidate ↔ Responsible HR recruitment chat — business rules.

Single source of truth for:
- resolving the responsible HR of an offer,
- deciding whether an application state enables recruitment chat,
- authorizing access to a recruitment conversation.

The chain enforced everywhere is:
    Authenticated User → Application → Offer → Company → Responsible HR
IDs sent by the frontend are never trusted; relationships are re-resolved
from the database against the authenticated user.
"""
import uuid
from dataclasses import dataclass

from app.models import Application, Offer, User

# Chat becomes available once the candidate moves past initial review into a
# post-review recruitment stage. Uses the existing Application.status values —
# no duplicate status system.
#   applied / under_review -> no recruitment chat
#   shortlisted / assessment_* / interview / accepted -> chat enabled
#   rejected -> chat unavailable (final state; there is no "withdrawn" status
#   in this codebase, rejected covers final-state lockout)
CHAT_ENABLED_STATUSES = frozenset(
    {
        "shortlisted",
        "assessment_required",
        "assessment_completed",
        "interview",
        "accepted",
    }
)

CHAT_DISABLED_STATUSES = frozenset({"applied", "under_review", "rejected"})


def is_chat_enabled_for_status(status: str | None) -> bool:
    """Stage-based gate. Unknown statuses default to closed (fail-safe)."""
    return (status or "") in CHAT_ENABLED_STATUSES


def resolve_responsible_hr_id(offer: Offer) -> uuid.UUID | None:
    """Responsible HR for an offer.

    `responsible_hr_id` is authoritative when set; otherwise fall back to the
    creator (`created_by`, then legacy `recruiter_id`) so offers created before
    this feature keep a well-defined recruiter. Do NOT assume created_by is
    always the responsible HR once the field is explicitly assigned.
    """
    return offer.responsible_hr_id or offer.created_by or offer.recruiter_id


@dataclass(frozen=True)
class RecruitmentChatDecision:
    allowed: bool
    reason: str
    peer_id: uuid.UUID | None = None  # the other participant, when allowed
    chat_enabled: bool = False


def can_access_recruitment_chat(
    user: User,
    application: Application,
    offer: Offer,
) -> RecruitmentChatDecision:
    """Backend authorization for one recruitment conversation.

    Nobody else is a participant: the company itself is not, other HR
    employees are not, platform admins are not.
    """
    chat_enabled = is_chat_enabled_for_status(application.status)

    user_role = user.role.value if hasattr(user.role, "value") else str(user.role)

    # Candidate side: must be the candidate attached to the application.
    if user_role == "CANDIDATE":
        if application.candidate_id != user.id:
            return RecruitmentChatDecision(False, "not_application_candidate")
        if not chat_enabled:
            return RecruitmentChatDecision(False, "chat_not_enabled", chat_enabled=False)
        peer_id = resolve_responsible_hr_id(offer)
        if peer_id is None:
            return RecruitmentChatDecision(False, "no_responsible_hr")
        return RecruitmentChatDecision(True, "candidate", peer_id=peer_id, chat_enabled=True)

    # HR side: must be the responsible HR attached to the offer, still a
    # member of the same company, with recruitment permission.
    if user_role == "COMPANY_USER":
        responsible_hr_id = resolve_responsible_hr_id(offer)
        if responsible_hr_id is None or user.id != responsible_hr_id:
            return RecruitmentChatDecision(False, "not_responsible_hr")
        # Company isolation: a removed employee (company_id nulled) or a
        # member moved to another company loses access immediately.
        if not user.company_id or (offer.company_id and user.company_id != offer.company_id):
            return RecruitmentChatDecision(False, "company_mismatch")
        if application.company_id and user.company_id != application.company_id:
            return RecruitmentChatDecision(False, "company_mismatch")
        from app.core.permissions import can  # local import: avoid cycle

        if not can(user.company_role, "view_applications"):
            return RecruitmentChatDecision(False, "missing_permission")
        if not chat_enabled:
            return RecruitmentChatDecision(False, "chat_not_enabled", chat_enabled=False)
        return RecruitmentChatDecision(
            True, "responsible_hr", peer_id=application.candidate_id, chat_enabled=True
        )

    return RecruitmentChatDecision(False, "forbidden_role")
