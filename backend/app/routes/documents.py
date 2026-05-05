"""
Stallion Document Generation routes — pack export, costing PDF, brokerage invoice, file serving.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..services.pack_service import generate_pack, resolve_generated_file
from ..services.costing_service import generate_costing_pdf
from ..services.invoice_service import generate_brokerage_invoice
from ..store import load_declarations, save_declarations
from ..store_clients import load_clients
from ..broker_profile import get_broker_profile

router = APIRouter(tags=["documents"])


# ─── Costing / estimate document ──────────────────────────────────────────────

@router.post("/declarations/{declaration_id}/costing")
def costing_generate(declaration_id: str, req: Dict[str, Any]):
    """
    Generate a shareable pre-declaration cost estimate PDF.
    """
    all_decls = load_declarations()
    decl = next((d for d in all_decls if str(d.get("id")) == declaration_id), None)
    if not decl:
        raise HTTPException(status_code=404, detail="Declaration not found")

    header    = req.get("header")    or decl.get("header")    or {}
    worksheet = req.get("worksheet") or decl.get("worksheet") or {}
    items     = req.get("items")     or decl.get("items")     or []

    bp = get_broker_profile()
    doc_id, _ = generate_costing_pdf(
        header        = header,
        worksheet     = worksheet,
        items         = items,
        broker_firm   = req.get("broker_firm",    bp["firm"]),
        broker_address= req.get("broker_address", bp["address"]),
        broker_phone  = req.get("broker_phone",   bp["phone"]),
        notes         = req.get("notes",          ""),
    )
    return {"ok": True, "doc_id": doc_id, "download_url": f"/pack/file/{doc_id}"}


@router.post("/worksheet/costing")
def costing_from_worksheet(req: Dict[str, Any]):
    """
    Generate a costing PDF directly from a worksheet payload —
    no saved declaration needed.
    """
    header    = req.get("header")    or {}
    worksheet = req.get("worksheet") or {}
    items     = req.get("items")     or []

    bp = get_broker_profile()
    doc_id, _ = generate_costing_pdf(
        header        = header,
        worksheet     = worksheet,
        items         = items,
        broker_firm   = req.get("broker_firm",    bp["firm"]),
        broker_address= req.get("broker_address", bp["address"]),
        broker_phone  = req.get("broker_phone",   bp["phone"]),
        notes         = req.get("notes",          ""),
    )
    return {"ok": True, "doc_id": doc_id, "download_url": f"/pack/file/{doc_id}"}


# ─── Brokerage invoice generation ─────────────────────────────────────────────

@router.post("/declarations/{declaration_id}/brokerage-invoice")
def brokerage_invoice_generate(declaration_id: str, req: Dict[str, Any]):
    all_decls = load_declarations()
    decl = next((d for d in all_decls if str(d.get("id")) == declaration_id), None)
    if not decl:
        raise HTTPException(status_code=404, detail="Declaration not found")
    client: Dict[str, Any] = {}
    client_id = req.get("client_id", "")
    if client_id:
        client = next((c for c in load_clients() if c.get("id") == client_id), {})
    else:
        code = (decl.get("header") or {}).get("consigneeCode", "")
        if code:
            client = next((c for c in load_clients() if c.get("consigneeCode","").upper() == code.upper()), {})
    brokerage_fee = float(req.get("brokerage_fee_ttd") or client.get("defaultBrokerageFee") or 0)
    doc_id, _ = generate_brokerage_invoice(
        declaration=decl,
        client=client,
        brokerage_fee_ttd=brokerage_fee,
        invoice_number=str(req.get("invoice_number") or ""),
        notes=str(req.get("notes") or ""),
    )
    inv_rec = {"docId": doc_id, "brokerageFee": brokerage_fee, "generatedAt": datetime.utcnow().isoformat() + "Z"}
    idx = next(i for i, d in enumerate(all_decls) if str(d.get("id")) == declaration_id)
    existing = all_decls[idx].get("brokerage_invoices") or []
    existing.append(inv_rec)
    all_decls[idx] = {**all_decls[idx], "brokerage_invoices": existing}
    save_declarations(all_decls)
    return {"ok": True, "doc_id": doc_id, "download_url": f"/pack/file/{doc_id}"}


# ─── Pack generation ──────────────────────────────────────────────────────────

@router.post("/pack/generate")
def pack_generate(req: Dict[str, Any]):
    declaration_id = req.get("declaration_id")
    all_items = None
    row_idx: int | None = None

    if declaration_id:
        all_items = load_declarations()
        row_idx = next(
            (i for i, r in enumerate(all_items) if str(r.get("id")) == str(declaration_id)),
            None,
        )
        if row_idx is None:
            raise HTTPException(status_code=404, detail="Declaration not found")

        row = all_items[row_idx]
        row_status = str(row.get("status", "")).lower()
        if row_status not in {"approved", "pending_review"}:
            raise HTTPException(
                status_code=409,
                detail=f"Declaration must be approved or pending_review before export (current: {row_status})",
            )

    if declaration_id and all_items is not None and row_idx is not None:
        row = all_items[row_idx]
        req = {
            **req,
            "header": req.get("header") or row.get("header") or {},
            "worksheet": req.get("worksheet") or row.get("worksheet") or {},
            "items": req.get("items") or row.get("items") or [],
            "containers": req.get("containers") or row.get("containers") or [],
        }

    result = generate_pack(req)

    if declaration_id and all_items is not None and row_idx is not None:
        event = {
            "at":       result.get("generatedAt"),
            "status":   result.get("status"),
            "ref":      next(
                (d.get("ref") for d in (result.get("documents") or []) if d.get("ref")),
                None,
            ),
            "preflight": result.get("preflight", {}).get("counts", {}),
        }
        row    = all_items[row_idx]
        events = row.get("export_events") or []
        if not isinstance(events, list):
            events = []
        events.append(event)

        all_items[row_idx] = {
            **row,
            "export_events": events[-10:],
            "last_export":   event,
        }
        save_declarations(all_items)

    return result


@router.get("/pack/file/{doc_id}")
def pack_file(doc_id: str):
    path = resolve_generated_file(doc_id)
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    media_type = "application/pdf" if path.suffix.lower() == ".pdf" else "application/xml"
    return FileResponse(path, media_type=media_type, filename=path.name)
