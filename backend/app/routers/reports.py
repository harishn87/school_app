"""Progress reports: teachers enter marks and remarks per student and term; parents see them straight away.

One report per student per term. Saving also keeps the student's `grades` list in step, so dashboards
and the student profile always agree with the report.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..models import ReportBatchIn
from ..security import TenantContext, get_ctx, require_roles
from ..utils import current_year, new_id, now_iso, year_q
from .school import require_own_class, scope_for

router = APIRouter(tags=["reports"])


def _percent(marks: list) -> Optional[int]:
    total = sum(float(m["max_score"]) for m in marks)
    return round(sum(float(m["score"]) for m in marks) / total * 100) if total else None


@router.post("/reports/batch")
async def save_reports(payload: ReportBatchIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    cls = await ctx.db.classes.find_one({"id": payload.class_id}, {"_id": 0, "id": 1})
    if not cls:
        raise HTTPException(status_code=400, detail="Class not found")
    await require_own_class(ctx, payload.class_id)
    term = payload.term.strip()
    year = payload.academic_year or current_year()
    ids = [e.student_id for e in payload.entries]
    in_class = {s["id"] async for s in ctx.db.students.find({"id": {"$in": ids}, "class_id": payload.class_id}, {"_id": 0, "id": 1})}
    saved = cleared = 0
    for e in payload.entries:
        if e.student_id not in in_class:
            raise HTTPException(status_code=400, detail="One or more students are not in this class")
        marks = []
        for m in e.marks:
            if m.score is None:
                continue
            if m.score > m.max_score:
                raise HTTPException(status_code=400, detail=f"{m.subject}: marks can't be more than {m.max_score:g}")
            marks.append({"subject": m.subject.strip(), "score": m.score, "max_score": m.max_score})
        seen = set()
        for m in marks:
            if m["subject"].lower() in seen:
                raise HTTPException(status_code=400, detail=f"Subject '{m['subject']}' appears twice")
            seen.add(m["subject"].lower())
        remark = (e.remark or "").strip() or None
        key = {"student_id": e.student_id, "term": term, **year_q(year)}
        if not marks and not remark:
            res = await ctx.db.reports.delete_one(key)
            cleared += res.deleted_count
        else:
            await ctx.db.reports.update_one(key, {
                "$set": {"academic_year": year, "class_id": payload.class_id, "marks": marks, "percent": _percent(marks), "remark": remark,
                         "updated_by": ctx.user["id"], "updated_by_name": ctx.user.get("name", ""), "updated_at": now_iso()},
                "$setOnInsert": {"id": new_id(), "created_at": now_iso()}}, upsert=True)
            saved += 1
        if year != current_year():      # history never touches the live grade list
            continue
        # keep the student's grade list in step with the report
        grades = [g for g in (await ctx.db.students.find_one({"id": e.student_id}, {"_id": 0, "grades": 1}) or {}).get("grades", [])
                  if g.get("term") != term]
        grades += [{"subject": m["subject"], "term": term, "score": m["score"], "max_score": m["max_score"]} for m in marks]
        await ctx.db.students.update_one({"id": e.student_id}, {"$set": {"grades": grades}})
    return {"saved": saved, "cleared": cleared}


@router.get("/reports")
async def list_reports(class_id: Optional[str] = None, student_id: Optional[str] = None, term: Optional[str] = Query(None, max_length=100),
                       academic_year: Optional[str] = Query(None, max_length=20), ctx: TenantContext = Depends(get_ctx)):
    ids = [s["id"] async for s in ctx.db.students.find({**await scope_for(ctx, class_id)}, {"_id": 0, "id": 1})]
    q: dict = {"student_id": {"$in": ids}}
    if student_id:
        if student_id not in ids:
            return []
        q["student_id"] = student_id
    if term:
        q["term"] = term
    if academic_year != "all":
        q.update(year_q(academic_year))
    rows = await ctx.db.reports.find(q, {"_id": 0}).sort([("term", 1)]).to_list(5000)
    for r in rows:
        r["academic_year"] = r.get("academic_year") or current_year()
    return rows


@router.get("/academic-years")
async def academic_years(ctx: TenantContext = Depends(get_ctx)):
    """Every academic year that has reports or fees, newest first (always includes the current one)."""
    years = {current_year()}
    for coll in (ctx.db.reports, ctx.db.fees):
        years.update(y for y in await coll.distinct("academic_year") if y)
    return {"current": current_year(), "years": sorted(years, reverse=True)}
