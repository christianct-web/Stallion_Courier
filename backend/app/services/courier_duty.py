"""
Courier duty calculation engine for T&T express consignments.

This module encodes the calculation logic for TTPOST courier worksheets.
The rules themselves (exemptions, corrections, special cases) live in a
layered editable store managed by `courier_rules` — they are NOT
hard-coded here. This module reads them via the rules store interface.

Formula
-------
For each line item:
    cif_ttd      = (cost_usd + freight_usd) * exchange_rate
    duty         = cif_ttd * duty_rate           (0 if exempt)
    opt          = cif_ttd * 0.07                (0 if full_exempt)
    vat          = (cif_ttd + duty + opt) * 0.125  (0 if full_exempt)
    total_taxes  = duty + opt + vat

Exemption classes
-----------------
- "none"           : standard — pays duty + OPT + VAT at the THN rate
- "duty_free_only" : duty = 0 but OPT (7%) and VAT (12.5%) still apply
                     (e.g. THN 85176900 generic device, "FREE" CET rate)
- "full_exempt"    : duty = 0, OPT = 0, VAT = 0
                     (e.g. smartphones via 85171300 breakout, computer
                     accessories via 84733000, seeds, etc.)

The classifier uses (in priority order):
  1. Operational rules from the courier_rules store (user-editable):
     - exemptions (full_exempt or duty_free_only)
     - thn_corrections (wrong-THN guards)
  2. Tariff lookup (CET 2024 + tariff_overrides):
     - bundled CET DB merged with user-edited overrides

NOTE: The default rule set was encoded from operational experience with
TTPOST worksheets. It MUST be reviewed and signed off by a licensed
broker (Arnim Brathwaite) before being used for production declarations.
The audit trail in courier_rules tracks every change.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from . import courier_rules

logger = logging.getLogger("stallion.courier.duty")


# ── Constants ────────────────────────────────────────────────────────────────

OPT_RATE = 0.07     # Online Purchase Tax — 7% on CIF
VAT_RATE = 0.125    # Standard VAT — 12.5%

ROUND_PLACES = 2    # All TTD figures rounded to 2 decimal places


# ── THN classification result ────────────────────────────────────────────────


@dataclass
class ExemptionResult:
    """Result of classifying a THN for courier duty calculation."""

    exemption_class: str          # "none" | "duty_free_only" | "full_exempt"
    duty_rate: float              # The numeric duty rate (0.0 — 1.0)
    notes: str                    # Human-readable explanation
    is_corrected: bool = False    # True if THN was auto-corrected
    original_thn: str = ""        # Original THN if corrected
    is_unknown: bool = False      # True if THN not found in CET DB
    rule_source: str = ""         # "exemption" | "correction" | "cet" | "fallback"


# ── Tariff DB lookup ─────────────────────────────────────────────────────────
# Delegates to courier_rules.lookup_thn so user overrides are honoured.

def lookup_thn(thn: str) -> Optional[Dict[str, Any]]:
    """Return the tariff entry for an 8-digit THN, or None if not found.

    Looks up first in user tariff_overrides, then in the bundled CET 2024 DB.
    """
    return courier_rules.lookup_thn(thn)


def configure_db_path(path) -> None:
    """Override the bundled tariff DB path. Useful for tests."""
    courier_rules.configure_paths(bundled_tariff_path=path)


# ── Classification ───────────────────────────────────────────────────────────


def classify(thn: str) -> ExemptionResult:
    """
    Classify a THN for courier duty purposes.

    Resolution order:
      1. THN corrections — if user typed a wrong code, redirect
      2. Exemptions — full_exempt or duty_free_only operational rules
      3. Tariff DB lookup — CET 2024 with user overrides applied
      4. Unknown — flag for manual review
    """
    raw = thn.strip().replace(".", "")
    if not raw:
        return ExemptionResult(
            exemption_class="none", duty_rate=0.0,
            notes="Empty THN", is_unknown=True,
        )

    original = raw

    # Step 1: apply known corrections
    correction = courier_rules.get_correction(raw)
    if correction:
        new_thn = correction["correct_thn"]
        reason = correction.get("reason", f"{raw} corrected to {new_thn}")
        # Recursively classify the corrected THN, then mark as corrected
        inner = classify(new_thn)
        return ExemptionResult(
            exemption_class=inner.exemption_class,
            duty_rate=inner.duty_rate,
            notes=f"{reason}. {inner.notes}".strip(),
            is_corrected=True,
            original_thn=original,
            is_unknown=inner.is_unknown,
            rule_source="correction",
        )

    # Step 2: exemption rules (full_exempt and duty_free_only)
    exemption = courier_rules.get_exemption(raw)
    if exemption:
        return ExemptionResult(
            exemption_class=exemption["class"],   # "full_exempt" | "duty_free_only"
            duty_rate=0.0,
            notes=exemption.get("notes", ""),
            rule_source="exemption",
        )

    # Step 3: look up in tariff DB (CET + user overrides)
    entry = lookup_thn(raw)
    if entry is None:
        return ExemptionResult(
            exemption_class="none",
            duty_rate=0.0,
            notes=f"THN {raw} not found in 2024 CET; manual review required.",
            is_unknown=True,
            rule_source="fallback",
        )

    duty_pct = entry.get("dutyPct")
    if duty_pct is None or duty_pct == 0 or entry.get("isExempt"):
        # Tariff says Free — duty is zero but OPT and VAT still apply
        return ExemptionResult(
            exemption_class="duty_free_only",
            duty_rate=0.0,
            notes=f"CET 2024 rate Free; OPT and VAT still apply. {entry.get('description', '')[:60]}",
            rule_source="cet",
        )

    return ExemptionResult(
        exemption_class="none",
        duty_rate=float(duty_pct) / 100.0,
        notes=f"CET 2024 rate {duty_pct}%. {entry.get('description', '')[:60]}",
        rule_source="cet",
    )


# ── Calculation ──────────────────────────────────────────────────────────────


def _r(x: float) -> float:
    """Round to 2 decimal places (TTD)."""
    return round(x, ROUND_PLACES)


def calculate_line(
    cost_usd: float,
    freight_usd: float,
    exch_rate: float,
    thn: str,
    *,
    duty_rate_override: Optional[float] = None,
    exemption_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Calculate duty/OPT/VAT for one courier line item.

    Args
    ----
    cost_usd          : line cost in USD
    freight_usd       : line freight in USD (usually 0 for TTPOST)
    exch_rate         : CBTT exchange rate TTD/USD
    thn               : 8-digit THN classification code
    duty_rate_override: Optional. If provided, use this rate instead of
                        the classifier's rate (e.g., officer override).
    exemption_override: Optional. "none" | "duty_free_only" | "full_exempt"
                        (e.g., officer override).

    Returns
    -------
    Dict with keys:
        cif_ttd, duty, opt, vat, total_taxes,
        exemption_class, duty_rate, classifier_notes, rule_source,
        thn (final, possibly corrected), thn_was_corrected, thn_original,
        thn_unknown
    """
    if cost_usd is None or cost_usd < 0:
        raise ValueError(f"cost_usd must be >= 0 (got {cost_usd})")
    if freight_usd is None or freight_usd < 0:
        freight_usd = 0.0
    if exch_rate is None or exch_rate <= 0:
        raise ValueError(f"exch_rate must be > 0 (got {exch_rate})")

    cls = classify(thn)
    raw = thn.strip().replace(".", "")
    correction = courier_rules.get_correction(raw)
    final_thn = correction["correct_thn"] if (cls.is_corrected and correction) else raw

    # Apply overrides if provided
    if exemption_override is not None:
        if exemption_override not in ("none", "duty_free_only", "full_exempt"):
            raise ValueError(f"Invalid exemption_override: {exemption_override}")
        ex_class = exemption_override
    else:
        ex_class = cls.exemption_class

    if duty_rate_override is not None:
        duty_rate = float(duty_rate_override)
    else:
        duty_rate = cls.duty_rate

    cif_ttd = _r((cost_usd + freight_usd) * exch_rate)

    if ex_class == "full_exempt":
        duty = 0.0
        opt = 0.0
        vat = 0.0
    elif ex_class == "duty_free_only":
        duty = 0.0
        opt = _r(cif_ttd * OPT_RATE)
        vat = _r((cif_ttd + duty + opt) * VAT_RATE)
    else:  # "none"
        duty = _r(cif_ttd * duty_rate)
        opt = _r(cif_ttd * OPT_RATE)
        vat = _r((cif_ttd + duty + opt) * VAT_RATE)

    total_taxes = _r(duty + opt + vat)

    return {
        "cif_ttd": cif_ttd,
        "duty": duty,
        "opt": opt,
        "vat": vat,
        "total_taxes": total_taxes,
        "exemption_class": ex_class,
        "duty_rate": duty_rate,
        "classifier_notes": cls.notes,
        "rule_source": cls.rule_source,
        "thn": final_thn,
        "thn_was_corrected": cls.is_corrected,
        "thn_original": cls.original_thn or raw,
        "thn_unknown": cls.is_unknown,
    }


def calculate_manifest_totals(lines: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Sum line-level taxes for an entire manifest.

    Each input line must have keys: cif_ttd, duty, opt, vat, total_taxes
    (typically the output of calculate_line).
    """
    total_cif = sum(_r(l.get("cif_ttd") or 0) for l in lines)
    total_duty = sum(_r(l.get("duty") or 0) for l in lines)
    total_opt = sum(_r(l.get("opt") or 0) for l in lines)
    total_vat = sum(_r(l.get("vat") or 0) for l in lines)
    total_taxes = sum(_r(l.get("total_taxes") or 0) for l in lines)
    return {
        "total_cif_ttd": _r(total_cif),
        "total_duty": _r(total_duty),
        "total_opt": _r(total_opt),
        "total_vat": _r(total_vat),
        "total_taxes": _r(total_taxes),
    }


# ── Backward-compatibility shims ─────────────────────────────────────────────
# These read-only views into the rules store let any older code that
# imported the bare dicts continue to work.

def _exempt_thns_view() -> Dict[str, str]:
    """Compat shim: dict of full-exempt THNs to their notes."""
    rules = courier_rules.load_rules()
    return {
        e["thn"]: e.get("notes", "")
        for e in rules.get("exemptions", [])
        if e.get("class") == "full_exempt"
    }


def _duty_free_only_thns_view() -> Dict[str, str]:
    rules = courier_rules.load_rules()
    return {
        e["thn"]: e.get("notes", "")
        for e in rules.get("exemptions", [])
        if e.get("class") == "duty_free_only"
    }


def _thn_corrections_view() -> Dict[str, tuple]:
    rules = courier_rules.load_rules()
    return {
        c["wrong_thn"]: (c["correct_thn"], c.get("reason", ""))
        for c in rules.get("thn_corrections", [])
    }


# Property-style module attributes (read-only views for legacy code)
EXEMPT_THNS = _exempt_thns_view
DUTY_FREE_ONLY_THNS = _duty_free_only_thns_view
THN_CORRECTIONS = _thn_corrections_view


# ── Public surface ───────────────────────────────────────────────────────────

__all__ = [
    "OPT_RATE",
    "VAT_RATE",
    "ExemptionResult",
    "classify",
    "calculate_line",
    "calculate_manifest_totals",
    "lookup_thn",
    "configure_db_path",
]
