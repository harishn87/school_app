"""Login / refresh / logout for school users. Users sign in with their school code + email + password."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .. import ratelimit
from ..db import get_school, platform_db, tenant_db
from ..models import ChangePasswordIn, LoginIn
from ..security import (SCHOOL_REFRESH, TenantContext, clear_auth_cookies, create_tokens, decode,
                        get_ctx_any_state, hash_password, set_auth_cookies, verify_password)
from ..tenants import public_school

router = APIRouter(prefix="/auth", tags=["auth"])

_BAD_LOGIN = "Invalid school code, email or password"


def _user_out(user: dict, school: dict) -> dict:
    return {
        "id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"],
        "created_at": user.get("created_at"), "school": public_school(school),
    }


@router.post("/login")
async def login(payload: LoginIn, request: Request, response: Response):
    ratelimit.check(f"login:{ratelimit.client_ip(request)}:{payload.email.lower()}", limit=10, window_seconds=300)

    school = await platform_db().schools.find_one({"slug": payload.school_code}, {"_id": 0})
    if not school:
        raise HTTPException(status_code=401, detail=_BAD_LOGIN)
    if school.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="This school's account is suspended. Contact support.")

    db = tenant_db(school["db_name"])
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail=_BAD_LOGIN)
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Your account has been disabled. Contact your school admin.")

    access, refresh = create_tokens(user["id"], "school", user["role"], school["id"])
    set_auth_cookies(response, access, refresh)
    return {**_user_out(user, school), "access_token": access}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get(SCHOOL_REFRESH)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode(token, "refresh", "school")
    school = await get_school(payload.get("sid") or "")
    if not school or school.get("status") == "suspended":
        clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Session no longer valid")
    user = await tenant_db(school["db_name"]).users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or not user.get("active", True):
        clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Session no longer valid")
    access, new_refresh = create_tokens(user["id"], "school", user["role"], school["id"])
    set_auth_cookies(response, access, new_refresh)
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(ctx: TenantContext = Depends(get_ctx_any_state)):
    return _user_out(ctx.user, ctx.school)


@router.post("/change-password")
async def change_password(payload: ChangePasswordIn, ctx: TenantContext = Depends(get_ctx_any_state)):
    full = await ctx.db.users.find_one({"id": ctx.user["id"]})
    if not verify_password(payload.current_password, full.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await ctx.db.users.update_one({"id": ctx.user["id"]},
                                  {"$set": {"password_hash": hash_password(payload.new_password)}})
    return {"ok": True}
