"""
Gemma 4 Edge — Ollama / E2B Local Triage
Runs locally for Citizen Triage Chat. Provides offline first-aid
and shelter directions if cloud connectivity is lost.
"""
import os, logging, json
from typing import Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")

TRIAGE_SYSTEM_PROMPT = """You are AURORA Triage AI, running locally on the user's device in Pune during an earthquake emergency.
Your role:
1. Assess the user's situation quickly (injured? trapped? with others?)
2. Provide immediate first-aid instructions based on their condition.
3. Direct them to the nearest safe shelter or open ground.
4. Keep responses short, clear, and actionable — this is an emergency.

Key Pune shelters:
- Sambhaji Park, Deccan (18.5171, 73.8413)
- Pune Race Course (18.5225, 73.8596)
- Magarpatta City Open Grounds (18.5130, 73.9270)
- Savitribai Phule Pune University campus (18.5565, 73.8250)

If unsure, always advise: DROP, COVER, HOLD ON. Move to open ground when shaking stops."""


async def chat_with_edge_model(user_message: str, history: list = None) -> str:
    """Send a triage chat message to the local Ollama Gemma model."""
    messages = [{"role": "system", "content": TRIAGE_SYSTEM_PROMPT}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json={
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
                "options": {"temperature": 0.3, "num_predict": 512}
            })
            resp.raise_for_status()
            data = resp.json()
            return data.get("message", {}).get("content", "Stay calm. Move to open ground immediately.")
    except Exception as e:
        logger.error(f"Ollama chat failed: {e}")
        return ("⚠️ AI offline. Emergency steps:\n"
                "1. DROP, COVER, HOLD ON\n"
                "2. When shaking stops, move to open ground\n"
                "3. Nearest shelters: Sambhaji Park (Deccan), Race Course (Camp)\n"
                "4. Call 112 for emergency services")


async def run_edge_orchestration(event_data: Dict, context: Dict) -> Dict[str, Any]:
    """Fallback orchestration when cloud AI is unavailable."""
    prompt = (f"Earthquake M{event_data.get('magnitude','?')} detected in Pune. "
              f"{len(context.get('sos_reports',[]))} SOS reports received. "
              f"Verified score: {context.get('verified_score',0):.2f}. "
              f"Summarize the situation and recommend immediate actions for responders.")
    try:
        summary = await chat_with_edge_model(prompt)
    except Exception:
        summary = "Edge AI unavailable. Proceeding with algorithmic dispatch only."

    return {"ai_model": OLLAMA_MODEL, "mode": "edge_fallback",
            "ai_summary": summary, "steps": []}


async def check_ollama_status() -> Dict[str, Any]:
    """Check if Ollama is running and the model is available."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            has_model = any(OLLAMA_MODEL in m for m in models)
            return {"status": "online", "models": models,
                    "target_model": OLLAMA_MODEL, "model_available": has_model}
    except Exception as e:
        return {"status": "offline", "error": str(e)}
