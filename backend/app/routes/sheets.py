"""
routes/sheets.py — API surface for the simplified Stallion Sheet.

Mirrors routes/courier.py. Mount in main.py:
    from .routes import sheets
    app.include_router(sheets.router)

Endpoints:
    GET    /sheets                       list
    POST   /sheets                       create (optional seed payload)
    GET    /sheets/{id}                  fetch one
    PATCH  /sheets/{id}                  update header strip
    DELETE /sheets/{id}                  delete
    POST   /sheets/{id}/recompute        force recompute
    POST   /sheets/{id}/lines            add line
    PATCH  /sheets/{id}/lines/{line_no}  edit line (inline grid edit)
    DELETE /sheets/{id}/lines/{line_no}  delete line
    POST   /sheets/{id}/classify         HS lookup from description (reuses tariff_service)
    GET    /sheets/{id}/worksheet        download XLSX/PDF worksheet
    POST   /sheets/{id}/xml              generate C82 SAD XML
    GET    /sheets/reference             all dropdown reference data
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response

from ..services import sheet_service
from ..services import tariff_service
from ..services import declaration_service
from .extract import _extract_with_claude, _fallback_extract
from .reference_data import REFERENCE

router = APIRouter(prefix="/sheets", tags=["sheets"])


# ── reference dropdowns ──────────────────────────────────────────────────────
@router.get("/reference")
def reference():
    return REFERENCE


# ── sheet CRUD ───────────────────────────────────────────────────────────────
@router.get("")
def sheets_list():
    return sheet_service.list_sheets()


@router.post("")
def sheets_create(req: Dict[str, Any] | None = None):
    return sheet_service.create_sheet(req or {})


@router.get("/{sheet_id}")
def sheets_get(sheet_id: str):
    s = sheet_service.get_sheet(sheet_id)
    if not s:
        raise HTTPException(404, "Sheet not found")
    return s


@router.patch("/{sheet_id}")
def sheets_update(sheet_id: str, req: Dict[str, Any]):
    s = sheet_service.update_header(sheet_id, req)
    if not s:
        raise HTTPException(404, "Sheet not found")
    return s


@router.delete("/{sheet_id}")
def sheets_delete(sheet_id: str):
    if not sheet_service.delete_sheet(sheet_id):
        raise HTTPException(404, "Sheet not found")
    return {"ok": True}


@router.post("/{sheet_id}/status")
def sheets_set_status(sheet_id: str, req: Dict[str, Any]):
    new_status = (req or {}).get("status", "")
    if not new_status:
        raise HTTPException(400, "status required")
    try:
        s = sheet_service.set_status(
            sheet_id, new_status,
            actor=req.get("actor", "broker"),
            notes=req.get("notes", ""),
            receipt_number=req.get("receipt_number", ""),
        )
    except ValueError as e:
        raise HTTPException(409, str(e))
    if not s:
        raise HTTPException(404, "Sheet not found")
    return s


@router.post("/{sheet_id}/recompute")
def sheets_recompute(sheet_id: str):
    s = sheet_service.get_sheet(sheet_id)
    if not s:
        raise HTTPException(404, "Sheet not found")
    sheet_service.recompute(s)
    # persist the recompute
    sheet_service.update_header(sheet_id, {})
    return sheet_service.get_sheet(sheet_id)


# ── line ops ─────────────────────────────────────────────────────────────────
@router.post("/{sheet_id}/lines")
def lines_add(sheet_id: str, req: Dict[str, Any] | None = None):
    s = sheet_service.add_line(sheet_id, req or {})
    if not s:
        raise HTTPException(404, "Sheet not found")
    return s


@router.patch("/{sheet_id}/lines/{line_no}")
def lines_update(sheet_id: str, line_no: int, req: Dict[str, Any]):
    s = sheet_service.update_line(sheet_id, line_no, req)
    if not s:
        raise HTTPException(404, "Sheet or line not found")
    return s


@router.delete("/{sheet_id}/lines/{line_no}")
def lines_delete(sheet_id: str, line_no: int):
    s = sheet_service.delete_line(sheet_id, line_no)
    if not s:
        raise HTTPException(404, "Sheet or line not found")
    return s


# ── HS classify (reuses the local 5,810-code tariff DB) ──────────────────────
@router.post("/{sheet_id}/classify")
def classify(sheet_id: str, req: Dict[str, Any]):
    desc = (req.get("description") or "").strip()
    if not desc:
        raise HTTPException(400, "description required")
    # tariff_service exposes a description search; returns ranked HS matches
    if hasattr(tariff_service, "search"):
        results = tariff_service.search(desc, limit=8)
    elif hasattr(tariff_service, "lookup_description"):
        results = tariff_service.lookup_description(desc)  # type: ignore
    elif hasattr(tariff_service, "search_local"):
        results = tariff_service.search_local(desc, limit=8)  # type: ignore
    else:
        results = []
    return {"suggestions": results}


@router.post("/{sheet_id}/extract")
async def extract_to_sheet(sheet_id: str, file: UploadFile = File(...)):
    s = sheet_service.get_sheet(sheet_id)
    if not s:
        raise HTTPException(404, "Sheet not found")

    try:
        parsed = await _extract_with_claude([file])
    except Exception:
        parsed = _fallback_extract(file)

    line_items = parsed.get("lineItems") or []
    if line_items:
        for li in line_items:
            payload = {
                "description": li.get("description") or "",
                "hs_code": li.get("hsCode") or "",
                "exworks_usd": li.get("lineTotal") or li.get("unitPrice") or 0,
                "country_of_origin": li.get("countryOfOrigin") or parsed.get("countryOfOrigin") or "TT",
            }
            if li.get("quantity") not in (None, ""):
                payload["supplementary_qty"] = li.get("quantity")
            sheet_service.add_line(sheet_id, payload)
    else:
        sheet_service.add_line(sheet_id, {
            "description": parsed.get("description", ""),
            "hs_code": parsed.get("hsCode", ""),
            "exworks_usd": parsed.get("invoiceValueForeign", 0),
            "country_of_origin": parsed.get("countryOfOrigin", "TT"),
        })

    patch = {
        "consignee": parsed.get("consigneeName", ""),
        "consignor": parsed.get("consignorName", ""),
        "vessel": parsed.get("vesselOrFlight", ""),
        "bl_number": parsed.get("blAwbNumber", ""),
        "arrival_date": parsed.get("shippedOnBoardDate", ""),
        "rotation_no": parsed.get("rotationNumber", ""),
        "invoice_no": parsed.get("invoiceNumber", ""),
        "invoice_date": parsed.get("invoiceDate", ""),
        "currency": parsed.get("currency", "USD"),
        "freight_usd": parsed.get("freightCharges") or 0,
        "reference": parsed.get("invoiceNumber") or s.get("reference") or "",
    }
    sheet_service.update_header(sheet_id, patch)
    return sheet_service.get_sheet(sheet_id)


# ── worksheet download ───────────────────────────────────────────────────────
@router.get("/{sheet_id}/worksheet")
def worksheet(sheet_id: str, fmt: str = "xlsx"):
    s = sheet_service.get_sheet(sheet_id)
    if not s:
        raise HTTPException(404, "Sheet not found")
    from ..services import sheet_worksheet  # new generator (see file)
    data, filename, media = sheet_worksheet.build(s, fmt=fmt)
    return Response(content=data, media_type=media, headers={
        "Content-Disposition": f'attachment; filename="{filename}"'
    })


# ── C84 concession document download ─────────────────────────────────────────
@router.get("/{sheet_id}/c84")
def c84_document(sheet_id: str):
    s = sheet_service.get_sheet(sheet_id)
    if not s:
        raise HTTPException(404, "Sheet not found")
    from ..services import c84_document
    data, filename, media = c84_document.build(s)
    return Response(content=data, media_type=media, headers={
        "Content-Disposition": f'attachment; filename="{filename}"'
    })


# ── C82 XML generation ───────────────────────────────────────────────────────
@router.get("/{sheet_id}/warnings")
def xml_warnings(sheet_id: str):
    s = sheet_service.get_sheet(sheet_id)
    if not s:
        raise HTTPException(404, "Sheet not found")
    return {"warnings": sheet_service.preflight_warnings(s)}


@router.post("/{sheet_id}/xml")
def generate_xml(sheet_id: str, req: Dict[str, Any] | None = None):
    s = sheet_service.get_sheet(sheet_id)
    if not s:
        raise HTTPException(404, "Sheet not found")
    # the generate modal may pass last-minute declaration-level fields
    if req:
        s = sheet_service.update_header(sheet_id, req) or s

    inputs = sheet_service.to_decl_inputs(s)
    decl = declaration_service.build_complete_declaration(
        inputs["header"], inputs["worksheet"], inputs["items"], inputs["containers"]
    )
    report = declaration_service.validate_decl(decl)
    if report.get("status") != "pass":
        raise HTTPException(422, {"message": "Preflight failed", "report": report})

    xml_bytes = declaration_service.export_xml(decl)
    ref = (s.get("reference") or sheet_id).replace("/", "-")
    return Response(content=xml_bytes, media_type="application/xml", headers={
        "Content-Disposition": f'attachment; filename="C82_{ref}.xml"'
    })
