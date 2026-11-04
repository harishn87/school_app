import re
import uuid
from datetime import date, datetime, timedelta, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


IST = timezone(timedelta(hours=5, minutes=30))


def today_ist() -> date:
    """Today's date in India. Schools here work to Indian time, whatever the server's clock says."""
    return datetime.now(IST).date()


def current_year() -> str:
    """Academic year as '2026-27'. Indian schools start in April."""
    d = datetime.now(timezone.utc).date()
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[2:]}"


def year_bounds(year: str) -> tuple:
    """First and last day of an academic year string like '2025-26' (April to March)."""
    start = int(year[:4])
    return f"{start}-04-01", f"{start + 1}-03-31"


def year_q(year: str | None = None, field: str = "academic_year") -> dict:
    """Query fragment for one academic year. Records saved before years existed count as the current year."""
    year = year or current_year()
    if year == current_year():
        return {"$or": [{field: year}, {field: {"$exists": False}}, {field: None}]}
    return {field: year}


def new_id() -> str:
    return str(uuid.uuid4())


def safe_regex(text: str) -> dict:
    """Case-insensitive 'contains' match with user input escaped (no regex injection)."""
    return {"$regex": re.escape(text.strip()[:100]), "$options": "i"}


def norm_term(term) -> str:
    """'Term 1 2026' and 'term 1' are both 'Term 1', so fee figures group cleanly by term."""
    t = (term or "").strip()
    m = re.search(r"term\s*(\d+)", t, re.I)
    return f"Term {int(m.group(1))}" if m else (t or "Other")


def fee_terms(fees) -> list:
    """Billed, collected and pending per term, in term order. `fees` are fee documents."""
    rows: dict = {}
    for f in fees:
        amt, paid = float(f.get("amount", 0) or 0), float(f.get("paid_amount", 0) or 0)
        r = rows.setdefault(norm_term(f.get("term")), {"billed": 0.0, "collected": 0.0, "records": 0, "paid": 0, "partial": 0, "unpaid": 0, "due_date": None})
        r["billed"] += amt
        r["collected"] += paid
        r["records"] += 1
        r["paid" if paid >= amt and amt > 0 else "partial" if paid > 0 else "unpaid"] += 1
        d = f.get("due_date")
        if d and (r["due_date"] is None or d < r["due_date"]):
            r["due_date"] = d

    def order(k):
        m = re.match(r"Term (\d+)$", k)
        return (0, int(m.group(1)), k) if m else (1, 0, k)
    out = []
    for k in sorted(rows, key=order):
        r = rows[k]
        pending = max(r["billed"] - r["collected"], 0)
        status = "paid" if r["billed"] > 0 and pending == 0 else "partial" if r["collected"] > 0 else "unpaid"
        out.append({"term": k, **r, "pending": pending, "percent": round(r["collected"] / r["billed"] * 100) if r["billed"] else None, "status": status})
    return out
