import base64
import hashlib
import html as html_module
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
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
from app.models import Company, EmailDelivery, User, UserRole
from app.schemas import (
    CompanyInviteAcceptRequest,
    CompanyInviteCreateRequest,
    EmployeeInviteAcceptRequest,
    EmployeeInviteCreateRequest,
    EmployeeInviteExistingAcceptRequest,
    EmployeeInviteResendRequest,
    InvitationDeliveryOut,
)
from app.services.passwords import hash_password
from app.services.entitlements import EntitlementDenied, require_capacity
from app.services.email_outbox import (
    EmailOutboxUnavailable,
    deliver_email_job,
    enqueue_email_delivery,
)

router = APIRouter()

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

EMPLOYEE_INVITE_ART_CONTENT_ID = "coditent-employee-invite-art"
EMPLOYEE_INVITE_ART_PATH = Path(__file__).resolve().parent.parent / "assets" / "employee-invite-email-art.jpg"


@lru_cache(maxsize=1)
def employee_invite_art_attachment() -> dict[str, str]:
    """Return the employee-invite hero as an inline CID attachment."""
    content = base64.b64encode(EMPLOYEE_INVITE_ART_PATH.read_bytes()).decode("ascii")
    return {
        "filename": "coditent-team-invitation.jpg",
        "content": content,
        "content_type": "image/jpeg",
        "content_id": EMPLOYEE_INVITE_ART_CONTENT_ID,
    }


def _build_employee_invite_email(company_name: str, role: str, token: str, expires_at: datetime) -> tuple[str, str]:
    """Return (subject, html) for employee invite — CODITENT branded."""
    frontend = settings.frontend_url.rstrip("/")
    # Canonical route is /invite/employee?token= — also support /accept-invitation?token= via redirect if needed
    invite_url = f"{frontend}/invite/employee?token={token}"
    invite_url_safe = html_module.escape(invite_url, quote=True)
    company_safe = html_module.escape(company_name)
    role_safe = html_module.escape(role)
    subject_company = " ".join(company_name.splitlines()).strip()
    subject = f"You're invited to join {subject_company} on CODITENT"
    exp = expires_at.strftime('%b %d, %Y %H:%M UTC')
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>{html_module.escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f8f3;color:#192b23;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    {company_safe} invited you to join its CODITENT workspace as {role_safe}.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f8f8f3;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#fffefa;border:1px solid #cfdbcf;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="padding:22px 28px 18px;border-bottom:1px solid #e3e9df;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:800;line-height:1;color:#192b23;letter-spacing:-0.4px;">Coditent</td>
                  <td align="right" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;line-height:1.4;color:#617369;letter-spacing:1.4px;text-transform:uppercase;">Team invitation</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0;background-color:#edf1e9;line-height:0;">
              <img src="cid:{EMPLOYEE_INVITE_ART_CONTENT_ID}" width="600" alt="A new colleague being welcomed into a collaborative team" style="display:block;width:100%;max-width:600px;height:auto;border:0;line-height:100%;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 30px;">
              <p style="margin:0 0 9px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;line-height:1.4;color:#5b765e;letter-spacing:1.8px;text-transform:uppercase;">Join {company_safe}</p>
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:400;line-height:1.12;color:#192b23;letter-spacing:-1px;">Your next chapter starts with the team.</h1>
              <p style="margin:14px 0 22px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.65;color:#53665a;"><strong style="color:#192b23;">{company_safe}</strong> invited you to collaborate on CODITENT. Accept the invitation to work with candidates, assessments, recruitment stages, and practical evaluations in one shared workspace.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#edf1e9;border:1px solid #cfdbcf;border-radius:12px;">
                <tr>
                  <td style="padding:17px 18px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
                    <p style="margin:0 0 9px;font-size:10px;font-weight:700;line-height:1.4;color:#617369;letter-spacing:1.5px;text-transform:uppercase;">Invitation details</p>
                    <p style="margin:0;font-size:14px;line-height:1.65;color:#192b23;"><strong>Company:</strong> {company_safe}</p>
                    <p style="margin:0;font-size:14px;line-height:1.65;color:#192b23;"><strong>Your role:</strong> {role_safe}</p>
                    <p style="margin:0;font-size:14px;line-height:1.65;color:#192b23;"><strong>Expires:</strong> {exp}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:15px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#53665a;">Your invited role is assigned automatically when you accept.</p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">
                <tr>
                  <td bgcolor="#194d38" style="border-radius:999px;">
                    <a href="{invite_url_safe}" style="display:inline-block;padding:13px 21px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">Join the workspace →</a>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#617369;">If the button does not work, copy and paste this link into your browser:<br><a href="{invite_url_safe}" style="color:#194d38;text-decoration:underline;word-break:break-all;">{invite_url_safe}</a></p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:22px;border-top:1px solid #e3e9df;">
                <tr>
                  <td style="padding-top:18px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#617369;">This invitation is single-use and expires on {exp}. If you were not expecting it, you can safely ignore this email.</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.5;color:#617369;text-align:center;">CODITENT · Talent Workflow Platform for Morocco</p>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return subject, html


# ---------- Platform Admin -> Company ----------
COMPANY_INVITE_EXPIRY_DAYS = 7
COMPANY_INVITE_ART_CONTENT_ID = "coditent-company-invite-art"
COMPANY_INVITE_ART_PATH = Path(__file__).resolve().parent.parent / "assets" / "company-invite-email-art.jpg"


@lru_cache(maxsize=1)
def company_invite_art_attachment() -> dict[str, str]:
    """Return the company-invite hero as an inline CID attachment."""
    content = base64.b64encode(COMPANY_INVITE_ART_PATH.read_bytes()).decode("ascii")
    return {
        "filename": "coditent-company-invitation.jpg",
        "content": content,
        "content_type": "image/jpeg",
        "content_id": COMPANY_INVITE_ART_CONTENT_ID,
    }


def _company_invite_email(company_name: str, token: str, expires_at: datetime) -> tuple[str, str]:
    """Return (subject, html) for company invite — CODITENT branded."""
    frontend = settings.frontend_url.rstrip("/")
    invite_url = f"{frontend}/company/invite/accept?token={token}"
    invite_url_safe = html_module.escape(invite_url, quote=True)
    company_safe = html_module.escape(company_name)
    subject = "Create your company workspace on CODITENT"
    exp = expires_at.strftime('%b %d, %Y')
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f8f3;color:#192b23;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    {company_safe}, your CODITENT company workspace invitation is ready.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f8f8f3;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#fffefa;border:1px solid #cfdbcf;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="padding:22px 28px 18px;border-bottom:1px solid #e3e9df;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:800;line-height:1;color:#192b23;letter-spacing:-0.4px;">Coditent</td>
                  <td align="right" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;line-height:1.4;color:#617369;letter-spacing:1.4px;text-transform:uppercase;">Company invitation</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0;background-color:#edf1e9;line-height:0;">
              <img src="cid:{COMPANY_INVITE_ART_CONTENT_ID}" width="600" alt="A welcoming arch opening into a collaborative company workspace" style="display:block;width:100%;max-width:600px;height:auto;border:0;line-height:100%;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 30px;">
              <p style="margin:0 0 9px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;line-height:1.4;color:#5b765e;letter-spacing:1.8px;text-transform:uppercase;">Your workspace is ready</p>
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:400;line-height:1.12;color:#192b23;letter-spacing:-1px;">Build your hiring workspace with CODITENT.</h1>
              <p style="margin:14px 0 22px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.65;color:#53665a;">A CODITENT administrator invited <strong style="color:#192b23;">{company_safe}</strong> to create a company workspace. The first account created through this invitation becomes the company owner.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#edf1e9;border:1px solid #cfdbcf;border-radius:12px;">
                <tr>
                  <td style="padding:17px 18px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
                    <p style="margin:0 0 9px;font-size:10px;font-weight:700;line-height:1.4;color:#617369;letter-spacing:1.5px;text-transform:uppercase;">Invitation details</p>
                    <p style="margin:0;font-size:14px;line-height:1.65;color:#192b23;"><strong>Workspace:</strong> {company_safe}</p>
                    <p style="margin:0;font-size:14px;line-height:1.65;color:#192b23;"><strong>Access:</strong> Company owner</p>
                    <p style="margin:0;font-size:14px;line-height:1.65;color:#192b23;"><strong>Expires:</strong> {exp}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
                <tr>
                  <td bgcolor="#194d38" style="border-radius:999px;">
                    <a href="{invite_url_safe}" style="display:inline-block;padding:13px 21px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">Create company workspace →</a>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#617369;">If the button does not work, copy and paste this link into your browser:<br><a href="{invite_url_safe}" style="color:#194d38;text-decoration:underline;word-break:break-all;">{invite_url_safe}</a></p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:22px;border-top:1px solid #e3e9df;">
                <tr>
                  <td style="padding-top:18px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#617369;">This invitation is single-use and expires on {exp}. If you were not expecting it, you can safely ignore this email.</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.5;color:#617369;text-align:center;">CODITENT · Talent Workflow Platform for Morocco</p>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return subject, html


async def _queue_company_invite_email(
    db: AsyncSession,
    *,
    invitation_id: UUID,
    email: str,
    company_name: str,
    token: str,
    expires_at: datetime,
) -> EmailDelivery:
    subject, html = _company_invite_email(company_name, token, expires_at)
    return await enqueue_email_delivery(
        db,
        kind="company_invitation",
        dedupe_key=f"company-invitation:{invitation_id}",
        resource_type="company_invitation",
        resource_id=invitation_id,
        to_email=email,
        subject=subject,
        html=html,
        attachments=[company_invite_art_attachment()],
    )


async def _queue_employee_invite_email(
    db: AsyncSession,
    *,
    invitation_id: UUID,
    email: str,
    company_name: str,
    role: str,
    token: str,
    expires_at: datetime,
) -> EmailDelivery:
    subject, html = _build_employee_invite_email(company_name, role, token, expires_at)
    return await enqueue_email_delivery(
        db,
        kind="employee_invitation",
        dedupe_key=f"employee-invitation:{invitation_id}",
        resource_type="employee_invitation",
        resource_id=invitation_id,
        to_email=email,
        subject=subject,
        html=html,
        attachments=[employee_invite_art_attachment()],
    )


async def _attempt_queued_delivery(
    db: AsyncSession,
    delivery: EmailDelivery | None,
) -> tuple[bool, str, str | None]:
    if delivery is None:
        return False, "failed", (
            "Email delivery is not configured. Copy the invitation link and share it securely."
        )
    delivery_status = await deliver_email_job(db, delivery.id, worker_id="api-immediate")
    if delivery_status == "failed":
        return False, delivery_status, (
            "The email provider could not deliver this invitation. Copy the invitation link and share it securely."
        )
    return delivery_status == "sent", delivery_status, None


@router.post("/company/invite", response_model=InvitationDeliveryOut)
async def invite_company(
    data: CompanyInviteCreateRequest,
    current_user: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    email = str(data.email).strip().lower()
    company_name = data.company_name.strip()
    contact_name = data.contact_name
    contact_role = data.contact_role
    # Prevent accidental duplicates: one live pending invite per email
    dup = await db.execute(
        text("SELECT id, expires_at FROM company_invitations WHERE email=:email AND status='pending'"),
        {"email": email},
    )
    dup_row = dup.mappings().first()
    if dup_row and dup_row["expires_at"] >= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Active invitation already exists for this email")
    if dup_row:
        await db.execute(text("UPDATE company_invitations SET status='expired' WHERE id=:id"), {"id": dup_row["id"]})
    token = secrets.token_urlsafe(32)
    token_hash = _hash(token)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=COMPANY_INVITE_EXPIRY_DAYS)
    invitation_uuid = uuid4()
    inv_id = str(invitation_uuid)
    await db.execute(
        text("INSERT INTO company_invitations (id, email, company_name, contact_name, contact_role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id, :email, :name, :cname, :crole, :hash, 'pending', :by, :exp, :now)"),
        {"id": inv_id, "email": email, "name": company_name, "cname": contact_name, "crole": contact_role, "hash": token_hash, "by": str(current_user.id), "exp": expires_at, "now": datetime.utcnow()},
    )
    delivery: EmailDelivery | None = None
    delivery_configuration_error = False
    try:
        delivery = await _queue_company_invite_email(
            db,
            invitation_id=invitation_uuid,
            email=email,
            company_name=company_name,
            token=token,
            expires_at=expires_at,
        )
    except EmailOutboxUnavailable:
        delivery_configuration_error = True
    await db.commit()
    await log_audit(db, action="COMPANY_INVITATION_CREATED", actor=current_user, resource_type="company_invitation", details=email)
    invite_url = f"{settings.frontend_url.rstrip('/')}/company/invite/accept?token={token}"
    email_sent, delivery_status, email_error = await _attempt_queued_delivery(db, delivery)
    if delivery_configuration_error:
        delivery_status = "failed"
    out: dict = {
        "detail": "invited",
        "invitation_id": inv_id,
        "invitation_url": invite_url,
        "email_sent": email_sent,
        "delivery_id": delivery.id if delivery else None,
        "delivery_status": delivery_status,
    }
    if email_error:
        out["email_error"] = email_error
    return out

@router.get("/company/invitations", response_model=dict)
async def list_company_invitations(
    current_user: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    res = await db.execute(text("SELECT ci.id, ci.email, ci.company_name, ci.contact_name, ci.contact_role, ci.status, ci.expires_at, ci.created_at, ci.accepted_at, ci.revoked_at, ci.company_id, u.email AS invited_by_email, (SELECT ed.status FROM email_deliveries ed WHERE ed.resource_type='company_invitation' AND ed.resource_id=ci.id ORDER BY ed.created_at DESC LIMIT 1) AS email_delivery_status FROM company_invitations ci LEFT JOIN users u ON u.id = ci.invited_by ORDER BY ci.created_at DESC"))
    rows = [dict(r) for r in res.mappings().all()]
    return {"invitations": rows}

@router.get("/company/invitations/{invitation_id}", response_model=dict)
async def get_company_invitation(
    invitation_id: UUID,
    current_user: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    res = await db.execute(text("SELECT ci.id, ci.email, ci.company_name, ci.contact_name, ci.contact_role, ci.status, ci.expires_at, ci.created_at, ci.accepted_at, ci.revoked_at, ci.company_id, u.email AS invited_by_email, (SELECT ed.status FROM email_deliveries ed WHERE ed.resource_type='company_invitation' AND ed.resource_id=ci.id ORDER BY ed.created_at DESC LIMIT 1) AS email_delivery_status FROM company_invitations ci LEFT JOIN users u ON u.id = ci.invited_by WHERE ci.id=:id"), {"id": str(invitation_id)})
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return {"invitation": dict(row)}

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
    await db.execute(text("UPDATE company_invitations SET status='revoked', revoked_at=:now WHERE id=:id"), {"now": datetime.utcnow(), "id": str(invitation_id)})
    await db.commit()
    await log_audit(db, action="COMPANY_INVITATION_REVOKED", actor=current_user, resource_type="company_invitation", resource_id=invitation_id)
    return {"detail": "revoked"}

@router.post("/company/invitations/{invitation_id}/resend", response_model=InvitationDeliveryOut)
async def resend_company_invitation(
    invitation_id: UUID,
    current_user: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    res = await db.execute(text("SELECT * FROM company_invitations WHERE id=:id FOR UPDATE"), {"id": str(invitation_id)})
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if row["status"] not in ("pending", "expired"):
        raise HTTPException(status_code=400, detail="Only pending or expired invitations can be resent")
    await db.execute(text("UPDATE company_invitations SET status='revoked', revoked_at=:now WHERE id=:id"), {"now": datetime.utcnow(), "id": str(invitation_id)})
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=COMPANY_INVITE_EXPIRY_DAYS)
    new_uuid = uuid4()
    new_id = str(new_uuid)
    await db.execute(
        text("INSERT INTO company_invitations (id, email, company_name, contact_name, contact_role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id, :email, :name, :cname, :crole, :hash, 'pending', :by, :exp, :now)"),
        {"id": new_id, "email": row["email"], "name": row["company_name"], "cname": row["contact_name"], "crole": row["contact_role"], "hash": _hash(token), "by": str(current_user.id), "exp": expires_at, "now": datetime.utcnow()},
    )
    delivery: EmailDelivery | None = None
    try:
        delivery = await _queue_company_invite_email(
            db,
            invitation_id=new_uuid,
            email=row["email"],
            company_name=row["company_name"],
            token=token,
            expires_at=expires_at,
        )
    except EmailOutboxUnavailable:
        pass
    await db.commit()
    await log_audit(db, action="COMPANY_INVITATION_RESENT", actor=current_user, resource_type="company_invitation", resource_id=UUID(new_id))
    invite_url = f"{settings.frontend_url.rstrip('/')}/company/invite/accept?token={token}"
    email_sent, delivery_status, email_error = await _attempt_queued_delivery(db, delivery)
    return {
        "detail": "resent",
        "invitation_id": new_id,
        "invitation_url": invite_url,
        "email_sent": email_sent,
        "email_error": email_error,
        "delivery_id": delivery.id if delivery else None,
        "delivery_status": delivery_status,
    }

@router.get("/company-invitations/validate", response_model=dict)
async def validate_company_invitation(
    db: Annotated[AsyncSession, Depends(get_db)],
    token: str = Query(..., min_length=10),
):
    """Public validation for the accept page. Never exposes token hash or user ids."""
    res = await db.execute(text("SELECT email, company_name, contact_name, status, expires_at FROM company_invitations WHERE token_hash=:h"), {"h": _hash(token)})
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Invalid invitation")
    status_val = row["status"]
    if status_val == "pending" and row["expires_at"] < datetime.utcnow():
        await db.execute(text("UPDATE company_invitations SET status='expired' WHERE token_hash=:h"), {"h": _hash(token)})
        await db.commit()
        status_val = "expired"
    return {
        "email": row["email"],
        "company_name": row["company_name"],
        "contact_name": row["contact_name"],
        "status": status_val,
        "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
    }

@router.post("/company/accept", response_model=dict)
async def accept_company_invite(
    data: CompanyInviteAcceptRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    token = data.token
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
    company = Company(name=row["company_name"], description="Invited company", status="active")
    db.add(company)
    await db.flush()
    user = User(email=row["email"], password_hash=hash_password(data.password), role=UserRole.COMPANY_USER, is_approved=True, full_name=data.full_name, company_id=company.id, company_role="OWNER")
    db.add(user)
    # SQLAlchemy's UUID default is assigned during flush, not necessarily when
    # the object is constructed. Flush before linking the company owner so the
    # accepted invitation can never create a company with a null owner.
    await db.flush()
    company.owner_id = user.id
    await db.execute(text("UPDATE company_invitations SET status='accepted', accepted_at=:now, company_id=:cid WHERE id=:id"), {"now": datetime.utcnow(), "cid": str(company.id), "id": row["id"]})
    await db.commit()
    await log_audit(db, action="COMPANY_CREATED", actor=user, company_id=company.id, resource_type="company", resource_id=company.id)
    return {"detail": "company created", "company_id": str(company.id)}


# ---------- Company OWNER/ADMIN -> Employee ----------
@router.post("/employee/invite", response_model=InvitationDeliveryOut)
async def invite_employee(
    data: EmployeeInviteCreateRequest,
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    email = str(data.email).strip().lower()
    role = data.role
    if not can(current_user.company_role, "invite_employees"):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        await require_capacity(db, current_user.company_id, "members")
    except EntitlementDenied as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
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
    token = secrets.token_urlsafe(32)
    token_hash = _hash(token)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=72)
    # Fetch company name for email
    comp_res = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = comp_res.scalar_one_or_none()
    company_name = company.name if company else "Your company"
    invitation_uuid = uuid4()
    invitation_id = str(invitation_uuid)
    await db.execute(
        text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id, :cid, :email, :role, :hash, 'pending', :by, :exp, :now)"),
        {"id": invitation_id, "cid": str(current_user.company_id), "email": email, "role": role, "hash": token_hash, "by": str(current_user.id), "exp": expires_at, "now": datetime.utcnow()},
    )
    delivery: EmailDelivery | None = None
    try:
        delivery = await _queue_employee_invite_email(
            db,
            invitation_id=invitation_uuid,
            email=email,
            company_name=company_name,
            role=role,
            token=token,
            expires_at=expires_at,
        )
    except EmailOutboxUnavailable:
        pass
    await db.commit()
    await log_audit(db, action="EMPLOYEE_INVITED", actor=current_user, company_id=current_user.company_id, resource_type="employee_invitation", details=f"{email}:{role}")
    email_sent, delivery_status, email_error = await _attempt_queued_delivery(db, delivery)
    invitation_url = f"{settings.frontend_url.rstrip('/')}/invite/employee?token={token}"
    return {
        "detail": "invited",
        "invitation_id": invitation_id,
        "invitation_url": invitation_url,
        "email_sent": email_sent,
        "email_error": email_error,
        "delivery_id": delivery.id if delivery else None,
        "delivery_status": delivery_status,
    }

@router.get("/employee/invitations", response_model=dict)
async def list_employee_invitations(
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    res = await db.execute(text("SELECT ei.id, ei.email, ei.role, ei.status, ei.expires_at, ei.created_at, ei.accepted_at, (SELECT ed.status FROM email_deliveries ed WHERE ed.resource_type='employee_invitation' AND ed.resource_id=ei.id ORDER BY ed.created_at DESC LIMIT 1) AS email_delivery_status FROM employee_invitations ei WHERE ei.company_id=:cid ORDER BY ei.created_at DESC"), {"cid": str(current_user.company_id)})
    rows = [dict(r) for r in res.mappings().all()]
    return {"invitations": rows}

@router.get("/employee/validate", response_model=dict)
async def validate_employee_invitation(
    db: Annotated[AsyncSession, Depends(get_db)],
    token: str = Query(..., min_length=10),
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

@router.post("/employee/resend", response_model=InvitationDeliveryOut)
async def resend_employee_invitation(
    data: EmployeeInviteResendRequest,
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Invalidate old pending token and issue new one — resend email."""
    inv_uuid = data.invitation_id
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
    new_uuid = uuid4()
    new_id = str(new_uuid)
    await db.execute(
        text("INSERT INTO employee_invitations (id, company_id, email, role, token_hash, status, invited_by, expires_at, created_at) VALUES (:id, :cid, :email, :role, :hash, 'pending', :by, :exp, :now)"),
        {"id": new_id, "cid": str(row["company_id"]), "email": row["email"], "role": row["role"], "hash": new_hash, "by": str(current_user.id), "exp": expires_at, "now": datetime.utcnow()},
    )
    # Fetch company name
    comp = await db.execute(select(Company).where(Company.id == row["company_id"]))
    company = comp.scalar_one_or_none()
    company_name = company.name if company else "Your company"
    delivery: EmailDelivery | None = None
    try:
        delivery = await _queue_employee_invite_email(
            db,
            invitation_id=new_uuid,
            email=row["email"],
            company_name=company_name,
            role=row["role"],
            token=new_token,
            expires_at=expires_at,
        )
    except EmailOutboxUnavailable:
        pass
    await db.commit()
    email_sent, delivery_status, email_error = await _attempt_queued_delivery(db, delivery)
    await log_audit(db, action="EMPLOYEE_INVITATION_RESENT", actor=current_user, company_id=current_user.company_id, resource_type="employee_invitation", resource_id=UUID(new_id), details=f"{row['email']}:{row['role']}")
    invitation_url = f"{settings.frontend_url.rstrip('/')}/invite/employee?token={new_token}"
    return {
        "detail": "resent",
        "invitation_id": new_id,
        "invitation_url": invitation_url,
        "email_sent": email_sent,
        "email_error": email_error,
        "delivery_id": delivery.id if delivery else None,
        "delivery_status": delivery_status,
    }

@router.post("/employee/accept", response_model=dict)
async def accept_employee_invite(
    data: EmployeeInviteAcceptRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """New-user flow: creates account. For existing users, use /employee/accept-existing."""
    token = data.token
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
    user = User(email=row["email"], password_hash=hash_password(data.password), role=UserRole.COMPANY_USER, is_approved=True, full_name=data.full_name, company_id=UUID(str(row["company_id"])), company_role=row["role"])
    db.add(user)
    await db.execute(text("UPDATE employee_invitations SET status='accepted', accepted_at=:now WHERE id=:id"), {"now": datetime.utcnow(), "id": row["id"]})
    await db.commit()
    await log_audit(db, action="EMPLOYEE_INVITATION_ACCEPTED", actor=user, company_id=user.company_id, resource_type="user", resource_id=user.id)
    return {"detail": "employee created"}

@router.post("/employee/accept-existing", response_model=dict)
async def accept_employee_existing(
    data: EmployeeInviteExistingAcceptRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Existing-user flow: authenticated user accepts invite bound to their email."""
    token = data.token
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
