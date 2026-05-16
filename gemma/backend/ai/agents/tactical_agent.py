"""
AURORA TECH — Tactical Agent (Gemma 4 via google.genai)
Converts operational state into deployment intelligence and resource allocation.
"""
from backend.ai.llm_gateway import call_gemma_smart
import json, re

TACTICAL_SYSTEM = """You are a military-grade tactical disaster coordinator 
for Pune earthquake emergency response. Use data-driven decisions.
Respond ONLY in valid JSON. No markdown. No explanation."""

MOCK_RESOURCES = [
    {"id": "AMB-01", "type": "AMBULANCE", "lat": 18.5204, "lon": 73.8567, "status": "AVAILABLE"},
    {"id": "AMB-02", "type": "AMBULANCE", "lat": 18.5308, "lon": 73.9197, "status": "AVAILABLE"},
    {"id": "FIRE-01", "type": "FIRE_TRUCK", "lat": 18.4953, "lon": 73.8628, "status": "AVAILABLE"},
    {"id": "FIRE-02", "type": "FIRE_TRUCK", "lat": 18.5645, "lon": 73.7769, "status": "AVAILABLE"},
    {"id": "NDRF-01", "type": "NDRF_TEAM", "lat": 18.5089, "lon": 73.8074, "status": "AVAILABLE"},
    {"id": "POLICE-01", "type": "POLICE", "lat": 18.5167, "lon": 73.8553, "status": "AVAILABLE"},
]

async def run_tactical(incidents: list, resources: list = None) -> dict:
    if resources is None:
        resources = MOCK_RESOURCES
    
    prompt = f"""Active incidents requiring response: {json.dumps(incidents[:10])}
Available rescue resources: {json.dumps(resources)}

Generate tactical plan as ONLY this JSON:
{{
  "dispatch_orders": [
    {{
      "resource_id": "<id from resources list>",
      "resource_type": "AMBULANCE|FIRE_TRUCK|NDRF_TEAM|POLICE",
      "incident_id": "<id from incidents>",
      "target_lat": <float>,
      "target_lon": <float>,
      "priority": "IMMEDIATE|URGENT|NORMAL",
      "eta_minutes": <integer>,
      "justification": "<one data-backed sentence>"
    }}
  ],
  "blocked_routes": ["<road or area name>"],
  "situation_level": "CATASTROPHIC|CRITICAL|SEVERE|MODERATE",
  "unmet_needs": "<what resources are still needed>",
  "gemma_insight": "<one unique strategic recommendation>"
}}"""

    try:
        raw = await call_gemma_smart(prompt, system=TACTICAL_SYSTEM)
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass
    
    return {
        "dispatch_orders": [],
        "situation_level": "SEVERE",
        "blocked_routes": [],
        "unmet_needs": "Assessment ongoing",
        "gemma_insight": "Prioritize CRITICAL triage zones first."
    }
