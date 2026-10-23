"""Passwords, JWTs, auth cookies, and the request dependencies that resolve the current school/user."""
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response

from .config import get_settings
from .db import get_school, platform_db, tenant_db
from .plans import subscription_state

ALGO = "HS256"

# Cookie names: school users and platform (super) admins get separate sessions.
SCHOOL_ACCESS, SCHOOL_REFRESH = "access_token", "refresh_token"
PLATFORM_ACCESS, PLATFORM_REFRESH = "platform_access", "platform_refresh"


# --- Passwords ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# --- Tokens ---
def _encode(payload: dict) -> str:
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGO)


def create_tokens(sub: str, scope: str, role: str, school_id: Optional[str] = None) -> tuple:
    s = get_settings()
    now = datetime.now(timezone.utc)
    base = {"sub": sub, "scope": scope, "role": role, "sid": school_id}
    access = _encode({**base, "type": "access", "iat": now,
                      "exp": now + timedelta(minutes=s.access_ttl_minutes)})
    refresh = _encode({**base, "type": "refresh", "jti": str(uuid.uuid4()), "iat": now,
                       "exp": now + timedelta(days=s.refresh_ttl_days)})
    return access, refresh


def decode(token: str, expected_type: str, expected_scope: str) -> dict:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
    if payload.get("type") != expected_type or payload.get("scope") != expected_scope:
        raise HTTPException(status_code=401, detail="Invalid session")
    return payload


def set_auth_cookies(response: Response, access: str, refresh: str, platform: bool = False) -> None:
    s = get_settings()
    a_name, r_name = (PLATFORM_ACCESS, PLATFORM_REFRESH) if platform else (SCHOOL_ACCESS, SCHOOL_REFRESH)
    common = dict(httponly=True, secure=s.cookie_secure, samesite=s.cookie_samesite)
    response.set_cookie(a_name, access, max_age=s.access_ttl_minutes * 60, path="/", **common)
    response.set_cookie(r_name, refresh, max_age=s.refresh_ttl_days * 86400, path="/api", **common)


def clear_auth_cookies(response: Response, platform: bool = False) -> None:
    a_name, r_name = (PLATFORM_ACCESS, PLATFORM_REFRESH) if platform else (SCHOOL_ACCESS, SCHOOL_REFRESH)
    response.delete_cookie(a_name, path="/")
    response.delete_cookie(r_name, path="/api")


def _token_from(request: Request, cookie_name: str) -> Optional[str]:
    token = request.cookies.get(cookie_name)
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token


# --- School (tenant) context ---
@dataclass
class TenantContext:
    user: dict
    school: dict
    db: object
    subscription: dict

    @property
    def role(self) -> str:
        return self.user["role"]


_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


async def _load_context(request: Request) -> TenantContext:
    token = _token_from(request, SCHOOL_ACCESS)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode(token, "access", "school")

    school = await get_school(payload.get("sid") or "")
    if not school:
        raise HTTPException(status_code=401, detail="School not found")
    sub = subscription_state(school)
    if sub["reason"] == "suspended":
        raise HTTPException(status_code=403, detail="This school's account is suspended. Contact support.")

    db = tenant_db(school["db_name"])
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return TenantContext(user=user, school=school, db=db, subscription=sub)


async def get_ctx(request: Request) -> TenantContext:
    """Current school + user. Blocks changes (not reads) when the subscription is inactive."""
    ctx = await _load_context(request)
    if request.method not in _SAFE_METHODS and not ctx.subscription["active"]:
        raise HTTPException(
            status_code=402,
            detail="Your subscription is not active. Ask your school admin to upgrade the plan.",
        )
    return ctx


async def get_ctx_any_state(request: Request) -> TenantContext:
    """Like get_ctx but allows changes even when the subscription lapsed (billing, logout)."""
    return await _load_context(request)


def require_roles(*roles: str):
    async def _dep(ctx: TenantContext = Depends(get_ctx)) -> TenantContext:
        if ctx.role not in roles:
            raise HTTPException(status_code=403, detail="You don't have permission to do this")
        return ctx
    return _dep


# --- Platform (super admin) ---
async def get_platform_admin(request: Request) -> dict:
    token = _token_from(request, PLATFORM_ACCESS)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode(token, "access", "platform")
    admin = await platform_db().platform_admins.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not admin or not admin.get("active", True):
        raise HTTPException(status_code=401, detail="Admin not found")
    return admin
