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
