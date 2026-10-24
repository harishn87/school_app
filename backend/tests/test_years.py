from test_reports import _setup
from app.utils import current_year


def _batch(c, cid, sid, term, score, year=None):
    body = {"class_id": cid, "term": term, "entries": [{"student_id": sid, "marks": [{"subject": "Maths", "score": score, "max_score": 100}]}]}
    if year:
        body["academic_year"] = year
    return c.post("/api/reports/batch", json=body)


def test_reports_are_kept_per_year(server, new_client):
    x = _setup(server, new_client)
    cur = current_year()
    assert _batch(x["t1"], x["c5"]["id"], x["k5"]["id"], "Term 1", 80).status_code == 200
    assert _batch(server, x["c5"]["id"], x["k5"]["id"], "Term 1", 55, "2024-25").status_code == 200
    # default view is the current year only
    rows = x["t1"].get("/api/reports", params={"student_id": x["k5"]["id"]}).json()
    assert [(r["academic_year"], r["percent"]) for r in rows] == [(cur, 80)]
    old = x["t1"].get("/api/reports", params={"student_id": x["k5"]["id"], "academic_year": "2024-25"}).json()
    assert [r["percent"] for r in old] == [55]
    both = x["t1"].get("/api/reports", params={"student_id": x["k5"]["id"], "academic_year": "all"}).json()
    assert sorted(r["percent"] for r in both) == [55, 80]
    # saving the same term again in the same year replaces it instead of adding a row
    _batch(x["t1"], x["c5"]["id"], x["k5"]["id"], "Term 1", 90)
    assert len(x["t1"].get("/api/reports", params={"student_id": x["k5"]["id"], "academic_year": "all"}).json()) == 2
    # history never changes the live grade list
    grades = server.get(f"/api/students/{x['k5']['id']}").json()["grades"]
    assert [g["score"] for g in grades] == [90]
    # a parent sees only their own child's history
    assert x["other"].get("/api/reports", params={"student_id": x["k5"]["id"], "academic_year": "all"}).json() == []
    assert len(x["mom"].get("/api/reports", params={"academic_year": "all"}).json()) == 2
    ys = x["mom"].get("/api/academic-years").json()
    assert ys["current"] == cur and ys["years"] == [cur, "2024-25"]
    assert x["t1"].post("/api/reports/batch", json={"class_id": x["c5"]["id"], "term": "Term 1", "academic_year": "bad", "entries": []}).status_code == 422


def test_fees_per_year_and_dashboard_counts_current_only(server, new_client):
    x = _setup(server, new_client)
    sid = x["k5"]["id"]
    cur_fee = server.post("/api/fees", json={"student_id": sid, "term": "Term 1", "amount": 1000, "paid_amount": 400}).json()
    assert cur_fee["academic_year"] == current_year()
    server.post("/api/fees", json={"student_id": sid, "term": "Term 1", "amount": 5000, "paid_amount": 5000, "academic_year": "2024-25"})
    assert [f["amount"] for f in server.get("/api/fees", params={"student_id": sid}).json()] == [1000]
    assert len(server.get("/api/fees", params={"student_id": sid, "academic_year": "all"}).json()) == 2
    assert [f["amount"] for f in server.get("/api/fees", params={"student_id": sid, "academic_year": "2024-25"}).json()] == [5000]
    stats = server.get("/api/dashboard/stats").json()
    assert stats["fees_collected"] == 400 and stats["fees_pending"] == 600
    # editing a fee keeps its year when none is sent
    old = server.get("/api/fees", params={"student_id": sid, "academic_year": "2024-25"}).json()[0]
    server.put(f"/api/fees/{old['id']}", json={"student_id": sid, "term": "Term 1", "amount": 5000, "paid_amount": 4000})
    assert server.get("/api/fees", params={"student_id": sid, "academic_year": "2024-25"}).json()[0]["paid_amount"] == 4000
    assert server.get("/api/dashboard/stats").json()["fees_collected"] == 400
