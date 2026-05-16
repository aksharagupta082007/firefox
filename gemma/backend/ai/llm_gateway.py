"""
AURORA TECH — Unified LLM Gateway (Hybrid)
Primary: Hugging Face API (Gemma 4)
Fallback: Local Ollama API (Gemma 2B) via OpenAI SDK
"""
from huggingface_hub import AsyncInferenceClient
from openai import AsyncOpenAI
import os
import asyncio
import logging

logger = logging.getLogger("aurora.ai.gateway")

# Primary: Hugging Face
hf_token = os.getenv("HUGGINGFACE_API_KEY")
hf_client = AsyncInferenceClient(token=hf_token)
GEMMA_FAST = os.getenv("GEMMA_FAST_MODEL", "google/gemma-4-31B-it")
GEMMA_SMART = os.getenv("GEMMA_SMART_MODEL", "google/gemma-4-31B-it")

# Fallback: Local Ollama
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434/v1")
LOCAL_MODEL = os.getenv("LOCAL_FALLBACK_MODEL", "gemma2:2b")
local_client = AsyncOpenAI(base_url=OLLAMA_URL, api_key="ollama")


async def call_gemma_fast(prompt: str) -> str:
    """Fast model — citizen chat, low-latency triage chat."""
    messages = [{"role": "user", "content": prompt}]
    
    # Try Primary (Online)
    try:
        response = await hf_client.chat_completion(
            model=GEMMA_FAST,
            messages=messages,
            temperature=0.7,
            max_tokens=300,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.warning(f"🌐 HF API Failed (Fast): {e}. Fallback to LOCAL ({LOCAL_MODEL})")
        
    # Fallback (Offline)
    try:
        response = await local_client.chat.completions.create(
            model=LOCAL_MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=300,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"🛑 Local Fallback Failed (Fast): {e}")
        raise


async def call_gemma_smart(prompt: str, system: str = None) -> str:
    """Full model — triage, tactical, oversight agents."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    
    # Try Primary (Online)
    try:
        response = await hf_client.chat_completion(
            model=GEMMA_SMART,
            messages=messages,
            temperature=0.2,
            max_tokens=1024,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.warning(f"🌐 HF API Failed (Smart): {e}. Fallback to LOCAL ({LOCAL_MODEL})")
        
    # Fallback (Offline)
    try:
        response = await local_client.chat.completions.create(
            model=LOCAL_MODEL,
            messages=messages,
            temperature=0.2,
            max_tokens=1024,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"🛑 Local Fallback Failed (Smart): {e}")
        raise


async def test_connection() -> dict:
    """Quick health check — verifies API key + model access."""
    try:
        r = await call_gemma_fast("Reply with exactly: AURORA ONLINE")
        return {"status": "connected", "primary": GEMMA_FAST, "fallback": LOCAL_MODEL, "response": r.strip()}
    except Exception as e:
        return {"status": "error", "message": str(e)}
