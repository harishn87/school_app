"""Subscription plans and the rules for whether a school's subscription is active.

Prices are in INR (whole rupees, GST-exclusive). Yearly = 10x monthly (2 months free).
Razorpay plan amounts must match these — scripts/razorpay_setup.py creates them from this file.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

PLANS = {
    "trial": {"name": "Free trial", "max_students": 100, "max_staff": 10, "price_inr_month": 0, "price_inr_year": 0},
    "basic": {"name": "Basic", "max_students": 500, "max_staff": 25, "price_inr_month": 2999, "price_inr_year": 29990},
    "pro": {"name": "Pro", "max_students": 5000, "max_staff": 200, "price_inr_month": 7999, "price_inr_year": 79990},
}

PLAN_IDS = tuple(PLANS.keys())
PAID_PLANS = ("basic", "pro")
INTERVALS = ("monthly", "yearly")


def price_for(plan: str, interval: str) -> int:
    p = PLANS[plan]
    return p["price_inr_year"] if interval == "yearly" else p["price_inr_month"]


def monthly_value(plan: str, interval: Optional[str]) -> float:
    """Monthly-equivalent revenue, for MRR."""
    if plan not in PAID_PLANS:
        return 0.0
    return price_for(plan, "yearly") / 12 if interval == "yearly" else float(price_for(plan, "monthly"))


def period_end(start: datetime, interval: str) -> datetime:
    return start + (timedelta(days=365) if interval == "yearly" else timedelta(days=30))


def _parse(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def subscription_state(school: dict) -> dict:
    """Returns {active, reason, warning, days_left}.

    reason  -> why access is blocked (suspended / trial_expired / payment_due), else None
    warning -> shown while still active (payment_failed / cancelling), else None
    """
    from .config import get_settings

    now = datetime.now(timezone.utc)
    billing = school.get("billing") or {}
    if school.get("status") == "suspended":
        return {"active": False, "reason": "suspended", "warning": None, "days_left": None}

    if school.get("plan", "trial") == "trial":
        ends = _parse(school.get("trial_ends_at"))
        if ends and ends <= now:
            return {"active": False, "reason": "trial_expired", "warning": None, "days_left": 0}
        days = max((ends - now).days, 0) if ends else None
        return {"active": True, "reason": None, "warning": None, "days_left": days}

    warning = None
    if billing.get("status") in ("pending", "halted"):
        warning = "payment_failed"
    elif billing.get("cancel_at_period_end"):
        warning = "cancelling"

    paid_until = _parse(school.get("paid_until"))
    if paid_until is None:  # manually granted with no end date
        return {"active": True, "reason": None, "warning": warning, "days_left": None}
    if now <= paid_until:
        return {"active": True, "reason": None, "warning": warning, "days_left": (paid_until - now).days}

    grace_end = paid_until + timedelta(days=get_settings().grace_days)
    renewing = billing.get("status") in ("active", "pending", "halted") and not billing.get("cancel_at_period_end")
    if renewing and now <= grace_end:
        return {"active": True, "reason": None, "warning": "payment_failed", "days_left": 0}
    return {"active": False, "reason": "payment_due", "warning": None, "days_left": 0}


def limits_for(school: dict) -> dict:
    return PLANS.get(school.get("plan", "trial"), PLANS["trial"])
