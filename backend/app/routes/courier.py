"""
Stallion Courier Module routes.

Endpoints for TTPOST express consignment manifests, lines, officer
examination, and THN classification. Worksheet/Hazmat export endpoints
are stubbed here and will be implemented in Phase 2 (courier_export.py).
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from ..services import courier_duty, courier_matcher, courier_service

router = APIRouter(prefix="/courier", tags=["courier"])


# ── Manifests ────────────────────────────────────────────────────────────────


@router.get("/manifests")
def manifests_list():
    """List all courier manifests."""
    return {"items": courier_service.list_manifests()}


@router.post("/manifests")
def manifests_create(req: Dict[str, Any]):
    """Create a new courier manifest. Required: manifest_no, arrival_date, exch_rate."""
    try:
        return courier_service.create_manifest(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/manifests/{manifest_id}")
def manifests_get(manifest_id: str):
    m = courier_service.get_manifest(manifest_id)
    if not m:
        raise HTTPException(status_code=404, detail="Manifest not found")
    return m


@router.patch("/manifests/{manifest_id}")
def manifests_update(manifest_id: str, req: Dict[str, Any]):
    try:
        m = courier_service.update_manifest_header(manifest_id, req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not m:
        raise HTTPException(status_code=404, detail="Manifest not found")
    return m


@router.delete("/manifests/{manifest_id}")
def manifests_delete(manifest_id: str):
    if not courier_service.delete_manifest(manifest_id):
        raise HTTPException(status_code=404, detail="Manifest not found")
    return {"ok": True}


# ── Lines ────────────────────────────────────────────────────────────────────


@router.post("/manifests/{manifest_id}/lines")
def lines_create(manifest_id: str, req: Dict[str, Any]):
    """
    Add a line to a manifest. If `auto_classify=true` is passed, the
    matcher will attempt to fill in the THN from the description.
    """
    auto = bool(req.pop("auto_classify", False))
    if auto:
        line = courier_service.add_line_with_auto_thn(manifest_id, req)
    else:
        line = courier_service.add_line(manifest_id, req)
    if not line:
        raise HTTPException(status_code=404, detail="Manifest not found")
    return line


@router.patch("/manifests/{manifest_id}/lines/{line_no}")
def lines_update(manifest_id: str, line_no: int, req: Dict[str, Any]):
    line = courier_service.update_line(manifest_id, line_no, req)
    if not line:
        raise HTTPException(status_code=404, detail="Manifest or line not found")
    return line


@router.delete("/manifests/{manifest_id}/lines/{line_no}")
def lines_delete(manifest_id: str, line_no: int):
    if not courier_service.delete_line(manifest_id, line_no):
        raise HTTPException(status_code=404, detail="Manifest or line not found")
    return {"ok": True}


# ── Officer examination ──────────────────────────────────────────────────────


@router.post("/manifests/{manifest_id}/exam")
def exam_record(manifest_id: str, req: Dict[str, Any]):
    m = courier_service.record_examination(manifest_id, req)
    if not m:
        raise HTTPException(status_code=404, detail="Manifest not found")
    return m


# ── THN classification & lookup ──────────────────────────────────────────────


@router.post("/classify")
def classify_description(req: Dict[str, Any]):
    """
    Suggest THNs for an item description.

    Body: {"description": "smartphone case", "limit": 5}
    """
    description = (req.get("description") or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="description is required")
    limit = int(req.get("limit") or 5)
    return courier_matcher.suggest_thns(description, limit=limit)


@router.get("/lookup/{thn}")
def lookup_thn(thn: str):
    """Look up a single THN's tariff entry and exemption classification."""
    entry = courier_duty.lookup_thn(thn)
    cls = courier_duty.classify(thn)
    return {
        "thn": thn.replace(".", "").strip(),
        "entry": entry,
        "exemption_class": cls.exemption_class,
        "duty_rate": cls.duty_rate,
        "notes": cls.notes,
        "is_corrected": cls.is_corrected,
        "original_thn": cls.original_thn,
        "is_unknown": cls.is_unknown,
    }


# ── Stubs for Phase 2 ────────────────────────────────────────────────────────


@router.get("/manifests/{manifest_id}/worksheet")
def export_worksheet(manifest_id: str):
    """Generate Worksheet v3 XLSX. Implemented in Phase 2."""
    raise HTTPException(status_code=501, detail="Worksheet export pending Phase 2 (courier_export.py)")


@router.get("/manifests/{manifest_id}/hazmat")
def export_hazmat(manifest_id: str):
    """Generate Courier Data Form Hazmat XLSX. Implemented in Phase 2."""
    raise HTTPException(status_code=501, detail="Hazmat export pending Phase 2 (courier_export.py)")
