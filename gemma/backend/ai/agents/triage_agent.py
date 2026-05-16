"""
AURORA TECH — Triage Agent (Gemma 4 via google.genai)
Extracts structured emergency intelligence from SOS messages.
"""
from backend.ai.llm_gateway import call_gemma_smart
import json, re

TRIAGE_SYSTEM = """You are a disaster triage AI for AURORA earthquake response 
platform in Pune, India. Extract structured intelligence from SOS messages.
Respond ONLY in valid JSON. No markdown. No explanation. No code blocks."""

async def run_triage(sos_text: str, context: str = "") -> dict:
    prompt = f"""Context (recent local incidents): {context if context else "None"}

New SOS Message: "{sos_text}"

Respond ONLY with this JSON:
{{
  "triage_level": "CRITICAL|HIGH|MODERATE|LOW",
  "victims_detected": <integer, 0 if unknown>,
  "is_trapped": <true|false>,
  "injury_summary": "<one sentence maximum>",
  "priority_score": <float 0.0 to 1.0>,
  "immediate_action": "<single most urgent action for first responders>",
  "special_hazards": ["gas_leak","fire","structural_collapse","flooding","electrical"]
}}"""

    try:
        raw = await call_gemma_smart(prompt, system=TRIAGE_SYSTEM)
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass
    
    # Safe fallback
    return {
        "triage_level": "HIGH",
        "victims_detected": 1,
        "is_trapped": False,
        "injury_summary": "Details unclear, sending emergency team.",
        "priority_score": 0.7,
        "immediate_action": "Dispatch nearest ambulance immediately.",
        "special_hazards": []
    }
