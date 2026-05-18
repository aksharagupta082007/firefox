import asyncio
import os
from huggingface_hub import AsyncInferenceClient

async def test_hf_stream():
    hf_token = os.getenv("HUGGINGFACE_API_KEY")
    if not hf_token:
        print("Error: HUGGINGFACE_API_KEY not set")
        return

    hf_client = AsyncInferenceClient(token=hf_token)
    model_name = os.getenv("GEMMA_FAST_MODEL", "google/gemma-4-31B-it")
    messages = [{"role": "user", "content": "Hello, how are you? Answer in 5 words or less."}]
    
    print(f"Testing streaming with model: {model_name}")
    try:
        response_stream = await hf_client.chat_completion(
            model=model_name,
            messages=messages,
            max_tokens=100,
            stream=True
        )
        print("Stream started...")
        async for chunk in response_stream:
            print("RAW CHUNK:", chunk)
            if not chunk.choices:
                continue
            content = getattr(chunk.choices[0].delta, "content", "") or ""
            reasoning = getattr(chunk.choices[0].delta, "reasoning", "") or ""
            text_to_print = content or reasoning
            if text_to_print:
                print(text_to_print, end="", flush=True)
        print("\n\nStream complete.")
    except Exception as e:
        print(f"Exception during streaming: {e.__class__.__name__}: {e}")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(test_hf_stream())
