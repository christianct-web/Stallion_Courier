"""Authentication primitives for Stallion Courier.

Production users are configured through STALLION_USERS_JSON with PBKDF2 password
hashes. Successful login returns a short-lived, HMAC-signed bearer token. The
middleware places the verified user on request.state and in a request-scoped
context variable so audit writers never trust caller-supplied identity headers.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from contextvars import ContextVar
from dataclasses import asdict, dataclass
from typing import Any, Callable

from fastapi import Depends, HTTPException, Request

PASSWORD_ITERATIONS = 310_000
SESSION_TTL_SECONDS = int(os.environ.get("STALLION_SESSION_TTL_SECONDS", "28800"))
VALID_ROLES = frozenset({"clerk", "broker", "admin"})


@dataclass(frozen=True)
class AuthUser:
    username: str
    name: str
    role: str

    def public(self) -> dict[str, str]:
        return asdict(self)


_current_user: ContextVar[AuthUser | None] = ContextVar("stallion_current_user", default=None)


def set_current_user(user: AuthUser):
    return _current_user.set(user)


def reset_current_user(token) -> None:
    _current_user.reset(token)


def current_user() -> AuthUser | None:
    return _current_user.get()


def current_user_name() -> str:
    user = current_user()
    return user.name if user else "unauthenticated"


def _b64_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str, *, salt: bytes | None = None, iterations: int = PASSWORD_ITERATIONS) -> str:
    if not password:
        raise ValueError("password cannot be empty")
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256" + "$" + str(iterations) + "$" + _b64_encode(salt) + "$" + _b64_encode(digest)


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, expected_raw = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_raw)
        salt = _b64_decode(salt_raw)
        expected = _b64_decode(expected_raw)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def load_user_records() -> list[dict[str, Any]]:
    raw = os.environ.get("STALLION_USERS_JSON", "").strip()
    if not raw:
        return []
    try:
        records = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("STALLION_USERS_JSON must be valid JSON") from exc
    if not isinstance(records, list):
        raise RuntimeError("STALLION_USERS_JSON must be a JSON array")

    seen: set[str] = set()
    validated: list[dict[str, Any]] = []
    for record in records:
        if not isinstance(record, dict):
            raise RuntimeError("Each STALLION_USERS_JSON entry must be an object")
        username = str(record.get("username") or "").strip().lower()
        name = str(record.get("name") or "").strip()
        role = str(record.get("role") or "").strip().lower()
        password_hash = str(record.get("password_hash") or "").strip()
        if not username or not name or role not in VALID_ROLES or not password_hash:
            raise RuntimeError("Each user requires username, name, valid role, and password_hash")
        if username in seen:
            raise RuntimeError("Duplicate Stallion username: " + username)
        seen.add(username)
        validated.append({
            "username": username,
            "name": name,
            "role": role,
            "password_hash": password_hash,
        })
    return validated


def authenticate(username: str, password: str) -> AuthUser | None:
    wanted = (username or "").strip().lower()
    for record in load_user_records():
        if hmac.compare_digest(record["username"], wanted) and verify_password(password, record["password_hash"]):
            return AuthUser(record["username"], record["name"], record["role"])
    return None


def _session_secret() -> bytes:
    secret = os.environ.get("STALLION_SESSION_SECRET", "").strip()
    if not secret:
        raise RuntimeError("STALLION_SESSION_SECRET is not configured")
    return secret.encode("utf-8")


def issue_token(user: AuthUser, *, now: int | None = None, ttl_seconds: int | None = None) -> str:
    issued_at = int(now if now is not None else time.time())
    payload = {
        "sub": user.username,
        "name": user.name,
        "role": user.role,
        "iat": issued_at,
        "exp": issued_at + int(ttl_seconds or SESSION_TTL_SECONDS),
        "jti": secrets.token_urlsafe(12),
    }
    body = _b64_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _b64_encode(hmac.new(_session_secret(), body.encode("ascii"), hashlib.sha256).digest())
    return body + "." + signature


def decode_token(token: str, *, now: int | None = None) -> AuthUser:
    try:
        body, supplied_signature = token.split(".", 1)
        expected_signature = _b64_encode(
            hmac.new(_session_secret(), body.encode("ascii"), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise ValueError("bad signature")
        payload = json.loads(_b64_decode(body))
        current_time = int(now if now is not None else time.time())
        if int(payload.get("exp") or 0) <= current_time:
            raise ValueError("expired")
        role = str(payload.get("role") or "")
        if role not in VALID_ROLES:
            raise ValueError("invalid role")
        return AuthUser(
            username=str(payload["sub"]),
            name=str(payload["name"]),
            role=role,
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from exc


def request_user(request: Request) -> AuthUser:
    user = getattr(request.state, "user", None)
    if not isinstance(user, AuthUser):
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_roles(*roles: str) -> Callable:
    allowed = frozenset(roles)

    def dependency(user: AuthUser = Depends(request_user)) -> AuthUser:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="Your role cannot perform this action")
        return user

    return dependency
