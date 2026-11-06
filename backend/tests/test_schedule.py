from test_reports import _setup

PERIODS = [{"start": "09:00", "end": "09:45"}, {"start": "09:45", "end": "10:30"}]


def test_timetable_access_and_validation(server, new_client):
    x = _setup(server, new_client)
    c5, c6 = x["c5"]["id"], x["c6"]["id"]
    empty = x["mom"].get("/api/timetable", params={"class_id": c5}).json()
    assert empty["exists"] is False and empty["periods"] == [] and set(empty["days"]) == {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
    body = {"periods": PERIODS, "days": {"Mon": ["Maths", "English"], "Tue": ["Science"]}}
    ok = x["t1"].put(f"/api/timetable/{c5}", json=body)
    assert ok.status_code == 200, ok.text
    d = ok.json()
    assert d["days"]["Mon"] == ["Maths", "English"] and d["days"]["Tue"] == ["Science", ""] and d["days"]["Sat"] == ["", ""]
    # a teacher cannot edit another class, a parent cannot edit at all, admin can
    assert x["t1"].put(f"/api/timetable/{c6}", json=body).status_code == 403
    assert x["mom"].put(f"/api/timetable/{c5}", json=body).status_code == 403
    assert x["admin"].put(f"/api/timetable/{c6}", json=body).status_code == 200
    # parents read only their own child's class
    assert x["mom"].get("/api/timetable", params={"class_id": c5}).json()["days"]["Mon"][0] == "Maths"
    assert x["mom"].get("/api/timetable", params={"class_id": c6}).status_code == 404
    assert x["t2"].get("/api/timetable", params={"class_id": c5}).status_code == 404
    # validation
    bad = lambda **k: x["admin"].put(f"/api/timetable/{c5}", json={**body, **k}).status_code
    assert bad(periods=[{"start": "10:00", "end": "09:00"}]) == 400
    assert bad(periods=[{"start": "09:00", "end": "10:00"}, {"start": "09:30", "end": "10:30"}]) == 400
    assert bad(periods=[{"start": "9am", "end": "10:00"}]) == 422
    assert bad(days={"Sun": ["x"]}) == 422
    assert x["admin"].put("/api/timetable/nope", json=body).status_code == 404


def test_exam_schedule(server, new_client):
    x = _setup(server, new_client)
    c5, c6 = x["c5"]["id"], x["c6"]["id"]
    ex = {"class_id": c5, "term": "Term 1", "subject": "Maths", "date": "2026-12-05", "start_time": "09:30", "duration_min": 90, "room": "R1"}
    made = x["t1"].post("/api/exams", json=ex)
    assert made.status_code == 201, made.text
    eid = made.json()["id"]
    assert x["t1"].post("/api/exams", json={**ex, "class_id": c6}).status_code == 403
    assert x["mom"].post("/api/exams", json=ex).status_code == 403
    x["admin"].post("/api/exams", json={**ex, "class_id": c6, "subject": "English", "date": "2026-12-01"})
    x["admin"].post("/api/exams", json={**ex, "subject": "Science", "date": "2026-12-02"})
    assert [e["subject"] for e in x["admin"].get("/api/exams").json()] == ["English", "Science", "Maths"]  # by date
    assert [e["subject"] for e in x["mom"].get("/api/exams").json()] == ["Science", "Maths"]  # only her child's class
    assert x["mom"].get("/api/exams", params={"class_id": c6}).json() == []
    assert [e["subject"] for e in x["t1"].get("/api/exams").json()] == ["Science", "Maths"]
    assert x["t2"].get("/api/exams").json() == []
    # edit / delete respect the class
    assert x["t1"].put(f"/api/exams/{eid}", json={**ex, "room": "R9"}).json()["room"] == "R9"
    assert x["t2"].put(f"/api/exams/{eid}", json=ex).status_code == 403
    assert x["mom"].delete(f"/api/exams/{eid}").status_code == 403
    assert x["t1"].delete(f"/api/exams/{eid}").status_code == 200
    assert x["admin"].delete(f"/api/exams/{eid}").status_code == 404
    assert x["admin"].post("/api/exams", json={**ex, "date": "05/12/2026"}).status_code == 422
    assert x["admin"].post("/api/exams", json={**ex, "start_time": "9.30"}).status_code == 422
