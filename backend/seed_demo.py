"""Fill a demo school with sample data through the running app's own API.

  - 12 classes: PP1, PP2, Class 1 ... Class 10, with 10 students each (120 students)
  - one parent login with two children (in Class 3 and Class 7)
  - six class teachers (Ravi Kumar: Class 3 and Class 4), a secondary teacher on some classes, and a class attender for each
  - Term 1 fees (some paid, some part paid, some unpaid), Term 1 and Term 2 progress reports, this month's attendance, holidays
  - two earlier years (2024-25 and 2025-26) of progress reports for every term and of fee records, for history views

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

    # Parent login (one parent, two children)
    code, data = c.call("POST", "/users", {"name": "Lakshmi Reddy", "email": PARENT_EMAIL, "role": "parent", "password": PARENT_PASSWORD})
    print("Parent login created." if code == 201 else "Parent login already exists." if code == 409 else f"Parent login: HTTP {code} {data}")

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
    print("\nDone.\n  Admin  : %s / %s  (school code %s)\n  Teacher: %s / %s  (Class 3 and Class 4)\n  Parent : %s / %s  (two children: Aarav Reddy, Class 3 and Ananya Reddy, Class 7)"
          % (A.admin, A.password, A.school, TEACHER_EMAIL, TEACHER_PASSWORD, PARENT_EMAIL, PARENT_PASSWORD))


main()
