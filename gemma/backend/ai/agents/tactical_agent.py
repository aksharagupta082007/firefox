"""
AURORA TECH — Tactical Agent
Converts operational state into deployment intelligence and resource allocation.
"""
import json
import logging
from typing import List, Dict, Any
from backend.ai.llm_gateway import llm_gateway
from backend.ai.schemas.emergency import TacticalAction

logger = logging.getLogger("aurora.ai.agents.tactical")

TACTICAL_PROMPT = """
You are the Lead Tactical Officer for AURORA TECH. Your responsibility is to allocate resources based on the current disaster state.

RESOURCES:
{resources}

SURVIVOR CLUSTERS:
{clusters}

INFRASTRUCTURE DAMAGE:
{infrastructure}

TASK:
Identify the top 3 highest-priority deployment actions.

STRICT OUTPUT FORMAT:
Return a JSON list of TacticalAction objects:
[
  {{
    "action_type": "dispatch",
    "target_id": "cluster_ID",
    "resource_type": "ambulance",
    "priority": 1,
    "justification": "Why this action is critical",
    "requires_approval": true
  }}
]

CRITICAL RULES:
1. Prioritize hospitals and schools first.
2. Prioritize "Critical" triage clusters.
3. Use only available resources.
4. DO NOT hallucinate resources or locations.
"""

class TacticalAgent:
    async def reason(self, state: Dict[str, Any]) -> List[TacticalAction]:
        """
        Analyzes global state and generates tactical recommendations.
        """
        logger.info("Tactical reasoning in progress...")
        
        # In a real system, we would fetch current resources from Redis/Postgres
        # For now, we use the provided state context
        prompt = TACTICAL_PROMPT.format(
            resources=json.dumps(state.get("active_resources", []), indent=2),
            clusters=json.dumps(state.get("survivor_clusters", []), indent=2),
            infrastructure=json.dumps(state.get("blocked_routes", []), indent=2)
        )
        
        response = await llm_gateway.get_completion(
            prompt=prompt,
            system_instruction="You are a tactical deployment AI."
        )
        
        try:
            content = response["content"].strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            
            actions_data = json.loads(content)
            return [TacticalAction(**a) for a in actions_data]
        except Exception as e:
            logger.error(f"❌ Tactical reasoning failed: {e}")
            return []

tactical_agent = TacticalAgent()
