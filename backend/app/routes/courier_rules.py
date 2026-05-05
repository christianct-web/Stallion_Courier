"""
Stallion Courier — Rules & Tariff Management Routes

Admin endpoints for editing the operational rules that drive the duty
engine. Mounted at /courier/rules and /courier/tariff.

Caller identity is taken from the optional `X-User-Id` request header
and recorded in the audit trail. In production this should be replaced
with the real auth middleware once Stallion has user accounts.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Query

from ..services import courier_rules

router = APIRouter(prefix="/courier", tags=["courier-rules"])


def _user(x_user_id: Optional[str]) -> str:
    return (x_user_id or "anonymous").strip() or "anonymous"


# ── Rules: list / inspect ────────────────────────────────────────────────────


@router.get("/rules")
def rules_get():
    """
    Return the full effective ruleset (bundled + user merged).

    Each entry includes `is_user: true|false` so the UI can distinguish
    user-edited rules from bundled defaults.
    """
    rules = courier_rules.load_rules()
    return {
        "exemptions": rules["exemptions"],
        "thn_corrections": rules["thn_corrections"],
    }


# ── Exemptions: CRUD ─────────────────────────────────────────────────────────


@router.post("/rules/exemptions")
def exemptions_add(
    req: Dict[str, Any],
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Add or update an exemption.

    Body:
      {
        "thn": "85171300",
        "class": "full_exempt" | "duty_free_only",
        "notes": "Smartphones - breakout exemption",
        "comment": "Optional reason for the audit log"
      }
    """
    try:
        return courier_rules.add_exemption(
            thn=req.get("thn", ""),
            exemption_class=req.get("class", ""),
            notes=req.get("notes", ""),
            by=_user(x_user_id),
            comment=req.get("comment", ""),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/rules/exemptions/{thn}")
def exemptions_remove(
    thn: str,
    comment: str = Query(""),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Remove a user exemption. Bundled exemptions cannot be removed —
    instead, add a user exemption that overrides the bundled one
    (e.g. by changing its class).
    """
    try:
        ok = courier_rules.remove_exemption(thn, by=_user(x_user_id), comment=comment)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f"No user exemption for {thn}. Bundled exemptions cannot be removed; override them instead.",
        )
    return {"ok": True}


# ── Corrections: CRUD ────────────────────────────────────────────────────────


@router.post("/rules/corrections")
def corrections_add(
    req: Dict[str, Any],
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Add or update a THN correction (wrong-code → right-code redirect).

    Body:
      {
        "wrong_thn": "85171200",
        "correct_thn": "85171300",
        "reason": "85171200 does not exist; use 85171300 for smartphones",
        "comment": "Optional audit comment"
      }
    """
    try:
        return courier_rules.add_correction(
            wrong_thn=req.get("wrong_thn", ""),
            correct_thn=req.get("correct_thn", ""),
            reason=req.get("reason", ""),
            by=_user(x_user_id),
            comment=req.get("comment", ""),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/rules/corrections/{wrong_thn}")
def corrections_remove(
    wrong_thn: str,
    comment: str = Query(""),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """Remove a user-added THN correction."""
    try:
        ok = courier_rules.remove_correction(wrong_thn, by=_user(x_user_id), comment=comment)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f"No user correction for {wrong_thn}. Bundled corrections cannot be removed; override them instead.",
        )
    return {"ok": True}


# ── Tariff: browse + edit overrides ──────────────────────────────────────────


@router.get("/tariff")
def tariff_browse(
    chapter: Optional[int] = Query(None, ge=1, le=99),
    q: Optional[str] = Query(None, description="Substring match on description or THN"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """
    Paginated tariff browse. Each entry includes `is_override: true|false`
    so the UI can show which entries are user-customised.
    """
    return courier_rules.list_tariff_entries(
        chapter=chapter, query=q, limit=limit, offset=offset,
    )


@router.post("/tariff")
def tariff_add(
    req: Dict[str, Any],
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Add or override a tariff entry.

    Body:
      {
        "thn": "83062900",
        "description": "Decorations of base metal, other",
        "duty_pct": 20,
        "chapter": 83,
        "unit": "kg",
        "is_exempt": false,
        "comment": "OCR missed this row in the bundled CET 2024 import"
      }
    """
    try:
        return courier_rules.add_tariff_entry(
            thn=req.get("thn", ""),
            description=req.get("description", ""),
            duty_pct=req.get("duty_pct", 0),
            chapter=req.get("chapter"),
            unit=req.get("unit"),
            is_exempt=req.get("is_exempt"),
            by=_user(x_user_id),
            comment=req.get("comment", ""),
        )
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/tariff/{thn}")
def tariff_remove(
    thn: str,
    comment: str = Query(""),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """Remove a user tariff override (bundled entries cannot be removed)."""
    try:
        ok = courier_rules.remove_tariff_entry(thn, by=_user(x_user_id), comment=comment)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not ok:
        raise HTTPException(
            status_code=404,
            detail=f"No user tariff override for {thn}. Bundled entries cannot be removed; override them instead.",
        )
    return {"ok": True}


# ── Audit log ────────────────────────────────────────────────────────────────


@router.get("/rules/audit")
def audit_get(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """
    Paginated audit log of every rule edit (newest first).
    Each entry: at, by, action, target, before, after, comment.
    """
    return courier_rules.get_audit_log(limit=limit, offset=offset)


# ── Export / import ──────────────────────────────────────────────────────────


@router.get("/rules/export")
def rules_export():
    """
    Export the complete user ruleset + tariff overrides + audit log
    as a single backup payload.
    """
    return courier_rules.export_user_rules()


@router.post("/rules/import")
def rules_import(
    req: Dict[str, Any],
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    """
    Replace user rules and tariff overrides with the contents of `req`.
    `req` should have the same shape as `/rules/export` returns.

    The audit log is preserved and a single bulk_import audit entry
    is appended.
    """
    try:
        return courier_rules.import_user_rules(
            req,
            by=_user(x_user_id),
            comment=req.get("comment", "Bulk import"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
