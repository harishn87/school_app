"""Simple in-memory sliding-window rate limiter.

Good for a single backend instance. If you run several instances behind a load
balancer, move this to Redis so limits are shared.
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict = defaultdict(deque)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def check(key: str, limit: int, window_seconds: int) -> None:
    now = time.monotonic()
    q = _hits[key]
    while q and q[0] <= now - window_seconds:
        q.popleft()
    if len(q) >= limit:
        retry = int(window_seconds - (now - q[0])) + 1
        raise HTTPException(status_code=429, detail=f"Too many attempts. Try again in {retry} seconds.",
                            headers={"Retry-After": str(retry)})
    q.append(now)


def reset() -> None:
    _hits.clear()
