"""
AURORA TECH — Triage Agent
Converts chaotic citizen interaction into structured emergency intelligence.
"""
import json
import logging
from typing import Dict, Any
from backend.ai.llm_gateway import llm_gateway
from backend.ai.schemas.emergency import TriageIntelligence

logger = logging.getLogger("aurora.ai.agents.triage")

TRIAGE_PROMPT = """
You are the Lead Triage Engine for AURORA TECH. Your goal is to extract critical emergency intelligence from citizen distress messages.

INPUT: {message}

STRICT OUTPUT FORMAT:
You MUST return a JSON object that strictly adheres to the following schema:
{{
  "triage_level": "critical" | "high" | "medium" | "low",
  "victims_detected": int,
  "is_trapped": boolean,
  "mobility_status": "none" | "limited" | "mobile" | "unknown",
  "injury_summary": "Short description of injuries",
  "priority_score": float (0.0 to 1.0),
  "escalation_required": boolean
}}

CRITICAL RULES:
1. If "trapped" or "can't move" is mentioned, mobility_status is "none".
2. If multiple victims are mentioned, victims_detected must reflect that.
3. Priority score should be > 0.9 for critical life-threatening situations.
4. DO NOT include any text other than the JSON object.
"""

class TriageAgent:
    async def process(self, message: str) -> TriageIntelligence:
        """
        Processes a raw message and returns structured TriageIntelligence.
        """
        logger.info(f"Processing triage for message: {message[:50]}...")
        
        prompt = TRIAGE_PROMPT.format(message=message)
        
        response = await llm_gateway.get_completion(
            prompt=prompt,
            system_instruction="You are an emergency triage intelligence engine."
        )
        
        try:
            # Clean response content (handle potential markdown blocks)
            content = response["content"].strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            data = json.loads(content)
            return TriageIntelligence(**data)
        except Exception as e:
            logger.error(f"❌ Failed to parse triage output: {e}. Raw: {response['content']}")
            # Fallback to a safe "medium" triage if parsing fails
            return TriageIntelligence(
                triage_level="medium",
                injury_summary="Parsing failure, manual review required.",
                priority_score=0.5,
                escalation_required=True
            )

triage_agent = TriageAgent()
