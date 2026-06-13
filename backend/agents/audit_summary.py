def generate_summary(
    requirements: dict,
    matched_suppliers: list,
    conversation_logs: list,
    validation_results: list,
    escalation_result: dict,
    raw_offers: list | None = None,
) -> str:
    n = len(matched_suppliers)
    lines = [f"{n} supplier{'s' if n != 1 else ''} were contacted.", ""]

    validation_map = {v["seller_id"]: v for v in validation_results}
    offer_map = {o["seller_id"]: o for o in (raw_offers or [])}

    for supplier in matched_suppliers:
        sid = supplier["seller_id"]
        name = supplier["seller_name"]
        validation = validation_map.get(sid)
        offer = offer_map.get(sid)

        if offer:
            offer_detail = (
                f"{name} offered {offer['product']} at €{offer['price_eur']} "
                f"with {offer['delivery_days']}-day delivery and {offer['warranty_years']}-year warranty."
            )
            if validation:
                if validation["status"] == "passed":
                    lines.append(f"{offer_detail} This offer passed all technical checks and stayed within budget.")
                else:
                    reasons = "; ".join(validation["failed_constraints"])
                    lines.append(f"{offer_detail} Rejected: {reasons}.")
            else:
                lines.append(offer_detail)
        else:
            seller_logs = [l for l in conversation_logs if l["seller_id"] == sid and l["speaker"] == "seller"]
            if seller_logs:
                lines.append(f"{name}: {seller_logs[-1]['message']}")
            else:
                lines.append(f"{name} did not provide a compatible offer.")

    lines.append("")

    passed = [v for v in validation_results if v["status"] == "passed"]
    if passed:
        best = max(passed, key=lambda v: v["score"])
        best_name = next((s["seller_name"] for s in matched_suppliers if s["seller_id"] == best["seller_id"]), best["seller_id"])
        best_offer = offer_map.get(best["seller_id"])
        if best_offer:
            lines.append(
                f"Recommended supplier: {best_name} — {best_offer['product']} at "
                f"€{best_offer['price_eur']}, {best_offer['delivery_days']}-day delivery."
            )
        else:
            lines.append(f"Recommended supplier: {best_name}.")
        lines.append("Reason: Best balance of compatibility, price, delivery, warranty, and risk.")
    else:
        lines.append("No supplier fully satisfied all constraints.")

    if escalation_result.get("escalate"):
        lines.append(f"\nHuman approval required: {escalation_result.get('question_for_human', '')}")

    return "\n".join(lines)
