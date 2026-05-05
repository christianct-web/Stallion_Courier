"""
Stallion Declarations CRUD, review workflow, register CSV, and activity log.
"""
from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..models import DeclarationReq, ExportReq, TemplateIn, TemplateOut, WorksheetInput
from ..services.declaration_service import export_xml, validate_decl
from ..services.worksheet_service import calculate_worksheet
from ..store import LOOKUPS, load_templates, save_templates, load_declarations, save_declarations

router = APIRouter(tags=["declarations"])

# Valid broker review actions
REVIEW_ACTIONS = {
    "approved", "needs_correction", "rejected",
    "pending_review", "submitted", "receipted",
}


# ─── Templates ────────────────────────────────────────────────────────────────
@router.get("/templates", response_model=list[TemplateOut])
def templates_list():
    return load_templates()


@router.post("/templates", response_model=TemplateOut)
def templates_create(req: TemplateIn):
    items = load_templates()
    row = {"id": str(uuid.uuid4()), **req.model_dump()}
    items.append(row)
    save_templates(items)
    return row


# ─── Worksheet ────────────────────────────────────────────────────────────────
@router.post("/worksheet/calculate")
def worksheet_calculate(req: WorksheetInput):
    return calculate_worksheet(req)


# ─── Old-style validate / export endpoints (DeclarationEditor compat) ─────────
@router.post("/declarations/validate")
def declarations_validate(req: DeclarationReq):
    return validate_decl(req.declaration)


@router.post("/declarations/export-xml")
def declarations_export_xml(req: ExportReq):
    report = validate_decl(req.declaration)
    if report["status"] != "pass":
        return {"validation": report, "xml": None}
    return {"validation": report, "xml": export_xml(req.declaration)}


# ─── Register CSV export ──────────────────────────────────────────────────────
@router.get("/declarations/register-csv")
def declarations_register_csv(month: Optional[str] = None):
    items = load_declarations()

    if month:
        def in_month(d: dict) -> bool:
            ts = d.get("updated_at") or d.get("created_at") or ""
            return ts.startswith(month)
        items = [x for x in items if in_month(x)]

    fieldnames = [
        "declaration_id", "reference_number",
        "consignee_name", "consignee_code",
        "hs_code", "cif_value_ttd",
        "invoice_date", "reviewed_by", "reviewed_at",
        "status", "receipt_number", "updated_at",
    ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    for d in items:
        h   = d.get("header") or {}
        ws  = d.get("worksheet") or {}
        itm = (d.get("items") or [{}])[0]
        writer.writerow({
            "declaration_id":  d.get("id", ""),
            "reference_number": d.get("reference_number") or h.get("declarationRef", ""),
            "consignee_name":  h.get("consigneeName") or h.get("consignee_name", ""),
            "consignee_code":  h.get("consigneeCode") or h.get("consignee_code", ""),
            "hs_code":         itm.get("hsCode") or itm.get("tarification_hscode_commodity_code", ""),
            "cif_value_ttd":   ws.get("cif_local", ""),
            "invoice_date":    h.get("invoiceDate") or h.get("invoice_date", ""),
            "reviewed_by":     d.get("reviewed_by", ""),
            "reviewed_at":     d.get("reviewed_at", ""),
            "status":          d.get("status", ""),
            "receipt_number":  d.get("receipt_number", ""),
            "updated_at":      d.get("updated_at", ""),
        })

    output.seek(0)
    filename = f"stallion-register-{month or 'all'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Declarations CRUD ────────────────────────────────────────────────────────
@router.get("/declarations")
def declarations_list(status: Optional[str] = None):
    items = load_declarations()
    if status:
        items = [x for x in items if str(x.get("status", "")).lower() == status.lower()]
    return {"items": items}


@router.get("/declarations/{declaration_id}")
def declarations_get(declaration_id: str):
    items = load_declarations()
    row = next((r for r in items if str(r.get("id")) == declaration_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Declaration not found")
    return row


@router.post("/declarations")
def declarations_upsert(req: Dict[str, Any]):
    items = load_declarations()
    row_id = str(req.get("id") or "").strip()
    if not row_id:
        raise HTTPException(status_code=400, detail="id is required")

    found = next((i for i, r in enumerate(items) if str(r.get("id")) == row_id), None)
    if found is None:
        items.append(req)
    else:
        items[found] = {**items[found], **req}
    save_declarations(items)
    return {"ok": True, "id": row_id}


@router.delete("/declarations/{declaration_id}")
def declarations_delete(declaration_id: str):
    items = load_declarations()
    new_items = [r for r in items if str(r.get("id")) != declaration_id]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="Declaration not found")
    save_declarations(new_items)
    return {"ok": True, "id": declaration_id}


# ─── Review / status transition ───────────────────────────────────────────────
@router.patch("/declarations/{declaration_id}/review")
def declarations_review(declaration_id: str, req: Dict[str, Any]):
    items = load_declarations()
    idx = next((i for i, r in enumerate(items) if str(r.get("id")) == declaration_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Declaration not found")

    action = str(req.get("action") or "").lower()
    if action not in REVIEW_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action '{action}'. Allowed: {sorted(REVIEW_ACTIONS)}",
        )

    patch: Dict[str, Any] = {
        "status":       action,
        "review_notes": req.get("review_notes", items[idx].get("review_notes", "")),
        "reviewed_by":  req.get("reviewed_by",  items[idx].get("reviewed_by")),
        "reviewed_at":  req.get("reviewed_at",  items[idx].get("reviewed_at")),
    }

    if action == "receipted" and req.get("receipt_number"):
        patch["receipt_number"] = req["receipt_number"]

    if req.get("client_id") is not None:
        patch["client_id"] = req["client_id"]
    if req.get("declaration_type"):
        patch["declaration_type"] = req["declaration_type"]

    if "header" in req:
        patch["header"] = req["header"]
    if "worksheet" in req:
        patch["worksheet"] = req["worksheet"]
    if "items" in req:
        patch["items"] = req["items"]

    items[idx] = {**items[idx], **patch}
    save_declarations(items)
    return {"ok": True, "id": declaration_id, "status": action}


# ─── Activity log ──────────────────────────────────────────────────────────────
@router.get("/log")
def activity_log(limit: int = 200):
    items = load_declarations()
    events = []

    EVENT_ORDER = ["receipted", "submitted", "approved", "needs_correction", "rejected"]

    for d in items:
        ref = d.get("reference_number") or (d.get("id") or "")[:12] or "—"
        consignee = (d.get("header") or {}).get("consigneeName", "")
        src = (d.get("source") or {}).get("type", "MANUAL")
        dec_id = d.get("id", "")

        created_at = d.get("created_at") or d.get("updated_at", "")
        if created_at:
            events.append({
                "event": "extracted" if src == "EXTRACT" else "created",
                "declaration_id": dec_id,
                "reference": ref,
                "consignee": consignee,
                "source": src,
                "confidence": d.get("confidence"),
                "timestamp": created_at,
                "actor": "AI extraction" if src == "EXTRACT" else "ops",
                "notes": "",
            })

        reviewed_at = d.get("reviewed_at") or ""
        status = d.get("status", "")
        if reviewed_at and status in EVENT_ORDER:
            notes = d.get("review_notes") or ""
            if status == "receipted" and d.get("receipt_number"):
                notes = f"Receipt #{d['receipt_number']}"
            events.append({
                "event": status,
                "declaration_id": dec_id,
                "reference": ref,
                "consignee": consignee,
                "source": src,
                "confidence": None,
                "timestamp": reviewed_at,
                "actor": d.get("reviewed_by") or "broker",
                "notes": notes,
            })

    events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return {"events": events[:limit], "total": len(events)}
