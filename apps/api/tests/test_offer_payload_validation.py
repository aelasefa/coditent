import pytest
from pydantic import ValidationError

from app.schemas import OfferCreate, OfferUpdate


def _create_payload() -> dict:
    return {
        "title": "Platform Engineer",
        "region": "Casablanca",
        "field": "Engineering",
        "type": "JOB",
        "description": "Build and operate the platform.",
        "requirements": "Strong Python and PostgreSQL experience.",
        "work_mode": "hybrid",
        "salary_min": 100_000,
        "salary_max": 150_000,
    }


def test_create_offer_accepts_structured_compensation_and_work_mode() -> None:
    offer = OfferCreate.model_validate(_create_payload())

    assert offer.salary_min == 100_000
    assert offer.salary_max == 150_000
    assert offer.work_mode == "hybrid"
    assert offer.company is None


@pytest.mark.parametrize("model", [OfferCreate, OfferUpdate])
def test_offer_payloads_keep_rejecting_ui_only_fields(model) -> None:
    payload = _create_payload()
    payload.update({"salaryRange": "$100k-$150k", "equity": "0.5%"})

    with pytest.raises(ValidationError) as exc_info:
        model.model_validate(payload)

    errors = {(error["loc"], error["type"]) for error in exc_info.value.errors()}
    assert (("salaryRange",), "extra_forbidden") in errors
    assert (("equity",), "extra_forbidden") in errors


@pytest.mark.parametrize("model", [OfferCreate, OfferUpdate])
def test_offer_payloads_reject_inverted_salary_ranges(model) -> None:
    payload = _create_payload()
    payload.update({"salary_min": 150_001, "salary_max": 150_000})

    with pytest.raises(ValidationError, match="salary_min must be less than or equal to salary_max"):
        model.model_validate(payload)


def test_update_offer_accepts_explicit_salary_clear_and_work_mode() -> None:
    offer = OfferUpdate.model_validate(
        {"salary_min": None, "salary_max": None, "work_mode": "on-site"}
    )

    assert offer.model_fields_set == {"salary_min", "salary_max", "work_mode"}
    assert offer.salary_min is None
    assert offer.salary_max is None
    assert offer.work_mode == "on-site"
