"""
Stallion generated file cleanup.

Removes generated PDFs and XMLs from data/generated/ that are older
than the configured TTL. Can be run:
  1. On app startup (via lifespan hook)
  2. Periodically via cron:  python -m app.cleanup
  3. Manually

Default TTL: 7 days.
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path

logger = logging.getLogger("stallion.cleanup")

GENERATED_DIR = Path(__file__).resolve().parent.parent / "data" / "generated"
DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days


def cleanup_generated_files(
    ttl_seconds: int | None = None,
    dry_run: bool = False,
) -> dict:
    """
    Delete generated files older than ttl_seconds.

    Returns { "deleted": int, "skipped": int, "errors": int }
    """
    ttl = ttl_seconds if ttl_seconds is not None else int(
        os.environ.get("STALLION_CLEANUP_TTL_SECONDS", DEFAULT_TTL_SECONDS)
    )
    cutoff = time.time() - ttl
    deleted = skipped = errors = 0

    if not GENERATED_DIR.exists():
        return {"deleted": 0, "skipped": 0, "errors": 0}

    for f in GENERATED_DIR.iterdir():
        if not f.is_file():
            continue
        # Only clean up known output types
        if f.suffix.lower() not in (".pdf", ".xml"):
            skipped += 1
            continue

        try:
            mtime = f.stat().st_mtime
            if mtime < cutoff:
                if dry_run:
                    logger.info("[dry-run] Would delete: %s (age: %.1f days)", f.name, (time.time() - mtime) / 86400)
                else:
                    f.unlink()
                    logger.info("Deleted expired file: %s", f.name)
                deleted += 1
            else:
                skipped += 1
        except Exception as exc:
            logger.warning("Failed to process %s: %s", f.name, exc)
            errors += 1

    action = "Would delete" if dry_run else "Deleted"
    logger.info(
        "Cleanup complete: %s %d files, skipped %d, errors %d (TTL=%d days)",
        action, deleted, skipped, errors, ttl // 86400,
    )
    return {"deleted": deleted, "skipped": skipped, "errors": errors}


# Allow running as:  python -m app.cleanup
if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    dry = "--dry-run" in sys.argv
    result = cleanup_generated_files(dry_run=dry)
    print(result)
