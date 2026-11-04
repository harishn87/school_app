from datetime import timedelta

from test_reports import _setup
from app.utils import current_year, today_ist


def _body(subjects, term="Term 2", back=30, ahead=30):
    t = today_ist()
    return {"term": term, "start_date": (t - timedelta(days=back)).isoformat(), "end_date": (t + timedelta(days=ahead)).isoformat(), "subjects": subjects}


def test_syllabus_pacing_and_colours(server, new_client):
    x = _setup(server, new_client)
    cid = x["c5"]["id"]
    ok = x["t1"].put(f"/api/syllabus/{cid}", json=_body([
        {"name": "Maths", "chapters": [{"title": "Fractions", "percent": 100}, {"title": "Decimals", "percent": 50}]},
        {"name": "English", "percent": 40}]))
    assert ok.status_code == 200, ok.text
    d = ok.json()
    assert d["target"] == 50 and d["percent"] == 58 and d["status"] == "green" and d["exists"] is True
    assert [s["percent"] for s in d["subjects"]] == [75, 40] and d["subjects"][0]["chapters_done"] == 1
    assert d["update_due"] is False and d["days_since_update"] == 0
    # amber: 5 to 15 points behind, red: more than 15 behind
    amber = x["t1"].put(f"/api/syllabus/{cid}", json=_body([{"name": "Maths", "percent": 40}])).json()
    assert amber["status"] == "amber" and amber["gap"] == -10
    red = x["t1"].put(f"/api/syllabus/{cid}", json=_body([{"name": "Maths", "percent": 30}])).json()
    assert red["status"] == "red" and red["gap"] == -20
    # exactly five behind is still green
    assert x["t1"].put(f"/api/syllabus/{cid}", json=_body([{"name": "Maths", "percent": 45}])).json()["status"] == "green"
    # the log keeps one line per day (last save wins)
    log = x["t1"].get("/api/syllabus/log", params={"class_id": cid, "term": "Term 2"}).json()["days"]
    assert len(log) == 1 and log[0]["overall"] == 45 and log[0]["target"] == 50


def test_syllabus_access_and_validation(server, new_client):
    x = _setup(server, new_client)
    c5, c6 = x["c5"]["id"], x["c6"]["id"]
    body = _body([{"name": "Maths", "percent": 50}])
    assert server.put(f"/api/syllabus/{c5}", json=body).status_code == 403         # the principal views, the class teacher updates
    assert x["mom"].put(f"/api/syllabus/{c5}", json=body).status_code == 403
    assert x["t2"].put(f"/api/syllabus/{c5}", json=body).status_code == 403         # not their class
    assert x["t1"].put(f"/api/syllabus/{c6}", json=body).status_code == 403
    assert x["t1"].put(f"/api/syllabus/{c5}", json=_body([{"name": "Maths"}, {"name": "maths"}])).status_code == 400
    bad = {**body, "start_date": "2026-12-01", "end_date": "2026-11-01"}
    assert x["t1"].put(f"/api/syllabus/{c5}", json=bad).status_code == 400
    assert x["t1"].put(f"/api/syllabus/{c5}", json={**body, "percent": 5, "subjects": [{"name": "A", "percent": 101}]}).status_code == 422
    assert x["t1"].put(f"/api/syllabus/{c5}", json=body).status_code == 200
    # summary: each role sees only its own classes
    adm = server.get("/api/syllabus/summary").json()
    assert {r["class_id"]: r["status"] for r in adm["classes"]}[c6] == "none" and adm["counts"]["none"] == 1
    assert [r["class_id"] for r in x["t1"].get("/api/syllabus/summary").json()["classes"]] == [c5]
    assert x["t2"].get("/api/syllabus/summary").json()["classes"] == []
    mom = x["mom"].get("/api/syllabus/summary").json()["classes"]
    assert [r["class_id"] for r in mom] == [c5] and mom[0]["children"] == ["Aarav"] and mom[0]["has_syllabus"] is True
    assert [r["class_id"] for r in x["other"].get("/api/syllabus/summary").json()["classes"]] == [c6]
    # a parent cannot open another class's syllabus
    assert x["other"].get("/api/syllabus", params={"class_id": c5, "term": "Term 2"}).status_code == 404
    # an unsaved term comes back as an empty template with usual dates
    t3 = x["t1"].get("/api/syllabus", params={"class_id": c5, "term": "Term 3"}).json()
    assert t3["exists"] is False and t3["subjects"] == [] and t3["start_date"].endswith("-01-01")
    assert t3["academic_year"] == current_year()


def test_attendance_list_by_class_ignores_missing_class_id_on_marks(server, new_client):
    x = _setup(server, new_client)
    sid, cid = x["k5"]["id"], x["c5"]["id"]
    assert x["t1"].post("/api/attendance/batch", json={"date": "2026-10-05", "marks": [{"student_id": sid, "status": "late"}]}).status_code == 200   # no class id sent
    rows = x["t1"].get("/api/attendance", params={"date": "2026-10-05", "class_id": cid}).json()
    assert [(r["student_id"], r["status"]) for r in rows] == [(sid, "late")]
    assert x["t2"].get("/api/attendance", params={"date": "2026-10-05", "class_id": cid}).json() == []      # another teacher sees nothing
    assert x["mom"].get("/api/attendance", params={"date": "2026-10-05", "class_id": cid}).json()[0]["status"] == "late"
    assert x["other"].get("/api/attendance", params={"date": "2026-10-05", "class_id": cid}).json() == []


def test_fees_are_grouped_by_term(server, new_client):
    x = _setup(server, new_client)
    sid = x["k5"]["id"]
    for term, amt, paid in (("Term 1 2026", 10000, 10000), ("term 1", 5000, 0), ("Term 2", 12000, 4000), ("Annual fee", 3000, 3000)):
        assert server.post("/api/fees", json={"student_id": sid, "term": term, "amount": amt, "paid_amount": paid, "due_date": "2026-07-31"}).status_code == 201
    st = server.get("/api/dashboard/stats").json()["fees_by_term"]
    assert [t["term"] for t in st] == ["Term 1", "Term 2", "Annual fee"]
    t1 = st[0]
    assert (t1["billed"], t1["collected"], t1["pending"], t1["percent"], t1["records"], t1["paid"], t1["unpaid"]) == (15000, 10000, 5000, 67, 2, 1, 1)
    assert st[1]["pending"] == 8000 and st[1]["status"] == "partial" and st[2]["status"] == "paid"
    assert [r["term"] for r in server.get("/api/fees").json()][:1] in (["Annual fee"], ["Term 2"], ["Term 1"])   # stored in the tidy form
    d = server.get("/api/dashboard/school").json()["fees_by_term"]
    assert [t["term"] for t in d] == ["Term 1", "Term 2", "Annual fee"] and d[0]["collected"] == 10000
    mine = x["mom"].get("/api/parent/overview").json()["children"][0]["fees"]
    assert [t["term"] for t in mine["by_term"]] == ["Term 1", "Term 2", "Annual fee"] and mine["by_term"][1]["pending"] == 8000
    assert x["t1"].get("/api/dashboard/stats").json()["fees_by_term"] is None            # teachers never see fees
    assert x["other"].get("/api/parent/overview").json()["children"][0]["fees"]["by_term"] == []


def test_student_year_attendance_and_scoping(server, new_client):
    from datetime import date
    x = _setup(server, new_client)
    sid = x["k5"]["id"]
    server.post("/api/attendance/batch", json={"date": date.today().isoformat(), "marks": [{"student_id": sid, "status": "late"}]})
    r = server.get(f"/api/students/{sid}/attendance").json()
    assert (r["late"], r["present"], r["absent"], r["marked"], r["percent"]) == (1, 0, 0, 1, 100)
    assert len(r["months"]) == 12 and r["missed"] == [{"date": date.today().isoformat(), "status": "late"}]
    assert x["mom"].get(f"/api/students/{sid}/attendance").status_code == 200
    assert x["other"].get(f"/api/students/{sid}/attendance").status_code == 404
    assert server.get(f"/api/students/{sid}/transport").json() is None
    assert x["mom"].get(f"/api/students/{sid}/transport").status_code == 403


def test_syllabus_by_term_and_whole_year(server, new_client):
    x = _setup(server, new_client)
    c5, c6 = x["c5"]["id"], x["c6"]["id"]
    assert x["t1"].put(f"/api/syllabus/{c5}", json=_body([{"name": "Maths", "percent": 50}], term="Term 2")).status_code == 200
    rows = {r["class_id"]: r for r in server.get("/api/syllabus/summary").json()["classes"]}
    r = rows[c5]
    assert [t["term"] for t in r["terms"]] == ["Term 1", "Term 2", "Term 3"]
    assert [t["has_syllabus"] for t in r["terms"]] == [False, True, False] and r["terms"][1]["percent"] == 50
    assert r["year"]["terms_set"] == 1 and r["year"]["percent"] == round(50 / 3)       # unset terms count as nothing covered yet
    assert rows[c6]["year"]["percent"] is None and rows[c6]["year"]["status"] == "none"
    mom = {q["class_id"]: q for q in x["mom"].get("/api/syllabus/summary").json()["classes"]}
    assert set(mom) <= {c5, c6} and all("year" in q for q in mom.values())


def test_diary_drafts_and_unread(server, new_client):
    x = _setup(server, new_client)
    cid = x["c5"]["id"]
    body = {"class_id": cid, "kind": "homework", "title": "Exercise 3", "due_date": "2026-11-10"}
    draft = x["t1"].post("/api/posts", json={**body, "draft": True}).json()
    assert draft["status"] == "draft"
    assert x["mom"].get("/api/posts").json() == [] and x["mom"].get("/api/posts/unread").json()["unread"] == 0
    assert [p["id"] for p in x["t1"].get("/api/posts").json()] == [draft["id"]]          # the author still sees their draft
    assert x["t2"].post(f"/api/posts/{draft['id']}/publish").status_code == 403
    assert x["t1"].post(f"/api/posts/{draft['id']}/publish").json()["status"] == "published"
    assert [p["id"] for p in x["mom"].get("/api/posts").json()] == [draft["id"]]
    assert x["mom"].get("/api/posts/unread").json()["unread"] == 1
    assert x["t1"].get("/api/posts/unread").json()["unread"] == 0                          # your own posts are not "new" to you
    assert x["mom"].post("/api/posts/seen").json() == {"ok": True}
    assert x["mom"].get("/api/posts/unread").json()["unread"] == 0
    assert x["mom"].get("/api/parent/overview").json()["posts"][0]["id"] == draft["id"]
    # a draft written before the parent's last visit still counts as new once it is posted
    d2 = x["t1"].post("/api/posts", json={**body, "title": "Later", "draft": True}).json()
    x["mom"].post("/api/posts/seen")
    x["t1"].post(f"/api/posts/{d2['id']}/publish")
    assert x["mom"].get("/api/posts/unread").json()["unread"] == 1


def test_demo_syllabus_seed_fills_once(server, new_client):
    import asyncio
    from app.db import platform_db, tenant_db
    from app.demo_syllabus import seed_demo_syllabus
    _setup(server, new_client)

    async def run():
        sch = await platform_db().schools.find_one({"slug": "greenwood"}, {"_id": 0, "db_name": 1})
        db = tenant_db(sch["db_name"])
        first = await seed_demo_syllabus(db)
        again = await seed_demo_syllabus(db)
        return first, again, await db.syllabus.count_documents({})
    first, again, n = asyncio.new_event_loop().run_until_complete(run())
    assert first == 2 and again == 0 and n == 4
    rows = server.get("/api/syllabus/summary").json()["classes"]
    assert all(r["has_syllabus"] and r["year"]["percent"] is not None for r in rows)


def test_staff_performance_includes_syllabus_by_class(server, new_client):
    x = _setup(server, new_client)
    cid = x["c5"]["id"]
    ok = x["t1"].put(f"/api/syllabus/{cid}", json=_body([{"name": "Maths", "percent": 60}], term="Term 1", back=200, ahead=-100))
    assert ok.status_code == 200, ok.text
    t = server.get("/api/staff/performance").json()["teachers"][0]
    c = t["classes"][0]["syllabus"]
    assert [r["term"] for r in c["terms"]] == ["Term 1", "Term 2", "Term 3"]
    assert c["terms"][0]["percent"] == 60 and c["terms"][1]["percent"] is None
    assert c["year"]["percent"] == 20 and c["year"]["terms_set"] == 1      # (60 + 0 + 0) / 3
    assert t["metrics"]["syllabus"] == 20 and t["syllabus_target"] is not None


def test_class_subject_teachers(server, new_client):
    x = _setup(server, new_client)
    cid = x["c5"]["id"]
    t2 = next(u for u in server.get("/api/users").json() if u["email"] == "t2@greenwood.example.com")
    t1 = next(u for u in server.get("/api/users").json() if u["email"] == "t1@greenwood.example.com")
    body = {"name": "Grade 5", "section": "A", "teacher_id": t1["id"], "subjects": [{"name": "Maths", "teacher_id": t1["id"]}, {"name": "English", "teacher_id": t2["id"]}]}
    assert server.put(f"/api/classes/{cid}", json=body).status_code == 200
    assert server.put(f"/api/classes/{cid}", json={**body, "subjects": [{"name": "Maths"}, {"name": "maths"}]}).status_code == 422
    assert server.put(f"/api/classes/{cid}", json={**body, "subjects": [{"name": "Maths", "teacher_id": "nobody"}]}).status_code in (400, 404)
    ok = x["t1"].put(f"/api/syllabus/{cid}", json=_body([{"name": "Maths", "percent": 40}, {"name": "English", "percent": 30}]))
    assert ok.status_code == 200, ok.text
    # a teacher is shown, and can change, only the subjects they teach: English belongs to t2 so t1's value for it is ignored
    mine = ok.json()
    assert [s["name"] for s in mine["subjects"]] == ["Maths"] and mine["class_teacher"] is None
    assert all(s["teacher"] is None for s in mine["subjects"]) and [x["name"] for x in mine["class_subjects"]] == ["Maths"]
    # the principal still sees every subject with its teacher
    full = server.get(f"/api/syllabus?class_id={cid}&term=Term 2").json()
    assert {s["name"]: s["teacher"]["id"] for s in full["subjects"]} == {"Maths": t1["id"]}
    t2c = new_client()
    assert t2c.post("/api/auth/login", json={"school_code": "greenwood", "email": "t2@greenwood.example.com", "password": "Str0ngPass!"}).status_code == 200
    g = t2c.get(f"/api/syllabus?class_id={cid}&term=Term 2").json()
    assert g["subjects"] == [] and [x["name"] for x in g["class_subjects"]] == ["English"] and g["class_teacher"] is None
    r = t2c.put(f"/api/syllabus/{cid}", json=_body([{"name": "Maths", "percent": 99}, {"name": "English", "percent": 70}], back=5, ahead=5)).json()
    assert {s["name"]: s["percent"] for s in r["subjects"]} == {"English": 70}
    assert r["updated_by_name"] and r["class_teacher"] is None
    assert {s["name"]: s["percent"] for s in x["t1"].get(f"/api/syllabus?class_id={cid}&term=Term 2").json()["subjects"]} == {"Maths": 40}
    both = {s["name"]: (s["percent"], s["teacher"]["id"]) for s in server.get(f"/api/syllabus?class_id={cid}&term=Term 2").json()["subjects"]}
    assert both == {"Maths": (40, t1["id"]), "English": (70, t2["id"])}
    # summary and log hide the other teacher's subjects and the staff names
    sm = t2c.get("/api/syllabus/summary").json()["classes"][0]
    assert sm["teacher"] is None and [s["name"] for s in sm["subjects"]] == ["English"] and sm["percent"] == 70
    lg = t2c.get(f"/api/syllabus/log?class_id={cid}&term=Term 2").json()
    assert lg["days"] and all(list(d["subjects"]) == ["English"] for d in lg["days"])
    # staff performance: each teacher is judged on the subjects they teach
    sp = {t["id"]: t for t in server.get("/api/staff/performance").json()["teachers"]}
    assert sp[t2["id"]]["classes"][0]["role"] == "Subject teacher"
    assert sp[t2["id"]]["metrics"]["syllabus"] == round(70 / 3) and sp[t1["id"]]["metrics"]["syllabus"] == round(40 / 3)
    assert sp[t2["id"]]["metrics"]["results"] is None


def test_excel_export_for_principal(server, new_client):
    import io, zipfile
    x = _setup(server, new_client)
    cid = x["c5"]["id"]
    x["t1"].put(f"/api/syllabus/{cid}", json=_body([{"name": "Maths", "percent": 40}]))
    r = server.get("/api/export/school.xlsx")
    assert r.status_code == 200 and "spreadsheetml" in r.headers["content-type"] and ".xlsx" in r.headers["content-disposition"]
    z = zipfile.ZipFile(io.BytesIO(r.content))
    wb = z.read("xl/workbook.xml").decode()
    for name in ("Summary", "Students", "Fees by term", "Syllabus by subject", "Staff performance"):
        assert f'name="{name}"' in wb
    assert z.testzip() is None
    sheets = {n: z.read(n).decode() for n in z.namelist() if n.startswith("xl/worksheets/")}
    assert any("Maths" in s and "40" in s for s in sheets.values()) and any("Aarav" in s for s in sheets.values())
    # only the principal may download
    assert x["t1"].get("/api/export/school.xlsx").status_code == 403
    assert x["mom"].get("/api/export/school.xlsx").status_code == 403


def test_student_notes(server, new_client):
    x = _setup(server, new_client)
    kid = next(s for s in server.get("/api/students").json() if s["first_name"] == "Aarav")
    t1 = x["t1"]
    r = t1.post(f"/api/students/{kid['id']}/notes", json={"body": "Please bring the signed form tomorrow.", "urgent": True})
    assert r.status_code == 201, r.text
    assert r.json()["urgent"] is True and r.json()["created_by_name"]
    assert t1.post(f"/api/students/{kid['id']}/notes", json={"body": " "}).status_code == 400
    assert t1.post(f"/api/students/{kid['id']}/notes", json={"body": ""}).status_code == 422
    # the parent reads it but can't write or delete
    mom = x["mom"]
    notes = mom.get(f"/api/students/{kid['id']}/notes").json()
    assert [n["body"] for n in notes][-1] == "Please bring the signed form tomorrow."
    # the parent can ask the teacher; it lands in the teacher's inbox, can't be marked important, and the teacher's reply marks it answered
    q = mom.post(f"/api/students/{kid['id']}/notes", json={"body": "Can he get extra help in fractions?", "urgent": True})
    assert q.status_code == 201 and q.json()["from_role"] == "parent" and q.json()["urgent"] is False
    inbox = t1.get("/api/student-notes/inbox").json()
    assert [i["body"] for i in inbox] == ["Can he get extra help in fractions?"] and inbox[0]["answered"] is False and inbox[0]["student_name"].startswith("Aarav")
    assert x["t2"].get(f"/api/students/{kid['id']}/notes").status_code == 403
    assert x["other"].get(f"/api/students/{kid['id']}/notes").status_code == 404
    assert x["other"].post(f"/api/students/{kid['id']}/notes", json={"body": "hi"}).status_code == 404
    assert t1.post(f"/api/students/{kid['id']}/notes", json={"body": "Yes, after school on Tuesdays."}).status_code == 201
    assert t1.get("/api/student-notes/inbox").json()[0]["answered"] is True
    assert mom.get("/api/student-notes/inbox").status_code == 403
    mine = next(n for n in mom.get(f"/api/students/{kid['id']}/notes").json() if n["from_role"] == "parent")
    assert mom.delete(f"/api/student-notes/{notes[-1]['id']}").status_code == 403
    assert mom.delete(f"/api/student-notes/{mine['id']}").status_code == 200
    assert t1.delete(f"/api/student-notes/{notes[-1]['id']}").status_code == 200
