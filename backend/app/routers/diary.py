"""Class diary (classwork, homework, notices) and the parent overview used by the parent app.

Teachers post to the classes they teach (admins can post to any class).
Parents only see posts for the classes their own children are in.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..models import PostBatchIn, PostIn
from ..security import TenantContext, get_ctx, require_roles
from ..utils import new_id, now_iso
from .school import fee_status, student_scope
from .transport import transport_for_student

router = APIRouter(tags=["diary"])


async def _parent_class_ids(ctx: TenantContext) -> list:
    rows = await ctx.db.students.find({**student_scope(ctx), "status": "active"}, {"_id": 0, "class_id": 1}).to_list(500)
    return sorted({r["class_id"] for r in rows if r.get("class_id")})


async def _class_for_posting(ctx: TenantContext, class_id: str) -> dict:
    cls = await ctx.db.classes.find_one({"id": class_id}, {"_id": 0})
    if not cls:
        raise HTTPException(status_code=400, detail="Class not found")
    if ctx.role == "teacher" and cls.get("teacher_id") != ctx.user["id"]:
        raise HTTPException(status_code=403, detail="You can post only to classes assigned to you. Ask your school admin to assign this class to you.")
    return cls


def _post_doc(ctx: TenantContext, class_id: str, kind: str, day: Optional[str], title: str, body, subject, due_date) -> dict:
    return {
        "id": new_id(), "class_id": class_id, "kind": kind,
        "title": title.strip(), "body": (body or "").strip() or None,
        "subject": (subject or "").strip() or None,
        "due_date": (due_date or None) if kind == "homework" else None,
        "date": day or datetime.now(timezone.utc).date().isoformat(),
        "created_by": ctx.user["id"], "created_by_name": ctx.user.get("name", ""), "created_at": now_iso(),
    }


@router.post("/posts", status_code=201)
async def create_post(payload: PostIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    await _class_for_posting(ctx, payload.class_id)
    doc = _post_doc(ctx, payload.class_id, payload.kind, payload.date, payload.title, payload.body, payload.subject, payload.due_date)
    await ctx.db.posts.insert_one(dict(doc))
    return doc


@router.post("/posts/batch", status_code=201)
async def create_posts(payload: PostBatchIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    """Post several items at once, e.g. homework for Maths, English and Science."""
    await _class_for_posting(ctx, payload.class_id)
    docs = [_post_doc(ctx, payload.class_id, payload.kind, payload.date, i.title, i.body, i.subject, i.due_date)
            for i in payload.items]
    await ctx.db.posts.insert_many([dict(d) for d in docs])
    return docs


@router.get("/posts")
async def list_posts(class_id: Optional[str] = None, kind: Optional[str] = Query(None, pattern="^(classwork|homework|notice)$"),
                     limit: int = Query(50, ge=1, le=200), ctx: TenantContext = Depends(get_ctx)):
    query: dict = {}
    if ctx.role == "parent":
        allowed = await _parent_class_ids(ctx)
        if class_id:
            if class_id not in allowed:
                return []
            query["class_id"] = class_id
        else:
            query["class_id"] = {"$in": allowed}
    elif class_id:
        query["class_id"] = class_id
    if kind:
        query["kind"] = kind
    return await ctx.db.posts.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(limit)


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    post = await ctx.db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if ctx.role == "teacher" and post.get("created_by") != ctx.user["id"]:
        raise HTTPException(status_code=403, detail="You can delete only your own posts")
    await ctx.db.posts.delete_one({"id": post_id})
    return {"ok": True}


@router.get("/parent/overview")
async def parent_overview(ctx: TenantContext = Depends(require_roles("parent"))):
    """Everything the parent app's home screen needs, in one call."""
    kids = await ctx.db.students.find({**student_scope(ctx), "status": "active"}, {"_id": 0, "photo_base64": 0}).to_list(50)
    classes = {c["id"]: c async for c in ctx.db.classes.find({}, {"_id": 0})}
    today = datetime.now(timezone.utc).date()
    since = (today - timedelta(days=30)).isoformat()
    children = []
    for k in kids:
        att = await ctx.db.attendance.find({"student_id": k["id"], "date": {"$gte": since}}, {"_id": 0}).to_list(100)
        present = sum(1 for a in att if a["status"] in ("present", "late"))
        todays = next((a["status"] for a in att if a["date"] == today.isoformat()), None)
        fees = await ctx.db.fees.find({"student_id": k["id"]}, {"_id": 0}).sort("due_date", 1).to_list(200)
        total = sum(float(f.get("amount", 0)) for f in fees)
        paid = sum(float(f.get("paid_amount", 0)) for f in fees)
        due = [f for f in fees if fee_status(float(f.get("amount", 0)), float(f.get("paid_amount", 0))) != "paid"]
        c = classes.get(k.get("class_id"))
        children.append({
            "id": k["id"], "first_name": k["first_name"], "last_name": k.get("last_name", ""),
            "class_id": k.get("class_id"), "class_name": f"{c['name']} {c.get('section') or ''}".strip() if c else None,
            "roll_number": k.get("roll_number"),
            "transport": await transport_for_student(ctx, k["id"]),
            "attendance": {"days_marked": len(att), "days_present": present,
                           "percent": round(present / len(att) * 100) if att else None, "today": todays},
            "fees": {"total": total, "paid": paid, "pending": max(total - paid, 0),
                     "next_due": ({"term": due[0].get("term"), "due_date": due[0].get("due_date"),
                                   "balance": float(due[0]["amount"]) - float(due[0].get("paid_amount", 0))} if due else None)},
        })
    class_ids = sorted({k["class_id"] for k in children if k.get("class_id")})
    posts = []
    if class_ids:
        posts = await ctx.db.posts.find({"class_id": {"$in": class_ids}}, {"_id": 0}).sort(
            [("date", -1), ("created_at", -1)]).to_list(30)
    return {"children": children, "posts": posts, "school_name": ctx.school.get("name")}
