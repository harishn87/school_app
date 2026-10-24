"""School holidays, the monthly attendance calendar, and the staff progress/fees dashboard."""
import calendar as cal
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..models import HolidayIn
from ..security import TenantContext, get_ctx, require_roles
from ..utils import current_year, new_id, now_iso, year_bounds, year_q
from .school import class_teacher_query, fee_status, scope_for

router = APIRouter(tags=["insights"])


def _parse(d: str) -> date:
    try:
        return date.fromisoformat(d)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")


def _month_bounds(month: str):
    try:
        y, m = (int(x) for x in month.split("-"))
        first = date(y, m, 1)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Month must look like 2026-10")
    return first, date(y, m, cal.monthrange(y, m)[1])


# ---------- holidays ----------
@router.get("/holidays")
async def list_holidays(year: Optional[int] = Query(None, ge=2000, le=2100), ctx: TenantContext = Depends(get_ctx)):
    q: dict = {}
    if year:
        q = {"$or": [{"date": {"$regex": f"^{year}"}}, {"end_date": {"$regex": f"^{year}"}}]}
    return await ctx.db.holidays.find(q, {"_id": 0}).sort("date", 1).to_list(500)


@router.post("/holidays", status_code=201)
async def create_holiday(payload: HolidayIn, ctx: TenantContext = Depends(require_roles("admin"))):
    start = _parse(payload.date)
    end = _parse(payload.end_date) if payload.end_date else None
    if end and end < start:
        raise HTTPException(status_code=400, detail="End date can't be before the start date")
    if end and (end - start).days > 60:
        raise HTTPException(status_code=400, detail="A holiday can span at most 60 days")
    doc = {"id": new_id(), "name": payload.name.strip(), "date": start.isoformat(),
           "end_date": end.isoformat() if end and end != start else None, "created_at": now_iso()}
    await ctx.db.holidays.insert_one(dict(doc))
    return doc


@router.delete("/holidays/{holiday_id}")
async def delete_holiday(holiday_id: str, ctx: TenantContext = Depends(require_roles("admin"))):
    res = await ctx.db.holidays.delete_one({"id": holiday_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return {"ok": True}


async def _holiday_map(ctx: TenantContext, first: date, last: date) -> dict:
    """date iso -> holiday name, for every day of the range that falls on a holiday."""
    out: dict = {}
    rows = await ctx.db.holidays.find({"date": {"$lte": last.isoformat()}}, {"_id": 0}).to_list(1000)
    for h in rows:
        s = date.fromisoformat(h["date"])
        e = date.fromisoformat(h["end_date"]) if h.get("end_date") else s
        if e < first:
            continue
        d = max(s, first)
        while d <= min(e, last):
            out.setdefault(d.isoformat(), h["name"])
            d += timedelta(days=1)
    return out


# ---------- monthly calendar for one student ----------
@router.get("/calendar")
async def student_calendar(student_id: str, month: str = Query(..., description="YYYY-MM"), ctx: TenantContext = Depends(get_ctx)):
    first, last = _month_bounds(month)
    student = await ctx.db.students.find_one({"id": student_id, **await scope_for(ctx)}, {"_id": 0, "photo_base64": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    marks = {a["date"]: a["status"] async for a in ctx.db.attendance.find(
        {"student_id": student_id, "date": {"$gte": first.isoformat(), "$lte": last.isoformat()}}, {"_id": 0})}
    holidays = await _holiday_map(ctx, first, last)
    today = datetime.now(timezone.utc).date()
    days = []
    counts = {"present": 0, "late": 0, "absent": 0, "holiday": 0, "unmarked": 0}
    d = first
    while d <= last:
        iso = d.isoformat()
        weekend = d.weekday() == 6          # Sunday off; Saturdays vary by school so they stay as school days
        status = marks.get(iso)
        entry = {"date": iso, "weekday": d.weekday(), "status": status, "holiday": holidays.get(iso), "weekend": weekend}
        days.append(entry)
        if holidays.get(iso):
            counts["holiday"] += 1          # a school holiday wins over any attendance mark
        elif status:
            counts[status] += 1
        elif not weekend and d <= today:
            counts["unmarked"] += 1
        d += timedelta(days=1)
    marked = counts["present"] + counts["late"] + counts["absent"]
    return {"student_id": student_id, "month": month, "days": days, "counts": counts,
            "percent": round((counts["present"] + counts["late"]) / marked * 100) if marked else None,
            "holidays": [{"date": k, "name": v} for k, v in sorted(holidays.items())]}


async def _grades_for_year(ctx, year: str, ids: set) -> dict:
    """student id -> marks for a past academic year, built from that year's reports."""
    out: dict = {}
    async for r in ctx.db.reports.find(year_q(year), {"_id": 0, "student_id": 1, "term": 1, "marks": 1}):
        if r["student_id"] in ids:
            out.setdefault(r["student_id"], []).extend(
                {"subject": m["subject"], "term": r["term"], "score": m["score"], "max_score": m["max_score"]} for m in r.get("marks", []))
    return out


# ---------- staff dashboard: every student's progress and fees ----------
@router.get("/dashboard/overview")
async def dashboard_overview(academic_year: Optional[str] = Query(None, max_length=20), ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    year = academic_year or current_year()
    past = year != current_year()
    teacher = ctx.role == "teacher"
    classes = {c["id"]: c async for c in ctx.db.classes.find(class_teacher_query(ctx.user["id"]) if teacher else {}, {"_id": 0})}
    students = await ctx.db.students.find({"status": "active", **await scope_for(ctx)}, {"_id": 0, "photo_base64": 0}).to_list(3000)
    ids = {s["id"] for s in students}
    since = (datetime.now(timezone.utc).date() - timedelta(days=30)).isoformat()
    att_q: dict = {"date": {"$gte": since}}
    if past:        # a finished year: attendance over the whole year
        lo, hi = year_bounds(year)
        att_q = {"date": {"$gte": lo, "$lte": hi}}
    past_grades = await _grades_for_year(ctx, year, ids) if past else None

    att: dict = {}
    async for a in ctx.db.attendance.find(att_q, {"_id": 0, "student_id": 1, "status": 1}):
        if a["student_id"] in ids:
            t = att.setdefault(a["student_id"], [0, 0])
            t[1] += 1
            t[0] += 1 if a["status"] in ("present", "late") else 0
    fees: dict = {}
    async for f in ctx.db.fees.find(year_q(year), {"_id": 0, "student_id": 1, "amount": 1, "paid_amount": 1}):
        if f["student_id"] in ids:
            t = fees.setdefault(f["student_id"], [0.0, 0.0])
            t[0] += float(f.get("amount", 0))
            t[1] += float(f.get("paid_amount", 0))

    rows = []
    for s in students:
        g = [x for x in ((past_grades.get(s["id"], []) if past else s.get("grades")) or []) if float(x.get("max_score") or 0) > 0]
        avg = round(sum(float(x["score"]) / float(x["max_score"]) for x in g) / len(g) * 100) if g else None
        a = att.get(s["id"])
        total, paid = fees.get(s["id"], [0.0, 0.0])
        c = classes.get(s.get("class_id"))
        rows.append({
            "id": s["id"], "name": f"{s['first_name']} {s.get('last_name', '')}".strip(),
            "roll_number": s.get("roll_number"), "class_id": s.get("class_id"),
            "class_name": f"{c['name']} {c.get('section') or ''}".strip() if c else None,
            "grade_avg": avg, "grade_count": len(g),
            "attendance_pct": round(a[0] / a[1] * 100) if a else None,
            "fees_total": total, "fees_paid": paid, "fees_pending": max(total - paid, 0),
            "fee_status": fee_status(total, paid) if total else "none",
        })
    by_class: dict = {}
    for r in rows:
        k = r["class_id"] or "none"
        b = by_class.setdefault(k, {"class_id": r["class_id"], "class_name": r["class_name"] or "No class", "students": 0,
                                    "_g": [], "_a": [], "fees_pending": 0.0, "fees_total": 0.0, "fees_paid": 0.0})
        b["students"] += 1
        if r["grade_avg"] is not None: b["_g"].append(r["grade_avg"])
        if r["attendance_pct"] is not None: b["_a"].append(r["attendance_pct"])
        b["fees_pending"] += r["fees_pending"]; b["fees_total"] += r["fees_total"]; b["fees_paid"] += r["fees_paid"]
    summary = []
    for b in by_class.values():
        g, a = b.pop("_g"), b.pop("_a")
        b["grade_avg"] = round(sum(g) / len(g)) if g else None
        b["attendance_pct"] = round(sum(a) / len(a)) if a else None
        summary.append(b)
    summary.sort(key=lambda x: x["class_name"])
    totals = {"students": len(rows), "fees_total": sum(r["fees_total"] for r in rows),
              "fees_paid": sum(r["fees_paid"] for r in rows), "fees_pending": sum(r["fees_pending"] for r in rows),
              "defaulters": sum(1 for r in rows if r["fees_pending"] > 0),
              "low_attendance": sum(1 for r in rows if r["attendance_pct"] is not None and r["attendance_pct"] < 75)}
    if teacher:     # teachers never see fee information
        fee_keys = ("fees_total", "fees_paid", "fees_pending", "fee_status")
        for r in rows:
            for k in fee_keys:
                r[k] = None
        for b in summary:
            for k in ("fees_total", "fees_paid", "fees_pending"):
                b[k] = None
        for k in ("fees_total", "fees_paid", "fees_pending", "defaulters"):
            totals[k] = None
    return {"students": rows, "classes": summary, "totals": totals, "academic_year": year}


# ---------- monthly attendance overview for staff (whole school or one class) ----------
@router.get("/attendance/month")
async def attendance_month(month: str = Query(..., description="YYYY-MM"), class_id: Optional[str] = None,
                           ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    first, last = _month_bounds(month)
    sq: dict = {"status": "active", **await scope_for(ctx, class_id)}
    ids = [s["id"] async for s in ctx.db.students.find(sq, {"_id": 0, "id": 1})]
    per: dict = {}
    async for a in ctx.db.attendance.find({"student_id": {"$in": ids}, "date": {"$gte": first.isoformat(), "$lte": last.isoformat()}},
                                          {"_id": 0, "date": 1, "status": 1}):
        t = per.setdefault(a["date"], {"present": 0, "late": 0, "absent": 0})
        t[a["status"]] += 1
    holidays = await _holiday_map(ctx, first, last)
    days = []
    d = first
    while d <= last:
        iso = d.isoformat()
        t = per.get(iso, {"present": 0, "late": 0, "absent": 0})
        days.append({"date": iso, "weekend": d.weekday() == 6, "holiday": holidays.get(iso),
                     "marked": t["present"] + t["late"] + t["absent"], **t})
        d += timedelta(days=1)
    return {"month": month, "students": len(ids), "days": days}


# ---------- whole-year attendance (school, one class, or one child) ----------
@router.get("/attendance/year")
async def attendance_year(academic_year: Optional[str] = Query(None, max_length=20), class_id: Optional[str] = None,
                          student_id: Optional[str] = None, ctx: TenantContext = Depends(get_ctx)):
    year = academic_year or current_year()
    first, last = year_bounds(year)
    sq: dict = {"status": "active", **await scope_for(ctx, class_id)}
    if student_id:
        sq["id"] = student_id
    studs = {s["id"]: s async for s in ctx.db.students.find(sq, {"_id": 0, "id": 1, "class_id": 1})}
    classes = {c["id"]: f"{c['name']} {c.get('section') or ''}".strip() async for c in ctx.db.classes.find({}, {"_id": 0, "id": 1, "name": 1, "section": 1})}
    months: dict = {}
    by_class: dict = {}
    tot = {"present": 0, "late": 0, "absent": 0}
    days = set()
    async for a in ctx.db.attendance.find({"student_id": {"$in": list(studs)}, "date": {"$gte": first, "$lte": last}},
                                          {"_id": 0, "date": 1, "status": 1, "student_id": 1}):
        st = a.get("status")
        if st not in tot:
            continue
        tot[st] += 1
        days.add(a["date"])
        m = months.setdefault(a["date"][:7], {"present": 0, "late": 0, "absent": 0, "days": set()})
        m[st] += 1
        m["days"].add(a["date"])
        cid = studs[a["student_id"]].get("class_id")
        c = by_class.setdefault(cid, {"present": 0, "late": 0, "absent": 0})
        c[st] += 1

    def pct(d):
        n = d["present"] + d["late"] + d["absent"]
        return round((d["present"] + d["late"]) / n * 100) if n else None
    seq, y, mth = [], int(first[:4]), 4
    for _ in range(12):
        key = f"{y}-{mth:02d}"
        m = months.get(key, {"present": 0, "late": 0, "absent": 0, "days": set()})
        seq.append({"month": key, "present": m["present"], "late": m["late"], "absent": m["absent"],
                    "school_days": len(m["days"]), "percent": pct(m)})
        mth += 1
        if mth == 13:
            y, mth = y + 1, 1
    cls_rows = sorted(({"class_id": k, "class_name": classes.get(k, "No class"), **v, "percent": pct(v)} for k, v in by_class.items()),
                      key=lambda r: r["class_name"])
    return {"academic_year": year, "is_current": year == current_year(), "students": len(studs), "school_days": len(days),
            **tot, "percent": pct(tot), "months": seq, "classes": cls_rows}


# ---------- one day, class by class ----------
@router.get("/attendance/day")
async def attendance_day(date_str: str = Query(..., alias="date"), class_id: Optional[str] = None,
                         ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    day = _parse(date_str)
    cq: dict = class_teacher_query(ctx.user["id"]) if ctx.role == "teacher" else {}
    if class_id:
        cq = {"$and": [cq, {"id": class_id}]} if cq else {"id": class_id}
    classes = await ctx.db.classes.find(cq, {"_id": 0}).to_list(1000)
    users = {u["id"]: u["name"] async for u in ctx.db.users.find({}, {"_id": 0, "id": 1, "name": 1})}
    students = await ctx.db.students.find({"status": "active", "class_id": {"$in": [c["id"] for c in classes]}},
                                          {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "roll_number": 1, "class_id": 1}).to_list(5000)
    marks = {a["student_id"]: a["status"] async for a in ctx.db.attendance.find(
        {"date": day.isoformat(), "student_id": {"$in": [s["id"] for s in students]}}, {"_id": 0, "student_id": 1, "status": 1})}
    holiday = (await _holiday_map(ctx, day, day)).get(day.isoformat())
    out = []
    for c in classes:
        roster = []
        for s in sorted((s for s in students if s["class_id"] == c["id"]),
                        key=lambda s: (int(s["roll_number"]) if str(s.get("roll_number") or "").isdigit() else 9999, s["first_name"])):
            roster.append({"id": s["id"], "name": f"{s['first_name']} {s.get('last_name', '')}".strip(),
                           "roll_number": s.get("roll_number"), "status": marks.get(s["id"])})
        n = {k: sum(1 for r in roster if r["status"] == k) for k in ("present", "late", "absent")}
        marked = sum(n.values())
        out.append({"class_id": c["id"], "class_name": f"{c['name']} {c.get('section') or ''}".strip(), "name": c["name"],
                    "teacher": users.get(c.get("teacher_id")), "secondary_teacher": users.get(c.get("secondary_teacher_id")),
                    "attender_name": c.get("attender_name"), "attender_phone": c.get("attender_phone"),
                    "total": len(roster), **n, "unmarked": len(roster) - marked,
                    "percent": round((n["present"] + n["late"]) / marked * 100) if marked else None, "students": roster})
    return {"date": day.isoformat(), "weekday": day.strftime("%A"), "holiday": holiday, "weekend": day.weekday() == 6, "classes": out,
            "totals": {k: sum(c[k] for c in out) for k in ("total", "present", "late", "absent", "unmarked")}}


# ---------- management dashboard: the whole school in one payload ----------
def _months_back(today: date, n: int) -> list:
    out, y, m = [], today.year, today.month
    for _ in range(n):
        out.append(f"{y}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out[::-1]


@router.get("/dashboard/school")
async def dashboard_school(academic_year: Optional[str] = Query(None, max_length=20), ctx: TenantContext = Depends(require_roles("admin"))):
    year = academic_year or current_year()
    past = year != current_year()
    today = datetime.now(timezone.utc).date()
    classes = {c["id"]: c async for c in ctx.db.classes.find({}, {"_id": 0})}
    users = {u["id"]: u["name"] async for u in ctx.db.users.find({}, {"_id": 0, "id": 1, "name": 1})}
    students = await ctx.db.students.find({"status": "active"}, {"_id": 0, "photo_base64": 0}).to_list(5000)
    ids = {s["id"] for s in students}
    bus = {t["student_id"] async for t in ctx.db.transport.find({}, {"_id": 0, "student_id": 1})}

    since30 = (today - timedelta(days=30)).isoformat()
    months = _months_back(today, 6)
    if past:        # a finished year: every month from April to March, and attendance over the whole year
        lo, hi = year_bounds(year)
        months = [f"{lo[:4]}-{m:02d}" for m in range(4, 13)] + [f"{hi[:4]}-{m:02d}" for m in range(1, 4)]
        since30 = lo
    past_grades = await _grades_for_year(ctx, year, ids) if past else None
    first_month = months[0] + "-01"
    att30: dict = {}
    monthly: dict = {m: [0, 0] for m in months}
    todays = {"present": 0, "late": 0, "absent": 0}
    async for a in ctx.db.attendance.find({"date": {"$gte": min(since30, first_month)}}, {"_id": 0, "student_id": 1, "status": 1, "date": 1}):
        if a["student_id"] not in ids:
            continue
        good = a["status"] in ("present", "late")
        if a["date"] >= since30 and (not past or a["date"] <= year_bounds(year)[1]):
            t = att30.setdefault(a["student_id"], [0, 0]); t[1] += 1; t[0] += 1 if good else 0
        mk = monthly.get(a["date"][:7])
        if mk is not None:
            mk[1] += 1; mk[0] += 1 if good else 0
        if not past and a["date"] == today.isoformat():
            todays[a["status"]] += 1

    fees: dict = {}
    by_term: dict = {}
    async for f in ctx.db.fees.find(year_q(year), {"_id": 0}):
        if f["student_id"] not in ids:
            continue
        amt, paid = float(f.get("amount", 0)), float(f.get("paid_amount", 0))
        t = fees.setdefault(f["student_id"], [0.0, 0.0]); t[0] += amt; t[1] += paid
        b = by_term.setdefault(f.get("term") or "Other", [0.0, 0.0]); b[0] += amt; b[1] += paid

    rows, subj, subj_class = [], {}, {}
    for s in students:
        g = [x for x in ((past_grades.get(s["id"], []) if past else s.get("grades")) or []) if float(x.get("max_score") or 0) > 0]
        for x in g:
            pct = float(x["score"]) / float(x["max_score"]) * 100
            a = subj.setdefault(x["subject"], [0.0, 0]); a[0] += pct; a[1] += 1
            c = subj_class.setdefault(s.get("class_id") or "none", {}).setdefault(x["subject"], [0.0, 0]); c[0] += pct; c[1] += 1
        avg = round(sum(float(x["score"]) / float(x["max_score"]) for x in g) / len(g) * 100) if g else None
        a30 = att30.get(s["id"])
        total, paid = fees.get(s["id"], [0.0, 0.0])
        c = classes.get(s.get("class_id"))
        rows.append({
            "id": s["id"], "name": f"{s['first_name']} {s.get('last_name', '')}".strip(), "gender": s.get("gender") or "unspecified",
            "class_id": s.get("class_id"), "class_name": f"{c['name']} {c.get('section') or ''}".strip() if c else "No class",
            "teacher": users.get(c.get("teacher_id")) if c else None, "bus": s["id"] in bus,
            "grade_avg": avg, "attendance_pct": round(a30[0] / a30[1] * 100) if a30 else None,
            "fees_total": total, "fees_paid": paid, "fees_pending": max(total - paid, 0),
            "fee_status": fee_status(total, paid) if total else "none",
        })
    marked = todays["present"] + todays["late"] + todays["absent"]
    return {
        "as_of": today.isoformat(), "academic_year": year, "is_current": not past, "students": rows,
        "classes": [{"id": c["id"], "name": f"{c['name']} {c.get('section') or ''}".strip(), "base": c["name"], "teacher": users.get(c.get("teacher_id"))} for c in classes.values()],
        "today": {**todays, "unmarked": len(rows) - marked, "total": len(rows)},
        "monthly_attendance": [{"month": m, "pct": round(v[0] / v[1] * 100) if v[1] else None, "marked": v[1]} for m, v in monthly.items()],
        "fees_by_term": [{"term": k, "billed": v[0], "collected": v[1]} for k, v in sorted(by_term.items())],
        "subjects": [{"subject": k, "avg": round(v[0] / v[1]), "n": v[1]} for k, v in sorted(subj.items())],
        "subjects_by_class": {cid: {k: round(v[0] / v[1]) for k, v in d.items()} for cid, d in subj_class.items()},
    }
