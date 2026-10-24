from conftest import login, signup
from test_school_api import _make_user


def _setup(server, new_client):
    signup(server, "greenwood")
    t1 = _make_user(server, "teacher", "t1@greenwood.example.com")
    _make_user(server, "teacher", "t2@greenwood.example.com")
    _make_user(server, "parent", "mom@family.example.com")
    _make_user(server, "parent", "other@family.example.com")
    c5 = server.post("/api/classes", json={"name": "Grade 5", "section": "A", "teacher_id": t1["id"]}).json()
    c6 = server.post("/api/classes", json={"name": "Grade 6", "section": "A"}).json()
    k5 = server.post("/api/students", json={"first_name": "Aarav", "last_name": "S", "joining_date": "2025-06-01", "class_id": c5["id"],
                                            "guardian_email": "mom@family.example.com"}).json()
    k6 = server.post("/api/students", json={"first_name": "Zed", "last_name": "O", "joining_date": "2025-06-01", "class_id": c6["id"],
                                            "guardian_email": "other@family.example.com"}).json()
    def as_(email):
        c = new_client(); assert login(c, "greenwood", email).status_code == 200; return c
    return {"admin": server, "t1": as_("t1@greenwood.example.com"), "t2": as_("t2@greenwood.example.com"), "mom": as_("mom@family.example.com"),
            "other": as_("other@family.example.com"), "c5": c5, "c6": c6, "k5": k5, "k6": k6}


def test_teacher_scoping(server, new_client):
    x = _setup(server, new_client)
    assert [c["id"] for c in x["t1"].get("/api/classes").json()] == [x["c5"]["id"]]
    assert x["t2"].get("/api/classes").json() == []
    assert [s["id"] for s in x["t1"].get("/api/students").json()] == [x["k5"]["id"]]
    assert x["t1"].get(f"/api/students/{x['k6']['id']}").status_code == 404
    assert x["t1"].get(f"/api/students/{x['k5']['id']}").status_code == 200
    assert x["t2"].get("/api/students").json() == []
    assert x["t1"].get("/api/students", params={"class_id": x["c6"]["id"]}).json() == []
    # cannot add into another class, can into own
    body = {"first_name": "N", "last_name": "N", "joining_date": "2025-06-01"}
    assert x["t1"].post("/api/students", json={**body, "class_id": x["c6"]["id"]}).status_code == 403
    assert x["t1"].post("/api/students", json={**body, "class_id": x["c5"]["id"]}).status_code == 201
    # attendance only for own students
    assert x["t1"].post("/api/attendance/batch", json={"date": "2026-10-05", "marks": [{"student_id": x["k6"]["id"], "status": "present"}]}).status_code == 400
    assert x["t1"].post("/api/attendance/batch", json={"date": "2026-10-05", "marks": [{"student_id": x["k5"]["id"], "status": "present"}]}).status_code == 200
    # no fees for teachers anywhere
    x["admin"].post("/api/fees", json={"student_id": x["k5"]["id"], "term": "T1", "amount": 1000, "paid_amount": 0})
    assert x["t1"].get("/api/fees").status_code == 403
    st = x["t1"].get("/api/dashboard/stats").json()
    assert st["fees_pending"] is None and st["total_students"] == 2
    ov = x["t1"].get("/api/dashboard/overview").json()
    assert ov["totals"]["fees_pending"] is None and all(r["fees_pending"] is None for r in ov["students"]) and len(ov["students"]) == 2
    assert x["t1"].get("/api/transport/routes").status_code == 403
    assert x["t1"].get("/api/attendance/month?month=2026-10").json()["students"] == 2
    assert x["t2"].get("/api/dashboard/overview").json()["totals"]["students"] == 0
    assert x["t2"].get("/api/posts").json() == []


def test_reports_flow(server, new_client):
    x = _setup(server, new_client)
    e = lambda sid, m, r=None: {"student_id": sid, "marks": m, "remark": r}
    body = {"class_id": x["c5"]["id"], "term": "Term 1", "entries": [e(x["k5"]["id"], [{"subject": "Maths", "score": 45, "max_score": 50}, {"subject": "English", "score": 70}], "Good effort")]}
    assert x["t2"].post("/api/reports/batch", json=body).status_code == 403          # not their class
    assert x["t1"].post("/api/reports/batch", json={**body, "entries": [e(x["k6"]["id"], [{"subject": "M", "score": 1}])]}).status_code == 400  # not in class
    bad = {**body, "entries": [e(x["k5"]["id"], [{"subject": "Maths", "score": 60, "max_score": 50}])]}
    assert x["t1"].post("/api/reports/batch", json=bad).status_code == 400
    dup = {**body, "entries": [e(x["k5"]["id"], [{"subject": "Maths", "score": 1}, {"subject": "maths", "score": 2}])]}
    assert x["t1"].post("/api/reports/batch", json=dup).status_code == 400
    assert x["t1"].post("/api/reports/batch", json=body).json() == {"saved": 1, "cleared": 0}
    # parent sees it, other parent does not
    r = x["mom"].get("/api/reports").json()
    assert len(r) == 1 and r[0]["percent"] == 77 and r[0]["remark"] == "Good effort" and len(r[0]["marks"]) == 2
    assert x["other"].get("/api/reports").json() == []
    assert x["other"].get("/api/reports", params={"student_id": x["k5"]["id"]}).json() == []
    assert x["mom"].post("/api/reports/batch", json=body).status_code == 403
    # student's grades stay in step; admin sees academics; teacher t2 sees nothing
    kid = x["admin"].get(f"/api/students/{x['k5']['id']}").json()
    assert {(g["subject"], g["score"]) for g in kid["grades"]} == {("Maths", 45), ("English", 70)}
    assert len(x["admin"].get("/api/reports", params={"student_id": x["k5"]["id"]}).json()) == 1
    assert x["t2"].get("/api/reports").json() == []
    # update (upsert) then clear
    upd = {**body, "entries": [e(x["k5"]["id"], [{"subject": "Maths", "score": 50, "max_score": 50}])]}
    x["t1"].post("/api/reports/batch", json=upd)
    r = x["mom"].get("/api/reports").json()
    assert len(r) == 1 and r[0]["percent"] == 100 and r[0]["remark"] is None
    assert x["t1"].post("/api/reports/batch", json={**body, "entries": [e(x["k5"]["id"], [])]}).json() == {"saved": 0, "cleared": 1}
    assert x["mom"].get("/api/reports").json() == []
    assert x["admin"].get(f"/api/students/{x['k5']['id']}").json()["grades"] == []
