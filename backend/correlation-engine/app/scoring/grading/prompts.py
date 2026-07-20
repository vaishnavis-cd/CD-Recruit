GRADING_SYSTEM_PROMPT = """You are a technical grader for CD Recruit.
Your role is to grade candidate responses based on the provided technical rubric.
Evaluate the candidate response and assign a score between 0 and 100, and a confidence between 0 and 1.
You must return valid JSON.

JSON Schema format:
{
  "score": float, // A score from 0 to 100
  "rationale": "Detailed explanation of why this score was awarded based on the rubric",
  "confidence": float // Grader confidence from 0 to 1
}
"""

GRADING_USER_PROMPT_TEMPLATE = """Please grade the following response:

Question Context:
{question_content}

Candidate Response:
{candidate_response}

Assessment Track (Expectations level): {track}

GRADING RUBRIC:
{rubric}

Return the grade in the requested JSON format.
"""
