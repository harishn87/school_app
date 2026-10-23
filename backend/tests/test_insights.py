from conftest import login, signup
from test_school_api import _make_user


def _setup(server, new_client):
    signup(server, "greenwood")
    _make_user(server, "teacher", "t1@greenwood.example.com")
    _make_user(server, "parent", "mom@family.example.com")
    _make_user(server, "parent", "other@family.example.com")
    kid = server.post("/api/students", json={"first_name": "Aarav", "last_name": "Sharma", "joining_date": "2025-06-01",
                                             "guardian_email": "mom@family.example.com",
                                             "grades": [{"subject": "Maths", "term": "T1", "score": 80, "max_score": 100},
                                                        {"subject": "Sci", "term": "T1", "score": 30, "max_score": 50}]}).json()
    kid2 = server.post("/api/students", json={"first_name": "Zed", "last_name": "Other", "joining_date": "2025-06-01",
                                              "guardian_email": "other@family.example.com"}).json()
    def as_(email):
        c = new_client(); assert login(c, "greenwood", email).status_code == 200; return c
    return {"admin": server, "teacher": as_("t1@greenwood.example.com"), "mom": as_("mom@family.example.com"), "kid": kid, "kid2": kid2}


def test_holidays_and_calendar(server, new_client):
    x = _setup(server, new_client)
    assert x["teacher"].post("/api/holidays", json={"name": "X", "date": "2026-10-02"}).status_code == 403
    assert x["admin"].post("/api/holidays", json={"name": "Bad", "date": "2026-10-05", "end_date": "2026-10-01"}).status_code == 400
    h = x["admin"].post("/api/holidays", json={"name": "Gandhi Jayanti", "date": "2026-10-02"}).json()
    x["admin"].post("/api/holidays", json={"name": "Dussehra break", "date": "2026-10-19", "end_date": "2026-10-21"})
    assert len(x["mom"].get("/api/holidays?year=2026").json()) == 2
    x["admin"].post("/api/attendance/batch", json={"date": "2026-10-01", "marks": [{"student_id": x["kid"]["id"], "status": "present"}]})
    x["admin"].post("/api/attendance/batch", json={"date": "2026-10-03", "marks": [{"student_id": x["kid"]["id"], "status": "absent"}]})
    x["admin"].post("/api/attendance/batch", json={"date": "2026-10-05", "marks": [{"student_id": x["kid"]["id"], "status": "late"}]})
    r = x["mom"].get(f"/api/calendar?student_id={x['kid']['id']}&month=2026-10").json()
    assert len(r["days"]) == 31
    byd = {d["date"]: d for d in r["days"]}
    assert byd["2026-10-02"]["holiday"] == "Gandhi Jayanti" and byd["2026-10-20"]["holiday"] == "Dussehra break"
    assert byd["2026-10-03"]["status"] == "absent" and byd["2026-10-04"]["weekend"] is True
    assert r["counts"]["present"] == 1 and r["counts"]["late"] == 1 and r["counts"]["absent"] == 1 and r["counts"]["holiday"] == 4
    assert r["percent"] == 67
    # a parent cannot see someone else's child, bad month rejected
    assert x["mom"].get(f"/api/calendar?student_id={x['kid2']['id']}&month=2026-10").status_code == 404
    assert x["mom"].get(f"/api/calendar?student_id={x['kid']['id']}&month=2026-13").status_code == 400
    # holiday spanning month boundary
    x["admin"].post("/api/holidays", json={"name": "Winter", "date": "2026-09-29", "end_date": "2026-10-01"})
    r = x["mom"].get(f"/api/calendar?student_id={x['kid']['id']}&month=2026-10").json()
    assert {d["date"]: d for d in r["days"]}["2026-10-01"]["holiday"] == "Winter"
    assert x["admin"].delete(f"/api/holidays/{h['id']}").status_code == 200
    assert x["admin"].delete(f"/api/holidays/{h['id']}").status_code == 404


def test_dashboard_overview(server, new_client):
    x = _setup(server, new_client)
    sid = x["kid"]["id"]
    server.post("/api/fees", json={"student_id": sid, "term": "T1", "amount": 1000, "paid_amount": 400})
    from datetime import date
    server.post("/api/attendance/batch", json={"date": date.today().isoformat(), "marks": [{"student_id": sid, "status": "absent"}]})
    r = server.get("/api/dashboard/overview").json()
    row = next(s for s in r["students"] if s["id"] == sid)
    assert row["grade_avg"] == 70 and row["fees_pending"] == 600 and row["fee_status"] == "partial" and row["attendance_pct"] == 0
    assert r["totals"]["defaulters"] == 1 and r["totals"]["low_attendance"] == 1 and r["totals"]["students"] == 2
    assert x["mom"].get("/api/dashboard/overview").status_code == 403
    # teacher with no classes sees none
    assert x["teacher"].get("/api/dashboard/overview").json()["totals"]["students"] == 0
