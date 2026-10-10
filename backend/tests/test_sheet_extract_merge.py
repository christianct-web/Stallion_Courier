"""Extraction into an existing sheet must not clobber what is already there.

A job is opened with a clerk-entered reference, and can take several
documents (invoice, then bill of lading). Each upload writes only the header
fields that document yielded.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import sheets as sheets_routes
from app.services import sheet_service


def _client(monkeypatch, parsed_docs):
    queue = list(parsed_docs)

    async def fake_extract(files):
        return queue.pop(0)

    monkeypatch.setattr(sheets_routes, "_extract_with_claude", fake_extract)
    app = FastAPI()
    app.include_router(sheets_routes.router)
    return TestClient(app)


def _upload(client, sheet_id):
    return client.post(
        f"/sheets/{sheet_id}/extract",
        files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
    )


def test_clerk_reference_survives_extraction(monkeypatch):
    sheet = sheet_service.create_sheet({"reference": "JOB-2026-0412"})
    client = _client(monkeypatch, [{"invoiceNumber": "INV-881", "consigneeName": "Acme Ltd"}])

    r = _upload(client, sheet["id"])

    assert r.status_code == 200
    out = r.json()["sheet"]
    assert out["reference"] == "JOB-2026-0412"
    assert out["invoice_no"] == "INV-881"


def test_invoice_number_fills_blank_reference(monkeypatch):
    sheet = sheet_service.create_sheet({})
    client = _client(monkeypatch, [{"invoiceNumber": "INV-881"}])

    out = _upload(client, sheet["id"]).json()["sheet"]

    assert out["reference"] == "INV-881"


def test_second_document_does_not_blank_earlier_fields(monkeypatch):
    sheet = sheet_service.create_sheet({"reference": "JOB-1"})
    client = _client(monkeypatch, [
        {"invoiceNumber": "INV-881", "consigneeName": "Acme Ltd", "freightCharges": 120},
        {"blAwbNumber": "MSCU1234567", "vesselOrFlight": "MSC ANNA"},
    ])

    _upload(client, sheet["id"])
    out = _upload(client, sheet["id"]).json()["sheet"]

    assert out["invoice_no"] == "INV-881"
    assert out["consignee"] == "Acme Ltd"
    assert out["freight_usd"] == 120
    assert out["bl_number"] == "MSCU1234567"
    assert out["vessel"] == "MSC ANNA"


def test_extracted_zero_freight_is_written(monkeypatch):
    sheet = sheet_service.create_sheet({"freight_usd": 55})
    client = _client(monkeypatch, [{"freightCharges": 0}])

    out = _upload(client, sheet["id"]).json()["sheet"]

    assert out["freight_usd"] == 0
