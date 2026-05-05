"""
Description-to-THN matcher for courier consignments.

Given a free-text item description (e.g. "smartphone case", "graphics card",
"baby clothes"), return ranked THN suggestions with confidence scores and
notes about courier-specific exemptions.

Strategy
--------
1. Pre-filter the description through a courier-specific keyword index that
   maps common courier item categories directly to known THNs. This
   handles the high-frequency cases: smartphones, cases, earphones, shoes,
   clothing, books, toys, etc. with very high confidence.

2. If no high-confidence match, fall back to keyword search over the full
   2024 CET database (5,240 entries), scoring matches by word overlap.

3. Optionally augment with the existing tariff_service Claude fallback
   for hard cases. (Not required — the primary path uses local data only.)

Each suggestion includes:
- thn          : 8-digit THN
- code         : Formatted XXXX.XX.XX
- description  : Official CET description
- duty_rate    : Numeric (e.g. 0.20 for 20%)
- duty_rate_raw: Display string (e.g. "20%", "Free", "EXEMPT")
- exemption_class
- confidence   : 0.0 — 1.0
- match_reason : Why this THN was suggested (for transparency)
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from . import courier_duty

logger = logging.getLogger("stallion.courier.matcher")


# ── Courier keyword index ────────────────────────────────────────────────────
# Maps free-text courier item descriptions to a canonical THN with high
# confidence. Order matters — earlier (more specific) entries win.
#
# Format: list of (regex_pattern, thn, fallback_duty_rate, confidence, match_reason)
# The regex is matched case-insensitively against the normalized description.
#
# fallback_duty_rate: A duty rate (0.0 — 1.0) used ONLY when the THN is not
# found in the CET DB (i.e., the OCR parse missed it). Operational reality
# from real TTPOST manifests, validated by your batch-processing experience.
# When the CET DB has the THN, the DB rate wins — this is just a safety net
# for data gaps.

COURIER_KEYWORD_INDEX: List[Tuple[str, str, float, float, str]] = [
    # ── Electronics ──────────────────────────────────────────────────────
    (r"\b(smart\s*phone|smartphone|iphone|cellphone|cell\s*phone|mobile\s*phone)\b",
        "85171300", 0.0, 0.95, "Smartphone — full exempt under 85171300"),
    (r"\b(phone\s*case|phone\s*cover|phone\s*holder|cellphone\s*case|cell\s*phone\s*case)\b",
        "39269090", 0.0, 0.92, "Cellphone case — full exempt as plastic accessory"),
    (r"\b(screen\s*protector|tempered\s*glass|phone\s*film)\b",
        "39269090", 0.0, 0.92, "Screen protector — full exempt as plastic accessory"),
    (r"\b(earphone|earbud|earpod|headphone|head\s*phone|airpod)\b",
        "85183000", 0.0, 0.95, "Earphones/headphones — full exempt"),
    (r"\b(graphics?\s*card|gpu|video\s*card)\b",
        "84733000", 0.0, 0.95, "Graphics card — computer accessory, full exempt"),
    (r"\b(motherboard|mainboard|main\s*board)\b",
        "84733000", 0.0, 0.92, "Motherboard — computer accessory, full exempt"),
    (r"\b(laptop\s*battery|notebook\s*battery|computer\s*battery)\b",
        "84733000", 0.0, 0.90, "Laptop battery — reclassified as computer accessory, full exempt"),
    (r"\b(ram|memory\s*module|ddr\d|sodimm|sd\s*card|memory\s*card|micro\s?sd)\b",
        "84733000", 0.0, 0.85, "Computer memory — full exempt as computer accessory"),
    (r"\b(ssd|hard\s*drive|hdd|solid\s*state)\b",
        "84733000", 0.0, 0.82, "Storage drive — full exempt as computer accessory"),
    (r"\b(usb\s*cable|charging\s*cable|charger\s*cable|usb\s*c)\b",
        "85444290", 0.20, 0.70, "USB cable — verify against CET 2024"),
    (r"\b(power\s*bank|portable\s*charger)\b",
        "85076000", 0.20, 0.75, "Power bank (lithium battery)"),
    (r"\b(laptop|notebook\s*computer|macbook)\b",
        "84713000", 0.0, 0.90, "Laptop computer"),
    (r"\b(tablet|ipad)\b",
        "84713000", 0.0, 0.85, "Tablet computer"),
    (r"\b(smart\s*watch|smartwatch|fitness\s*tracker|fitbit|apple\s*watch)\b",
        "85176900", 0.0, 0.75, "Smartwatch — duty-free only (CET Free)"),
    (r"\b(generic\s*device|iot\s*device)\b",
        "85176900", 0.0, 0.70, "Generic IoT device — duty-free only"),

    # ── Cosmetics / personal care ────────────────────────────────────────
    (r"\b(body\s*cream|body\s*lotion|body\s*wash|moisturi[sz]er|lotion)\b",
        "33049990", 0.20, 0.85, "Body care product"),
    (r"\b(perfume|cologne|fragrance|eau\s*de\s*toilette)\b",
        "33030000", 0.20, 0.85, "Perfume / fragrance"),
    (r"\b(makeup|make\s*up|cosmetic|lipstick|eyeliner|mascara|foundation)\b",
        "33049990", 0.20, 0.85, "Cosmetics / makeup"),
    (r"\b(shampoo|conditioner|hair\s*product)\b",
        "33051000", 0.20, 0.85, "Hair care product"),

    # ── Clothing & footwear ──────────────────────────────────────────────
    (r"\b(shoe|sneaker|trainer|boot|sandal|slipper|flip\s*flop|crocs?)\b",
        "64029990", 0.20, 0.80, "Footwear (rubber/plastic uppers most common)"),
    (r"\b(shirt|t\s*shirt|tshirt|blouse|top|tank\s*top)\b",
        "61091000", 0.20, 0.75, "Knitted shirt/top"),
    (r"\b(pants|trouser|jean|legging|shorts)\b",
        "61046900", 0.20, 0.75, "Trousers / pants"),
    (r"\b(dress|gown|skirt)\b",
        "61044900", 0.20, 0.75, "Dress / skirt"),
    (r"\b(jacket|coat|hoodie|sweater|sweatshirt)\b",
        "61102000", 0.20, 0.75, "Jacket / outerwear"),
    (r"\b(underwear|panty|panties|brief|boxer)\b",
        "61089100", 0.20, 0.75, "Underwear"),
    (r"\b(bra|brassiere|lingerie)\b",
        "62121000", 0.20, 0.85, "Brassiere / lingerie"),
    (r"\b(sock|stocking|hose|hosiery)\b",
        "61159500", 0.20, 0.75, "Socks / stockings"),
    (r"\b(hat|cap|beanie|headwear)\b",
        "65050090", 0.20, 0.75, "Hat / cap"),

    # ── Bags ─────────────────────────────────────────────────────────────
    (r"\b(handbag|hand\s*bag|purse|wallet|clutch)\b",
        "42022200", 0.20, 0.78, "Handbag / purse"),
    (r"\b(backpack|back\s*pack|knapsack|rucksack|book\s*bag)\b",
        "42029200", 0.20, 0.78, "Backpack"),
    (r"\b(suitcase|luggage|travel\s*bag|trolley\s*bag)\b",
        "42021200", 0.20, 0.78, "Suitcase / luggage"),

    # ── Home & decor ─────────────────────────────────────────────────────
    (r"\b(rug|carpet|mat)\b",
        "57050090", 0.20, 0.80, "Carpet / rug"),
    (r"\b(decoration|ornament|figurine|wall\s*art)\b",
        "83062900", 0.20, 0.75, "Decorative ornament"),
    (r"\b(bedding|sheet|pillowcase|comforter|duvet|blanket)\b",
        "63022100", 0.20, 0.75, "Bedding / linen"),
    (r"\b(towel|bath\s*towel|hand\s*towel)\b",
        "63026000", 0.20, 0.78, "Towel"),
    (r"\b(curtain|drape|blind)\b",
        "63031900", 0.20, 0.75, "Curtains / drapes"),
    (r"\b(plate|bowl|cup|mug|dinnerware|tableware)\b",
        "69120000", 0.20, 0.75, "Tableware (ceramic)"),

    # ── Toys & games ─────────────────────────────────────────────────────
    (r"\b(toy|doll|action\s*figure|stuffed\s*animal|plush)\b",
        "95030000", 0.20, 0.78, "Toy"),
    (r"\b(table\s*tennis|ping\s*pong)\b",
        "95069190", 0.10, 0.85, "Table tennis equipment — 10% duty"),
    (r"\b(video\s*game|console|playstation|xbox|nintendo|switch\s*game)\b",
        "95045000", 0.20, 0.80, "Video game / console (gaming accessories NOT exempt)"),
    (r"\b(board\s*game|card\s*game|puzzle)\b",
        "95049090", 0.20, 0.75, "Board game / puzzle"),

    # ── Books & paper ────────────────────────────────────────────────────
    (r"\b(book|novel|textbook|paperback|hardcover)\b",
        "49019900", 0.0, 0.85, "Book"),
    (r"\b(magazine|journal|periodical)\b",
        "49021000", 0.0, 0.78, "Magazine"),
    (r"\b(notebook|notepad|stationery|note\s*book)\b",
        "48201020", 0.20, 0.75, "Notebook (stationery)"),
    (r"\b(shoe\s*box|paper\s*box|cardboard\s*box|carton)\b",
        "48192090", 0.20, 0.85, "Paper/cardboard box"),

    # ── Food & supplements ───────────────────────────────────────────────
    (r"\b(seed|seeds)\b",
        "12099900", 0.0, 0.80, "Seeds — full exempt"),
    (r"\b(vitamin|supplement|protein\s*powder|protein\s*shake)\b",
        "21069099", 0.20, 0.75, "Food supplement"),
    (r"\b(coffee|coffee\s*bean)\b",
        "09011100", 0.40, 0.78, "Coffee beans"),
    (r"\b(tea|tea\s*bag)\b",
        "09022000", 0.40, 0.78, "Tea"),

    # ── Pet supplies ─────────────────────────────────────────────────────
    (r"\b(pet\s*food|dog\s*food|cat\s*food)\b",
        "23091000", 0.0, 0.80, "Pet food"),
    (r"\b(dog\s*pad|puppy\s*pad|pet\s*pad|sanitary\s*pad)\b",
        "96190029", 0.20, 0.80, "Sanitary pads / pet pads"),
    (r"\b(pet\s*toy|dog\s*toy|cat\s*toy)\b",
        "95030000", 0.20, 0.72, "Pet toy"),

    # ── Tools & hardware ─────────────────────────────────────────────────
    (r"\b(air\s*pump|tire\s*pump|tyre\s*pump|inflator)\b",
        "84148000", 0.0, 0.80, "Air pump"),
    (r"\b(steam\s*cleaner|steam\s*mop)\b",
        "85098090", 0.20, 0.80, "Steam cleaner"),
    (r"\b(drill|screwdriver|hammer|wrench|tool\s*kit)\b",
        "82055100", 0.20, 0.72, "Hand tools"),

    # ── Auto / vehicle ───────────────────────────────────────────────────
    (r"\b(tire|tyre|car\s*tire)\b",
        "40111000", 0.20, 0.78, "Vehicle tire"),
    (r"\b(car\s*part|automotive\s*part|vehicle\s*part)\b",
        "87089900", 0.20, 0.65, "Generic vehicle part — verify"),
]


# ── Description normalization ────────────────────────────────────────────────

# Stop words that don't help disambiguate categories
COURIER_STOP_WORDS = {
    "the", "a", "an", "of", "and", "or", "for", "with", "to", "in",
    "new", "used", "pre", "owned", "size", "color", "colour",
    "small", "medium", "large", "xl", "xxl",
    "pcs", "pieces", "piece", "pack", "set", "kit",
    "men", "mens", "women", "womens", "kid", "kids", "baby", "boy", "girl",
}


def _normalize(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    s = text.lower()
    s = re.sub(r"[^a-z0-9\s]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _tokens(text: str) -> List[str]:
    return [t for t in _normalize(text).split() if t and t not in COURIER_STOP_WORDS]


# ── Suggestion generation ────────────────────────────────────────────────────


def _build_suggestion(
    thn: str,
    confidence: float,
    match_reason: str,
    fallback_rate: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """Build a suggestion dict by combining tariff DB + courier_duty classification.

    If the THN is not in the CET DB and a `fallback_rate` is provided, that
    rate is used instead — this lets the operationally-validated keyword
    index fill in for THNs that the OCR parse missed (e.g. 83062900,
    57050090). Special-case exemptions (full_exempt / duty_free_only)
    in courier_duty still take precedence over the fallback rate.
    """
    entry = courier_duty.lookup_thn(thn)
    cls = courier_duty.classify(thn)

    # If classifier says unknown but the keyword index has a fallback rate,
    # use that rate. Special-case exempt THNs are already handled by classify().
    effective_class = cls.exemption_class
    effective_rate = cls.duty_rate
    if cls.is_unknown and fallback_rate is not None:
        if fallback_rate == 0.0:
            # Operational rate of 0 with no DB entry — treat as duty-free-only
            # (OPT and VAT still apply) by default.
            effective_class = "duty_free_only"
            effective_rate = 0.0
        else:
            effective_class = "none"
            effective_rate = fallback_rate

    duty_rate_raw: str
    if effective_class == "full_exempt":
        duty_rate_raw = "EXEMPT"
    elif effective_class == "duty_free_only":
        duty_rate_raw = "FREE"
    elif effective_rate > 0:
        duty_rate_raw = f"{int(effective_rate * 100)}%"
    else:
        duty_rate_raw = "?"

    code = entry["code"] if entry else f"{thn[:4]}.{thn[4:6]}.{thn[6:]}"
    description = (
        entry["description"] if entry
        else "(operational classification — verify against CET)"
    )

    return {
        "thn": thn,
        "code": code,
        "description": description,
        "duty_rate": effective_rate,
        "duty_rate_raw": duty_rate_raw,
        "exemption_class": effective_class,
        "confidence": round(confidence, 2),
        "match_reason": match_reason,
        "is_unknown": cls.is_unknown,
    }


def suggest_thns_keyword_index(description: str) -> List[Dict[str, Any]]:
    """
    Match against the courier keyword index. Returns highest-confidence
    hits first. Multiple patterns may match — the one with highest
    confidence wins for each unique THN.

    The matcher is intentionally lenient about plurals: any pattern
    will also match the same word with a trailing 's' or 'es'. This
    avoids having to annotate every pattern with `s?`.
    """
    norm = _normalize(description)
    if not norm:
        return []

    # Generate haystacks: original, plus "depluralised" variants where each
    # token has trailing 's' or 'es' stripped. We try both 's' and 'es'
    # because "earphones" → "earphone" (just s) but "boxes" → "box" (es).
    def _strip_s(tok: str) -> str:
        return tok[:-1] if tok.endswith("s") and len(tok) > 2 else tok

    def _strip_es(tok: str) -> str:
        return tok[:-2] if tok.endswith("es") and len(tok) > 3 else tok

    tokens = norm.split()
    haystacks = {
        norm,
        " ".join(_strip_s(t) for t in tokens),
        " ".join(_strip_es(t) for t in tokens),
    }

    best_by_thn: Dict[str, Tuple[float, float, str]] = {}
    for pattern, thn, fallback_rate, confidence, reason in COURIER_KEYWORD_INDEX:
        if any(re.search(pattern, h) for h in haystacks):
            existing = best_by_thn.get(thn)
            if existing is None or confidence > existing[0]:
                best_by_thn[thn] = (confidence, fallback_rate, reason)

    suggestions: List[Dict[str, Any]] = []
    for thn, (confidence, fallback_rate, reason) in best_by_thn.items():
        s = _build_suggestion(thn, confidence, reason, fallback_rate=fallback_rate)
        if s:
            suggestions.append(s)

    suggestions.sort(key=lambda x: x["confidence"], reverse=True)
    return suggestions


def suggest_thns_full_text(description: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Fallback: keyword search over the entire CET 2024 database
    (with user tariff overrides applied).

    Score = (matching_tokens * 10) + bonuses for word-boundary matches
    and short descriptions (more specific entries).
    """
    from . import courier_rules
    db = courier_rules._load_tariff_index()
    if not db:
        return []

    tokens = _tokens(description)
    if not tokens:
        return []

    scored: List[Tuple[float, Dict[str, Any]]] = []
    for thn, entry in db.items():
        desc = _normalize(entry.get("description", ""))
        if not desc or desc in ("other", "+ + other", "++ other"):
            # Skip placeholder "Other" descriptions — they have no
            # discriminative power on their own.
            continue
        matched = sum(1 for t in tokens if t in desc)
        if matched == 0:
            continue
        score = matched * 10.0
        # Word-boundary bonus
        for t in tokens:
            if re.search(r"\b" + re.escape(t) + r"\b", desc):
                score += 5.0
        # Short-description bonus (more specific)
        if len(desc) < 40:
            score += 2.0
        # All-tokens-matched bonus
        if matched == len(tokens):
            score += 15.0
        scored.append((score, entry))

    scored.sort(key=lambda x: x[0], reverse=True)
    suggestions: List[Dict[str, Any]] = []
    for score, entry in scored[:limit]:
        thn = entry.get("thn") or entry["code"].replace(".", "")
        # Convert score to a 0.0-1.0 confidence (loose calibration:
        # max plausible score ~= 50, so cap at that)
        confidence = min(0.65, score / 50.0)
        s = _build_suggestion(
            thn,
            confidence,
            f"Keyword match (score {score:.0f}) on '{entry.get('description', '')[:50]}'",
        )
        if s:
            suggestions.append(s)
    return suggestions


def suggest_thns(description: str, limit: int = 5) -> Dict[str, Any]:
    """
    Public entry point: suggest THNs for a courier item description.

    Returns
    -------
    {
        "description": "<echo of input>",
        "suggestions": [ {thn, code, description, duty_rate, ...}, ... ],
        "source": "keyword_index" | "full_text" | "hybrid" | "none",
        "best_match": <first suggestion or None>
    }

    Strategy
    --------
    The keyword index is hand-curated and operationally validated against
    real TTPOST manifests, so it always wins over generic full-text
    matching. Full-text is only used when the keyword index has zero hits.
    """
    description = (description or "").strip()
    if not description:
        return {"description": "", "suggestions": [], "source": "none", "best_match": None}

    # 1. Always try keyword index first
    indexed = suggest_thns_keyword_index(description)

    if indexed:
        # Take all keyword hits; if we have headroom under `limit`, fill
        # the remainder with full-text suggestions for additional context.
        out = list(indexed[:limit])
        source = "keyword_index"
        if len(out) < limit:
            full = suggest_thns_full_text(description, limit=limit - len(out))
            seen = {s["thn"] for s in out}
            added = False
            for s in full:
                if s["thn"] not in seen:
                    out.append(s)
                    seen.add(s["thn"])
                    added = True
            if added:
                source = "hybrid"
        return {
            "description": description,
            "suggestions": out[:limit],
            "source": source,
            "best_match": out[0] if out else None,
        }

    # 2. Keyword index gave nothing — fall back to full-text
    full = suggest_thns_full_text(description, limit=limit)
    if full:
        return {
            "description": description,
            "suggestions": full[:limit],
            "source": "full_text",
            "best_match": full[0],
        }

    return {"description": description, "suggestions": [], "source": "none", "best_match": None}


# ── Public surface ───────────────────────────────────────────────────────────

__all__ = [
    "suggest_thns",
    "suggest_thns_keyword_index",
    "suggest_thns_full_text",
    "COURIER_KEYWORD_INDEX",
]
