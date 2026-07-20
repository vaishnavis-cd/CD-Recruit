import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/cdrecruit")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    CEREBRAS_API_KEY: str = os.getenv("CEREBRAS_API_KEY", "")
    CORRELATION_ENGINE_PORT: int = int(os.getenv("CORRELATION_ENGINE_PORT", "8000"))
    
    # Launch threshold default
    CONFIDENCE_THRESHOLD: float = 0.80
    
    # Model selections
    GROQ_MODEL: str = "llama3-70b-8192"
    CEREBRAS_MODEL: str = "llama3.1-70b"

    class Config:
        env_file = ".env"

settings = Settings()
