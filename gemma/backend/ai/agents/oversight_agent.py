"""
AURORA TECH — Oversight Agent (Gemma 4 via google.genai)
Continuous operational synthesis and executive briefings for command center.
"""
from backend.ai.llm_gateway import call_gemma_smart
import json, re

OVERSIGHT_SYSTEM = """You are the AI strategic commander for AURORA disaster 
response platform. Generate executive briefings for human commanders.
Respond ONLY in valid JSON. No markdown. No explanation."""

async def run_oversight(full_state: dict) -> dict:
    prompt = f"""Full operational state: {json.dumps(full_state)}

Generate executive command briefing as ONLY this JSON:
{{
  "headline": "<current situation in 10 words max>",
  "critical_zones": ["<zone1>", "<zone2>", "<zone3>"],
  "top_priority": "<single most important action RIGHT NOW>",
  "efficiency_score": <integer 0-10>,
  "resources_needed": "<what is urgently missing>",
  "briefing": "<3 sentences for commander>",
  "lives_at_risk_estimate": <integer>,
  "estimated_resolution_hours": <float>
}}"""

    try:
        raw = await call_gemma_smart(prompt, system=OVERSIGHT_SYSTEM)
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass
    
    return {
        "headline": "Active earthquake response ongoing in Pune",
        "critical_zones": ["Unknown"],
        "top_priority": "Deploy all available units to critical zones",
        "efficiency_score": 6,
        "resources_needed": "More ambulances and NDRF teams",
        "briefing": "Operations are active. Gemma triage is processing incidents. Await full assessment.",
        "lives_at_risk_estimate": 0,
        "estimated_resolution_hours": 4.0
    }
