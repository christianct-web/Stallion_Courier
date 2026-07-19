"""Login and current-session endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import AuthUser, SESSION_TTL_SECONDS, authenticate, issue_token, request_user

router = APIRouter(prefix="/auth", tags=["authentication"])


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=512)


@router.post("/login")
def login(req: LoginRequest):
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
