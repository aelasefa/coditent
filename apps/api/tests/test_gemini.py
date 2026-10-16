from types import SimpleNamespace

import httpx
import pytest
from google.genai import errors

from app.services import gemini


class FakeModels:
    def __init__(self, outcomes: list[object]) -> None:
        self.outcomes = outcomes
        self.calls = 0
        self.requested_models: list[str] = []

    async def generate_content(self, **kwargs):
        self.requested_models.append(kwargs["model"])
        outcome = self.outcomes[self.calls]
        self.calls += 1
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class FakeAio:
    def __init__(self, models: FakeModels) -> None:
        self.models = models

    async def aclose(self) -> None:
        return None


def fake_client(models: FakeModels) -> SimpleNamespace:
    return SimpleNamespace(aio=FakeAio(models))


def response(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        text=text,
        candidates=[SimpleNamespace(finish_reason="STOP")],
    )


@pytest.fixture
def no_retry_sleep(monkeypatch):
    async def immediate_sleep(_delay: float) -> None:
        return None

    monkeypatch.setattr(gemini.asyncio, "sleep", immediate_sleep)


@pytest.mark.asyncio
async def test_generate_text_retries_server_error(monkeypatch, no_retry_sleep) -> None:
    models = FakeModels(
        [
            errors.ServerError(503, {"message": "unavailable"}),
            response("Recovered headline"),
        ]
    )
    monkeypatch.setattr(
        gemini,
        "get_gemini_client",
        lambda: fake_client(models),
    )

    text, finish_reason = await gemini.generate_text(
        "Write a headline",
        temperature=0.2,
        max_output_tokens=32,
    )

    assert text == "Recovered headline"
    assert finish_reason == "STOP"
    assert models.calls == 2


@pytest.mark.asyncio
async def test_generate_text_retries_rate_limit_and_empty_response(
    monkeypatch, no_retry_sleep
) -> None:
    models = FakeModels(
        [
            errors.ClientError(429, {"message": "rate limited"}),
            response(""),
            response("Third attempt succeeds"),
        ]
    )
    monkeypatch.setattr(
        gemini,
        "get_gemini_client",
        lambda: fake_client(models),
    )

    text, _ = await gemini.generate_text(
        "Write a headline",
        temperature=0.2,
        max_output_tokens=32,
    )

    assert text == "Third attempt succeeds"
    assert models.calls == 3


@pytest.mark.asyncio
async def test_generate_text_does_not_retry_non_rate_limit_client_error(
    monkeypatch, no_retry_sleep
) -> None:
    models = FakeModels(
        [
            errors.ClientError(400, {"message": "bad request"}),
            response("must not be called"),
        ]
    )
    monkeypatch.setattr(
        gemini,
        "get_gemini_client",
        lambda: fake_client(models),
    )

    with pytest.raises(errors.ClientError):
        await gemini.generate_text(
            "Write a headline",
            temperature=0.2,
            max_output_tokens=32,
        )

    assert models.calls == 1


@pytest.mark.asyncio
async def test_generate_text_skips_retries_and_falls_back_on_long_quota_exhaustion(
    monkeypatch, no_retry_sleep
) -> None:
    quota_error = errors.ClientError(
        429,
        {
            "error": {
                "message": "daily quota exceeded",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.RetryInfo",
                        "retryDelay": "3600s",
                    }
                ],
            }
        },
    )
    models = FakeModels([quota_error, response("Fallback succeeds")])
    monkeypatch.setattr(
        gemini,
        "get_gemini_client",
        lambda: fake_client(models),
    )

    text, _ = await gemini.generate_text(
        "Write a headline",
        temperature=0.2,
        max_output_tokens=32,
    )

    assert text == "Fallback succeeds"
    assert models.calls == 2
    assert models.requested_models == [
        gemini.settings.gemini_model,
        gemini.settings.gemini_fallback_model,
    ]


@pytest.mark.asyncio
async def test_generate_text_retries_transport_error(monkeypatch, no_retry_sleep) -> None:
    models = FakeModels(
        [
            httpx.ConnectError("connection failed"),
            response("Connected on retry"),
        ]
    )
    monkeypatch.setattr(
        gemini,
        "get_gemini_client",
        lambda: fake_client(models),
    )

    text, _ = await gemini.generate_text(
        "Write a headline",
        temperature=0.2,
        max_output_tokens=32,
    )

    assert text == "Connected on retry"
    assert models.calls == 2


@pytest.mark.asyncio
async def test_generate_text_falls_back_after_primary_remains_unavailable(
    monkeypatch, no_retry_sleep
) -> None:
    models = FakeModels(
        [
            errors.ServerError(503, {"message": "unavailable"}),
            errors.ServerError(503, {"message": "unavailable"}),
            errors.ServerError(503, {"message": "unavailable"}),
            response("Fallback succeeds"),
        ]
    )
    monkeypatch.setattr(
        gemini,
        "get_gemini_client",
        lambda: fake_client(models),
    )

    text, _ = await gemini.generate_text(
        "Write a headline",
        temperature=0.2,
        max_output_tokens=32,
    )

    assert text == "Fallback succeeds"
    assert models.requested_models == [
        gemini.settings.gemini_model,
        gemini.settings.gemini_model,
        gemini.settings.gemini_model,
        gemini.settings.gemini_fallback_model,
    ]
