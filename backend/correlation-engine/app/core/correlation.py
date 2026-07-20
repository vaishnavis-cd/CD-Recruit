import logging
from typing import Dict, Any
from app.core.intent_classifier import IntentClassifier
from app.prompts.correlation_prompt import CORRELATION_SYSTEM_PROMPT, CORRELATION_USER_PROMPT_TEMPLATE
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

class CorrelationEngine:
    def __init__(self):
        self.llm_client = LLMClient()

    def correlate(self, session_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes text-only correlation comparing stated narratives and actual explanations.
        Note: Code-diff analysis is currently deferred as a post-MVP enhancement.
        """
        stated_narratives = IntentClassifier.extract_stated_narratives(session_data)
        actual_explanations = IntentClassifier.extract_actual_explanations(session_data)
        
        user_prompt = CORRELATION_USER_PROMPT_TEMPLATE.format(
            role_name=session_data.get("role_name", "Software Engineer"),
            stated_narratives=stated_narratives,
            actual_explanations=actual_explanations
        )

        response_schema = {
            "type": "object",
            "properties": {
                "consistency_score": {"type": "number"},
                "rationale": {"type": "string"},
                "confidence": {"type": "number"},
                "mismatches": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "said": {"type": "string"},
                            "did": {"type": "string"},
                            "impact": {"type": "string"}
                        },
                        "required": ["said", "did", "impact"]
                    }
                }
            },
            "required": ["consistency_score", "rationale", "confidence", "mismatches"]
        }

        logger.info(f"Running Say-Do consistency evaluation for session {session_data.get('session_id')}")
        result = self.llm_client.generate_json(CORRELATION_SYSTEM_PROMPT, user_prompt, response_schema)
        
        # Ensure consistency_score is scale 0-100 (some models return 0-1)
        score = result.get("consistency_score", 0.0)
        if 0.0 <= score <= 1.0:
            score = score * 100.0
            
        return {
            "say_do_consistency_score": score,
            "say_do_rationale": result.get("rationale", ""),
            "ai_confidence": result.get("confidence", 0.5),
            "mismatches": result.get("mismatches", []),
            "grading_source": "correlation_engine"
        }
