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


# ── provenance ───────────────────────────────────────────────────────────────

def test_extracted_header_fields_record_their_document(monkeypatch):
    sheet = sheet_service.create_sheet({"reference": "JOB-1"})
    client = _client(monkeypatch, [{"invoiceNumber": "INV-881", "consigneeName": "Acme Ltd"}])

    out = _upload(client, sheet["id"]).json()["sheet"]

    src = out["field_sources"]
    assert src["invoice_no"]["source"] == "extracted"
    assert src["invoice_no"]["doc"] == "doc.pdf"
    assert src["consignee"]["source"] == "extracted"
    # The clerk's reference was not touched by the document.
    assert "reference" not in src
    # Fields the document did not carry stay unattributed.
    assert "vessel" not in src


def test_line_fallbacks_are_not_marked_extracted(monkeypatch):
    sheet = sheet_service.create_sheet({})
    client = _client(monkeypatch, [{"lineItems": [{"description": "Epoxy paint", "lineTotal": 100}]}])

    out = _upload(client, sheet["id"]).json()["sheet"]

    line_src = out["lines"][0]["field_sources"]
    assert line_src["description"]["source"] == "extracted"
    assert line_src["exworks_usd"]["source"] == "extracted"
    # The document gave no origin: nothing is filled in for it, and nothing is attributed.
    assert out["lines"][0]["country_of_origin"] == ""
    assert "country_of_origin" not in line_src
    assert "hs_code" not in line_src
    # Extraction never chooses a CPC.
    assert out["lines"][0]["cpc"] == ""
    assert "cpc" not in line_src


def test_hand_edits_are_marked_manual_and_sources_are_server_owned(monkeypatch):
    sheet = sheet_service.create_sheet({})
    sheet_service.add_line(sheet["id"], {})
    client = _client(monkeypatch, [])

    r = client.patch(f"/sheets/{sheet['id']}", json={
        "consignee_tin": "123", "field_sources": {"consignee_tin": {"source": "extracted"}},
    })
    out = r.json()
    assert out["field_sources"]["consignee_tin"]["source"] == "manual"

    out = client.patch(f"/sheets/{sheet['id']}/lines/1", json={"hs_code": "32089000"}).json()
    assert out["lines"][0]["field_sources"]["hs_code"]["source"] == "manual"


# ── CPC and origin are chosen per line, never defaulted ─────────────────────

def test_new_lines_have_no_cpc_or_origin_default():
    sheet = sheet_service.create_sheet({})
    out = sheet_service.add_line(sheet["id"], {})
    line = out["lines"][0]
    assert line["cpc"] == ""
    assert line["country_of_origin"] == ""


def test_presubmission_blocks_on_unchosen_cpc_and_origin(monkeypatch):
    sheet = sheet_service.create_sheet({})
    sheet_service.add_line(sheet["id"], {"hs_code": "32089000"})
    client = _client(monkeypatch, [])

    report = client.get(f"/sheets/{sheet['id']}/presubmission").json()["report"]
    blocking = {i["field"] for i in report["items"] if i["severity"] == "critical" and i["status"] != "ok"}
    assert {"cpc", "country_of_origin"} <= blocking
    assert report["ready"] is False

    client.patch(f"/sheets/{sheet['id']}/lines/1", json={"cpc": "4000", "country_of_origin": "US"})
    report = client.get(f"/sheets/{sheet['id']}/presubmission").json()["report"]
    blocking = {i["field"] for i in report["items"] if i["severity"] == "critical" and i["status"] != "ok"}
    assert not ({"cpc", "country_of_origin"} & blocking)


def test_xml_refuses_until_every_line_has_cpc_and_origin(monkeypatch):
    sheet = sheet_service.create_sheet({})
    sheet_service.add_line(sheet["id"], {"hs_code": "32089000", "country_of_origin": "US"})
    client = _client(monkeypatch, [])

    r = client.post(f"/sheets/{sheet['id']}/xml", json={})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert "Line 1: CPC not chosen" in detail["lines"]


# ── 9898 rollup takes the CPC chosen on its source lines ────────────────────

def test_rolled_9898_line_uses_the_source_lines_cpc():
    sheet = sheet_service.create_sheet({"rollup_9898": True, "entry_mode": "relieved", "lines": [
        {"cpc": "4070", "country_of_origin": "US", "effects_group": "household"},
        {"cpc": "4070", "country_of_origin": "US", "effects_group": "household"},
    ]})
    items = sheet_service.to_decl_inputs(sheet_service.get_sheet(sheet["id"]))["items"]
    assert len(items) == 1
    assert items[0]["cpc"] == "4070"
    assert items[0]["extendedCustomsProcedure"] == 4070


def test_xml_refuses_when_rolled_lines_disagree_on_cpc(monkeypatch):
    sheet = sheet_service.create_sheet({"rollup_9898": True, "entry_mode": "relieved", "lines": [
        {"cpc": "4070", "country_of_origin": "US", "effects_group": "household"},
        {"cpc": "4000", "country_of_origin": "US", "effects_group": "household"},
    ]})
    client = _client(monkeypatch, [])

    r = client.post(f"/sheets/{sheet['id']}/xml", json={})
    assert r.status_code == 422
    assert any("different CPCs" in m for m in r.json()["detail"]["lines"])


def test_dutiable_entries_are_never_rolled_up(monkeypatch):
    # rollup_9898 defaults on, but a dutiable (commercial) entry keeps its lines.
    sheet = sheet_service.create_sheet({"lines": [
        {"cpc": "4000", "country_of_origin": "US", "hs_code": "32089000"},
        {"cpc": "4000", "country_of_origin": "CN", "hs_code": "38140000"},
    ]})
    stored = sheet_service.get_sheet(sheet["id"])
    assert stored["rollup_9898"] is True and stored["entry_mode"] == "dutiable"

    items = sheet_service.to_decl_inputs(stored)["items"]
    assert [i["hsCode"] for i in items] == ["32089000", "38140000"]
    # Disagreeing CPCs only matter when lines are rolled together.
    assert sheet_service.rollup_cpc_conflicts(stored) == []
