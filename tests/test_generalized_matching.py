from backend.agents.product_clustering import cluster_products
from backend.agents.product_utils import product_matches_requirement
from backend.agents.supplier_matching import match_suppliers
from backend.data_access import get_all_products_flat


def test_product_category_filter_keeps_gpu_and_chair_apart():
    gpu_req = {"product_type": "GPU"}
    chair_req = {"product_type": "office chair"}

    gpu_product = {"product": "RTX 4070", "length_mm": 242, "power_watts": 200}
    chair_product = {"product": "ErgoChair Standard", "load_rating_kg": 120}

    assert product_matches_requirement(gpu_product, gpu_req) is True
    assert product_matches_requirement(chair_product, gpu_req) is False
    assert product_matches_requirement(chair_product, chair_req) is True
    assert product_matches_requirement(gpu_product, chair_req) is False


def test_clusters_filter_to_requested_product_category():
    products = get_all_products_flat()

    clusters = cluster_products({"product_type": "industrial sensor"}, products)
    cluster_products_flat = [
        product
        for cluster in clusters
        for product in cluster["products"]
    ]

    assert cluster_products_flat
    assert all("range_m" in product or "ip_rating" in product for product in cluster_products_flat)


def test_supplier_matching_returns_category_relevant_sellers():
    suppliers = match_suppliers(
        {
            "product_type": "office chair",
            "budget_eur": 400,
            "max_delivery_days": 10,
            "warranty_required": True,
            "minimum_warranty_years": 2,
            "extra_constraints": [
                {
                    "field": "load_rating_kg",
                    "label": "Load rating",
                    "operator": ">=",
                    "limit": 120,
                    "unit": "kg",
                }
            ],
        }
    )

    assert suppliers
    assert suppliers[0]["seller_id"] == "vendor_f"


def test_unknown_custom_product_does_not_fall_back_to_demo_categories():
    products = get_all_products_flat()
    requirements = {
        "product_type": "industrial tablet",
        "product_keywords": ["industrial", "tablet"],
        "budget_eur": 900,
        "max_delivery_days": 12,
        "warranty_required": True,
        "minimum_warranty_years": 1,
        "extra_constraints": [],
    }

    clusters = cluster_products(requirements, products)
    suppliers = match_suppliers(requirements)

    assert clusters == []
    assert suppliers == []
    assert all(not product_matches_requirement(product, requirements) for product in products)
