"""
Stallion API key authentication middleware.

Reads STALLION_API_KEY from environment. If set, all requests (except public
paths) must include a matching X-API-Key header.

Behaviour by environment (STALLION_ENV):
  - production: STALLION_API_KEY is REQUIRED. Startup fails without it
    (enforced in main.py via assert_production_security). Docs endpoints
    are NOT public.
  - anything else (dev): missing key disables auth for local convenience.

Key comparison is constant-time (hmac.compare_digest).
"""
from __future__ import annotations

import hmac
import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


def is_production() -> bool:
    return os.environ.get("STALLION_ENV", "").strip().lower() == "production"


# Paths that never require authentication
_ALWAYS_PUBLIC = frozenset({"/health"})
_DEV_PUBLIC = frozenset({"/health", "/docs", "/openapi.json", "/redoc"})

# GET paths where ?api_key= is accepted (browser download links can't set headers)
_DOWNLOAD_PREFIXES = ("/pack/file/", "/courier/manifests/", "/sheets/")


class ApiKeyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, api_key: str | None = None):
        super().__init__(app)
        self.api_key = api_key or os.environ.get("STALLION_API_KEY", "").strip()
        self.public_paths = _ALWAYS_PUBLIC if is_production() else _DEV_PUBLIC

    async def dispatch(self, request: Request, call_next):
        # If no key configured, skip auth (local dev mode only —
        # production without a key cannot boot, see main.py).
        if not self.api_key:
            return await call_next(request)

        if request.url.path in self.public_paths:
            return await call_next(request)

        # CORS preflight requests must pass through
        if request.method == "OPTIONS":
            return await call_next(request)

        provided = (request.headers.get("X-API-Key") or "").strip()

        # File downloads open via <a href> / window.open and cannot attach
        # headers. For GET requests to download paths ONLY, accept the key as
        # an ?api_key= query parameter. (Interim until signed download tokens
        # in Phase 3 — keys in URLs can leak into logs, hence the narrow scope.)
        if not provided and request.method == "GET":
            path = request.url.path
            if any(path.startswith(pfx) for pfx in _DOWNLOAD_PREFIXES):
                provided = (request.query_params.get("api_key") or "").strip()
        if not provided or not hmac.compare_digest(provided, self.api_key):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing API key"},
            )

        return await call_next(request)


def assert_production_security() -> None:
    """Fail-closed startup guard. Called from main.py before the app serves.

    In production:
      - STALLION_API_KEY must be set and non-trivial.
      - STALLION_CORS_ORIGINS must be an explicit origin list (no wildcard).
    """
    if not is_production():
        return

    key = os.environ.get("STALLION_API_KEY", "").strip()
    if len(key) < 16:
        raise RuntimeError(
            "FATAL: STALLION_ENV=production but STALLION_API_KEY is missing or "
            "shorter than 16 characters. Refusing to start an unauthenticated "
            "production API. Set a strong key (e.g. `openssl rand -hex 32`)."
        )

    origins = os.environ.get("STALLION_CORS_ORIGINS", "").strip()
    if not origins or origins == "*" or "*" in [o.strip() for o in origins.split(",")]:
        raise RuntimeError(
            "FATAL: STALLION_ENV=production requires STALLION_CORS_ORIGINS to be "
            "an explicit comma-separated list of origins (no '*')."
        )
