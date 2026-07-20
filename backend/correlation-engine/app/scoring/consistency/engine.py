import logging
from sqlalchemy.orm import Session
from app.services.session_fetcher import SessionFetcher
from app.core.correlation import CorrelationEngine
from app.models.database import Score
import uuid

logger = logging.getLogger(__name__)

class ScoringOrchestrator:
    def __init__(self):
        self.correlation_engine = CorrelationEngine()

    def process_session(self, db: Session, session_id: str) -> dict:
        # Fetch session
        session_data = SessionFetcher.fetch_session_data(db, session_id)
        if not session_data:
            raise ValueError(f"Session {session_id} not found in database.")
            
        # Run correlation
        correlation_res = self.correlation_engine.correlate(session_data)
        
        # Check if score already exists
        score_record = db.query(Score).filter(Score.session_id == session_id).first()
        
        # Build module scores JSON
        # For simplicity, extract existing MCQ or SIMULATION score if any, otherwise default
        existing_module_scores = score_record.module_scores if score_record else {}
        if not existing_module_scores:
            existing_module_scores = {"SIMULATION": 75.0}

        # Calculate composite
        composite_score = score_record.composite_score if score_record else 75.0
        
        # Mismatches list mapped to JSON serialization
        mismatches_json = [
            {"said": m.get("said", ""), "did": m.get("did", ""), "impact": m.get("impact", "")}
            for m in correlation_res.get("mismatches", [])
        ]
        
        if score_record:
            score_record.say_do_consistency_score = correlation_res["say_do_consistency_score"]
            score_record.say_do_rationale = correlation_res["say_do_rationale"]
            score_record.ai_confidence = correlation_res["ai_confidence"]
            score_record.grading_source = "correlation_engine"
            # Postgres JSON fields update
            # We will merge mismatches into the Score model
            # To do this safely on sqlalchemy without extra fields:
            # We can serialise mismatches to JSON or attach it to moduleScores.
            # However, since we added mismatches to prisma, let's store it as well if needed.
            # To avoid model mapping errors since we didn't add it as a database column in prisma (we only mapped it to TS DTOs),
            # let's double check if we added it as a column in schema.prisma.
            # In schema.prisma:
            # Score has: compositeScore, moduleScores, sayDoConsistencyScore, aiConfidence, humanReviewed, sayDoRationale, gradingSource.
            # It does NOT have a mismatches column! It was mapped to the frontend types only.
            # Wait, how does frontend get mismatches? In mock-data, mismatches are fields on Session.
            # Let's write mismatches inside the `moduleScores` or `sayDoRationale`?
            # Wait! In our schema.prisma modification we added:
            # `sayDoRationale String? @map("say_do_rationale")`
            # `gradingSource String @default("placeholder") @map("grading_source")`
            # But where do we store mismatches? Let's check schema.prisma again.
            # Yes! Score has no `mismatches` field.
            # Let's save mismatches inside the `moduleScores` JSON payload under key `__mismatches` or as a JSON string in `sayDoRationale`?
            # Storing mismatches in `moduleScores` JSON (under "__mismatches") is extremely clean and doesn't require schema changes!
            # Let's save it there so it persists nicely in Postgres JSONB.
            existing_module_scores["__mismatches"] = mismatches_json
            score_record.module_scores = existing_module_scores
        else:
            score_record = Score(
                id=str(uuid.uuid4()),
                session_id=session_id,
                composite_score=composite_score,
                module_scores={"SIMULATION": composite_score, "__mismatches": mismatches_json},
                say_do_consistency_score=correlation_res["say_do_consistency_score"],
                ai_confidence=correlation_res["ai_confidence"],
                human_reviewed=False,
                say_do_rationale=correlation_res["say_do_rationale"],
                grading_source="correlation_engine"
            )
            db.add(score_record)
            
        db.commit()
        db.refresh(score_record)
        
        return {
            "session_id": session_id,
            "say_do_consistency_score": score_record.say_do_consistency_score,
            "ai_confidence": score_record.ai_confidence,
            "say_do_rationale": score_record.say_do_rationale,
            "grading_source": score_record.grading_source,
            "mismatches": mismatches_json
        }
