from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, candidates, offers, recommendations


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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
