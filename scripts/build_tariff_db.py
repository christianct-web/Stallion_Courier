#!/usr/bin/env python3
"""
build_tariff_db.py — turn the TTBizLink scrape into Stallion's tariff DB,
and (separately) clean the legacy OCR DB so the page is usable even before
the scrape lands.

Two modes:

  # After running ttbizlink_scraper.py locally and uploading the result:
  python build_tariff_db.py --from-ttbizlink tt_tariff_db_ttbizlink.json \
      --out backend/data/tt_tariff_db_2024.json

  # Stopgap — repair the existing OCR DB in place using HS-code structure:
  python build_tariff_db.py --clean-ocr backend/data/tt_tariff_db_2024.json \
      --out backend/data/tt_tariff_db_2024.cleaned.json

The OCR cleaner does NOT invent data — it only:
  - fixes obvious OCR typos in descriptions (brocding→breeding, etc.)
  - propagates a chapter title prefix onto fragment descriptions
    ("rearing" → "Live animals — rearing") using the code hierarchy, so
    full-text search has real words to match
  - flags entries whose description looks copied from a wrong parent
The real fix is the TTBizLink data; this just makes the stopgap tolerable.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

# Minimal chapter-title map (same as the backend's, kept standalone so the
# script has no app imports).
CHAPTER_TITLES = {
    1: "Live animals", 2: "Meat", 3: "Fish & seafood", 4: "Dairy & eggs",
    5: "Other animal products", 6: "Live plants", 7: "Vegetables",
    8: "Fruit & nuts", 9: "Coffee, tea, spices", 10: "Cereals",
    11: "Milling products", 12: "Oil seeds", 13: "Gums & resins",
    14: "Vegetable plaiting materials", 15: "Fats & oils",
    16: "Meat/fish preparations", 17: "Sugars", 18: "Cocoa",
    19: "Cereal preparations", 20: "Vegetable/fruit preparations",
    21: "Edible preparations", 22: "Beverages & spirits",
    23: "Food residues", 24: "Tobacco", 25: "Salt & stone",
    26: "Ores", 27: "Mineral fuels", 28: "Inorganic chemicals",
    29: "Organic chemicals", 30: "Pharmaceuticals", 31: "Fertilizers",
    32: "Dyeing extracts", 33: "Cosmetics & perfumery", 34: "Soap & waxes",
    35: "Glues", 36: "Explosives", 37: "Photographic goods",
    38: "Chemical products", 39: "Plastics", 40: "Rubber",
    41: "Raw hides & leather", 42: "Leather articles & handbags",
    43: "Furskins", 44: "Wood", 45: "Cork", 46: "Basketware",
    47: "Wood pulp", 48: "Paper", 49: "Books & printed matter",
    50: "Silk", 51: "Wool", 52: "Cotton", 53: "Vegetable fibres",
    54: "Man-made filaments", 55: "Man-made staple fibres",
    56: "Wadding & felt", 57: "Carpets", 58: "Special woven fabrics",
    59: "Coated fabrics", 60: "Knitted fabrics", 61: "Knitted apparel",
    62: "Woven apparel", 63: "Other textile articles", 64: "Footwear",
    65: "Headgear", 66: "Umbrellas", 67: "Artificial flowers & feathers",
    68: "Stone & cement articles", 69: "Ceramics", 70: "Glass",
    71: "Jewellery & precious metals", 72: "Iron & steel",
    73: "Iron/steel articles", 74: "Copper", 75: "Nickel",
    76: "Aluminium", 78: "Lead", 79: "Zinc", 80: "Tin",
    81: "Other base metals", 82: "Tools & cutlery",
    83: "Metal articles", 84: "Machinery", 85: "Electrical & electronics",
    86: "Railway equipment", 87: "Vehicles", 88: "Aircraft",
    89: "Ships", 90: "Optical/medical instruments", 91: "Clocks & watches",
    92: "Musical instruments", 93: "Arms & ammunition",
    94: "Furniture & lighting", 95: "Toys & games",
    96: "Miscellaneous manufactures", 97: "Works of art",
}

OCR_FIXES = {
    "brocding": "breeding", "brecding": "breeding", "rcaring": "rearing",
    "forrearing": "for rearing", "fonearing": "for rearing",
    "anlmals": "animals", "anirnals": "animals", "vehicics": "vehicles",
    "machlnery": "machinery", "l-": "Other", "—": "-",
}

FRAGMENT_RE = re.compile(
    r"^(?:-|–|\+)?\s*(?:other|for\s+\w+|rearing|breeding|of\s+\w+|\w{1,12})\s*[,.\-]?$",
    re.I,
)


def _fix_ocr(text: str) -> str:
    t = text or ""
    low = t.lower()
    for bad, good in OCR_FIXES.items():
        if bad in low:
            t = re.sub(re.escape(bad), good, t, flags=re.I)
            low = t.lower()
    return t.strip()


def clean_ocr(db_path: Path, out_path: Path) -> None:
    db = json.loads(db_path.read_text())
    entries = db.get("entries", db if isinstance(db, list) else [])
    fixed, prefixed, flagged = 0, 0, 0
    for e in entries:
        thn = str(e.get("thn") or "")
        ch = int(thn[:2]) if thn[:2].isdigit() else (e.get("chapter") or 0)
        desc = str(e.get("description") or "").strip()
        new = _fix_ocr(desc)
        if new != desc:
            fixed += 1
            desc = new
        # If the description is a bare fragment, prefix the chapter title so
        # full-text search has real words. We keep the original after a dash.
        if desc and FRAGMENT_RE.match(desc) and ch in CHAPTER_TITLES:
            title = CHAPTER_TITLES[ch]
            if title.lower() not in desc.lower():
                desc = f"{title} — {desc}"
                prefixed += 1
        elif not desc and ch in CHAPTER_TITLES:
            desc = CHAPTER_TITLES[ch]
            prefixed += 1
        if "sheep and goats" in desc.lower() and ch not in (1, 2, 4, 5):
            e["_review"] = "description may be from wrong parent heading"
            flagged += 1
        e["description"] = desc
        e["chapter"] = ch
    db["entries"] = entries
    db["cleaned"] = True
    out_path.write_text(json.dumps(db, indent=2, ensure_ascii=False))
    print(f"OCR clean: {fixed} typo fixes, {prefixed} chapter-prefixed, "
          f"{flagged} flagged for review → {out_path}")


def from_ttbizlink(src: Path, out_path: Path) -> None:
    src_db = json.loads(src.read_text())
    entries = src_db.get("entries", [])
    out = []
    for e in entries:
        thn = re.sub(r"\D", "", str(e.get("thn") or ""))[:8].ljust(8, "0")
        if len(thn) != 8:
            continue
        out.append({
            "thn": thn,
            "code": e.get("code") or f"{thn[:4]}.{thn[4:6]}.{thn[6:]}",
            "description": (e.get("description") or "").strip(),
            "dutyPct": e.get("dutyPct", 0),
            "vatPct": e.get("vatPct", 12.5),
            "optPct": e.get("optPct", 0),
            "surchargePct": e.get("surchargePct", 0),
            "restriction": e.get("restriction", ""),
            "isExempt": bool(e.get("isExempt", (e.get("dutyPct", 0) == 0))),
            "chapter": int(thn[:2]) if thn[:2].isdigit() else 0,
        })
    out.sort(key=lambda r: r["thn"])
    db = {
        "version": "ttbizlink-2026",
        "source": "TTBizLink SmartHS API",
        "entry_count": len(out),
        "entries": out,
    }
    out_path.write_text(json.dumps(db, indent=2, ensure_ascii=False))
    print(f"Built {len(out)} entries from TTBizLink → {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-ttbizlink")
    ap.add_argument("--clean-ocr")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    out = Path(args.out)
    if args.from_ttbizlink:
        from_ttbizlink(Path(args.from_ttbizlink), out)
    elif args.clean_ocr:
        clean_ocr(Path(args.clean_ocr), out)
    else:
        ap.error("pass --from-ttbizlink or --clean-ocr")


if __name__ == "__main__":
    main()
