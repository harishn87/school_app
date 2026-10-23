"""Move data from the old single-school database into a new school on the platform.

The previous version kept everything in one database (DB_NAME, e.g. "scholaris").
This copies users, classes, students, fees and attendance into a new school's own database.

Usage (from the backend folder, with MONGO_URL set in .env):
    python -m scripts.migrate_single_school --source-db scholaris --code my-school --name "My School"

The source database is not modified.
"""
import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.db import (db_name_for_slug, ensure_platform_indexes, ensure_tenant_indexes, get_client,  # noqa: E402
                    platform_db, validate_slug)
from app.utils import new_id  # noqa: E402

COLLECTIONS = ("users", "classes", "students", "fees", "attendance")


async def main(source_db: str, code: str, name: str, plan: str) -> None:
    err = validate_slug(code)
    if err:
        sys.exit(err)
    client = get_client()
    if source_db not in await client.list_database_names():
        sys.exit(f"Source database '{source_db}' not found")
    await ensure_platform_indexes()
    if await platform_db().schools.find_one({"slug": code}):
        sys.exit(f"A school with code '{code}' already exists")

    target_name = db_name_for_slug(code)
    src, dst = client[source_db], client[target_name]
    admin = await src.users.find_one({"role": "admin"}, {"_id": 0})

    now = datetime.now(timezone.utc)
    school = {
        "id": new_id(), "name": name, "slug": code, "db_name": target_name, "plan": plan, "status": "active",
        "trial_ends_at": (now + timedelta(days=get_settings().trial_days)).isoformat(), "paid_until": None,
        "contact_email": admin["email"] if admin else None, "contact_phone": None,
        "upgrade_request": None, "created_at": now.isoformat(),
    }
    await ensure_tenant_indexes(dst)
    for coll in COLLECTIONS:
        docs = [d async for d in src[coll].find({}, {"_id": 0})]
        if coll == "users":
            for d in docs:
                d.setdefault("active", True)
        if docs:
            await dst[coll].insert_many(docs)
        print(f"  {coll:<11} {len(docs)} copied")
    await platform_db().schools.insert_one(school)
    print(f"\nDone. School '{name}' created with code '{code}' (database {target_name}).")
    print("Users sign in with that school code and their existing email/password.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source-db", required=True)
    p.add_argument("--code", required=True, help="new school code, e.g. my-school")
    p.add_argument("--name", required=True, help="school display name")
    p.add_argument("--plan", default="trial", choices=["trial", "basic", "pro"])
    a = p.parse_args()
    asyncio.run(main(a.source_db, a.code.lower(), a.name, a.plan))
