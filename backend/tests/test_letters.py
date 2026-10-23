from conftest import login, signup
from test_school_api import _make_user


def _setup(server, new_client):
    signup(server, "greenwood")
    t = _make_user(server, "teacher", "t1@greenwood.example.com")
    _make_user(server, "parent", "mom@family.example.com")
    c = server.post("/api/classes", json={"name": "Grade 5", "section": "A", "teacher_id": t["id"]}).json()
    kid = server.post("/api/students", json={"first_name": "Aarav", "last_name": "Sharma", "gender": "male",
        "date_of_birth": "2015-04-02", "joining_date": "2022-06-01", "class_id": c["id"], "roll_number": "12",
        "guardian_name": "Rakesh Sharma", "guardian_email": "mom@family.example.com"}).json()
    def as_(email):
        cl = new_client(); assert login(cl, "greenwood", email).status_code == 200; return cl
    return {"admin": server, "teacher": as_("t1@greenwood.example.com"), "parent": as_("mom@family.example.com"), "kid": kid, "c": c}


def test_batch_posts_for_many_subjects(server, new_client):
    x = _setup(server, new_client)
    items = [{"subject": s, "title": f"{s} homework", "due_date": "2026-11-02"} for s in ("Maths", "English", "Science")]
    r = x["teacher"].post("/api/posts/batch", json={"class_id": x["c"]["id"], "kind": "homework", "items": items})
    assert r.status_code == 201 and len(r.json()) == 3
    assert {p["subject"] for p in x["parent"].get("/api/posts").json()} == {"Maths", "English", "Science"}
    assert x["parent"].post("/api/posts/batch", json={"class_id": x["c"]["id"], "kind": "notice", "items": items}).status_code == 403
    assert x["teacher"].post("/api/posts/batch", json={"class_id": x["c"]["id"], "kind": "notice", "items": []}).status_code == 422


def test_only_admin_issues_letters(server, new_client):
    x = _setup(server, new_client)
    body = {"student_id": x["kid"]["id"], "kind": "bonafide"}
    assert x["teacher"].post("/api/certificates", json=body).status_code == 403
    assert x["parent"].post("/api/certificates", json=body).status_code == 403
    assert x["parent"].get("/api/certificates").status_code == 403
    assert x["admin"].post("/api/certificates", json={**body, "student_id": "nope"}).status_code == 404


def test_bonafide_numbering_and_snapshot(server, new_client):
    x = _setup(server, new_client)
    a = x["admin"].put("/api/school/profile", json={"address": "12 MG Road, Hyderabad", "principal_name": "Dr. Rao"}).json()
    assert a["principal_name"] == "Dr. Rao"
    r1 = x["admin"].post("/api/certificates", json={"student_id": x["kid"]["id"], "kind": "bonafide", "purpose": "passport"}).json()
    r2 = x["admin"].post("/api/certificates", json={"student_id": x["kid"]["id"], "kind": "bonafide"}).json()
    assert r1["number"].startswith("BON/") and r1["number"].endswith("/0001") and r2["number"].endswith("/0002")
    d = r1["data"]
    assert d["student_name"] == "Aarav Sharma" and d["relation"] == "Son" and d["class_name"] == "Grade 5 A"
    assert r1["school"]["address"] == "12 MG Road, Hyderabad"
    # later edits to the student don't change what was issued
    x["admin"].put(f"/api/students/{x['kid']['id']}", json={**x["kid"], "first_name": "Changed"})
    again = [c for c in x["admin"].get("/api/certificates", params={"student_id": x["kid"]["id"]}).json() if c["id"] == r1["id"]][0]
    assert again["data"]["student_name"] == "Aarav Sharma"
    assert x["teacher"].get("/api/school/profile").status_code == 200


def test_fee_clearance_requires_no_dues(server, new_client):
    x = _setup(server, new_client)
    sid = x["kid"]["id"]
    fee = x["admin"].post("/api/fees", json={"student_id": sid, "term": "T1", "amount": 10000, "paid_amount": 4000}).json()
    r = x["admin"].post("/api/certificates", json={"student_id": sid, "kind": "fee_clearance"})
    assert r.status_code == 400 and "6,000" in r.json()["detail"]
    x["admin"].put(f"/api/fees/{fee['id']}", json={"student_id": sid, "term": "T1", "amount": 10000, "paid_amount": 10000})
    ok = x["admin"].post("/api/certificates", json={"student_id": sid, "kind": "fee_clearance"})
    assert ok.status_code == 201 and ok.json()["data"]["fees_paid"] == 10000


def test_transfer_certificate_rules(server, new_client):
    x = _setup(server, new_client)
    sid = x["kid"]["id"]
    x["admin"].post("/api/fees", json={"student_id": sid, "term": "T1", "amount": 5000, "paid_amount": 0})
    base = {"student_id": sid, "kind": "transfer", "leaving_date": "2026-10-30", "reason": "Relocation"}
    assert x["admin"].post("/api/certificates", json=base).status_code == 409
    ok = x["admin"].post("/api/certificates", json={**base, "ignore_dues": True})
    assert ok.status_code == 201 and ok.json()["number"].startswith("TC/")
    assert x["admin"].post("/api/certificates", json={"student_id": sid, "kind": "transfer", "ignore_dues": True}).status_code == 400
