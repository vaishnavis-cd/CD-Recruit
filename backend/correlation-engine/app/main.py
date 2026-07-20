from fastapi import FastAPI
from app.api.routes import router

app = FastAPI(title="CD Recruit - Correlation Engine", version="0.1.0")

app.include_router(router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "correlation-engine"}
