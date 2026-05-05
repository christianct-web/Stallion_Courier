"""
Stallion Lookups & CBTT Rate Proxy routes.
"""
from __future__ import annotations

import logging
import time
from datetime import date
from typing import Any, Dict

import httpx
from fastapi import APIRouter, HTTPException, Query

from ..store import LOOKUPS

router = APIRouter(tags=["lookups"])
logger = logging.getLogger("stallion.lookups")

# ─── CBTT rate proxy ──────────────────────────────────────────────────────────
# Cache entries: { date_str: { "rate": float, "date": str, "source": str, "_cached_at": float } }
_cbtt_cache: dict[str, dict] = {}
CBTT_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours — rates are published once per business day
CBTT_ENDPOINT = "https://www.central-bank.org.tt/our-work/statistics/exchange-rates/json"

# Fallback rate updated 2026-03-17 (source: CBTT weighted avg selling rate)
CBTT_FALLBACK_RATE = 6.7790


def _cache_get(target_date: str) -> dict | None:
    """Return cached entry if present and not expired."""
    entry = _cbtt_cache.get(target_date)
    if entry is None:
        return None
    if time.monotonic() - entry.get("_cached_at", 0) > CBTT_CACHE_TTL_SECONDS:
        del _cbtt_cache[target_date]
        return None
    return entry


def _cache_set(target_date: str, entry: dict) -> None:
    """Store entry with timestamp. Evict oldest entries if cache grows too large."""
    entry["_cached_at"] = time.monotonic()
    _cbtt_cache[target_date] = entry
    # Cap cache at 90 entries (~3 months of business days)
    if len(_cbtt_cache) > 90:
        oldest_key = min(_cbtt_cache, key=lambda k: _cbtt_cache[k].get("_cached_at", 0))
        del _cbtt_cache[oldest_key]


@router.get("/lookups/{kind}")
async def lookups(kind: str, date: str | None = Query(default=None)):
    if kind == "cbtt-rate":
        return await cbtt_rate(date)

    if kind == "permits":
        from .extract import PERMIT_LOOKUP
        return {"kind": "permits", "items": PERMIT_LOOKUP}

    if kind not in LOOKUPS:
        raise HTTPException(status_code=404, detail=f"Lookup kind '{kind}' not found")
    return {"kind": kind, "items": LOOKUPS[kind]}


@router.get("/lookups/cbtt-rate")
async def cbtt_rate(date_str: str = Query(default=None, alias="date")):
    """
    Returns the USD/TTD weighted average selling rate for a given date.

    Query param:  ?date=YYYY-MM-DD   (defaults to today)
    Response:     { rate, date, source }
      source: "central_bank" | "cache" | "fallback"
    """
    target_date = date_str or date.today().isoformat()

    # Serve from cache if valid
    cached = _cache_get(target_date)
    if cached:
        return {"rate": cached["rate"], "date": cached["date"], "source": "cache"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(CBTT_ENDPOINT, params={"date": target_date})
            resp.raise_for_status()
            payload = resp.json()

        rate = None
        if isinstance(payload, list):
            for row in payload:
                currency = (row.get("currency") or row.get("Currency") or "").upper()
                if "USD" in currency or "US DOLLAR" in currency:
                    rate = float(
                        row.get("selling") or row.get("Selling") or
                        row.get("weighted_avg") or row.get("WeightedAvg") or 0
                    )
                    break

        if rate and rate > 0:
            entry = {"rate": rate, "date": target_date, "source": "central_bank"}
            _cache_set(target_date, entry)
            return entry

    except Exception as exc:
        logger.warning("CBTT rate fetch failed for %s: %s", target_date, str(exc))

    # Fallback: return last known rate with "fallback" source flag so UI can warn
    return {"rate": CBTT_FALLBACK_RATE, "date": target_date, "source": "fallback"}
