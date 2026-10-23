"""Public self-serve signup: a school registers, gets its own database and a free trial."""
from fastapi import APIRouter, HTTPException, Query, Request, Response

from .. import ratelimit
from ..config import get_settings
from ..db import validate_slug
from ..models import SchoolSignupIn
from ..plans import PLANS
from ..security import create_tokens, set_auth_cookies
from ..tenants import create_school, public_school, slug_available

router = APIRouter(prefix="/schools", tags=["signup"])


@router.get("/plans")
async def list_plans():
    return [{"id": k, **v} for k, v in PLANS.items()]


@router.get("/check-code")
async def check_code(code: str = Query(min_length=1, max_length=40)):
    code = code.strip().lower()
    err = validate_slug(code)
    if err:
        return {"available": False, "reason": err}
    ok = await slug_available(code)
    return {"available": ok, "reason": None if ok else "That school code is already taken"}


@router.post("/signup", status_code=201)
async def signup(payload: SchoolSignupIn, request: Request, response: Response):
    if not get_settings().allow_signup:
        raise HTTPException(status_code=403, detail="New school signups are currently closed")
    ratelimit.check(f"signup:{ratelimit.client_ip(request)}", limit=5, window_seconds=3600)

    school = await create_school(
        name=payload.school_name, slug=payload.school_code, admin_name=payload.admin_name,
        admin_email=payload.admin_email, password=payload.password, phone=payload.phone,
    )
    # Log the new admin straight in.
    from ..db import tenant_db
    admin = await tenant_db(school["db_name"]).users.find_one({"email": payload.admin_email.lower()}, {"_id": 0})
    access, refresh = create_tokens(admin["id"], "school", "admin", school["id"])
    set_auth_cookies(response, access, refresh)
    return {
        "id": admin["id"], "email": admin["email"], "name": admin["name"], "role": "admin",
        "school": public_school(school),
    }
