"""Records a live run_demo_stream() pass per buyer scenario to data/transcripts/.

These transcripts back DEMO_MODE=true replay mode: when a transcript exists
for a request_id, run_demo_stream() replays the saved {type, stage, data}
events instead of making live Gemini/Pioneer/Tavily/fal calls.

Usage (run from repo root, with LLM_API_KEY set in .env):
    python -m scripts.record_transcripts [request_id ...]

With no arguments, records every scenario in data/buyer_scenarios.json.
"""

import json
import os
import sys

# Force a live run regardless of the host .env's DEMO_MODE.
os.environ["DEMO_MODE"] = "false"

from backend.orchestrator import run_demo_stream  # noqa: E402

SCENARIOS_PATH = os.path.join(os.path.dirname(__file__), "../data/buyer_scenarios.json")
TRANSCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "../data/transcripts")


def record_scenario(scenario: dict) -> None:
    request_id = scenario["request_id"]
    request = {**scenario, "_interactive": False}

    print(f"Recording {request_id}...")
    transcript = []
    for raw_event in run_demo_stream(request):
        transcript.append({
            "type": raw_event["type"],
            "stage": raw_event["stage"],
            "data": raw_event["data"],
        })
        print(f"  {raw_event['type']}")

    os.makedirs(TRANSCRIPTS_DIR, exist_ok=True)
    out_path = os.path.join(TRANSCRIPTS_DIR, f"{request_id}.json")
    with open(out_path, "w") as f:
        json.dump(transcript, f, indent=2)
    print(f"  -> saved {len(transcript)} events to {out_path}")


def main() -> None:
    with open(SCENARIOS_PATH) as f:
        scenarios = json.load(f)

    requested_ids = set(sys.argv[1:])
    for scenario in scenarios:
        if requested_ids and scenario["request_id"] not in requested_ids:
            continue
        record_scenario(scenario)


if __name__ == "__main__":
    main()
