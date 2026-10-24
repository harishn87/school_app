"""Class diary and parent overview."""
from conftest import login, signup
from test_school_api import _admin_id, _make_user


def _setup(server, new_client):
    signup(server, "greenwood")
    admin = server
    t1 = _make_user(admin, "teacher", "t1@greenwood.example.com")
    _make_user(admin, "teacher", "t2@greenwood.example.com")
    _make_user(admin, "parent", "mom@family.example.com")
    _make_user(admin, "parent", "other@family.example.com")
    c5 = admin.post("/api/classes", json={"name": "Grade 5", "section": "A", "teacher_id": t1["id"]}).json()
    c6 = admin.post("/api/classes", json={"name": "Grade 6", "section": "B", "teacher_id": _admin_id(admin)}).json()
    kid = admin.post("/api/students", json={"first_name": "Aarav", "last_name": "Sharma", "joining_date": "2025-06-01",
                                            "class_id": c5["id"], "guardian_email": "mom@family.example.com"}).json()
    admin.post("/api/students", json={"first_name": "Zed", "last_name": "Other", "joining_date": "2025-06-01",
                                      "class_id": c6["id"], "guardian_email": "other@family.example.com"})
    admin.post("/api/fees", json={"student_id": kid["id"], "term": "Term 1", "amount": 10000, "paid_amount": 4000,
                                  "due_date": "2026-12-01"})
    def as_(email):
        c = new_client(); assert login(c, "greenwood", email).status_code == 200; return c
    return {"admin": admin, "t1": as_("t1@greenwood.example.com"), "t2": as_("t2@greenwood.example.com"),
            "mom": as_("mom@family.example.com"), "other": as_("other@family.example.com"), "c5": c5, "c6": c6, "kid": kid}


def test_teacher_posts_only_to_own_class(server, new_client):
    x = _setup(server, new_client)
    ok = x["t1"].post("/api/posts", json={"class_id": x["c5"]["id"], "kind": "homework", "title": "Fractions ex 3",
                                          "subject": "Maths", "due_date": "2026-11-01"})
    assert ok.status_code == 201, ok.text
    assert ok.json()["due_date"] == "2026-11-01"
    assert x["t2"].post("/api/posts", json={"class_id": x["c5"]["id"], "kind": "notice", "title": "x"}).status_code == 403
    assert x["t1"].post("/api/posts", json={"class_id": x["c6"]["id"], "kind": "notice", "title": "x"}).status_code == 403
    assert x["admin"].post("/api/posts", json={"class_id": x["c6"]["id"], "kind": "notice", "title": "Holiday"}).status_code == 201
    assert x["mom"].post("/api/posts", json={"class_id": x["c5"]["id"], "kind": "notice", "title": "x"}).status_code == 403
    # due date only applies to homework
    cw = x["t1"].post("/api/posts", json={"class_id": x["c5"]["id"], "kind": "classwork", "title": "Photosynthesis",
                                          "due_date": "2026-11-01"}).json()
    assert cw["due_date"] is None


def test_parent_sees_only_their_childs_class(server, new_client):
    x = _setup(server, new_client)
    x["t1"].post("/api/posts", json={"class_id": x["c5"]["id"], "kind": "classwork", "title": "Grade 5 lesson"})
    x["admin"].post("/api/posts", json={"class_id": x["c6"]["id"], "kind": "notice", "title": "Grade 6 trip"})
    mine = [p["title"] for p in x["mom"].get("/api/posts").json()]
    assert mine == ["Grade 5 lesson"]
    assert x["mom"].get("/api/posts", params={"class_id": x["c6"]["id"]}).json() == []
    assert [p["title"] for p in x["other"].get("/api/posts").json()] == ["Grade 6 trip"]
    assert len(x["admin"].get("/api/posts").json()) == 2   # admin sees all
    assert x["t2"].get("/api/posts").json() == []          # a teacher with no classes sees none
    assert [p["title"] for p in x["t1"].get("/api/posts").json()] == ["Grade 5 lesson"]


def test_delete_rules(server, new_client):
    x = _setup(server, new_client)
    pid = x["t1"].post("/api/posts", json={"class_id": x["c5"]["id"], "kind": "notice", "title": "n"}).json()["id"]
    assert x["t2"].delete(f"/api/posts/{pid}").status_code == 403
    assert x["mom"].delete(f"/api/posts/{pid}").status_code == 403
    assert x["t1"].delete(f"/api/posts/{pid}").status_code == 200
    assert x["t1"].delete(f"/api/posts/{pid}").status_code == 404


def test_parent_overview(server, new_client):
    x = _setup(server, new_client)
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date().isoformat()
    x["t1"].post("/api/attendance/batch", json={"date": today, "class_id": x["c5"]["id"],
                                                "marks": [{"student_id": x["kid"]["id"], "status": "present"}]})
    x["t1"].post("/api/posts", json={"class_id": x["c5"]["id"], "kind": "homework", "title": "HW"})
    o = x["mom"].get("/api/parent/overview").json()
    assert len(o["children"]) == 1
    ch = o["children"][0]
    assert ch["first_name"] == "Aarav" and ch["class_name"] == "Grade 5 A"
    assert ch["attendance"]["today"] == "present" and ch["attendance"]["percent"] == 100
    assert ch["fees"]["pending"] == 6000 and ch["fees"]["next_due"]["balance"] == 6000
    assert [p["title"] for p in o["posts"]] == ["HW"]
    assert x["t1"].get("/api/parent/overview").status_code == 403
    assert x["admin"].get("/api/parent/overview").status_code == 403
