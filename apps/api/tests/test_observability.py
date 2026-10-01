from types import SimpleNamespace

import pytest
from fastapi import Request, Response

from app.observability import (
    REQUEST_COUNT,
    record_request_metrics,
    redact_event,
    redact_text,
    route_label,
)


def _request(raw_path: str, template: str | None = None, method: str = "GET") -> Request:
    scope = {
        "type": "http",
        "method": method,
        "path": raw_path,
        "headers": [],
        "route": SimpleNamespace(path=template) if template else None,
    }
    return Request(scope)


def test_route_labels_use_templates_and_bound_unmatched_paths():
    assert route_label(_request("/offers/secret-id", "/offers/{offer_id}")) == "/offers/{offer_id}"
    assert {
        route_label(_request(f"/random/{index}/token-value"))
        for index in range(1_000)
    } == {"<unmatched>"}


@pytest.mark.asyncio
async def test_metrics_record_failures_under_the_route_template():
    request = _request("/explode/private-id", "/explode/{item_id}")
    metric = REQUEST_COUNT.labels("GET", "/explode/{item_id}", "500")
    before = metric._value.get()

    async def fail(_request: Request) -> Response:
        raise RuntimeError("database failure for person@example.com?token=secret")

    with pytest.raises(RuntimeError):
        await record_request_metrics(request, fail)

    assert metric._value.get() == before + 1


def test_structured_and_free_form_secrets_are_redacted():
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature"
    event = redact_event(
        None,
        "info",
        {
            "event": f"failed for person@example.com Authorization: Bearer {jwt}",
            "password": "StrongPass123!",
            "nested": {
                "invite_token": "invite-secret",
                "message": "postgresql://user:database-password@db.example/app",
            },
        },
    )

    rendered = repr(event)
    for secret in (jwt, "person@example.com", "StrongPass123!", "invite-secret", "database-password"):
        assert secret not in rendered
    assert event["event"].startswith("failed for [REDACTED_EMAIL]")
    assert redact_text("https://app.test/accept?token=abc123&next=/") == (
        "https://app.test/accept?token=[REDACTED]&next=/"
    )
