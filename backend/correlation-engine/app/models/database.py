from sqlalchemy import create_engine, Column, String, Float, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from app.config.settings import settings

Base = declarative_base()

class RoleTemplate(Base):
    __tablename__ = "role_template"
    id = Column(String, primary_key=True)
    role_name = Column(String, name="role_name")
    weighting_preset = Column(JSONB, name="weighting_preset")
    duration_minutes = Column(Integer, name="duration_minutes")
    sessions = relationship("Session", back_populates="role_template")

class Session(Base):
    __tablename__ = "session"
    id = Column(String, primary_key=True)
    candidate_id = Column(String, ForeignKey("candidate.id"), name="candidate_id")
    role_template_id = Column(String, ForeignKey("role_template.id"), name="role_template_id")
    drive_id = Column(String, ForeignKey("drive.id"), name="drive_id", nullable=True)
    status = Column(String)
    tutorial_mode = Column(String, name="tutorial_mode", default="full")
    actual_start_at = Column(DateTime, name="actual_start_at")
    started_at = Column(DateTime, name="started_at")
    deadline_at = Column(DateTime, name="deadline_at")
    submitted_at = Column(DateTime, name="submitted_at")
    
    role_template = relationship("RoleTemplate", back_populates="sessions")
    candidate = relationship("Candidate", back_populates="sessions")
    module_responses = relationship("ModuleResponse", back_populates="session")
    score = relationship("Score", back_populates="session", uselist=False)

class Candidate(Base):
    __tablename__ = "candidate"
    id = Column(String, primary_key=True)
    email = Column(String, unique=True)
    name = Column(String)
    sessions = relationship("Session", back_populates="candidate")

class ModuleResponse(Base):
    __tablename__ = "module_response"
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("session.id"), name="session_id")
    question_id = Column(String, name="question_id")
    response_payload = Column(JSONB, name="response_payload")
    time_spent_seconds = Column(Integer, name="time_spent_seconds")
    is_draft = Column(Boolean, name="is_draft", default=True)
    
    session = relationship("Session", back_populates="module_responses")

class Score(Base):
    __tablename__ = "score"
    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("session.id"), name="session_id", unique=True)
    composite_score = Column(Float, name="composite_score")
    module_scores = Column(JSONB, name="module_scores")
    say_do_consistency_score = Column(Float, name="say_do_consistency_score")
    ai_confidence = Column(Float, name="ai_confidence")
    human_reviewed = Column(Boolean, name="human_reviewed", default=False)
    say_do_rationale = Column(String, name="say_do_rationale")
    grading_source = Column(String, name="grading_source", default="placeholder")

    session = relationship("Session", back_populates="score")

class Drive(Base):
    __tablename__ = "drive"
    id = Column(String, primary_key=True)
    name = Column(String)

class EventLog(Base):
    __tablename__ = "event_log"
    id = Column(String, primary_key=True)
    session_id = Column(String, name="session_id")
    event_type = Column(String, name="event_type")
    payload = Column(JSONB)
    occurred_at = Column(DateTime, name="occurred_at")

# Database session setup
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
