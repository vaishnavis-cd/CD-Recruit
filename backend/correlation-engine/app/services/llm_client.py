import json
import logging
from typing import Dict, Any, Optional
from groq import Groq
import httpx
from app.config.settings import settings

logger = logging.getLogger(__name__)

class LLMClient:
    def __init__(self):
        self.groq_client = Groq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY else None
        self.cerebras_api_key = settings.CEREBRAS_API_KEY
        
    def _call_groq(self, system_prompt: str, user_prompt: str, response_schema: dict) -> Optional[Dict[str, Any]]:
        if not self.groq_client:
            logger.warning("Groq client not configured.")
            return None
        try:
            chat_completion = self.groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model=settings.GROQ_MODEL,
                response_format={"type": "json_object"},
                temperature=0.1
            )
            content = chat_completion.choices[0].message.content
            return json.loads(content)
        except Exception as e:
            logger.error(f"Groq API call failed: {e}")
            return None

    def _call_cerebras(self, system_prompt: str, user_prompt: str, response_schema: dict) -> Optional[Dict[str, Any]]:
        if not self.cerebras_api_key:
            logger.warning("Cerebras API key not configured.")
            return None
        try:
            # Cerebras has an OpenAI-compatible endpoint
            headers = {
                "Authorization": f"Bearer {self.cerebras_api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": settings.CEREBRAS_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.1
            }
            # Post request to Cerebras completions endpoint
            response = httpx.post(
                "https://api.cerebras.ai/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=30.0
            )
            if response.status_code == 200:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                return json.loads(content)
            else:
                logger.error(f"Cerebras API returned status {response.status_code}: {response.text}")
                return None
        except Exception as e:
            logger.error(f"Cerebras API call failed: {e}")
            return None

    def generate_json(self, system_prompt: str, user_prompt: str, response_schema: dict) -> Dict[str, Any]:
        """
        Executes LLM request via Groq as primary, falling back to Cerebras if primary fails.
        """
        # Primary call: Groq
        logger.info("Attempting completion via Groq...")
        result = self._call_groq(system_prompt, user_prompt, response_schema)
        if result is not None:
            return result

        # Fallback call: Cerebras
        logger.warning("Groq execution failed or was unconfigured. Falling back to Cerebras...")
        result = self._call_cerebras(system_prompt, user_prompt, response_schema)
        if result is not None:
            return result
            
        # Hard fallback default output if all fails
        logger.critical("All LLM providers failed. Returning fallback schema.")
        return self._get_fallback_json(response_schema)

    def _get_fallback_json(self, schema: dict) -> Dict[str, Any]:
        # Return sensible default shapes matching target schema
        default_res: Dict[str, Any] = {}
        properties = schema.get("properties", {})
        for prop, details in properties.items():
            prop_type = details.get("type")
            if prop_type == "number":
                default_res[prop] = 0.0
            elif prop_type == "array":
                default_res[prop] = []
            elif prop_type == "object":
                default_res[prop] = {}
            elif prop_type == "boolean":
                default_res[prop] = False
            else:
                default_res[prop] = "Grader fallback output due to provider downtime."
        return default_res
