"""Regression tests for the 2026-07 remediation pass (see FIXSPEC.md)."""
from __future__ import annotations

import os
import uuid

import pytest
from fastapi.testclient import TestClient


# ─── F1/F3: production fail-closed guards ─────────────────────────────────────

def test_production_without_key_refuses_to_start(monkeypatch):
    from app.middleware_auth import assert_production_security
    monkeypatch.setenv("STALLION_ENV", "production")
    monkeypatch.delenv("STALLION_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="STALLION_API_KEY"):
        assert_production_security()


def test_production_with_wildcard_cors_refuses_to_start(monkeypatch):
    from app.middleware_auth import assert_production_security
    monkeypatch.setenv("STALLION_ENV", "production")
    monkeypatch.setenv("STALLION_API_KEY", "x" * 32)
    monkeypatch.setenv("STALLION_CORS_ORIGINS", "*")
    with pytest.raises(RuntimeError, match="CORS"):
        assert_production_security()


def test_production_with_key_and_origins_starts(monkeypatch):
    from app.middleware_auth import assert_production_security
    monkeypatch.setenv("STALLION_ENV", "production")
    monkeypatch.setenv("STALLION_API_KEY", "x" * 32)
    monkeypatch.setenv("STALLION_CORS_ORIGINS", "https://stallion.netlify.app")
    assert_production_security()  # no raise


def test_dev_without_key_is_fine(monkeypatch):
    from app.middleware_auth import assert_production_security
    monkeypatch.delenv("STALLION_ENV", raising=False)
    monkeypatch.delenv("STALLION_API_KEY", raising=False)
    assert_production_security()  # no raise


# ─── F1: middleware enforcement + query-param download path ───────────────────

def _client_with_key(key: str) -> TestClient:
    from fastapi import FastAPI
    from app.middleware_auth import ApiKeyMiddleware

    app = FastAPI()

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.get("/declarations")
    def decls():
        return {"items": []}

    @app.get("/pack/file/abc123")
    def pack_file():
        return {"file": True}

    app.add_middleware(ApiKeyMiddleware, api_key=key)
    return TestClient(app)


def test_missing_key_rejected():
    c = _client_with_key("secret-key-123")
    assert c.get("/declarations").status_code == 401
    assert c.get("/health").status_code == 200  # health stays public


def test_correct_header_accepted():
    c = _client_with_key("secret-key-123")
    r = c.get("/declarations", headers={"X-API-Key": "secret-key-123"})
    assert r.status_code == 200


def test_download_accepts_query_param_key():
    c = _client_with_key("secret-key-123")
    assert c.get("/pack/file/abc123").status_code == 401
    assert c.get("/pack/file/abc123?api_key=secret-key-123").status_code == 200
    # but query param is NOT accepted on non-download paths
    assert c.get("/declarations?api_key=secret-key-123").status_code == 401


# ─── F5: zero is a value, not a gap ───────────────────────────────────────────

def test_explicit_zero_duty_is_honoured():
    from app.services.worksheet_service import calculate_from_dict
    ws = {
        "invoice_value_foreign": 1000, "exchange_rate": 6.8,
        "duty_rate_pct": 20, "vat_rate_pct": 12.5,
        "duty": 0,  # broker deliberately zero-rates (e.g. concession)
    }
    out = calculate_from_dict(ws)
    assert out["duty"] == 0.0


def test_missing_duty_still_computed():
    from app.services.worksheet_service import calculate_from_dict
    ws = {
        "invoice_value_foreign": 1000, "exchange_rate": 6.8,
        "duty_rate_pct": 20, "vat_rate_pct": 12.5,
    }
    out = calculate_from_dict(ws)
    assert out["duty"] == pytest.approx(1000 * 6.8 * 0.20, rel=1e-6)


def test_explicit_zero_customs_user_fee_is_honoured():
    from app.services.worksheet_service import calculate_from_dict
    out = calculate_from_dict({"invoice_value_foreign": 100, "customs_user_fee": 0})
    assert out["cfu"] == 0.0


def test_absent_customs_user_fee_defaults_to_80():
    from app.services.worksheet_service import calculate_from_dict
    out = calculate_from_dict({"invoice_value_foreign": 100})
    assert out["cfu"] == 80.0


# ─── F6: preflight blocks missing regulatory data ─────────────────────────────

def _base_item(**over):
    d = {
        "hsCode": "870321", "description": "Motor car", "itemValue": 5000,
        "qty": 1, "grossKg": 1200, "netKg": 1100,
        "countryOfOrigin": "JP", "cpc": "4000",
    }
    d.update(over)
    return d


def _base_header(**over):
    d = {
        "declarationRef": "TEST-001", "port": "POS", "term": "CIF",
        "modeOfTransport": "1", "customsRegime": "C4",
        "consignorName": "Acme Exports", "consigneeCode": "C12345",
        "invoiceNumber": "INV-1", "invoiceDate": "2026-07-01",
        "exportCountryCode": "US",
    }
    d.update(over)
    return d


def test_preflight_blocks_missing_origin_and_cpc():
    from app.services.pack_service import preflight_workbench
    res = preflight_workbench(
        _base_header(), {}, [_base_item(countryOfOrigin="", cpc="")], []
    )
    paths = [e["path"] for e in res["errors"]]
    assert "items[0].countryOfOrigin" in paths
    assert "items[0].cpc" in paths


def test_preflight_blocks_missing_export_country():
    from app.services.pack_service import preflight_workbench
    res = preflight_workbench(_base_header(exportCountryCode=""), {}, [_base_item()], [])
    assert any(e["path"] == "header.exportCountryCode" for e in res["errors"])


def test_preflight_passes_with_explicit_values():
    from app.services.pack_service import preflight_workbench
    res = preflight_workbench(_base_header(), {}, [_base_item()], [])
    assert not [e for e in res["errors"] if "countryOfOrigin" in e["path"] or "cpc" in e["path"]]


# ─── F8: worksheet PDF contains ALL items ─────────────────────────────────────

def test_worksheet_pdf_renders_all_items(tmp_path):
    from app.services import pack_service
    header = _base_header()
    worksheet = {"invoice_value_foreign": 25000, "exchange_rate": 6.8,
                 "duty_rate_pct": 20, "vat_rate_pct": 12.5}
    items = [_base_item(description=f"Line item {i}", itemValue=100 + i) for i in range(37)]
    doc_id, path = pack_service._write_lb01_worksheet_pdf(header, worksheet, items)
    raw = open(path, "rb").read()
    # ReportLab writes each page as an object; count pages via /Type /Page markers
    assert raw.count(b"/Type /Page") >= 3  # 37 items cannot fit on one page
    assert os.path.getsize(path) > 4000


# ─── F9: status lifecycle enforcement ─────────────────────────────────────────

@pytest.fixture()
def app_client(tmp_path, monkeypatch):
    monkeypatch.delenv("STALLION_ENV", raising=False)
    monkeypatch.delenv("STALLION_API_KEY", raising=False)
    monkeypatch.delenv("STALLION_BROKERS", raising=False)
    from app.main import app
    return TestClient(app)


def _mk_decl(client, status="draft"):
    did = f"test-{uuid.uuid4().hex[:8]}"
    r = client.post("/declarations", json={
        "id": did, "status": status,
        "header": _base_header(), "items": [_base_item()],
        "worksheet": {"invoice_value_foreign": 100},
    })
    assert r.status_code == 200, r.text
    return did


def test_draft_cannot_jump_to_receipted(app_client):
    did = _mk_decl(app_client)
    r = app_client.patch(f"/declarations/{did}/review",
                         json={"action": "receipted", "reviewed_by": "Anyone"})
    assert r.status_code == 409
    app_client.delete(f"/declarations/{did}")


def test_lifecycle_happy_path(app_client):
    did = _mk_decl(app_client)
    for action in ("pending_review", "approved", "submitted", "receipted"):
        r = app_client.patch(f"/declarations/{did}/review",
                             json={"action": action, "reviewed_by": "Jason Maule"})
        assert r.status_code == 200, f"{action}: {r.text}"
    # terminal state — nothing further allowed
    r = app_client.patch(f"/declarations/{did}/review",
                         json={"action": "pending_review", "reviewed_by": "Jason Maule"})
    assert r.status_code == 409
    app_client.delete(f"/declarations/{did}")


# ─── F10: review identity hardening ───────────────────────────────────────────

def test_reviewed_at_is_server_stamped(app_client):
    did = _mk_decl(app_client)
    app_client.patch(f"/declarations/{did}/review",
                     json={"action": "pending_review", "reviewed_by": "Crystal Williams",
                           "reviewed_at": "1999-01-01T00:00:00Z"})
    row = app_client.get(f"/declarations/{did}").json()
    assert row["reviewed_at"].startswith("2026")  # client-supplied value ignored
    app_client.delete(f"/declarations/{did}")


def test_unlisted_broker_rejected(app_client, monkeypatch):
    monkeypatch.setenv("STALLION_BROKERS", "Jason Maule,Crystal Williams")
    did = _mk_decl(app_client)
    app_client.patch(f"/declarations/{did}/review",
                     json={"action": "pending_review", "reviewed_by": "Crystal Williams"})
    r = app_client.patch(f"/declarations/{did}/review",
                         json={"action": "approved", "reviewed_by": "Impostor"})
    assert r.status_code == 403
    r = app_client.patch(f"/declarations/{did}/review",
                         json={"action": "approved", "reviewed_by": "Jason Maule"})
    assert r.status_code == 200
    app_client.delete(f"/declarations/{did}")


def test_review_endpoint_ignores_content_patches(app_client):
    did = _mk_decl(app_client)
    app_client.patch(f"/declarations/{did}/review",
                     json={"action": "pending_review", "reviewed_by": "Jason Maule",
                           "items": [{"description": "SMUGGLED EDIT"}]})
    row = app_client.get(f"/declarations/{did}").json()
    assert row["items"][0]["description"] == "Motor car"
    app_client.delete(f"/declarations/{did}")


# ─── F11: approved declarations are immutable ─────────────────────────────────

def _approve(client, did):
    client.patch(f"/declarations/{did}/review",
                 json={"action": "pending_review", "reviewed_by": "Jason Maule"})
    client.patch(f"/declarations/{did}/review",
                 json={"action": "approved", "reviewed_by": "Jason Maule"})


def test_approved_content_edit_rejected_without_revise(app_client):
    did = _mk_decl(app_client)
    _approve(app_client, did)
    r = app_client.post("/declarations", json={
        "id": did, "items": [_base_item(description="Changed after approval")],
    })
    assert r.status_code == 409
    app_client.delete(f"/declarations/{did}")


def test_revise_resets_status_and_clears_approval(app_client):
    did = _mk_decl(app_client)
    _approve(app_client, did)
    r = app_client.post("/declarations", json={
        "id": did, "revise": True,
        "items": [_base_item(description="Legitimate revision")],
    })
    assert r.status_code == 200
    row = app_client.get(f"/declarations/{did}").json()
    assert row["status"] == "draft"
    assert not row.get("reviewed_by")
    assert row.get("revised_at")
    app_client.delete(f"/declarations/{did}")


def test_create_with_privileged_status_is_clamped_to_draft(app_client):
    # A brand-new record must not be creatable directly as approved/submitted —
    # that would skip the review lifecycle and pass the approved-only pack gate.
    for smuggled in ("approved", "submitted", "receipted", "APPROVED"):
        did = f"test-{uuid.uuid4().hex[:8]}"
        r = app_client.post("/declarations", json={
            "id": did, "status": smuggled,
            "header": _base_header(), "items": [_base_item()],
        })
        assert r.status_code == 200, r.text
        row = app_client.get(f"/declarations/{did}").json()
        assert row["status"] == "draft", f"created with '{smuggled}' → {row['status']}"
        app_client.delete(f"/declarations/{did}")


def test_create_with_pending_review_is_preserved(app_client):
    # The workbench legitimately creates records straight into the broker queue.
    did = f"test-{uuid.uuid4().hex[:8]}"
    r = app_client.post("/declarations", json={
        "id": did, "status": "pending_review",
        "header": _base_header(), "items": [_base_item()],
    })
    assert r.status_code == 200, r.text
    assert app_client.get(f"/declarations/{did}").json()["status"] == "pending_review"
    app_client.delete(f"/declarations/{did}")


def test_upsert_cannot_smuggle_status_change(app_client):
    did = _mk_decl(app_client)
    r = app_client.post("/declarations", json={"id": did, "status": "approved"})
    assert r.status_code == 200
    row = app_client.get(f"/declarations/{did}").json()
    assert row["status"] == "draft"  # status changes only via review endpoint
    app_client.delete(f"/declarations/{did}")


# ─── F7: export requires approved ─────────────────────────────────────────────

def test_pending_review_cannot_generate_pack(app_client):
    did = _mk_decl(app_client)
    app_client.patch(f"/declarations/{did}/review",
                     json={"action": "pending_review", "reviewed_by": "Jason Maule"})
    r = app_client.post("/pack/generate", json={"declaration_id": did})
    assert r.status_code == 409
    assert "approved" in r.json()["detail"].lower()
    app_client.delete(f"/declarations/{did}")


def test_pack_generates_from_stored_snapshot_not_request_body(app_client):
    # The approved-status gate certifies the STORED content; body content must
    # be ignored, or a caller could export PDF/XML for data that was never
    # approved by passing an approved id plus modified header/items.
    did = _mk_decl(app_client)
    for action in ("pending_review", "approved"):
        r = app_client.patch(f"/declarations/{did}/review",
                             json={"action": action, "reviewed_by": "Jason Maule"})
        assert r.status_code == 200, r.text

    # Tampered body: items missing origin/cpc would fail preflight if used.
    r = app_client.post("/pack/generate", json={
        "declaration_id": did,
        "header": _base_header(exportCountryCode=""),
        "items": [_base_item(countryOfOrigin="", cpc="", itemValue=999999)],
    })
    assert r.status_code == 200, r.text
    preflight_errors = [e["path"] for e in r.json().get("preflight", {}).get("errors", [])]
    # If the tampered body had been used, these preflight errors would appear.
    assert "items[0].countryOfOrigin" not in preflight_errors
    assert "items[0].cpc" not in preflight_errors
    assert "header.exportCountryCode" not in preflight_errors
    app_client.delete(f"/declarations/{did}")
