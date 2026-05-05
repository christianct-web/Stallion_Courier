from __future__ import annotations
import fcntl
import json
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, Any, List

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
DATA.mkdir(parents=True, exist_ok=True)

TEMPLATES_FILE = DATA / "templates.json"
if not TEMPLATES_FILE.exists():
    TEMPLATES_FILE.write_text("[]", encoding="utf-8")

DECLARATIONS_FILE = DATA / "declarations.json"
if not DECLARATIONS_FILE.exists():
    DECLARATIONS_FILE.write_text("[]", encoding="utf-8")

# ── File-locking helpers ─────────────────────────────────────────────────────
# Uses fcntl.flock for advisory locking + atomic rename to prevent
# race conditions between concurrent requests.

_LOCK_DIR = DATA / ".locks"
_LOCK_DIR.mkdir(parents=True, exist_ok=True)


@contextmanager
def _file_lock(filepath: Path):
    """
    Advisory file lock scoped to a specific JSON data file.
    Blocks until the lock is available (LOCK_EX).
    """
    lock_path = _LOCK_DIR / f"{filepath.stem}.lock"
    fd = open(lock_path, "w")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        fd.close()


def _safe_read(filepath: Path) -> List[Dict[str, Any]]:
    """Read JSON list from file under advisory lock."""
    with _file_lock(filepath):
        return json.loads(filepath.read_text(encoding="utf-8"))


def _safe_write(filepath: Path, items: List[Dict[str, Any]]) -> None:
    """
    Atomic write: write to a temp file in the same directory,
    then rename over the target. Prevents partial writes on crash.
    """
    with _file_lock(filepath):
        fd, tmp_path = tempfile.mkstemp(
            dir=str(filepath.parent), suffix=".tmp", prefix=filepath.stem
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(items, f, indent=2)
            os.replace(tmp_path, str(filepath))  # atomic on POSIX
        except BaseException:
            # Clean up temp file on any failure
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

LOOKUPS: Dict[str, List[Dict[str, Any]]] = {
    "ports": [
        {"code": "01", "label": "Port Chaguaramas", "asycudaCode": "", "transportMethod": "1"},
        {"code": "02", "label": "Port Point Gourde", "asycudaCode": "", "transportMethod": "1"},
        {"code": "03", "label": "Port Tembladora", "asycudaCode": "", "transportMethod": "1"},
        {"code": "04", "label": "Port of Spain", "asycudaCode": "TTPOS", "transportMethod": "1"},
        {"code": "04A", "label": "Queen's Wharf", "asycudaCode": "TTPOS", "transportMethod": "1"},
        {"code": "05", "label": "Point Lisas", "asycudaCode": "TTPTS", "transportMethod": "1"},
        {"code": "06", "label": "Pointe a Pierre", "asycudaCode": "TTPTP", "transportMethod": "1"},
        {"code": "07", "label": "San Fernando", "asycudaCode": "TTSFE", "transportMethod": "1"},
        {"code": "09", "label": "Point Fortin", "asycudaCode": "", "transportMethod": "1"},
        {"code": "10", "label": "Point Galeota", "asycudaCode": "", "transportMethod": "1"},
        {"code": "11", "label": "Scarborough", "asycudaCode": "TTSCA", "transportMethod": "1"},
        {"code": "12", "label": "Piarco", "asycudaCode": "TTPIA", "transportMethod": "4"},
        {"code": "13", "label": "Crown Point", "asycudaCode": "TTTGO", "transportMethod": "4"},
    ],
    "terms": [
        {"code": "06", "abbr": "CAI", "label": "Cost and Insurance"},
        {"code": "03", "abbr": "CFR", "label": "Cost and freight"},
        {"code": "01", "abbr": "CIF", "label": "Cost, Insurance and Freight"},
        {"code": "05", "abbr": "EXW", "label": "Ex Works"},
        {"code": "04", "abbr": "FAS", "label": "Free Alongside Ship"},
        {"code": "08", "abbr": "FCA", "label": "Free carrier"},
        {"code": "02", "abbr": "FOB", "label": "Free On Board"},
        {"code": "00", "abbr": "N/A", "label": "Not Applicable"},
        {"code": "07", "abbr": "PP", "label": "Prepaid In Full"}
    ],
    "packages": [
        {"code": "11", "abbr": "tu.", "asycudaCode": "TU", "label": "Tubes"},
        {"code": "21", "abbr": "tn.", "asycudaCode": "TN", "label": "Tins"},
        {"code": "40", "abbr": "lv.", "asycudaCode": "LV", "label": "Lift Van"},
        {"code": "41", "abbr": "cr.", "asycudaCode": "CR", "label": "Crate"},
        {"code": "42", "abbr": "ct.", "asycudaCode": "CT", "label": "Carton"},
        {"code": "43", "abbr": "cs.", "asycudaCode": "CS", "label": "Case"},
        {"code": "44", "abbr": "ck.", "asycudaCode": "CK", "label": "Cask(s)"},
        {"code": "45", "abbr": "cn.", "asycudaCode": "CN", "label": "Steel Container for Transport"},
        {"code": "46", "abbr": "cl.", "asycudaCode": "CL", "label": "Coil"},
        {"code": "47", "abbr": "bl.", "asycudaCode": "BL", "label": "Bale (compressed)"},
        {"code": "48", "abbr": "bn.", "asycudaCode": "BN", "label": "Bale (not compressed)"},
        {"code": "49", "abbr": "vy.", "asycudaCode": "VY", "label": "Bulk (solid)"},
        {"code": "50", "abbr": "vr.", "asycudaCode": "VR", "label": "Bulk (grains)"},
        {"code": "51", "abbr": "vl.", "asycudaCode": "VL", "label": "Bulk (liquids)"},
        {"code": "52", "abbr": "vq.", "asycudaCode": "VQ", "label": "Bulk (liquified gas)"},
        {"code": "53", "abbr": "ba.", "asycudaCode": "BA", "label": "Barrels"},
        {"code": "54", "abbr": "be.", "asycudaCode": "BE", "label": "Bundle"},
        {"code": "55", "abbr": "bg.", "asycudaCode": "BG", "label": "Bag"},
        {"code": "56", "abbr": "ms.", "asycudaCode": "MS", "label": "Multi-wall Sack"},
        {"code": "57", "abbr": "cy.", "asycudaCode": "CY", "label": "Cylinder"},
        {"code": "58", "abbr": "sp.", "asycudaCode": "SP", "label": "Spool"},
        {"code": "59", "abbr": "en.", "asycudaCode": "EN", "label": "Envelopes"},
        {"code": "60", "abbr": "enc.", "asycudaCode": "ENC", "label": "Enclosure"},
        {"code": "61", "abbr": "ro.", "asycudaCode": "RO", "label": "Roll"},
        {"code": "62", "abbr": "dr.", "asycudaCode": "DR", "label": "Drum"},
        {"code": "63", "abbr": "pl.", "asycudaCode": "PL", "label": "Pail"},
        {"code": "64", "abbr": "ne.", "asycudaCode": "NE", "label": "Unpacked"},
        {"code": "65", "abbr": "st.", "asycudaCode": "ST", "label": "Sheet"},
        {"code": "66", "abbr": "su.", "asycudaCode": "SU", "label": "Suitcase"},
        {"code": "67", "abbr": "pp.", "asycudaCode": "PX", "label": "Pallet"},
        {"code": "68", "abbr": "kg.", "asycudaCode": "KG", "label": "Keg"},
        {"code": "69", "abbr": "ts", "asycudaCode": "SI", "label": "Skid"},
        {"code": "70", "abbr": "pk.", "asycudaCode": "PK", "label": "Package"}
    ],
    "duty_tax_codes": [
        {"code": "01", "abbr": "IM.DTY", "label": "Import Duty"},
        {"code": "02", "abbr": "ST.DTY", "label": "Stamp Duty"},
        {"code": "03", "abbr": "CC.DTY", "label": "Caricom Import Duty"},
        {"code": "04", "abbr": "SP.TAX", "label": "Special Tax (Household Effects)"},
        {"code": "05", "abbr": "SU.CHG", "label": "Import Surcharge"},
        {"code": "06", "abbr": "AB.TAX", "label": "Alcoholic Beverage Tax"},
        {"code": "07", "abbr": "TO.TAX", "label": "Tobacco Tax"},
        {"code": "08", "abbr": "PA.DTY", "label": "Partial Scope Agreement Duty"},
        {"code": "19", "abbr": "MV.TAX", "label": "Motor Vehicle Tax"},
        {"code": "20", "abbr": "VAT", "label": "Value Added Tax"},
        {"code": "24", "abbr": "ADD", "label": "Anti Dumping Duty"}
    ],
    "duty_tax_bases": [
        {"code": "02", "label": "Kilogram"},
        {"code": "10", "label": "Litre"},
        {"code": "12", "label": "Litre of Alcohol by Volume"},
        {"code": "24", "label": "Customs Value (CIF)"},
        {"code": "30", "label": "Customs Value 2% Brk. Wine, Oil"},
        {"code": "31", "label": "Litres (2% Breakage on Spirit)"},
        {"code": "35", "label": "Motor Vehicle Tax"},
        {"code": "40", "label": "Litre of Beer at Gravity 1050"},
        {"code": "41", "label": "Hundred Metre of Cine-Film"},
        {"code": "42", "label": "Packet of Twenty Cigarettes"},
        {"code": "43", "label": "Value for Value Added Tax"},
        {"code": "44", "label": "Dozen"}
    ],
    "cpc_codes": [
        {"code": "C4", "label": "Goods entered for domestic use", "cpc": "C400"},
        {"code": "C5", "label": "Goods imported temporarily for subsequent re-export", "cpc": "C500"},
        {"code": "C6", "label": "Goods re-imported", "cpc": "C600"},
        {"code": "C7", "label": "Warehouse to Warehouse transactions", "cpc": "C700"},
        {"code": "C9", "label": "Goods imported subject to special procedures", "cpc": "C900"},
        {"code": "E1", "label": "Goods exported as cargo", "cpc": "E100"},
        {"code": "E2", "label": "Goods exported as cargo under International Tr...", "cpc": "E200", "asycudaSub1": "1000", "asycudaSub2": "000", "preference": "CARICOM"},
        {"code": "E3", "label": "Goods exported as ship's stores", "cpc": "E300"},
        {"code": "E4", "label": "Goods Temporarily exported", "cpc": "E400"},
        {"code": "E5", "label": "Goods exported from an in-bond shop", "cpc": "E500"},
        {"code": "E9", "label": "Goods exported subject to special procedures", "cpc": "E900"},
        {"code": "S7", "label": "Goods entered for warehousing", "cpc": "S700"},
        {"code": "S8", "label": "Goods entered for transhipment", "cpc": "S800"}
    ],
    "customs_regimes": [
        {"regimeCode": "C4", "asycudaSubCode": "4", "asycudaCode": "IM", "label": "Goods entered for domestic use"},
        {"regimeCode": "C5", "asycudaSubCode": "5", "asycudaCode": "IM", "label": "Goods imported temporarily for subsequent re-export"},
        {"regimeCode": "C6", "asycudaSubCode": "6", "asycudaCode": "IM", "label": "Goods re-imported"},
        {"regimeCode": "C7", "asycudaSubCode": "7", "asycudaCode": "IM", "label": "Warehouse to Warehouse transactions"},
        {"regimeCode": "C9", "asycudaSubCode": "9", "asycudaCode": "IM", "label": "Goods imported subject to special procedures"},
        {"regimeCode": "E1", "asycudaSubCode": "1", "asycudaCode": "EX", "label": "Goods exported as cargo"},
        {"regimeCode": "E2", "asycudaSubCode": "1", "asycudaCode": "EX", "label": "Goods exported as cargo under International Trading Agreements"},
        {"regimeCode": "E3", "asycudaSubCode": "3", "asycudaCode": "EX", "label": "Goods exported as ship's stores"},
        {"regimeCode": "E4", "asycudaSubCode": "4", "asycudaCode": "EX", "label": "Goods Temporarily exported"},
        {"regimeCode": "E5", "asycudaSubCode": "5", "asycudaCode": "EX", "label": "Goods exported from an in-bond shop"},
        {"regimeCode": "E9", "asycudaSubCode": "9", "asycudaCode": "EX", "label": "Goods exported subject to special procedures"},
        {"regimeCode": "S7", "asycudaSubCode": "7", "asycudaCode": "IM", "label": "Goods entered for warehousing"},
        {"regimeCode": "S8", "asycudaSubCode": "8", "asycudaCode": "TS", "label": "Goods entered for transhipment"}
    ],
    "transport_modes": [
        {"code": "41", "label": "Air Transport [Express Courier]"},
        {"code": "42", "label": "Air Transport [Loose]"},
        {"code": "11", "label": "Marine Transport [Bulk]"},
        {"code": "12", "label": "Marine Transport [Container]"},
        {"code": "13", "label": "Marine Transport [Loose]"},
        {"code": "14", "label": "Marine Transport [Refrig Container]"},
        {"code": "99", "label": "Mode Unknown"},
        {"code": "52", "label": "Parcel Post (Air)"},
        {"code": "51", "label": "Parcel Post (Surface)"}
    ],
    "unit_codes": [
        {"code": "01", "abbr": "nar.", "asycudaCode": "NMB", "label": "Number of Articles"},
        {"code": "02", "abbr": "npr.", "asycudaCode": "NPR", "label": "Number of Pairs"},
        {"code": "09", "abbr": "ltr.", "asycudaCode": "LTR", "label": "Litre"},
        {"code": "19", "abbr": "lcl.", "asycudaCode": "ASV", "label": "Litre of Alcohol"},
        {"code": "21", "abbr": "kwh.", "asycudaCode": "KWH", "label": "Kilowatt Hour"},
        {"code": "35", "abbr": "cc.", "asycudaCode": "CQM", "label": "Engine Size (cc)"},
        {"code": "41", "abbr": "kgm.", "asycudaCode": "KGM", "label": "Kilogram"},
        {"code": "44", "abbr": "cct.", "asycudaCode": "CCT", "label": "Hundred Containers"},
        {"code": "45", "abbr": "mtc.", "asycudaCode": "MTC", "label": "Thousand Match"},
        {"code": "46", "abbr": "mtr.", "asycudaCode": "MTR", "label": "Metre"},
        {"code": "47", "abbr": "mtk.", "asycudaCode": "MTK", "label": "Square Metre"},
        {"code": "48", "abbr": "mtq.", "asycudaCode": "MTQ", "label": "Cubic Metre"},
        {"code": "49", "abbr": "ctm.", "asycudaCode": "CTM", "label": "Metric Carats"},
        {"code": "51", "abbr": "msh.", "asycudaCode": "MSH", "label": "Thousand Shingle"}
    ],
    "box23_types": [
        {"type": "CES", "label": "CONTAINER EX FEE", "amount": 1050.0, "auto": True},
        {"type": "CES FEE", "label": "CONTAINER EX FEE", "amount": 750.0, "auto": True},
        {"type": "CFU", "label": "Customs User Fee", "amount": 80.0, "auto": True},
        {"type": "DEP.", "label": "DEPOSIT", "amount": 0.0, "auto": False}
    ],
    "hs_tariff_samples": [
        {"description": "MOSQUITO NETS", "tariff": "63023900000", "taxes": [{"code": "IM.DTY", "rate": 20.0}, {"code": "VAT", "rate": 12.5}]},
        {"description": "PACKING TAPE", "tariff": "39191000000"},
        {"description": "PHONE ACCESSORIES", "tariff": "39269090900"},
        {"description": "PHONE CASES", "tariff": "42023210000"},
        {"description": "PHONE HOLDERS", "tariff": "39269090000"},
        {"description": "PILLOW RESTS", "tariff": "63019000000"},
        {"description": "PL ITEMS", "tariff": "39269090000"},
        {"description": "PLASTIC CASE", "tariff": "42029290000"},
        {"description": "PLASTIC CHAIRS", "tariff": "94018000000"},
        {"description": "PLASTIC ITEMS", "tariff": "39249090000"}
    ],
}


def load_templates() -> List[Dict[str, Any]]:
    return _safe_read(TEMPLATES_FILE)


def save_templates(items: List[Dict[str, Any]]) -> None:
    _safe_write(TEMPLATES_FILE, items)


def load_declarations() -> List[Dict[str, Any]]:
    return _safe_read(DECLARATIONS_FILE)


def save_declarations(items: List[Dict[str, Any]]) -> None:
    _safe_write(DECLARATIONS_FILE, items)
