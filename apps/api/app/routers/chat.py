import asyncio
import json
import time
import uuid
from collections import deque
from typing import Annotated
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.database import get_db
from app.dependencies import get_current_access_payload, get_current_user, require_candidate_account
from app.models import (
    Application,
    CandidateProfile,
    ChatMessage,
    Company,
    Friendship,
    Offer,
    User,
    UserRole,
)
from app.schemas import (
    ChatMessageCreate,
    ChatMessageOut,
    ConversationInboxOut,
    ConversationSummaryOut,
    FriendChatContext,
    FriendOut,
    RecruitmentChatContext,
    RecruitmentMessageCreate,
    RecruitmentMessagesReadOut,
    RecruitmentPeer,
    UserOut,
)
from app.services.recruitment_chat import (
    can_access_recruitment_chat,
    get_or_create_recruitment_conversation,
    is_chat_enabled_for_status,
    resolve_responsible_hr_id,
)
from app.services.chat_history import (
    DEFAULT_MESSAGE_PAGE_SIZE,
    MAX_MESSAGE_PAGE_SIZE,
    MessagePage,
    fetch_direct_message_page,
    fetch_recruitment_message_page,
)
from app.services.chat_realtime import chat_broker
from app.services.authentication import (
    AuthenticationRejected,
    AuthenticationStoreUnavailable,
    ensure_access_session_active,
    ensure_account_can_authenticate,
)
from app.services.socket_tickets import (
    SOCKET_TICKET_TTL_SECONDS,
    consume_socket_ticket,
    create_socket_ticket,
)
from app.services.notifications import create_notification
from app.services.friendships import (
    are_accepted_friends,
    canonical_pair,
    get_relationship,
    involving_user,
    other_user_id,
    relationship_state,
)
from app.services.presence import (
    is_online,
    remove_presence,
    safe_last_seen,
    touch_presence,
)

router = APIRouter()


@router.post("/send", response_model=ChatMessageOut)
async def send_message(
    data: ChatMessageCreate,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatMessageOut:
    if data.receiver_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot message yourself")
    recv_user = (
        await db.execute(
            select(User).where(
                User.id == data.receiver_id,
                User.role == UserRole.CANDIDATE,
                User.company_id.is_(None),
                User.is_active.is_(True),
                User.is_approved.is_(True),
            )
        )
    ).scalar_one_or_none()
    if recv_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receiver not found")
    # Lock the relationship through the message commit so an unfriend/block
    # cannot race this authorization check and permit a post-revocation send.
    relationship = await get_relationship(
        db, current_user.id, recv_user.id, for_update=True
    )
    if relationship is None or relationship.status != "ACCEPTED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Direct messages require an accepted friendship",
        )
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Message cannot be empty")
    msg = ChatMessage(
        sender_id=current_user.id,
        receiver_id=recv_user.id,
        content=content,
    )
    db.add(msg)
    await db.flush()
    await create_notification(
        db,
        user_id=recv_user.id,
        category="message",
        title="New friend message",
        body=f"{current_user.full_name} sent you a message.",
        action_url=f"/chat/{current_user.id}",
        resource_type="chat_message",
        resource_id=msg.id,
        dedupe_key=f"chat-message:{msg.id}",
    )
    await db.commit()
    await db.refresh(msg)
    out = _message_out(msg, current_user)
    await _broadcast_friend_message(current_user.id, recv_user.id, out)
    return out


@router.get("/with/{user_id}", response_model=FriendChatContext)
async def get_conversation(
    user_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
    before: str | None = Query(default=None, max_length=256),
    limit: int = Query(default=DEFAULT_MESSAGE_PAGE_SIZE, ge=1, le=MAX_MESSAGE_PAGE_SIZE),
) -> FriendChatContext:
    # Direct/general thread ONLY. Recruitment messages (application_id NOT NULL)
    # must never leak here, otherwise the same peer appears twice in the inbox
    # (once as recruitment, once as direct) with the same preview.
    peer = (
        await db.execute(
            select(User).where(
                User.id == user_id,
                User.role == UserRole.CANDIDATE,
                User.company_id.is_(None),
                User.is_active.is_(True),
                User.is_approved.is_(True),
            )
        )
    ).scalar_one_or_none()
    if peer is None or peer.id == current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    relationship = await get_relationship(db, current_user.id, peer.id)
    accepted = bool(relationship and relationship.status == "ACCEPTED")
    history_exists = bool(
        (
            await db.execute(
                select(ChatMessage.id)
                .where(
                    ChatMessage.application_id.is_(None),
                    or_(
                        and_(
                            ChatMessage.sender_id == current_user.id,
                            ChatMessage.receiver_id == peer.id,
                        ),
                        and_(
                            ChatMessage.sender_id == peer.id,
                            ChatMessage.receiver_id == current_user.id,
                        ),
                    ),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
    )
    if not accepted and not history_exists:
        raise HTTPException(status_code=403, detail="Friend conversation unavailable")
    try:
        page = await fetch_direct_message_page(
            db,
            current_user.id,
            user_id,
            before=before,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    profile = (
        await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == peer.id)
        )
    ).scalar_one_or_none()
    online = await is_online(peer.id)
    return FriendChatContext(
        peer=FriendOut(
            id=peer.id,
            full_name=peer.full_name,
            avatar_url=peer.avatar_url,
            headline=profile.headline if profile else None,
            skills=profile.skills if profile else None,
            bio=profile.bio if profile else None,
            relationship_state=relationship_state(relationship, current_user.id),
            is_online=online,
            online=online,
            last_seen=safe_last_seen(peer.last_seen),
        ),
        relationship_state=relationship_state(relationship, current_user.id),
        can_message=accepted,
        messages=await _messages_out(db, page.messages),
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get("/conversations", response_model=dict[str, list[dict]])
async def list_conversations(
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    relationships = list(
        (
            await db.execute(
                select(Friendship).where(
                    involving_user(current_user.id), Friendship.status == "ACCEPTED"
                )
            )
        ).scalars()
    )
    partners: list[dict] = []
    for relationship in relationships:
        peer_id = other_user_id(relationship, current_user.id)
        peer = (
            await db.execute(
                select(User).where(
                    User.id == peer_id,
                    User.role == UserRole.CANDIDATE,
                    User.is_active.is_(True),
                    User.is_approved.is_(True),
                )
            )
        ).scalar_one_or_none()
        if peer is None:
            continue
        last = (
            await db.execute(
                select(ChatMessage)
                .where(
                    ChatMessage.application_id.is_(None),
                    or_(
                        and_(ChatMessage.sender_id == current_user.id, ChatMessage.receiver_id == peer.id),
                        and_(ChatMessage.sender_id == peer.id, ChatMessage.receiver_id == current_user.id),
                    ),
                )
                .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        unread = int(
            (
                await db.execute(
                    select(func.count(ChatMessage.id)).where(
                        ChatMessage.application_id.is_(None),
                        ChatMessage.sender_id == peer.id,
                        ChatMessage.receiver_id == current_user.id,
                        ChatMessage.read_at.is_(None),
                    )
                )
            ).scalar_one()
        )
        partners.append(
            {
                "conversation_type": "FRIEND",
                "user": UserOut.model_validate(peer).model_dump(),
                "last_message": last.content if last else "",
                "last_at": last.created_at.isoformat() if last else None,
                "unread_count": unread,
            }
        )
    partners.sort(key=lambda item: item["last_at"] or "", reverse=True)
    return {"conversations": partners}


# ---------------------------------------------------------------------------
# Recruitment chat: Candidate ↔ Responsible HR for one accepted application.
# The application is the source of truth; sender/receiver are derived
# server-side from (application → offer → responsible HR), never from client
# IDs — so ID manipulation (application_id/offer_id/hr_id/candidate_id) cannot
# grant access. One application maps to exactly one logical conversation, so
# retries/double-accepts cannot create duplicates (idempotent by construction).
# ---------------------------------------------------------------------------

async def _load_recruitment_context(
    db: AsyncSession, application_id: UUID
) -> tuple[Application, Offer, Company | None]:
    app = (
        await db.execute(select(Application).where(Application.id == application_id))
    ).scalar_one_or_none()
    if app is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    offer = (
        await db.execute(select(Offer).where(Offer.id == app.opportunity_id))
    ).scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    company = None
    company_id = offer.company_id or app.company_id
    if company_id:
        company = (
            await db.execute(select(Company).where(Company.id == company_id))
        ).scalar_one_or_none()
    return app, offer, company


def _peer_out(user: User | None) -> RecruitmentPeer | None:
    if user is None:
        return None
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return RecruitmentPeer(
        id=user.id,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        role=role,
        company_role=user.company_role,
    )


def _message_out(msg: ChatMessage, sender: User | None) -> ChatMessageOut:
    return ChatMessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        receiver_id=msg.receiver_id,
        content=msg.content,
        created_at=msg.created_at,
        read_at=msg.read_at,
        sender=UserOut.model_validate(sender) if sender else None,
        application_id=msg.application_id,
    )


async def _messages_out(
    db: AsyncSession,
    messages: list[ChatMessage],
) -> list[ChatMessageOut]:
    """Serialize a message page with one bounded sender lookup (no N+1)."""
    sender_ids = {message.sender_id for message in messages}
    senders: dict[UUID, User] = {}
    if sender_ids:
        result = await db.execute(select(User).where(User.id.in_(sender_ids)))
        senders = {user.id: user for user in result.scalars().all()}
    return [_message_out(message, senders.get(message.sender_id)) for message in messages]


async def _message_page_out(db: AsyncSession, page: MessagePage) -> dict:
    return {
        "messages": [
            message.model_dump(mode="json")
            for message in await _messages_out(db, page.messages)
        ],
        "next_cursor": page.next_cursor,
        "has_more": page.has_more,
    }


async def _recruitment_messages(
    db: AsyncSession,
    application_id: UUID,
    limit: int = DEFAULT_MESSAGE_PAGE_SIZE,
) -> list[ChatMessageOut]:
    page = await fetch_recruitment_message_page(db, application_id, limit=limit)
    return await _messages_out(db, page.messages)


async def _check_recruitment_viewer(
    db: AsyncSession,
    current_user: User,
    application_id: UUID,
) -> tuple[Application, Offer, Company | None, UUID]:
    """Authorize viewing the recruitment context.

    Candidate-of-application and responsible-HR (same company, permitted) may
    view context at any stage so the UI can explain availability; messages are
    only included once chat is enabled. Everyone else is rejected — 404 for
    cross-candidate probing (no existence leak), 403 for wrong-HR/admins.
    Returns (application, offer, company, peer_id).
    """
    app, offer, company = await _load_recruitment_context(db, application_id)
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if role == "CANDIDATE":
        if app.candidate_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
        peer_id = resolve_responsible_hr_id(offer)
        if peer_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
        return app, offer, company, peer_id
    if role == "COMPANY_USER":
        responsible_hr_id = resolve_responsible_hr_id(offer)
        if responsible_hr_id is None or current_user.id != responsible_hr_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the responsible HR can access this recruitment chat")
        if not current_user.company_id or (
            offer.company_id and current_user.company_id != offer.company_id
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company membership required")
        if app.company_id and current_user.company_id != app.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company membership required")
        from app.core.permissions import can

        if not can(current_user.company_role, "view_applications"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return app, offer, company, app.candidate_id
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


async def _build_recruitment_context(
    db: AsyncSession,
    app: Application,
    offer: Offer,
    company: Company | None,
    peer_id: UUID,
) -> RecruitmentChatContext:
    peer = (await db.execute(select(User).where(User.id == peer_id))).scalar_one_or_none()
    enabled = is_chat_enabled_for_status(app.status)
    messages = await _recruitment_messages(db, app.id) if enabled else []
    return RecruitmentChatContext(
        application_id=app.id,
        status=app.status,
        chat_enabled=enabled,
        offer_id=offer.id,
        offer_title=offer.title,
        company_id=company.id if company else (offer.company_id or app.company_id),
        company_name=company.name if company else offer.company,
        company_logo_url=company.logo_url if company else None,
        peer=_peer_out(peer),
        messages=messages,
    )


@router.get("/recruitment", response_model=dict)
async def list_recruitment_chats(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """List my recruitment conversations (enabled chats only).

    Candidate: one entry per accepted application (per offer — multiple
    applications stay separate, never merged). HR: one entry per application
    they are responsible for.

    Exactly ONE entry per application_id: results are de-duplicated by
    application_id so retries / double stage updates can never produce a
    second inbox row. Stage changes update the existing entry's metadata
    (status/last message), never append a new entry.
    """
    role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    items: list[dict] = []
    if role == "CANDIDATE":
        apps = (
            await db.execute(
                select(Application)
                .where(Application.candidate_id == current_user.id)
                .order_by(Application.created_at.desc())
            )
        ).scalars().all()
    elif role == "COMPANY_USER":
        if not current_user.company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company membership required")
        from app.core.permissions import can

        if not can(current_user.company_role, "view_applications"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        apps = (
            await db.execute(
                select(Application)
                .join(Offer, Application.opportunity_id == Offer.id)
                .where(Offer.company_id == current_user.company_id)
                .order_by(Application.created_at.desc())
            )
        ).scalars().all()
        # Only applications this user is responsible for.
        kept = []
        for a in apps:
            offer = (
                await db.execute(select(Offer).where(Offer.id == a.opportunity_id))
            ).scalar_one_or_none()
            if offer is not None and resolve_responsible_hr_id(offer) == current_user.id:
                kept.append(a)
        apps = kept
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    for a in apps:
        if not is_chat_enabled_for_status(a.status):
            continue
        # Canonical guard: exactly one inbox entry per application_id, even if
        # the upstream query ever returned the same application twice (join
        # fan-out, retry, race). First occurrence wins; metadata is refreshed
        # from the application row on every call.
        app_key = str(a.id)
        if any(e["application_id"] == app_key for e in items):
            continue
        offer = (
            await db.execute(select(Offer).where(Offer.id == a.opportunity_id))
        ).scalar_one_or_none()
        if offer is None:
            continue
        peer_id = (
            resolve_responsible_hr_id(offer)
            if role == "CANDIDATE"
            else a.candidate_id
        )
        if role == "CANDIDATE" and peer_id is None:
            continue
        if role == "COMPANY_USER" and resolve_responsible_hr_id(offer) != current_user.id:
            continue
        peer = (
            (await db.execute(select(User).where(User.id == peer_id))).scalar_one_or_none()
            if peer_id
            else None
        )
        last = (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.application_id == a.id)
                .order_by(ChatMessage.created_at.desc())
                .limit(1)
            )
        ).scalars().first()
        unread_count = int(
            (
                await db.execute(
                    select(func.count(ChatMessage.id)).where(
                        ChatMessage.application_id == a.id,
                        ChatMessage.receiver_id == current_user.id,
                        ChatMessage.read_at.is_(None),
                    )
                )
            ).scalar_one()
        )
        company = None
        company_id = offer.company_id or a.company_id
        if company_id:
            company = (
                await db.execute(select(Company).where(Company.id == company_id))
            ).scalar_one_or_none()
        items.append(
            {
                "conversation_type": "RECRUITMENT",
                "application_id": str(a.id),
                "status": a.status,
                "chat_enabled": True,
                "offer_id": str(offer.id),
                "offer_title": offer.title,
                "company_id": str(company.id) if company else (str(offer.company_id) if offer.company_id else None),
                "company_name": company.name if company else offer.company,
                "company_logo_url": company.logo_url if company else None,
                "peer": _peer_out(peer).model_dump() if _peer_out(peer) else None,
                "last_message": last.content if last else None,
                "last_at": last.created_at.isoformat() if last else None,
                "unread_count": unread_count,
            }
        )
    return {"recruitment_chats": items}


@router.get("/inbox", response_model=ConversationInboxOut)
async def combined_inbox(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConversationInboxOut:
    """Return friend and recruitment conversations with server-owned types."""
    role = current_user.role.value
    conversations: list[ConversationSummaryOut] = []
    if role == "CANDIDATE":
        direct = await list_conversations(current_user, db)
        for item in direct["conversations"]:
            user = item["user"]
            peer_id = UUID(str(user["id"]))
            online = await is_online(peer_id)
            conversations.append(
                ConversationSummaryOut(
                    conversation_type="FRIEND",
                    conversation_id=f"friend:{peer_id}",
                    href=f"/chat/{peer_id}",
                    peer=FriendOut(
                        id=peer_id,
                        full_name=user["full_name"],
                        avatar_url=user.get("avatar_url"),
                        relationship_state="ACCEPTED",
                        is_online=online,
                        online=online,
                    ),
                    badge="Friend",
                    context="Friend conversation",
                    detail="Direct message",
                    last_message=item.get("last_message") or None,
                    last_at=(
                        datetime.fromisoformat(item["last_at"])
                        if item.get("last_at")
                        else None
                    ),
                    unread_count=int(item.get("unread_count") or 0),
                )
            )

    recruitment = await list_recruitment_chats(current_user, db)
    for item in recruitment["recruitment_chats"]:
        peer_data = item.get("peer")
        peer = RecruitmentPeer.model_validate(peer_data) if peer_data else None
        conversations.append(
            ConversationSummaryOut(
                conversation_type="RECRUITMENT",
                conversation_id=f"recruitment:{item['application_id']}",
                href=f"/chat/recruitment/{item['application_id']}",
                peer=peer,
                badge="Recruiter" if role == "CANDIDATE" else "Candidate",
                context=item["offer_title"],
                detail=item.get("company_name") or "Recruitment conversation",
                status=item.get("status"),
                last_message=item.get("last_message"),
                last_at=(
                    datetime.fromisoformat(item["last_at"])
                    if item.get("last_at")
                    else None
                ),
                unread_count=int(item.get("unread_count") or 0),
                can_message=bool(item.get("chat_enabled")),
            )
        )
    conversations.sort(
        key=lambda item: item.last_at or datetime.min,
        reverse=True,
    )
    return ConversationInboxOut(conversations=conversations)


@router.get("/recruitment/{application_id}", response_model=RecruitmentChatContext)
async def get_recruitment_chat(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecruitmentChatContext:
    app, offer, company, peer_id = await _check_recruitment_viewer(db, current_user, application_id)
    return await _build_recruitment_context(db, app, offer, company, peer_id)


@router.get("/recruitment/{application_id}/messages", response_model=dict)
async def get_recruitment_messages(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    before: str | None = Query(default=None, max_length=256),
    limit: int = Query(default=DEFAULT_MESSAGE_PAGE_SIZE, ge=1, le=MAX_MESSAGE_PAGE_SIZE),
) -> dict:
    """Return one authorized, stable page of recruitment-chat history."""
    app, offer, _, _ = await _check_recruitment_viewer(db, current_user, application_id)
    decision = can_access_recruitment_chat(current_user, app, offer)
    if not decision.allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruitment chat is not available for this application",
        )
    try:
        page = await fetch_recruitment_message_page(
            db,
            app.id,
            before=before,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return await _message_page_out(db, page)


@router.post("/recruitment/{application_id}", response_model=ChatMessageOut)
async def send_recruitment_message(
    application_id: UUID,
    data: RecruitmentMessageCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatMessageOut:
    """Send a message in the recruitment conversation.

    Receiver is derived server-side (candidate → responsible HR, HR →
    candidate). Any client-supplied peer IDs are ignored by design.
    The conversation is resolved idempotently via
    get_or_create_recruitment_conversation: repeated calls and concurrent
    requests reuse the same application_id, never a second conversation.
    """
    app = await get_or_create_recruitment_conversation(db, application_id)
    offer = (
        await db.execute(select(Offer).where(Offer.id == app.opportunity_id))
    ).scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    decision = can_access_recruitment_chat(current_user, app, offer)
    if not decision.allowed or decision.peer_id is None:
        if decision.reason in ("not_application_candidate",):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruitment chat is not available for this application",
        )
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty message")
    peer = (
        await db.execute(select(User).where(User.id == decision.peer_id))
    ).scalar_one_or_none()
    if peer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    msg = ChatMessage(
        sender_id=current_user.id,
        receiver_id=peer.id,
        application_id=app.id,
        content=content,
    )
    db.add(msg)
    await db.flush()
    await create_notification(
        db,
        user_id=peer.id,
        category="message",
        title="New recruitment message",
        body=f"{current_user.full_name} sent a message about {offer.title}.",
        action_url=(
            "/company/messages"
            if peer.role.value == "COMPANY_USER"
            else "/chat"
        ),
        resource_type="application",
        resource_id=app.id,
        dedupe_key=f"recruitment-message:{msg.id}",
    )
    await db.commit()
    await db.refresh(msg)
    out = _message_out(msg, current_user)
    await _broadcast_recruitment_message(str(app.id), out)
    return out


# ---------------------------------------------------------------------------
# Realtime recruitment chat.
#
# Local sockets are fanned out immediately and every event is also published
# to Redis. Each local socket has one Redis subscription that ignores events
# from this API process, so messages and read receipts reach sockets attached
# to other API workers without duplicate local delivery.
# ---------------------------------------------------------------------------

WS_SEND_TIMEOUT_SECONDS = 2.0
WS_HEARTBEAT_INTERVAL_SECONDS = 20.0
WS_HEARTBEAT_TIMEOUT_SECONDS = 60.0
WS_RATE_WINDOW_SECONDS = 10.0
WS_RATE_MAX_EVENTS = 30
WS_MAX_FRAME_BYTES = 4096
WS_MAX_CONNECTIONS_PER_USER_ROOM = 3

_recruitment_rooms: dict[str, set[WebSocket]] = {}
_socket_users: dict[WebSocket, UUID] = {}
_socket_sessions: dict[WebSocket, UUID] = {}
_socket_expirations: dict[WebSocket, float] = {}
_socket_send_locks: dict[WebSocket, asyncio.Lock] = {}
_socket_last_pong: dict[WebSocket, float] = {}
_socket_rate_windows: dict[WebSocket, deque[float]] = {}


def _remove_socket(application_id: str, websocket: WebSocket) -> None:
    room = _recruitment_rooms.get(application_id)
    if room is not None:
        room.discard(websocket)
        if not room:
            _recruitment_rooms.pop(application_id, None)
    _socket_users.pop(websocket, None)
    _socket_sessions.pop(websocket, None)
    _socket_expirations.pop(websocket, None)
    _socket_send_locks.pop(websocket, None)
    _socket_last_pong.pop(websocket, None)
    _socket_rate_windows.pop(websocket, None)


async def _close_socket(
    application_id: str,
    websocket: WebSocket,
    *,
    code: int,
) -> None:
    _remove_socket(application_id, websocket)
    try:
        await websocket.close(code=code)
    except Exception:
        pass


async def _send_socket_json(websocket: WebSocket, payload: dict) -> bool:
    """Bound outbound work so one slow client cannot block a room."""
    lock = _socket_send_locks.setdefault(websocket, asyncio.Lock())
    try:
        async with lock:
            await asyncio.wait_for(
                websocket.send_json(payload),
                timeout=WS_SEND_TIMEOUT_SECONDS,
            )
        return True
    except Exception:
        return False


async def _socket_is_authorized(websocket: WebSocket, application_id: str) -> bool:
    """Re-authorize a recipient before each delivery using a fresh DB session."""
    user_id = _socket_users.get(websocket)
    # Unit-test sockets that are inserted directly into the local room have no
    # identity metadata. Production sockets are always registered below.
    if user_id is None:
        return True
    if _socket_expirations.get(websocket, 0) <= time.time():
        return False
    session_id = _socket_sessions.get(websocket)
    if session_id is None:
        return False
    try:
        await ensure_access_session_active({"sid": str(session_id)})
    except (AuthenticationRejected, AuthenticationStoreUnavailable):
        return False

    from app.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            user = (
                await db.execute(select(User).where(User.id == user_id))
            ).scalar_one_or_none()
            app = (
                await db.execute(select(Application).where(Application.id == UUID(application_id)))
            ).scalar_one_or_none()
            if user is None or app is None:
                return False
            ensure_account_can_authenticate(user)
            offer = (
                await db.execute(select(Offer).where(Offer.id == app.opportunity_id))
            ).scalar_one_or_none()
            if offer is None:
                return False
            return can_access_recruitment_chat(user, app, offer).allowed
    except Exception:
        # Delivery authorization fails closed; persisted history remains
        # available once dependencies recover.
        return False


async def _deliver_local_event(
    application_id: str,
    websocket: WebSocket,
    payload: dict,
) -> None:
    if not await _socket_is_authorized(websocket, application_id):
        await _close_socket(application_id, websocket, code=4403)
        return
    if not await _send_socket_json(websocket, payload):
        await _close_socket(application_id, websocket, code=1011)


async def _broadcast_recruitment_event(
    application_id: str,
    payload: dict,
    *,
    exclude: WebSocket | None = None,
    publish: bool = True,
) -> None:
    room = _recruitment_rooms.get(application_id, set())
    deliveries = [
        _deliver_local_event(application_id, websocket, payload)
        for websocket in list(room)
        if websocket is not exclude
    ]
    if deliveries:
        await asyncio.gather(*deliveries)
    if publish:
        # The database write remains authoritative if Redis is reconnecting;
        # polling/cursor history still recovers the persisted event.
        await chat_broker.publish(application_id, payload)


async def _relay_remote_events(application_id: str, websocket: WebSocket) -> None:
    async for payload in chat_broker.remote_events(application_id):
        if websocket not in _recruitment_rooms.get(application_id, set()):
            return
        if not await _socket_is_authorized(websocket, application_id):
            await _close_socket(application_id, websocket, code=4403)
            return
        if not await _send_socket_json(websocket, payload):
            await _close_socket(application_id, websocket, code=1011)
            return


async def _heartbeat_socket(application_id: str, websocket: WebSocket) -> None:
    while websocket in _recruitment_rooms.get(application_id, set()):
        await asyncio.sleep(WS_HEARTBEAT_INTERVAL_SECONDS)
        if time.monotonic() - _socket_last_pong.get(websocket, 0) > WS_HEARTBEAT_TIMEOUT_SECONDS:
            await _close_socket(application_id, websocket, code=4408)
            return
        if not await _socket_is_authorized(websocket, application_id):
            await _close_socket(application_id, websocket, code=4403)
            return
        if not await _send_socket_json(
            websocket,
            {"type": "ping", "sent_at": datetime.utcnow().isoformat()},
        ):
            await _close_socket(application_id, websocket, code=1011)
            return


def _consume_socket_rate_limit(websocket: WebSocket) -> bool:
    now = time.monotonic()
    window = _socket_rate_windows.setdefault(websocket, deque())
    while window and now - window[0] >= WS_RATE_WINDOW_SECONDS:
        window.popleft()
    if len(window) >= WS_RATE_MAX_EVENTS:
        return False
    window.append(now)
    return True


async def _broadcast_recruitment_message(application_id: str, message: ChatMessageOut) -> None:
    await _broadcast_recruitment_event(
        application_id,
        {"type": "message", "message": message.model_dump(mode="json")},
    )


async def _mark_recruitment_messages_read(
    db: AsyncSession,
    application_id: UUID,
    reader_id: UUID,
) -> RecruitmentMessagesReadOut:
    """Atomically mark only the authenticated participant's incoming messages read."""
    read_at = datetime.utcnow()
    result = await db.execute(
        update(ChatMessage)
        .where(
            ChatMessage.application_id == application_id,
            ChatMessage.receiver_id == reader_id,
            ChatMessage.sender_id != reader_id,
            ChatMessage.read_at.is_(None),
        )
        .values(read_at=read_at)
        .returning(ChatMessage.id)
    )
    message_ids = list(result.scalars().all())
    if not message_ids:
        return RecruitmentMessagesReadOut(message_ids=[], read_at=None)
    await db.commit()
    receipt = RecruitmentMessagesReadOut(message_ids=message_ids, read_at=read_at)
    await _broadcast_recruitment_event(
        str(application_id),
        {
            "type": "messages_read",
            "message_ids": [str(message_id) for message_id in message_ids],
            "reader_id": str(reader_id),
            "read_at": read_at.isoformat(),
        },
    )
    return receipt


@router.post(
    "/recruitment/{application_id}/read",
    response_model=RecruitmentMessagesReadOut,
)
async def mark_recruitment_messages_read(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecruitmentMessagesReadOut:
    app, offer, _, _ = await _check_recruitment_viewer(db, current_user, application_id)
    decision = can_access_recruitment_chat(current_user, app, offer)
    if not decision.allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruitment chat is not available for this application",
        )
    return await _mark_recruitment_messages_read(db, app.id, current_user.id)


@router.post("/recruitment/{application_id}/socket-ticket", response_model=dict)
async def create_recruitment_socket_ticket(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    access_payload: Annotated[dict, Depends(get_current_access_payload)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Exchange an access session for a short-lived, single-use WS ticket."""
    app, offer, _, _ = await _check_recruitment_viewer(db, current_user, application_id)
    if not can_access_recruitment_chat(current_user, app, offer).allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruitment chat is not available for this application",
        )
    try:
        ticket = await create_socket_ticket(
            user_id=current_user.id,
            application_id=app.id,
            session_id=str(access_payload["sid"]),
            expires_at=int(access_payload["exp"]),
        )
    except AuthenticationStoreUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Realtime authentication is temporarily unavailable",
        ) from exc
    except (AuthenticationRejected, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        ) from exc
    return {"ticket": ticket, "expires_in_seconds": SOCKET_TICKET_TTL_SECONDS}


@router.websocket("/recruitment/{application_id}/ws")
async def recruitment_chat_ws(
    websocket: WebSocket,
    application_id: UUID,
    ticket: str | None = Query(default=None, max_length=200),
) -> None:
    await websocket.accept()
    if not ticket:
        await websocket.close(code=4401)
        return
    try:
        socket_ticket = await consume_socket_ticket(ticket, application_id=application_id)
    except AuthenticationStoreUnavailable:
        await websocket.close(code=1013)
        return
    except AuthenticationRejected:
        await websocket.close(code=4401)
        return
    user_id = socket_ticket.user_id
    token_expiry = float(socket_ticket.expires_at)
    session_id = socket_ticket.session_id

    from app.database import AsyncSessionLocal

    room = str(application_id)
    async with AsyncSessionLocal() as db:
        user = (
            await db.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
        if user is None:
            await websocket.close(code=4401)
            return
        try:
            ensure_account_can_authenticate(user)
        except AuthenticationRejected:
            await websocket.close(code=4401)
            return
        try:
            app, offer, _, peer_id = await _check_recruitment_viewer(db, user, application_id)
        except HTTPException as exc:
            await websocket.close(code=4404 if exc.status_code == 404 else 4403)
            return
        decision = can_access_recruitment_chat(user, app, offer)
        room = str(app.id)
        peer = (
            await db.execute(select(User).where(User.id == peer_id))
        ).scalar_one_or_none()
        ready_payload = {
            "type": "ready",
            "chat_enabled": decision.allowed,
            "peer": _peer_out(peer).model_dump(mode="json") if _peer_out(peer) else None,
        }
    # The initial session is closed before the long-lived receive loop. Every
    # event and delivery below obtains a fresh, short-lived session.

    active_for_user = sum(
        1
        for socket in _recruitment_rooms.get(room, set())
        if _socket_users.get(socket) == user_id
    )
    if active_for_user >= WS_MAX_CONNECTIONS_PER_USER_ROOM:
        await websocket.close(code=4429)
        return

    _recruitment_rooms.setdefault(room, set()).add(websocket)
    _socket_users[websocket] = user_id
    _socket_sessions[websocket] = session_id
    _socket_expirations[websocket] = token_expiry
    _socket_last_pong[websocket] = time.monotonic()
    _socket_rate_windows[websocket] = deque()

    remote_task = asyncio.create_task(_relay_remote_events(room, websocket))
    heartbeat_task = asyncio.create_task(_heartbeat_socket(room, websocket))
    try:
        if not await _send_socket_json(websocket, ready_payload):
            return
        while True:
            try:
                incoming = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except (RuntimeError, ValueError, json.JSONDecodeError):
                if not await _send_socket_json(
                    websocket,
                    {"type": "error", "detail": "Invalid realtime event"},
                ):
                    break
                continue
            if not isinstance(incoming, dict):
                if not await _send_socket_json(
                    websocket,
                    {"type": "error", "detail": "Invalid realtime event"},
                ):
                    break
                continue
            try:
                frame_size = len(json.dumps(incoming, separators=(",", ":")).encode("utf-8"))
            except (TypeError, ValueError):
                frame_size = WS_MAX_FRAME_BYTES + 1
            if frame_size > WS_MAX_FRAME_BYTES:
                await _close_socket(room, websocket, code=4409)
                break

            event_type = str(incoming.get("type") or "message_send")
            if event_type == "pong":
                _socket_last_pong[websocket] = time.monotonic()
                continue
            if event_type not in {"message_send", "messages_read"}:
                if not await _send_socket_json(
                    websocket,
                    {"type": "error", "detail": "Unsupported realtime event"},
                ):
                    break
                continue
            if not _consume_socket_rate_limit(websocket):
                await _send_socket_json(
                    websocket,
                    {"type": "error", "detail": "Realtime rate limit exceeded"},
                )
                await _close_socket(room, websocket, code=4429)
                break
            if _socket_expirations.get(websocket, 0) <= time.time():
                await _close_socket(room, websocket, code=4401)
                break
            if not await _socket_is_authorized(websocket, room):
                await _close_socket(room, websocket, code=4403)
                break

            async with AsyncSessionLocal() as event_db:
                # Re-resolve the user, application, offer, company membership,
                # permission, stage, and peer for every event. Reassignment or
                # removal therefore takes effect without waiting for reconnect.
                live_user = (
                    await event_db.execute(select(User).where(User.id == user_id))
                ).scalar_one_or_none()
                app_fresh = (
                    await event_db.execute(select(Application).where(Application.id == application_id))
                ).scalar_one_or_none()
                if live_user is None or app_fresh is None:
                    await _close_socket(room, websocket, code=4403)
                    break
                offer_fresh = (
                    await event_db.execute(select(Offer).where(Offer.id == app_fresh.opportunity_id))
                ).scalar_one_or_none()
                if offer_fresh is None:
                    await _close_socket(room, websocket, code=4403)
                    break
                live = can_access_recruitment_chat(live_user, app_fresh, offer_fresh)
                if not live.allowed or live.peer_id is None:
                    await _close_socket(room, websocket, code=4403)
                    break

                if event_type == "messages_read":
                    await _mark_recruitment_messages_read(
                        event_db,
                        app_fresh.id,
                        live_user.id,
                    )
                    continue

                raw_content = incoming.get("content")
                if not isinstance(raw_content, str):
                    await _send_socket_json(
                        websocket,
                        {"type": "error", "detail": "Invalid message"},
                    )
                    continue
                content = raw_content.strip()
                if not content or len(content) > 2000:
                    await _send_socket_json(
                        websocket,
                        {"type": "error", "detail": "Message must be 1 to 2000 characters"},
                    )
                    continue
                peer_user = (
                    await event_db.execute(select(User).where(User.id == live.peer_id))
                ).scalar_one_or_none()
                if peer_user is None:
                    await _close_socket(room, websocket, code=4403)
                    break
                msg = ChatMessage(
                    sender_id=live_user.id,
                    receiver_id=peer_user.id,
                    application_id=app_fresh.id,
                    content=content,
                )
                event_db.add(msg)
                await event_db.commit()
                await event_db.refresh(msg)
                out = _message_out(msg, live_user)

            event = {"type": "message", "message": out.model_dump(mode="json")}
            # Confirm once to the sender; fan out locally to the other
            # participant and through Redis to other API processes.
            if not await _send_socket_json(websocket, event):
                break
            await _broadcast_recruitment_event(room, event, exclude=websocket)
    finally:
        remote_task.cancel()
        heartbeat_task.cancel()
        await asyncio.gather(remote_task, heartbeat_task, return_exceptions=True)
        _remove_socket(room, websocket)


# ---------------------------------------------------------------------------
# Realtime friend chat. Friend rooms use the same bounded socket mechanics as
# recruitment rooms but authorize against the canonical friendship row before
# every send and delivery. Redis carries events and revocations across API
# replicas; no database session survives beyond a single check or mutation.
# ---------------------------------------------------------------------------

_friend_rooms: dict[str, set[WebSocket]] = {}
_friend_socket_peers: dict[WebSocket, UUID] = {}
_friend_socket_connections: dict[WebSocket, str] = {}


def _friend_room_key(first: UUID, second: UUID) -> str:
    low, high = canonical_pair(first, second)
    return f"{low}:{high}"


def _remove_friend_socket(room: str, websocket: WebSocket) -> None:
    sockets = _friend_rooms.get(room)
    if sockets is not None:
        sockets.discard(websocket)
        if not sockets:
            _friend_rooms.pop(room, None)
    _friend_socket_peers.pop(websocket, None)
    _friend_socket_connections.pop(websocket, None)
    _socket_users.pop(websocket, None)
    _socket_sessions.pop(websocket, None)
    _socket_expirations.pop(websocket, None)
    _socket_send_locks.pop(websocket, None)
    _socket_last_pong.pop(websocket, None)
    _socket_rate_windows.pop(websocket, None)


async def _close_friend_socket(room: str, websocket: WebSocket, *, code: int) -> None:
    _remove_friend_socket(room, websocket)
    try:
        await websocket.close(code=code)
    except Exception:
        pass


async def _friend_socket_is_authorized(websocket: WebSocket) -> bool:
    user_id = _socket_users.get(websocket)
    peer_id = _friend_socket_peers.get(websocket)
    if user_id is None or peer_id is None:
        return False
    if _socket_expirations.get(websocket, 0) <= time.time():
        return False
    session_id = _socket_sessions.get(websocket)
    if session_id is None:
        return False
    try:
        await ensure_access_session_active({"sid": str(session_id)})
    except (AuthenticationRejected, AuthenticationStoreUnavailable):
        return False
    from app.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            user = (
                await db.execute(select(User).where(User.id == user_id))
            ).scalar_one_or_none()
            peer = (
                await db.execute(select(User).where(User.id == peer_id))
            ).scalar_one_or_none()
            if user is None or peer is None:
                return False
            ensure_account_can_authenticate(user)
            ensure_account_can_authenticate(peer)
            if user.role != UserRole.CANDIDATE or peer.role != UserRole.CANDIDATE:
                return False
            return await are_accepted_friends(db, user_id, peer_id)
    except Exception:
        return False


async def _deliver_friend_event(
    room: str, websocket: WebSocket, payload: dict
) -> None:
    if payload.get("type") == "relationship_revoked":
        await _close_friend_socket(room, websocket, code=4403)
        return
    if not await _friend_socket_is_authorized(websocket):
        await _close_friend_socket(room, websocket, code=4403)
        return
    if not await _send_socket_json(websocket, payload):
        await _close_friend_socket(room, websocket, code=1011)


async def _broadcast_friend_event(
    first: UUID,
    second: UUID,
    payload: dict,
    *,
    exclude: WebSocket | None = None,
    publish: bool = True,
) -> None:
    room = _friend_room_key(first, second)
    deliveries = [
        _deliver_friend_event(room, websocket, payload)
        for websocket in list(_friend_rooms.get(room, set()))
        if websocket is not exclude
    ]
    if deliveries:
        await asyncio.gather(*deliveries)
    if publish:
        await chat_broker.publish_friend(room, payload)


async def _broadcast_friend_message(
    first: UUID, second: UUID, message: ChatMessageOut
) -> None:
    await _broadcast_friend_event(
        first,
        second,
        {"type": "message", "message": message.model_dump(mode="json")},
    )


async def revoke_friend_pair(first: UUID, second: UUID) -> None:
    await _broadcast_friend_event(
        first,
        second,
        {"type": "relationship_revoked"},
    )


async def _relay_friend_events(room: str, websocket: WebSocket) -> None:
    async for payload in chat_broker.remote_friend_events(room):
        if websocket not in _friend_rooms.get(room, set()):
            return
        await _deliver_friend_event(room, websocket, payload)
        if payload.get("type") == "relationship_revoked":
            return


async def _heartbeat_friend_socket(room: str, websocket: WebSocket) -> None:
    while websocket in _friend_rooms.get(room, set()):
        await asyncio.sleep(WS_HEARTBEAT_INTERVAL_SECONDS)
        if time.monotonic() - _socket_last_pong.get(websocket, 0) > WS_HEARTBEAT_TIMEOUT_SECONDS:
            await _close_friend_socket(room, websocket, code=4408)
            return
        if not await _friend_socket_is_authorized(websocket):
            await _close_friend_socket(room, websocket, code=4403)
            return
        user_id = _socket_users.get(websocket)
        connection_id = _friend_socket_connections.get(websocket)
        if user_id is not None and connection_id is not None:
            await touch_presence(user_id, connection_id)
        if not await _send_socket_json(
            websocket, {"type": "ping", "sent_at": datetime.utcnow().isoformat()}
        ):
            await _close_friend_socket(room, websocket, code=1011)
            return


async def _mark_friend_messages_read(
    db: AsyncSession, reader_id: UUID, peer_id: UUID
) -> RecruitmentMessagesReadOut:
    read_at = datetime.utcnow()
    result = await db.execute(
        update(ChatMessage)
        .where(
            ChatMessage.application_id.is_(None),
            ChatMessage.sender_id == peer_id,
            ChatMessage.receiver_id == reader_id,
            ChatMessage.read_at.is_(None),
        )
        .values(read_at=read_at)
        .returning(ChatMessage.id)
    )
    message_ids = list(result.scalars().all())
    if not message_ids:
        return RecruitmentMessagesReadOut(message_ids=[], read_at=None)
    await db.commit()
    receipt = RecruitmentMessagesReadOut(message_ids=message_ids, read_at=read_at)
    await _broadcast_friend_event(
        reader_id,
        peer_id,
        {
            "type": "messages_read",
            "message_ids": [str(message_id) for message_id in message_ids],
            "reader_id": str(reader_id),
            "read_at": read_at.isoformat(),
        },
    )
    return receipt


@router.post("/friends/{peer_id}/read", response_model=RecruitmentMessagesReadOut)
async def mark_friend_messages_read(
    peer_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecruitmentMessagesReadOut:
    if not await are_accepted_friends(db, current_user.id, peer_id):
        raise HTTPException(status_code=403, detail="Friend conversation unavailable")
    return await _mark_friend_messages_read(db, current_user.id, peer_id)


@router.post("/friends/{peer_id}/socket-ticket", response_model=dict)
async def create_friend_socket_ticket(
    peer_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    access_payload: Annotated[dict, Depends(get_current_access_payload)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    peer = (
        await db.execute(
            select(User).where(
                User.id == peer_id,
                User.role == UserRole.CANDIDATE,
                User.is_active.is_(True),
                User.is_approved.is_(True),
            )
        )
    ).scalar_one_or_none()
    if peer is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if not await are_accepted_friends(db, current_user.id, peer.id):
        raise HTTPException(status_code=403, detail="Friend conversation unavailable")
    try:
        ticket = await create_socket_ticket(
            user_id=current_user.id,
            application_id=peer.id,
            session_id=str(access_payload["sid"]),
            expires_at=int(access_payload["exp"]),
            scope="friend",
        )
    except AuthenticationStoreUnavailable as exc:
        raise HTTPException(status_code=503, detail="Realtime authentication is unavailable") from exc
    except (AuthenticationRejected, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials") from exc
    return {"ticket": ticket, "expires_in_seconds": SOCKET_TICKET_TTL_SECONDS}


@router.websocket("/friends/{peer_id}/ws")
async def friend_chat_ws(
    websocket: WebSocket,
    peer_id: UUID,
    ticket: str | None = Query(default=None, max_length=200),
) -> None:
    await websocket.accept()
    if not ticket:
        await websocket.close(code=4401)
        return
    try:
        socket_ticket = await consume_socket_ticket(
            ticket, application_id=peer_id, scope="friend"
        )
    except AuthenticationStoreUnavailable:
        await websocket.close(code=1013)
        return
    except AuthenticationRejected:
        await websocket.close(code=4401)
        return
    user_id = socket_ticket.user_id
    if user_id == peer_id:
        await websocket.close(code=4403)
        return
    room = _friend_room_key(user_id, peer_id)
    connection_id = f"ws:{uuid.uuid4()}"
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        user = (
            await db.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
        peer = (
            await db.execute(select(User).where(User.id == peer_id))
        ).scalar_one_or_none()
        try:
            if user is None or peer is None:
                raise AuthenticationRejected("Missing account")
            ensure_account_can_authenticate(user)
            ensure_account_can_authenticate(peer)
        except AuthenticationRejected:
            await websocket.close(code=4401)
            return
        if user.role != UserRole.CANDIDATE or peer.role != UserRole.CANDIDATE:
            await websocket.close(code=4403)
            return
        if not await are_accepted_friends(db, user_id, peer_id):
            await websocket.close(code=4403)
            return

    active_for_user = sum(
        1
        for socket in _friend_rooms.get(room, set())
        if _socket_users.get(socket) == user_id
    )
    if active_for_user >= WS_MAX_CONNECTIONS_PER_USER_ROOM:
        await websocket.close(code=4429)
        return
    _friend_rooms.setdefault(room, set()).add(websocket)
    _socket_users[websocket] = user_id
    _friend_socket_peers[websocket] = peer_id
    _socket_sessions[websocket] = socket_ticket.session_id
    _socket_expirations[websocket] = float(socket_ticket.expires_at)
    _socket_last_pong[websocket] = time.monotonic()
    _socket_rate_windows[websocket] = deque()
    _friend_socket_connections[websocket] = connection_id
    await touch_presence(user_id, connection_id)

    remote_task = asyncio.create_task(_relay_friend_events(room, websocket))
    heartbeat_task = asyncio.create_task(_heartbeat_friend_socket(room, websocket))
    try:
        if not await _send_socket_json(
            websocket,
            {"type": "ready", "conversation_type": "FRIEND", "peer_id": str(peer_id)},
        ):
            return
        while True:
            try:
                incoming = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except (RuntimeError, ValueError, json.JSONDecodeError):
                if not await _send_socket_json(
                    websocket, {"type": "error", "detail": "Invalid realtime event"}
                ):
                    break
                continue
            if not isinstance(incoming, dict):
                continue
            try:
                frame_size = len(json.dumps(incoming, separators=(",", ":")).encode())
            except (TypeError, ValueError):
                frame_size = WS_MAX_FRAME_BYTES + 1
            if frame_size > WS_MAX_FRAME_BYTES:
                await _close_friend_socket(room, websocket, code=4409)
                break
            event_type = str(incoming.get("type") or "message_send")
            if event_type == "pong":
                _socket_last_pong[websocket] = time.monotonic()
                await touch_presence(user_id, connection_id)
                continue
            if event_type not in {"message_send", "messages_read"}:
                await _send_socket_json(
                    websocket, {"type": "error", "detail": "Unsupported realtime event"}
                )
                continue
            if not _consume_socket_rate_limit(websocket):
                await _close_friend_socket(room, websocket, code=4429)
                break
            if not await _friend_socket_is_authorized(websocket):
                await _close_friend_socket(room, websocket, code=4403)
                break
            async with AsyncSessionLocal() as event_db:
                live_user = (
                    await event_db.execute(select(User).where(User.id == user_id))
                ).scalar_one_or_none()
                peer_user = (
                    await event_db.execute(select(User).where(User.id == peer_id))
                ).scalar_one_or_none()
                relationship = await get_relationship(
                    event_db, user_id, peer_id, for_update=True
                )
                if (
                    live_user is None
                    or peer_user is None
                    or relationship is None
                    or relationship.status != "ACCEPTED"
                ):
                    await _close_friend_socket(room, websocket, code=4403)
                    break
                if event_type == "messages_read":
                    await _mark_friend_messages_read(event_db, user_id, peer_id)
                    continue
                raw_content = incoming.get("content")
                content = raw_content.strip() if isinstance(raw_content, str) else ""
                if not content or len(content) > 2000:
                    await _send_socket_json(
                        websocket,
                        {"type": "error", "detail": "Message must be 1 to 2000 characters"},
                    )
                    continue
                msg = ChatMessage(
                    sender_id=user_id,
                    receiver_id=peer_id,
                    content=content,
                )
                event_db.add(msg)
                await event_db.flush()
                await create_notification(
                    event_db,
                    user_id=peer_id,
                    category="message",
                    title="New friend message",
                    body=f"{live_user.full_name} sent you a message.",
                    action_url=f"/chat/{user_id}",
                    resource_type="chat_message",
                    resource_id=msg.id,
                    dedupe_key=f"chat-message:{msg.id}",
                )
                await event_db.commit()
                await event_db.refresh(msg)
                out = _message_out(msg, live_user)
            event = {"type": "message", "message": out.model_dump(mode="json")}
            if not await _send_socket_json(websocket, event):
                break
            await _broadcast_friend_event(
                user_id, peer_id, event, exclude=websocket
            )
    finally:
        remote_task.cancel()
        heartbeat_task.cancel()
        await asyncio.gather(remote_task, heartbeat_task, return_exceptions=True)
        _remove_friend_socket(room, websocket)
        still_online = await remove_presence(user_id, connection_id)
        if not still_online:
            async with AsyncSessionLocal() as db:
                user = (
                    await db.execute(select(User).where(User.id == user_id))
                ).scalar_one_or_none()
                if user is not None:
                    user.last_seen = datetime.utcnow()
                    await db.commit()
