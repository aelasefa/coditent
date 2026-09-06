import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.audit import log_audit
from app.core.permissions import VALID_COMPANY_ROLES, can
from app.database import get_db
from app.dependencies import get_current_user, require_company_admin, require_platform_admin
from app.models import Company, User, UserRole

router = APIRouter()

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def _is_valid_email(email: str) -> bool:
    return bool(re.match(r"[^@]+@[^@]+\.[^@]+", email))

# Keep role set consistent with frontend + permissions (OWNER not assignable via invite)
EMPLOYEE_INVITE_ROLES = {"ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"}

def _build_employee_invite_email(company_name: str, role: str, token: str, expires_at: datetime) -> tuple[str, str]:
    """Return (subject, html) for employee invite — CODITENT branded."""
    frontend = settings.frontend_url.rstrip("/")
    # Canonical route is /invite/employee?token= — also support /accept-invitation?token= via redirect if needed
    invite_url = f"{frontend}/invite/employee?token={token}"
    subject = f"You've been invited to join {company_name} on CODITENT as {role}"
    html = f"""
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181B;">
      <div style="border:1px solid #E4E4E7;border-radius:16px;overflow:hidden;">
        <div style="background:#18181B;color:#fff;padding:20px 24px;">
          <div style="font-weight:800;letter-spacing:-0.02em;font-size:18px;">CODITENT</div>
          <div style="font-size:12px;opacity:0.7;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px;">Talent Workflow Platform</div>
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 8px;font-size:18px;">You've been invited to join <strong>{company_name}</strong> as <strong>{role}</strong></h2>
          <p style="margin:0 0 12px;color:#52525B;font-size:14px;line-height:1.6;">
            {company_name} invited you to collaborate on CODITENT — manage recruitment, candidates, assessments, and practical evaluations in one workspace.
          </p>
          <div style="background:#FAFAF9;border:1px solid #F4F4F5;border-radius:12px;padding:12px 14px;margin:12px 0;">
            <div style="font-size:12px;color:#71717A;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Invitation details</div>
            <div style="margin-top:6px;font-size:13px;"><strong>Company:</strong> {company_name}</div>
            <div style="font-size:13px;"><strong>Role:</strong> {role}</div>
            <div style="font-size:13px;"><strong>Expires:</strong> {expires_at.strftime('%b %d, %Y %H:%M UTC')}</div>
          </div>
          <a href="{invite_url}" style="display:inline-block;background:#18181B;color:#fff;text-decoration:none;border-radius:999px;padding:10px 18px;font-size:14px;font-weight:600;margin:8px 0;">Accept invitation →</a>
          <p style="font-size:12px;color:#71717A;margin:8px 0 0;">Or paste this link: <a href="{invite_url}" style="color:#18181B;word-break:break-all;">{invite_url}</a></p>
          <p style="font-size:12px;color:#71717A;margin:16px 0 0;">This invitation expires in 72 hours and is single-use. If you were not expecting this, you can safely ignore this email.</p>
          <p style="font-size:12px;color:#A1A1AA;margin:8px 0 0;">Raw token is not logged. Invitation ID is not exposed as credential.</p>
        </div>
      </div>
      <p style="font-size:11px;color:#A1A1AA;text-align:center;margin-top:12px;">CODITENT · Talent Workflow Platform for Morocco</p>
    </div>
    """
    return subject, html

def _send_employee_invite_email_safe(email: str, company_name: str, role: str, token: str, expires_at: datetime) -> None:
    """Best-effort email — never fail invitation creation if email fails; log instead."""
    try:
        from app.services.email import send_email
        subject, html = _build_employee_invite_email(company_name, role, token, expires_at)
        send_email(email, subject, html)
    except Exception as exc:
        # Do not expose token; log at warning level via observability if available
        try:
            from app.observability import get_logger
            get_logger("invitations").warning("employee_invite_email_failed", email=email, error=str(exc))
        except Exception:
            pass

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
    if not _is_valid_email(email):
        raise HTTPException(status_code=400, detail="Invalid email")
    token = secrets.token_urlsafe(32)
    token_hash = _hash(token)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=72)
    await db.execute(
        text("INSERT INTO company_invitations (id, email, company_name, token_hash, status, invited_by, expires_at, created_at) VALUES (:id, :email, :name, :hash, 'pending', :by, :exp, :now)"),
        {"id": str(uuid4()), "email": email, "name": company_name, "hash": token_hash, "by": str(current_user.id), "exp": expires_at, "now": datetime.utcnow()},
    )
    await db.commit()
    await log_audit(db, action="COMPANY_INVITATION_CREATED", actor=current_user, resource_type="company_invitation", details=email)
    # Email (best-effort)
    try:
        from app.services.email import send_email
        frontend = settings.frontend_url.rstrip("/")
        url = f"{frontend}/invite/company?token={token}"
        html = f"<p>You are invited to create company <strong>{company_name}</strong> on CODITENT. <a href='{url}'>Accept invitation</a> — expires in 72h. Link: {url}</p>"
        send_email(email, f"You've been invited to create {company_name} on CODITENT", html)
    except Exception:
        pass
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
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    token_hash = _hash(token)
    # Atomic: lock row for update to prevent concurrent accept
    res = await db.execute(text("SELECT * FROM company_invitations WHERE token_hash=:h FOR UPDATE"), {"h": token_hash})
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
    if not email or not _is_valid_email(email):
        raise HTTPException(status_code=400, detail="Invalid email")
    if role not in EMPLOYEE_INVITE_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if role == "OWNER":
        raise HTTPException(status_code=400, detail="Cannot assign OWNER via invitation")
    if not can(current_user.company_role, "invite_employees"):
        raise HTTPException(status_code=403, detail="Forbidden")
    # Prevent self-invite
    if email == current_user.email.lower():
        raise HTTPException(status_code=400, detail="Cannot invite yourself")
    # Check already member (same company)
    existing_member = await db.execute(select(User).where(User.email == email))
    member = existing_member.scalar_one_or_none()
    if member and str(member.company_id) == str(current_user.company_id):
        raise HTTPException(status_code=400, detail="User already member of this company")
    # Check duplicate active invitation (pending, not expired)
    dup = await db.execute(text("SELECT id, expires_at FROM employee_invitations WHERE company_id=:cid AND email=:email AND status='pending'"), {"cid": str(current_user.company_id), "email": email})
    dup_row = dup.mappings().first()
    if dup_row:
        # If not expired, block duplicate; if expired, mark expired and allow new
        if dup_row["expires_at"] >= datetime.utcnow():
            raise HTTPException(status_code=400, detail="Active invitation already exists for this email")
        else:
            await db.execute(text("UPDATE employee_invitations SET status='expired' WHERE id=:id"), {"id": dup_row["id"]})
            await db.commit()
    token = secrets.token_urlsafe(32)
    token_hash = _hash(token)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=72)
    # Fetch company name for email
    comp_res = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = comp_res.scalar_one_or_none()
    company_name = company.name if company else "Your company"
    await db.execute(
        text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id, :cid, :email, :role, :hash, 'pending', :by, :exp, :now)"),
        {"id": str(uuid4()), "cid": str(current_user.company_id), "email": email, "role": role, "hash": token_hash, "by": str(current_user.id), "exp": expires_at, "now": datetime.utcnow()},
    )
    await db.commit()
    await log_audit(db, action="EMPLOYEE_INVITED", actor=current_user, company_id=current_user.company_id, resource_type="employee_invitation", details=f"{email}:{role}")
    _send_employee_invite_email_safe(email, company_name, role, token, expires_at)
    return {"detail": "invited"}

@router.get("/employee/invitations", response_model=dict)
async def list_employee_invitations(
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    res = await db.execute(text("SELECT id, email, role, status, expires_at, created_at, accepted_at FROM employee_invitations WHERE company_id=:cid ORDER BY created_at DESC"), {"cid": str(current_user.company_id)})
    rows = [dict(r) for r in res.mappings().all()]
    return {"invitations": rows}

@router.get("/employee/validate", response_model=dict)
async def validate_employee_invitation(
    token: str = Query(..., min_length=10),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    """Public endpoint to display invitation details without exposing token hash — for acceptance page."""
    token_hash = _hash(token)
    res = await db.execute(text("SELECT email, role, company_id, status, expires_at FROM employee_invitations WHERE token_hash=:h"), {"h": token_hash})
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Invalid token")
    # Fetch company name
    comp = await db.execute(select(Company).where(Company.id == row["company_id"]))
    company = comp.scalar_one_or_none()
    company_name = company.name if company else "Company"
    status_val = row["status"]
    # Check expired
    if status_val == "pending" and row["expires_at"] < datetime.utcnow():
        # Mark expired lazily
        await db.execute(text("UPDATE employee_invitations SET status='expired' WHERE token_hash=:h"), {"h": token_hash})
        await db.commit()
        status_val = "expired"
    return {"email": row["email"], "role": row["role"], "company_name": company_name, "company_id": str(row["company_id"]), "status": status_val, "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None}

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

@router.post("/employee/resend", response_model=dict)
async def resend_employee_invitation(
    data: dict,
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Invalidate old pending token and issue new one — resend email."""
    invitation_id = data.get("invitation_id") or data.get("id")
    if not invitation_id:
        raise HTTPException(status_code=400, detail="invitation_id required")
    try:
        inv_uuid = UUID(str(invitation_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid invitation_id")
    res = await db.execute(text("SELECT * FROM employee_invitations WHERE id=:id FOR UPDATE"), {"id": str(inv_uuid)})
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if str(row["company_id"]) != str(current_user.company_id):
        raise HTTPException(status_code=404, detail="Invitation not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending invitations can be resent")
    # Invalidate old
    await db.execute(text("UPDATE employee_invitations SET status='revoked' WHERE id=:id"), {"id": str(inv_uuid)})
    # Create new with same email/role
    new_token = secrets.token_urlsafe(32)
    new_hash = _hash(new_token)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=72)
    new_id = str(uuid4())
    await db.execute(
        text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id, :cid, :email, :role, :hash, 'pending', :by, :exp, :now)"),
        {"id": new_id, "cid": str(row["company_id"]), "email": row["email"], "role": row["role"], "hash": new_hash, "by": str(current_user.id), "exp": expires_at, "now": datetime.utcnow()},
    )
    await db.commit()
    # Fetch company name
    comp = await db.execute(select(Company).where(Company.id == row["company_id"]))
    company = comp.scalar_one_or_none()
    company_name = company.name if company else "Your company"
    _send_employee_invite_email_safe(row["email"], company_name, row["role"], new_token, expires_at)
    await log_audit(db, action="EMPLOYEE_INVITATION_RESENT", actor=current_user, company_id=current_user.company_id, resource_type="employee_invitation", resource_id=UUID(new_id), details=f"{row['email']}:{row['role']}")
    return {"detail": "resent", "invitation_id": new_id}

@router.post("/employee/accept", response_model=dict)
async def accept_employee_invite(
    data: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """New-user flow: creates account. For existing users, use /employee/accept-existing."""
    token = data.get("token", "")
    password = data.get("password", "")
    full_name = data.get("full_name", "")
    if not token or not password or not full_name:
        raise HTTPException(status_code=400, detail="token, password, full_name required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if len(full_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Full name required")
    token_hash = _hash(token)
    # Lock invitation row to prevent concurrent accept
    res = await db.execute(text("SELECT * FROM employee_invitations WHERE token_hash=:h FOR UPDATE"), {"h": token_hash})
    row = res.mappings().first()
    if not row or row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Invalid or used token")
    if row["expires_at"] < datetime.utcnow():
        await db.execute(text("UPDATE employee_invitations SET status='expired' WHERE id=:id"), {"id": row["id"]})
        await db.commit()
        raise HTTPException(status_code=400, detail="Token expired")
    existing = await db.execute(select(User).where(User.email == row["email"]))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already in use — use existing account flow")
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user = User(email=row["email"], password_hash=pwd_context.hash(password), role=UserRole.COMPANY_USER, is_approved=True, full_name=full_name.strip(), company_id=UUID(str(row["company_id"])), company_role=row["role"])
    db.add(user)
    await db.execute(text("UPDATE employee_invitations SET status='accepted', accepted_at=:now WHERE id=:id"), {"now": datetime.utcnow(), "id": row["id"]})
    await db.commit()
    await log_audit(db, action="EMPLOYEE_INVITATION_ACCEPTED", actor=user, company_id=user.company_id, resource_type="user", resource_id=user.id)
    return {"detail": "employee created"}

@router.post("/employee/accept-existing", response_model=dict)
async def accept_employee_existing(
    data: dict,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Existing-user flow: authenticated user accepts invite bound to their email."""
    token = data.get("token", "")
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    token_hash = _hash(token)
    res = await db.execute(text("SELECT * FROM employee_invitations WHERE token_hash=:h FOR UPDATE"), {"h": token_hash})
    row = res.mappings().first()
    if not row or row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Invalid or used token")
    if row["expires_at"] < datetime.utcnow():
        await db.execute(text("UPDATE employee_invitations SET status='expired' WHERE id=:id"), {"id": row["id"]})
        await db.commit()
        raise HTTPException(status_code=400, detail="Token expired")
    # Email must match current_user (prevent stealing another's invite)
    if row["email"].lower() != current_user.email.lower():
        raise HTTPException(status_code=403, detail="Invitation email does not match your account")
    # Already member of this company?
    if str(current_user.company_id) == str(row["company_id"]):
        raise HTTPException(status_code=400, detail="Already member of this company")
    # If user already has a company, we allow switching? For now, if they have any company, block or allow transfer? Use task: create membership — if already in another company, forbid.
    if current_user.company_id is not None:
        raise HTTPException(status_code=400, detail="You are already a member of another company — contact support")
    # Prevent race: check invitation still pending after lock (already)
    # Update user membership — role from invitation, never from client
    current_user.company_id = UUID(str(row["company_id"]))
    current_user.company_role = row["role"]
    # If user was CANDIDATE, convert to COMPANY_USER but keep is_approved True
    if current_user.role == UserRole.CANDIDATE:
        current_user.role = UserRole.COMPANY_USER
    await db.execute(text("UPDATE employee_invitations SET status='accepted', accepted_at=:now WHERE id=:id"), {"now": datetime.utcnow(), "id": row["id"]})
    await db.commit()
    await log_audit(db, action="EMPLOYEE_INVITATION_ACCEPTED_EXISTING", actor=current_user, company_id=current_user.company_id, resource_type="user", resource_id=current_user.id, details=f"{row['email']}:{row['role']}")
    return {"detail": "membership created", "company_id": str(row["company_id"]), "role": row["role"]}
