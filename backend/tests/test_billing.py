"""Billing in manual mode (Razorpay keys not set): the default until online payments are switched on."""
from conftest import PASSWORD, signup


def _platform(new_client):
    c = new_client()
    assert c.post("/api/platform/auth/login", json={"email": "owner@platform.example.com",
                                                    "password": "OwnerPass#2026"}).status_code == 200
    return c


def test_overview_is_manual_mode_without_razorpay_keys(server):
    signup(server, "greenwood")
    data = server.get("/api/billing").json()
    assert data["mode"] == "manual"
    assert [p["id"] for p in data["plans"]] == ["basic", "pro"]
    assert all(not any(p["online"].values()) for p in data["plans"])
    assert data["plans"][0]["price_inr_year"] == 29990
    assert data["payments"] == []


def test_online_checkout_is_off_without_keys(server):
    signup(server, "greenwood")
    r = server.post("/api/billing/checkout", json={"plan": "basic", "interval": "monthly"})
    assert r.status_code == 400 and "not set up" in r.json()["detail"]


def test_webhook_rejected_without_secret(server):
    r = server.post("/api/billing/webhook/razorpay", content=b"{}", headers={"X-Razorpay-Signature": "x"})
    assert r.status_code == 400


def test_upgrade_request_blocked_if_school_too_big_for_plan(server, monkeypatch):
    from app import plans
    signup(server, "greenwood")
    server.post("/api/students", json={"first_name": "A", "last_name": "B", "joining_date": "2025-06-01"})
    monkeypatch.setitem(plans.PLANS, "basic", {**plans.PLANS["basic"], "max_students": 0})
    assert server.post("/api/billing/upgrade-request", json={"plan": "basic"}).status_code == 400
    assert server.post("/api/billing/upgrade-request", json={"plan": "pro"}).status_code == 200


def test_owner_records_manual_payment(server, new_client):
    out = signup(server, "greenwood")
    sid = out["school"]["id"]
    owner = _platform(new_client)
    r = owner.post(f"/api/platform/schools/{sid}/payments",
                   json={"plan": "basic", "interval": "yearly", "amount_inr": 29990, "reference": "UPI 12345"})
    assert r.status_code == 201, r.text
    assert r.json()["plan"] == "basic" and r.json()["subscription"]["days_left"] >= 364

    # Paying again early extends from the current end date, not from today
    first_end = r.json()["paid_until"]
    r2 = owner.post(f"/api/platform/schools/{sid}/payments",
                    json={"plan": "basic", "interval": "monthly", "amount_inr": 2999})
    assert r2.json()["paid_until"] > first_end

    stats = owner.get("/api/platform/stats").json()
    assert stats["paying_schools"] == 1 and stats["mrr_inr"] == 2999  # now billed monthly
    assert stats["revenue_last_30d_inr"] == 29990 + 2999
    assert len(owner.get("/api/platform/payments").json()) == 2

    # The school sees its payment history
    billing = server.get("/api/billing").json()
    assert [p["amount_inr"] for p in billing["payments"]] == [2999, 29990]
    assert billing["school"]["plan"] == "basic"
