"""
Stallion broker profile configuration.

Centralizes broker identity details that appear on generated documents
(costing PDFs, brokerage invoices, worksheet footers).

In production, this should be read from the database per-client or per-broker.
For now, defaults can be overridden via environment variables.
"""
from __future__ import annotations

import os


def get_broker_profile() -> dict:
    """
    Returns the active broker profile. Checks env vars first,
    falls back to compiled defaults.
    """
    return {
        "firm":    os.environ.get("STALLION_BROKER_FIRM",    "Fast Freight Forwarders Ltd"),
        "address": os.environ.get("STALLION_BROKER_ADDRESS", "38 O'Connor Street, Woodbrook, Port of Spain"),
        "phone":   os.environ.get("STALLION_BROKER_PHONE",   "(868) 628-2255"),
    }
