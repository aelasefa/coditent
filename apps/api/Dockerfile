FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10
WORKDIR /build

COPY requirements.txt ./
# Every locked production dependency publishes a Python 3.12 Linux wheel.
# Refuse source builds so this stage never needs the large compiler toolchain
# that can exhaust Docker Desktop's memory during a parallel Compose build.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip wheel --only-binary=:all: --wheel-dir /wheels -r requirements.txt


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN groupadd --gid 10001 coditent \
    && useradd --uid 10001 --gid coditent --no-create-home --shell /usr/sbin/nologin coditent

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels /wheels/* \
    && rm -rf /wheels

COPY --chown=coditent:coditent . .

USER 10001:10001
EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--no-access-log"]
