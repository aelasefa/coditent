from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import CandidateRequest, ChatMessage, RequestStatus, User
from app.schemas import ChatMessageCreate, ChatMessageOut, UserOut

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
    result = await db.execute(
        select(ChatMessage)
        .where(
            or_(
                and_(ChatMessage.sender_id == current_user.id, ChatMessage.receiver_id == user_id),
                and_(ChatMessage.sender_id == user_id, ChatMessage.receiver_id == current_user.id),
            )
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
    # distinct conversation partners
    result = await db.execute(
        select(ChatMessage).where(or_(ChatMessage.sender_id == current_user.id, ChatMessage.receiver_id == current_user.id)).order_by(ChatMessage.created_at.desc())
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
