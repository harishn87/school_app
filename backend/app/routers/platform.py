"""Super-admin (platform owner) API: manage every school on the platform."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .. import ratelimit
from ..db import invalidate_school, platform_db, tenant_db
from ..models import PlatformLoginIn, SchoolSignupIn, SchoolUpdateIn
from typing import Literal, Optional

from pydantic import BaseModel, Field

from ..billing_service import record_payment
from ..plans import limits_for, monthly_value, period_end, subscription_state
from ..security import (PLATFORM_REFRESH, clear_auth_cookies, create_tokens, decode, get_platform_admin,
                        set_auth_cookies, verify_password)
from ..tenants import create_school

router = APIRouter(prefix="/platform", tags=["platform"])


@router.post("/auth/login")
async def platform_login(payload: PlatformLoginIn, request: Request, response: Response):
    ratelimit.check(f"plogin:{ratelimit.client_ip(request)}", limit=10, window_seconds=300)
    admin = await platform_db().platform_admins.find_one({"email": payload.email.lower()})
    if not admin or not verify_password(payload.password, admin.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access, refresh = create_tokens(admin["id"], "platform", "superadmin")
    set_auth_cookies(response, access, refresh, platform=True)
    return {"id": admin["id"], "email": admin["email"], "name": admin.get("name", "Platform admin")}


@router.post("/auth/refresh")
async def platform_refresh(request: Request, response: Response):
    token = request.cookies.get(PLATFORM_REFRESH)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode(token, "refresh", "platform")
    admin = await platform_db().platform_admins.find_one({"id": payload["sub"]}, {"_id": 0})
    if not admin or not admin.get("active", True):
        raise HTTPException(status_code=401, detail="Session no longer valid")
    access, refresh = create_tokens(admin["id"], "platform", "superadmin")
    set_auth_cookies(response, access, refresh, platform=True)
    return {"ok": True}


@router.post("/auth/logout")
async def platform_logout(response: Response):
    clear_auth_cookies(response, platform=True)
    return {"ok": True}


@router.get("/auth/me")
async def platform_me(admin: dict = Depends(get_platform_admin)):
    return admin


async def _with_usage(school: dict) -> dict:
    db = tenant_db(school["db_name"])
    out = {k: v for k, v in school.items() if k != "_id"}
    out["usage"] = {
        "students": await db.students.count_documents({"status": "active"}),
        "staff": await db.users.count_documents({"role": {"$in": ["admin", "teacher"]}}),
    }
    out["limits"] = limits_for(school)
    out["subscription"] = subscription_state(school)
    return out


@router.get("/stats")
async def platform_stats(admin: dict = Depends(get_platform_admin)):
    schools = await platform_db().schools.find({}, {"_id": 0}).to_list(100000)
    by_plan: dict = {}
    active = 0
    pending = 0
    for s in schools:
        by_plan[s.get("plan", "trial")] = by_plan.get(s.get("plan", "trial"), 0) + 1
        if subscription_state(s)["active"]:
            active += 1
        if s.get("upgrade_request"):
            pending += 1
    mrr = 0.0
    paying = 0
    for s in schools:
        st = subscription_state(s)
        if st["active"] and s.get("plan") in ("basic", "pro") and not (s.get("billing") or {}).get("cancel_at_period_end"):
            paying += 1
            mrr += monthly_value(s["plan"], (s.get("billing") or {}).get("interval") or "monthly")
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    last30 = 0.0
    async for p in platform_db().payments.find({"created_at": {"$gte": since}, "status": "captured"}, {"amount_inr": 1}):
        last30 += p.get("amount_inr", 0)
    return {"total_schools": len(schools), "active_subscriptions": active, "by_plan": by_plan,
            "pending_upgrade_requests": pending, "paying_schools": paying, "mrr_inr": round(mrr),
            "revenue_last_30d_inr": round(last30)}


class ManualPaymentIn(BaseModel):
    plan: Literal["basic", "pro"]
    interval: Literal["monthly", "yearly"] = "monthly"
    amount_inr: float = Field(ge=0)
    reference: Optional[str] = Field(default=None, max_length=200)


@router.get("/payments")
async def list_payments(admin: dict = Depends(get_platform_admin)):
    return await platform_db().payments.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/schools/{school_id}/payments", status_code=201)
async def record_manual_payment(school_id: str, payload: ManualPaymentIn, admin: dict = Depends(get_platform_admin)):
    """Bank transfer / UPI received outside Razorpay: record it and extend the school's access by one period."""
    school = await platform_db().schools.find_one({"id": school_id}, {"_id": 0})
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    now = datetime.now(timezone.utc)
    base = now
    if school.get("paid_until") and school.get("plan") in ("basic", "pro"):
        cur = datetime.fromisoformat(school["paid_until"])
        cur = cur if cur.tzinfo else cur.replace(tzinfo=timezone.utc)
        if cur > now:
            base = cur  # renewing early extends from the current end date
    new_end = period_end(base, payload.interval).isoformat()
    billing = {**(school.get("billing") or {}), "provider": "manual", "plan": payload.plan,
               "interval": payload.interval, "status": "active", "cancel_at_period_end": False}
    await platform_db().schools.update_one({"id": school_id}, {"$set": {
        "plan": payload.plan, "paid_until": new_end, "billing": billing, "upgrade_request": None}})
    invalidate_school(school_id)
    await record_payment(school=school, provider="manual", amount_inr=payload.amount_inr, plan=payload.plan,
                         interval=payload.interval, period_end_iso=new_end, note=payload.reference,
                         recorded_by=admin["email"])
    school = await platform_db().schools.find_one({"id": school_id}, {"_id": 0})
    return await _with_usage(school)


@router.get("/schools")
async def list_schools(admin: dict = Depends(get_platform_admin)):
    schools = await platform_db().schools.find({}, {"_id": 0}).sort("created_at", -1).to_list(100000)
    return [await _with_usage(s) for s in schools]


@router.post("/schools", status_code=201)
async def create_school_as_admin(payload: SchoolSignupIn, admin: dict = Depends(get_platform_admin)):
    school = await create_school(name=payload.school_name, slug=payload.school_code, admin_name=payload.admin_name,
                                 admin_email=payload.admin_email, password=payload.password, phone=payload.phone)
    return await _with_usage(school)


@router.get("/schools/{school_id}")
async def get_school_detail(school_id: str, admin: dict = Depends(get_platform_admin)):
    school = await platform_db().schools.find_one({"id": school_id}, {"_id": 0})
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    return await _with_usage(school)


@router.patch("/schools/{school_id}")
async def update_school(school_id: str, payload: SchoolUpdateIn, admin: dict = Depends(get_platform_admin)):
    updates = payload.model_dump(exclude_none=True)
    clear_req = updates.pop("clear_upgrade_request", False)
    if clear_req or "plan" in updates:
        updates["upgrade_request"] = None
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await platform_db().schools.update_one({"id": school_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="School not found")
    invalidate_school(school_id)
    school = await platform_db().schools.find_one({"id": school_id}, {"_id": 0})
    return await _with_usage(school)
