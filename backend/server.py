"""Entry point kept for compatibility: `uvicorn server:app`.

The application lives in the `app/` package (see app/main.py).
"""
from app.main import app  # noqa: F401
