"""Product clustering — groups products from all seller inventories by spec
similarity relative to the buyer's requirements.

Sits between requirement extraction and the judging agent: it replaces the
old role of supplier_matching.py as the candidate generator. Output is a
ranked list of ProductCluster, best-fit cluster first.
"""

import math

from backend.schemas import ProductCluster

# Max number of clusters returned — bounds the number of judging-agent calls
# downstream.
MAX_CLUSTERS = 6

# Euclidean distance threshold (over normalized spec ratios) below which two
# products are considered part of the same cluster.
SIMILARITY_THRESHOLD = 0.25

_SPEC_KEYS = ("length_mm", "power_watts", "price_eur", "delivery_days", "warranty_years")


def _ratio_vector(requirements: dict, product: dict) -> list[float]:
    """Normalize a product's specs against the buyer's requirements.

    Ratios <= 1 mean the product meets that requirement. Warranty is inverted
    (higher warranty is better, so we express it as required/actual).
    """
    max_length = requirements.get("max_length_mm", 300) or 1
    max_power = requirements.get("max_power_watts", 250) or 1
    budget = requirements.get("budget_eur", 650) or 1
    max_delivery = requirements.get("max_delivery_days", 7) or 1
    min_warranty = requirements.get("minimum_warranty_years", 1) or 1

    warranty_years = product.get("warranty_years", 0) or 0
    warranty_ratio = min_warranty / warranty_years if warranty_years else 2.0

    return [
        product.get("length_mm", 0) / max_length,
        product.get("power_watts", 0) / max_power,
        product.get("price_eur", 0) / budget,
        product.get("delivery_days", 0) / max_delivery,
        warranty_ratio,
    ]


def _distance(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _fit_score(ratio_vector: list[float]) -> float:
    """Lower is better. Penalizes ratios above 1 (constraint violations) more
    heavily than being comfortably under budget."""
    penalty = 0.0
    for ratio in ratio_vector:
        if ratio > 1.0:
            penalty += (ratio - 1.0) * 3.0
        else:
            penalty += (1.0 - ratio) * 0.5
    return penalty


def cluster_products(requirements: dict, all_products: list[dict]) -> list[ProductCluster]:
    """Group products by spec similarity, ranked by best fit to requirements.

    `all_products` is a flat list of product dicts, each carrying
    `seller_id` / `seller_name` plus the spec fields in `_SPEC_KEYS`.
    """
    available = [p for p in all_products if p.get("availability") != "out_of_stock"]
    if not available:
        return []

    vectors = [_ratio_vector(requirements, p) for p in available]

    # Greedy clustering: walk products in fit-score order, attach each one to
    # the first existing cluster whose representative is within threshold,
    # otherwise start a new cluster.
    order = sorted(range(len(available)), key=lambda i: _fit_score(vectors[i]))

    clusters: list[dict] = []  # each: {"members": [idx], "rep_vector": [...]}
    for idx in order:
        placed = False
        for cluster in clusters:
            if _distance(vectors[idx], cluster["rep_vector"]) <= SIMILARITY_THRESHOLD:
                cluster["members"].append(idx)
                placed = True
                break
        if not placed:
            clusters.append({"members": [idx], "rep_vector": vectors[idx]})

    # Rank clusters by the fit score of their best member.
    clusters.sort(key=lambda c: min(_fit_score(vectors[i]) for i in c["members"]))
    clusters = clusters[:MAX_CLUSTERS]

    result: list[ProductCluster] = []
    for i, cluster in enumerate(clusters):
        members = [available[idx] for idx in cluster["members"]]
        member_vectors = [vectors[idx] for idx in cluster["members"]]

        avg_distance = (
            sum(_distance(v, cluster["rep_vector"]) for v in member_vectors) / len(member_vectors)
        )
        similarity_score = round(max(0.0, 1.0 - avg_distance), 2)

        representative_specs = {
            "avg_price_eur": round(sum(p.get("price_eur", 0) for p in members) / len(members), 2),
            "avg_delivery_days": round(sum(p.get("delivery_days", 0) for p in members) / len(members), 1),
            "avg_length_mm": round(sum(p.get("length_mm", 0) for p in members) / len(members), 1),
            "avg_power_watts": round(sum(p.get("power_watts", 0) for p in members) / len(members), 1),
            "avg_warranty_years": round(sum(p.get("warranty_years", 0) for p in members) / len(members), 1),
        }

        result.append(
            ProductCluster(
                cluster_id=f"cluster_{i + 1}",
                products=members,
                similarity_score=similarity_score,
                representative_specs=representative_specs,
            )
        )

    return result
