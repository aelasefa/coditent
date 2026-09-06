"""
Centralized company role constants and permission matrix per spec §13.

Do not create another PostgreSQL enum — User.company_role is String,
validated here and in Pydantic.
"""
from typing import Literal

CompanyRole = Literal["OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"]

VALID_COMPANY_ROLES = {"OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"}

# Permission matrix — centralized, not scattered in handlers
PERMISSIONS = {
    "view_company": {"OWNER", "ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"},
    "edit_company": {"OWNER", "ADMIN"},
    "invite_employees": {"OWNER", "ADMIN"},
    "change_employee_roles": {"OWNER", "ADMIN"},
    "remove_employees": {"OWNER", "ADMIN"},
    "create_offers": {"OWNER", "ADMIN", "RECRUITER"},
    "edit_offers": {"OWNER", "ADMIN", "RECRUITER", "HIRING_MANAGER"},  # hiring_manager: assigned/allowed — allow for now
    "delete_offers": {"OWNER", "ADMIN"},
    "view_applications": {"OWNER", "ADMIN", "RECRUITER", "HIRING_MANAGER"},
    "evaluate_candidates": {"OWNER", "ADMIN", "RECRUITER", "HIRING_MANAGER"},
    "move_recruitment_stage": {"OWNER", "ADMIN", "RECRUITER", "HIRING_MANAGER"},
    "view_assessments": {"OWNER", "ADMIN", "RECRUITER", "HIRING_MANAGER"},
    "company_analytics": {"OWNER", "ADMIN", "RECRUITER", "HIRING_MANAGER"},
    "manage_subscription": {"OWNER"},
}

def can(role: str | None, action: str) -> bool:
    if not role:
        return False
    allowed = PERMISSIONS.get(action)
    if not allowed:
        return False
    return role in allowed

def validate_company_role(role: str) -> bool:
    return role in VALID_COMPANY_ROLES
