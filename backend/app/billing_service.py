"""Applying subscription changes to a school. Shared by the checkout flow, webhooks and the platform console."""
from datetime import datetime, timezone
from typing import Optional

from .config import get_settings
from .db import invalidate_school, platform_db
from .plans import PAID_PLANS, period_end, price_for
from .utils import new_id, now_iso


def plan_for_razorpay_plan_id(plan_id: str) -> Optional[tuple]:
    for key, value in get_settings().razorpay_plans.items():
        if value and value == plan_id:
            return key  # (plan, interval)
    return None


def _as_dt(iso: str) -> datetime:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _ts_to_iso(ts) -> Optional[str]:
    if not ts:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()


async def update_school(school_id: str, fields: dict) -> None:
    await platform_db().schools.update_one({"id": school_id}, {"$set": fields})
    invalidate_school(school_id)


async def activate_subscription(school: dict, *, plan: str, interval: str, paid_until: Optional[str],
                                status: str) -> None:
    """Switch the school onto a paid plan (idempotent)."""
    assert plan in PAID_PLANS
    billing = dict(school.get("billing") or {})
    billing.update({"plan": plan, "interval": interval, "status": status, "updated_at": now_iso()})
    fields = {"plan": plan, "billing": billing, "upgrade_request": None}
    # New access end: what the provider says, else one billing period from now. Never shorten paid access.
    candidate = paid_until or period_end(datetime.now(timezone.utc), interval).isoformat()
    current = school.get("paid_until")
    if not current or _as_dt(candidate) > _as_dt(current):
        fields["paid_until"] = candidate
    await update_school(school["id"], fields)


async def record_payment(*, school: dict, provider: str, amount_inr: float, plan: str, interval: Optional[str],
                         payment_id: Optional[str] = None, subscription_id: Optional[str] = None,
                         period_end_iso: Optional[str] = None, status: str = "captured",
                         note: Optional[str] = None, recorded_by: Optional[str] = None) -> Optional[dict]:
    """Adds a row to the payments ledger. Returns None if this payment_id was already recorded."""
    pdb = platform_db()
    if payment_id and await pdb.payments.find_one({"payment_id": payment_id}, {"_id": 1}):
        return None
    doc = {
        "id": new_id(), "school_id": school["id"], "school_name": school["name"], "provider": provider,
        "payment_id": payment_id, "subscription_id": subscription_id, "amount_inr": float(amount_inr),
        "currency": "INR", "plan": plan, "interval": interval, "status": status,
        "period_end": period_end_iso, "note": note, "recorded_by": recorded_by, "created_at": now_iso(),
    }
    row = {k: v for k, v in doc.items() if not (k == "payment_id" and v is None)}  # keep the unique index sparse
    try:
        await pdb.payments.insert_one(row)
    except Exception:
        return None  # unique index caught a duplicate delivered concurrently
    return doc


def list_price(plan: str, interval: str) -> int:
    return price_for(plan, interval)
