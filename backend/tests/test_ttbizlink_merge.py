from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MERGE_SCRIPT = ROOT / "scripts" / "tariff" / "ttbizlink_merge.py"


def load_merge_module():
    spec = importlib.util.spec_from_file_location("ttbizlink_merge", MERGE_SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_load_nested_json_unwraps_smart_hs_json_string():
    merge = load_merge_module()
    response = {
        "results": [
            {
                "hsCode": "09",
                "children": [
                    {
                        "hsCode": "0910",
                        "children": [
                            {
                                "hsCode": "09101100",
                                "hsDescription": "- - Neither crushed nor ground",
                            }
                        ],
                    }
                ],
            }
        ]
    }

    nested = json.dumps(json.dumps(response))
    codes = {}
    merge._walk(merge.load_nested_json(nested), codes)

    assert codes == {"09101100": "Neither crushed nor ground"}
