"""Test setup: runs the API in-process against an in-memory MongoDB (mongomock-motor).

No real MongoDB or running server is needed:  cd backend && pytest
"""
import os
import sys
from pathlib import Path

import pytest

os.environ.update({
    "ENV": "test",
    "JWT_SECRET": "test-secret-0123456789-0123456789-abcdef",
    "SUPERADMIN_EMAIL": "owner@platform.example.com",
    "SUPERADMIN_PASSWORD": "OwnerPass#2026",
    "SEED_DEMO": "false",
    "COOKIE_SECURE": "false",
    "TRIAL_DAYS": "14",
})

import motor.motor_asyncio  # noqa: E402
import mongomock_motor  # noqa: E402

motor.motor_asyncio.AsyncIOMotorClient = mongomock_motor.AsyncMongoMockClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app import db as app_db, ratelimit  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "Str0ngPass!"


@pytest.fixture()
def server():
    app_db.reset_client()
    ratelimit.reset()
    with TestClient(app) as c:  # runs startup (indexes, super admin)
        yield c
    app_db.reset_client()


@pytest.fixture()
def new_client(server):
    """Factory for separate browser-like sessions (each has its own cookies)."""
    def make():
        return TestClient(app)
    return make


def signup(client, code, name=None, email=None):
    r = client.post("/api/schools/signup", json={
        "school_name": name or f"{code.title()} School",
        "school_code": code,
        "admin_name": "Admin",
        "admin_email": email or f"admin@{code}.example.com",
        "password": PASSWORD,
    })
    assert r.status_code == 201, r.text
    return r.json()


def login(client, code, email, password=PASSWORD):
    return client.post("/api/auth/login", json={"school_code": code, "email": email, "password": password})
