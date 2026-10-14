"""Audit-only reproduction; isolated SQLite, fake AI/Redis, no network."""
import asyncio
import sys
import types
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import AsyncAdaptedQueuePool


class Base(DeclarativeBase):
    pass


database_stub = types.ModuleType("app.database")
database_stub.Base = Base
sys.modules["app.database"] = database_stub

from app.models import AIJob
from app.services import ai_job_runner
from app.services.ai_jobs import content_fingerprint, dispatch_due_jobs, enqueue_ai_job


class FakeCapacityLease:
    async def renew(self):
        return True


@asynccontextmanager
async def fake_ai_capacity(*args, **kwargs):
    yield FakeCapacityLease()


async def fake_perform_job(db, job):
    return {"score": 81}


ai_job_runner.ai_capacity = fake_ai_capacity
ai_job_runner._perform_job = fake_perform_job


async def scenario(pool_size):
    path = Path(f"/tmp/coditent-audit-worker-pool-{pool_size}.sqlite")
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{path}",
        poolclass=AsyncAdaptedQueuePool,
        pool_size=pool_size,
        max_overflow=0,
        pool_timeout=0.2,
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(AIJob.__table__.create)
    async with factory() as db:
        job = await enqueue_ai_job(
            db,
            kind="audit_stub",
            actor_id=uuid.uuid4(),
            company_id=None,
            resource_id=uuid.uuid4(),
            payload={},
            source_fingerprint=content_fingerprint({"test": "pool"}),
        )
        job_id = job.id
        await db.commit()
        await dispatch_due_jobs(db, dispatcher_id="audit-dispatcher")
    outcome = await ai_job_runner.execute_ai_job(factory, job_id, worker_id="audit-worker")
    async with factory() as db:
        stored = (await db.execute(select(AIJob).where(AIJob.id == job_id))).scalar_one()
        print(
            f"pool_size={pool_size} max_overflow=0 outcome={outcome} "
            f"stored_status={stored.status} error_code={stored.last_error_code}"
        )
        expected = "pending" if pool_size == 1 else "completed"
        assert outcome == expected
        assert stored.status == expected
        if pool_size == 1:
            assert stored.last_error_code == "AI_JOB_TIMEOUTERROR"
    await engine.dispose()
    path.unlink()


async def main():
    await scenario(1)
    await scenario(2)


asyncio.run(main())
