from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.dependencies import get_current_user
from app.limiter import limiter
from app.models import User
from app.observability import configure_logging, get_logger, record_request_metrics, render_metrics
from app.routers import admin, auth, candidates, offers, recommendations


app = FastAPI(
    title="CODITENT API",
    description="AI-powered job and internship recommendation system for Morocco",
    version="1.0.0",
)
configure_logging()
logger = get_logger("app")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(record_request_metrics)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(admin.router, tags=["Admin"])
app.include_router(candidates.router, prefix="/candidates", tags=["Candidates"])
app.include_router(offers.router, prefix="/offers", tags=["Offers"])
app.include_router(recommendations.router, prefix="/recommendations", tags=["Recommendations"])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/metrics")
async def metrics() -> Response:
    return render_metrics()


@app.get("/protected")
async def protected(
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, str]:
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role.value,
    }


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> Response:
    logger.error("unhandled_exception", path=request.url.path, error=str(exc))
    return Response(content="Internal Server Error", status_code=500)
