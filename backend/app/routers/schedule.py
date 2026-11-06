"""Weekly class timetable and exam schedule.

Admins manage every class; a teacher manages the classes assigned to them; parents only read the classes their children are in.
"""
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from ..security import TenantContext, get_ctx, require_roles
from ..utils import current_year, new_id, now_iso, year_q
from .school import student_scope, teacher_class_ids

router = APIRouter(tags=["schedule"])

DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


async def _visible_class_ids(ctx: TenantContext) -> Optional[List[str]]:
    """None = every class (admin)."""
    if ctx.role == "admin":
        return None
    if ctx.role == "teacher":
        return await teacher_class_ids(ctx)
    rows = await ctx.db.students.find({**student_scope(ctx), "status": "active"}, {"_id": 0, "class_id": 1}).to_list(500)
    return sorted({r["class_id"] for r in rows if r.get("class_id")})


async def _can_see(ctx: TenantContext, class_id: str) -> None:
    ids = await _visible_class_ids(ctx)
    if ids is not None and class_id not in ids:
        raise HTTPException(status_code=404, detail="Class not found")


async def _can_edit(ctx: TenantContext, class_id: str) -> dict:
    cls = await ctx.db.classes.find_one({"id": class_id}, {"_id": 0})
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    if ctx.role == "teacher" and class_id not in await teacher_class_ids(ctx):
        raise HTTPException(status_code=403, detail="You can change this only for classes assigned to you.")
    return cls


# ---------- timetable ----------
class PeriodIn(BaseModel):
    start: str
    end: str
    label: Optional[str] = Field(default=None, max_length=30)

    @field_validator("start", "end")
    @classmethod
    def _t(cls, v: str) -> str:
        if not _HHMM.match(v):
            raise ValueError("Use 24-hour time like 09:30")
        return v


class TimetableIn(BaseModel):
    periods: List[PeriodIn] = Field(max_length=12)
    days: dict = Field(default_factory=dict)

    @field_validator("days")
    @classmethod
    def _d(cls, v: dict) -> dict:
        for k, row in v.items():
            if k not in DAYS:
                raise ValueError(f"Unknown day {k}")
            if not isinstance(row, list) or len(row) > 12 or any(not isinstance(c, str) or len(c) > 60 for c in row):
                raise ValueError("Each day needs a list of subject names")
        return v


def _tidy(doc: Optional[dict], class_id: str) -> dict:
    periods = (doc or {}).get("periods") or []
    days = {d: list(((doc or {}).get("days") or {}).get(d) or []) for d in DAYS}
    for d in DAYS:
        days[d] = (days[d] + [""] * len(periods))[: len(periods)]
    return {"class_id": class_id, "periods": periods, "days": days, "exists": bool(doc),
            "updated_at": (doc or {}).get("updated_at"), "updated_by": (doc or {}).get("updated_by_name")}


@router.get("/timetable")
async def get_timetable(class_id: str = Query(..., max_length=64), ctx: TenantContext = Depends(get_ctx)):
    await _can_see(ctx, class_id)
    doc = await ctx.db.timetables.find_one({"class_id": class_id}, {"_id": 0})
    return _tidy(doc, class_id)


@router.put("/timetable/{class_id}")
async def put_timetable(class_id: str, payload: TimetableIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    await _can_edit(ctx, class_id)
    periods = [p.model_dump() for p in payload.periods]
    for a, b in zip(periods, periods[1:]):
        if a["end"] > b["start"]:
            raise HTTPException(status_code=400, detail="Periods overlap: each one must start after the previous one ends")
    if any(p["end"] <= p["start"] for p in periods):
        raise HTTPException(status_code=400, detail="A period must end after it starts")
    doc = {"class_id": class_id, "periods": periods, "days": {d: [c.strip() for c in payload.days.get(d, [])] for d in DAYS},
           "updated_at": now_iso(), "updated_by": ctx.user["id"], "updated_by_name": ctx.user.get("name", "")}
    await ctx.db.timetables.update_one({"class_id": class_id}, {"$set": doc}, upsert=True)
    return _tidy(doc, class_id)


# ---------- exams ----------
class ExamIn(BaseModel):
    class_id: str
    term: str = Field(min_length=1, max_length=30)
    subject: str = Field(min_length=1, max_length=80)
    date: str
    start_time: Optional[str] = None
    duration_min: Optional[int] = Field(default=None, ge=10, le=600)
    room: Optional[str] = Field(default=None, max_length=40)
    note: Optional[str] = Field(default=None, max_length=300)

    @field_validator("date")
    @classmethod
    def _date(cls, v: str) -> str:
        if not _DATE.match(v):
            raise ValueError("Use a date like 2026-12-05")
        return v

    @field_validator("start_time")
    @classmethod
    def _st(cls, v: Optional[str]) -> Optional[str]:
        if v and not _HHMM.match(v):
            raise ValueError("Use 24-hour time like 09:30")
        return v or None


@router.get("/exams")
async def list_exams(class_id: Optional[str] = Query(None, max_length=64), academic_year: Optional[str] = Query(None, max_length=20),
                     ctx: TenantContext = Depends(get_ctx)):
    ids = await _visible_class_ids(ctx)
    q: dict = {**year_q(academic_year or None)}
    if class_id:
        if ids is not None and class_id not in ids:
            return []
        q["class_id"] = class_id
    elif ids is not None:
        q["class_id"] = {"$in": ids}
    rows = await ctx.db.exams.find(q, {"_id": 0}).sort([("date", 1), ("start_time", 1)]).to_list(2000)
    for r in rows:
        r["academic_year"] = r.get("academic_year") or current_year()
    return rows


@router.post("/exams", status_code=201)
async def create_exam(payload: ExamIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    await _can_edit(ctx, payload.class_id)
    doc = {**payload.model_dump(), "subject": payload.subject.strip(), "id": new_id(), "academic_year": current_year(),
           "created_by": ctx.user["id"], "created_at": now_iso()}
    await ctx.db.exams.insert_one(dict(doc))
    return doc


async def _exam_for_edit(ctx: TenantContext, exam_id: str) -> dict:
    ex = await ctx.db.exams.find_one({"id": exam_id}, {"_id": 0})
    if not ex:
        raise HTTPException(status_code=404, detail="Exam not found")
    await _can_edit(ctx, ex["class_id"])
    return ex


@router.put("/exams/{exam_id}")
async def update_exam(exam_id: str, payload: ExamIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    ex = await _exam_for_edit(ctx, exam_id)
    if payload.class_id != ex["class_id"]:
        await _can_edit(ctx, payload.class_id)
    await ctx.db.exams.update_one({"id": exam_id}, {"$set": {**payload.model_dump(), "subject": payload.subject.strip()}})
    return await ctx.db.exams.find_one({"id": exam_id}, {"_id": 0})


@router.delete("/exams/{exam_id}")
async def delete_exam(exam_id: str, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    await _exam_for_edit(ctx, exam_id)
    await ctx.db.exams.delete_one({"id": exam_id})
    return {"ok": True}
