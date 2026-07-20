from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class CorrelationRequest(BaseModel):
    session_id: str = Field(..., description="UUID of the candidate assessment session")

class MismatchDetail(BaseModel):
    said: str
    did: str
    impact: str

class CorrelationResult(BaseModel):
    session_id: str
    say_do_consistency_score: float
    say_do_rationale: Optional[str] = None
    ai_confidence: float
    grading_source: str
    mismatches: List[MismatchDetail]
