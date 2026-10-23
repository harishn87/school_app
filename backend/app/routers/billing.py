"""A school's plan, payments and subscription.

Two modes:
  * Razorpay (RAZORPAY_KEY_ID/SECRET set): schools subscribe and pay online; webhooks keep the plan in sync.
  * Manual (no keys): schools request an upgrade; the platform owner records payment in the console.
Works even when the school's subscription has lapsed, so they can always pay to restore access.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import razorpay
from ..billing_service import (_ts_to_iso, activate_subscription, plan_for_razorpay_plan_id, record_payment,
                               update_school)
from ..config import get_settings
from ..db import get_school, platform_db
from ..models import UpgradeRequestIn
from ..plans import INTERVALS, PAID_PLANS, PLANS, limits_for, price_for
from ..security import TenantContext, get_ctx_any_state
from ..tenants import public_school
from ..utils import now_iso

log = logging.getLogger("scholaris.billing")
router = APIRouter(prefix="/billing", tags=["billing"])

ACTIVE_RZP_STATES = ("created", "authenticated", "active", "pending", "halted")


class CheckoutIn(BaseModel):
    plan: Literal["basic", "pro"]
    interval: Literal["monthly", "yearly"] = "monthly"


class VerifyIn(BaseModel):
    razorpay_payment_id: str = Field(max_length=100)
    razorpay_subscription_id: str = Field(max_length=100)
    razorpay_signature: str = Field(max_length=200)


def _require_admin(ctx: TenantContext) -> None:
    if ctx.role != "admin":
        raise HTTPException(status_code=403, detail="Only the school admin can manage billing")


async def _usage(ctx: TenantContext) -> dict:
    return {
        "students": await ctx.db.students.count_documents({"status": "active"}),
        "staff": await ctx.db.users.count_documents({"role": {"$in": ["admin", "teacher"]}, "active": {"$ne": False}}),
    }


async def _check_fits(ctx: TenantContext, plan: str) -> None:
    usage = await _usage(ctx)
    lim = PLANS[plan]
    if usage["students"] > lim["max_students"] or usage["staff"] > lim["max_staff"]:
        raise HTTPException(status_code=400, detail=(
            f"Your school has {usage['students']} active students and {usage['staff']} staff, which is more than "
            f"the {lim['name']} plan allows ({lim['max_students']} / {lim['max_staff']})."))


async def _fresh_school(ctx: TenantContext) -> dict:
    school = await platform_db().schools.find_one({"id": ctx.school["id"]}, {"_id": 0})
    return school or ctx.school


# ---------- overview ----------
@router.get("")
async def billing_overview(ctx: TenantContext = Depends(get_ctx_any_state)):
    s = get_settings()
    school = await _fresh_school(ctx)
    limits = limits_for(school)
    usage = await _usage(ctx)
    mode = "razorpay" if s.razorpay_enabled else "manual"
    plans = []
    for pid in PAID_PLANS:
        p = PLANS[pid]
        plans.append({
            "id": pid, **p,
            "online": {iv: bool(mode == "razorpay" and s.razorpay_plan_id(pid, iv)) for iv in INTERVALS},
        })
    payments = await platform_db().payments.find({"school_id": school["id"]}, {"_id": 0}) \
        .sort("created_at", -1).to_list(50)
    billing = school.get("billing") or {}
    return {
        "mode": mode,
        "school": public_school(school),
        "usage": {**usage, "max_students": limits["max_students"], "max_staff": limits["max_staff"]},
        "plans": plans,
        "billing": {k: billing.get(k) for k in ("provider", "status", "plan", "interval", "cancel_at_period_end",
                                                  "scheduled_plan", "subscription_id")} if billing else None,
        "payments": payments,
        "upgrade_request": school.get("upgrade_request"),
        "grace_days": s.grace_days,
    }


# ---------- manual mode ----------
@router.post("/upgrade-request")
async def request_upgrade(payload: UpgradeRequestIn, ctx: TenantContext = Depends(get_ctx_any_state)):
    _require_admin(ctx)
    await _check_fits(ctx, payload.plan)
    req = {"plan": payload.plan, "note": payload.note, "requested_by": ctx.user["email"], "requested_at": now_iso()}
    await update_school(ctx.school["id"], {"upgrade_request": req})
    return {"ok": True, "upgrade_request": req}


# ---------- Razorpay: start a subscription ----------
@router.post("/checkout")
async def checkout(payload: CheckoutIn, ctx: TenantContext = Depends(get_ctx_any_state)):
    _require_admin(ctx)
    s = get_settings()
    client = razorpay.get_client()
    plan_id = s.razorpay_plan_id(payload.plan, payload.interval)
    if not plan_id:
        raise HTTPException(status_code=400, detail="This plan isn't available for online payment yet")
    school = await _fresh_school(ctx)
    billing = school.get("billing") or {}
    if billing.get("provider") == "razorpay" and billing.get("status") in ("authenticated", "active", "pending", "halted") \
            and not billing.get("cancel_at_period_end"):
        raise HTTPException(status_code=409, detail="You already have an active subscription. Use 'Change plan' instead.")
    await _check_fits(ctx, payload.plan)

    # If the school is still in its free trial, start billing when the trial ends (no lost trial days).
    start_at = None
    now = datetime.now(timezone.utc)
    if school.get("plan") == "trial" and school.get("trial_ends_at"):
        trial_end = datetime.fromisoformat(school["trial_ends_at"])
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=timezone.utc)
        if trial_end > now + timedelta(hours=1):
            start_at = int(trial_end.timestamp())
    # Or, if they're still paid up (e.g. resubscribing after cancelling), start when that period ends.
    elif school.get("paid_until"):
        paid_until = datetime.fromisoformat(school["paid_until"])
        if paid_until.tzinfo is None:
            paid_until = paid_until.replace(tzinfo=timezone.utc)
        if paid_until > now + timedelta(hours=1):
            start_at = int(paid_until.timestamp())

    try:
        sub = await client.create_subscription(
            plan_id=plan_id,
            total_count=10 if payload.interval == "yearly" else 120,
            notes={"school_id": school["id"], "school_code": school["slug"], "plan": payload.plan,
                   "interval": payload.interval},
            start_at=start_at,
        )
    except razorpay.RazorpayError as e:
        raise HTTPException(status_code=e.status, detail=e.message)

    await update_school(school["id"], {"billing": {
        **billing, "provider": "razorpay", "subscription_id": sub["id"], "status": sub.get("status", "created"),
        "plan": payload.plan, "interval": payload.interval, "cancel_at_period_end": False, "scheduled_plan": None,
        "starts_at": _ts_to_iso(start_at), "updated_at": now_iso(),
        # Keep the previous plan's details so an abandoned checkout doesn't change anything.
        "pending_checkout": True,
    }})
    return {
        "key_id": s.razorpay_key_id,
        "subscription_id": sub["id"],
        "name": s.billing_name,
        "description": f"{PLANS[payload.plan]['name']} plan ({payload.interval}) — {school['name']}",
        "amount_inr": price_for(payload.plan, payload.interval),
        "starts_after_trial": bool(start_at),
        "prefill": {"name": ctx.user["name"], "email": ctx.user["email"], "contact": school.get("contact_phone") or ""},
    }


@router.post("/verify")
async def verify_checkout(payload: VerifyIn, ctx: TenantContext = Depends(get_ctx_any_state)):
    """Called by the browser after Razorpay Checkout succeeds. Webhooks confirm the same thing server-to-server."""
    _require_admin(ctx)
    school = await _fresh_school(ctx)
    billing = school.get("billing") or {}
    if payload.razorpay_subscription_id != billing.get("subscription_id"):
        raise HTTPException(status_code=400, detail="Subscription does not match this school")
    if not razorpay.verify_checkout_signature(payload.razorpay_payment_id, payload.razorpay_subscription_id,
                                              payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    # Access runs until billing actually starts (end of trial / current period), else one period from now.
    paid_until = billing.get("starts_at")
    await activate_subscription(school, plan=billing["plan"], interval=billing["interval"],
                                paid_until=paid_until, status="authenticated")
    fresh = await platform_db().schools.find_one({"id": school["id"]}, {"_id": 0})
    b = dict(fresh.get("billing") or {})
    b.pop("pending_checkout", None)
    await update_school(school["id"], {"billing": b})
    return {"ok": True, "school": public_school(await get_school(school["id"]) or fresh)}


# ---------- Razorpay: manage ----------
@router.post("/cancel")
async def cancel(ctx: TenantContext = Depends(get_ctx_any_state)):
    _require_admin(ctx)
    school = await _fresh_school(ctx)
    billing = school.get("billing") or {}
    if billing.get("provider") != "razorpay" or billing.get("status") not in ACTIVE_RZP_STATES:
        raise HTTPException(status_code=400, detail="There is no active online subscription to cancel")
    client = razorpay.get_client()
    try:
        await client.cancel_subscription(billing["subscription_id"], at_cycle_end=True)
    except razorpay.RazorpayError as e:
        raise HTTPException(status_code=e.status, detail=e.message)
    await update_school(school["id"], {"billing": {**billing, "cancel_at_period_end": True, "updated_at": now_iso()}})
    return {"ok": True, "access_until": school.get("paid_until")}


@router.post("/change-plan")
async def change_plan(payload: CheckoutIn, ctx: TenantContext = Depends(get_ctx_any_state)):
    """Upgrade takes effect now (Razorpay prorates); downgrade at the end of the current period."""
    _require_admin(ctx)
    s = get_settings()
    school = await _fresh_school(ctx)
    billing = school.get("billing") or {}
    if billing.get("provider") != "razorpay" or billing.get("status") not in ("authenticated", "active"):
        raise HTTPException(status_code=400, detail="There is no active online subscription to change")
    if payload.interval != billing.get("interval"):
        raise HTTPException(status_code=400, detail=(
            "Switching between monthly and yearly isn't supported mid-subscription. "
            "Cancel, then subscribe to the yearly plan when the current period ends."))
    if payload.plan == billing.get("plan"):
        raise HTTPException(status_code=400, detail="You're already on this plan")
    plan_id = s.razorpay_plan_id(payload.plan, payload.interval)
    if not plan_id:
        raise HTTPException(status_code=400, detail="This plan isn't available for online payment yet")
    await _check_fits(ctx, payload.plan)

    upgrade = PLANS[payload.plan]["price_inr_month"] > PLANS[billing["plan"]]["price_inr_month"]
    client = razorpay.get_client()
    try:
        await client.update_subscription(billing["subscription_id"], plan_id=plan_id,
                                         schedule_change_at="now" if upgrade else "cycle_end")
    except razorpay.RazorpayError as e:
        raise HTTPException(status_code=e.status, detail=f"{e.message}. If you pay via UPI AutoPay, "
                                                         "cancel and resubscribe to change plans.")
    if upgrade:
        await update_school(school["id"], {"plan": payload.plan, "billing": {
            **billing, "plan": payload.plan, "scheduled_plan": None, "updated_at": now_iso()}})
    else:
        await update_school(school["id"], {"billing": {
            **billing, "scheduled_plan": payload.plan, "updated_at": now_iso()}})
    return {"ok": True, "effective": "now" if upgrade else "next_renewal"}


# ---------- Razorpay webhook ----------
@router.post("/webhook/razorpay", include_in_schema=False)
async def razorpay_webhook(request: Request):
    raw = await request.body()
    if not razorpay.verify_webhook_signature(raw, request.headers.get("X-Razorpay-Signature", "")):
        raise HTTPException(status_code=400, detail="Invalid signature")
    try:
        event = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_id = request.headers.get("X-Razorpay-Event-Id") or event.get("id") or ""
    pdb = platform_db()
    if event_id:
        if await pdb.billing_events.find_one({"event_id": event_id}, {"_id": 1}):
            return {"ok": True, "duplicate": True}
        try:
            await pdb.billing_events.insert_one({"event_id": event_id, "type": event.get("event"),
                                                 "received_at": now_iso()})
        except Exception:
            return {"ok": True, "duplicate": True}

    etype = event.get("event", "")
    body = event.get("payload", {})
    sub = (body.get("subscription") or {}).get("entity") or {}
    payment = (body.get("payment") or {}).get("entity") or {}
    if not sub:
        return {"ok": True, "ignored": etype}

    school_id = (sub.get("notes") or {}).get("school_id")
    school = None
    if school_id:
        school = await pdb.schools.find_one({"id": school_id}, {"_id": 0})
    if not school:
        school = await pdb.schools.find_one({"billing.subscription_id": sub.get("id")}, {"_id": 0})
    if not school:
        log.warning("Razorpay webhook %s for unknown subscription %s", etype, sub.get("id"))
        return {"ok": True, "ignored": "unknown subscription"}

    billing = dict(school.get("billing") or {})
    if billing.get("subscription_id") and billing["subscription_id"] != sub.get("id"):
        # An old/abandoned subscription — don't let it overwrite the current one.
        log.info("Ignoring %s for superseded subscription %s", etype, sub.get("id"))
        return {"ok": True, "ignored": "superseded subscription"}

    mapped = plan_for_razorpay_plan_id(sub.get("plan_id", "")) or (billing.get("plan"), billing.get("interval"))
    plan, interval = mapped
    current_end = _ts_to_iso(sub.get("current_end"))
    status = sub.get("status") or billing.get("status")
    log.info("Razorpay %s school=%s sub=%s status=%s", etype, school["slug"], sub.get("id"), status)

    if etype in ("subscription.authenticated", "subscription.activated", "subscription.charged",
                 "subscription.resumed", "subscription.updated"):
        if plan in PAID_PLANS:
            await activate_subscription(school, plan=plan, interval=interval,
                                        paid_until=current_end or billing.get("starts_at"),
                                        status="active" if etype != "subscription.authenticated" else "authenticated")
            school = await pdb.schools.find_one({"id": school["id"]}, {"_id": 0})
            b = dict(school.get("billing") or {})
            b.pop("pending_checkout", None)
            b["subscription_id"] = sub.get("id")
            b["provider"] = "razorpay"
            if b.get("scheduled_plan") == plan:
                b["scheduled_plan"] = None
            await update_school(school["id"], {"billing": b})
        if etype == "subscription.charged" and payment:
            await record_payment(school=school, provider="razorpay", amount_inr=payment.get("amount", 0) / 100,
                                 plan=plan, interval=interval, payment_id=payment.get("id"),
                                 subscription_id=sub.get("id"), period_end_iso=current_end,
                                 status=payment.get("status", "captured"))
    elif etype in ("subscription.pending", "subscription.halted", "subscription.paused"):
        await update_school(school["id"], {"billing": {**billing, "status": etype.split(".")[1], "updated_at": now_iso()}})
    elif etype in ("subscription.cancelled", "subscription.completed"):
        await update_school(school["id"], {"billing": {**billing, "status": etype.split(".")[1],
                                                       "cancel_at_period_end": True, "updated_at": now_iso()}})
    return {"ok": True}
