import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import ensure_platform_indexes, ensure_tenant_indexes, get_client, platform_db, tenant_db
from .routers import auth, billing, certificates, diary, platform, school, signup, transport
from .security import hash_password, verify_password
from .tenants import create_school
from .utils import new_id, now_iso

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("scholaris")


async def _seed() -> None:
    s = get_settings()
    await ensure_platform_indexes()

    # Super admin from environment (password is re-synced if you change it in .env).
    if s.superadmin_email and s.superadmin_password:
        pdb = platform_db()
        existing = await pdb.platform_admins.find_one({"email": s.superadmin_email})
        if not existing:
            await pdb.platform_admins.insert_one({
                "id": new_id(), "email": s.superadmin_email, "name": "Platform admin", "active": True,
                "password_hash": hash_password(s.superadmin_password), "created_at": now_iso()})
            log.info("Created platform admin %s", s.superadmin_email)
        elif not verify_password(s.superadmin_password, existing.get("password_hash", "")):
            await pdb.platform_admins.update_one({"email": s.superadmin_email},
                                                 {"$set": {"password_hash": hash_password(s.superadmin_password)}})

    # Demo school for local development.
    if s.seed_demo and not await platform_db().schools.find_one({"slug": "demo"}):
        await create_school(name="Demo School", slug="demo", admin_name="Demo Admin",
                            admin_email="admin@school.com", password="admin123")
        log.info("Seeded demo school: code 'demo', admin@school.com / admin123")

    # Make sure every school's database has its indexes (cheap if they already exist).
    async for sch in platform_db().schools.find({}, {"_id": 0, "db_name": 1}):
        await ensure_tenant_indexes(tenant_db(sch["db_name"]))


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_settings().validate()
    await _seed()
    yield
    get_client().close()


def _mount_frontend(app: FastAPI) -> None:
    """Serve the built React app (frontend/build) from the backend when it's present.

    Lets you run everything on one address (http://localhost:8001) without Node/Yarn.
    In Docker/production, Nginx serves the frontend instead and this folder doesn't exist.
    """
    import os
    from pathlib import Path

    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    build = Path(os.environ.get("FRONTEND_BUILD_DIR",
                                Path(__file__).resolve().parent.parent.parent / "frontend" / "build"))
    index = build / "index.html"
    if not index.is_file():
        return
    if (build / "static").is_dir():
        app.mount("/static", StaticFiles(directory=build / "static"), name="static")
    root = build.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = (build / path).resolve()
        if path and candidate.is_file() and root in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    log.info("Serving frontend from %s", build)


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="Scholaris API",
        lifespan=lifespan,
        # Hide interactive docs in production.
        docs_url=None if s.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if s.is_production else "/api/openapi.json",
    )

    @app.middleware("http")
    async def request_log_and_headers(request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            log.exception("Unhandled error rid=%s %s %s", rid, request.method, request.url.path)
            response = JSONResponse({"detail": "Something went wrong. Please try again."}, status_code=500)
        ms = (time.perf_counter() - start) * 1000
        if request.url.path not in ("/api/health", "/api/health/ready"):
            log.info("rid=%s %s %s %s %.0fms", rid, request.method, request.url.path, response.status_code, ms)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    api = APIRouter(prefix="/api")

    @api.get("/health")
    async def health():
        return {"status": "ok"}

    @api.get("/health/ready")
    async def ready():
        try:
            await platform_db().command("ping")
            return {"status": "ok", "database": "ok"}
        except Exception:
            return JSONResponse({"status": "error", "database": "unreachable"}, status_code=503)

    @api.get("/")
    async def root():
        return {"message": "Scholaris API"}

    for r in (auth.router, signup.router, school.router, diary.router, certificates.router, transport.router, billing.router, platform.router):
        api.include_router(r)
    app.include_router(api)
    _mount_frontend(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins or ["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    )
    return app


app = create_app()
