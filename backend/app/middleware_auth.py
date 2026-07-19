"""Server-issued session authentication and coarse route authorization."""
from __future__ import annotations

import os

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from .auth import (
    AuthUser,
    decode_download_token,
    decode_token,
    load_user_records,
    reset_current_user,
    set_current_user,
)


def is_production() -> bool:
    return os.environ.get("STALLION_ENV", "").strip().lower() == "production"


_ALWAYS_PUBLIC = frozenset({"/health", "/auth/login"})
_DEV_PUBLIC = frozenset({"/health", "/auth/login", "/docs", "/openapi.json", "/redoc"})
_DOWNLOAD_PREFIXES = ("/pack/file/", "/courier/manifests/", "/sheets/")


def _configured() -> bool:
    return bool(
        os.environ.get("STALLION_SESSION_SECRET", "").strip()
        and os.environ.get("STALLION_USERS_JSON", "").strip()
    )


def _bearer_token(request: Request) -> str:
    authorization = (request.headers.get("Authorization") or "").strip()
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return ""


def _download_grant(request: Request) -> str:
    if request.method == "GET" and any(request.url.path.startswith(p) for p in _DOWNLOAD_PREFIXES):
        return (request.query_params.get("download_grant") or "").strip()
    return ""

def _requires_admin(request: Request) -> bool:
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return False
    path = request.url.path
    return path.startswith("/courier/rules") or path.startswith("/courier/tariff")


class SessionAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        public_paths = _ALWAYS_PUBLIC if is_production() else _DEV_PUBLIC
        if request.url.path in public_paths or request.method == "OPTIONS":
            return await call_next(request)

        if not _configured() and not is_production():
            # Local-only convenience. Production configuration is validated
            # before the app starts and can never reach this branch.
            user = AuthUser("dev-admin", "Development Administrator", "admin")
        else:
            grant = _download_grant(request)
            token = _bearer_token(request)
            if not grant and not token:
                return JSONResponse(status_code=401, content={"detail": "Authentication required"})
            try:
                user = (
                    decode_download_token(grant, request.url.path)
                    if grant
                    else decode_token(token)
                )
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

        if _requires_admin(request) and user.role != "admin":
            return JSONResponse(
                status_code=403,
                content={"detail": "Administrator role required for regulatory rule changes"},
            )

        request.state.user = user
        context_token = set_current_user(user)
        try:
            return await call_next(request)
        finally:
            reset_current_user(context_token)


def assert_production_security() -> None:
    """Refuse to boot production without sessions, users, and explicit CORS."""
    if not is_production():
        return

    secret = os.environ.get("STALLION_SESSION_SECRET", "").strip()
    if len(secret) < 32:
        raise RuntimeError(
            "FATAL: STALLION_ENV=production requires STALLION_SESSION_SECRET "
            "with at least 32 characters."
        )

    users = load_user_records()
    if not users:
        raise RuntimeError("FATAL: STALLION_USERS_JSON must contain at least one user")
    if not any(user["role"] == "admin" for user in users):
        raise RuntimeError("FATAL: STALLION_USERS_JSON must contain an administrator")

    origins = os.environ.get("STALLION_CORS_ORIGINS", "").strip()
    if not origins or origins == "*" or "*" in [o.strip() for o in origins.split(",")]:
        raise RuntimeError(
            "FATAL: STALLION_ENV=production requires STALLION_CORS_ORIGINS to be "
            "an explicit comma-separated list of origins (no '*')."
        )
