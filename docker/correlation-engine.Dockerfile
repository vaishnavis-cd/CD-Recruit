# ─────────────────────────────────────────────────────────────────────────────
# Correlation Engine — FastAPI Development Dockerfile
#
# Hot-reload via `uvicorn --reload` (watches backend/correlation-engine/app/).
#
# When running inside Docker Compose, bind-mount the source tree:
#   volumes:
#     - ./backend/correlation-engine:/app
#
# DATABASE_URL inside the container must use the Docker service name:
#   DATABASE_URL=postgresql://cdrecruit:cdrecruit123@postgres:5432/cdrecruit
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS dev

WORKDIR /app

# System deps for psycopg2 binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/correlation-engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY backend/correlation-engine/ .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
