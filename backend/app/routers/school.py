"""Day-to-day school data: users, classes, students, fees, attendance, dashboard.

Every handler works on ctx.db — the current school's own database — so one school
can never read or change another school's records.

Parents only ever see students whose guardian_email matches their login email.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..models import (AttendanceBatchIn, ClassIn, FeeIn, ResetPasswordIn, StudentIn, UserCreateIn,
                      UserUpdateIn)
from ..plans import limits_for
from ..security import TenantContext, get_ctx, hash_password, require_roles
from ..utils import current_year, new_id, now_iso, safe_regex, year_q

router = APIRouter(tags=["school"])

STAFF_ROLES = ("admin", "teacher")


# ---------- helpers ----------
def student_scope(ctx: TenantContext) -> dict:
    if ctx.role == "parent":
        return {"guardian_email": ctx.user["email"].lower()}
    return {}


def class_teacher_query(user_id: str) -> dict:
    """Classes where this user is the primary or the secondary teacher."""
    return {"$or": [{"teacher_id": user_id}, {"secondary_teacher_id": user_id}]}


async def teacher_class_ids(ctx: TenantContext) -> List[str]:
    """Classes assigned to this teacher (empty for other roles)."""
    if ctx.role != "teacher":
        return []
    return [c["id"] async for c in ctx.db.classes.find(class_teacher_query(ctx.user["id"]), {"_id": 0, "id": 1})]


async def scope_for(ctx: TenantContext, class_id: Optional[str] = None) -> dict:
    """Student query limited to what this user may see: all (admin), own classes (teacher), own children (parent)."""
    if ctx.role == "parent":
        q = student_scope(ctx)
        if class_id:
            q["class_id"] = class_id
        return q
    if ctx.role == "teacher":
        mine = await teacher_class_ids(ctx)
        if class_id:
            mine = [class_id] if class_id in mine else []
        return {"class_id": {"$in": mine}}
    return {"class_id": class_id} if class_id else {}


async def visible_student_ids(ctx: TenantContext) -> Optional[List[str]]:
    """None means 'all students' (admin); a list restricts a parent to their children or a teacher to their classes."""
    if ctx.role == "admin":
        return None
    rows = await ctx.db.students.find(await scope_for(ctx), {"_id": 0, "id": 1}).to_list(5000)
    return [r["id"] for r in rows]


async def require_own_class(ctx: TenantContext, class_id: Optional[str]) -> None:
    """Teachers may only work with students of their own classes."""
    if ctx.role == "teacher" and class_id not in await teacher_class_ids(ctx):
        raise HTTPException(status_code=403, detail="You can only manage students in classes assigned to you.")


def fee_status(amount: float, paid: float) -> str:
    if paid <= 0:
        return "unpaid"
    if paid >= amount:
        return "paid"
    return "partial"


async def _check_class(ctx: TenantContext, class_id: Optional[str]) -> None:
    if class_id and not await ctx.db.classes.find_one({"id": class_id}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Class not found")


async def _check_teacher(ctx: TenantContext, teacher_id: Optional[str]) -> None:
    if teacher_id and not await ctx.db.users.find_one({"id": teacher_id, "role": {"$in": list(STAFF_ROLES)}}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Teacher not found")


# ---------- users (school admin manages staff & parent logins) ----------
@router.get("/users")
async def list_users(ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    query = {} if ctx.role == "admin" else {"role": {"$in": list(STAFF_ROLES)}}
    users = await ctx.db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(5000)
    for u in users:
        u.setdefault("active", True)
    return users


@router.post("/users", status_code=201)
async def create_user(payload: UserCreateIn, ctx: TenantContext = Depends(require_roles("admin"))):
    email = payload.email.lower()
    if await ctx.db.users.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="A user with this email already exists in your school")
    if payload.role in STAFF_ROLES:
        staff = await ctx.db.users.count_documents({"role": {"$in": list(STAFF_ROLES)}, "active": {"$ne": False}})
        if staff >= limits_for(ctx.school)["max_staff"]:
            raise HTTPException(status_code=402, detail="Staff limit reached for your plan. Upgrade to add more staff.")
    doc = {"id": new_id(), "email": email, "name": payload.name.strip(), "role": payload.role, "active": True,
           "password_hash": hash_password(payload.password), "created_at": now_iso()}
    await ctx.db.users.insert_one(dict(doc))
    doc.pop("password_hash")
    return doc


@router.put("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdateIn, ctx: TenantContext = Depends(require_roles("admin"))):
    updates = payload.model_dump(exclude_none=True)
    if user_id == ctx.user["id"] and (updates.get("role", "admin") != "admin" or updates.get("active") is False):
        raise HTTPException(status_code=400, detail="You can't remove your own admin access")
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await ctx.db.users.update_one({"id": user_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return await ctx.db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})


@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: str, payload: ResetPasswordIn, ctx: TenantContext = Depends(require_roles("admin"))):
    res = await ctx.db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(payload.new_password)}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, ctx: TenantContext = Depends(require_roles("admin"))):
    if user_id == ctx.user["id"]:
        raise HTTPException(status_code=400, detail="You can't delete your own account")
    res = await ctx.db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


# ---------- classes ----------
@router.get("/classes")
async def list_classes(ctx: TenantContext = Depends(get_ctx)):
    query = class_teacher_query(ctx.user["id"]) if ctx.role == "teacher" else {}
    return await ctx.db.classes.find(query, {"_id": 0}).sort("name", 1).to_list(1000)


@router.post("/classes", status_code=201)
async def create_class(payload: ClassIn, ctx: TenantContext = Depends(require_roles("admin"))):
    await _check_teacher(ctx, payload.teacher_id)
    await _check_teacher(ctx, payload.secondary_teacher_id)
    doc = {**payload.model_dump(), "id": new_id(), "created_at": now_iso()}
    await ctx.db.classes.insert_one(dict(doc))
    return doc


@router.put("/classes/{class_id}")
async def update_class(class_id: str, payload: ClassIn, ctx: TenantContext = Depends(require_roles("admin"))):
    await _check_teacher(ctx, payload.teacher_id)
    await _check_teacher(ctx, payload.secondary_teacher_id)
    res = await ctx.db.classes.update_one({"id": class_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Class not found")
    return await ctx.db.classes.find_one({"id": class_id}, {"_id": 0})


@router.delete("/classes/{class_id}")
async def delete_class(class_id: str, ctx: TenantContext = Depends(require_roles("admin"))):
    res = await ctx.db.classes.delete_one({"id": class_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Class not found")
    # Students in a deleted class become unassigned rather than pointing at nothing.
    await ctx.db.students.update_many({"class_id": class_id}, {"$set": {"class_id": None}})
    return {"ok": True}


# ---------- students ----------
@router.get("/students")
async def list_students(q: Optional[str] = Query(None, max_length=100), class_id: Optional[str] = None,
                        status: Optional[str] = None, ctx: TenantContext = Depends(get_ctx)):
    query = await scope_for(ctx, class_id)
    if status:
        query["status"] = status
    if q and q.strip():
        rx = safe_regex(q)
        query["$or"] = [{"first_name": rx}, {"last_name": rx}, {"roll_number": rx},
                        {"guardian_name": rx}, {"guardian_phone": rx}]
    return await ctx.db.students.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)


@router.post("/students", status_code=201)
async def create_student(payload: StudentIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    await _check_class(ctx, payload.class_id)
    await require_own_class(ctx, payload.class_id)
    if payload.status == "active":
        active = await ctx.db.students.count_documents({"status": "active"})
        if active >= limits_for(ctx.school)["max_students"]:
            raise HTTPException(status_code=402, detail="Student limit reached for your plan. Upgrade to add more students.")
    now = now_iso()
    doc = {**payload.model_dump(), "id": new_id(), "created_at": now, "updated_at": now}
    await ctx.db.students.insert_one(dict(doc))
    return doc


@router.get("/students/movement")
async def student_movement(academic_year: Optional[str] = Query(None, max_length=20),
                           ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    """Admissions and exits per academic year (April to March), with the lists for the chosen year."""
    year = academic_year or current_year()
    cur = current_year()
    rows = await ctx.db.students.find({**await scope_for(ctx)}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "class_id": 1,
                                                                "joining_date": 1, "leaving_date": 1, "status": 1}).to_list(10000)

    def ay(d):
        if not d or len(d) < 7 or not d[:4].isdigit() or not d[5:7].isdigit():
            return None
        y = int(d[:4]) if int(d[5:7]) >= 4 else int(d[:4]) - 1
        return f"{y}-{str(y + 1)[2:]}"

    def month_idx(d):
        return (int(d[5:7]) - 4) % 12
    per: dict = {}
    for r in rows:
        jy, ly = ay(r.get("joining_date")), ay(r.get("leaving_date")) if r.get("status") == "left" or r.get("leaving_date") else None
        if jy:
            e = per.setdefault(jy, {"joined": 0, "left": 0, "jm": [0] * 12, "lm": [0] * 12})
            e["joined"] += 1
            e["jm"][month_idx(r["joining_date"])] += 1
        if ly:
            e = per.setdefault(ly, {"joined": 0, "left": 0, "jm": [0] * 12, "lm": [0] * 12})
            e["left"] += 1
            e["lm"][month_idx(r["leaving_date"])] += 1
    start = int(cur[:4])
    first = max(min([int(k[:4]) for k in per] + [start - 2]), start - 4)
    years = []
    for y in range(first, start + 1):
        k = f"{y}-{str(y + 1)[2:]}"
        e = per.get(k, {"joined": 0, "left": 0, "jm": [0] * 12, "lm": [0] * 12})
        years.append({"year": k, "joined": e["joined"], "left": e["left"], "net": e["joined"] - e["left"],
                      "months": [{"month": (4 + i - 1) % 12 + 1, "joined": e["jm"][i], "left": e["lm"][i]} for i in range(12)]})

    def brief(r):
        return {"id": r["id"], "name": f"{r['first_name']} {r.get('last_name', '')}".strip(), "class_id": r.get("class_id"),
                "joining_date": r.get("joining_date"), "leaving_date": r.get("leaving_date"), "status": r.get("status")}
    joined = [brief(r) for r in rows if ay(r.get("joining_date")) == year]
    left = [brief(r) for r in rows if (r.get("status") == "left" or r.get("leaving_date")) and ay(r.get("leaving_date")) == year]
    active = sum(1 for r in rows if r.get("status") == "active")
    return {"current": cur, "academic_year": year, "years": years, "active": active,
            "joined_list": sorted(joined, key=lambda r: r["joining_date"] or ""), "left_list": sorted(left, key=lambda r: r["leaving_date"] or "")}


@router.get("/students/{student_id}")
async def get_student(student_id: str, ctx: TenantContext = Depends(get_ctx)):
    doc = await ctx.db.students.find_one({"id": student_id, **await scope_for(ctx)}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Student not found")
    return doc


@router.put("/students/{student_id}")
async def update_student(student_id: str, payload: StudentIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    await _check_class(ctx, payload.class_id)
    current = await ctx.db.students.find_one({"id": student_id, **await scope_for(ctx)}, {"_id": 0, "status": 1})
    if not current:
        raise HTTPException(status_code=404, detail="Student not found")
    await require_own_class(ctx, payload.class_id)
    if payload.status == "active" and current.get("status") != "active":
        active = await ctx.db.students.count_documents({"status": "active"})
        if active >= limits_for(ctx.school)["max_students"]:
            raise HTTPException(status_code=402, detail="Student limit reached for your plan.")
    updates = {**payload.model_dump(), "updated_at": now_iso()}
    await ctx.db.students.update_one({"id": student_id}, {"$set": updates})
    return await ctx.db.students.find_one({"id": student_id}, {"_id": 0})


@router.delete("/students/{student_id}")
async def delete_student(student_id: str, ctx: TenantContext = Depends(require_roles("admin"))):
    res = await ctx.db.students.delete_one({"id": student_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Student not found")
    await ctx.db.fees.delete_many({"student_id": student_id})
    await ctx.db.attendance.delete_many({"student_id": student_id})
    await ctx.db.transport.delete_many({"student_id": student_id})
    return {"ok": True}


# ---------- fees ----------
@router.get("/fees")
async def list_fees(student_id: Optional[str] = None, academic_year: Optional[str] = Query(None, max_length=20), ctx: TenantContext = Depends(require_roles("admin", "parent"))):
    query: dict = {}
    ids = await visible_student_ids(ctx)
    if ids is not None:
        query["student_id"] = {"$in": ids}
    if student_id:
        if ids is not None and student_id not in ids:
            return []
        query["student_id"] = student_id
    if academic_year != "all":
        query.update(year_q(academic_year))
    rows = await ctx.db.fees.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    for r in rows:
        r["academic_year"] = r.get("academic_year") or current_year()
    return rows


async def _check_student(ctx: TenantContext, student_id: str) -> None:
    if not await ctx.db.students.find_one({"id": student_id}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Student not found")


@router.post("/fees", status_code=201)
async def create_fee(payload: FeeIn, ctx: TenantContext = Depends(require_roles("admin"))):
    await _check_student(ctx, payload.student_id)
    doc = {**payload.model_dump(), "id": new_id(), "created_at": now_iso()}
    doc["academic_year"] = doc.get("academic_year") or current_year()
    doc["status"] = fee_status(doc["amount"], doc["paid_amount"])
    await ctx.db.fees.insert_one(dict(doc))
    return doc


@router.put("/fees/{fee_id}")
async def update_fee(fee_id: str, payload: FeeIn, ctx: TenantContext = Depends(require_roles("admin"))):
    await _check_student(ctx, payload.student_id)
    updates = payload.model_dump()
    if not updates.get("academic_year"):
        updates.pop("academic_year", None)
    updates["status"] = fee_status(updates["amount"], updates["paid_amount"])
    res = await ctx.db.fees.update_one({"id": fee_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fee not found")
    return await ctx.db.fees.find_one({"id": fee_id}, {"_id": 0})


@router.delete("/fees/{fee_id}")
async def delete_fee(fee_id: str, ctx: TenantContext = Depends(require_roles("admin"))):
    res = await ctx.db.fees.delete_one({"id": fee_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fee not found")
    return {"ok": True}


# ---------- attendance ----------
@router.post("/attendance/batch")
async def mark_attendance(payload: AttendanceBatchIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    if not payload.marks:
        return {"updated": 0}
    ids = list({m.student_id for m in payload.marks})
    found = await ctx.db.students.count_documents({"id": {"$in": ids}, **await scope_for(ctx)})
    if found != len(ids):
        raise HTTPException(status_code=400, detail="One or more students were not found" if ctx.role == "admin"
                            else "One or more students are not in your classes")
    for m in payload.marks:
        await ctx.db.attendance.update_one(
            {"student_id": m.student_id, "date": payload.date},
            {"$set": {"student_id": m.student_id, "date": payload.date, "status": m.status,
                      "class_id": payload.class_id, "marked_by": ctx.user["id"], "updated_at": now_iso()},
             "$setOnInsert": {"id": new_id()}},
            upsert=True,
        )
    return {"updated": len(payload.marks)}


@router.get("/attendance")
async def list_attendance(date_str: Optional[str] = Query(None, alias="date"), class_id: Optional[str] = None,
                          student_id: Optional[str] = None, ctx: TenantContext = Depends(get_ctx)):
    query: dict = {}
    ids = await visible_student_ids(ctx)
    if ids is not None:
        query["student_id"] = {"$in": ids}
    if date_str:
        query["date"] = date_str
    if class_id:
        query["class_id"] = class_id
    if student_id:
        if ids is not None and student_id not in ids:
            return []
        query["student_id"] = student_id
    return await ctx.db.attendance.find(query, {"_id": 0}).to_list(10000)


# ---------- dashboard ----------
@router.get("/dashboard/stats")
async def dashboard_stats(ctx: TenantContext = Depends(get_ctx)):
    scope = await scope_for(ctx)
    ids = await visible_student_ids(ctx)
    fee_q = {**year_q(), **({} if ids is None else {"student_id": {"$in": ids}})}

    total_students = await ctx.db.students.count_documents({**scope, "status": "active"})
    total_left = await ctx.db.students.count_documents({**scope, "status": "left"})
    total_classes = await ctx.db.classes.count_documents(class_teacher_query(ctx.user["id"]) if ctx.role == "teacher" else {})

    total_due = total_collected = 0.0
    async for f in ctx.db.fees.find(fee_q, {"_id": 0, "amount": 1, "paid_amount": 1}):
        total_due += float(f.get("amount", 0))
        total_collected += float(f.get("paid_amount", 0))

    today = datetime.now(timezone.utc).date().isoformat()
    att_q = {"date": today, **({} if ids is None else {"student_id": {"$in": ids}})}
    total_marked = await ctx.db.attendance.count_documents(att_q)
    present = await ctx.db.attendance.count_documents({**att_q, "status": {"$in": ["present", "late"]}})
    pct = round(present / total_marked * 100) if total_marked else 0

    out = {
        "total_students": total_students, "students_left": total_left, "total_classes": total_classes,
        "fees_total_due": total_due, "fees_collected": total_collected,
        "fees_pending": max(total_due - total_collected, 0),
        "attendance_today_pct": pct, "attendance_today_marked": total_marked,
    }
    if ctx.role == "teacher":       # teachers never see fee information
        for k in ("fees_total_due", "fees_collected", "fees_pending"):
            out[k] = None
    return out
