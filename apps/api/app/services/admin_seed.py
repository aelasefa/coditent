from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserRole
from app.services.passwords import hash_password, validate_new_password


async def seed_admin_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    full_name: str,
    reset_password: bool = False,
) -> tuple[User, bool]:
    validate_new_password(password)
    normalized_email = email.strip().lower()
    normalized_full_name = full_name.strip() or "Platform Admin"

    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            email=normalized_email,
            password_hash=hash_password(password),
            role=UserRole.PLATFORM_ADMIN,
            is_approved=True,
            full_name=normalized_full_name,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user, True

    updated = False
    if user.role != UserRole.PLATFORM_ADMIN:
        user.role = UserRole.PLATFORM_ADMIN
        updated = True
    if not user.is_approved:
        user.is_approved = True
        updated = True
    if not user.full_name.strip():
        user.full_name = normalized_full_name
        updated = True
    if reset_password:
        user.password_hash = hash_password(password)
        updated = True

    if updated:
        await db.commit()
        await db.refresh(user)

    return user, False
