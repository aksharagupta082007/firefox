import requests
import json

url = "http://localhost:11434/v1/chat/completions"
payload = {
    "model": "gemma2:2b",
    "messages": [{"role": "user", "content": "hello"}],
    "stream": True
}
headers = {"Content-Type": "application/json"}

try:
    with requests.post(url, json=payload, headers=headers, stream=True) as response:
        print("Status Code:", response.status_code)
        for chunk in response.iter_content(chunk_size=None):
            if chunk:
                print("Received:", chunk.decode('utf-8'))
except Exception as e:
    print("Error:", e)
