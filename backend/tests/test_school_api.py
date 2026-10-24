"""API tests for the multi-school (SaaS) backend."""
from datetime import datetime, timedelta, timezone

from conftest import PASSWORD, login, signup

STUDENT = {"first_name": "Aarav", "last_name": "Sharma", "joining_date": "2025-06-01"}


def _past():
    return (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()


def _platform(new_client):
    c = new_client()
    r = c.post("/api/platform/auth/login", json={"email": "owner@platform.example.com", "password": "OwnerPass#2026"})
    assert r.status_code == 200, r.text
    return c


# ---------- health ----------
def test_health(server):
    assert server.get("/api/health").json() == {"status": "ok"}


# ---------- signup & login ----------
def test_signup_creates_school_and_logs_in(server):
    out = signup(server, "greenwood")
    assert out["role"] == "admin"
    assert out["school"]["slug"] == "greenwood"
    assert out["school"]["plan"] == "trial"
    assert out["school"]["subscription"]["active"] is True
    me = server.get("/api/auth/me").json()
    assert me["email"] == "admin@greenwood.example.com"
    assert me["school"]["name"] == "Greenwood School"


def test_signup_rejects_duplicate_and_bad_codes(server, new_client):
    signup(server, "greenwood")
    r = new_client().post("/api/schools/signup", json={
        "school_name": "Other", "school_code": "greenwood", "admin_name": "X",
        "admin_email": "x@x.example.com", "password": PASSWORD})
    assert r.status_code == 409
    for bad in ("ab", "Bad Code!", "admin", "-lead"):
        assert server.get("/api/schools/check-code", params={"code": bad}).json()["available"] is False
    assert server.get("/api/schools/check-code", params={"code": "fresh-school"}).json()["available"] is True


def test_login_requires_matching_school_code(server, new_client):
    signup(server, "greenwood")
    signup(new_client(), "riverside")
    c = new_client()
    assert login(c, "riverside", "admin@greenwood.example.com").status_code == 401
    assert login(c, "nope", "admin@greenwood.example.com").status_code == 401
    assert login(c, "greenwood", "admin@greenwood.example.com", "wrong-pass").status_code == 401
    assert login(c, "greenwood", "admin@greenwood.example.com").status_code == 200


def test_weak_password_rejected(server):
    r = server.post("/api/schools/signup", json={
        "school_name": "Weak", "school_code": "weak-school", "admin_name": "A",
        "admin_email": "a@weak.example.com", "password": "123"})
    assert r.status_code == 422


# ---------- tenant isolation (the most important property) ----------
def test_schools_cannot_see_each_others_data(server, new_client):
    a = new_client(); signup(a, "school-a")
    b = new_client(); signup(b, "school-b")

    cls = a.post("/api/classes", json={"name": "Grade 1", "teacher_id": _admin_id(a)}).json()
    stu = a.post("/api/students", json={**STUDENT, "class_id": cls["id"]}).json()
    a.post("/api/fees", json={"student_id": stu["id"], "term": "T1", "amount": 1000})

    assert b.get("/api/students").json() == []
    assert b.get("/api/classes").json() == []
    assert b.get("/api/fees").json() == []
    assert b.get(f"/api/students/{stu['id']}").status_code == 404
    assert b.put(f"/api/students/{stu['id']}", json=STUDENT).status_code == 404
    assert b.delete(f"/api/students/{stu['id']}").status_code == 404
    # B can't attach records to A's student either
    assert b.post("/api/fees", json={"student_id": stu["id"], "term": "T1", "amount": 5}).status_code == 400
    assert b.post("/api/attendance/batch", json={"date": "2026-01-01", "marks": [
        {"student_id": stu["id"], "status": "present"}]}).status_code == 400
    assert b.get("/api/dashboard/stats").json()["total_students"] == 0
    # A still sees its own data
    assert len(a.get("/api/students").json()) == 1


def test_same_email_can_exist_in_two_schools(server, new_client):
    signup(new_client(), "school-a", email="same@person.example.com")
    signup(new_client(), "school-b", email="same@person.example.com")
    c = new_client()
    assert login(c, "school-a", "same@person.example.com").json()["school"]["slug"] == "school-a"
    assert login(c, "school-b", "same@person.example.com").json()["school"]["slug"] == "school-b"


# ---------- roles ----------
def _make_user(admin, role, email):
    r = admin.post("/api/users", json={"name": role.title(), "email": email, "role": role, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return r.json()


def test_admin_manages_users_and_roles_are_enforced(server, new_client):
    admin = new_client(); signup(admin, "greenwood")
    _make_user(admin, "teacher", "t@greenwood.example.com")
    teacher = new_client(); assert login(teacher, "greenwood", "t@greenwood.example.com").status_code == 200

    assert teacher.post("/api/students", json=STUDENT).status_code == 403   # teachers add students only to their own class
    assert teacher.post("/api/classes", json={"name": "X"}).status_code == 403
    assert teacher.post("/api/users", json={"name": "n", "email": "n@x.example.com", "role": "admin",
                                            "password": PASSWORD}).status_code == 403
    assert admin.post("/api/users", json={"name": "dup", "email": "t@greenwood.example.com", "role": "teacher",
                                          "password": PASSWORD}).status_code == 409


def test_disabled_user_cannot_log_in(server, new_client):
    admin = new_client(); signup(admin, "greenwood")
    t = _make_user(admin, "teacher", "t@greenwood.example.com")
    admin.put(f"/api/users/{t['id']}", json={"active": False})
    assert login(new_client(), "greenwood", "t@greenwood.example.com").status_code == 403


def test_admin_cannot_demote_self(server):
    me = signup(server, "greenwood")
    assert server.put(f"/api/users/{me['id']}", json={"role": "teacher"}).status_code == 400
    assert server.delete(f"/api/users/{me['id']}").status_code == 400


def test_parent_sees_only_own_children(server, new_client):
    admin = new_client(); signup(admin, "greenwood")
    _make_user(admin, "parent", "mom@family.example.com")
    mine = admin.post("/api/students", json={**STUDENT, "guardian_email": "Mom@Family.example.com"}).json()
    other = admin.post("/api/students", json={**STUDENT, "first_name": "Other",
                                              "guardian_email": "someone@else.example.com"}).json()
    admin.post("/api/fees", json={"student_id": mine["id"], "term": "T1", "amount": 100})
    admin.post("/api/fees", json={"student_id": other["id"], "term": "T1", "amount": 999})

    parent = new_client(); assert login(parent, "greenwood", "mom@family.example.com").status_code == 200
    students = parent.get("/api/students").json()
    assert [s["id"] for s in students] == [mine["id"]]
    assert parent.get(f"/api/students/{other['id']}").status_code == 404
    fees = parent.get("/api/fees").json()
    assert len(fees) == 1 and fees[0]["amount"] == 100
    assert parent.get("/api/fees", params={"student_id": other["id"]}).json() == []
    assert parent.get("/api/dashboard/stats").json()["fees_total_due"] == 100
    assert parent.post("/api/students", json=STUDENT).status_code == 403


# ---------- plans, limits, subscription state ----------
def test_student_limit_enforced(server, new_client, monkeypatch):
    from app import plans
    monkeypatch.setitem(plans.PLANS, "trial", {**plans.PLANS["trial"], "max_students": 2})
    signup(server, "greenwood")
    assert server.post("/api/students", json=STUDENT).status_code == 201
    assert server.post("/api/students", json=STUDENT).status_code == 201
    assert server.post("/api/students", json=STUDENT).status_code == 402
    # students who have left don't count
    assert server.post("/api/students", json={**STUDENT, "status": "left"}).status_code == 201


def test_expired_trial_is_read_only_until_upgraded(server, new_client):
    admin = new_client(); out = signup(admin, "greenwood")
    admin.post("/api/students", json=STUDENT)
    owner = _platform(new_client)
    owner.patch(f"/api/platform/schools/{out['school']['id']}", json={"trial_ends_at": _past()})

    assert admin.get("/api/students").status_code == 200           # can still read
    assert admin.post("/api/students", json=STUDENT).status_code == 402  # can't write
    billing = admin.get("/api/billing").json()
    assert billing["school"]["subscription"]["reason"] == "trial_expired"
    assert admin.post("/api/billing/upgrade-request", json={"plan": "basic"}).status_code == 200

    stats = owner.get("/api/platform/stats").json()
    assert stats["pending_upgrade_requests"] == 1
    owner.patch(f"/api/platform/schools/{out['school']['id']}", json={"plan": "basic"})
    assert admin.post("/api/students", json=STUDENT).status_code == 201
    assert admin.get("/api/billing").json()["upgrade_request"] is None


def test_suspended_school_is_blocked(server, new_client):
    admin = new_client(); out = signup(admin, "greenwood")
    owner = _platform(new_client)
    owner.patch(f"/api/platform/schools/{out['school']['id']}", json={"status": "suspended"})
    assert admin.get("/api/students").status_code == 403
    assert login(new_client(), "greenwood", "admin@greenwood.example.com").status_code == 403
    owner.patch(f"/api/platform/schools/{out['school']['id']}", json={"status": "active"})
    assert admin.get("/api/students").status_code == 200


# ---------- platform (super admin) ----------
def test_platform_requires_super_admin(server, new_client):
    school_admin = new_client(); signup(school_admin, "greenwood")
    assert school_admin.get("/api/platform/schools").status_code == 401
    assert new_client().post("/api/platform/auth/login", json={
        "email": "owner@platform.example.com", "password": "nope"}).status_code == 401
    owner = _platform(new_client)
    schools = owner.get("/api/platform/schools").json()
    assert schools[0]["slug"] == "greenwood" and schools[0]["usage"]["staff"] == 1
    r = owner.post("/api/platform/schools", json={"school_name": "Hill", "school_code": "hill",
                                                  "admin_name": "H", "admin_email": "h@hill.example.com",
                                                  "password": PASSWORD})
    assert r.status_code == 201
    assert login(new_client(), "hill", "h@hill.example.com").status_code == 200


def test_school_token_is_not_a_platform_token(server, new_client):
    c = new_client(); signup(c, "greenwood")
    token = login(c, "greenwood", "admin@greenwood.example.com").json()["access_token"]
    fresh = new_client()
    assert fresh.get("/api/platform/schools", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert fresh.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


# ---------- security details ----------
def test_login_rate_limited(server, new_client):
    signup(server, "greenwood")
    c = new_client()
    codes = [login(c, "greenwood", "admin@greenwood.example.com", "bad").status_code for _ in range(11)]
    assert codes[:10] == [401] * 10 and codes[10] == 429


def test_refresh_issues_new_session(server):
    signup(server, "greenwood")
    server.cookies.delete("access_token")
    assert server.get("/api/auth/me").status_code == 401
    assert server.post("/api/auth/refresh").status_code == 200
    assert server.get("/api/auth/me").status_code == 200


def test_search_input_is_not_treated_as_regex(server):
    signup(server, "greenwood")
    server.post("/api/students", json=STUDENT)
    assert server.get("/api/students", params={"q": ".*"}).json() == []
    assert len(server.get("/api/students", params={"q": "aar"}).json()) == 1


def test_change_password(server, new_client):
    signup(server, "greenwood")
    assert server.post("/api/auth/change-password", json={"current_password": "wrong",
                                                          "new_password": "AnotherPass1"}).status_code == 400
    assert server.post("/api/auth/change-password", json={"current_password": PASSWORD,
                                                          "new_password": "AnotherPass1"}).status_code == 200
    assert login(new_client(), "greenwood", "admin@greenwood.example.com", "AnotherPass1").status_code == 200


# ---------- core school features still work ----------
def test_class_student_fee_attendance_flow(server):
    signup(server, "greenwood")
    cls = server.post("/api/classes", json={"name": "Grade 5", "section": "A", "teacher_id": _admin_id(server)}).json()
    s = server.post("/api/students", json={**STUDENT, "class_id": cls["id"]}).json()
    assert server.post("/api/students", json={**STUDENT, "class_id": "missing"}).status_code == 400

    fee = server.post("/api/fees", json={"student_id": s["id"], "term": "T1", "amount": 1000,
                                         "paid_amount": 400}).json()
    assert fee["status"] == "partial"
    fee = server.put(f"/api/fees/{fee['id']}", json={"student_id": s["id"], "term": "T1", "amount": 1000,
                                                     "paid_amount": 1000}).json()
    assert fee["status"] == "paid"

    today = datetime.now(timezone.utc).date().isoformat()
    r = server.post("/api/attendance/batch", json={"date": today, "class_id": cls["id"],
                                                   "marks": [{"student_id": s["id"], "status": "present"}]})
    assert r.json() == {"updated": 1}
    server.post("/api/attendance/batch", json={"date": today, "marks": [{"student_id": s["id"], "status": "late"}]})
    rows = server.get("/api/attendance", params={"date": today}).json()
    assert len(rows) == 1 and rows[0]["status"] == "late"

    stats = server.get("/api/dashboard/stats").json()
    assert stats["total_students"] == 1 and stats["fees_collected"] == 1000 and stats["attendance_today_pct"] == 100

    # deleting a class unassigns its students; deleting a student removes its fees/attendance
    server.delete(f"/api/classes/{cls['id']}")
    assert server.get(f"/api/students/{s['id']}").json()["class_id"] is None
    server.delete(f"/api/students/{s['id']}")
    assert server.get("/api/fees").json() == [] and server.get("/api/attendance").json() == []


# ---------- migration of old single-school data ----------
def test_migrate_single_school(server, new_client):
    import asyncio

    from app.db import get_client
    from app.security import hash_password
    from scripts.migrate_single_school import main as migrate

    async def seed_old():
        old = get_client()["legacy_school"]
        await old.users.insert_one({"id": "u1", "email": "boss@old.example.com", "name": "Boss", "role": "admin",
                                    "password_hash": hash_password(PASSWORD), "created_at": "2025-01-01"})
        await old.students.insert_one({**STUDENT, "id": "s1", "status": "active", "created_at": "2025-01-01"})
    asyncio.run(seed_old())
    asyncio.run(migrate("legacy_school", "old-school", "Old School", "basic"))

    c = new_client()
    r = login(c, "old-school", "boss@old.example.com")
    assert r.status_code == 200 and r.json()["school"]["plan"] == "basic"
    assert [s["id"] for s in c.get("/api/students").json()] == ["s1"]


def _admin_id(admin):
    """Id of the school admin, used as a stand-in class teacher in tests."""
    return next(u["id"] for u in admin.get("/api/users").json() if u["role"] == "admin")
