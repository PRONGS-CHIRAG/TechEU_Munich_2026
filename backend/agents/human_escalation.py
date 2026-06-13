def check_escalation(validation_results: list, requirements: dict, best_offer: dict | None = None) -> dict:
    passed = [v for v in validation_results if v["status"] == "passed"]
    all_failed = len(passed) == 0

    if all_failed:
        return {
            "escalate": True,
            "reason": "No supplier offer passed all technical and commercial constraints.",
            "question_for_human": "No compatible offer was found. Do you want to relax your constraints or explore other suppliers?",
        }

    best = max(passed, key=lambda v: v["score"])

    if best_offer:
        question = (
            f"The recommended offer scored {best['score']}/100 "
            f"(€{best_offer['price_eur']}, {best_offer['delivery_days']}-day delivery). "
            f"Do you approve this procurement recommendation?"
        )
    else:
        question = f"The recommended offer scored {best['score']}/100. Do you approve this procurement recommendation?"

    return {
        "escalate": True,
        "reason": "Final approval required before completing procurement.",
        "question_for_human": question,
    }
