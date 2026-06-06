"""
checklist_service.py — Stallion declaration checklist / pre-submission check.

Produces a single report structure used in two places in the UI:

  1. Right after document extraction — "here is what we pulled from your
     document, and what still needs a human." Driven by the parsed Claude
     extraction (which fields came back null, the model's own notes and
     confidence, plus permit/risk keyword flags).

  2. As a pre-submission gate before Generate C82 XML — the same shape, but
     computed from the current sheet state (header + lines + computed totals),
     catching missing freight, low-confidence HS lines, zero values, etc.

The report is intentionally UI-agnostic: a list of typed items the frontend
renders as a checklist. Severity drives colour; `field` lets the UI deep-link
to the relevant input.

    item = {
      "field":    "freight",            # machine key (optional)
      "label":    "Freight",            # human label
      "status":   "ok|missing|review",  # drives the icon/colour
      "severity": "critical|warn|info", # how loud
      "detail":   "short explanation",  # optional
    }

Severity vs status:
  - status "ok"      → found / passes
  - status "missing" → absent and (often) required
  - status "review"  → present but the broker should verify
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


# Fields TT customs treats as required for a C82 import entry. Kept here as the
# single source of truth so the extraction view and the pre-submission view
# agree on what "critical" means.
CRITICAL_HEADER_FIELDS = [
    ("consignee", "Consignee"),
    ("invoice_no", "Invoice number"),
    ("currency", "Currency"),
]

# Fields that are not strictly required but materially affect the assessment,
# so their absence should warn rather than block.
IMPORTANT_HEADER_FIELDS = [
    ("freight_usd", "Freight"),
    ("consignor", "Consignor / supplier"),
    ("bl_number", "BL / AWB number"),
    ("arrival_date", "Arrival date"),
    ("port", "Port"),
    ("incoterm", "Incoterm"),
]

# Risk keywords → why it matters. Mirrors the doc's risk-detection MVP: a
# simple keyword pass that flags goods likely to need a permit or extra checks.
RISK_KEYWORDS: Dict[str, str] = {
    "battery": "Batteries may require special handling / dangerous-goods checks.",
    "supplement": "Supplements may require Chemistry, Food & Drugs clearance.",
    "vitamin": "Supplements may require Chemistry, Food & Drugs clearance.",
    "cosmetic": "Cosmetics may require Chemistry, Food & Drugs clearance.",
    "food": "Food items may require Chemistry, Food & Drugs clearance.",
    "drug": "May require Chemistry, Food & Drugs / Ministry of Health approval.",
    "medical": "Medical devices may require Ministry of Health approval.",
    "wireless": "Wireless devices may require TATT telecoms approval.",
    "bluetooth": "Wireless devices may require TATT telecoms approval.",
    "router": "Telecoms equipment may require TATT approval.",
    "alcohol": "Alcohol attracts excise and may require a permit.",
    "tobacco": "Tobacco attracts excise and may require a permit.",
    "plant": "Plants/agriculture may require a phytosanitary permit.",
    "seed": "Seeds may require a phytosanitary permit.",
    "firearm": "Firearms/ammunition require police and import permits.",
    "ammunition": "Firearms/ammunition require police and import permits.",
}

# HS classifier confidence below this is surfaced for review.
LOW_CONF = 0.5


def _present(v: Any) -> bool:
    """A field counts as present if it's a non-empty, non-zero value."""
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() != ""
    if isinstance(v, (int, float)):
        return v != 0
    return bool(v)


def _scan_risk(text: str) -> List[Dict[str, str]]:
    """Return risk items for any risk keyword found in `text`."""
    if not text:
        return []
    low = text.lower()
    seen: set = set()
    out: List[Dict[str, str]] = []
    for kw, why in RISK_KEYWORDS.items():
        if kw in low and why not in seen:
            seen.add(why)
            out.append({
                "field": "risk",
                "label": f"Possible permit/risk: '{kw}'",
                "status": "review",
                "severity": "warn",
                "detail": why,
            })
    return out


def build_extraction_report(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build the post-extraction checklist from the raw Claude extraction object.

    Reads which critical/important fields came back populated, folds in the
    model's own `notes` and `confidence`, and runs a risk keyword scan over the
    extracted descriptions.
    """
    items: List[Dict[str, Any]] = []

    # Map the extractor's camelCase keys to our labels + severity.
    extracted_critical = [
        ("consigneeName", "Consignee"),
        ("invoiceNumber", "Invoice number"),
        ("currency", "Currency"),
        ("invoiceValueForeign", "Invoice value"),
    ]
    extracted_important = [
        ("freightCharges", "Freight"),
        ("consignorName", "Consignor / supplier"),
        ("blAwbNumber", "BL / AWB number"),
        ("shippedOnBoardDate", "Arrival / shipped date"),
        ("deliveryTerms", "Incoterm"),
        ("countryOfOrigin", "Country of origin"),
        ("packageCount", "Package count"),
    ]

    for key, label in extracted_critical:
        ok = _present(parsed.get(key))
        items.append({
            "field": key, "label": label,
            "status": "ok" if ok else "missing",
            "severity": "critical",
            "detail": "" if ok else "Required for a C82 entry — not found in the document.",
        })

    for key, label in extracted_important:
        ok = _present(parsed.get(key))
        items.append({
            "field": key, "label": label,
            "status": "ok" if ok else "missing",
            "severity": "warn",
            "detail": "" if ok else "Not found — add manually if it applies.",
        })

    # Line items count.
    lines = parsed.get("lineItems") or []
    items.append({
        "field": "lineItems",
        "label": f"{len(lines)} line item{'s' if len(lines) != 1 else ''} extracted",
        "status": "ok" if lines else "missing",
        "severity": "critical" if not lines else "info",
        "detail": "" if lines else "No line items found — add at least one.",
    })

    # Model's own attention notes.
    for note in parsed.get("notes") or []:
        if isinstance(note, str) and note.strip():
            items.append({
                "field": "note", "label": note.strip(),
                "status": "review", "severity": "info", "detail": "",
            })

    # Risk scan over all descriptions.
    desc_blob = " ".join(
        str(li.get("description") or "") for li in lines
    ) + " " + str(parsed.get("description") or "")
    items.extend(_scan_risk(desc_blob))

    return _summarise(items, confidence=parsed.get("confidence"))


def build_presubmission_report(sheet: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build the pre-submission checklist from the current sheet state.

    Same report shape as extraction, but computed from header + lines + totals
    so it catches things the broker may have left incomplete while working.
    """
    items: List[Dict[str, Any]] = []

    for key, label in CRITICAL_HEADER_FIELDS:
        ok = _present(sheet.get(key))
        items.append({
            "field": key, "label": label,
            "status": "ok" if ok else "missing", "severity": "critical",
            "detail": "" if ok else "Required before submission.",
        })

    for key, label in IMPORTANT_HEADER_FIELDS:
        ok = _present(sheet.get(key))
        items.append({
            "field": key, "label": label,
            "status": "ok" if ok else "missing", "severity": "warn",
            "detail": "" if ok else "Missing — verify this isn't needed.",
        })

    lines = sheet.get("lines") or []
    if not lines:
        items.append({
            "field": "lines", "label": "Line items", "status": "missing",
            "severity": "critical", "detail": "At least one line is required.",
        })
    else:
        items.append({
            "field": "lines", "label": f"{len(lines)} line item(s)",
            "status": "ok", "severity": "info", "detail": "",
        })

        # Per-line checks: HS code present, value > 0, low-confidence flag.
        missing_hs = [l for l in lines if not _present(l.get("hs_code"))]
        if missing_hs:
            items.append({
                "field": "hs_code",
                "label": f"{len(missing_hs)} line(s) missing an HS code",
                "status": "missing", "severity": "critical",
                "detail": "Every line needs a classification before XML.",
            })

        zero_val = [l for l in lines if not _present(l.get("exworks_usd"))]
        if zero_val:
            items.append({
                "field": "exworks_usd",
                "label": f"{len(zero_val)} line(s) with zero value",
                "status": "review", "severity": "warn",
                "detail": "Zero-value lines are unusual — confirm they're correct.",
            })

        low_conf = [
            l for l in lines
            if l.get("hs_confidence") is not None and l["hs_confidence"] < LOW_CONF
        ]
        if low_conf:
            items.append({
                "field": "hs_confidence",
                "label": f"{len(low_conf)} low-confidence classification(s)",
                "status": "review", "severity": "warn",
                "detail": "The classifier wasn't sure — verify these codes.",
            })

        # Risk scan across line descriptions.
        blob = " ".join(str(l.get("description") or "") for l in lines)
        items.extend(_scan_risk(blob))

    # Computed-total sanity checks.
    totals = sheet.get("totals") or {}
    if _present(totals) and not _present(totals.get("cif_ttd")):
        items.append({
            "field": "cif_ttd", "label": "CIF total is zero",
            "status": "review", "severity": "warn",
            "detail": "Check exchange rate, freight, and line values.",
        })

    return _summarise(items)


def _summarise(items: List[Dict[str, Any]], confidence: Optional[float] = None) -> Dict[str, Any]:
    """Attach counts and a pass/fail verdict to the item list."""
    criticals = [i for i in items if i["severity"] == "critical" and i["status"] != "ok"]
    warns = [i for i in items if i["severity"] == "warn" and i["status"] != "ok"]
    return {
        "items": items,
        "counts": {
            "critical": len(criticals),
            "warn": len(warns),
            "ok": len([i for i in items if i["status"] == "ok"]),
            "total": len(items),
        },
        # Ready to submit only when nothing critical is outstanding.
        "ready": len(criticals) == 0,
        "confidence": confidence,
    }
