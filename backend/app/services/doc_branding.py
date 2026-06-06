from __future__ import annotations

from pathlib import Path

from reportlab.pdfgen.canvas import Canvas


APP_ROOT = Path(__file__).resolve().parent.parent
WORDMARK_PATH = APP_ROOT / "assets" / "stallion-wordmark-2048.png"
WORDMARK_RATIO = 2048 / 717


def draw_stallion_wordmark(
    c: Canvas,
    x: float,
    y: float,
    *,
    width: float | None = None,
    height: float = 18,
) -> bool:
    """Draw the Stallion wordmark and return whether the image was used."""
    if width is None:
        width = height * WORDMARK_RATIO

    if not WORDMARK_PATH.exists():
        return False

    try:
        c.drawImage(
            str(WORDMARK_PATH),
            x,
            y,
            width=width,
            height=height,
            mask="auto",
            preserveAspectRatio=True,
            anchor="sw",
        )
        return True
    except Exception:
        return False
