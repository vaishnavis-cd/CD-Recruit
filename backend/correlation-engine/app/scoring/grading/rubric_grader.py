import logging
from typing import Dict, Any
from app.services.llm_client import LLMClient
from app.scoring.grading.prompts import GRADING_SYSTEM_PROMPT, GRADING_USER_PROMPT_TEMPLATE

logger = logging.getLogger(__name__)

CODING_RUBRIC = """
- Correctness (40%): Does the proposed logic/design address the core requirement and compile successfully?
- Quality & Structure (30%): Clean styling, logical modularity, readability.
- Efficiency & Performance (20%): Time/space complexity considerations.
- Edge Cases (10%): Null handling, bounds, boundary inputs.
"""

AI_PROMPTING_RUBRIC = """
- Prompt clarity and instructions structure (40%)
- Problem decomposition / step-by-step reasoning instructions (30%)
- Context utilization and constraint matching (20%)
- Output formatting guidelines specification (10%)
"""

class RubricGrader:
    def __init__(self):
        self.llm_client = LLMClient()

    def grade_response(self, module_type: str, question_content: Any, response_payload: Any, track: str = "fresher") -> Dict[str, Any]:
        """
        Grades response payload based on the module type.
        """
        if module_type == "CODING":
            rubric = CODING_RUBRIC
            candidate_resp = response_payload.get("code", "") + "\n" + response_payload.get("explanation", "")
        elif module_type == "AI_PROMPTING":
            rubric = AI_PROMPTING_RUBRIC
            candidate_resp = response_payload.get("prompt", "") or response_payload.get("prompts", "")
        else:
            # Fallback default deterministic score or static response grade
            return {"score": 75.0, "rationale": "Non-AI graded module fallback score.", "confidence": 1.0}

        user_prompt = GRADING_USER_PROMPT_TEMPLATE.format(
            question_content=str(question_content),
            candidate_response=str(candidate_resp),
            track=track,
            rubric=rubric
        )

        response_schema = {
            "type": "object",
            "properties": {
                "score": {"type": "number"},
                "rationale": {"type": "string"},
                "confidence": {"type": "number"}
            },
            "required": ["score", "rationale", "confidence"]
        }

        logger.info(f"Grading response for module type {module_type}")
        result = self.llm_client.generate_json(GRADING_SYSTEM_PROMPT, user_prompt, response_schema)
        
        # Ensure scale
        score = result.get("score", 0.0)
        if 0.0 <= score <= 1.0:
            score = score * 100.0
            
        return {
            "score": score,
            "rationale": result.get("rationale", ""),
            "confidence": result.get("confidence", 0.5)
        }
