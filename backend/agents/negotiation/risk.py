def get_risk_context(requirements: dict, product: dict, seller: dict) -> str:
    reliability = seller.get("reliability_score", 0.5)
    style = seller.get("negotiation_style", "")
    notes = []

    if reliability < 0.7:
        notes.append(
            f"Seller reliability score is low ({reliability:.0%}). "
            f"Request references or add a partial-prepayment protection clause."
        )
    if style == "rigid":
        notes.append(
            "Seller has a rigid negotiation style — limited flexibility. "
            "Document all agreed terms in writing before proceeding."
        )
    elif style == "aggressive":
        notes.append(
            "Seller may use pressure tactics. "
            "Stay calm, reference competing offers, and hold the budget floor."
        )

    if not notes:
        notes.append(
            f"Seller reliability is high ({reliability:.0%}). "
            f"Standard due diligence applies — confirm all terms before issuing a PO."
        )

    return " ".join(notes)
