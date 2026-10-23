import re
import uuid
from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def safe_regex(text: str) -> dict:
    """Case-insensitive 'contains' match with user input escaped (no regex injection)."""
    return {"$regex": re.escape(text.strip()[:100]), "$options": "i"}
