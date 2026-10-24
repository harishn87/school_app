import re
import uuid
from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def current_year() -> str:
    """Academic year as '2026-27'. Indian schools start in April."""
    d = datetime.now(timezone.utc).date()
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[2:]}"


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
