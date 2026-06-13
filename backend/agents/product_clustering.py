"""Product clustering — groups inventory products by spec similarity.

Uses greedy euclidean clustering on a normalized feature vector of
(length_mm, power_watts, price_eur, delivery_days).
"""

import math

_FEATURE_KEYS = ["length_mm", "power_watts", "price_eur", "delivery_days"]

_NORMS = {
    "length_mm": (150.0, 400.0),
    "power_watts": (50.0, 500.0),
    "price_eur": (100.0, 5000.0),
    "delivery_days": (1.0, 30.0),
}

_CLUSTER_THRESHOLD = 0.35


def _normalize(product: dict) -> list[float]:
    vec = []
    for key in _FEATURE_KEYS:
        lo, hi = _NORMS[key]
        val = float(product.get(key, (lo + hi) / 2))
        vec.append(max(0.0, min(1.0, (val - lo) / (hi - lo))))
    return vec


def _euclidean(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def cluster_products(requirements: dict, all_products: list[dict]) -> list[dict]:
    """Group products by spec similarity. Returns list of ProductCluster dicts."""
    if not all_products:
        return []

    clusters: list[dict] = []

    for product in all_products:
        vec = _normalize(product)
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
            vecs = [_normalize(p) for p in products]
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
                    "seller_id": p.get("seller_id", ""),
                    "seller_name": p.get("seller_name", ""),
                    "product": p.get("product", ""),
                    "length_mm": p.get("length_mm", 0),
                    "power_watts": p.get("power_watts", 0),
                    "price_eur": p.get("price_eur", 0),
                    "delivery_days": p.get("delivery_days", 0),
                    "warranty_years": p.get("warranty_years", 0),
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
