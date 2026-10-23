"""School letters: bonafide, fee clearance, transfer and character certificates.

Each certificate gets a serial number (e.g. BON/2026-27/0001) and is stored with a snapshot of the
details at the time of issue, so a reprint always matches what was originally given out.
The PDF itself is drawn in the browser from the stored record.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from ..models import CertificateIn, SchoolProfileIn
from ..security import TenantContext, get_ctx, require_roles
from ..utils import new_id, now_iso

router = APIRouter(tags=["letters"])

PREFIX = {"bonafide": "BON", "fee_clearance": "FEE", "transfer": "TC", "character": "CHR"}
PROFILE_KEYS = ("address", "phone", "email", "principal_name", "affiliation")


def academic_year(today: Optional[datetime] = None) -> str:
    """Indian school year runs April to March: Oct 2026 -> '2026-27'."""
    d = today or datetime.now(timezone.utc)
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[-2:]}"


async def _profile(ctx: TenantContext) -> dict:
    doc = await ctx.db.settings.find_one({"_id": "profile"}) or {}
    return {k: doc.get(k) or "" for k in PROFILE_KEYS}


@router.get("/school/profile")
async def get_profile(ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    return {"name": ctx.school["name"], **(await _profile(ctx))}


@router.put("/school/profile")
async def update_profile(payload: SchoolProfileIn, ctx: TenantContext = Depends(require_roles("admin"))):
    data = {k: (getattr(payload, k) or "").strip() for k in PROFILE_KEYS}
    await ctx.db.settings.update_one({"_id": "profile"}, {"$set": data}, upsert=True)
    return {"name": ctx.school["name"], **data}


async def _next_number(ctx: TenantContext, kind: str, year: str) -> str:
    base = f"{PREFIX[kind]}/{year}/"
    n = await ctx.db.certificates.count_documents({"number": {"$regex": f"^{base}"}}) + 1
    return f"{base}{n:04d}"


@router.post("/certificates", status_code=201)
async def issue_certificate(payload: CertificateIn, ctx: TenantContext = Depends(require_roles("admin"))):
    st = await ctx.db.students.find_one({"id": payload.student_id}, {"_id": 0, "photo_base64": 0})
    if not st:
        raise HTTPException(status_code=404, detail="Student not found")
    cls = await ctx.db.classes.find_one({"id": st.get("class_id")}, {"_id": 0}) if st.get("class_id") else None

    fees = await ctx.db.fees.find({"student_id": st["id"]}, {"_id": 0, "amount": 1, "paid_amount": 1}).to_list(500)
    total = sum(float(f.get("amount", 0)) for f in fees)
    paid = sum(float(f.get("paid_amount", 0)) for f in fees)
    pending = max(total - paid, 0)

    if payload.kind == "fee_clearance" and pending > 0:
        raise HTTPException(status_code=400, detail=f"₹{pending:,.0f} is still pending for this student, so a fees-cleared letter can't be issued yet.")
    if payload.kind == "transfer" and pending > 0 and not payload.ignore_dues:
        raise HTTPException(status_code=409, detail=f"₹{pending:,.0f} is still pending for this student. Tick “Issue even though fees are pending” to continue.")
    if payload.kind == "transfer" and not (payload.leaving_date or st.get("leaving_date")):
        raise HTTPException(status_code=400, detail="Enter the date the student is leaving.")

    year = academic_year()
    gender = st.get("gender")
    data = {
        "student_name": f"{st['first_name']} {st.get('last_name', '')}".strip(),
        "relation": "Son" if gender == "male" else "Daughter" if gender == "female" else "Child",
        "guardian_name": st.get("guardian_name") or "",
        "date_of_birth": st.get("date_of_birth"),
        "roll_number": st.get("roll_number"),
        "class_name": f"{cls['name']} {cls.get('section') or ''}".strip() if cls else "",
        "academic_year": (cls or {}).get("academic_year") or year,
        "joining_date": st.get("joining_date"),
        "leaving_date": payload.leaving_date or st.get("leaving_date"),
        "address": st.get("address") or "",
        "purpose": payload.purpose, "reason": payload.reason, "conduct": payload.conduct or "Good",
        "remarks": payload.remarks,
        "fees_total": total, "fees_paid": paid,
        "dues_pending": pending,
    }
    school = {"name": ctx.school["name"], **(await _profile(ctx))}
    for _ in range(5):  # retry if two letters are issued at the same moment
        doc = {"id": new_id(), "number": await _next_number(ctx, payload.kind, year), "kind": payload.kind,
               "student_id": st["id"], "issued_on": datetime.now(timezone.utc).date().isoformat(),
               "issued_by": ctx.user.get("name", ""), "created_at": now_iso(), "data": data, "school": school}
        try:
            await ctx.db.certificates.insert_one(dict(doc))
            return doc
        except DuplicateKeyError:
            continue
    raise HTTPException(status_code=500, detail="Could not assign a certificate number. Please try again.")


@router.get("/certificates")
async def list_certificates(student_id: Optional[str] = None, limit: int = 100,
                            ctx: TenantContext = Depends(require_roles("admin"))):
    q = {"student_id": student_id} if student_id else {}
    return await ctx.db.certificates.find(q, {"_id": 0}).sort("created_at", -1).to_list(min(max(limit, 1), 500))
