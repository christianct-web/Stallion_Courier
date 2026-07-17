"""
Stallion Declarations CRUD, review workflow, register CSV, and activity log.
"""
from __future__ import annotations

import csv
import io
import os
import uuid
from datetime import datetime, timezone
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

# F9: enforced status lifecycle. Key = current status, value = allowed next.
# Anything not listed (including unknown/blank statuses) may only move to
# pending_review — i.e. everything funnels through broker review.
STATUS_TRANSITIONS: Dict[str, set] = {
    "draft":            {"pending_review"},
    "needs_correction": {"pending_review"},
    "rejected":         {"pending_review"},
    "pending_review":   {"approved", "needs_correction", "rejected"},
    "approved":         {"submitted", "needs_correction"},
    "submitted":        {"receipted", "needs_correction"},
    "receipted":        set(),  # terminal
}

# F11: once a declaration reaches these states, its content is locked.
LOCKED_STATUSES = {"approved", "submitted", "receipted"}
CONTENT_FIELDS = {"header", "worksheet", "items", "containers", "declaration_type", "client_id"}


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
        # New records may only be created in a pre-review state. A client
        # sending status=approved/submitted/receipted would otherwise mint a
        # declaration that skips the review lifecycle (and passes the
        # approved-only pack gate) — clamp anything privileged to draft.
        requested_status = str(req.get("status") or "").strip().lower()
        req["status"] = requested_status if requested_status in {"draft", "pending_review"} else "draft"
        req.pop("revise", None)
        items.append(req)
    else:
        existing = items[found]
        current_status = str(existing.get("status", "")).lower()
        wants_revise = bool(req.pop("revise", False))
        touches_content = any(
            k in req and req[k] != existing.get(k) for k in CONTENT_FIELDS
        )

        # F11: approved/submitted/receipted declarations are immutable.
        # A material edit requires revise=true, which invalidates the approval
        # and returns the record to draft for a fresh review cycle.
        if current_status in LOCKED_STATUSES and touches_content:
            if not wants_revise:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Declaration is {current_status} and its content is locked. "
                        "Send revise=true to edit — this will reset status to draft "
                        "and clear the existing approval."
                    ),
                )
            req = {
                **req,
                "status": "draft",
                "reviewed_by": None,
                "reviewed_at": None,
                "revised_at": datetime.now(timezone.utc).isoformat(),
                "revision_note": f"Content edited after status '{current_status}'; approval invalidated.",
            }
        else:
            # Status changes must go through the review endpoint, not upsert.
            req.pop("status", None)

        items[found] = {**existing, **req}
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

    # F9: enforce the status lifecycle — no created→receipted jumps.
    current = str(items[idx].get("status", "") or "draft").lower()
    allowed = STATUS_TRANSITIONS.get(current, {"pending_review"})
    if action != current and action not in allowed:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Invalid status transition '{current}' → '{action}'. "
                f"Allowed from '{current}': {sorted(allowed) or ['(terminal)']}"
            ),
        )

    # F10 (interim until real user auth):
    #   - reviewed_at is ALWAYS stamped server-side; client values ignored.
    #   - reviewed_by must match STALLION_BROKERS (comma-separated) when set.
    reviewed_by = str(req.get("reviewed_by") or "").strip()
    allowed_brokers = [
        b.strip() for b in os.environ.get("STALLION_BROKERS", "").split(",") if b.strip()
    ]
    if action in {"approved", "rejected", "needs_correction", "submitted", "receipted"}:
        if not reviewed_by:
            raise HTTPException(status_code=400, detail="reviewed_by is required for this action")
        if allowed_brokers and reviewed_by not in allowed_brokers:
            raise HTTPException(
                status_code=403,
                detail="reviewed_by is not an authorised broker for this deployment",
            )

    patch: Dict[str, Any] = {
        "status":       action,
        "review_notes": req.get("review_notes", items[idx].get("review_notes", "")),
        "reviewed_by":  reviewed_by or items[idx].get("reviewed_by"),
        "reviewed_at":  datetime.now(timezone.utc).isoformat(),
    }

    if action == "receipted" and req.get("receipt_number"):
        patch["receipt_number"] = req["receipt_number"]

    # F10/F11: the review endpoint no longer accepts content edits
    # (header/worksheet/items/client_id/declaration_type). Reviewing and
    # editing are separate acts; edits go through the upsert endpoint,
    # which invalidates approvals on material change.

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
    # Fold in declaration-sheet events so the new flow shows in the Log too.
    try:
        from ..services import sheet_service
        sheet_evts = sheet_service.sheet_events()
    except Exception:
        sheet_evts = []
    all_events = events + sheet_evts
    all_events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return {"events": all_events[:limit], "total": len(all_events)}
