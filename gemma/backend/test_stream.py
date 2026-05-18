import asyncio
import os
from openai import AsyncOpenAI

async def test_stream():
    local_client = AsyncOpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
    try:
        response_stream = await local_client.chat.completions.create(
            model="gemma2:2b",
            messages=[{"role": "user", "content": "hello"}],
            temperature=0.7,
            max_tokens=50,
            stream=True
        )
        print("Stream created successfully.")
        async for chunk in response_stream:
            print("Chunk received:", chunk)
    except Exception as e:
        print("Exception:", e)

asyncio.run(test_stream())
