"""
Stallion Client Directory routes.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from ..store_clients import load_clients, save_clients

import uuid

router = APIRouter(tags=["clients"])


@router.get("/clients")
def clients_list():
    return {"items": load_clients()}


@router.post("/clients")
def clients_create(req: Dict[str, Any]):
    name = (req.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    items = load_clients()
    code = (req.get("consigneeCode") or "").strip().upper()
    if code and any(c.get("consigneeCode", "").upper() == code for c in items):
        raise HTTPException(status_code=409, detail=f"Client with consigneeCode '{code}' already exists")
    client = {
        "id": str(uuid.uuid4()),
        "name": name,
        "consigneeCode": code,
        "tin": (req.get("tin") or "").strip(),
        "address": (req.get("address") or "").strip(),
        "contactName": (req.get("contactName") or "").strip(),
        "contactEmail": (req.get("contactEmail") or "").strip(),
        "contactPhone": (req.get("contactPhone") or "").strip(),
        "defaultBrokerageFee": float(req.get("defaultBrokerageFee") or 0),
        "notes": (req.get("notes") or "").strip(),
        "createdAt": datetime.utcnow().isoformat() + "Z",
    }
    items.append(client)
    save_clients(items)
    return client


@router.get("/clients/{client_id}")
def clients_get(client_id: str):
    items = load_clients()
    row = next((c for c in items if c.get("id") == client_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    return row


@router.patch("/clients/{client_id}")
def clients_update(client_id: str, req: Dict[str, Any]):
    items = load_clients()
    idx = next((i for i, c in enumerate(items) if c.get("id") == client_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Client not found")
    allowed = {"name","consigneeCode","tin","address","contactName","contactEmail","contactPhone","defaultBrokerageFee","notes"}
    patch = {k: v for k, v in req.items() if k in allowed}
    if "consigneeCode" in patch:
        patch["consigneeCode"] = patch["consigneeCode"].strip().upper()
    items[idx] = {**items[idx], **patch}
    save_clients(items)
    return items[idx]


@router.delete("/clients/{client_id}")
def clients_delete(client_id: str):
    items = load_clients()
    new_items = [c for c in items if c.get("id") != client_id]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="Client not found")
    save_clients(new_items)
    return {"ok": True, "id": client_id}
