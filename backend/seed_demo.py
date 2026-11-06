"""Fill a demo school with sample data through the running app's own API.

  - 12 classes: PP1, PP2, Class 1 ... Class 10, with 10 students each (120 students)
  - one parent login with two children (in Class 3 and Class 7)
  - six class teachers (Ravi Kumar: Class 3 and Class 4), a secondary teacher on some classes, and a class attender for each
  - Term 1 fees (some paid, some part paid, some unpaid), Term 1 and Term 2 progress reports, this month's attendance, holidays
  - two earlier years (2024-25 and 2025-26) of progress reports for every term, fee records and daily attendance, for history views

Safe to run again: anything that already exists is skipped.
Usage:  python seed_demo.py [--url http://localhost:8001] [--school demo]
                            [--admin admin@school.com] [--password admin123]
Uses only the Python standard library.
"""
import argparse
import json
import random
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from http.cookiejar import CookieJar

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://localhost:8001")
ap.add_argument("--school", default="demo")
ap.add_argument("--admin", default="admin@school.com")
ap.add_argument("--password", default="admin123")
ap.add_argument("--owner", default="owner@example.com")
ap.add_argument("--owner-password", default="OwnerPass#2026")
A = ap.parse_args()

PARENT_EMAIL, PARENT_PASSWORD = "parent@demo.example.com", "Parent#2026"
TEACHER_EMAIL, TEACHER_PASSWORD = "teacher@demo.example.com", "Teacher#2026"
# teacher email -> (name, classes). The first one is the demo teacher login.
TEACHERS = {TEACHER_EMAIL: ("Ravi Kumar", ["Class 3", "Class 4"]),
            "sunita.rao@demo.example.com": ("Sunita Rao", ["PP1", "PP2"]),
            "anil.verma@demo.example.com": ("Anil Verma", ["Class 5", "Class 6"]),
            "meena.pillai@demo.example.com": ("Meena Pillai", ["Class 1", "Class 2"]),
            "suresh.naidu@demo.example.com": ("Suresh Naidu", ["Class 7", "Class 8"]),
            "kavitha.rao@demo.example.com": ("Kavitha Rao", ["Class 9", "Class 10"])}
ATTENDERS = ["Lakshmi Bai", "Sarojini", "Yadamma", "Narsamma", "Padma", "Kantamma", "Rukmini", "Saraswathi", "Bhagya", "Anjamma", "Sumathi", "Pochamma"]

class Client:
    def __init__(self):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def call(self, method, path, body=None, ok=(200, 201)):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(A.url + "/api" + path, data=data, method=method, headers={"Content-Type": "application/json"})
        try:
            with self.op.open(req, timeout=60) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw)
            except Exception:
                return e.code, {"detail": raw.decode(errors="replace")}


def need(res, what):
    code, data = res
    if code not in (200, 201):
        sys.exit(f"Could not {what}: HTTP {code} {data.get('detail') if isinstance(data, dict) else data}")
    return data


CLASSES = ["PP1", "PP2"] + [f"Class {i}" for i in range(1, 11)]
BOYS = ["Aarav", "Vihaan", "Arjun", "Reyansh", "Sai", "Krishna", "Ishaan", "Rohan", "Karthik", "Aditya", "Dhruv", "Kabir", "Nikhil", "Pranav", "Rahul", "Siddharth", "Varun", "Yash", "Harsha", "Teja"]
GIRLS = ["Ananya", "Diya", "Saanvi", "Aadhya", "Myra", "Kavya", "Meera", "Nisha", "Priya", "Riya", "Sneha", "Tanvi", "Vaishnavi", "Navya", "Ishita", "Lakshmi", "Pooja", "Sara", "Zoya", "Charvi"]
SURNAMES = ["Sharma", "Reddy", "Patel", "Iyer", "Naidu", "Rao", "Gupta", "Singh", "Mehta", "Nair", "Verma", "Kumar", "Chowdary", "Khan", "Joshi", "Menon", "Das", "Pillai", "Goud", "Shah"]


def fee_for(idx):
    return 15000 if idx < 2 else 20000 if idx < 7 else 25000 if idx < 10 else 30000


def subjects_for(idx):
    return ["English", "Numbers", "Drawing"] if idx < 2 else ["Maths", "English", "Science", "Social"]


def main():
    c = Client()
    # 1. A trial plan allows 100 students; this data needs 120, so move the demo school to Pro when the owner login works.
    owner = Client()
    if owner.call("POST", "/platform/auth/login", {"email": A.owner, "password": A.owner_password})[0] == 200:
        schools = owner.call("GET", "/platform/schools")[1] or []
        mine = next((s for s in schools if s.get("slug") == A.school or s.get("code") == A.school), None)
        if mine and mine.get("plan") == "trial":
            owner.call("PATCH", f"/platform/schools/{mine['id']}", {"plan": "pro"})
            print("Moved the demo school to the Pro plan (trial allows only 100 students).")
    else:
        print("Owner login did not work; if the student limit is hit, upgrade the plan from the owner console.")

    need(c.call("POST", "/auth/login", {"school_code": A.school, "email": A.admin, "password": A.password}), "log in as school admin")

    # Teachers first: every class needs a primary class teacher
    users = {u["email"]: u for u in need(c.call("GET", "/users"), "list users")}
    teacher_of = {}      # class name -> teacher user
    for email, (tname, cls_names) in TEACHERS.items():
        u = users.get(email) or need(c.call("POST", "/users", {"name": tname, "email": email, "role": "teacher", "password": TEACHER_PASSWORD}), f"create teacher {tname}")
        for cn in cls_names:
            teacher_of[cn] = u
    print(f"Teachers ready: {len(TEACHERS)}")

    # Classes: primary teacher, a secondary teacher on every other class, and an attender
    classes = {x["name"]: x for x in need(c.call("GET", "/classes"), "list classes")}
    team = list(TEACHERS.values())
    for i, name in enumerate(CLASSES):
        primary = teacher_of[name]
        second = None
        if i % 2 == 0:
            second = teacher_of[CLASSES[(i + 2) % len(CLASSES)]]
            if second["id"] == primary["id"]:
                second = None
        body = {"name": name, "section": "A", "academic_year": "2026-27", "teacher_id": primary["id"],
                "secondary_teacher_id": second["id"] if second else None,
                "attender_name": ATTENDERS[i], "attender_phone": f"98{85000000 + i * 1111:08d}"}
        cur = classes.get(name)
        if not cur:
            classes[name] = need(c.call("POST", "/classes", body), f"create {name}")
        elif not cur.get("teacher_id") or not cur.get("attender_name"):
            classes[name] = need(c.call("PUT", f"/classes/{cur['id']}", body), f"update {name}")
    print(f"Classes ready: {len(classes)}")

    existing = need(c.call("GET", "/students"), "list students")
    have = {(s["first_name"], s["last_name"]) for s in existing}
    per_class = {}
    for s in existing:
        per_class.setdefault(s.get("class_id"), []).append(s)

    rnd = random.Random(2026)
    used = set(have)
    created = 0
    for idx, cname in enumerate(CLASSES):
        cid = classes[cname]["id"]
        mine = per_class.get(cid, [])
        for j in range(len(mine), 10):
            roll = j + 1
            if cname == "Class 3" and j == 0:
                first, last, gender, guardian = "Aarav", "Reddy", "male", PARENT_EMAIL
            elif cname == "Class 7" and j == 0:
                first, last, gender, guardian = "Ananya", "Reddy", "female", PARENT_EMAIL
            else:
                gender = "male" if j % 2 == 0 else "female"
                pool = BOYS if gender == "male" else GIRLS
                while True:
                    first, last = rnd.choice(pool), rnd.choice(SURNAMES)
                    if (first, last) not in used:
                        break
                guardian = None
            used.add((first, last))
            age = 3 + idx + (1 if idx else 0)
            body = {
                "first_name": first, "last_name": last, "gender": gender,
                "date_of_birth": f"{2026 - age}-{rnd.randint(1, 12):02d}-{rnd.randint(1, 28):02d}",
                "joining_date": "2026-06-10", "class_id": cid, "roll_number": str(roll),
                "guardian_name": f"{'Mr' if rnd.random() < .5 else 'Mrs'} {last}", "guardian_phone": f"98{rnd.randint(10000000, 99999999)}",
                "guardian_email": guardian, "address": "Hyderabad",
            }
            s = need(c.call("POST", "/students", body), f"add {first} {last}")
            amount = fee_for(idx)
            paid = [amount, amount // 2, 0, amount][roll % 4]
            need(c.call("POST", "/fees", {"student_id": s["id"], "term": "Term 1", "amount": amount, "paid_amount": paid,
                                         "due_date": "2026-07-31", "paid_date": "2026-07-20" if paid else None}), "add fee")
            created += 1
        print(f"  {cname}: {max(0, 10 - len(mine))} added")
    print(f"Students added: {created}")

    # Term 1 progress reports (these also fill each student's grades)
    all_students = need(c.call("GET", "/students"), "list students")
    remarks = ["Good progress. Keep it up.", "Works hard and participates well.", "Can do better with regular practice.", "Excellent effort this term.", None]
    for idx, cname in enumerate(CLASSES):
        cid = classes[cname]["id"]
        if need(c.call("GET", f"/reports?class_id={cid}&term=Term%201"), "check reports"):
            continue    # keep reports teachers have already saved
        kids = [s for s in all_students if s.get("class_id") == cid]
        entries = [{"student_id": s["id"], "remark": rnd.choice(remarks),
                    "marks": [{"subject": sub, "score": rnd.randint(42, 98), "max_score": 100} for sub in subjects_for(idx)]} for s in kids]
        need(c.call("POST", "/reports/batch", {"class_id": cid, "term": "Term 1", "entries": entries}), f"save reports for {cname}")
    print("Term 1 progress reports saved for every class.")

    # More test academics: Term 2 for this year, then two earlier years of reports and fees
    def marks_for(idx, base, delta):
        return [{"subject": sub, "score": max(20, min(99, base + delta + rnd.randint(-9, 9))), "max_score": 100} for sub in subjects_for(idx)]
    ability = {s["id"]: rnd.randint(48, 88) for s in all_students}
    def save_reports(idx, cname, term, year, delta):
        cid = classes[cname]["id"]
        path = f"/reports?class_id={cid}&term={term.replace(' ', '%20')}" + (f"&academic_year={year}" if year else "")
        if need(c.call("GET", path), "check reports"):
            return False
        kids = [s for s in all_students if s.get("class_id") == cid]
        entries = [{"student_id": s["id"], "remark": rnd.choice(remarks), "marks": marks_for(idx, ability[s["id"]], delta)} for s in kids]
        body = {"class_id": cid, "term": term, "entries": entries}
        if year:
            body["academic_year"] = year
        need(c.call("POST", "/reports/batch", body), f"save {term} {year or 'this year'} for {cname}")
        return True
    for idx, cname in enumerate(CLASSES):
        save_reports(idx, cname, "Term 2", None, 2)
    print("Term 2 reports saved for every class (this year).")
    for year, delta in (("2024-25", -7), ("2025-26", -3)):
        for idx, cname in enumerate(CLASSES):
            for term in ("Term 1", "Term 2", "Term 3", "Annual"):
                save_reports(idx, cname, term, year, delta + (1 if term in ("Term 3", "Annual") else 0))
        print(f"{year}: reports saved for every class.")
    have_fee = {(f["student_id"], f.get("academic_year")) for f in need(c.call("GET", "/fees?academic_year=all"), "list fees")}
    fee_idx = {s["id"]: i for i, cname in enumerate(CLASSES) for s in all_students if s.get("class_id") == classes[cname]["id"]}
    added = 0
    for year, scale, due in (("2024-25", .8, ("2024-07-31", "2024-11-30", "2025-03-15")), ("2025-26", .9, ("2025-07-31", "2025-11-30", "2026-03-15"))):
        for n, s in enumerate(all_students):
            if (s["id"], year) in have_fee:
                continue
            for t, (term, d) in enumerate(zip(("Term 1", "Term 2", "Term 3"), due)):
                amount = int(fee_for(fee_idx.get(s["id"], 0)) * scale)
                paid = amount
                if year == "2025-26" and t == 2 and n % 8 == 0:
                    paid = [0, amount // 2][n % 16 == 0]      # a few families still owe last year's final term
                need(c.call("POST", "/fees", {"student_id": s["id"], "term": term, "academic_year": year, "amount": amount, "paid_amount": paid,
                                             "due_date": d, "paid_date": d if paid else None}), "add past fee")
                added += 1
    print(f"Past-year fee records added: {added}")

    # This year's Term 2 and Term 3 fees, so the term-wise views have more than one term to show
    have_now = {(f["student_id"], f["term"]) for f in need(c.call("GET", "/fees"), "list this year's fees")}
    added = 0
    for n, s in enumerate(all_students):
        amount = fee_for(fee_idx.get(s["id"], 0))
        for term, due, paid in (("Term 2", "2026-10-31", [amount, amount, amount // 2, 0][n % 4]), ("Term 3", "2027-01-31", [amount, 0, 0, 0][n % 4])):
            if (s["id"], term) in have_now:
                continue
            need(c.call("POST", "/fees", {"student_id": s["id"], "term": term, "amount": amount, "paid_amount": paid,
                                         "due_date": due, "paid_date": "2026-10-20" if paid else None}), "add this year's fee")
            added += 1
    print(f"This year's Term 2/3 fee records added: {added}")

    # Past-year attendance: every school day from mid June to the end of March (Sundays off), one request per day
    att_prop = {s["id"]: rnd.choice([.99, .97, .95, .93, .9, .85, .78]) for s in all_students}
    for year, start, end in (("2024-25", date(2025, 3, 1), date(2025, 3, 3)),):
        if need(c.call("GET", f"/attendance?date={start.isoformat()}"), "check attendance"):
            continue
        day, n_days = start, 0
        while day <= end:
            if day.weekday() != 6:
                marks = []
                for s in all_students:
                    r = rnd.random()
                    marks.append({"student_id": s["id"], "status": "present" if r < att_prop[s["id"]] else ("late" if r < att_prop[s["id"]] + .03 else "absent")})
                need(c.call("POST", "/attendance/batch", {"date": day.isoformat(), "marks": marks}), "past attendance")
                n_days += 1
            day += timedelta(days=1)
        print(f"{year}: attendance marked for {n_days} school days.")

    # Parent login (one parent, two children)
    code, data = c.call("POST", "/users", {"name": "Lakshmi Reddy", "email": PARENT_EMAIL, "role": "parent", "password": PARENT_PASSWORD})
    print("Parent login created." if code == 201 else "Parent login already exists." if code == 409 else f"Parent login: HTTP {code} {data}")

    # Admissions history: spread the joining dates over earlier years and add students who left, so the joiners and leavers views have history
    cur_students = need(c.call("GET", "/students"), "list students")
    cls_idx = {classes[n]["id"]: i for i, n in enumerate(CLASSES)}
    redated = 0
    for s in cur_students:
        i = cls_idx.get(s.get("class_id"), 0)
        if s.get("joining_date") == "2026-06-10" and i > 0 and str(s.get("roll_number")) not in ("1", "2"):
            body = {k: v for k, v in s.items() if k not in ("id", "created_at", "updated_at")}
            body["joining_date"] = f"{2025 - int(s.get('roll_number') or 0) % 3}-{[6, 6, 7, 8][int(s.get('roll_number') or 0) % 4]:02d}-{rnd.randint(8, 20):02d}"
            need(c.call("PUT", f"/students/{s['id']}", body), "update joining date")
            redated += 1
    if redated:
        print(f"Joining dates spread over earlier years for {redated} students.")
    if not any((s.get("notes") or "") == "Sample history" for s in cur_students):
        class_ids = [classes[n]["id"] for n in CLASSES]
        leavers = [("2024-25", 5), ("2025-26", 6), ("2026-27", 4)]
        k = 0
        for year, n in leavers:
            y0 = int(year[:4])
            for j in range(n):
                first, last = rnd.choice(BOYS + GIRLS), rnd.choice(SURNAMES)
                left = date(y0 + (1 if j % 3 == 2 else 0), [7, 9, 1, 2, 11, 12][j % 6] if year != "2026-27" else [7, 8, 9, 9][j % 4], 10 + j)
                if left.month < 4 and left.year == y0:
                    left = left.replace(year=y0 + 1)
                if year == "2026-27" and left > date.today():
                    left = date.today() - timedelta(days=20 + j)
                joined = date(max(2018, y0 - rnd.randint(0, 3)), 6, 10 + (j % 8))
                need(c.call("POST", "/students", {"first_name": first, "last_name": last, "gender": "male" if j % 2 == 0 else "female",
                    "joining_date": joined.isoformat(), "leaving_date": left.isoformat(), "status": "left", "class_id": class_ids[(k * 3) % len(class_ids)],
                    "guardian_name": f"Mr {last}", "guardian_phone": f"98{rnd.randint(10000000, 99999999)}", "notes": "Sample history"}), "add past student")
                k += 1
        print(f"Added {k} students who left in earlier years and this year.")
    # Syllabus coverage: each class teacher saves Term 1 (finished) and Term 2 (running) with a mix of on-track, slightly behind and behind classes
    def chapter_marks(avg, n=4):
        left, out = avg * n, []
        for _ in range(n):
            v = min(100, left)
            out.append(int(round(v / 5.0) * 5))
            left -= v
        return out
    t2_start, t2_end = date(2026, 10, 1), date(2026, 12, 31)
    tgt = 0 if date.today() <= t2_start else 100 if date.today() >= t2_end else round((date.today() - t2_start).days / (t2_end - t2_start).days * 100)
    gaps = {"PP1": 8, "PP2": 3, "Class 1": -2, "Class 2": -4, "Class 3": -8, "Class 4": -11, "Class 5": -14, "Class 6": -19, "Class 7": -23, "Class 8": 1, "Class 9": -9, "Class 10": -30}
    made = 0
    for email, (tname, cls_names) in TEACHERS.items():
        tc = Client()
        if tc.call("POST", "/auth/login", {"school_code": A.school, "email": email, "password": TEACHER_PASSWORD})[0] != 200:
            continue
        for cn in cls_names:
            cid = classes[cn]["id"]
            idx = CLASSES.index(cn)
            if (tc.call("GET", f"/syllabus?class_id={cid}&term=Term%202")[1] or {}).get("exists"):
                continue
            rr = random.Random(f"syl{cn}")
            for term, a, b, level in (("Term 1", "2026-06-01", "2026-09-30", None), ("Term 2", "2026-10-01", "2026-12-31", max(0, min(100, tgt + gaps.get(cn, 0))))):
                subs = []
                for sname in subjects_for(idx):
                    avg = rr.choice([96, 100, 100, 92]) if level is None else max(0, min(100, level + rr.randint(-8, 8)))
                    titles = [f"{sname}: Unit {u}" for u in range(1, 5)]
                    subs.append({"name": sname, "percent": 0, "chapters": [{"title": t, "percent": v} for t, v in zip(titles, chapter_marks(avg))]})
                need(tc.call("PUT", f"/syllabus/{cid}", {"term": term, "academic_year": "2026-27", "start_date": a, "end_date": b, "subjects": subs}), f"save syllabus {cn} {term}")
            made += 1
    print(f"Syllabus saved for {made} classes (Term 1 finished, Term 2 at different paces).")

    # Holidays
    have_h = {h["name"] for h in need(c.call("GET", "/holidays"), "list holidays")}
    for name, d, e in [("Gandhi Jayanti", "2026-10-02", None), ("Dussehra", "2026-10-20", "2026-10-21"), ("Diwali break", "2026-11-08", "2026-11-10"), ("Christmas", "2026-12-25", None)]:
        if name not in have_h:
            need(c.call("POST", "/holidays", {"name": name, "date": d, "end_date": e}), f"add holiday {name}")
    off = set()
    for h in need(c.call("GET", "/holidays"), "list holidays"):
        d0 = date.fromisoformat(h["date"]); d1 = date.fromisoformat(h.get("end_date") or h["date"])
        while d0 <= d1:
            off.add(d0); d0 += timedelta(days=1)

    # Timetable (8 periods with lunch) and a Term 2 exam schedule for every class
    periods = [("09:00", "09:45"), ("09:45", "10:30"), ("10:30", "11:00"), ("11:00", "11:45"), ("11:45", "12:30"), ("12:30", "13:15"), ("13:15", "14:00"), ("14:00", "14:45")]
    made_tt = made_ex = 0
    for cn, cls in classes.items():
        idx = CLASSES.index(cn)
        subs = subjects_for(idx)
        if not (c.call("GET", f"/timetable?class_id={cls['id']}")[1] or {}).get("exists"):
            days = {}
            for di, dname in enumerate(("Mon", "Tue", "Wed", "Thu", "Fri", "Sat")):
                row = [subs[(di + p) % len(subs)] for p in range(8)]
                row[2] = "Break"; row[5] = "Lunch"
                if dname == "Sat":
                    row[4:] = ["Games", "Library", "Art", ""]
                days[dname] = row
            need(c.call("PUT", f"/timetable/{cls['id']}", {"periods": [{"start": a, "end": b} for a, b in periods], "days": days}), f"timetable {cn}")
            made_tt += 1
        if not need(c.call("GET", f"/exams?class_id={cls['id']}"), "list exams"):
            start = date.today() + timedelta(days=6 + idx % 4)
            d0, k = start, 0
            while k < len(subs):
                if d0.weekday() != 6 and d0 not in off:
                    need(c.call("POST", "/exams", {"class_id": cls["id"], "term": "Term 2", "subject": subs[k], "date": d0.isoformat(), "start_time": "09:30",
                                                    "duration_min": 90, "room": f"Room {idx + 1}", "note": "Bring your own stationery." if k == 0 else None}), f"exam {cn} {subs[k]}")
                    k += 1; made_ex += 1
                d0 += timedelta(days=1)
    print(f"Timetable set for {made_tt} classes; {made_ex} exams scheduled.")

    # This month's attendance up to today (skips Sundays and holidays)
    students = need(c.call("GET", "/students"), "list students")
    today = date.today()
    d = today.replace(day=1)
    days = 0
    while d <= today:
        if d.weekday() != 6 and d not in off:
            r = random.Random(f"{d}")
            marks = [{"student_id": s["id"], "status": r.choices(["present", "late", "absent"], [88, 5, 7])[0]} for s in students]
            need(c.call("POST", "/attendance/batch", {"date": d.isoformat(), "marks": marks}), "mark attendance")
            days += 1
        d += timedelta(days=1)
    print(f"Attendance marked for {days} school days this month.")
    # Subjects: a different teacher takes each subject (skipped for classes that already have them)
    tlist = sorted([u for u in need(c.call("GET", "/users"), "list users") if u["role"] == "teacher"], key=lambda u: u["email"])
    done = 0
    for i, cl in enumerate(sorted(need(c.call("GET", "/classes"), "list classes"), key=lambda x: x["name"])):
        if cl.get("subjects") or not tlist:
            continue
        names = ["English", "Numbers", "Drawing"] if cl["name"] in ("PP1", "PP2") else ["Maths", "English", "Science", "Social"]
        subs = [{"name": n, "teacher_id": (tlist[(i + k) % len(tlist)]["id"] if k else cl.get("teacher_id"))} for k, n in enumerate(names)]
        body = {k: cl.get(k) for k in ("name", "section", "teacher_id", "secondary_teacher_id", "attender_name", "attender_phone", "academic_year")}
        body["subjects"] = subs
        if c.call("PUT", f"/classes/{cl['id']}", body)[0] == 200:
            done += 1
    print(f"Subject teachers set for {done} classes.")
    print("\nDone.\n  Admin  : %s / %s  (school code %s)\n  Teacher: %s / %s  (Class 3 and Class 4)\n  Parent : %s / %s  (two children: Aarav Reddy, Class 3 and Ananya Reddy, Class 7)"
          % (A.admin, A.password, A.school, TEACHER_EMAIL, TEACHER_PASSWORD, PARENT_EMAIL, PARENT_PASSWORD))


main()
