"""Shared product-category helpers for generalized inventory matching."""

import re


_STOPWORDS = {
    "a", "an", "and", "any", "are", "at", "best", "business", "buy", "buying",
    "can", "compatible", "corporate", "delivery", "for", "from", "good", "in",
    "need", "needs", "of", "or", "our", "procure", "procurement", "purchase",
    "purchasing", "request", "supplier", "suppliers", "the", "to", "under",
    "unit", "units", "use", "we", "with", "within",
}

_KNOWN_CATEGORY_ALIASES = {
    "gpu": ("gpu", "graphics", "graphics card", "rtx", "radeon"),
    "chair": ("chair", "chairs", "seating", "ergonomic", "furniture", "seat"),
    "sensor": ("sensor", "sensors", "proximity", "detector", "detection"),
    "server": ("server", "servers", "rack", "blade", "node"),
    "laptop": ("laptop", "laptops", "notebook", "notebooks"),
}

_GPU_MODEL_RE = re.compile(
    r"\b("
    r"rtx|gtx|geforce|quadro|tesla|nvidia|radeon|"
    r"rx\s*\d{3,4}|arc\s+a\d{3,4}|graphics\s+card|video\s+card|gpu"
    r")\b",
    re.IGNORECASE,
)

_GPU_ACCESSORY_RE = re.compile(
    r"\b("
    r"hdmi|vga|displayport|dvi|adapter|adaptor|cable|connector|converter|"
    r"splitter|switch|extender|mount|bracket|riser|holder|dock|docking|"
    r"enclosure|case|cover|sleeve|heatsink|thermal\s+pad|screw|tool"
    r")\b",
    re.IGNORECASE,
)

_CHAIR_PRODUCT_RE = re.compile(
    r"\b(office\s+chair|ergonomic\s+chair|desk\s+chair|task\s+chair|"
    r"conference\s+chair|mesh\s+chair|executive\s+chair|drafting\s+chair|"
    r"work\s+chair|computer\s+chair)\b",
    re.IGNORECASE,
)

_CHAIR_ACCESSORY_RE = re.compile(
    r"\b("
    r"cap|caps|tip|tips|caster|wheel|wheels|mat|cover|covers|pad|pads|"
    r"strap|straps|banner|earrings|pillow|cushion|plug|brace|bracket|"
    r"liner|placemat|feet|sock|socks|protector|protectors|replacement"
    r")\b",
    re.IGNORECASE,
)

_SENSOR_PRODUCT_RE = re.compile(
    r"\b(sensor|sensors|proximity|photoelectric|ultrasonic|infrared|inductive|"
    r"detector|detection|transducer)\b",
    re.IGNORECASE,
)

_SENSOR_ACCESSORY_RE = re.compile(
    r"\b(cable|connector|mount|bracket|holder|adapter|case|cover|battery)\b",
    re.IGNORECASE,
)

_LAPTOP_PRODUCT_RE = re.compile(
    r"\b(laptop|notebook|ultrabook|chromebook|macbook|thinkpad|ideapad|"
    r"elitebook|latitude|xps|pavilion|vivobook|zenbook|surface\s+laptop)\b",
    re.IGNORECASE,
)

_LAPTOP_ACCESSORY_RE = re.compile(
    r"\b("
    r"case|cover|sleeve|bag|backpack|charger|adapter|adaptor|cable|dock|"
    r"docking|stand|mount|battery|keyboard|mouse|screen\s+protector|"
    r"replacement|skin|sticker|cooling\s+pad|privacy\s+filter|laptop\s+gpu"
    r")\b",
    re.IGNORECASE,
)

_SERVER_PRODUCT_RE = re.compile(
    r"\b(server|rack\s+server|blade\s+server|tower\s+server|workstation|"
    r"nas|storage\s+server|compute\s+node)\b",
    re.IGNORECASE,
)

_SERVER_ACCESSORY_RE = re.compile(
    r"\b("
    r"rail|rails|rack\s+mount|mounting\s+kit|bracket|cable|adapter|drive\s+tray|caddy|"
    r"bezel|cover|fan|heatsink|power\s+supply|psu|memory|ram"
    r")\b",
    re.IGNORECASE,
)


def _tokens(*values: object) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        if value is None:
            continue
        if isinstance(value, list):
            tokens.update(_tokens(*value))
            continue
        for token in re.findall(r"[a-z0-9]+", str(value).lower()):
            if len(token) >= 3 and token not in _STOPWORDS:
                tokens.add(token)
    return tokens


def _requested_category(requirements: dict) -> str | None:
    haystack = " ".join(
        [
            str(requirements.get("product_type", "")),
            str(requirements.get("use_case", "")),
            " ".join(str(k) for k in requirements.get("product_keywords", [])),
        ]
    ).lower()
    for category, aliases in _KNOWN_CATEGORY_ALIASES.items():
        if any(alias in haystack for alias in aliases):
            return category
    return None


def product_matches_requirement(product: dict, requirements: dict) -> bool:
    """Best-effort category filter before numeric validation.

    Inventory is hackathon JSON, not a normalized catalog, so use stable field
    families plus product-name hints. Unknown product types must not fall through
    to every demo inventory category; they only match on explicit product-word
    overlap with inventory names.
    """
    name = str(product.get("product", "")).lower()
    category = _requested_category(requirements)
    stored_category = str(product.get("category", "")).strip().lower()

    if category and stored_category and stored_category != category:
        return False

    if category == "gpu":
        return bool(_GPU_MODEL_RE.search(name)) and not bool(_GPU_ACCESSORY_RE.search(name))

    if category == "chair":
        has_chair_specs = any(product.get(key) is not None for key in ("load_rating_kg", "seat_width_mm"))
        return (has_chair_specs or bool(_CHAIR_PRODUCT_RE.search(name))) and not bool(
            _CHAIR_ACCESSORY_RE.search(name)
        )

    if category == "sensor":
        has_sensor_specs = any(product.get(key) is not None for key in ("ip_rating", "range_m"))
        return (has_sensor_specs or bool(_SENSOR_PRODUCT_RE.search(name))) and not bool(
            _SENSOR_ACCESSORY_RE.search(name)
        )

    if category == "server":
        return bool(_SERVER_PRODUCT_RE.search(name)) and not bool(_SERVER_ACCESSORY_RE.search(name))

    if category == "laptop":
        return bool(_LAPTOP_PRODUCT_RE.search(name)) and not bool(_LAPTOP_ACCESSORY_RE.search(name))

    requested_tokens = _tokens(
        requirements.get("product_type", ""),
        requirements.get("use_case", ""),
        requirements.get("product_keywords", []),
    )
    name_tokens = _tokens(product.get("product", ""))
    return bool(requested_tokens and requested_tokens & name_tokens)
