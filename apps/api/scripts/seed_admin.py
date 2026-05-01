import argparse
import asyncio
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


from app.database import AsyncSessionLocal
from app.services.admin_seed import seed_admin_user


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or normalize an admin user.")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--password", required=True, help="Admin password")
    parser.add_argument("--full-name", default="Platform Admin", help="Admin full name")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset password if the admin already exists",
    )
    return parser.parse_args()


async def main() -> None:
    args = _parse_args()
    async with AsyncSessionLocal() as db:
        user, created = await seed_admin_user(
            db,
            email=args.email,
            password=args.password,
            full_name=args.full_name,
            reset_password=args.reset_password,
        )

    action = "created" if created else "already existed and was normalized"
    print(f"Admin user {action}: {user.email}")


if __name__ == "__main__":
    asyncio.run(main())
