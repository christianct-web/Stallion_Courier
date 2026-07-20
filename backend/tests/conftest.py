"""Shared test fixtures.

The declaration_service module hard-requires the external ace-backend vendor
package (ASYCUDA mapping/emitter) at import time. In CI and sandboxes that
package isn't present, so we synthesise a minimal stub and point
ACE_BACKEND_PATH at it before anything imports the app.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_STUB_ROOT = Path("/tmp/stallion-test-ace-backend")


def _build_stub() -> None:
    svc = _STUB_ROOT / "asycuda_service"
    pkg = svc / "vendor" / "stubpkg" / "asycuda"
    pkg.mkdir(parents=True, exist_ok=True)
    (pkg / "__init__.py").write_text("")
    (pkg / "load_mapping.py").write_text(
        "def load_mapping(*a, **k):\n    return {}\n"
    )
    (pkg / "emitter.py").write_text(
        "def emit_asycuda_xml(*a, **k):\n"
        "    return '<?xml version=\"1.0\"?><ASYCUDA/>'\n"
    )
    (pkg.parent / "mapping.json").write_text(json.dumps({}))
    (pkg / "mapping.json").write_text(json.dumps({}))
    contract_dir = svc / "contract" / "ACE_Replacement_Contract_v1"
    contract_dir.mkdir(parents=True, exist_ok=True)
    schema = contract_dir / "contract.v1.schema.json"
    if not schema.exists():
        schema.write_text(json.dumps({"type": "object"}))


# Only stub when the real thing isn't configured/present.
_env = os.environ.get("ACE_BACKEND_PATH", "").strip()
if not _env or not Path(_env).exists():
    _build_stub()
    os.environ["ACE_BACKEND_PATH"] = str(_STUB_ROOT)


import pytest


@pytest.fixture(autouse=True)
def _isolate_database():
    """Give every test empty transactional tables.

    Phase 3B moved the JSON stores into a shared database, so tests can no
    longer isolate themselves by swapping a per-test data file (the old
    store_courier.COURIER_FILE / SHEETS_FILE seam). Truncating the tables before
    each test restores that isolation for both the unittest-style courier tests
    and the pytest-style declaration tests.
    """
    from sqlalchemy import delete

    import app.repository  # noqa: F401 — ensures tables are created/imported
    from app.db import engine, metadata

    with engine.begin() as conn:
        for table in reversed(metadata.sorted_tables):
            conn.execute(delete(table))
    yield
