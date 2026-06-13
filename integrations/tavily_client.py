import os
from integrations.fallback_outputs import fallback_tavily_result

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
TIMEOUT = 10


def search_external_supplier(requirements: dict) -> dict:
    if not TAVILY_API_KEY:
        return fallback_tavily_result()

    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=TAVILY_API_KEY)
        query = (
            f"{requirements.get('product_type', 'GPU')} for {requirements.get('use_case', 'AI workstation')} "
            f"under €{requirements.get('budget_eur', 650)} compact size supplier Germany"
        )
        result = client.search(query=query, max_results=3)
        return {"source": "tavily", "results": result.get("results", []), "query": query}
    except Exception:
        return fallback_tavily_result()
