"""Risk sub-agent — contributes a vendor-reliability angle for a turn."""


def angle(requirements: dict, product: dict, seller: dict) -> str:
    reliability = seller.get("reliability_score", 0.5)
    style = seller.get("negotiation_style", "neutral")

    if reliability < 0.7:
        return (
            f"Vendor reliability score is {reliability} ({style} negotiator) — "
            "flag delivery risk and ask for a guarantee or penalty clause on delays."
        )
    return (
        f"Vendor reliability score is {reliability} ({style} negotiator) — "
        "low risk, but confirm stock availability before committing."
    )
