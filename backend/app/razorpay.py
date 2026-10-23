"""Minimal async Razorpay client (Subscriptions API) and signature checks.

Docs: https://razorpay.com/docs/api/payments/subscriptions/
Amounts in the Razorpay API are in paise (₹1 = 100 paise).
"""
import hashlib
import hmac
from typing import Optional

from fastapi import HTTPException

from .config import get_settings

API_BASE = "https://api.razorpay.com/v1"


class RazorpayError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message = message
        self.status = status


class RazorpayClient:
    def __init__(self, key_id: str, key_secret: str, base_url: str = API_BASE):
        self.key_id = key_id
        self._auth = (key_id, key_secret)
        self.base_url = base_url

    async def _request(self, method: str, path: str, json: Optional[dict] = None) -> dict:
        import httpx  # only needed once online payments are switched on
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.request(method, f"{self.base_url}{path}", json=json, auth=self._auth)
        except httpx.HTTPError as e:
            raise RazorpayError(f"Could not reach Razorpay: {e.__class__.__name__}")
        if resp.status_code >= 400:
            try:
                desc = resp.json().get("error", {}).get("description") or resp.text
            except ValueError:
                desc = resp.text
            raise RazorpayError(f"Razorpay: {desc}", status=400 if resp.status_code < 500 else 502)
        return resp.json()

    async def create_plan(self, *, name: str, amount_inr: int, period: str, interval: int = 1, notes: dict = None) -> dict:
        return await self._request("POST", "/plans", {
            "period": period, "interval": interval,
            "item": {"name": name, "amount": amount_inr * 100, "currency": "INR"},
            "notes": notes or {},
        })

    async def create_subscription(self, *, plan_id: str, total_count: int, notes: dict,
                                  start_at: Optional[int] = None) -> dict:
        body = {"plan_id": plan_id, "total_count": total_count, "customer_notify": 1, "notes": notes}
        if start_at:
            body["start_at"] = start_at
        return await self._request("POST", "/subscriptions", body)

    async def fetch_subscription(self, sub_id: str) -> dict:
        return await self._request("GET", f"/subscriptions/{sub_id}")

    async def cancel_subscription(self, sub_id: str, at_cycle_end: bool = True) -> dict:
        return await self._request("POST", f"/subscriptions/{sub_id}/cancel",
                                   {"cancel_at_cycle_end": 1 if at_cycle_end else 0})

    async def update_subscription(self, sub_id: str, *, plan_id: str, schedule_change_at: str = "now") -> dict:
        return await self._request("PATCH", f"/subscriptions/{sub_id}",
                                   {"plan_id": plan_id, "schedule_change_at": schedule_change_at,
                                    "customer_notify": 1})


# Tests replace this factory with a fake client.
def _default_factory() -> RazorpayClient:
    s = get_settings()
    return RazorpayClient(s.razorpay_key_id, s.razorpay_key_secret)


client_factory = _default_factory


def get_client() -> RazorpayClient:
    if not get_settings().razorpay_enabled:
        raise HTTPException(status_code=400, detail="Online payments are not set up yet. Please request an upgrade instead.")
    return client_factory()


# --- Signatures ---
def _hmac_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_checkout_signature(payment_id: str, subscription_id: str, signature: str) -> bool:
    """Checkout success handler signature: HMAC_SHA256(payment_id + '|' + subscription_id, key_secret)."""
    expected = _hmac_hex(get_settings().razorpay_key_secret, f"{payment_id}|{subscription_id}".encode())
    return hmac.compare_digest(expected, signature or "")


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    secret = get_settings().razorpay_webhook_secret
    if not secret:
        return False
    return hmac.compare_digest(_hmac_hex(secret, raw_body), signature or "")
