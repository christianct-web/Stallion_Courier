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


if __name__ == "__main__":
    unittest.main(verbosity=2)
