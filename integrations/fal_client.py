import os
import re
import uuid
from pathlib import Path

from integrations.fallback_outputs import fallback_deal_card_path


TIMEOUT = 25
REPO_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = REPO_ROOT / "assets"
DEAL_CARD_DIR = ASSET_ROOT / "deal_cards"


def _safe_slug(value: object) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "vendor").lower()).strip("-")
    return slug[:48] or "vendor"


def _asset_url(path: Path) -> str:
    try:
        relative = path.resolve().relative_to(ASSET_ROOT.resolve())
    except ValueError:
        return "/assets/fal_deal_card.png"
    return f"/assets/{relative.as_posix()}"


def _build_deal_card_prompt(recommendation: dict) -> str:
    vendor = recommendation.get("recommended_seller") or "Selected Vendor"
    product = recommendation.get("recommended_product") or "Procurement Offer"
    price = recommendation.get("price_eur") or 0
    delivery = recommendation.get("delivery_days") or 0
    warranty = recommendation.get("warranty_years") or 0
    status = recommendation.get("technical_status") or "validated"
    risk = recommendation.get("risk_level") or "low"

    return (
        "Create a premium professional B2B procurement deal thumbnail, 16:9 landscape. "
        "Design it like an executive vendor award card for a procurement report. "
        f"Vendor name must be prominent and legible: {vendor}. "
        f"Include a clean fictional logo mark inspired by the vendor name {vendor}, "
        "using simple geometric shapes, not an existing brand logo. "
        f"Show the product name clearly: {product}. "
        f"Show the offer details as concise dashboard text: price €{price}, "
        f"delivery {delivery} days, warranty {warranty} years, status {status}, risk {risk}. "
        "Use a white and deep navy corporate palette with restrained green approval accents. "
        "Make it polished, minimal, high-trust, boardroom-ready, with generous spacing, "
        "sharp typography, subtle grid lines, and a small Pactum verified badge. "
        "No people, no clutter, no tiny unreadable paragraphs, no distorted UI mockups."
    )


def _fallback_asset(prompt: str, reason: str = "fallback") -> dict:
    path = Path(fallback_deal_card_path()).resolve()
    return {
        "path": str(path),
        "url": _asset_url(path),
        "prompt": prompt,
        "generated": False,
        "source": reason,
    }


def generate_deal_card(recommendation: dict) -> dict:
    prompt = _build_deal_card_prompt(recommendation)
    fal_key = os.getenv("FAL_KEY") or os.getenv("FAL_API_KEY", "")
    if not fal_key:
        return _fallback_asset(prompt, "missing_fal_key")

    try:
        os.environ["FAL_KEY"] = fal_key

        import fal_client
        import requests

        result = fal_client.subscribe(
            "fal-ai/flux/schnell",
            arguments={
                "prompt": prompt,
                "image_size": "landscape_16_9",
                "num_images": 1,
            },
        )
        image_url = result["images"][0]["url"]

        response = requests.get(image_url, timeout=TIMEOUT)
        response.raise_for_status()

        DEAL_CARD_DIR.mkdir(parents=True, exist_ok=True)
        vendor_slug = _safe_slug(recommendation.get("recommended_seller"))
        out_path = DEAL_CARD_DIR / f"{vendor_slug}-{uuid.uuid4().hex[:8]}.png"
        out_path.write_bytes(response.content)

        return {
            "path": str(out_path),
            "url": _asset_url(out_path),
            "prompt": prompt,
            "generated": True,
            "source": "fal",
        }
    except Exception as exc:
        return _fallback_asset(prompt, f"fal_error:{exc.__class__.__name__}")
