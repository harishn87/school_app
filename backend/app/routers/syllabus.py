"""Syllabus coverage: class teachers set out each term's syllabus and update how much is covered, every day.

The target is pacing: the share of the term that has passed. Actual coverage is compared with it and graded
green (on pace or within 5 points), amber (5 to 15 points behind) or red (more than 15 behind). The same
summary feeds the teacher, the principal's dashboard and the parent app.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..models import SyllabusIn
from ..security import TenantContext, get_ctx, require_roles
from ..utils import current_year, new_id, norm_term, now_iso, today_ist
from .school import scope_for, teacher_class_ids

router = APIRouter(tags=["syllabus"])

GREEN_GAP, AMBER_GAP = -5, -15          # points behind target
STALE_DAYS = 3


def default_window(term: str, year: str) -> tuple:
    """Usual dates for a term when the teacher has not set any: Term 1 Jun-Sep, Term 2 Oct-Dec, Term 3 Jan-Mar."""
    y = int(year[:4])
    t = term.strip().lower()
    if t.endswith("2"):
        return date(y, 10, 1), date(y, 12, 31)
    if t.endswith("3"):
        return date(y + 1, 1, 1), date(y + 1, 3, 31)
    return date(y, 6, 1), date(y, 9, 30)


def subject_percent(s: dict) -> int:
    ch = s.get("chapters") or []
    return round(sum(c["percent"] for c in ch) / len(ch)) if ch else int(s.get("percent") or 0)


def overall_percent(subjects: list) -> Optional[int]:
    return round(sum(subject_percent(s) for s in subjects) / len(subjects)) if subjects else None


def target_percent(start: date, end: date, today: date) -> int:
    if today <= start:
        return 0
    if today >= end:
        return 100
    return round((today - start).days / max((end - start).days, 1) * 100)


def grade(pct: Optional[int], target: int) -> str:
    if pct is None:
        return "none"
    gap = pct - target
    return "green" if gap >= GREEN_GAP else "amber" if gap >= AMBER_GAP else "red"


def _d(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must look like 2026-10-01")


def subject_teachers(c: dict, users: dict) -> dict:
    """Lower-case subject name -> {id, name} of whoever teaches it in this class (the class teacher unless another is set)."""
    out = {}
    for x in c.get("subjects") or []:
        tid = x.get("teacher_id") or c.get("teacher_id")
        out[x["name"].strip().lower()] = {"id": tid, "name": users.get(tid)}
    return out


def tag_subjects(subjects: list, c: dict, users: dict) -> list:
    m = subject_teachers(c, users)
    dflt = {"id": c.get("teacher_id"), "name": users.get(c.get("teacher_id"))}
    return [{**s, "teacher": m.get(s["name"].strip().lower(), dflt)} for s in subjects]


def owner_of(c: dict, name: str) -> Optional[str]:
    """Id of the teacher who owns a subject in this class: the one set on it, otherwise the class teacher."""
    for x in c.get("subjects") or []:
        if x["name"].strip().lower() == name.strip().lower():
            return x.get("teacher_id") or c.get("teacher_id")
    return c.get("teacher_id")


def scope_doc(d: dict, c: dict, uid: str) -> dict:
    """A syllabus document cut down to the subjects this teacher owns (and no one else's author details)."""
    out = {**d, "subjects": [s for s in d.get("subjects", []) if owner_of(c, s["name"]) == uid]}
    if d.get("updated_by") != uid:
        out["updated_by_name"] = None
        out["updated_by"] = None
    return out


def subject_year(docs: list) -> dict:
    """Subject name -> whole-year coverage: the three terms averaged, a term where the subject isn't set up counting as nothing."""
    names, per = [], {}
    for d in docs:
        t = norm_term(d["term"])
        for s in d["subjects"]:
            if s["name"] not in names:
                names.append(s["name"])
            per.setdefault(s["name"], {})[t] = subject_percent(s)
    return {n: round(sum(per[n].get(t, 0) for t in ("Term 1", "Term 2", "Term 3")) / 3) for n in names}


async def _visible_classes(ctx: TenantContext) -> list:
    q: dict = {}
    if ctx.role == "teacher":
        q = {"$or": [{"id": {"$in": await teacher_class_ids(ctx)}}, {"subjects.teacher_id": ctx.user["id"]}]}
    elif ctx.role == "parent":
        ids = {s["class_id"] async for s in ctx.db.students.find({"status": "active", **await scope_for(ctx)}, {"_id": 0, "class_id": 1}) if s.get("class_id")}
        q = {"id": {"$in": list(ids)}}
    return await ctx.db.classes.find(q, {"_id": 0}).to_list(1000)


async def _class_or_404(ctx: TenantContext, class_id: str) -> dict:
    for c in await _visible_classes(ctx):
        if c["id"] == class_id:
            return c
    raise HTTPException(status_code=404, detail="Class not found")


def _enrich(doc: dict, today: date) -> dict:
    start, end = date.fromisoformat(doc["start_date"]), date.fromisoformat(doc["end_date"])
    subs = []
    tgt = target_percent(start, end, today)
    for s in doc["subjects"]:
        p = subject_percent(s)
        subs.append({**s, "percent": p, "status": grade(p, tgt), "chapters_done": sum(1 for c in s.get("chapters", []) if c["percent"] >= 100),
                     "chapters_total": len(s.get("chapters", []))})
    pct = overall_percent(doc["subjects"])
    upd = (doc.get("updated_at") or "")[:10]
    last = date.fromisoformat(doc["last_update_date"]) if doc.get("last_update_date") else None
    active = start <= today <= end
    return {**{k: v for k, v in doc.items() if k != "subjects"}, "subjects": subs, "percent": pct, "target": tgt,
            "gap": None if pct is None else pct - tgt, "status": grade(pct, tgt), "active": active,
            "last_update_date": last.isoformat() if last else upd or None,
            "days_since_update": (today - last).days if last else None,
            "update_due": bool(active and today.weekday() != 6 and (last is None or last < today)),
            "stale": bool(active and (last is None or (today - last).days >= STALE_DAYS))}


def year_rollup(mine: list, year: str, today: date) -> tuple:
    """Per-term and whole-year coverage for one class, from its saved syllabus docs (any terms, this academic year).

    The whole year is the three terms averaged, a term with no syllabus counting as nothing covered yet."""
    terms, tp, tt = [], [], []
    for tname in ("Term 1", "Term 2", "Term 3"):
        d = next((x for x in mine if norm_term(x["term"]) == tname), None)
        if d:
            e = _enrich(d, today)
            terms.append({"term": tname, "has_syllabus": True, "percent": e["percent"], "target": e["target"], "status": e["status"], "gap": e["gap"]})
            tp.append(e["percent"] or 0); tt.append(e["target"])
        else:
            a0, a1 = default_window(tname, year)
            tg = target_percent(a0, a1, today)
            terms.append({"term": tname, "has_syllabus": False, "percent": None, "target": tg, "status": "none", "gap": None})
            tp.append(0); tt.append(tg)
    if mine:
        yp, yt = round(sum(tp) / 3), round(sum(tt) / 3)
        yr = {"percent": yp, "target": yt, "gap": yp - yt, "status": grade(yp, yt), "terms_set": sum(1 for t in terms if t["has_syllabus"])}
    else:
        yr = {"percent": None, "target": round(sum(tt) / 3), "gap": None, "status": "none", "terms_set": 0}
    return terms, yr


@router.get("/syllabus/summary")
async def syllabus_summary(academic_year: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"), ctx: TenantContext = Depends(get_ctx)):
    """One row per class: the syllabus for the term running today, graded against its target."""
    year = academic_year or current_year()
    today = today_ist()
    classes = sorted(await _visible_classes(ctx), key=lambda c: (c["name"], c.get("section") or ""))
    users = {u["id"]: u["name"] async for u in ctx.db.users.find({}, {"_id": 0, "id": 1, "name": 1})}
    docs: dict = {}
    async for d in ctx.db.syllabus.find({"academic_year": year, "class_id": {"$in": [c["id"] for c in classes]}}, {"_id": 0}):
        docs.setdefault(d["class_id"], []).append(d)
    kids: dict = {}
    if ctx.role == "parent":
        async for s in ctx.db.students.find({"status": "active", **await scope_for(ctx)}, {"_id": 0, "first_name": 1, "class_id": 1}):
            kids.setdefault(s["class_id"], []).append(s["first_name"])
    rows = []
    tch = ctx.role == "teacher"
    for c in classes:
        base = {"class_id": c["id"], "class_name": f"{c['name']} {c.get('section') or ''}".strip(),
                "teacher": None if tch else users.get(c.get("teacher_id")), "secondary_teacher": None if tch else users.get(c.get("secondary_teacher_id")),
                **({"children": kids.get(c["id"], [])} if ctx.role == "parent" else {})}
        mine = docs.get(c["id"], [])
        if tch:   # a teacher sees only the subjects they teach
            mine = [d for d in (scope_doc(x, c, ctx.user["id"]) for x in mine) if d["subjects"]]
        running = [d for d in mine if d["start_date"] <= today.isoformat() <= d["end_date"]]
        past = sorted((d for d in mine if d["end_date"] < today.isoformat()), key=lambda d: d["end_date"])
        coming = sorted((d for d in mine if d["start_date"] > today.isoformat()), key=lambda d: d["start_date"])
        terms, yr = year_rollup(mine, year, today)
        base = {**base, "terms": terms, "year": yr}
        pick = running[0] if running else (past[-1] if past else (coming[0] if coming else None))
        if not pick:
            rows.append({**base, "has_syllabus": False, "status": "none", "percent": None, "target": None, "subjects": [], "term": None})
        else:
            e = _enrich(pick, today)
            rows.append({**base, "has_syllabus": True, **{k: e[k] for k in ("term", "start_date", "end_date", "percent", "target", "gap", "status",
                                                                          "last_update_date", "days_since_update", "update_due", "stale", "active")},
                         "subjects": tag_subjects(e["subjects"], c, users)})
    count = {k: sum(1 for r in rows if r["status"] == k) for k in ("green", "amber", "red", "none")}
    return {"academic_year": year, "today": today.isoformat(), "rules": {"green_gap": GREEN_GAP, "amber_gap": AMBER_GAP, "stale_days": STALE_DAYS},
            "counts": count, "classes": rows}


@router.get("/syllabus")
async def get_syllabus(class_id: str, term: str = Query(..., min_length=1, max_length=100),
                       academic_year: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"), ctx: TenantContext = Depends(get_ctx)):
    c = await _class_or_404(ctx, class_id)
    year = academic_year or current_year()
    today = today_ist()
    doc = await ctx.db.syllabus.find_one({"class_id": class_id, "term": term.strip(), "academic_year": year}, {"_id": 0})
    if not doc:
        a, b = default_window(term, year)
        doc = {"id": None, "class_id": class_id, "term": term.strip(), "academic_year": year, "start_date": a.isoformat(), "end_date": b.isoformat(),
               "subjects": [], "updated_at": None, "last_update_date": None}
    users = {u["id"]: u["name"] async for u in ctx.db.users.find({}, {"_id": 0, "id": 1, "name": 1})}
    tch = ctx.role == "teacher"
    if tch:
        doc = scope_doc(doc, c, ctx.user["id"])
    out = _enrich(doc, today)
    out["subjects"] = tag_subjects(out["subjects"], c, users)
    out["exists"] = bool(doc.get("id"))
    out["class_name"] = f"{c['name']} {c.get('section') or ''}".strip()
    out["class_subjects"] = [{"name": n, "teacher": t} for n, t in ((x["name"], subject_teachers(c, users)[x["name"].strip().lower()]) for x in c.get("subjects") or [])]
    out["class_teacher"] = users.get(c.get("teacher_id"))
    out["my_subjects"] = None   # None = may edit every subject
    if tch:
        uid = ctx.user["id"]
        out["class_subjects"] = [x for x in out["class_subjects"] if x["teacher"]["id"] == uid]
        out["class_teacher"] = None
        out["my_subjects"] = None   # everything a teacher is shown is theirs
        out["subjects"] = [{**x, "teacher": None} for x in out["subjects"]]
        out["class_subjects"] = [{**x, "teacher": None} for x in out["class_subjects"]]
    return out


@router.put("/syllabus/{class_id}")
async def save_syllabus(class_id: str, payload: SyllabusIn, ctx: TenantContext = Depends(require_roles("teacher"))):
    cls = next((c for c in await _visible_classes(ctx) if c["id"] == class_id), None)
    if cls is None:
        raise HTTPException(status_code=403, detail="You can only manage students in classes assigned to you.")
    own = ctx.user["id"] in (cls.get("teacher_id"), cls.get("secondary_teacher_id"))
    uid = ctx.user["id"]
    a, b = _d(payload.start_date), _d(payload.end_date)
    if b < a:
        raise HTTPException(status_code=400, detail="The term can't end before it starts")
    names = [s.name.strip().lower() for s in payload.subjects]
    if len(set(names)) != len(names):
        raise HTTPException(status_code=400, detail="A subject appears twice")
    year = payload.academic_year or current_year()
    term = payload.term.strip()
    subjects = []
    for s in payload.subjects:
        ch = [{"title": c.title.strip(), "percent": c.percent} for c in s.chapters if c.title.strip()]
        subjects.append({"name": s.name.strip(), "percent": 0 if ch else s.percent, "chapters": ch, "note": (s.note or "").strip() or None})
    today = today_ist()
    key = {"class_id": class_id, "term": term, "academic_year": year}
    # a teacher changes only the subjects they own; everything else stays exactly as it was saved
    old = await ctx.db.syllabus.find_one(key, {"_id": 0}) or {}
    have = {x["name"].strip().lower(): x for x in old.get("subjects", [])}
    incoming = {x["name"].strip().lower(): x for x in subjects}
    merged = [v for k, v in have.items() if owner_of(cls, v["name"]) != uid or k in incoming]
    merged = [incoming[k] if (k in incoming and owner_of(cls, v["name"]) == uid) else v for k, v in ((x["name"].strip().lower(), x) for x in merged)]
    merged += [v for k, v in incoming.items() if k not in have and owner_of(cls, v["name"]) == uid]
    subjects = merged
    if old and not own:
        a, b = _d(old["start_date"]), _d(old["end_date"])
    await ctx.db.syllabus.update_one(key, {"$set": {"start_date": a.isoformat(), "end_date": b.isoformat(), "subjects": subjects,
                                                    "updated_at": now_iso(), "updated_by": ctx.user["id"], "updated_by_name": ctx.user.get("name", ""),
                                                    "last_update_date": today.isoformat()},
                                         "$setOnInsert": {"id": new_id(), "created_at": now_iso()}}, upsert=True)
    pct = overall_percent(subjects)
    await ctx.db.syllabus_log.update_one({**key, "date": today.isoformat()}, {"$set": {
        "overall": pct, "subjects": {s["name"]: subject_percent(s) for s in subjects}, "by": ctx.user["id"], "updated_at": now_iso()}}, upsert=True)
    return await get_syllabus(class_id, term, year, ctx)


@router.get("/syllabus/log")
async def syllabus_log(class_id: str, term: str = Query(..., min_length=1, max_length=100),
                       academic_year: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"), ctx: TenantContext = Depends(get_ctx)):
    """Day by day coverage for one class and term, with the pacing target for each day."""
    c = await _class_or_404(ctx, class_id)
    year = academic_year or current_year()
    doc = await ctx.db.syllabus.find_one({"class_id": class_id, "term": term.strip(), "academic_year": year}, {"_id": 0})
    if not doc:
        return {"days": []}
    mine_names = {x["name"] for x in doc.get("subjects", []) if owner_of(c, x["name"]) == ctx.user["id"]} if ctx.role == "teacher" else None
    start, end = date.fromisoformat(doc["start_date"]), date.fromisoformat(doc["end_date"])
    rows = await ctx.db.syllabus_log.find({"class_id": class_id, "term": term.strip(), "academic_year": year}, {"_id": 0}).sort("date", 1).to_list(400)
    days = []
    for r in rows:
        subj, overall = r["subjects"], r["overall"]
        if mine_names is not None:
            subj = {k: v for k, v in subj.items() if k in mine_names}
            overall = round(sum(subj.values()) / len(subj)) if subj else None
            if not subj:
                continue
        days.append({"date": r["date"], "overall": overall, "subjects": subj, "target": target_percent(start, end, date.fromisoformat(r["date"]))})
    return {"start_date": doc["start_date"], "end_date": doc["end_date"], "days": days}
