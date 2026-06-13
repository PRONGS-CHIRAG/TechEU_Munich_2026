def generate_summary(
    requirements: dict,
    matched_suppliers: list,
    conversation_logs: list,
    validation_results: list,
    escalation_result: dict,
) -> str:
    n = len(matched_suppliers)
    lines = [f"{n} supplier{'s' if n != 1 else ''} were contacted.", ""]

    validation_map = {v["seller_id"]: v for v in validation_results}

    for supplier in matched_suppliers:
        sid = supplier["seller_id"]
        name = supplier["seller_name"]
        seller_logs = [l for l in conversation_logs if l["seller_id"] == sid and l["speaker"] == "seller"]
        validation = validation_map.get(sid)

        if not seller_logs:
            lines.append(f"{name} did not provide a compatible offer.")
            continue

        last_msg = seller_logs[-1]["message"]
        if validation:
            if validation["status"] == "passed":
                lines.append(f"{name} passed all technical checks. {last_msg}")
            else:
                constraints = "; ".join(validation["failed_constraints"])
                lines.append(f"{name} was rejected. Reason: {constraints}.")
        else:
            lines.append(f"{name}: {last_msg}")

    lines.append("")

    passed = [v for v in validation_results if v["status"] == "passed"]
    if passed:
        best = max(passed, key=lambda v: v["score"])
        best_name = next((s["seller_name"] for s in matched_suppliers if s["seller_id"] == best["seller_id"]), best["seller_id"])
        lines.append(f"Recommended supplier: {best_name}.")
        lines.append("Reason: Best balance of compatibility, price, delivery, warranty, and risk.")
    else:
        lines.append("No supplier fully satisfied all constraints.")

    if escalation_result.get("escalate"):
        lines.append(f"\nHuman approval required: {escalation_result.get('question_for_human', '')}")

    return "\n".join(lines)
