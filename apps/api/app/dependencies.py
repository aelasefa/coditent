import uuid
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.utils.jwt import verify_token


async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
    access_token_cookie: Annotated[str | None, Cookie(alias=settings.access_token_cookie_name)] = None,
) -> User:
    token: str | None = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
    elif access_token_cookie:
        token = access_token_cookie.strip()

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    try:
        payload = verify_token(token)
        subject = payload.get("sub")
        if not subject:
            raise ValueError("Missing subject")
        user_id = uuid.UUID(subject)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return user


async def require_authenticated_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user


async def require_platform_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    # Explicitly reject legacy ADMIN even if present in DB (migrated rows should be PLATFORM_ADMIN)
    if current_user.role.value == "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Legacy ADMIN role deprecated — use PLATFORM_ADMIN")
    if current_user.role.value != "PLATFORM_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: platform admin only")
    return current_user


async def require_company_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role.value == "RECRUITER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Legacy RECRUITER role deprecated — use COMPANY_USER")
    if current_user.role.value != "COMPANY_USER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: company user only")
    if not current_user.company_id or not current_user.company_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company membership required")
    return current_user


async def require_company_owner(
    current_user: Annotated[User, Depends(require_company_user)],
) -> User:
    if current_user.company_role != "OWNER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company owner only")
    return current_user


async def require_company_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    # Allow OWNER or ADMIN
    if current_user.role.value == "RECRUITER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Legacy RECRUITER deprecated")
    if current_user.role.value != "COMPANY_USER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if current_user.company_role not in {"OWNER", "ADMIN"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company admin only")
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company membership required")
    return current_user


async def require_company_member(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role.value == "RECRUITER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Legacy RECRUITER deprecated")
    if current_user.role.value != "COMPANY_USER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: company member only")
    if current_user.company_role not in {"OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid company role")
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company membership required")
    return current_user


# --- Legacy wrappers kept for backward compat during transition ---
async def require_candidate(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    # Legacy ADMIN also allowed for compat, but new PLATFORM_ADMIN not
    if current_user.role.value not in {"CANDIDATE", "ADMIN", "PLATFORM_ADMIN"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    # CANDIDATE must have no company
    if current_user.role.value == "CANDIDATE" and current_user.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate cannot have company")
    return current_user


async def require_recruiter(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    # New path: COMPANY_USER with any company_role is recruiter-like
    if current_user.role.value == "COMPANY_USER":
        if not current_user.company_id or not current_user.company_role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company membership required")
        if not current_user.is_approved:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company account pending approval")
        return current_user
    # Legacy path
    if current_user.role.value not in {"RECRUITER", "ADMIN", "PLATFORM_ADMIN"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if current_user.role.value == "RECRUITER" and not current_user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruiter account is pending admin approval",
        )
    return current_user


async def require_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    # New PLATFORM_ADMIN
    if current_user.role.value == "PLATFORM_ADMIN":
        return current_user
    if current_user.role.value == "ADMIN":
        # legacy ADMIN still allowed for transition, but log
        return current_user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def get_pagination(
    limit: int = Query(20, ge=1),
    offset: int = Query(0, ge=0),
) -> tuple[int, int]:
    max_limit = 50
    return min(limit, max_limit), offset
