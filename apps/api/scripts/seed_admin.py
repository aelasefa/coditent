import asyncio
import os
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


from app.config import settings
from app.database import AsyncSessionLocal
from app.services.admin_seed import seed_admin_user


def _get_required_env(name: str, fallback: str | None = None) -> str:
    value = (os.getenv(name) or fallback or "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


async def main() -> None:
    admin_email = _get_required_env("ADMIN_EMAIL", settings.admin_email)
    admin_password = _get_required_env("ADMIN_PASSWORD", settings.admin_password)
    admin_full_name = os.getenv("ADMIN_FULL_NAME", settings.admin_full_name).strip() or "Platform Admin"

    async with AsyncSessionLocal() as db:
        user, created = await seed_admin_user(
            db,
            email=admin_email,
            password=admin_password,
            full_name=admin_full_name,
        )

    action = "created" if created else "already existed and was normalized"
    print(f"Admin user {action}: {user.email}")


if __name__ == "__main__":
    asyncio.run(main())
