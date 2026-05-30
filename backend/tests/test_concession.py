"""
Tests for the C84 concession engine.

Covers:
- Full relief (returning-resident effects / diplomatic): all tax -> 0
- Capped relief (returning-resident vehicle): relief up to cap, remainder payable,
  VAT still assessed on residual; cap=0 band -> no relief
- Rate concession: concessionary duty/vat replaces standard rates
- No concession -> full assessment unchanged
- Sheet-level recompute wires concessions into per-line + totals
- relief totals roll up correctly

Run from repo root:
    cd backend
    python -m pytest tests/test_concession.py -v
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))

from app.services import concession_service as cs  # noqa: E402


class TestComputeLineRelief(unittest.TestCase):
    def test_no_concession_full_assessment(self):
        r = cs.compute_line_relief(
            cif_ttd=10000, duty_pct=20, surcharge_pct=0, vat_pct=12.5,
            concession_code=None)
        self.assertAlmostEqual(r["duty"], 2000.0)
        self.assertAlmostEqual(r["vat"], (10000 + 2000) * 0.125)
        self.assertAlmostEqual(r["relief_total"], 0.0)

    def test_full_relief_zeroes_everything(self):
        r = cs.compute_line_relief(
            cif_ttd=10000, duty_pct=20, surcharge_pct=0, vat_pct=12.5,
            concession_code="RR_EFFECTS")
        self.assertEqual(r["duty"], 0.0)
        self.assertEqual(r["vat"], 0.0)
        self.assertEqual(r["total_tax"], 0.0)
        # relief equals the full notional assessment
        self.assertAlmostEqual(r["relief_total"], r["full_total"])
        self.assertGreater(r["relief_total"], 0.0)

    def test_diplomatic_is_full(self):
        r = cs.compute_line_relief(
            cif_ttd=5000, duty_pct=30, surcharge_pct=0, vat_pct=12.5,
            concession_code="DIPLOMATIC")
        self.assertEqual(r["total_tax"], 0.0)

    def test_capped_vehicle_partial_relief(self):
        # CIF 200k, duty 30% = 60k, MVT 40k -> eligible pool 100k.
        # Cap 50k -> relieve 50k, payable pool 50k, VAT on CIF+payable.
        r = cs.compute_line_relief(
            cif_ttd=200000, duty_pct=30, surcharge_pct=0, vat_pct=12.5,
            concession_code="RR_VEHICLE", engine_cc=1900, mvt_ttd=40000)
        self.assertAlmostEqual(r["cap_applied_ttd"], 50000.0)
        # payable duty+surcharge+mvt should equal residual 50k
        residual = r["duty"] + r["surcharge"] + r["mvt"]
        self.assertAlmostEqual(residual, 50000.0, places=1)
        # relief on duty+mvt should equal the cap
        self.assertAlmostEqual(
            r["relief_duty"] + r["relief_surcharge"] + r["relief_mvt"],
            50000.0, places=1)
        # VAT assessed on CIF + payable pool, not relieved to zero
        self.assertGreater(r["vat"], 0.0)

    def test_capped_relief_never_exceeds_eligible(self):
        # Small assessment, large cap -> relieve only what's there.
        r = cs.compute_line_relief(
            cif_ttd=10000, duty_pct=10, surcharge_pct=0, vat_pct=12.5,
            concession_code="RR_VEHICLE", engine_cc=1500, mvt_ttd=0,
            cap_override_ttd=999999)
        # eligible = 1000 duty; cap huge -> all relieved, residual 0
        self.assertAlmostEqual(r["duty"], 0.0)
        self.assertAlmostEqual(r["cap_applied_ttd"], 1000.0)

    def test_no_concession_band_zero_cap(self):
        # >=2500cc default band has cap 0 -> nothing relieved.
        r = cs.compute_line_relief(
            cif_ttd=200000, duty_pct=30, surcharge_pct=0, vat_pct=12.5,
            concession_code="RR_VEHICLE", engine_cc=3000, mvt_ttd=40000)
        self.assertEqual(r["cap_applied_ttd"], 0.0)
        self.assertAlmostEqual(r["relief_duty"], 0.0)
        self.assertAlmostEqual(r["duty"], 60000.0)

    def test_rate_concession(self):
        # Standard duty 30% replaced by concessionary 5%; VAT still 12.5%.
        r = cs.compute_line_relief(
            cif_ttd=10000, duty_pct=30, surcharge_pct=0, vat_pct=12.5,
            concession_code="RATE_CONCESSION", conc_duty_pct=5)
        self.assertAlmostEqual(r["duty"], 500.0)
        self.assertAlmostEqual(r["vat"], (10000 + 500) * 0.125)
        # relief = full duty (3000) - payable (500) = 2500
        self.assertAlmostEqual(r["relief_duty"], 2500.0)

    def test_cap_bands_lookup(self):
        self.assertEqual(cs.default_vehicle_cap(1500)["cap_ttd"], 30000.0)
        self.assertEqual(cs.default_vehicle_cap(1900)["cap_ttd"], 50000.0)
        self.assertEqual(cs.default_vehicle_cap(5000)["cap_ttd"], 0.0)


class TestSheetIntegration(unittest.TestCase):
    """Exercise recompute end-to-end with a temp store."""

    def setUp(self):
        import app.services.sheet_service as ss
        self.ss = ss
        self.tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        self.tmp.write(b"[]")
        self.tmp.flush()
        self._orig = ss.SHEETS_FILE
        ss.SHEETS_FILE = Path(self.tmp.name)

    def tearDown(self):
        self.ss.SHEETS_FILE = self._orig

    def test_effects_sheet_fully_relieved(self):
        s = self.ss.create_sheet({
            "declaration_type": "c84",
            "exchange_rate": 6.78, "freight_usd": 0,
            "lines": [
                {"exworks_usd": 1000, "duty_pct": 20, "vat_pct": 12.5,
                 "concession_code": "RR_EFFECTS"},
            ],
        })
        t = s["totals"]
        self.assertEqual(t["payable_taxes"], 0.0)
        self.assertGreater(t["relief_total"], 0.0)

    def test_mixed_effects_and_vehicle(self):
        s = self.ss.create_sheet({
            "declaration_type": "c84",
            "exchange_rate": 1.0, "freight_usd": 0,
            "lines": [
                {"exworks_usd": 10000, "duty_pct": 20, "vat_pct": 12.5,
                 "concession_code": "RR_EFFECTS"},
                {"exworks_usd": 200000, "duty_pct": 30, "vat_pct": 12.5,
                 "concession_code": "RR_VEHICLE", "engine_cc": 1900,
                 "mvt_ttd": 40000},
            ],
        })
        ln_eff, ln_veh = s["lines"]
        self.assertEqual(ln_eff["total_tax"], 0.0)
        self.assertGreater(ln_veh["total_tax"], 0.0)
        self.assertAlmostEqual(ln_veh["cap_applied_ttd"], 50000.0)
        # sheet relief total = effects full + vehicle cap
        self.assertGreater(s["totals"]["relief_total"], 50000.0)

    def test_toggling_concession_off_resets(self):
        s = self.ss.create_sheet({
            "exchange_rate": 1.0,
            "lines": [{"exworks_usd": 10000, "duty_pct": 20, "vat_pct": 12.5,
                       "concession_code": "RR_EFFECTS"}],
        })
        self.assertEqual(s["lines"][0]["total_tax"], 0.0)
        # remove concession
        self.ss.update_line(s["id"], 1, {"concession_code": ""})
        s2 = self.ss.get_sheet(s["id"])
        self.assertGreater(s2["lines"][0]["total_tax"], 0.0)
        self.assertEqual(s2["lines"][0]["relief_total"], 0.0)


if __name__ == "__main__":
    unittest.main()
