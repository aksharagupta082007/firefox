import asyncio
import os
from huggingface_hub import AsyncInferenceClient
from dotenv import load_dotenv

load_dotenv(override=True)

async def main():
    hf_token = os.getenv("HUGGINGFACE_API_KEY")
    client = AsyncInferenceClient(token=hf_token)
    try:
        response = await client.chat_completion(
            model="google/gemma-4-31B-it",
            messages=[{"role": "user", "content": "What is 2+2? Answer in one word."}],
            max_tokens=1024,
            temperature=0.7
        )
        print("CONTENT:", repr(response.choices[0].message.content))
        print("REASONING:", repr(getattr(response.choices[0].message, "reasoning", "NO_REASONING_ATTR")))
        print("RAW MESSAGE:", response.choices[0].message)
    except Exception as e:
        print("ERROR:", e)

if __name__ == "__main__":
    asyncio.run(main())
