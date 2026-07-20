"""
Stallion API — Application entry point.

All route handlers live in app/routes/. This module wires up the FastAPI app,
middleware, and router mounts.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .middleware_auth import SessionAuthMiddleware, assert_production_security, is_production
from .backfill import run_backfill
from .cleanup import cleanup_generated_files
from .db import init_db
from .routes.declarations import router as declarations_router
from .routes.lookups import router as lookups_router
from .routes.extract import router as extract_router
from .routes.clients import router as clients_router
from .routes.documents import router as documents_router
from .routes.courier import router as courier_router
from .routes.courier_rules import router as courier_rules_router
from .routes.sheets import router as sheets_router
from .routes.auth import router as auth_router

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("stallion")


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure the database schema exists and migrate any legacy JSON
    # stores into it (idempotent — a no-op once migrated).
    try:
        init_db()
        imported = run_backfill()
        migrated = sum(imported.values())
        if migrated:
            logger.info("Startup: migrated %d legacy JSON record(s) into the database", migrated)
    except Exception as exc:
        logger.warning("Startup database init/backfill failed (non-fatal): %s", exc)

    # Startup: clean up expired generated files
    try:
        result = cleanup_generated_files()
        if result["deleted"]:
            logger.info("Startup cleanup: removed %d expired files", result["deleted"])
    except Exception as exc:
        logger.warning("Startup cleanup failed (non-fatal): %s", exc)
    yield
    # Shutdown: nothing to do


# ── App ───────────────────────────────────────────────────────────────────────
# Fail-closed guard: production cannot boot without auth + explicit CORS.
assert_production_security()

app = FastAPI(
    title="Stallion API",
    version="0.4.0",
    lifespan=lifespan,
    # No interactive docs in production (they enumerate the whole API surface)
    docs_url=None if is_production() else "/docs",
    redoc_url=None if is_production() else "/redoc",
    openapi_url=None if is_production() else "/openapi.json",
)

# CORS — production REQUIRES an explicit origin list (enforced above).
# Credentials are only allowed alongside explicit origins; wildcard+credentials
# is an invalid combination and is never emitted.
cors_origins = [o.strip() for o in os.environ.get("STALLION_CORS_ORIGINS", "*").split(",") if o.strip()]
_explicit_origins = cors_origins != ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=_explicit_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Short-lived user sessions with clerk/broker/admin authorization.
app.add_middleware(SessionAuthMiddleware)


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "stallion", "version": "0.4.0"}


# ─── Mount routers ────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(lookups_router)
app.include_router(declarations_router)
app.include_router(extract_router)
app.include_router(clients_router)
app.include_router(documents_router)
app.include_router(courier_router)
app.include_router(courier_rules_router)
app.include_router(sheets_router)
