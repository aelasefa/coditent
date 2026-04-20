from typing import Annotated

from fastapi import FastAPI
from fastapi import Depends
from fastapi.middleware.cors import CORSMiddleware

from app.database import AsyncSessionLocal
from app.dependencies import get_current_user
from app.models import User
from app.routers import auth, candidates, offers, recommendations
from app.routers.auth import ensure_default_admin_account


app = FastAPI(
    title="CODITENT API",
    description="AI-powered job and internship recommendation system for Morocco",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(candidates.router, prefix="/candidates", tags=["Candidates"])
app.include_router(offers.router, prefix="/offers", tags=["Offers"])
app.include_router(recommendations.router, prefix="/recommendations", tags=["Recommendations"])


@app.on_event("startup")
async def seed_default_admin_user() -> None:
    async with AsyncSessionLocal() as session:
        await ensure_default_admin_account(session)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/protected")
async def protected(
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, str]:
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role.value,
    }
