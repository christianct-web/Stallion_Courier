"""
Stallion Courier — Rules & Tariff Management Routes

Admin endpoints for editing the operational rules that drive the duty
engine. Mounted at /courier/rules and /courier/tariff.

Caller identity is taken from the verified session context. Legacy
X-User-Id headers may still be sent by older clients but are ignored.
"""
from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Body, Header, HTTPException, Query
from pydantic import BaseModel, Field, ValidationError, field_validator

from ..auth import current_user_name
from ..services import courier_rules

router = APIRouter(prefix="/courier", tags=["courier-rules"])


# ── Request models ───────────────────────────────────────────────────────────
#
# Defining these explicitly (instead of accepting bare Dict[str, Any]) gives
# FastAPI clear, broker-friendly validation errors and prevents non-dict
# bodies from ever reaching the service layer.


class ExemptionAddRequest(BaseModel):
    thn: str = Field(..., description="8-digit THN")
    class_: Literal["full_exempt", "duty_free_only"] = Field(
        ..., alias="class",
        description="Exemption class. full_exempt = no duty/OPT/VAT; duty_free_only = no duty but OPT+VAT still apply.",
    )
    notes: str = Field("", description="Why this exemption applies")
    comment: str = Field("", description="Audit-log comment")

    model_config = {"populate_by_name": True}

    @field_validator("thn")
    @classmethod
    def thn_valid(cls, v: str) -> str:
        raw = (v or "").replace(".", "").strip()
        if not raw.isdigit() or len(raw) != 8:
            raise ValueError("THN must be 8 digits")
        return raw


class CorrectionAddRequest(BaseModel):
    wrong_thn: str = Field(..., description="The mistyped/invalid THN that should be remapped")
    correct_thn: str = Field(..., description="The valid THN to map TO")
    reason: str = Field("", description="Why this correction applies")
    comment: str = Field("", description="Audit-log comment")

    @field_validator("wrong_thn", "correct_thn")
    @classmethod
    def thn_valid(cls, v: str) -> str:
        raw = (v or "").replace(".", "").strip()
        if not raw.isdigit() or len(raw) != 8:
            raise ValueError("THN must be 8 digits")
        return raw


class TariffAddRequest(BaseModel):
    thn: str = Field(..., description="8-digit THN")
    description: str = Field(..., min_length=1, description="What this THN covers")
    duty_pct: float = Field(..., ge=0, le=100, description="Duty rate as a percent (0-100)")
    chapter: Optional[int] = Field(None, ge=1, le=99)
    unit: Optional[str] = Field(None, description="Unit of measure (kg, u, l, etc.)")
    is_exempt: Optional[bool] = Field(
        None,
        description="If True, marks the entry as exempt. If None, inferred from duty_pct == 0.",
    )
    comment: str = Field("", description="Audit-log comment")

    @field_validator("thn")
    @classmethod
    def thn_valid(cls, v: str) -> str:
        raw = (v or "").replace(".", "").strip()
        if not raw.isdigit() or len(raw) != 8:
            raise ValueError("THN must be 8 digits")
        return raw


def _user(_legacy_x_user_id: Optional[str] = None) -> str:
    """Return the verified session identity; never trust caller headers."""
    return current_user_name()


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
    req: ExemptionAddRequest,
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
            thn=req.thn,
            exemption_class=req.class_,
            notes=req.notes,
            by=_user(x_user_id),
            comment=req.comment,
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
    req: CorrectionAddRequest,
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
            wrong_thn=req.wrong_thn,
            correct_thn=req.correct_thn,
            reason=req.reason,
            by=_user(x_user_id),
            comment=req.comment,
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
    q: Optional[str] = Query(None, description="Ranked search on THN/code/description"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    duty_band: Optional[str] = Query(
        None, description="free | low | mid | high"),
    overrides_only: bool = Query(False),
    sort: str = Query("relevance", description="relevance | thn"),
):
    """
    Paginated tariff browse with ranked search. Each entry includes
    `is_override: true|false` so the UI can show which entries are
    user-customised.
    """
    return courier_rules.list_tariff_entries(
        chapter=chapter, query=q, limit=limit, offset=offset,
        duty_band=duty_band, overrides_only=overrides_only, sort=sort,
    )


@router.get("/tariff/chapters")
def tariff_chapters():
    """
    HS section/chapter summary with per-chapter entry + override counts.
    Drives the browse-by-category UI.
    """
    return courier_rules.tariff_chapter_summary()


@router.post("/tariff")
def tariff_add(
    req: Any = Body(...),
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
    # Accept strict object payloads, but also defensively handle legacy
    # clients that might send a JSON string body.
    try:
        if isinstance(req, TariffAddRequest):
            parsed = req
        elif isinstance(req, dict):
            parsed = TariffAddRequest.model_validate(req)
        elif isinstance(req, str):
            parsed = TariffAddRequest.model_validate_json(req)
        else:
            raise HTTPException(
                status_code=422,
                detail="Body must be a JSON object with thn, description, duty_pct, and optional chapter/unit/is_exempt/comment",
            )
    except ValidationError as e:
        errs = [{"loc": er.get("loc"), "msg": er.get("msg"), "type": er.get("type")} for er in e.errors()]
        raise HTTPException(status_code=422, detail=errs)

    try:
        return courier_rules.add_tariff_entry(
            thn=parsed.thn,
            description=parsed.description,
            duty_pct=parsed.duty_pct,
            chapter=parsed.chapter,
            unit=parsed.unit,
            is_exempt=parsed.is_exempt,
            by=_user(x_user_id),
            comment=parsed.comment,
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
