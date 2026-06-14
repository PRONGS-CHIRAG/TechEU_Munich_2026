"""Product clustering — groups inventory products by spec similarity.

Uses greedy euclidean clustering on a normalized feature vector.
Feature dimensions are derived from the actual product data rather than
hardcoded GPU assumptions, so the system works for any product category.
"""

import math

from backend.agents.product_utils import product_matches_requirement

_CLUSTER_THRESHOLD = 0.35

# Optional extra dims to include when a majority of products carry them
_OPTIONAL_DIMS = ["length_mm", "power_watts"]


def _build_feature_config(all_products: list[dict]) -> tuple[list[str], dict]:
    """Determine clustering dimensions and normalization ranges from actual product data.

    Always uses price_eur and delivery_days (universal).
    Adds optional dims (length_mm, power_watts) only when >= 50% of products have them.
    Normalization ranges are computed from real min/max values (not static GPU presets).
    """
    n = len(all_products)
    if n == 0:
        return [], {}

    feature_keys: list[str] = ["price_eur", "delivery_days"]

    for key in _OPTIONAL_DIMS:
        count = sum(
            1 for p in all_products
            if p.get(key) is not None and float(p.get(key, 0)) > 0
        )
        if count / n >= 0.5:
            feature_keys.append(key)

    norms: dict = {}
    for key in feature_keys:
        vals = [float(p[key]) for p in all_products if p.get(key) is not None]
        if not vals:
            norms[key] = (0.0, 1.0)
            continue
        lo, hi = min(vals), max(vals)
        if hi == lo:
            hi = lo + 1.0  # guard divide-by-zero
        norms[key] = (lo, hi)

    return feature_keys, norms


def _normalize(product: dict, feature_keys: list[str], norms: dict) -> list[float]:
    vec = []
    for key in feature_keys:
        lo, hi = norms[key]
        val_raw = product.get(key)
        if val_raw is None:
            vec.append(0.5)  # midpoint for absent fields
        else:
            val = float(val_raw)
            vec.append(max(0.0, min(1.0, (val - lo) / (hi - lo))))
    return vec


def _euclidean(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def cluster_products(requirements: dict, all_products: list[dict]) -> list[dict]:
    """Group products by spec similarity. Returns list of ProductCluster dicts."""
    if not all_products:
        return []

    category_products = [
        product for product in all_products
        if product_matches_requirement(product, requirements)
    ]
    if not category_products:
        return []
    all_products = category_products

    feature_keys, norms = _build_feature_config(all_products)
    if not feature_keys:
        return []

    clusters: list[dict] = []

    for product in all_products:
        vec = _normalize(product, feature_keys, norms)
        best_cluster = None
        best_dist = _CLUSTER_THRESHOLD

        for cluster in clusters:
            dist = _euclidean(vec, cluster["_centroid"])
            if dist < best_dist:
                best_dist = dist
                best_cluster = cluster

        if best_cluster is None:
            clusters.append({"_centroid": list(vec), "_products": [product]})
        else:
            best_cluster["_products"].append(product)
            n = len(best_cluster["_products"])
            best_cluster["_centroid"] = [
                (best_cluster["_centroid"][i] * (n - 1) + vec[i]) / n
                for i in range(len(vec))
            ]

    clusters.sort(key=lambda c: len(c["_products"]), reverse=True)

    result = []
    for i, cluster in enumerate(clusters):
        products = cluster["_products"]
        if not products:
            continue

        if len(products) == 1:
            similarity = 1.0
        else:
            vecs = [_normalize(p, feature_keys, norms) for p in products]
            dists = [
                _euclidean(vecs[a], vecs[b])
                for a in range(len(vecs))
                for b in range(a + 1, len(vecs))
            ]
            avg_dist = sum(dists) / len(dists)
            similarity = max(0.0, 1.0 - avg_dist / _CLUSTER_THRESHOLD)

        avg_price = sum(p.get("price_eur", 0) for p in products) / len(products)
        avg_delivery = sum(p.get("delivery_days", 0) for p in products) / len(products)

        result.append({
            "cluster_id": f"cluster_{i + 1}",
            "products": [
                {
                    **p,
                    # GPU-specific dims kept for backward compat (0 when absent)
                    "length_mm": p.get("length_mm", 0),
                    "power_watts": p.get("power_watts", 0),
                    "seller_id": p.get("seller_id", ""),
                    "seller_name": p.get("seller_name", ""),
                    "product": p.get("product", ""),
                    "availability": p.get("availability", "unknown"),
                }
                for p in products
            ],
            "similarity_score": round(similarity, 3),
            "representative_specs": {
                "avg_price_eur": round(avg_price, 2),
                "avg_delivery_days": round(avg_delivery, 1),
            },
        })

    return result
