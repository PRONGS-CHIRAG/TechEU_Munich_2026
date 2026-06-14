import os
from integrations.fallback_outputs import fallback_tavily_result

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
TIMEOUT = 10


def search_external_supplier(requirements: dict) -> dict:
    if not TAVILY_API_KEY:
        return fallback_tavily_result(requirements)

    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=TAVILY_API_KEY)
        product_type = requirements.get("product_type", "product")
        use_case = requirements.get("use_case", "business use")
        budget = requirements.get("budget_eur", 650)
        query = (
            f"{product_type} for {use_case} under €{budget} supplier Europe"
        )
        result = client.search(query=query, max_results=3)
        return {"source": "tavily", "results": result.get("results", []), "query": query}
    except Exception:
        return fallback_tavily_result(requirements)
