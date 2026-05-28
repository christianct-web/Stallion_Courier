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

from .middleware_auth import ApiKeyMiddleware
from .cleanup import cleanup_generated_files
from .routes.declarations import router as declarations_router
from .routes.lookups import router as lookups_router
from .routes.extract import router as extract_router
from .routes.clients import router as clients_router
from .routes.documents import router as documents_router
from .routes.courier import router as courier_router
from .routes.courier_rules import router as courier_rules_router
from .routes.sheets import router as sheets_router

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("stallion")


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
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
app = FastAPI(title="Stallion API", version="0.3.0", lifespan=lifespan)

# CORS — restrict in production via STALLION_CORS_ORIGINS env var
cors_origins = os.environ.get("STALLION_CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API key auth — active only when STALLION_API_KEY is set
app.add_middleware(ApiKeyMiddleware)


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "stallion", "version": "0.3.0"}


# ─── Mount routers ────────────────────────────────────────────────────────────
app.include_router(lookups_router)
app.include_router(declarations_router)
app.include_router(extract_router)
app.include_router(clients_router)
app.include_router(documents_router)
app.include_router(courier_router)
app.include_router(courier_rules_router)
app.include_router(sheets_router)
