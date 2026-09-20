from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Application, CandidateRequest, ChatMessage, Company, Offer, RequestStatus, User
from app.schemas import (
    ChatMessageCreate,
    ChatMessageOut,
    RecruitmentChatContext,
    RecruitmentMessageCreate,
    RecruitmentPeer,
    UserOut,
)
from app.services.recruitment_chat import (
    can_access_recruitment_chat,
    get_or_create_recruitment_conversation,
    is_chat_enabled_for_status,
    resolve_responsible_hr_id,
)
from app.utils.jwt import verify_token

router = APIRouter()


@router.post("/send", response_model=ChatMessageOut)
async def send_message(
    data: ChatMessageCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatMessageOut:
    if data.receiver_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot message yourself")
    recv_res = await db.execute(select(User).where(User.id == data.receiver_id))
    recv_user = recv_res.scalar_one_or_none()
    if not recv_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receiver not found")
    # enforce chat only after accepted request for candidate <-> company_user
    sender_role = current_user.role.value
    recv_role = recv_user.role.value
    is_sender_candidate = sender_role == "CANDIDATE"
    is_recv_candidate = recv_role == "CANDIDATE"
    is_sender_company = sender_role in ("COMPANY_USER", "RECRUITER")
    is_recv_company = recv_role in ("COMPANY_USER", "RECRUITER")
    is_admin = sender_role in ("PLATFORM_ADMIN", "ADMIN")
    if not is_admin and ((is_sender_candidate and is_recv_company) or (is_sender_company and is_recv_candidate)):
        candidate_id = current_user.id if is_sender_candidate else recv_user.id
        company_user = recv_user if is_recv_company else current_user
        company_id = company_user.company_id
        if not company_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chat only allowed after request is accepted")
        # check accepted request exists between this candidate and this company
        acc = await db.execute(
            select(CandidateRequest).where(
                CandidateRequest.candidate_id == candidate_id,
                CandidateRequest.company_id == company_id,
                CandidateRequest.status == RequestStatus.accepted,
            )
        )
        if not acc.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chat only allowed after request is accepted")
    msg = ChatMessage(sender_id=current_user.id, receiver_id=recv_user.id, content=data.content.strip())
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return ChatMessageOut(id=msg.id, sender_id=msg.sender_id, receiver_id=msg.receiver_id, content=msg.content, created_at=msg.created_at, sender=UserOut.model_validate(current_user))


@router.get("/with/{user_id}", response_model=dict[str, list[ChatMessageOut]])
async def get_conversation(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    # Direct/general thread ONLY. Recruitment messages (application_id NOT NULL)
    # must never leak here, otherwise the same peer appears twice in the inbox
    # (once as recruitment, once as direct) with the same preview.
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.application_id.is_(None),
            or_(
                and_(ChatMessage.sender_id == current_user.id, ChatMessage.receiver_id == user_id),
                and_(ChatMessage.sender_id == user_id, ChatMessage.receiver_id == current_user.id),
            ),
        )
        .order_by(ChatMessage.created_at.asc())
        .limit(100)
    )
    msgs = result.scalars().all()
    out = []
    for m in msgs:
        # fetch sender for display
        sender = (await db.execute(select(User).where(User.id == m.sender_id))).scalar_one_or_none()
        out.append(ChatMessageOut(id=m.id, sender_id=m.sender_id, receiver_id=m.receiver_id, content=m.content, created_at=m.created_at, sender=UserOut.model_validate(sender) if sender else None))
    return {"messages": out}


@router.get("/conversations", response_model=dict[str, list[dict]])
async def list_conversations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    # Direct/general inbox ONLY. Recruitment messages live under
    # /chat/recruitment (keyed by application_id) and must not create a
    # second inbox entry for the same peer here.
    # distinct conversation partners
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.application_id.is_(None),
            or_(ChatMessage.sender_id == current_user.id, ChatMessage.receiver_id == current_user.id),
        )
        .order_by(ChatMessage.created_at.desc())
    )
    msgs = result.scalars().all()
    seen = set()
    partners = []
    for m in msgs:
        other_id = m.receiver_id if m.sender_id == current_user.id else m.sender_id
        if other_id in seen:
            continue
        seen.add(other_id)
        user = (await db.execute(select(User).where(User.id == other_id))).scalar_one_or_none()
        if user:
            partners.append({"user": UserOut.model_validate(user).model_dump(), "last_message": m.content, "last_at": m.created_at.isoformat()})
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
        sender=UserOut.model_validate(sender) if sender else None,
        application_id=msg.application_id,
    )


async def _recruitment_messages(
    db: AsyncSession, application_id: UUID, limit: int = 100
) -> list[ChatMessageOut]:
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.application_id == application_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    msgs = result.scalars().all()
    out: list[ChatMessageOut] = []
    for m in msgs:
        sender = (
            await db.execute(select(User).where(User.id == m.sender_id))
        ).scalar_one_or_none()
        out.append(_message_out(m, sender))
    return out


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
        company = None
        company_id = offer.company_id or a.company_id
        if company_id:
            company = (
                await db.execute(select(Company).where(Company.id == company_id))
            ).scalar_one_or_none()
        items.append(
            {
                "application_id": str(a.id),
                "status": a.status,
                "chat_enabled": True,
                "offer_id": str(offer.id),
                "offer_title": offer.title,
                "company_name": company.name if company else offer.company,
                "peer": _peer_out(peer).model_dump() if _peer_out(peer) else None,
                "last_message": last.content if last else None,
                "last_at": last.created_at.isoformat() if last else None,
            }
        )
    return {"recruitment_chats": items}


@router.get("/recruitment/{application_id}", response_model=RecruitmentChatContext)
async def get_recruitment_chat(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecruitmentChatContext:
    app, offer, company, peer_id = await _check_recruitment_viewer(db, current_user, application_id)
    return await _build_recruitment_context(db, app, offer, company, peer_id)


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
    await db.commit()
    await db.refresh(msg)
    out = _message_out(msg, current_user)
    await _broadcast_recruitment_message(str(app.id), out)
    return out


# ---------------------------------------------------------------------------
# Realtime: minimal WebSocket layer for recruitment chats. There was no
# pre-existing realtime implementation (chat used 3s polling), so this adds
# one room per application reusing the same authorization helper. Polling
# remains as fallback. NOTE: in-memory fan-out covers a single API replica
# (current docker-compose topology); scale-out would need Redis pub/sub.
# ---------------------------------------------------------------------------

_recruitment_rooms: dict[str, set[WebSocket]] = {}


async def _broadcast_recruitment_message(application_id: str, message: ChatMessageOut) -> None:
    payload = {"type": "message", "message": message.model_dump(mode="json")}
    for ws in list(_recruitment_rooms.get(application_id, set())):
        try:
            await ws.send_json(payload)
        except Exception:
            continue


@router.websocket("/recruitment/{application_id}/ws")
async def recruitment_chat_ws(
    websocket: WebSocket,
    application_id: UUID,
    token: str | None = Query(default=None),
) -> None:
    await websocket.accept()
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = verify_token(token)
        user_id = UUID(str(payload.get("sub")))
    except Exception:
        await websocket.close(code=4401)
        return

    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        user = (
            await db.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
        if user is None:
            await websocket.close(code=4401)
            return
        try:
            app, offer, _, peer_id = await _check_recruitment_viewer(db, user, application_id)
        except HTTPException as exc:
            await websocket.close(code=4404 if exc.status_code == 404 else 4403)
            return
        decision = can_access_recruitment_chat(user, app, offer)
        room = str(app.id)
        _recruitment_rooms.setdefault(room, set()).add(websocket)
        try:
            peer = (
                await db.execute(select(User).where(User.id == peer_id))
            ).scalar_one_or_none()
            await websocket.send_json(
                {
                    "type": "ready",
                    "chat_enabled": decision.allowed,
                    "peer": _peer_out(peer).model_dump(mode="json") if _peer_out(peer) else None,
                }
            )
            while True:
                try:
                    incoming = await websocket.receive_json()
                except WebSocketDisconnect:
                    break
                content = str(incoming.get("content", "")).strip()
                if not content:
                    continue
                # Re-resolve authorization per message: stage/company may change.
                await db.refresh(user)
                app_fresh = (
                    await db.execute(select(Application).where(Application.id == app.id))
                ).scalar_one_or_none()
                offer_fresh = (
                    await db.execute(select(Offer).where(Offer.id == offer.id))
                ).scalar_one_or_none()
                if app_fresh is None or offer_fresh is None:
                    await websocket.send_json({"type": "error", "detail": "Application not found"})
                    continue
                live = can_access_recruitment_chat(user, app_fresh, offer_fresh)
                if not live.allowed or live.peer_id is None:
                    await websocket.send_json(
                        {"type": "error", "detail": "Recruitment chat is not available for this application"}
                    )
                    continue
                peer_user = (
                    await db.execute(select(User).where(User.id == live.peer_id))
                ).scalar_one_or_none()
                if peer_user is None:
                    await websocket.send_json({"type": "error", "detail": "Application not found"})
                    continue
                msg = ChatMessage(
                    sender_id=user.id,
                    receiver_id=peer_user.id,
                    application_id=app_fresh.id,
                    content=content[:2000],
                )
                db.add(msg)
                await db.commit()
                await db.refresh(msg)
                out = _message_out(msg, user)
                # Confirm to sender, fan out to the other participant(s).
                await websocket.send_json({"type": "message", "message": out.model_dump(mode="json")})
                for ws in list(_recruitment_rooms.get(room, set())):
                    if ws is websocket:
                        continue
                    try:
                        await ws.send_json({"type": "message", "message": out.model_dump(mode="json")})
                    except Exception:
                        continue
        finally:
            _recruitment_rooms.get(room, set()).discard(websocket)
