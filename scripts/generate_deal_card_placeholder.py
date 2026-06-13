"""Generates assets/fal_deal_card.png — a static placeholder deal card image.

Used by integrations/fallback_outputs.py::fallback_deal_card_path() when
DEMO_MODE=true or the fal API is unavailable. Mirrors the look of
frontend/src/components/sections/DealCard.tsx so the legacy Streamlit UI
shows a card consistent with the Next.js one.

Usage:
    python -m scripts.generate_deal_card_placeholder
"""

import os

from PIL import Image, ImageDraw, ImageFont

OUT_PATH = os.path.join(os.path.dirname(__file__), "../assets/fal_deal_card.png")

WIDTH, HEIGHT = 800, 500
ACCENT = (79, 70, 229)  # indigo-600
SURFACE = (255, 255, 255)
BORDER = (226, 232, 240)
TEXT_1 = (15, 23, 42)
TEXT_2 = (71, 85, 105)
TEXT_3 = (148, 163, 184)
SUCCESS = (22, 163, 74)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "arialbd.ttf" if bold else "arial.ttf"
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def main() -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), SURFACE)
    draw = ImageDraw.Draw(img)

    # Header band
    draw.rectangle([0, 0, WIDTH, 70], fill=ACCENT)
    draw.text((24, 16), "PACTUM DEAL", font=_font(16, bold=True), fill=SURFACE)
    draw.text((24, 40), "REQ-001", font=_font(13), fill=(224, 224, 255))
    buyer_label = "BUYER"
    draw.text((WIDTH - 24 - 160, 14), buyer_label, font=_font(12, bold=True), fill=(224, 224, 255), anchor="ra")
    draw.text((WIDTH - 24, 36), "Northwind Robotics", font=_font(16, bold=True), fill=SURFACE, anchor="ra")

    # Vendor
    draw.text((32, 96), "RECOMMENDED VENDOR", font=_font(12, bold=True), fill=TEXT_3)
    draw.text((32, 118), "Vendor B — RTX 4070 Super Compact", font=_font(22, bold=True), fill=TEXT_1)

    # Price hero box
    draw.rounded_rectangle([32, 170, WIDTH - 32, 280], radius=14, outline=BORDER, width=2)
    draw.text((52, 192), "PRICE", font=_font(12, bold=True), fill=TEXT_3)
    draw.text((52, 212), "€640", font=_font(56, bold=True), fill=TEXT_1)
    draw.text((220, 248), "incl. delivery", font=_font(14), fill=TEXT_3)

    # Spec cells
    specs = [
        ("DELIVERY", "5 days", TEXT_1),
        ("WARRANTY", "2 years", TEXT_1),
        ("COMPATIBILITY", "PASSED", SUCCESS),
        ("RISK LEVEL", "LOW", SUCCESS),
    ]
    cell_w = (WIDTH - 64 - 24) // 2
    for i, (label, value, color) in enumerate(specs):
        col, row = i % 2, i // 2
        x = 32 + col * (cell_w + 24)
        y = 300 + row * 80
        draw.rounded_rectangle([x, y, x + cell_w, y + 64], radius=10, outline=BORDER, width=2)
        draw.text((x + 16, y + 12), label, font=_font(11, bold=True), fill=TEXT_3)
        draw.text((x + 16, y + 32), value, font=_font(18, bold=True), fill=color)

    # Footer
    draw.line([32, HEIGHT - 56, WIDTH - 32, HEIGHT - 56], fill=BORDER, width=2)
    draw.text((32, HEIGHT - 40), "AWAITING HUMAN APPROVAL", font=_font(13, bold=True), fill=(217, 119, 6))
    draw.text((WIDTH - 32, HEIGHT - 40), "powered by Pactum", font=_font(13), fill=TEXT_3, anchor="ra")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    img.save(OUT_PATH)
    print(f"Saved {OUT_PATH}")


if __name__ == "__main__":
    main()
