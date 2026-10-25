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


def test_dashboards_follow_the_chosen_year(server, new_client):
    x = _setup(server, new_client)
    sid, cid = x["k5"]["id"], x["c5"]["id"]
    _batch(server, cid, sid, "Term 1", 80)
    _batch(server, cid, sid, "Term 1", 50, "2024-25")
    server.post("/api/fees", json={"student_id": sid, "term": "Term 1", "amount": 1000, "paid_amount": 1000})
    server.post("/api/fees", json={"student_id": sid, "term": "Term 1", "amount": 4000, "paid_amount": 1000, "academic_year": "2024-25"})
    server.post("/api/attendance/batch", json={"date": "2024-08-05", "marks": [{"student_id": sid, "status": "present"}]})
    server.post("/api/attendance/batch", json={"date": "2024-08-06", "marks": [{"student_id": sid, "status": "absent"}]})
    cur = server.get("/api/dashboard/school").json()
    assert cur["is_current"] and [s["grade_avg"] for s in cur["students"] if s["id"] == sid] == [80]
    old = server.get("/api/dashboard/school", params={"academic_year": "2024-25"}).json()
    assert old["academic_year"] == "2024-25" and not old["is_current"]
    row = next(s for s in old["students"] if s["id"] == sid)
    assert (row["grade_avg"], row["fees_total"], row["fees_pending"], row["attendance_pct"]) == (50, 4000, 3000, 50)
    assert old["today"]["present"] == 0 and len(old["monthly_attendance"]) == 12
    ov = server.get("/api/dashboard/overview", params={"academic_year": "2024-25"}).json()
    r2 = next(s for s in ov["students"] if s["id"] == sid)
    assert (r2["grade_avg"], r2["fees_pending"]) == (50, 3000) and ov["totals"]["fees_pending"] == 3000
    assert server.get("/api/dashboard/overview").json()["totals"]["fees_pending"] == 0



def test_attendance_year_totals(server, new_client):
    x = _setup(server, new_client)
    sid, cid = x["k5"]["id"], x["c5"]["id"]
    for d, st in (("2024-08-05", "present"), ("2024-08-06", "absent"), ("2025-01-10", "late")):
        r = x["t1"].post("/api/attendance/batch", json={"date": d, "class_id": cid, "marks": [{"student_id": sid, "status": st}]})
        assert r.status_code in (200, 201), r.text
    y = x["t1"].get("/api/attendance/year", params={"academic_year": "2024-25"}).json()
    assert (y["present"], y["late"], y["absent"], y["school_days"], y["percent"]) == (1, 1, 1, 3, 67)
    assert len(y["months"]) == 12 and y["months"][0]["month"] == "2024-04" and y["months"][4]["absent"] == 1
    assert y["classes"][0]["class_id"] == cid
    assert x["mom"].get("/api/attendance/year", params={"academic_year": "2024-25"}).json()["school_days"] == 3
    assert x["other"].get("/api/attendance/year", params={"academic_year": "2024-25"}).json()["school_days"] == 0
    assert x["t1"].get("/api/attendance/year").json()["school_days"] == 0


def test_staff_performance(server, new_client):
    x = _setup(server, new_client)
    sid, cid = x["k5"]["id"], x["c5"]["id"]
    _batch(x["t1"], cid, sid, "Term 1", 80)
    x["t1"].post("/api/attendance/batch", json={"date": "2026-10-05", "class_id": cid, "marks": [{"student_id": sid, "status": "present"}]})
    x["t1"].post("/api/posts", json={"class_id": cid, "kind": "notice", "title": "Hi", "body": "Hello", "date": "2026-10-05"})
    r = server.get("/api/staff/performance")
    assert r.status_code == 200
    d = r.json()
    assert [t["name"] for t in d["teachers"]] and len(d["teachers"]) == 1       # only teachers with a class
    t = d["teachers"][0]
    assert t["students"] == 1 and t["metrics"]["results"] == 80 and t["metrics"]["attendance"] == 100
    assert t["metrics"]["register"] == 100 and t["metrics"]["marks"] == 100 and t["metrics"]["diary"] == 100
    assert t["overall"] == 93 and t["classes"][0]["role"] == "Class teacher"
    assert x["t1"].get("/api/staff/performance").status_code == 403
    assert x["mom"].get("/api/staff/performance").status_code == 403
    old = server.get("/api/staff/performance", params={"academic_year": "2024-25"}).json()["teachers"][0]
    assert old["overall"] is None and old["metrics"]["results"] is None


def test_student_movement(server, new_client):
    x = _setup(server, new_client)
    cid = x["c5"]["id"]
    mk = lambda f, j, l=None: server.post("/api/students", json={"first_name": f, "last_name": "Q", "joining_date": j, "leaving_date": l,
                                                                 "status": "left" if l else "active", "class_id": cid}).json()
    mk("A", "2025-05-01", "2025-12-01")      # joined and left in 2025-26
    mk("B", "2025-02-01")                    # joined in 2024-25 (Jan-Mar belongs to the year that began the April before)
    mk("C", "2026-04-02", "2026-09-01")      # joined and left in 2026-27
    d = server.get("/api/students/movement").json()
    by = {y["year"]: y for y in d["years"]}
    assert by["2025-26"]["joined"] == 3 and by["2025-26"]["left"] == 1       # A plus the two seeded students (June 2025)
    assert by["2024-25"]["joined"] == 1 and by["2024-25"]["months"][10]["joined"] == 1   # Feb is month index 10
    assert by["2026-27"]["joined"] == 1 and by["2026-27"]["left"] == 1 and by["2026-27"]["net"] == 0
    assert [s["name"] for s in d["left_list"]] == ["C Q"] and [s["name"] for s in d["joined_list"]] == ["C Q"]
    assert [s["name"] for s in server.get("/api/students/movement", params={"academic_year": "2024-25"}).json()["joined_list"]] == ["B Q"]
    assert x["t1"].get("/api/students/movement").json()["active"] == 2
    assert x["mom"].get("/api/students/movement").status_code == 403
