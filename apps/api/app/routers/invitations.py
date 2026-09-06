import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.permissions import can
from app.database import get_db
from app.dependencies import require_company_admin, require_platform_admin
from app.models import Company, User, UserRole

router = APIRouter()

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

# ---------- Platform Admin -> Company ----------
@router.post("/company/invite", response_model=dict)
async def invite_company(
    data: dict,
    current_user: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    email = data.get("email", "").strip().lower()
    company_name = data.get("company_name", "").strip()
    if not email or not company_name:
        raise HTTPException(status_code=400, detail="email and company_name required")
    token = secrets.token_urlsafe(32)
    token_hash = _hash(token)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=72)
    await db.execute(
        text("INSERT INTO company_invitations (id, email, company_name, token_hash, status, invited_by, expires_at, created_at) VALUES (:id, :email, :name, :hash, 'pending', :by, :exp, :now)"),
        {"id": str(uuid4()), "email": email, "name": company_name, "hash": token_hash, "by": str(current_user.id), "exp": expires_at, "now": datetime.utcnow()},
    )
    await db.commit()
    await log_audit(db, action="COMPANY_INVITATION_CREATED", actor=current_user, resource_type="company_invitation", details=email)
    # Raw token is emailed, never returned/stored/logged. For test environments, use DB lookup or email capture.
    return {"detail": "invited"}

@router.get("/company/invitations", response_model=dict)
async def list_company_invitations(
    current_user: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    res = await db.execute(text("SELECT id, email, company_name, status, expires_at, created_at FROM company_invitations ORDER BY created_at DESC"))
    rows = [dict(r) for r in res.mappings().all()]
    return {"invitations": rows}

@router.post("/company/invitations/{invitation_id}/revoke", response_model=dict)
async def revoke_company_invitation(
    invitation_id: UUID,
    current_user: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    res = await db.execute(text("SELECT status FROM company_invitations WHERE id=:id"), {"id": str(invitation_id)})
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending invitations can be revoked")
    await db.execute(text("UPDATE company_invitations SET status='revoked' WHERE id=:id"), {"id": str(invitation_id)})
    await db.commit()
    await log_audit(db, action="COMPANY_INVITATION_REVOKED", actor=current_user, resource_type="company_invitation", resource_id=invitation_id)
    return {"detail": "revoked"}

@router.post("/company/accept", response_model=dict)
async def accept_company_invite(
    data: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    token = data.get("token", "")
    password = data.get("password", "")
    full_name = data.get("full_name", "")
    if not token or not password or not full_name:
        raise HTTPException(status_code=400, detail="token, password, full_name required")
    token_hash = _hash(token)
    res = await db.execute(text("SELECT * FROM company_invitations WHERE token_hash=:h"), {"h": token_hash})
    row = res.mappings().first()
    if not row or row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Invalid or used token")
    if row["expires_at"] < datetime.utcnow():
        await db.execute(text("UPDATE company_invitations SET status='expired' WHERE id=:id"), {"id": row["id"]})
        await db.commit()
        raise HTTPException(status_code=400, detail="Token expired")
    existing = await db.execute(select(User).where(User.email == row["email"]))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already in use")
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    company = Company(name=row["company_name"], description="Invited company", status="active")
    db.add(company)
    await db.flush()
    user = User(email=row["email"], password_hash=pwd_context.hash(password), role=UserRole.COMPANY_USER, is_approved=True, full_name=full_name, company_id=company.id, company_role="OWNER")
    company.owner_id = user.id
    db.add(user)
    await db.execute(text("UPDATE company_invitations SET status='accepted', accepted_at=:now, company_id=:cid WHERE id=:id"), {"now": datetime.utcnow(), "cid": str(company.id), "id": row["id"]})
    await db.commit()
    # audit as system actor (invited user)
    await log_audit(db, action="COMPANY_CREATED", actor=user, company_id=company.id, resource_type="company", resource_id=company.id)
    return {"detail": "company created", "company_id": str(company.id)}

# ---------- Company OWNER/ADMIN -> Employee ----------
@router.post("/employee/invite", response_model=dict)
async def invite_employee(
    data: dict,
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    email = data.get("email", "").strip().lower()
    role = data.get("role", "").strip().upper()
    if role not in {"ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    if not can(current_user.company_role, "invite_employees"):
        raise HTTPException(status_code=403, detail="Forbidden")
    token = secrets.token_urlsafe(32)
    token_hash = _hash(token)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=72)
    # company_id derived from inviter, never trust client
    await db.execute(
        text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id, :cid, :email, :role, :hash, 'pending', :by, :exp, :now)"),
        {"id": str(uuid4()), "cid": str(current_user.company_id), "email": email, "role": role, "hash": token_hash, "by": str(current_user.id), "exp": expires_at, "now": datetime.utcnow()},
    )
    await db.commit()
    await log_audit(db, action="EMPLOYEE_INVITED", actor=current_user, company_id=current_user.company_id, resource_type="employee_invitation", details=email)
    return {"detail": "invited"}

@router.get("/employee/invitations", response_model=dict)
async def list_employee_invitations(
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    res = await db.execute(text("SELECT id, email, role, status, expires_at, created_at FROM employee_invitations WHERE company_id=:cid ORDER BY created_at DESC"), {"cid": str(current_user.company_id)})
    rows = [dict(r) for r in res.mappings().all()]
    return {"invitations": rows}

@router.post("/employee/invitations/{invitation_id}/revoke", response_model=dict)
async def revoke_employee_invitation(
    invitation_id: UUID,
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    res = await db.execute(text("SELECT status, company_id FROM employee_invitations WHERE id=:id"), {"id": str(invitation_id)})
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if str(row["company_id"]) != str(current_user.company_id):
        raise HTTPException(status_code=404, detail="Invitation not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending invitations can be revoked")
    await db.execute(text("UPDATE employee_invitations SET status='revoked' WHERE id=:id"), {"id": str(invitation_id)})
    await db.commit()
    await log_audit(db, action="EMPLOYEE_INVITATION_REVOKED", actor=current_user, company_id=current_user.company_id, resource_type="employee_invitation", resource_id=invitation_id)
    return {"detail": "revoked"}

@router.post("/employee/accept", response_model=dict)
async def accept_employee_invite(
    data: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    token = data.get("token", "")
    password = data.get("password", "")
    full_name = data.get("full_name", "")
    if not token or not password or not full_name:
        raise HTTPException(status_code=400, detail="token, password, full_name required")
    token_hash = _hash(token)
    res = await db.execute(text("SELECT * FROM employee_invitations WHERE token_hash=:h"), {"h": token_hash})
    row = res.mappings().first()
    if not row or row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Invalid or used token")
    if row["expires_at"] < datetime.utcnow():
        await db.execute(text("UPDATE employee_invitations SET status='expired' WHERE id=:id"), {"id": row["id"]})
        await db.commit()
        raise HTTPException(status_code=400, detail="Token expired")
    existing = await db.execute(select(User).where(User.email == row["email"]))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already in use")
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    # role and company_id from stored invitation, never from client
    user = User(email=row["email"], password_hash=pwd_context.hash(password), role=UserRole.COMPANY_USER, is_approved=True, full_name=full_name, company_id=UUID(str(row["company_id"])), company_role=row["role"])
    db.add(user)
    await db.execute(text("UPDATE employee_invitations SET status='accepted', accepted_at=:now WHERE id=:id"), {"now": datetime.utcnow(), "id": row["id"]})
    await db.commit()
    await log_audit(db, action="EMPLOYEE_INVITATION_ACCEPTED", actor=user, company_id=user.company_id, resource_type="user", resource_id=user.id)
    return {"detail": "employee created"}
