"""
Stallion Courier Module routes.

Endpoints for TTPOST express consignment manifests, lines, officer
examination, THN classification, and worksheet/hazmat exports.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import Response

from ..services import (
    courier_duty,
    courier_export,
    courier_matcher,
    courier_service,
    courier_template_parser,
)

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


@router.post("/manifests/from-template")
async def manifests_from_template(
    file: UploadFile = File(...),
    arrival_date: str = Form(...),
    exch_rate: float = Form(...),
):
    """
    Upload a TTPOST express-consignment Excel and create a manifest from it.

    The file is parsed for header info (master waybill, cargo reporter, VAT no.)
    and line items (HAWB, shipper, importer, description, packages, weight, cost).
    Each line is auto-classified with the matcher; suggestions and confidence
    are stored on the line so the UI can color-code and offer alternatives.

    Returns the full created manifest including any parser warnings.
    """
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read upload: {e}")

    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        parsed = courier_template_parser.parse_ttpost_template(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    manifest_no = parsed["manifest_no"]
    if not manifest_no:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not detect master waybill number in the uploaded file. "
                "Make sure the file is a TTPOST Express Consignments Worksheet "
                "with 'MASTER WAY BILL NUMBER: 106-XXXXXX' in the header."
            ),
        )

    existing = courier_service.list_manifests()
    if any(m.get("manifest_no") == manifest_no for m in existing):
        raise HTTPException(
            status_code=409,
            detail=f"Manifest {manifest_no} already exists. Delete it first or rename.",
        )

    try:
        manifest = courier_service.create_manifest({
            "manifest_no": manifest_no,
            "arrival_date": arrival_date,
            "exch_rate": exch_rate,
            "cargo_reporter": parsed["cargo_reporter"] or "TTPOST",
            "notes": f"Imported from {file.filename} ({len(parsed['lines'])} lines)",
        })
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    added = 0
    skipped: list[str] = []
    for line_data in parsed["lines"]:
        try:
            courier_service.add_line_with_auto_thn(manifest["id"], {
                "hawb": line_data["hawb"],
                "shipper": line_data["shipper"],
                "importer": line_data["importer"],
                "description": line_data["description"],
                "thn": line_data.get("thn", ""),
                "packages": line_data["packages"],
                "weight_kg": line_data["weight_kg"],
                "cost_usd": line_data["cost_usd"],
                "freight_usd": line_data["freight_usd"],
            })
            added += 1
        except Exception as e:
            skipped.append(f"row {line_data.get('source_row', '?')}: {e}")

    fresh = courier_service.get_manifest(manifest["id"])
    return {
        "manifest": fresh,
        "summary": {
            "manifest_no": manifest_no,
            "lines_in_file": len(parsed["lines"]),
            "lines_imported": added,
            "lines_skipped": len(skipped),
            "skipped_details": skipped,
            "warnings": parsed["warnings"],
        },
    }


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


@router.post("/manifests/{manifest_id}/recompute")
def manifests_recompute(manifest_id: str):
    """
    Recompute every line in the manifest against the current tariff/rules.
    Use after editing a tariff entry so duty / OPT / VAT pick up the new rate
    without requiring per-line patches.
    """
    m = courier_service.recompute_manifest(manifest_id)
    if not m:
        raise HTTPException(status_code=404, detail="Manifest not found")
    return m


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
    """
    Generate Courier Data Form Hazmat XLSX for the manifest.

    GET variant kept for backwards compatibility — produces a hazmat
    worksheet with the courier-data fields empty. To pre-fill the fields
    (Date, NTDE No, CED Receipt No, VAT No, Carrier, Date of Arrival,
    Rot No, package counts, etc.), use the POST endpoint below.
    """
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


@router.post("/manifests/{manifest_id}/hazmat")
def export_hazmat_with_form(manifest_id: str, fields: Dict[str, Any]):
    """
    Generate Courier Data Form Hazmat XLSX with custom courier-data fields.

    Body shape (all fields optional — missing ones render blank):
      {
        "date": "15.05.2026",
        "ntde_no": "...",
        "ced_receipt_no": "...",
        "vat_no": "V123990",
        "carrier": "...",
        "date_of_arrival": "...",
        "rot_no": "...",
        "no_of_skids": 0,
        "no_of_boxes": 0,
        "no_of_bags": 0,
        "no_of_commercial_pcs": 0,
        "no_of_non_commercial_pcs": 0,
        "total_no_of_pkgs": 19,
        "no_of_pkgs_detained": 0,
        "no_of_pkgs_seized": 0,
        "no_of_pkgs_bonded": 0
      }

    All fields are optional — the broker can download with any combination
    of fields filled in (the form modal in the UI doesn't require any of
    them to be populated).
    """
    manifest = courier_service.get_manifest(manifest_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Manifest not found")
    try:
        data = courier_export.build_hazmat(manifest, courier_data_fields=fields or {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")
    fname = _safe_filename(manifest.get("manifest_no")) + "_hazmat.xlsx"
    return Response(
        content=data,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
