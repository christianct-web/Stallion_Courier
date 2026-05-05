"""
Stallion local tariff database search.

Provides instant, free, offline-capable HS code lookup against
the T&T CET tariff database. Falls back to Claude API only when
the local database has no good matches.

Search strategy:
  1. Exact code prefix match (if query looks like an HS code)
  2. Full-text search on description (keyword matching with scoring)
  3. If fewer than 3 local results, supplement with Claude API
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger("stallion.tariff")

_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "tt_tariff_db.json"
_tariff_entries: List[Dict[str, Any]] = []


def _load_db() -> List[Dict[str, Any]]:
    """Load the tariff database once. Cached in module-level list."""
    global _tariff_entries
    if _tariff_entries:
        return _tariff_entries
    try:
        with open(_DB_PATH, encoding="utf-8") as f:
            data = json.load(f)
        _tariff_entries = data.get("entries", [])
        logger.info("Loaded %d tariff entries from %s", len(_tariff_entries), _DB_PATH.name)
    except Exception as exc:
        logger.warning("Failed to load tariff DB: %s", exc)
        _tariff_entries = []
    return _tariff_entries


def _is_hs_code_query(query: str) -> bool:
    """Check if query looks like an HS code (digits and dots)."""
    cleaned = query.replace(".", "").replace(" ", "")
    return cleaned.isdigit() and len(cleaned) >= 4


def _normalize(text: str) -> str:
    """Normalize text for matching: lowercase, strip punctuation."""
    return re.sub(r"[^a-z0-9\s]", "", text.lower()).strip()


def _prepare_keywords(query: str) -> List[str]:
    """Clean noisy commercial text into search-friendly keywords."""
    text = _normalize(query)
    tokens = [t for t in text.split() if len(t) >= 2]

    # Drop high-noise tokens common in invoice descriptions/model strings
    stop = {
        "made", "usa", "with", "for", "and", "the", "power", "supply", "vendor", "po",
        "model", "part", "no", "number", "new", "pack", "pkg", "pcs", "piece",
        "citrlik", "pbp", "psp", "module", "io",
    }
    tokens = [t for t in tokens if t not in stop and not re.fullmatch(r"[a-z]*\d+[a-z\d]*", t)]

    # Strong domain hinting for networking/electronics descriptions
    if any(t in text for t in ["ethernet", "network", "router", "switch", "transmission", "data"]):
        tokens.extend(["ethernet", "network", "transmission", "data"])

    # De-duplicate while preserving order
    seen = set()
    out: List[str] = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _expand_keywords(keywords: List[str]) -> List[str]:
    """Expand keywords with common customs/trade synonyms to improve recall."""
    SYNONYMS = {
        "medicine": ["medicament", "pharmaceutical", "drug", "medical"],
        "medicines": ["medicament", "pharmaceutical", "drug", "medical"],
        "medication": ["medicament", "pharmaceutical", "drug"],
        "drugs": ["medicament", "pharmaceutical", "medicine"],
        "pharmaceutical": ["medicament", "medicine", "drug"],
        "car": ["motor", "vehicle", "automobile"],
        "cars": ["motor", "vehicle", "automobile"],
        "vehicle": ["motor", "car", "automobile"],
        "vehicles": ["motor", "car", "automobile"],
        "truck": ["lorry", "vehicle", "transport"],
        "phone": ["telephone", "cellular", "mobile", "smartphone"],
        "computer": ["laptop", "data processing", "digital", "computing"],
        "tv": ["television", "receiver"],
        "fridge": ["refrigerator", "freezer"],
        "ac": ["air conditioner", "conditioning"],
        "clothes": ["clothing", "apparel", "garment", "textile"],
        "shoes": ["footwear", "boot"],
        "oil": ["petroleum", "crude", "cooking"],
        "pipe": ["tube", "piping"],
        "pipes": ["tube", "piping", "tubes"],
        "wire": ["cable", "conductor", "electrical"],
        "ethernet": ["network", "transmission", "data", "communication"],
        "network": ["ethernet", "transmission", "communication", "data"],
        "module": ["apparatus", "machine", "device"],
        "battery": ["accumulator", "cell", "lithium"],
        "batteries": ["accumulator", "cell", "lithium"],
        "soap": ["detergent", "cleaning", "toilet"],
        "food": ["preparation", "edible", "meal"],
        "baby": ["infant", "child"],
        "sugar": ["cane", "refined", "raw"],
        "flour": ["wheat", "meslin"],
        "meat": ["beef", "bovine", "carcass", "pork"],
        "fish": ["seafood", "frozen", "tuna", "tilapia"],
    }
    expanded = list(keywords)
    for kw in keywords:
        kw_lower = kw.lower()
        if kw_lower in SYNONYMS:
            expanded.extend(SYNONYMS[kw_lower])
    return expanded


def _score_match(entry: Dict[str, Any], keywords: List[str]) -> float:
    """
    Score an entry against search keywords.
    Higher = better match. Returns 0 if no keywords match.
    """
    desc = _normalize(entry.get("description", ""))
    notes = _normalize(entry.get("notes", ""))
    code = entry.get("code", "")
    combined = f"{desc} {notes}"

    score = 0.0
    matched_keywords = 0

    for kw in keywords:
        kw_lower = kw.lower()
        if kw_lower in desc:
            # Direct description match — high value
            score += 10.0
            # Bonus for match at word boundary
            if re.search(r'\b' + re.escape(kw_lower) + r'\b', desc):
                score += 5.0
            matched_keywords += 1
        elif kw_lower in notes:
            # Notes match — lower value
            score += 3.0
            matched_keywords += 1

    if matched_keywords == 0:
        return 0.0

    # Bonus for matching ALL keywords
    if matched_keywords == len(keywords):
        score += 15.0

    # Bonus for shorter descriptions (more specific entries)
    if len(desc) < 40:
        score += 2.0

    return score


def _domain_rerank(results: List[Dict[str, Any]], query: str) -> List[Dict[str, Any]]:
    """Apply domain-specific reranking for common customs search intents."""
    q = _normalize(query)
    net_hint = any(t in q for t in ["ethernet", "network", "router", "switch", "data", "communication"])
    if not net_hint:
        return results

    def score(e: Dict[str, Any]) -> float:
        code = str(e.get("code", ""))
        d = _normalize(e.get("description", ""))
        s = 0.0
        # Strong preference for telecom/networking family
        if code.startswith("8517"):
            s += 50
        if code.startswith("8544"):
            s += 18  # cables/connectors often relevant secondaries
        if any(k in d for k in ["data", "network", "communication", "transmission apparatus", "reception"]):
            s += 20
        # Penalize false-positive "transmission" in unrelated industrial domains
        if any(k in d for k in ["hydraulic", "brake", "conveyor", "elevator", "fluid"]):
            s -= 35
        return s

    return sorted(results, key=score, reverse=True)


def search_local(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search the local tariff database.

    Returns up to `limit` results, sorted by relevance.
    Each result has: code, description, dutyRate, dutyPct, surchargePct, vatPct, notes
    """
    entries = _load_db()
    if not entries:
        return []

    query = query.strip()
    if not query:
        return []

    # Strategy 1: HS code prefix match
    if _is_hs_code_query(query):
        prefix = query.replace(".", "").replace(" ", "")
        matches = []
        for e in entries:
            code_digits = e["code"].replace(".", "")
            if code_digits.startswith(prefix):
                matches.append(e)
        if matches:
            return matches[:limit]

    # Strategy 2: keyword search on description
    keywords = _prepare_keywords(query)
    if not keywords:
        return []

    expanded = _expand_keywords(keywords)

    scored = []
    for e in entries:
        s = _score_match(e, expanded)
        if s > 0:
            scored.append((s, e))

    scored.sort(key=lambda x: x[0], reverse=True)
    ranked = [e for _, e in scored[: max(limit * 3, limit)]]
    ranked = _domain_rerank(ranked, query)
    return ranked[:limit]


def search_hybrid(
    query: str,
    limit: int = 5,
    min_local_results: int = 3,
) -> tuple[List[Dict[str, Any]], str]:
    """
    Hybrid search: local first, Claude fallback if insufficient local results.

    Returns (results, source) where source is "local", "claude", or "hybrid".
    """
    local_results = search_local(query, limit=limit)

    qn = _normalize(query)
    net_hint = any(t in qn for t in ["ethernet", "network", "router", "switch", "module", "communication", "data"])
    has_network_family = any(str(r.get("code", "")).startswith(("8517", "8544")) for r in local_results)

    # For networking/electronics queries, force Claude assist when local top hits
    # are not in expected families (avoids false positives like hydraulic transmission).
    if len(local_results) >= min_local_results and (not net_hint or has_network_family):
        return local_results[:limit], "local"

    # Insufficient local results — try Claude API
    try:
        claude_results = _search_claude(query, limit=limit)
        if not local_results:
            return claude_results, "claude"
        # Merge strategy:
        # - For networking hint with weak local families, prefer Claude ordering first.
        # - Otherwise keep local-first ordering.
        if net_hint and not has_network_family:
            seen_codes = {r["code"] for r in claude_results}
            merged = list(claude_results)
            for lr in local_results:
                if lr["code"] not in seen_codes:
                    merged.append(lr)
                    seen_codes.add(lr["code"])
            return merged[:limit], "hybrid"

        seen_codes = {r["code"] for r in local_results}
        merged = list(local_results)
        for cr in claude_results:
            if cr["code"] not in seen_codes:
                merged.append(cr)
                seen_codes.add(cr["code"])
        return merged[:limit], "hybrid"
    except Exception as exc:
        logger.warning("Claude HS search failed, using local-only: %s", exc)
        return local_results[:limit], "local"


def _search_claude(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Call Claude API for HS code search. Used as fallback only."""
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return []

    prompt = f"""You are a Trinidad and Tobago customs tariff specialist with deep knowledge of the CARICOM Common External Tariff (CET).

Given goods described as: "{query.replace('"', "'")}"

Return EXACTLY {limit} HS code suggestions as a JSON array. Each object must have:
- "code": HS tariff code in T&T format XXXX.XX.XX (8-digit with dots)
- "description": concise official tariff description (under 80 chars)
- "dutyRate": human-readable rate string (e.g. "20% + 12.5% VAT")
- "dutyPct": numeric import duty percentage (e.g. 20, 0, 40). Use 0 for Free.
- "surchargePct": numeric surcharge percentage. Use 0 if none.
- "vatPct": numeric VAT percentage. 12.5 standard, 0 for exempt goods.
- "notes": one short sentence about classification

Return ONLY the JSON array — no prose, no markdown fences."""

    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = msg.content[0].text.strip()
    raw = re.sub(r"^```[^\n]*\n?", "", raw)
    raw = re.sub(r"```\s*$", "", raw).strip()
    results = json.loads(raw)
    return results if isinstance(results, list) else []
