"""
AURORA TECH — Unified LLM Gateway
Abstracts Gemma 4 (Cloud) and Ollama (Edge) with automatic fallback.
"""
import os
import logging
from typing import List, Dict, Any, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
import ollama

logger = logging.getLogger("aurora.ai.gateway")

class LLMGateway:
    def __init__(self):
        self.cloud_model_name = "gemini-1.5-pro-latest" # Using Gemini/Gemma 4 equivalent
        self.edge_model_name = "gemma2"
        self.api_key = os.getenv("GOOGLE_AI_API_KEY")
        
        # Initialize Cloud LLM if API key exists
        self.cloud_llm = None
        if self.api_key:
            try:
                self.cloud_llm = ChatGoogleGenerativeAI(
                    model=self.cloud_model_name,
                    google_api_key=self.api_key,
                    temperature=0.1,
                    convert_system_message_to_human=True
                )
                logger.info("✅ Cloud LLM (Gemma/Gemini) initialized.")
            except Exception as e:
                logger.error(f"❌ Failed to initialize Cloud LLM: {e}")

    async def get_completion(self, 
                               prompt: str, 
                               system_instruction: Optional[str] = None,
                               schema: Optional[Dict[str, Any]] = None,
                               force_edge: bool = False) -> Dict[str, Any]:
        """
        Get completion with automatic fallback to edge model.
        """
        if not force_edge and self.cloud_llm:
            try:
                # Cloud inference
                messages = []
                if system_instruction:
                    messages.append(("system", system_instruction))
                messages.append(("human", prompt))
                
                response = await self.cloud_llm.ainvoke(messages)
                return {"content": response.content, "provider": "cloud"}
            except Exception as e:
                logger.warning(f"⚠️ Cloud LLM failed, falling back to edge: {e}")

        # Edge fallback (Ollama)
        try:
            logger.info(f"💾 Using Edge LLM ({self.edge_model_name})...")
            options = {"temperature": 0.1}
            response = ollama.chat(
                model=self.edge_model_name,
                messages=[
                    {'role': 'system', 'content': system_instruction or ""},
                    {'role': 'user', 'content': prompt},
                ],
                options=options
            )
            return {"content": response['message']['content'], "provider": "edge"}
        except Exception as e:
            logger.error(f"❌ Edge LLM also failed: {e}")
            raise Exception("Critical Failure: No LLM providers available.")

llm_gateway = LLMGateway()
