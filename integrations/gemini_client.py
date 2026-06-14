import os
import sys

try:
    from google import genai
    from google.genai import types
except ModuleNotFoundError:
    genai = None
    types = None

_MODEL = "gemini-2.5-flash"
_MODEL_FALLBACK = "gemini-2.0-flash-lite"
_FALLBACK = "[LLM unavailable — using fallback response]"
_TIMEOUT_SECONDS = 10  # Gemini API minimum is 10s; lower values get 400 INVALID_ARGUMENT

_client_cache: dict = {}


def _get_client(api_key: str):
    cached = _client_cache.get(api_key)
    if cached is not None:
        return cached
    client = genai.Client(
        api_key=api_key,
        http_options={"timeout": _TIMEOUT_SECONDS * 1000},
    )
    _client_cache[api_key] = client
    return client


def generate(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str:
    """Call Gemini and return the text response.

    Retries once on failure; returns a fallback string if both attempts fail
    or if LLM_API_KEY is not set.
    """
    api_key = os.getenv("LLM_API_KEY", "")
    if not api_key or genai is None or types is None:
        return _FALLBACK

    # Disable thinking for speed — saves 30-90s per call in demo context
    config: dict = {
        "temperature": temperature,
        "thinking_config": types.ThinkingConfig(thinking_budget=0),
    }
    if system:
        config["system_instruction"] = system
    if json_mode:
        config["response_mime_type"] = "application/json"

    client = _get_client(api_key)

    # Try the primary model first; if it fails, fall back to the proven-stable
    # model so the demo keeps running on real LLM output instead of the
    # templated fallback string.
    for attempt, model in enumerate((_MODEL, _MODEL_FALLBACK)):
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(**config),
            )
            return response.text or _FALLBACK
        except Exception as e:
            print(f"[gemini] {model} failed: {e}", file=sys.stderr)
            if attempt == 0:
                pass  # immediately try fallback model, no sleep
            else:
                return _FALLBACK

    return _FALLBACK
