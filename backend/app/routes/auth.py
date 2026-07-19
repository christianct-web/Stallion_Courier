"""Login, current-session, and scoped download-grant endpoints."""
from __future__ import annotations

import threading
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth import (
    AuthUser,
    SESSION_TTL_SECONDS,
    authenticate,
    issue_download_token,
    issue_token,
    request_user,
)

router = APIRouter(prefix="/auth", tags=["authentication"])

_LOGIN_WINDOW_SECONDS = 60
_LOGIN_MAX_ATTEMPTS = 10
_attempts: dict[str, list[float]] = defaultdict(list)
_attempts_lock = threading.Lock()
_DOWNLOAD_PREFIXES = ("/pack/file/", "/courier/manifests/", "/sheets/")


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=512)


class DownloadGrantRequest(BaseModel):
    path: str = Field(..., min_length=1, max_length=2048)


def _client_ip(request: Request) -> str:
    # Caddy appends the immediate client to the right of any caller-supplied
    # values, so use the right-most address rather than a spoofable first hop.
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[-1].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def _check_login_rate(request: Request, username: str) -> None:
    now = time.monotonic()
    cutoff = now - _LOGIN_WINDOW_SECONDS
    keys = ("ip:" + _client_ip(request), "account:" + username.strip().lower())
    with _attempts_lock:
        for key in keys:
            _attempts[key] = [stamp for stamp in _attempts[key] if stamp > cutoff]
            if len(_attempts[key]) >= _LOGIN_MAX_ATTEMPTS:
                raise HTTPException(
                    status_code=429,
                    detail="Too many login attempts. Try again in one minute.",
                    headers={"Retry-After": str(_LOGIN_WINDOW_SECONDS)},
                )
        for key in keys:
            _attempts[key].append(now)


@router.post("/login")
def login(req: LoginRequest, request: Request):
    _check_login_rate(request, req.username)
    user = authenticate(req.username, req.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {
        "access_token": issue_token(user),
        "token_type": "bearer",
        "expires_in": SESSION_TTL_SECONDS,
        "user": user.public(),
    }


@router.get("/me")
def me(user: AuthUser = Depends(request_user)):
    return {"user": user.public()}


@router.post("/download-grant")
def download_grant(req: DownloadGrantRequest, user: AuthUser = Depends(request_user)):
    path = req.path.strip()
    if ("?" in path or "#" in path or ".." in path.split("/")
            or not any(path.startswith(prefix) for prefix in _DOWNLOAD_PREFIXES)):
        raise HTTPException(status_code=400, detail="Path is not an authorised download endpoint")
    ttl_seconds = 90
    return {
        "download_grant": issue_download_token(user, path, ttl_seconds=ttl_seconds),
        "expires_in": ttl_seconds,
        "path": path,
    }
