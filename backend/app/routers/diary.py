"""Class diary (classwork, homework, notices) and the parent overview used by the parent app.

Teachers post to the classes they teach (admins can post to any class).
Parents only see posts for the classes their own children are in.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..models import PostBatchIn, PostIn, StudentNoteIn
from ..security import TenantContext, get_ctx, require_roles
from ..utils import current_year, fee_terms, new_id, now_iso
from .school import fee_status, student_scope, teacher_class_ids
from .transport import transport_for_student

router = APIRouter(tags=["diary"])


async def _parent_class_ids(ctx: TenantContext) -> list:
    rows = await ctx.db.students.find({**student_scope(ctx), "status": "active"}, {"_id": 0, "class_id": 1}).to_list(500)
    return sorted({r["class_id"] for r in rows if r.get("class_id")})


async def _class_for_posting(ctx: TenantContext, class_id: str) -> dict:
    cls = await ctx.db.classes.find_one({"id": class_id}, {"_id": 0})
    if not cls:
        raise HTTPException(status_code=400, detail="Class not found")
    if ctx.role == "teacher" and ctx.user["id"] not in (cls.get("teacher_id"), cls.get("secondary_teacher_id")):
        raise HTTPException(status_code=403, detail="You can post only to classes assigned to you. Ask your school admin to assign this class to you.")
    return cls


def _post_doc(ctx: TenantContext, class_id: str, kind: str, day: Optional[str], title: str, body, subject, due_date, draft: bool = False) -> dict:
    return {
        "id": new_id(), "class_id": class_id, "kind": kind,
        "title": title.strip(), "body": (body or "").strip() or None,
        "subject": (subject or "").strip() or None,
        "due_date": (due_date or None) if kind == "homework" else None,
        "date": day or datetime.now(timezone.utc).date().isoformat(),
        "status": "draft" if draft else "published", "published_at": None if draft else now_iso(),
        "created_by": ctx.user["id"], "created_by_name": ctx.user.get("name", ""), "created_at": now_iso(),
    }


@router.post("/posts", status_code=201)
async def create_post(payload: PostIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    await _class_for_posting(ctx, payload.class_id)
    doc = _post_doc(ctx, payload.class_id, payload.kind, payload.date, payload.title, payload.body, payload.subject, payload.due_date, payload.draft)
    await ctx.db.posts.insert_one(dict(doc))
    return doc


@router.post("/posts/batch", status_code=201)
async def create_posts(payload: PostBatchIn, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    """Post several items at once, e.g. homework for Maths, English and Science."""
    await _class_for_posting(ctx, payload.class_id)
    docs = [_post_doc(ctx, payload.class_id, payload.kind, payload.date, i.title, i.body, i.subject, i.due_date, payload.draft)
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
    elif ctx.role == "teacher":
        mine = await teacher_class_ids(ctx)
        if class_id:
            if class_id not in mine:
                return []
            query["class_id"] = class_id
        else:
            query["class_id"] = {"$in": mine}
    elif class_id:
        query["class_id"] = class_id
    if kind:
        query["kind"] = kind
    # Drafts are the author's own: parents never see them, teachers see only theirs, admins see all
    if ctx.role == "parent":
        query["status"] = {"$ne": "draft"}
    elif ctx.role == "teacher":
        query["$or"] = [{"status": {"$ne": "draft"}}, {"created_by": ctx.user["id"]}]
    return await ctx.db.posts.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(limit)


@router.post("/posts/{post_id}/publish")
async def publish_post(post_id: str, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    post = await ctx.db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if ctx.role == "teacher" and post.get("created_by") != ctx.user["id"]:
        raise HTTPException(status_code=403, detail="You can publish only your own posts")
    await ctx.db.posts.update_one({"id": post_id}, {"$set": {"status": "published", "published_at": now_iso()}})
    return {**post, "status": "published"}


@router.get("/posts/unread")
async def unread_posts(ctx: TenantContext = Depends(get_ctx)):
    """How many published posts are new since this user last opened the diary (parents and teachers)."""
    seen = ctx.user.get("posts_seen_at") or "1970-01-01T00:00:00"
    q: dict = {"status": {"$ne": "draft"}, "created_by": {"$ne": ctx.user["id"]},
         "$or": [{"published_at": {"$gt": seen}}, {"published_at": {"$in": [None]}, "created_at": {"$gt": seen}}]}
    if ctx.role == "parent":
        q["class_id"] = {"$in": await _parent_class_ids(ctx)}
    elif ctx.role == "teacher":
        q["class_id"] = {"$in": await teacher_class_ids(ctx)}
    n = await ctx.db.posts.count_documents(q)
    return {"unread": n, "since": seen}


@router.post("/posts/seen")
async def mark_posts_seen(ctx: TenantContext = Depends(get_ctx)):
    await ctx.db.users.update_one({"id": ctx.user["id"]}, {"$set": {"posts_seen_at": now_iso()}})
    return {"ok": True}


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    post = await ctx.db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if ctx.role == "teacher" and post.get("created_by") != ctx.user["id"]:
        raise HTTPException(status_code=403, detail="You can delete only your own posts")
    await ctx.db.posts.delete_one({"id": post_id})
    return {"ok": True}


async def _student_for_notes(ctx: TenantContext, student_id: str, write: bool) -> dict:
    st = await ctx.db.students.find_one({"id": student_id}, {"_id": 0, "photo_base64": 0})
    if not st:
        raise HTTPException(status_code=404, detail="Student not found")
    if ctx.role == "parent":
        if not await ctx.db.students.find_one({**student_scope(ctx), "id": student_id}, {"_id": 1}):
            raise HTTPException(status_code=404, detail="Student not found")
    elif ctx.role == "teacher" and st.get("class_id") not in await teacher_class_ids(ctx):
        raise HTTPException(status_code=403, detail="You can write notes only for students in your own classes.")
    return st


@router.post("/students/{student_id}/notes", status_code=201)
async def add_student_note(student_id: str, payload: StudentNoteIn, ctx: TenantContext = Depends(get_ctx)):
    """A private message about one child: a teacher writes to the parents, a parent asks the teachers."""
    st = await _student_for_notes(ctx, student_id, True)
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Write the note first")
    doc = {"id": new_id(), "student_id": student_id, "class_id": st.get("class_id"), "body": payload.body.strip(), "urgent": payload.urgent and ctx.role != "parent",
           "from_role": "parent" if ctx.role == "parent" else "teacher",
           "created_by": ctx.user["id"], "created_by_name": ctx.user.get("name", ""), "created_at": now_iso()}
    await ctx.db.student_notes.insert_one(dict(doc))
    return doc


@router.get("/students/{student_id}/notes")
async def list_student_notes(student_id: str, ctx: TenantContext = Depends(get_ctx)):
    await _student_for_notes(ctx, student_id, False)
    return await ctx.db.student_notes.find({"student_id": student_id}, {"_id": 0}).sort("created_at", -1).to_list(100)


@router.get("/student-notes/inbox")
async def student_notes_inbox(ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    """Latest messages parents have sent about children in the teacher's classes (the school's classes for an admin)."""
    q: dict = {"from_role": "parent", "read_at": {"$exists": False}}
    if ctx.role == "teacher":
        q["class_id"] = {"$in": await teacher_class_ids(ctx)}
    rows = await ctx.db.student_notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(40)
    kids = {k["id"]: k async for k in ctx.db.students.find({"id": {"$in": [r["student_id"] for r in rows]}}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1})}
    classes = {c["id"]: c async for c in ctx.db.classes.find({}, {"_id": 0, "id": 1, "name": 1, "section": 1})}
    out = []
    for r in rows:
        k, c = kids.get(r["student_id"]), classes.get(r.get("class_id"))
        # unanswered = no teacher reply after it
        later = await ctx.db.student_notes.count_documents({"student_id": r["student_id"], "from_role": "teacher", "created_at": {"$gt": r["created_at"]}})
        out.append({**r, "student_name": f"{k['first_name']} {k.get('last_name', '')}".strip() if k else "", "answered": later > 0,
                    "class_name": f"{c['name']} {c.get('section') or ''}".strip() if c else None})
    return [o for o in out if not o["answered"]][:15]     # a reply or "mark read" takes a message off the list


@router.post("/student-notes/{note_id}/read")
async def mark_student_note_read(note_id: str, ctx: TenantContext = Depends(require_roles("admin", "teacher"))):
    n = await ctx.db.student_notes.find_one({"id": note_id, "from_role": "parent"}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Message not found")
    await _student_for_notes(ctx, n["student_id"], write=True)
    await ctx.db.student_notes.update_one({"id": note_id}, {"$set": {"read_at": now_iso()}})
    return {"ok": True}


@router.delete("/student-notes/{note_id}")
async def delete_student_note(note_id: str, ctx: TenantContext = Depends(require_roles("admin", "teacher", "parent"))):
    n = await ctx.db.student_notes.find_one({"id": note_id}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Note not found")
    if ctx.role != "admin" and n.get("created_by") != ctx.user["id"]:
        raise HTTPException(status_code=403, detail="You can delete only your own notes")
    await ctx.db.student_notes.delete_one({"id": note_id})
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
            "fees": {"total": total, "paid": paid, "pending": max(total - paid, 0), "by_term": fee_terms([f for f in fees if (f.get("academic_year") or current_year()) == current_year()]), "year": current_year(),
                     "next_due": ({"term": due[0].get("term"), "due_date": due[0].get("due_date"),
                                   "balance": float(due[0]["amount"]) - float(due[0].get("paid_amount", 0))} if due else None)},
        })
    class_ids = sorted({k["class_id"] for k in children if k.get("class_id")})
    posts = []
    if class_ids:
        posts = await ctx.db.posts.find({"class_id": {"$in": class_ids}, "status": {"$ne": "draft"}}, {"_id": 0}).sort(
            [("date", -1), ("created_at", -1)]).to_list(30)
    return {"children": children, "posts": posts, "school_name": ctx.school.get("name")}
