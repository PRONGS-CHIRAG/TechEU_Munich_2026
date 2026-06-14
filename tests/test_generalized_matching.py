from backend.agents.product_clustering import cluster_products
from backend.agents.product_utils import product_matches_requirement
from backend.agents.supplier_matching import match_suppliers
from backend.data_access import get_all_products_flat, _get_local_products_flat, _load_local
from backend.orchestrator import _external_candidates_from_tavily


def test_product_category_filter_keeps_gpu_and_chair_apart():
    gpu_req = {"product_type": "GPU"}
    chair_req = {"product_type": "office chair"}

    gpu_product = {"product": "RTX 4070", "length_mm": 242, "power_watts": 200}
    gpu_accessory = {"product": "HDMI to VGA Cable Adapter for Graphics Card", "length_mm": None, "power_watts": None}
    chair_product = {"product": "ErgoChair Standard", "load_rating_kg": 120}

    assert product_matches_requirement(gpu_product, gpu_req) is True
    assert product_matches_requirement(gpu_accessory, gpu_req) is False
    assert product_matches_requirement(chair_product, gpu_req) is False
    assert product_matches_requirement(chair_product, chair_req) is True
    assert product_matches_requirement(gpu_product, chair_req) is False


def test_laptop_matching_requires_actual_laptop_not_accessories():
    laptop_req = {"product_type": "laptop", "product_keywords": ["laptop"]}

    laptop_product = {"product": "Lenovo ThinkPad T14 Laptop", "category": "laptop"}
    laptop_sleeve = {"product": "Laptop Sleeve Case", "category": "laptop"}
    laptop_dock = {"product": "USB-C Docking Station for Laptop", "category": "laptop"}
    laptop_gpu_component = {"product": "RTX 4070 Laptop GPU", "category": "laptop"}
    gpu_product = {"product": "RTX 4070 Super Compact", "category": "gpu"}

    assert product_matches_requirement(laptop_product, laptop_req) is True
    assert product_matches_requirement(laptop_sleeve, laptop_req) is False
    assert product_matches_requirement(laptop_dock, laptop_req) is False
    assert product_matches_requirement(laptop_gpu_component, laptop_req) is False
    assert product_matches_requirement(gpu_product, laptop_req) is False


def test_supplier_matching_requires_compatible_exact_product_family(monkeypatch):
    registry = [
        {
            "seller_id": "seller_accessory",
            "seller_name": "Accessory Seller",
            "reliability_score": 0.9,
        },
        {
            "seller_id": "seller_laptop",
            "seller_name": "Laptop Seller",
            "reliability_score": 0.9,
        },
    ]
    inventory = [
        {
            "seller_id": "seller_accessory",
            "product": "Laptop Sleeve Case",
            "category": "laptop",
            "price_eur": 40,
            "delivery_days": 2,
            "warranty_years": 1,
        },
        {
            "seller_id": "seller_laptop",
            "product": "Lenovo ThinkPad T14 Laptop",
            "category": "laptop",
            "price_eur": 900,
            "delivery_days": 5,
            "warranty_years": 2,
        },
    ]
    monkeypatch.setattr("backend.agents.supplier_matching.get_seller_registry", lambda: registry)
    monkeypatch.setattr("backend.agents.supplier_matching.get_seller_inventory", lambda **_kw: inventory)

    suppliers = match_suppliers(
        {
            "product_type": "laptop",
            "product_keywords": ["laptop"],
            "budget_eur": 1200,
            "max_delivery_days": 10,
            "warranty_required": True,
            "minimum_warranty_years": 1,
            "extra_constraints": [],
        }
    )

    assert [supplier["seller_id"] for supplier in suppliers] == ["seller_laptop"]


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


def test_supplier_matching_returns_category_relevant_sellers(monkeypatch):
    # Pin data access to local JSON so Supabase Amazon data doesn't interfere
    local_registry = _load_local("seller_registry.json")
    local_inventory = _get_local_products_flat()
    monkeypatch.setattr("backend.agents.supplier_matching.get_seller_registry", lambda: local_registry)
    monkeypatch.setattr("backend.agents.supplier_matching.get_seller_inventory", lambda **_kw: local_inventory)

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


def test_tavily_results_can_populate_external_supplier_candidates():
    requirements = {
        "product_type": "industrial tablet",
        "budget_eur": 900,
        "max_delivery_days": 12,
        "warranty_required": True,
        "minimum_warranty_years": 1,
        "extra_constraints": [],
    }
    tavily_raw = {
        "results": [
            {
                "title": "Rugged Tablet Supplier Europe",
                "url": "https://example.com/rugged-tablet",
                "content": "Industrial tablet supplier with EU delivery.",
            }
        ]
    }

    suppliers, products, clusters = _external_candidates_from_tavily(tavily_raw, requirements)

    assert suppliers[0]["seller_id"] == "external_1"
    assert suppliers[0]["external"] is True
    assert products[0]["product"] == "industrial tablet from Rugged Tablet Supplier Europe"
    assert products[0]["price_eur"] <= requirements["budget_eur"]
    assert products[0]["delivery_days"] == requirements["max_delivery_days"]
    assert clusters[0]["cluster_id"] == "external_cluster_1"
