"""
Stallion API key authentication middleware.

Reads STALLION_API_KEY from environment. If set, all requests (except /health
and /docs) must include a matching X-API-Key header.

If STALLION_API_KEY is not set, authentication is disabled (open access) —
this preserves local dev convenience while enforcing auth in production.
"""
from __future__ import annotations

import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Paths that never require authentication
PUBLIC_PATHS = frozenset({
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
})


class ApiKeyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, api_key: str | None = None):
        super().__init__(app)
        self.api_key = api_key or os.environ.get("STALLION_API_KEY", "").strip()

    async def dispatch(self, request: Request, call_next):
        # If no key configured, skip auth (local dev mode)
        if not self.api_key:
            return await call_next(request)

        # Allow public paths through
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        # CORS preflight requests must pass through
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check header
        provided = (request.headers.get("X-API-Key") or "").strip()
        if provided != self.api_key:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing API key"},
            )

        return await call_next(request)
