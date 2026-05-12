"""
Gemma 4 Cloud — Google AI API with Native Function Calling
Primary orchestrator for Autonomous Dispatch.
Uses function calling to get_survivor_clusters(), score_rescue_zones(), dispatch_resources().
Falls back to Ollama if GOOGLE_AI_API_KEY is missing.
"""
import os, json, logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

GOOGLE_AI_API_KEY = os.getenv("GOOGLE_AI_API_KEY", "")
GEMMA_MODEL = "gemma-4-27b-it"

# ── Tool definitions for Gemma 4 function calling ───────────────────────
TOOL_DEFINITIONS = [
    {
        "name": "get_survivor_clusters",
        "description": "Analyze SOS reports and return DBSCAN survivor clusters with KDE heatmap data for the impact zone.",
        "parameters": {
            "type": "object",
            "properties": {
                "event_id": {"type": "integer", "description": "The seismic event ID to analyze"}
            },
            "required": ["event_id"]
        }
    },
    {
        "name": "score_rescue_zones",
        "description": "Score and rank rescue zones by priority using severity, anomaly density, distress density, and access difficulty. Auto-escalates zones near hospitals/schools.",
        "parameters": {
            "type": "object",
            "properties": {
                "event_id": {"type": "integer", "description": "The seismic event ID"},
                "clusters": {"type": "array", "description": "List of cluster dicts from get_survivor_clusters"}
            },
            "required": ["event_id"]
        }
    },
    {
        "name": "dispatch_resources",
        "description": "Dispatch nearest available rescue units to prioritized zones via safe routes avoiding blocked roads.",
        "parameters": {
            "type": "object",
            "properties": {
                "event_id": {"type": "integer", "description": "The seismic event ID"},
                "scored_zones": {"type": "array", "description": "Priority-sorted zones from score_rescue_zones"},
                "blocked_roads": {"type": "array", "description": "List of blocked road tuples"}
            },
            "required": ["event_id"]
        }
    }
]

SYSTEM_PROMPT = """You are AURORA, an AI earthquake response coordinator for Pune, Maharashtra.
When an earthquake is detected, you must:
1. Call get_survivor_clusters to identify where survivors are concentrated.
2. Call score_rescue_zones to rank zones by rescue priority.
3. Call dispatch_resources to send the nearest units via safe routes.
After each step, summarize findings. Be decisive — lives depend on speed.
Pune is in Seismic Zone III (moderate risk). Key areas: Shivajinagar, Kothrud, Hinjewadi, Koregaon Park."""


async def run_cloud_orchestration(event_data: Dict[str, Any], pipeline_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run the Gemma 4 cloud orchestration pipeline.
    If GOOGLE_AI_API_KEY is missing, falls back to Ollama via gemma_edge.
    """
    if not GOOGLE_AI_API_KEY:
        logger.warning("GOOGLE_AI_API_KEY not set — falling back to Ollama edge model")
        from backend.ai.gemma_edge import run_edge_orchestration
        return await run_edge_orchestration(event_data, pipeline_context)

    try:
        from google import genai
        client = genai.Client(api_key=GOOGLE_AI_API_KEY)

        prompt = f"""EARTHQUAKE DETECTED in Pune!
Magnitude: {event_data.get('magnitude', 'Unknown')}
Epicenter: {event_data.get('lat', 0)}, {event_data.get('lon', 0)}
Time: {event_data.get('timestamp', 'now')}
SOS Reports: {len(pipeline_context.get('sos_reports', []))} received
Sensor Anomaly Score: {pipeline_context.get('phone_anomaly', 0):.2f}
Verified Score: {pipeline_context.get('verified_score', 0):.2f}

Execute the full response protocol: cluster survivors → score zones → dispatch units."""

        response = client.models.generate_content(
            model=GEMMA_MODEL,
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                tools=[genai.types.Tool(function_declarations=[
                    genai.types.FunctionDeclaration(**td) for td in TOOL_DEFINITIONS
                ])],
                temperature=0.2,
            )
        )

        # Process function calls from Gemma
        result = {"ai_model": GEMMA_MODEL, "mode": "cloud", "steps": []}
        for part in response.candidates[0].content.parts:
            if hasattr(part, 'function_call') and part.function_call:
                fc = part.function_call
                result["steps"].append({
                    "function": fc.name,
                    "args": dict(fc.args) if fc.args else {},
                })
            elif hasattr(part, 'text') and part.text:
                result["ai_summary"] = part.text

        if not result.get("ai_summary"):
            result["ai_summary"] = "Autonomous dispatch sequence initiated for Pune earthquake response."

        return result

    except Exception as e:
        logger.error(f"Cloud AI failed: {e}, falling back to Ollama")
        from backend.ai.gemma_edge import run_edge_orchestration
        return await run_edge_orchestration(event_data, pipeline_context)


def generate_incident_summary(pipeline_results: Dict[str, Any]) -> str:
    """Generate a human-readable incident summary (works without API)."""
    impact = pipeline_results.get("impact", {})
    clusters = pipeline_results.get("clusters", [])
    dispatches = pipeline_results.get("dispatches", [])
    trigger = pipeline_results.get("trigger", {})

    summary_parts = [
        f"## AURORA Incident Report — Pune Earthquake",
        f"**Magnitude:** {trigger.get('magnitude', 'N/A')} | **Source:** {trigger.get('source', 'N/A')}",
        f"**Epicenter:** ({trigger.get('lat', 0):.4f}, {trigger.get('lon', 0):.4f})",
        f"**Impact Radius:** {impact.get('impact_radius_km', 'N/A')} km",
        f"**Infrastructure Affected:** {impact.get('summary', {}).get('total_affected', 0)}",
        f"  - Hospitals: {impact.get('summary', {}).get('hospitals_affected', 0)}",
        f"  - Schools: {impact.get('summary', {}).get('schools_affected', 0)}",
        f"**Survivor Clusters:** {len(clusters)}",
        f"**Units Dispatched:** {len(dispatches)}",
    ]

    for d in dispatches[:5]:
        route = d.get("route", {})
        summary_parts.append(
            f"  → {d.get('unit_type','?').upper()} → Zone {d.get('zone_id',0)} "
            f"(ETA: {d.get('eta_minutes', '?')} min via {' → '.join(route.get('route_nodes', [])[:3])})"
        )

    return "\n".join(summary_parts)
