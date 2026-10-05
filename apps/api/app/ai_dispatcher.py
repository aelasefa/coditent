"""Recoverable transactional-outbox dispatcher for durable AI jobs."""
from __future__ import annotations

import asyncio
import os
import signal
import socket
import uuid
from contextlib import suppress

from app.cache import get_async_redis
from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.health import DISPATCHER_HEARTBEAT_KEY
from app.observability import get_logger
from app.services.ai_jobs import run_dispatch_cycle
from app.services.email_outbox import run_email_delivery_cycle
from app.services.privacy import run_account_deletion_cycle


logger = get_logger("ai")


async def _send(job_id: str) -> None:
    from app.tasks import execute_ai_job_task

    await asyncio.to_thread(execute_ai_job_task.delay, job_id)


async def _heartbeat() -> None:
    await get_async_redis().set(
        DISPATCHER_HEARTBEAT_KEY,
        "alive",
        ex=settings.worker_heartbeat_ttl_seconds,
    )


async def run() -> None:
    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        with suppress(NotImplementedError):
            loop.add_signal_handler(signum, stopped.set)

    dispatcher_id = (
        f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:12]}"[:100]
    )
    interval = settings.ai_dispatch_interval_seconds
    try:
        while not stopped.is_set():
            try:
                await _heartbeat()
                dispatched = await run_dispatch_cycle(
                    AsyncSessionLocal,
                    _send,
                    dispatcher_id=dispatcher_id,
                )
                if dispatched:
                    logger.info("ai_outbox_dispatched", count=dispatched)
                email_deliveries = await run_email_delivery_cycle(
                    AsyncSessionLocal,
                    worker_id=f"email:{dispatcher_id}"[:100],
                )
                if email_deliveries:
                    logger.info("email_outbox_processed", count=email_deliveries)
                async with AsyncSessionLocal() as privacy_db:
                    deletions = await run_account_deletion_cycle(
                        privacy_db,
                        worker_id=f"privacy:{dispatcher_id}"[:100],
                    )
                if deletions:
                    logger.info("account_deletions_processed", count=deletions)
            except Exception as exc:
                logger.error(
                    "ai_outbox_dispatch_failed",
                    exception_type=type(exc).__name__,
                )
            try:
                await asyncio.wait_for(stopped.wait(), timeout=interval)
            except TimeoutError:
                pass
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run())
