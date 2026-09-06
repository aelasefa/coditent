from __future__ import annotations

import logging
import time
from typing import Callable

import structlog
from fastapi import Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from app.config import settings

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status_code"],
)
REQUEST_LATENCY = Histogram(
    "http_request_latency_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
)


def configure_logging() -> None:
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.JSONRenderer(),
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)


async def record_request_metrics(request: Request, call_next: Callable) -> Response:
    start_time = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start_time
    REQUEST_LATENCY.labels(request.method, request.url.path).observe(elapsed)
    REQUEST_COUNT.labels(request.method, request.url.path, str(response.status_code)).inc()
    return response


def render_metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
