"""MongoDB access.

Layout:
  <PLATFORM_DB>            schools, platform_admins
  <TENANT_DB_PREFIX><slug> users, classes, students, fees, attendance   (one database per school)
"""
import re
import time
from typing import Optional

import motor.motor_asyncio

from .config import get_settings

_client = None

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$")
RESERVED_SLUGS = {
    "admin", "api", "app", "platform", "www", "mail", "support", "help", "static",
    "assets", "login", "signup", "register", "demo-admin", "root", "system", "test",
}


def get_client():
    global _client
    if _client is None:
        _client = motor.motor_asyncio.AsyncIOMotorClient(get_settings().mongo_url, tz_aware=False)
    return _client


def reset_client() -> None:
    """Used by tests to start from an empty database."""
    global _client
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
    _client = None
    _school_cache.clear()


def platform_db():
    return get_client()[get_settings().platform_db]


def tenant_db(db_name: str):
    return get_client()[db_name]


def db_name_for_slug(slug: str) -> str:
    return get_settings().tenant_db_prefix + slug.replace("-", "_")


def validate_slug(slug: str) -> Optional[str]:
    """Returns an error message, or None if the school code is acceptable."""
    if not SLUG_RE.match(slug):
        return "School code must be 3-30 characters: lowercase letters, numbers and hyphens"
    if slug in RESERVED_SLUGS:
        return "That school code is reserved"
    return None


async def ensure_platform_indexes() -> None:
    pdb = platform_db()
    await pdb.schools.create_index("id", unique=True)
    await pdb.schools.create_index("slug", unique=True)
    await pdb.schools.create_index("db_name", unique=True)
    await pdb.platform_admins.create_index("email", unique=True)
    await pdb.schools.create_index("billing.subscription_id")
    await pdb.payments.create_index("payment_id", unique=True, sparse=True)
    await pdb.payments.create_index([("school_id", 1), ("created_at", -1)])
    await pdb.billing_events.create_index("event_id", unique=True)


async def ensure_tenant_indexes(db) -> None:
    await db.users.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.classes.create_index("id", unique=True)
    await db.students.create_index("id", unique=True)
    await db.students.create_index("class_id")
    await db.students.create_index("guardian_email")
    await db.fees.create_index("id", unique=True)
    await db.fees.create_index("student_id")
    await db.attendance.create_index([("student_id", 1), ("date", 1)], unique=True)
    await db.attendance.create_index("date")
    await db.buses.create_index("id", unique=True)
    await db.routes.create_index("id", unique=True)
    await db.transport.create_index("student_id", unique=True)
    await db.transport.create_index("route_id")
    await db.certificates.create_index("id", unique=True)
    await db.certificates.create_index("number", unique=True)
    await db.certificates.create_index("student_id")
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index([("class_id", 1), ("date", -1)])
    await db.reports.create_index("id", unique=True)
    try:    # older databases had one report per student and term; reports are now also per academic year
        await db.reports.drop_index("student_id_1_term_1")
    except Exception:
        pass
    await db.reports.create_index([("student_id", 1), ("term", 1), ("academic_year", 1)], unique=True)
    await db.reports.create_index("class_id")
    await db.holidays.create_index("id", unique=True)
    await db.holidays.create_index("date")


# --- Small in-process cache of school records (avoids a platform lookup on every request) ---
_SCHOOL_TTL_SECONDS = 15
_school_cache: dict = {}


async def get_school(school_id: str) -> Optional[dict]:
    hit = _school_cache.get(school_id)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    doc = await platform_db().schools.find_one({"id": school_id}, {"_id": 0})
    if doc:
        _school_cache[school_id] = (time.monotonic() + _SCHOOL_TTL_SECONDS, doc)
    return doc


def invalidate_school(school_id: str) -> None:
    _school_cache.pop(school_id, None)
