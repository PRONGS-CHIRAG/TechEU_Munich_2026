import os
import re
from urllib.parse import urlparse, urlunparse
from integrations.fallback_outputs import fallback_deal_card_path

FAL_KEY = os.getenv("FAL_KEY") or os.getenv("FAL_API_KEY", "")
TIMEOUT = 25


def build_validated_url(base_url: str) -> str:
    try:
        # Minimal path validation
        if "/../" in base_url or re.search(r"/%2e%2e/", base_url, re.IGNORECASE):
            raise ValueError("Invalid path")
        
        parsed = urlparse(base_url)
        
        # Protocol + host checks
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Invalid protocol")
        if not parsed.hostname:
            raise ValueError("Invalid host")
        allowed_domains = ["fal.media"]  # add your allowed domains here
        if parsed.hostname.lower() not in allowed_domains:
            raise ValueError("Invalid host")
        
        return urlunparse(parsed)
    except Exception:
        raise ValueError("Invalid URL")


def generate_deal_card(recommendation: dict) -> str:
    if not FAL_KEY:
        return fallback_deal_card_path()

    try:
        import fal_client

        prompt = (
            f"Professional procurement deal card. "
            f"Vendor: {recommendation.get('recommended_seller')}. "
            f"Product: {recommendation.get('recommended_product')}. "
            f"Price: €{recommendation.get('price_eur')}. "
            f"Delivery: {recommendation.get('delivery_days')} days. "
            f"Status: {recommendation.get('technical_status')}. "
            f"Clean B2B business style, dark blue and white."
        )

        result = fal_client.subscribe(
            "fal-ai/flux/schnell",
            arguments={"prompt": prompt, "image_size": "landscape_4_3"},
        )
        image_url = result["images"][0]["url"]

        import requests
        validated_url = build_validated_url(image_url)
        img_data = requests.get(validated_url, timeout=TIMEOUT).content
        out_path = os.path.join(os.path.dirname(__file__), "../assets/fal_deal_card.png")
        with open(os.path.abspath(out_path), "wb") as f:
            f.write(img_data)
        return out_path
    except Exception:
        return fallback_deal_card_path()
