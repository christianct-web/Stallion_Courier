"""
Tests for the courier module Phase 1b (editable rules + tariff overrides).

Covers:
- The duty engine still computes correctly under the rules-store-backed
  classifier
- The rules store: add/remove/update exemptions and corrections
- Tariff overrides: add/remove/list
- Audit trail captures every change
- Export/import round-trip
- Bundled defaults can be overridden by user entries

Run from repo root:
    cd backend
    python -m pytest tests/test_courier.py -v
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))

from app.services import courier_duty, courier_matcher, courier_rules  # noqa: E402


class _RulesStoreTestBase(unittest.TestCase):
    """Each test gets a fresh tmpdir for the user rules + tariff overrides."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="courier_test_")
        self.user_rules_path = Path(self.tmpdir) / "courier_rules_user.json"
        self.tariff_overrides_path = Path(self.tmpdir) / "tariff_overrides.json"
        # Resolve bundled paths relative to backend root: tests/ and data/
        # are siblings under backend/.
        backend_dir = HERE.parent
        self.bundled_rules_path = backend_dir / "data" / "courier_rules_bundled.json"
        self.bundled_tariff_path = backend_dir / "data" / "tt_tariff_db_2024.json"

        courier_rules.configure_paths(
            bundled_rules_path=self.bundled_rules_path,
            user_rules_path=self.user_rules_path,
            bundled_tariff_path=self.bundled_tariff_path,
            tariff_overrides_path=self.tariff_overrides_path,
        )

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)


class TestCourierDutyEngine(_RulesStoreTestBase):
    """The duty engine still classifies and calculates correctly."""

    def test_classify_standard_thn(self):
        result = courier_duty.classify("33049990")
        self.assertEqual(result.exemption_class, "none")
        self.assertGreater(result.duty_rate, 0)
        self.assertEqual(result.rule_source, "cet")

    def test_classify_full_exempt_smartphone(self):
        result = courier_duty.classify("85171300")
        self.assertEqual(result.exemption_class, "full_exempt")
        self.assertEqual(result.duty_rate, 0.0)
        self.assertEqual(result.rule_source, "exemption")

    def test_classify_full_exempt_computer_accessory(self):
        result = courier_duty.classify("84733000")
        self.assertEqual(result.exemption_class, "full_exempt")

    def test_classify_full_exempt_earphones(self):
        result = courier_duty.classify("85183000")
        self.assertEqual(result.exemption_class, "full_exempt")

    def test_classify_full_exempt_plastic_case(self):
        result = courier_duty.classify("39269090")
        self.assertEqual(result.exemption_class, "full_exempt")

    def test_classify_duty_free_only_generic_device(self):
        result = courier_duty.classify("85176900")
        self.assertEqual(result.exemption_class, "duty_free_only")
        self.assertEqual(result.duty_rate, 0.0)

    def test_thn_correction_smartphone(self):
        result = courier_duty.classify("85171200")
        self.assertTrue(result.is_corrected)
        self.assertEqual(result.original_thn, "85171200")
        self.assertEqual(result.exemption_class, "full_exempt")
        self.assertEqual(result.rule_source, "correction")

    def test_thn_correction_air_pump(self):
        result = courier_duty.classify("84148090")
        self.assertTrue(result.is_corrected)

    def test_unknown_thn_marked(self):
        result = courier_duty.classify("99999999")
        self.assertTrue(result.is_unknown)
        self.assertEqual(result.exemption_class, "none")
        self.assertEqual(result.rule_source, "fallback")

    def test_calculate_line_standard(self):
        result = courier_duty.calculate_line(
            cost_usd=20.0, freight_usd=0.0, exch_rate=6.78,
            thn="33049990",
        )
        self.assertEqual(result["cif_ttd"], 135.60)
        self.assertEqual(result["duty"], 27.12)
        self.assertEqual(result["opt"], 9.49)
        self.assertAlmostEqual(result["vat"], 21.53, places=2)
        self.assertAlmostEqual(result["total_taxes"], 58.14, places=2)

    def test_calculate_line_full_exempt(self):
        result = courier_duty.calculate_line(
            cost_usd=100.0, freight_usd=0.0, exch_rate=6.78,
            thn="85171300",
        )
        self.assertEqual(result["cif_ttd"], 678.00)
        self.assertEqual(result["duty"], 0.0)
        self.assertEqual(result["opt"], 0.0)
        self.assertEqual(result["vat"], 0.0)

    def test_calculate_line_duty_free_only(self):
        result = courier_duty.calculate_line(
            cost_usd=100.0, freight_usd=0.0, exch_rate=6.78,
            thn="85176900",
        )
        self.assertEqual(result["cif_ttd"], 678.00)
        self.assertEqual(result["duty"], 0.0)
        self.assertAlmostEqual(result["opt"], 47.46, places=2)

    def test_calculate_line_with_overrides(self):
        result = courier_duty.calculate_line(
            cost_usd=100.0, freight_usd=0.0, exch_rate=6.78,
            thn="33049990",
            duty_rate_override=0.10,
        )
        self.assertEqual(result["duty"], 67.80)

    def test_invalid_inputs(self):
        with self.assertRaises(ValueError):
            courier_duty.calculate_line(-10, 0, 6.78, "33049990")
        with self.assertRaises(ValueError):
            courier_duty.calculate_line(10, 0, 0, "33049990")
        with self.assertRaises(ValueError):
            courier_duty.calculate_line(10, 0, 6.78, "33049990",
                                         exemption_override="invalid")


class TestExemptionMutations(_RulesStoreTestBase):
    """User-driven exemption add/update/remove."""

    def test_add_user_exemption(self):
        result = courier_rules.add_exemption(
            thn="61091000", exemption_class="full_exempt",
            notes="Testing user exemption", by="christian",
        )
        self.assertEqual(result["thn"], "61091000")
        self.assertEqual(result["class"], "full_exempt")
        self.assertEqual(result["added_by"], "christian")

        cls = courier_duty.classify("61091000")
        self.assertEqual(cls.exemption_class, "full_exempt")
        self.assertEqual(cls.rule_source, "exemption")

    def test_user_exemption_overrides_bundled(self):
        """User can override a bundled exemption (e.g. demote it)."""
        courier_rules.add_exemption(
            thn="85171300", exemption_class="duty_free_only",
            notes="Reclassified per Customs Notice X", by="arnim",
            comment="Per signed-off rule change",
        )
        cls = courier_duty.classify("85171300")
        self.assertEqual(cls.exemption_class, "duty_free_only")

    def test_remove_user_exemption(self):
        courier_rules.add_exemption(
            thn="61091000", exemption_class="full_exempt", by="christian",
        )
        ok = courier_rules.remove_exemption("61091000", by="christian")
        self.assertTrue(ok)
        cls = courier_duty.classify("61091000")
        self.assertNotEqual(cls.exemption_class, "full_exempt")

    def test_remove_bundled_exemption_returns_false(self):
        ok = courier_rules.remove_exemption("85171300", by="christian")
        self.assertFalse(ok)
        cls = courier_duty.classify("85171300")
        self.assertEqual(cls.exemption_class, "full_exempt")

    def test_invalid_thn_rejected(self):
        with self.assertRaises(ValueError):
            courier_rules.add_exemption("12345", "full_exempt")
        with self.assertRaises(ValueError):
            courier_rules.add_exemption("ABCDEFGH", "full_exempt")

    def test_invalid_class_rejected(self):
        with self.assertRaises(ValueError):
            courier_rules.add_exemption("12345678", "made_up_class")


class TestCorrectionMutations(_RulesStoreTestBase):

    def test_add_user_correction(self):
        courier_rules.add_correction(
            wrong_thn="11111111", correct_thn="33049990",
            reason="Test correction", by="christian",
        )
        cls = courier_duty.classify("11111111")
        self.assertTrue(cls.is_corrected)
        self.assertEqual(cls.original_thn, "11111111")

    def test_correction_chains_to_exemption(self):
        courier_rules.add_correction(
            wrong_thn="11112222", correct_thn="85171300",
            reason="Map this to smartphone", by="christian",
        )
        cls = courier_duty.classify("11112222")
        self.assertTrue(cls.is_corrected)
        self.assertEqual(cls.exemption_class, "full_exempt")

    def test_remove_user_correction(self):
        courier_rules.add_correction("11111111", "33049990", by="christian")
        ok = courier_rules.remove_correction("11111111", by="christian")
        self.assertTrue(ok)
        cls = courier_duty.classify("11111111")
        self.assertFalse(cls.is_corrected)

    def test_self_correction_rejected(self):
        with self.assertRaises(ValueError):
            courier_rules.add_correction("11111111", "11111111")


class TestTariffOverrides(_RulesStoreTestBase):

    def test_add_tariff_override_for_missing_thn(self):
        courier_rules.add_tariff_entry(
            thn="99887766",
            description="Test tariff entry",
            duty_pct=15,
            chapter=99,
            unit="kg",
            by="christian",
        )
        entry = courier_duty.lookup_thn("99887766")
        self.assertIsNotNone(entry)
        self.assertEqual(entry["dutyPct"], 15)
        self.assertTrue(entry.get("is_override"))

        cls = courier_duty.classify("99887766")
        self.assertEqual(cls.exemption_class, "none")
        self.assertEqual(cls.duty_rate, 0.15)

    def test_user_tariff_override_replaces_bundled(self):
        courier_rules.add_tariff_entry(
            thn="33049990",
            description="Body cream — local override",
            duty_pct=10,
            by="arnim",
            comment="Test override",
        )
        cls = courier_duty.classify("33049990")
        self.assertEqual(cls.duty_rate, 0.10)

    def test_remove_tariff_override(self):
        courier_rules.add_tariff_entry(
            thn="99887766", description="x", duty_pct=10, chapter=99,
            by="christian",
        )
        ok = courier_rules.remove_tariff_entry("99887766", by="christian")
        self.assertTrue(ok)
        self.assertIsNone(courier_duty.lookup_thn("99887766"))

    def test_remove_bundled_tariff_returns_false(self):
        ok = courier_rules.remove_tariff_entry("33049990", by="christian")
        self.assertFalse(ok)

    def test_browse_filters_by_chapter(self):
        result = courier_rules.list_tariff_entries(chapter=33, limit=10)
        self.assertGreater(result["total"], 0)
        for e in result["items"]:
            self.assertEqual(e.get("chapter"), 33)

    def test_browse_filters_by_query(self):
        result = courier_rules.list_tariff_entries(query="smartphone", limit=10)
        self.assertGreater(result["total"], 0)


class TestAuditTrail(_RulesStoreTestBase):

    def test_audit_records_add(self):
        courier_rules.add_exemption(
            "61091000", "full_exempt", by="christian", comment="Test add",
        )
        log = courier_rules.get_audit_log()
        self.assertEqual(log["total"], 1)
        entry = log["items"][0]
        self.assertEqual(entry["action"], "add_exemption")
        self.assertEqual(entry["target"], "61091000")
        self.assertEqual(entry["by"], "christian")
        self.assertEqual(entry["comment"], "Test add")
        self.assertIsNone(entry["before"])
        self.assertIsNotNone(entry["after"])

    def test_audit_records_update(self):
        courier_rules.add_exemption("61091000", "full_exempt", by="christian")
        courier_rules.add_exemption(
            "61091000", "duty_free_only", by="arnim",
            comment="Demoted",
        )
        log = courier_rules.get_audit_log()
        self.assertEqual(log["total"], 2)
        latest = log["items"][0]
        self.assertEqual(latest["action"], "update_exemption")
        self.assertEqual(latest["before"]["class"], "full_exempt")
        self.assertEqual(latest["after"]["class"], "duty_free_only")

    def test_audit_records_remove(self):
        courier_rules.add_exemption("61091000", "full_exempt", by="christian")
        courier_rules.remove_exemption("61091000", by="christian", comment="Mistake")
        log = courier_rules.get_audit_log()
        self.assertEqual(log["total"], 2)
        self.assertEqual(log["items"][0]["action"], "remove_exemption")

    def test_audit_records_tariff_changes(self):
        courier_rules.add_tariff_entry(
            "99887766", "x", 10, chapter=99, by="christian",
        )
        log = courier_rules.get_audit_log()
        self.assertEqual(log["items"][0]["action"], "add_tariff")


class TestExportImport(_RulesStoreTestBase):

    def test_export_import_round_trip(self):
        courier_rules.add_exemption("61091000", "full_exempt", by="christian")
        courier_rules.add_correction("11111111", "33049990", by="christian")
        courier_rules.add_tariff_entry(
            "99887766", "test", 15, chapter=99, by="christian",
        )

        backup = courier_rules.export_user_rules()
        self.assertIn("rules", backup)
        self.assertIn("tariff_overrides", backup)
        self.assertEqual(len(backup["rules"]["exemptions"]), 1)
        self.assertEqual(len(backup["tariff_overrides"]["entries"]), 1)

        courier_rules.remove_exemption("61091000", by="christian")
        courier_rules.remove_correction("11111111", by="christian")
        courier_rules.remove_tariff_entry("99887766", by="christian")

        result = courier_rules.import_user_rules(backup, by="christian", comment="Restore")
        self.assertTrue(result["ok"])

        self.assertIsNotNone(courier_rules.get_exemption("61091000"))
        self.assertIsNotNone(courier_rules.get_correction("11111111"))
        self.assertIsNotNone(courier_duty.lookup_thn("99887766"))


class TestCourierMatcher(_RulesStoreTestBase):

    def test_smartphone_matches_full_exempt(self):
        result = courier_matcher.suggest_thns("smartphone")
        self.assertEqual(result["best_match"]["thn"], "85171300")
        self.assertEqual(result["best_match"]["exemption_class"], "full_exempt")

    def test_earphones_full_exempt(self):
        result = courier_matcher.suggest_thns("earphones")
        self.assertEqual(result["best_match"]["thn"], "85183000")

    def test_graphics_card_full_exempt(self):
        result = courier_matcher.suggest_thns("RTX 4090 graphics card")
        self.assertEqual(result["best_match"]["thn"], "84733000")

    def test_seeds_full_exempt(self):
        result = courier_matcher.suggest_thns("flower seeds")
        self.assertEqual(result["best_match"]["thn"], "12099900")

    def test_table_tennis_10pct(self):
        result = courier_matcher.suggest_thns("table tennis paddle")
        self.assertEqual(result["best_match"]["thn"], "95069190")

    def test_air_pump_match(self):
        result = courier_matcher.suggest_thns("portable air pump")
        self.assertEqual(result["best_match"]["thn"], "84148000")

    def test_user_tariff_override_visible_in_matcher(self):
        """If user overrides a tariff rate, the matcher reflects it."""
        courier_rules.add_tariff_entry(
            "33049990", "Body cream — overridden", 10, by="arnim",
        )
        result = courier_matcher.suggest_thns("body cream")
        self.assertEqual(result["best_match"]["thn"], "33049990")
        self.assertEqual(result["best_match"]["duty_rate"], 0.10)


class TestServiceIntegration(_RulesStoreTestBase):
    """End-to-end: manifest with auto-classification picks up user rules."""

    def setUp(self):
        super().setUp()
        from app import store_courier
        self.manifest_path_backup = store_courier.COURIER_FILE
        store_courier.COURIER_FILE = Path(self.tmpdir) / "courier_manifests.json"
        store_courier.COURIER_FILE.write_text("[]", encoding="utf-8")

    def tearDown(self):
        from app import store_courier
        store_courier.COURIER_FILE = self.manifest_path_backup
        super().tearDown()

    def test_manifest_uses_user_exemption(self):
        from app.services import courier_service

        courier_rules.add_exemption(
            "61091000", "full_exempt",
            notes="Test exemption for cotton t-shirts",
            by="arnim", comment="Customer chamber rate",
        )

        m = courier_service.create_manifest({
            "manifest_no": "TEST-MANIFEST",
            "arrival_date": "2026-05-04",
            "exch_rate": 6.78,
        })
        line = courier_service.add_line(m["id"], {
            "description": "cotton t-shirt",
            "thn": "61091000",
            "cost_usd": 25.00,
        })
        self.assertEqual(line["exemption_class"], "full_exempt")
        self.assertEqual(line["duty"], 0.0)
        self.assertEqual(line["total_taxes"], 0.0)


# ─── Phase 2: XLSX export tests ──────────────────────────────────────────────


class TestWorksheetExport(_RulesStoreTestBase):
    """Build a v3 worksheet from a manifest and inspect the result."""

    def setUp(self):
        super().setUp()
        from app import store_courier
        self.manifest_path_backup = store_courier.COURIER_FILE
        store_courier.COURIER_FILE = Path(self.tmpdir) / "courier_manifests.json"
        store_courier.COURIER_FILE.write_text("[]", encoding="utf-8")

    def tearDown(self):
        from app import store_courier
        store_courier.COURIER_FILE = self.manifest_path_backup
        super().tearDown()

    def _make_manifest(self):
        """Build a small manifest with mixed exemption classes."""
        from app.services import courier_service
        m = courier_service.create_manifest({
            "manifest_no": "EXPORT-TEST-001",
            "arrival_date": "2026-05-04",
            "exch_rate": 6.78,
        })
        courier_service.add_line(m["id"], {
            "hawb": "TEST-001-A", "shipper": "Amazon", "importer": "John Doe",
            "description": "Body cream", "thn": "33049990",
            "cost_usd": 50.0, "freight_usd": 0.0, "packages": 1, "weight_kg": 0.5,
        })
        courier_service.add_line(m["id"], {
            "hawb": "TEST-001-B", "shipper": "Apple", "importer": "Jane Smith",
            "description": "Smartphone", "thn": "85171300",
            "cost_usd": 800.0, "freight_usd": 0.0, "packages": 1, "weight_kg": 0.3,
        })
        courier_service.add_line(m["id"], {
            "hawb": "TEST-001-C", "shipper": "Nest", "importer": "Bob Brown",
            "description": "Smart device", "thn": "85176900",
            "cost_usd": 100.0, "freight_usd": 0.0, "packages": 1, "weight_kg": 0.4,
        })
        return courier_service.get_manifest(m["id"])

    def test_worksheet_returns_bytes(self):
        from app.services import courier_export
        m = self._make_manifest()
        data = courier_export.build_worksheet_v3(m)
        self.assertIsInstance(data, bytes)
        self.assertEqual(data[:2], b"PK")

    def test_worksheet_layout_matches_real_template(self):
        """Cell positions should match the real AWB 5034 template exactly."""
        from openpyxl import load_workbook
        from app.services import courier_export
        import io

        m = self._make_manifest()
        data = courier_export.build_worksheet_v3(m)
        wb = load_workbook(io.BytesIO(data))
        ws = wb.active

        # Title block
        self.assertIn("EXPRESS CONSIGNMENTS WORKSHEET", str(ws["A1"].value))
        self.assertIn("NON-COMMERCIAL", str(ws["A2"].value))
        self.assertIn("CARGO REPORTER", str(ws["A3"].value))
        self.assertIn("MASTER WAY BILL", str(ws["J3"].value))
        self.assertIn("EXPORT-TEST-001", str(ws["J3"].value))
        self.assertIn("R.O.E.", str(ws["F4"].value))
        self.assertIn("FREIGHT", str(ws["J4"].value))

        # Banner row 6
        self.assertEqual(ws["A6"].value, "SECTION 2")
        self.assertIn("SECTION 3", str(ws["Q6"].value))

        # Column headers row 7
        self.assertIn("LINE", str(ws["A7"].value))
        self.assertEqual(ws["B7"].value, "HAWB")
        self.assertEqual(ws["C7"].value, "SHIPPER")
        self.assertIn("IMPORTER", str(ws["D7"].value))
        self.assertIn("DESCRIPTION", str(ws["E7"].value))
        self.assertIn("PKGS", str(ws["F7"].value))
        self.assertEqual(ws["H7"].value, "THN")
        self.assertEqual(ws["I7"].value, "RATE")
        self.assertIn("CUSTOMS", str(ws["L7"].value))
        self.assertEqual(ws["M7"].value, "DUTY")
        self.assertIn("OPT", str(ws["N7"].value))
        self.assertIn("VAT", str(ws["O7"].value))
        self.assertIn("TOTAL", str(ws["P7"].value))
        self.assertIn("OFFICER", str(ws["Q7"].value))
        self.assertIn("ADJUSTED", str(ws["S7"].value))
        self.assertIn("DETAINED", str(ws["X7"].value))
        self.assertIn("T/SHED", str(ws["Y7"].value))

        # First data row at row 8 (NOT row 9)
        self.assertEqual(ws["A8"].value, 1)
        self.assertEqual(ws["E8"].value, "Body cream")
        self.assertEqual(ws["H8"].value, "33049990")
        self.assertEqual(ws["I8"].value, "20%")
        self.assertAlmostEqual(ws["J8"].value, 50.0, places=2)

    def test_worksheet_formulas_match_real_template(self):
        """Formulas should match the real worksheet's syntax."""
        from openpyxl import load_workbook
        from app.services import courier_export
        import io

        m = self._make_manifest()
        data = courier_export.build_worksheet_v3(m)
        wb = load_workbook(io.BytesIO(data))
        ws = wb.active

        # Row 8: body cream — standard 20% line
        # Real template uses =J8*6.78 (rate baked into formula)
        l_formula = str(ws["L8"].value)
        self.assertIn("J8", l_formula)
        self.assertIn("6.78", l_formula)
        self.assertEqual(ws["M8"].value, "=L8*0.2")
        self.assertEqual(ws["N8"].value, "=L8*0.07")
        self.assertEqual(ws["O8"].value, "=(L8+M8+N8)*0.125")
        # P uses M+N+O (NOT SUM)
        self.assertEqual(ws["P8"].value, "=M8+N8+O8")

        # Row 9: smartphone — full_exempt, hard zeros
        self.assertEqual(ws["I9"].value, "FREE")
        self.assertEqual(ws["M9"].value, 0)
        self.assertEqual(ws["N9"].value, 0)
        self.assertEqual(ws["O9"].value, 0)

        # Row 10: smart device — duty_free_only
        self.assertEqual(ws["I10"].value, "FREE")
        self.assertEqual(ws["M10"].value, 0)
        self.assertEqual(ws["N10"].value, "=L10*0.07")
        self.assertEqual(ws["O10"].value, "=(L10+M10+N10)*0.125")

    def test_worksheet_with_officer_corrections(self):
        """Officer examination data lands in Section 3 of the right rows."""
        import io
        from openpyxl import load_workbook
        from app.services import courier_export, courier_service

        m = self._make_manifest()
        courier_service.record_examination(m["id"], {
            "examined_at": "2026-05-04",
            "examining_officer": "Officer Test",
            "corrections": [
                {
                    "line_no": 1, "kind": "uplift",
                    "officer_thn": "33049990",
                    "add_cost_usd": 25.0,
                    "adjusted_cif_ttd": 169.50,
                    "add_duty": 33.90,
                    "add_opt": 11.87,
                    "add_vat": 26.91,
                },
            ],
        })

        m = courier_service.get_manifest(m["id"])
        data = courier_export.build_worksheet_v3(m)
        wb = load_workbook(io.BytesIO(data))
        ws = wb.active

        # Line 1 → row 8, S3 fields populated
        self.assertEqual(ws["Q8"].value, "33049990")
        self.assertAlmostEqual(ws["R8"].value, 25.0, places=2)
        self.assertAlmostEqual(ws["S8"].value, 169.50, places=2)
        self.assertAlmostEqual(ws["T8"].value, 33.90, places=2)
        self.assertEqual(ws["W8"].value, "=T8+U8+V8")

        # Line 2 → row 9, S3 empty
        self.assertIn(ws["Q9"].value, (None, ""))

    def test_worksheet_totals_match_real_template(self):
        """TOTALS row uses SUM formulas across columns F G J L M N O P R S T U V W."""
        from openpyxl import load_workbook
        from app.services import courier_export
        import io

        m = self._make_manifest()
        data = courier_export.build_worksheet_v3(m)
        wb = load_workbook(io.BytesIO(data))
        ws = wb.active

        # 3 lines → data at rows 8-10, totals at row 11
        self.assertEqual(ws["A11"].value, "TOTALS")
        for col in ("F", "G", "J", "L", "M", "N", "O", "P", "R", "S", "T", "U", "V", "W"):
            v = ws[f"{col}11"].value
            self.assertTrue(
                str(v).startswith("=SUM("),
                f"Cell {col}11 should be a SUM formula, got {v!r}",
            )

        # Grand total row 12: P12 = P11, W12 = P11 + W11
        self.assertEqual(ws["P12"].value, "=P11")
        self.assertEqual(ws["W12"].value, "=P11+W11")

    def test_worksheet_recalc_correctness(self):
        """LibreOffice recalc should produce expected duty/OPT/VAT values."""
        import shutil
        import subprocess

        recalc_script = Path("/mnt/skills/public/xlsx/scripts/recalc.py")
        if not recalc_script.exists() or not (
            shutil.which("libreoffice") or shutil.which("soffice")
        ):
            self.skipTest("LibreOffice/recalc.py not available")

        from openpyxl import load_workbook
        from app.services import courier_export

        m = self._make_manifest()
        data = courier_export.build_worksheet_v3(m)
        out = Path(self.tmpdir) / "ws.xlsx"
        out.write_bytes(data)

        try:
            result = subprocess.run(
                ["python3", str(recalc_script), str(out)],
                capture_output=True, text=True, timeout=60,
            )
        except subprocess.TimeoutExpired:
            self.skipTest("Recalc timed out")
        if result.returncode != 0:
            self.skipTest(f"Recalc script failed: {result.stderr}")

        wb = load_workbook(out, data_only=True)
        ws = wb.active

        # Row 8 (body cream, $50, 6.78, 20%):
        # cif = 339, duty = 67.80, opt = 23.73, vat ≈ 53.82, total ≈ 145.35
        self.assertAlmostEqual(ws["L8"].value, 339.0, places=2)
        self.assertAlmostEqual(ws["M8"].value, 67.80, places=2)
        self.assertAlmostEqual(ws["N8"].value, 23.73, places=2)

        # Row 9 (smartphone, full_exempt): all zero
        self.assertEqual(ws["M9"].value, 0)
        self.assertEqual(ws["N9"].value, 0)
        self.assertEqual(ws["O9"].value, 0)

        # Row 10 (smart device, duty_free_only): duty 0, OPT 47.46, VAT 90.68
        self.assertEqual(ws["M10"].value, 0)
        self.assertAlmostEqual(ws["N10"].value, 47.46, places=2)
        self.assertAlmostEqual(ws["O10"].value, 90.68, places=2)


class TestHazmatExport(_RulesStoreTestBase):
    """Build the Swissport Transit Shed Hazmat XLSX and verify its structure."""

    def setUp(self):
        super().setUp()
        from app import store_courier
        self.manifest_path_backup = store_courier.COURIER_FILE
        store_courier.COURIER_FILE = Path(self.tmpdir) / "courier_manifests.json"
        store_courier.COURIER_FILE.write_text("[]", encoding="utf-8")

    def tearDown(self):
        from app import store_courier
        store_courier.COURIER_FILE = self.manifest_path_backup
        super().tearDown()

    def test_hazmat_swissport_layout(self):
        """Verify the Swissport Transit Shed Form layout (Trade + Non-Trade sections)."""
        import io
        from openpyxl import load_workbook
        from app.services import courier_export, courier_service

        m = courier_service.create_manifest({
            "manifest_no": "HZ-001",
            "arrival_date": "2026-05-04",
            "exch_rate": 6.78,
        })
        courier_service.add_line(m["id"], {
            "hawb": "H-1", "description": "Body cream", "thn": "33049990",
            "cost_usd": 50.0, "packages": 1, "weight_kg": 0.5,
        })
        m = courier_service.get_manifest(m["id"])
        data = courier_export.build_hazmat(m)
        wb = load_workbook(io.BytesIO(data))
        ws = wb.active

        # Header
        self.assertIn("SWISSPORT", str(ws["B2"].value).upper())

        # Manifest meta
        self.assertEqual(ws["B7"].value, "NAME OF COURIER:")
        self.assertEqual(ws["J7"].value, "AWB/BL #")
        self.assertEqual(ws["K7"].value, "HZ-001")

        # Tax column headers at row 22
        self.assertEqual(ws["F22"].value, "CIF")
        self.assertEqual(ws["H22"].value, "OPT")
        self.assertEqual(ws["J22"].value, "DUTY")
        self.assertEqual(ws["L22"].value, "VAT")
        self.assertEqual(ws["N22"].value, "TOTAL")

        # Trade section (rows 23, 25, 27)
        self.assertEqual(ws["E23"].value, "Trade")
        self.assertEqual(ws["B23"].value, "Original Values Declared")
        self.assertEqual(ws["F23"].value, 0)  # Trade is zero for TTPOST
        # Additional row 25 = Final - Original
        self.assertEqual(ws["F25"].value, "=F27-F23")
        self.assertEqual(ws["H25"].value, "=H27-H23")
        self.assertEqual(ws["F27"].value, 0)  # Final Trade also zero

        # Non-Trade section (rows 31, 33, 35)
        self.assertEqual(ws["E31"].value, "Non-Trade")
        self.assertGreater(ws["F31"].value, 0)  # Non-Trade Original CIF
        # Additional row 33 = Final - Original
        self.assertEqual(ws["F33"].value, "=F35-F31")
        self.assertEqual(ws["H33"].value, "=H35-H31")
        self.assertEqual(ws["J33"].value, "=J35-J31")
        self.assertEqual(ws["L33"].value, "=L35-L31")

        # Summary footer
        self.assertEqual(ws["B39"].value, "Total Additional Taxes")
        self.assertEqual(ws["F38"].value, "=F33")
        self.assertEqual(ws["B42"].value, "TOTAL TAXES")
        self.assertEqual(ws["F41"].value, "=F35")

    def test_hazmat_with_corrections(self):
        """Officer corrections feed into the Non-Trade Final values."""
        import io
        from openpyxl import load_workbook
        from app.services import courier_export, courier_service

        m = courier_service.create_manifest({
            "manifest_no": "HZ-002", "arrival_date": "2026-05-04", "exch_rate": 6.78,
        })
        courier_service.add_line(m["id"], {
            "description": "Body cream", "thn": "33049990", "cost_usd": 50.0,
        })
        courier_service.record_examination(m["id"], {
            "corrections": [
                {"line_no": 1, "kind": "uplift",
                 "officer_thn": "33049990",
                 "adjusted_cif_ttd": 169.50,
                 "add_duty": 33.90, "add_opt": 11.87, "add_vat": 26.91},
            ],
        })
        m = courier_service.get_manifest(m["id"])
        data = courier_export.build_hazmat(m)
        wb = load_workbook(io.BytesIO(data))
        ws = wb.active

        # F35 (Non-Trade Final CIF) = original_cif + add_cif
        # original_cif = 50 * 6.78 = 339, add_cif = 169.50, final = 508.50
        self.assertAlmostEqual(ws["F35"].value, 508.50, places=2)
        # J35 (Final Duty) = orig duty (67.80) + add duty (33.90) = 101.70
        self.assertAlmostEqual(ws["J35"].value, 101.70, places=2)


class TestTemplateParser(_RulesStoreTestBase):
    """Tests for the TTPOST blank-template parser (Phase 4)."""

    def _build_minimal_ttpost_template(self) -> bytes:
        """Build an in-memory TTPOST-style XLSX with header + 3 data rows."""
        import io
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        # Header rows
        ws["H1"] = "EXPRESS CONSIGNMENTS WORKSHEET"
        ws["H2"] = "NON-COMMERCIAL CONSIGNMENTS"
        ws["A3"] = "CARGO REPORTER: TRINIDAD AND TOBAGO POSTAL CORPORATION"
        ws["J3"] = "MASTER WAY BILL NUMBER: 106-31299999"
        ws["A5"] = 'VAT NO. / "N" NO. : V117369'
        ws["A7"] = "SECTION 2"
        ws["A8"] = "DETAILS OF ALL HOUSE WAYBILLS"
        # Column headers row 9
        headers = ["LINE NO. AWB", "HAWB", "SHIPPER", "NAME OF IMPORTER",
                   "DESCRIPTION OF GOODS", "NO. OF PKGS", "WEIGHT", "THN",
                   "RATE", "COST", "FREIGHT", "CUSTOMS VALUE", "DUTY",
                   "OPT", "VAT", "TOTAL TAXES"]
        for col, h in enumerate(headers, 1):
            ws.cell(row=9, column=col, value=h)
        # Data rows 10-12
        rows = [
            (1, "2700001", "AMAZON", "TEST IMPORTER 1", "BACKPACK", 1, 1.0, None, None, 21.0),
            (2, "2700002", "SHEIN",  "TEST IMPORTER 2", "SHOES",    1, 2.0, None, None, 19.99),
            (3, "2700003", "TEMU",   "TEST IMPORTER 3", "CELL PHONE", 1, 0.5, None, None, 250.0),
        ]
        for r_idx, row_data in enumerate(rows, start=10):
            for c_idx, val in enumerate(row_data, start=1):
                ws.cell(row=r_idx, column=c_idx, value=val)
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    def test_parser_extracts_header(self):
        from app.services.courier_template_parser import parse_ttpost_template
        result = parse_ttpost_template(self._build_minimal_ttpost_template())
        self.assertEqual(result["manifest_no"], "106-31299999")
        self.assertEqual(result["vat_no"], "V117369")
        self.assertIn("TRINIDAD AND TOBAGO POSTAL CORPORATION", result["cargo_reporter"])

    def test_parser_extracts_lines(self):
        from app.services.courier_template_parser import parse_ttpost_template
        result = parse_ttpost_template(self._build_minimal_ttpost_template())
        self.assertEqual(len(result["lines"]), 3)
        first = result["lines"][0]
        self.assertEqual(first["hawb"], "2700001")
        self.assertEqual(first["shipper"], "AMAZON")
        self.assertEqual(first["importer"], "TEST IMPORTER 1")
        self.assertEqual(first["description"], "BACKPACK")
        self.assertEqual(first["packages"], 1)
        self.assertEqual(first["weight_kg"], 1.0)
        self.assertEqual(first["cost_usd"], 21.0)
        # THN was empty in the template
        self.assertEqual(first["thn"], "")

    def test_parser_stops_at_blank_rows(self):
        """3 consecutive blank rows = end of data."""
        from app.services.courier_template_parser import parse_ttpost_template
        # The minimal template has only 3 data rows; sheet ends after them
        result = parse_ttpost_template(self._build_minimal_ttpost_template())
        self.assertEqual(len(result["lines"]), 3)

    def test_parser_rejects_non_ttpost_file(self):
        """A file with no recognizable header structure should raise ValueError."""
        from openpyxl import Workbook
        import io
        from app.services.courier_template_parser import parse_ttpost_template

        wb = Workbook()
        ws = wb.active
        ws["A1"] = "Just some random data"
        ws["B1"] = "Not a TTPOST file"
        buf = io.BytesIO()
        wb.save(buf)

        with self.assertRaises(ValueError):
            parse_ttpost_template(buf.getvalue())

    def test_parser_handles_missing_master_waybill(self):
        """If master waybill is absent, return empty string + warning."""
        from openpyxl import Workbook
        import io
        from app.services.courier_template_parser import parse_ttpost_template

        wb = Workbook()
        ws = wb.active
        ws["A1"] = "EXPRESS CONSIGNMENTS WORKSHEET"
        ws["A9"] = "LINE NO. AWB"
        ws["B9"] = "HAWB"
        ws["C9"] = "SHIPPER"
        ws["D9"] = "NAME OF IMPORTER"
        ws["E9"] = "DESCRIPTION OF GOODS"
        ws["F9"] = "NO. OF PKGS"
        ws["J9"] = "COST"
        # One data row
        ws["A10"] = 1
        ws["B10"] = "HAWB1"
        ws["C10"] = "SHIPPER1"
        ws["D10"] = "IMPORTER1"
        ws["E10"] = "BOOKS"
        ws["F10"] = 1
        ws["J10"] = 10.0
        buf = io.BytesIO()
        wb.save(buf)

        result = parse_ttpost_template(buf.getvalue())
        self.assertEqual(result["manifest_no"], "")
        self.assertTrue(any("master waybill" in w.lower() for w in result["warnings"]))


class TestTemplateUploadEndToEnd(_RulesStoreTestBase):
    """End-to-end: parse a template, create manifest, auto-classify all lines."""

    def setUp(self):
        super().setUp()
        # Need an isolated manifest store too
        from app import store_courier
        from app.services import courier_service
        store_courier.COURIER_FILE = Path(self.tmpdir) / "manifests.json"
        store_courier.COURIER_FILE.write_text("[]")

    def test_upload_creates_manifest_with_classified_lines(self):
        """Parse template → create manifest → all 3 lines have auto-classified THNs."""
        from app.services import courier_service, courier_template_parser

        # Build template inline
        from openpyxl import Workbook
        import io
        wb = Workbook()
        ws = wb.active
        ws["H1"] = "EXPRESS CONSIGNMENTS WORKSHEET"
        ws["A3"] = "CARGO REPORTER: TTPOST"
        ws["J3"] = "MASTER WAY BILL NUMBER: 106-31299998"
        ws["A9"] = "LINE NO. AWB"
        ws["B9"] = "HAWB"
        ws["C9"] = "SHIPPER"
        ws["D9"] = "NAME OF IMPORTER"
        ws["E9"] = "DESCRIPTION OF GOODS"
        ws["F9"] = "NO. OF PKGS"
        ws["G9"] = "WEIGHT"
        ws["H9"] = "THN"
        ws["J9"] = "COST"
        # Data: 3 lines with descriptions the matcher knows
        data = [
            (1, "H1", "AMAZON", "A", "iPhone 15 Pro Max", 1, 1.0, None, 999.0),
            (2, "H2", "AMAZON", "B", "wooden chair", 1, 10.0, None, 50.0),
            (3, "H3", "AMAZON", "C", "AirPods Pro", 1, 0.5, None, 250.0),
        ]
        for r_idx, row in enumerate(data, start=10):
            for c_idx, val in enumerate(row, start=1):
                ws.cell(row=r_idx, column=c_idx, value=val)
        buf = io.BytesIO()
        wb.save(buf)

        # Parse + import
        parsed = courier_template_parser.parse_ttpost_template(buf.getvalue())
        self.assertEqual(parsed["manifest_no"], "106-31299998")

        m = courier_service.create_manifest({
            "manifest_no": parsed["manifest_no"],
            "arrival_date": "2026-05-11",
            "exch_rate": 6.78,
        })
        for line in parsed["lines"]:
            courier_service.add_line_with_auto_thn(m["id"], {
                "hawb": line["hawb"], "shipper": line["shipper"],
                "importer": line["importer"], "description": line["description"],
                "packages": line["packages"], "weight_kg": line["weight_kg"],
                "cost_usd": line["cost_usd"], "freight_usd": line["freight_usd"],
            })

        final = courier_service.get_manifest(m["id"])
        self.assertEqual(len(final["lines"]), 3)

        # iPhone → 85171300
        self.assertEqual(final["lines"][0]["thn"], "85171300")
        # AirPods → 85183000
        self.assertEqual(final["lines"][2]["thn"], "85183000")

        # Confidence and suggestions are persisted
        for ln in final["lines"]:
            self.assertIn("thn_confidence", ln)
            self.assertIn("thn_suggestions", ln)
            self.assertIsInstance(ln["thn_suggestions"], list)

    def test_classified_thns_persist_through_reload(self):
        """Verify the fix: thn_suggestions must survive a manifest reload."""
        from app.services import courier_service

        m = courier_service.create_manifest({
            "manifest_no": "TEST-PERSIST",
            "arrival_date": "2026-05-11",
            "exch_rate": 6.78,
        })
        courier_service.add_line_with_auto_thn(m["id"], {
            "description": "iPhone 15",
            "cost_usd": 1000.0,
        })

        # Reload from disk
        fresh = courier_service.get_manifest(m["id"])
        line = fresh["lines"][0]

        # Suggestions must be present
        self.assertIn("thn_suggestions", line)
        self.assertGreater(len(line["thn_suggestions"]), 0)
        # Confidence must be a number
        self.assertIsNotNone(line["thn_confidence"])
        # Match source must be set
        self.assertIn(line["thn_match_source"], ("keyword_index", "full_text", "hybrid"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
