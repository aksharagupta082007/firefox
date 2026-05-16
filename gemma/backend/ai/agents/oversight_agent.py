"""
AURORA TECH — Oversight Agent
Continuous operational synthesis and bottleneck detection.
"""
import json
import logging
from typing import Dict, Any
from backend.ai.llm_gateway import llm_gateway

logger = logging.getLogger("aurora.ai.agents.oversight")

OVERSIGHT_PROMPT = """
You are the Strategic Oversight Agent for AURORA TECH. Your goal is to synthesize the current disaster state into a high-level briefing for the Command Center.

STATE SUMMARY:
{state_summary}

OBJECTIVE:
1. Identify major operational bottlenecks (e.g., unassigned critical clusters).
2. Detect resource exhaustion risks.
3. Summarize tactical progress.

STRICT OUTPUT FORMAT:
{{
  "operational_briefing": "Executive summary of the current situation",
  "bottlenecks": ["list of detected issues"],
  "critical_alerts": ["immediate priority items"],
  "system_efficiency_score": float (0-100)
}}
"""

class OversightAgent:
    async def synthesize(self, aggregated_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generates a strategic overview from the aggregated global state.
        """
        logger.info("Oversight synthesis in progress...")
        
        # Operational aggregation happens here (before sending to LLM)
        # We only send key metrics and summaries to stay within context limits
        summary = {
            "total_incidents": len(aggregated_state.get("sos_reports", [])),
            "unassigned_critical": sum(1 for c in aggregated_state.get("survivor_clusters", []) if c.get("priority") == "CRITICAL"),
            "resource_utilization": "85%", # Mock for now
            "active_dispatches": len(aggregated_state.get("dispatch_orders", [])),
            "infrastructure_damage_sites": len(aggregated_state.get("blocked_routes", []))
        }

        prompt = OVERSIGHT_PROMPT.format(state_summary=json.dumps(summary, indent=2))
        
        response = await llm_gateway.get_completion(
            prompt=prompt,
            system_instruction="You are the system oversight intelligence."
        )
        
        try:
            content = response["content"].strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            return json.loads(content)
        except Exception as e:
            logger.error(f"❌ Oversight synthesis failed: {e}")
            return {"operational_briefing": "Oversight engine error. Review raw logs."}

oversight_agent = OversightAgent()
