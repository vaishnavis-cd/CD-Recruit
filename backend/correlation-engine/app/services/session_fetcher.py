from sqlalchemy.orm import Session
from app.models.database import Session as DBSession, ModuleResponse, Score, Candidate, RoleTemplate, EventLog
from typing import Dict, Any, List, Optional

class SessionFetcher:
    @staticmethod
    def fetch_session_data(db: Session, session_id: str) -> Optional[Dict[str, Any]]:
        # Fetch basic session info
        session = db.query(DBSession).filter(DBSession.id == session_id).first()
        if not session:
            return None
            
        candidate = db.query(Candidate).filter(Candidate.id == session.candidate_id).first()
        role_template = db.query(RoleTemplate).filter(RoleTemplate.id == session.role_template_id).first()
        
        # Fetch responses
        responses = db.query(ModuleResponse).filter(ModuleResponse.session_id == session_id).all()
        
        # Fetch event logs
        event_logs = db.query(EventLog).filter(EventLog.session_id == session_id).order_by(EventLog.occurred_at).all()
        
        module_responses_map = {}
        for r in responses:
            # Group responses by module type or identify coding/simulation/ai_prompting
            # We will use responsepayload structure
            module_responses_map[r.question_id] = {
                "payload": r.response_payload,
                "is_draft": r.is_draft,
                "time_spent": r.time_spent_seconds
            }
            
        return {
            "session_id": session_id,
            "status": session.status,
            "candidate_name": candidate.name if candidate else "Unknown Candidate",
            "candidate_email": candidate.email if candidate else "",
            "role_name": role_template.role_name if role_template else "Software Engineer",
            "duration_minutes": role_template.duration_minutes if role_template else 60,
            "weighting_preset": role_template.weighting_preset if role_template else {},
            "responses": module_responses_map,
            "raw_responses_list": [
                {
                    "question_id": r.question_id,
                    "payload": r.response_payload,
                    "is_draft": r.is_draft,
                    "time_spent": r.time_spent_seconds
                }
                for r in responses
            ],
            "event_logs": [
                {
                    "event_type": el.event_type,
                    "payload": el.payload,
                    "occurred_at": el.occurred_at
                }
                for el in event_logs
            ]
        }
