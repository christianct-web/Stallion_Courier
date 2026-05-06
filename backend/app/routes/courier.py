"""
Stallion Courier Module routes.

Endpoints for TTPOST express consignment manifests, lines, officer
examination, THN classification, and worksheet/hazmat exports.
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from ..services import courier_duty, courier_export, courier_matcher, courier_service

router = APIRouter(prefix="/courier", tags=["courier"])


XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


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


# ── XLSX exports ─────────────────────────────────────────────────────────────


def _safe_filename(s: str, fallback: str = "manifest") -> str:
    """Sanitize a manifest_no for use in a filename."""
    keep = "".join(c if (c.isalnum() or c in "-_.") else "_" for c in (s or fallback))
    return keep.strip("_") or fallback


@router.get("/manifests/{manifest_id}/worksheet")
def export_worksheet(manifest_id: str):
    """Generate Worksheet v3 XLSX for the manifest. Returns the file inline."""
    manifest = courier_service.get_manifest(manifest_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Manifest not found")
    try:
        data = courier_export.build_worksheet_v3(manifest)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")
    fname = _safe_filename(manifest.get("manifest_no")) + "_v3.xlsx"
    return Response(
        content=data,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/manifests/{manifest_id}/hazmat")
def export_hazmat(manifest_id: str):
    """Generate Courier Data Form Hazmat XLSX for the manifest."""
    manifest = courier_service.get_manifest(manifest_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Manifest not found")
    try:
        data = courier_export.build_hazmat(manifest)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")
    fname = _safe_filename(manifest.get("manifest_no")) + "_hazmat.xlsx"
    return Response(
        content=data,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
