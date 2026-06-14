import os
import time

try:
    from google import genai
    from google.genai import types
except ModuleNotFoundError:
    genai = None
    types = None

_MODEL = "gemini-2.5-flash"
_FALLBACK = "[LLM unavailable — using fallback response]"


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

    config: dict = {"temperature": temperature}
    if system:
        config["system_instruction"] = system
    if json_mode:
        config["response_mime_type"] = "application/json"

    client = genai.Client(api_key=api_key)

    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(**config),
            )
            return response.text or _FALLBACK
        except Exception:
            if attempt == 0:
                time.sleep(1)
            else:
                return _FALLBACK

    return _FALLBACK
