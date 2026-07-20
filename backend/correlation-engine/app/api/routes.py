from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.schemas.correlation import CorrelationRequest, CorrelationResult
from app.scoring.consistency.engine import ScoringOrchestrator

router = APIRouter(prefix="/api/v1")
orchestrator = ScoringOrchestrator()

@router.post("/correlate", response_model=CorrelationResult)
def correlate_session(payload: CorrelationRequest, db: Session = Depends(get_db)):
    try:
        result = orchestrator.process_session(db, payload.session_id)
        return {
            "session_id": result["session_id"],
            "say_do_consistency_score": result["say_do_consistency_score"],
            "say_do_rationale": result["say_do_rationale"],
            "ai_confidence": result["ai_confidence"],
            "grading_source": result["grading_source"],
            "mismatches": result["mismatches"]
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
