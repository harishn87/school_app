"""Creating schools (tenants) and their databases."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException

from .config import get_settings
from .db import get_client, db_name_for_slug, ensure_tenant_indexes, platform_db, tenant_db, validate_slug
from .security import hash_password
from .utils import new_id, now_iso


async def slug_available(slug: str) -> bool:
    if validate_slug(slug):
        return False
    pdb = platform_db()
    if await pdb.schools.find_one({"slug": slug}, {"_id": 1}):
        return False
    # Also refuse if a database with that name already exists (e.g. left over from a deleted school).
    existing = await get_client().list_database_names()
    return db_name_for_slug(slug) not in existing


async def create_school(*, name: str, slug: str, admin_name: str, admin_email: str, password: str,
                        phone: Optional[str] = None, plan: str = "trial") -> dict:
    err = validate_slug(slug)
    if err:
        raise HTTPException(status_code=400, detail=err)
    if not await slug_available(slug):
        raise HTTPException(status_code=409, detail="That school code is already taken")

    s = get_settings()
    now = datetime.now(timezone.utc)
    school = {
        "id": new_id(),
        "name": name.strip(),
        "slug": slug,
        "db_name": db_name_for_slug(slug),
        "plan": plan,
        "status": "active",
        "trial_ends_at": (now + timedelta(days=s.trial_days)).isoformat(),
        "paid_until": None,
        "contact_email": admin_email.lower(),
        "contact_phone": phone,
        "upgrade_request": None,
        "created_at": now.isoformat(),
    }
    pdb = platform_db()
    try:
        await pdb.schools.insert_one(dict(school))
    except Exception:
        # Unique index on slug caught a race with a parallel signup.
        raise HTTPException(status_code=409, detail="That school code is already taken")

    db = tenant_db(school["db_name"])
    try:
        await ensure_tenant_indexes(db)
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email.lower(),
            "name": admin_name.strip(),
            "role": "admin",
            "active": True,
            "password_hash": hash_password(password),
            "created_at": now_iso(),
        })
    except Exception:
        # Roll back so a half-created school doesn't block the code.
        await pdb.schools.delete_one({"id": school["id"]})
        await get_client().drop_database(school["db_name"])
        raise
    return school


def public_school(school: dict) -> dict:
    from .plans import limits_for, subscription_state
    return {
        "id": school["id"],
        "name": school["name"],
        "slug": school["slug"],
        "plan": school.get("plan", "trial"),
        "plan_name": limits_for(school)["name"],
        "status": school.get("status", "active"),
        "trial_ends_at": school.get("trial_ends_at"),
        "paid_until": school.get("paid_until"),
        "subscription": subscription_state(school),
    }
