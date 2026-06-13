def check_escalation(validation_results: list, requirements: dict) -> dict:
    passed = [v for v in validation_results if v["status"] == "passed"]
    all_failed = len(passed) == 0

    if all_failed:
        return {
            "escalate": True,
            "reason": "No supplier offer passed all technical and commercial constraints.",
            "question_for_human": "No compatible offer was found. Do you want to relax your constraints or explore other suppliers?",
        }

    best = max(passed, key=lambda v: v["score"])

    return {
        "escalate": True,
        "reason": "Final approval required before completing procurement.",
        "question_for_human": f"The recommended offer scored {best['score']}/100. Do you approve this procurement recommendation?",
    }
