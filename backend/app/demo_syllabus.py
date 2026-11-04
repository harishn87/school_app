"""Sample syllabus for the local demo school, so the Syllabus pages have something to show.

Runs at start-up only when SEED_DEMO is on and the demo school has no syllabus saved yet for this academic year.
"""
import random

from .routers.syllabus import default_window, target_percent
from .utils import current_year, new_id, now_iso, today_ist

GAPS = [8, 3, -2, -4, -8, -11, -14, -19, -23, 1, -9, -30]   # points ahead (+) or behind (-) today's target, class by class


def _subjects(idx: int) -> list:
    return ["English", "Numbers", "Drawing"] if idx < 2 else ["Maths", "English", "Science", "Social"]


def _split(total: int, n: int) -> list:
    out, left = [], total * n
    for _ in range(n):
        v = min(100, left)
        out.append(int(round(v / 5.0) * 5))
        left -= v
    return out


async def seed_demo_subject_teachers(db) -> int:
    """Give each demo class its subjects, with different teachers taking different subjects (only where none are set)."""
    teachers = await db.users.find({"role": "teacher", "active": {"$ne": False}}, {"_id": 0, "id": 1}).sort("email", 1).to_list(100)
    classes = await db.classes.find({"subjects": {"$exists": False}}, {"_id": 0}).sort("name", 1).to_list(200)
    if len(teachers) < 2:
        return 0
    for idx, c in enumerate(classes):
        subs = [{"name": n, "teacher_id": teachers[(idx + i) % len(teachers)]["id"] if i else c.get("teacher_id")} for i, n in enumerate(_subjects(idx))]
        await db.classes.update_one({"id": c["id"]}, {"$set": {"subjects": subs}})
    return len(classes)


async def seed_demo_syllabus(db) -> int:
    year, today = current_year(), today_ist()
    await seed_demo_subject_teachers(db)
    if await db.syllabus.count_documents({"academic_year": year}):
        return 0
    classes = await db.classes.find({}, {"_id": 0, "id": 1, "name": 1}).sort("name", 1).to_list(200)
    made = 0
    for idx, c in enumerate(classes):
        rr = random.Random(f"syl{c['id']}")
        gap = GAPS[idx % len(GAPS)]
        for term in ("Term 1", "Term 2"):
            a, b = default_window(term, year)
            tgt = target_percent(a, b, today)
            level = None if tgt >= 100 else max(0, min(100, tgt + gap))
            subs = []
            for name in _subjects(idx):
                avg = rr.choice([96, 100, 100, 92]) if level is None else max(0, min(100, level + rr.randint(-8, 8)))
                chapters = [{"title": f"{name}: Unit {u}", "percent": v} for u, v in zip(range(1, 5), _split(avg, 4))]
                subs.append({"name": name, "percent": 0, "chapters": chapters, "note": None})
            await db.syllabus.insert_one({
                "id": new_id(), "class_id": c["id"], "term": term, "academic_year": year,
                "start_date": a.isoformat(), "end_date": b.isoformat(), "subjects": subs,
                "updated_at": now_iso(), "updated_by": "demo", "updated_by_name": "Demo data",
                "last_update_date": today.isoformat(), "created_at": now_iso()})
        made += 1
    return made
