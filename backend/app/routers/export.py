"""Download the school's data as an Excel workbook (principal only)."""
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from ..security import TenantContext, require_roles
from ..utils import current_year, today_ist, year_q
from ..xlsx import build_xlsx
from .insights import dashboard_school, staff_performance
from .syllabus import _enrich, subject_teachers, syllabus_summary

router = APIRouter(prefix="/export", tags=["export"])
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _money(v):
    return round(float(v or 0), 2)


@router.get("/school.xlsx")
async def export_school(academic_year: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"), ctx: TenantContext = Depends(require_roles("admin"))):
    year = academic_year or current_year()
    dash = await dashboard_school(academic_year=year, ctx=ctx)
    staff = await staff_performance(academic_year=year, ctx=ctx)
    users = {u["id"]: u["name"] async for u in ctx.db.users.find({}, {"_id": 0, "id": 1, "name": 1})}
    classes = await ctx.db.classes.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    cname = {c["id"]: f"{c['name']} {c.get('section') or ''}".strip() for c in classes}
    full = {s["id"]: s async for s in ctx.db.students.find({}, {"_id": 0, "photo_base64": 0})}
    srows = dash["students"]
    today = today_ist()

    students = [["Name", "Class", "Class teacher", "Gender", "Status", "Joined", "Guardian", "Guardian phone", "Guardian email", "Bus",
                 "Attendance % (30 days)", "Average grade %", "Fees billed", "Fees paid", "Fees pending", "Fee status"]]
    for r in srows:
        f = full.get(r["id"], {})
        students.append([r["name"], r["class_name"], r["teacher"], r["gender"], f.get("status", "active"), f.get("joining_date"), f.get("guardian_name"),
                         f.get("guardian_phone"), f.get("guardian_email"), "Yes" if r["bus"] else "No", r["attendance_pct"], r["grade_avg"],
                         _money(r["fees_total"]), _money(r["fees_paid"]), _money(r["fees_pending"]), r["fee_status"]])

    fee_rows = [["Student", "Class", "Term", "Billed", "Paid", "Pending", "Due date", "Paid on", "Note"]]
    async for f in ctx.db.fees.find(year_q(year), {"_id": 0}).sort("term", 1):
        s = full.get(f["student_id"], {})
        name = f"{s.get('first_name', '')} {s.get('last_name', '')}".strip() or f["student_id"]
        fee_rows.append([name, cname.get(s.get("class_id"), ""), f.get("term"), _money(f.get("amount")), _money(f.get("paid_amount")),
                         max(_money(f.get("amount")) - _money(f.get("paid_amount")), 0), f.get("due_date"), f.get("paid_date"), f.get("note")])

    terms = [["Term", "Billed", "Collected", "Pending", "Collected %", "Records", "Paid", "Part paid", "Unpaid", "Earliest due date"]]
    tot = [0.0, 0.0]
    for t in dash["fees_by_term"]:
        terms.append([t["term"], _money(t["billed"]), _money(t["collected"]), _money(t["pending"]), t["percent"], t["records"], t["paid"], t["partial"], t["unpaid"], t["due_date"]])
        tot[0] += t["billed"]; tot[1] += t["collected"]
    if len(terms) > 1:
        terms.append(["Whole year", _money(tot[0]), _money(tot[1]), _money(max(tot[0] - tot[1], 0)), round(tot[1] / tot[0] * 100) if tot[0] else None, None, None, None, None, None])

    cls_rows = [["Class", "Class teacher", "Second teacher", "Students", "Subjects (teacher)", "Attender", "Attender phone"]]
    count: dict = {}
    for r in srows:
        count[r["class_id"]] = count.get(r["class_id"], 0) + 1
    for c in classes:
        subs = ", ".join(f"{x['name']} ({users.get(x.get('teacher_id') or c.get('teacher_id'), '')})" for x in c.get("subjects") or [])
        cls_rows.append([cname[c["id"]], users.get(c.get("teacher_id")), users.get(c.get("secondary_teacher_id")), count.get(c["id"], 0), subs, c.get("attender_name"), c.get("attender_phone")])

    syl = [["Class", "Term", "Term starts", "Term ends", "Subject", "Taught by", "Covered %", "Target % today", "Points ahead (+) / behind (-)", "Status", "Chapters done", "Chapters"]]
    by_class = {c["id"]: c for c in classes}
    async for d in ctx.db.syllabus.find({"academic_year": year}, {"_id": 0}).sort([("class_id", 1), ("term", 1)]):
        c = by_class.get(d["class_id"])
        if not c:
            continue
        e = _enrich(d, today)
        who = subject_teachers(c, users)
        for s in e["subjects"]:
            t = who.get(s["name"].strip().lower(), {"name": users.get(c.get("teacher_id"))})["name"]
            syl.append([cname[c["id"]], d["term"], d["start_date"], d["end_date"], s["name"], t, s["percent"], e["target"], s["percent"] - e["target"], s["status"], s["chapters_done"], s["chapters_total"]])
    summ = await syllabus_summary(academic_year=year, ctx=ctx)
    syl_cls = [["Class", "Class teacher", "Term 1 %", "Term 2 %", "Term 3 %", "Whole year %", "Year target %", "Year status"]]
    for r in summ["classes"]:
        tp = {t["term"]: t["percent"] for t in r["terms"]}
        syl_cls.append([r["class_name"], r["teacher"], tp.get("Term 1"), tp.get("Term 2"), tp.get("Term 3"), r["year"]["percent"], r["year"]["target"], r["year"]["status"]])

    st = [["Teacher", "Email", "Classes", "Students", "Overall", "Student results %", "Student attendance %", "Register regularity %", "Marks entry %", "Diary activity %", "Syllabus coverage %", "Diary days"]]
    for t in staff["teachers"]:
        m = t["metrics"]
        st.append([t["name"], t.get("email"), ", ".join(f"{c['name']} ({c['role']})" for c in t["classes"]), t["students"], t["overall"], m["results"], m["attendance"],
                   m["register"], m["marks"], m["diary"], m["syllabus"], t["diary_days"]])

    att = [["Month", "Attendance %", "Student-days marked"]] + [[m["month"], m["pct"], m["marked"]] for m in dash["monthly_attendance"]]
    subj = [["Subject", "Average marks %", "Results counted"]] + [[s["subject"], s["avg"], s["n"]] for s in dash["subjects"]]

    summary = [["Item", "Value"], ["School", ctx.school.get("name")], ["Academic year", year],
               ["Exported on", datetime.now().strftime("%Y-%m-%d %H:%M")], ["Students (active)", len(srows)], ["Classes", len(classes)], ["Teachers with a class", len(staff["teachers"])],
               ["Fees billed", _money(sum(r["fees_total"] for r in srows))], ["Fees collected", _money(sum(r["fees_paid"] for r in srows))],
               ["Fees pending", _money(sum(r["fees_pending"] for r in srows))]]

    sheets = [("Summary", summary[0], summary[1:]), ("Students", students[0], students[1:]), ("Classes", cls_rows[0], cls_rows[1:]),
              ("Fees by term", terms[0], terms[1:]), ("Fee records", fee_rows[0], fee_rows[1:]), ("Syllabus by class", syl_cls[0], syl_cls[1:]),
              ("Syllabus by subject", syl[0], syl[1:]), ("Staff performance", st[0], st[1:]), ("Attendance by month", att[0], att[1:]), ("Subject averages", subj[0], subj[1:])]
    name = re.sub(r"[^A-Za-z0-9]+", "-", str(summary[1][1] or "school")).strip("-") or "school"
    return Response(content=build_xlsx(sheets), media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{name}-{year}-data.xlsx"', "Cache-Control": "no-store"})
