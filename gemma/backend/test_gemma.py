"""
AURORA TECH — Hugging Face API Test
Run this before starting the server to verify your API key and models work.
Usage: cd backend && python test_gemma.py
"""
import asyncio, os, sys
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()

from backend.ai.llm_gateway import call_gemma_fast, call_gemma_smart, test_connection

async def main():
    print("=" * 50)
    print("AURORA TECH — Hugging Face API Test")
    print("=" * 50)

    print("\n1. Testing connection...")
    result = await test_connection()
    print(f"   Status: {result['status']}")
    if result['status'] == 'error':
        print(f"   Error: {result['message']}")
        print("   → Check your HUGGINGFACE_API_KEY in .env")
        return
    print(f"   Response: {result['response']}")

    print("\n2. Testing citizen chatbot (Fast model)...")
    response = await call_gemma_fast(
        "I am trapped under rubble and my leg is broken. What should I do?"
    )
    print(f"   Gemma says: {response[:200]}...")

    print("\n3. Testing triage agent (Smart model)...")
    from backend.ai.agents.triage_agent import run_triage
    triage = await run_triage("I smell gas and there are 3 people trapped in the building")
    print(f"   Triage: {triage}")

    print("\n[OK] ALL TESTS PASSED - AURORA is ready")
    print("   Start server with: uvicorn backend.main:app --reload")

asyncio.run(main())
