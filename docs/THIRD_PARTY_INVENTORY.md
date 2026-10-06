# Comprehensive Third-Party Inventory: CD-Recruit Platform

This document provides a complete audit of all **third-party services, cloud APIs, daemon containers, machine learning runtimes, external tools, and npm/pip libraries** used across the CD-Recruit monorepo codebase.

---

## 1. Summary by Layer

| Layer | Key Components |
|---|---|
| **External Infrastructure & Daemons** | Judge0 CE, MinIO, PostgreSQL 16, MongoDB 6.0, Redis 7, Nginx, Prometheus, Grafana |
| **External AI & LLM Cloud APIs** | Groq Cloud, Cerebras Cloud, Anthropic Claude, Google Gemini |
| **Biometrics, Computer Vision & OCR** | DeepFace (FastAPI), TensorFlow/Keras, OpenCV, ONNX Runtime (Node/Web), Tesseract.js, PaddleOCR ONNX, Google MediaPipe, Sharp, ClipperLib |
| **In-Browser Runtimes & Code Editors** | Microsoft Monaco Editor, sql.js (WebAssembly SQLite) |
| **Backend Framework & Services** | NestJS, Prisma ORM, BullMQ, ioredis, pg, mongodb driver, MinIO SDK, Passport/JWT, Class Validator, Opossum, Fuzzball, Swagger UI |
| **Frontend Framework & UI** | React 19, Zustand, TanStack Suite (Router, Start, Query), React Router, Axios, Radix UI, Tailwind CSS v4, React Hook Form, Zod, Framer Motion, Lucide, Recharts, Sonner, CMDK, Vaul |
| **Testing, Build & DevOps** | Vite, TypeScript, tsx, Jest, Supertest, Grafana k6, ESLint, Prettier, esbuild |
| **B2B Ecosystem** | External ATS Partner Webhook & REST Ingestion APIs |

---

## 2. External Infrastructure, Databases & Container Daemons

### 1. Judge0 CE (Community Edition)
* **Type:** Containerized Code Execution Sandbox (Self-Hosted / Cloud RapidAPI)
* **Version:** `1.13.1`
* **Docker Image:** `judge0/judge0:1.13.1`
* **Where Used:**
  * Docker compose: [`codebase/docker-compose.yml`](file:///d:/Projects/cd-recruit/codebase/docker-compose.yml#L83-L152), [`codebase/docker/docker-compose.judge0.yml`](file:///d:/Projects/cd-recruit/codebase/docker/docker-compose.judge0.yml)
  * Backend API: [`backend/api/src/integrations/judge0/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/) (`judge0.service.ts`, `judge0.client.ts`, `judge0-webhook.controller.ts`)
  * Config: [`backend/api/src/config/configuration.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/config/configuration.ts#L36-L44)
  * Benchmarks: [`k6/scripts/judge0_load_test.js`](file:///d:/Projects/cd-recruit/codebase/k6/scripts/judge0_load_test.js)
* **Why Used:**
  * Executes untrusted candidate source code in polyglot assessments (Python, C++, Java, JavaScript, TypeScript, Go).
  * Uses Linux `isolate` sandboxes and kernel cgroups with strict hardware constraints (`CPU_TIME_LIMIT=5.0s`, `MEMORY_LIMIT=262144KB`) to prevent fork bombs, malicious system calls, and host resource starvation.

### 2. MinIO Object Storage
* **Type:** High-Performance S3-Compatible Distributed Object Storage
* **Docker Image:** `minio/minio:latest`
* **Where Used:**
  * Docker compose: [`codebase/docker-compose.yml`](file:///d:/Projects/cd-recruit/codebase/docker-compose.yml#L63-L81) (Ports 9000 & 9001)
  * Backend API: [`backend/api/src/integrations/minio/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/minio/) (`minio.service.ts`)
  * Scripts: [`codebase/scripts/sync-manual-to-storage.js`](file:///d:/Projects/cd-recruit/codebase/scripts/sync-manual-to-storage.js)
* **Why Used:**
  * Stores binary assets across two dedicated buckets:
    1. `cd-recruit-general`: Candidate resumes, CSV candidate export data, drive reports.
    2. `cd-recruit-biometric`: Webcam snapshots, 10-second video violation evidence clips, baseline selfie portraits, and ID proof scans.
  * Generates cryptographically signed, short-lived presigned GET and PUT URLs (`evidenceClipUrlTtlSeconds`, default 300s) to eliminate direct server streaming bottlenecks.

### 3. AWS S3 (Amazon Simple Storage Service)
* **Type:** Cloud Object Storage (Production Drop-in)
* **Where Used:**
  * Config & Environment: [`codebase/.env.example`](file:///d:/Projects/cd-recruit/codebase/.env.example#L64-L73), [`backend/api/src/config/configuration.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/config/configuration.ts#L62-L72)
* **Why Used:**
  * Acts as the seamless production cutover for MinIO using AWS IAM keys, HTTPS, and regional endpoints (`s3.<region>.amazonaws.com`) without modifying application code.

### 4. PostgreSQL 16
* **Type:** Primary Relational Database
* **Docker Image:** `postgres:16-alpine`
* **Where Used:**
  * Docker compose: [`codebase/docker-compose.yml`](file:///d:/Projects/cd-recruit/codebase/docker-compose.yml#L9-L28) (Host Port 5434 -> Container Port 5432)
  * Backend Prisma ORM: [`codebase/backend/prisma/schema.prisma`](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma)
  * Database initialization: [`codebase/docker/postgres-init/`](file:///d:/Projects/cd-recruit/codebase/docker/postgres-init/)
* **Why Used:**
  * Authoritative relational store for all application data: Staff credentials, Drives, Candidates, Sessions, Questions, Rubrics, Proctoring Events, Submissions, Scores, and Audit Logs.

### 5. PostgreSQL Sandbox Database
* **Type:** Isolated Relational Database Instance
* **Where Used:**
  * Config: [`codebase/.env.example`](file:///d:/Projects/cd-recruit/codebase/.env.example#L35-L38) (`SANDBOX_DB_URL`)
  * Backend Module: [`backend/api/src/sql/sql.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql.service.ts)
* **Why Used:**
  * Provides an isolated database user with strict read-only permissions and aggressive query execution timeouts to execute candidate SQL queries without endangering the core CD-Recruit schema.

### 6. AWS RDS PostgreSQL
* **Type:** Managed Cloud Database Service
* **Where Used:**
  * Config & Architecture: [`codebase/.env.example`](file:///d:/Projects/cd-recruit/codebase/.env.example#L32-L34), [`docs/architecture/INFRA_MODE.md`](file:///d:/Projects/cd-recruit/codebase/docs/architecture/INFRA_MODE.md#L62-L66)
* **Why Used:**
  * Managed high-availability database target for production AWS VPC deployments.

### 7. MongoDB 6.0
* **Type:** NoSQL Document Database
* **Docker Image:** `mongo:6.0`
* **Where Used:**
  * Docker compose: [`codebase/docker-compose.yml`](file:///d:/Projects/cd-recruit/codebase/docker-compose.yml#L44-L62) (Port 27017)
  * Backend Module: [`backend/api/src/modules/nosql/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/modules/nosql/) (`nosql-sandbox.service.ts`, `nosql-execution.service.ts`)
* **Why Used:**
  * Backs the interactive NoSQL assessment module. Spins up candidate sessions against ephemeral collections to evaluate document queries, updates, and aggregation pipelines.

### 8. Redis 7
* **Type:** In-Memory Key-Value Data Store & Message Broker
* **Docker Image:** `redis:7-alpine`
* **Where Used:**
  * Docker compose: [`codebase/docker-compose.yml`](file:///d:/Projects/cd-recruit/codebase/docker-compose.yml#L29-L43) (Port 6379)
  * Backend Queues & Caching: [`backend/api/src/queue/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/queue/), [`backend/api/src/common/redis/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/common/redis/)
* **Why Used:**
  * Powers BullMQ background job processing:
    1. Candidate disconnect grace-window auto-submission countdowns.
    2. Heartbeat staleness checks and telemetry aggregation.
    3. Session caching and distributed rate-limiting.

### 9. Nginx
* **Type:** HTTP Reverse Proxy & Web Server
* **Docker Image:** `nginx:alpine`
* **Where Used:**
  * Container definition: [`docker/candidate-web.Dockerfile`](file:///d:/Projects/cd-recruit/codebase/docker/candidate-web.Dockerfile)
  * Config: [`docker/nginx/candidate.conf`](file:///d:/Projects/cd-recruit/codebase/docker/nginx/candidate.conf) (Port 5174 -> 80)
* **Why Used:**
  * Serves the Candidate Web SPA with Gzip compression and 1-year immutable caching.
  * Injects critical browser isolation headers (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`) required for WebAssembly threading (`sql.js`) and high-resolution webcam proctoring.

### 10. Prometheus & Grafana
* **Type:** Metrics Scraping, Time-Series DB & Observability Dashboards
* **Docker Images:** `prom/prometheus:latest`, `grafana/grafana:latest`
* **Where Used:**
  * Compose: [`codebase/docker/docker-compose.monitoring.yml`](file:///d:/Projects/cd-recruit/codebase/docker/docker-compose.monitoring.yml) (Ports 9090 & 3100)
* **Why Used:**
  * Ingests runtime metrics, monitors API request throughput, memory consumption, queue health, and Judge0 job latency.

---

## 3. External AI & LLM Inference APIs

### 11. Groq Cloud API
* **Provider:** Groq Inc.
* **Models:** `llama-3.3-70b-versatile`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`
* **Where Used:**
  * Service: [`backend/api/src/integrations/ai/ai-evaluation.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/ai/ai-evaluation.service.ts#L207-L245)
  * Environment: `GROQ_API_KEY`, `GROQ_MODEL`
* **Why Used:**
  * High-throughput LPUs providing sub-second inference speeds.
  * Grades candidate submissions in:
    1. **AI Prompting:** Evaluating instructions clarity, context handling, and constraint adherence.
    2. **Workplace Simulation:** Evaluating technical decision quality and communication.
    3. **QA Test Scenarios:** Semantic verification against reference criteria with negation detection.

### 12. Cerebras Cloud API
* **Provider:** Cerebras Systems
* **Models:** `llama-3.3-70b`, `gpt-oss-120b`
* **Where Used:**
  * Service: [`backend/api/src/integrations/ai/ai-evaluation.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/ai/ai-evaluation.service.ts#L247-L280)
  * Environment: `CEREBRAS_API_KEY`, `CEREBRAS_MODEL`
* **Why Used:**
  * Automated secondary LLM failover engine. Automatically takes over evaluation requests if Groq experiences rate limiting, quota depletion, or upstream timeouts.

### 13. Anthropic Claude API
* **Provider:** Anthropic PBC
* **Model:** `claude-3-5-sonnet-20241022`
* **Where Used:**
  * Service: [`backend/api/src/simulation/event-generation.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/event-generation.service.ts#L150-L186) (`ClaudeProvider`)
  * Environment: `ANTHROPIC_API_KEY`
* **Why Used:**
  * Generates rich, contextual workplace engineering incident scenarios and dynamic dialog assets for candidates.

### 14. Google Gemini API
* **Provider:** Google Cloud
* **Model:** `gemini-pro`
* **Where Used:**
  * Service: [`backend/api/src/simulation/event-generation.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/event-generation.service.ts#L188-L220) (`GeminiProvider`)
  * Environment: `GEMINI_API_KEY`
* **Why Used:**
  * Alternative generative AI provider for dynamic engineering scenario synthesis when `LLM_PROVIDER=gemini`.

---

## 4. Biometrics, Computer Vision & OCR Runtimes

### 15. DeepFace
* **Language:** Python
* **Where Used:**
  * Microservice: [`services/face-verify/app.py`](file:///d:/Projects/cd-recruit/codebase/services/face-verify/app.py), [`services/face-verify/requirements.txt`](file:///d:/Projects/cd-recruit/codebase/services/face-verify/requirements.txt)
* **Why Used:**
  * High-accuracy face recognition framework wrapping deep neural networks. Generates 512-dimensional face embeddings for candidate KYC enrollment and live selfie matching.

### 16. TensorFlow / tf-keras
* **Language:** Python
* **Where Used:**
  * Microservice: [`services/face-verify/requirements.txt`](file:///d:/Projects/cd-recruit/codebase/services/face-verify/requirements.txt)
* **Why Used:**
  * Underpinning machine learning tensor framework that executes the ArcFace model weights inside DeepFace.

### 17. OpenCV (`opencv-python`)
* **Language:** Python
* **Where Used:**
  * Microservice: [`services/face-verify/app.py`](file:///d:/Projects/cd-recruit/codebase/services/face-verify/app.py)
* **Why Used:**
  * Ingests candidate image buffers, decodes multipart file uploads, converts color profiles (BGR to RGB), and resizes bounding boxes.

### 18. FastAPI & Uvicorn
* **Language:** Python
* **Where Used:**
  * Microservice: [`services/face-verify/app.py`](file:///d:/Projects/cd-recruit/codebase/services/face-verify/app.py) (Host Port 8001)
* **Why Used:**
  * Lightweight ASGI web server exposing `/enroll` and `/verify` REST endpoints to the NestJS backend.

### 19. ONNX Runtime (`onnxruntime-node` & `onnxruntime-web`)
* **Package:** `onnxruntime-node` (`^1.29.0`), `onnxruntime-web` (`^1.29.0`)
* **Where Used:**
  * Backend API: [`backend/api/src/integrations/face-verify-onnx/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/face-verify-onnx/), [`backend/api/src/integrations/ocr/id-ocr.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/ocr/id-ocr.service.ts)
* **Why Used:**
  * Cross-platform, hardware-accelerated machine learning inference engine. Enables in-process neural network evaluation in Node.js via C++ N-API or WASM without calling external Python servers.
  * Runs:
    1. `retinaface.onnx`: 5-point facial landmark detection.
    2. `arcface.onnx`: Feature embedding extraction (512-d vector) and cosine distance calculation.
    3. `det_model.onnx` & `rec_model.onnx`: PaddleOCR text detection and recognition.

### 20. Tesseract.js
* **Package:** `tesseract.js` (`^7.0.0`)
* **Where Used:**
  * Backend API: [`backend/api/src/integrations/ocr/aadhaar-ocr.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/ocr/aadhaar-ocr.service.ts)
* **Why Used:**
  * WebAssembly port of Google's Tesseract OCR engine. Extracts text from Indian Aadhaar cards (Aadhaar UID, Date of Birth, Full Name).

### 21. Google MediaPipe (`@mediapipe/tasks-vision`)
* **Package:** `@mediapipe/tasks-vision` (`^0.10.35`)
* **Where Used:**
  * Candidate Web: [`frontend/candidate-web/src/proctoring/`](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/proctoring/) (`pose-detection.service.ts`, `object-detection.service.ts`)
* **Why Used:**
  * Real-time client-side computer vision in the candidate's browser:
    1. Pose estimation model (`pose_landmarker_full.task` via Google Cloud Storage).
    2. Object detection model (`efficientdet_lite0.tflite`) for detecting unauthorized devices (cell phones, secondary screens).

### 22. Sharp
* **Package:** `sharp` (`^0.35.3`)
* **Where Used:**
  * Backend API: [`backend/api/src/integrations/ocr/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/ocr/), [`backend/api/src/integrations/face-verify-onnx/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/face-verify-onnx/)
* **Why Used:**
  * High-speed `libvips` image processing for cropping, auto-orienting EXIF rotation, grayscale conversion, sharpening, and affine landmark alignment.

### 23. ClipperLib (`clipper-lib`)
* **Package:** `clipper-lib` (`^6.4.2`)
* **Where Used:**
  * Backend API: [`backend/api/src/integrations/ocr/id-ocr.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/ocr/id-ocr.service.ts)
* **Why Used:**
  * Polygon clipping and geometric polygon expansion (`unclipPolygon`) for text detection bounding boxes in PaddleOCR.

---

## 5. In-Browser Engines, Editors & Sandboxes

### 24. Microsoft Monaco Editor
* **Packages:** `@monaco-editor/react` (`^4.7.0`), `monaco-editor` (`^0.53.0` / `^0.55.1`)
* **Where Used:**
  * Candidate Web: [`frontend/candidate-web/src/modules/coding/`](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/coding/), [`frontend/candidate-web/src/modules/sql/`](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/sql/)
  * Admin Web: [`frontend/admin-web/src/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/package.json#L53)
  * Design Tokens: [`packages/design-tokens/src/monacoTheme.ts`](file:///d:/Projects/cd-recruit/codebase/packages/design-tokens/src/monacoTheme.ts)
* **Why Used:**
  * Microsoft VS Code core in-browser code editor. Provides full code editing experience: syntax highlighting, indentation, error markers, line numbers, and custom editor themes.

### 25. sql.js
* **Package:** `sql.js` (`^1.14.1`, `@types/sql.js` `^1.4.11`)
* **Where Used:**
  * Candidate Web: [`frontend/candidate-web/src/modules/sql/SQLModule.tsx`](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/sql/SQLModule.tsx#L23)
  * Loaded from: `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/`
* **Why Used:**
  * SQLite compiled to WebAssembly. Executes candidate SQL queries immediately inside the browser for zero-latency feedback on schema exploration and validation.

### 26. QA Automation Sandboxes (Selenium & Playwright)
* **Where Used:**
  * Backend API: [`backend/api/src/execution/qa-automation-sandbox.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/execution/qa-automation-sandbox.service.ts)
  * Docker templates: [`codebase/docker/qa-sandbox/`](file:///d:/Projects/cd-recruit/codebase/docker/qa-sandbox/) (`selenium-python`, `selenium-java`, `playwright-js`)
* **Why Used:**
  * Wraps candidate QA test automation scripts, running Selenium or Playwright tests against an internal mock HTTP test target (`http://127.0.0.1:9099`).

---

## 6. Backend Monolith Libraries (NestJS & Node.js)

### 27. NestJS Core & Extension Suite
* **Packages:**
  * `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` (`11.2.1`)
  * `@nestjs/config` (`^4.0.4`)
  * `@nestjs/throttler` (`^6.4.0`)
  * `@nestjs/bullmq` (`^11.0.4`)
  * `@nestjs/jwt` (`^10.2.0`), `@nestjs/passport` (`^10.0.3`)
  * `@nestjs/swagger` (`^11.4.5`), `swagger-ui-express` (`^5.0.1`)
  * `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`
* **Where Used:**
  * [`codebase/backend/api/package.json`](file:///d:/Projects/cd-recruit/codebase/backend/api/package.json)
* **Why Used:**
  * Architecture backbone of the API monolith: handles module separation, dependency injection, rate limiting, configuration validation, auth guards, and Swagger OpenAPI generation.

### 28. Prisma ORM
* **Packages:** `@prisma/client` (`^5.22.0`), `prisma` (`^5.22.0`)
* **Where Used:**
  * [`backend/prisma/schema.prisma`](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma)
  * [`backend/api/src/prisma/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/prisma/)
* **Why Used:**
  * Type-safe ORM, auto-generated TypeScript database client, migration runner, and Prisma Studio browser data browser.

### 29. BullMQ & ioredis
* **Packages:** `bullmq` (`^5.34.6`), `ioredis` (`^5.4.2`)
* **Where Used:**
  * [`backend/api/src/queue/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/queue/), [`backend/api/src/common/redis/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/common/redis/)
* **Why Used:**
  * Redis-backed distributed queue manager for scheduling background jobs, candidate disconnect grace timers, and proctoring telemetry tasks.

### 30. pg (node-postgres)
* **Packages:** `pg` (`^8.22.0`), `@types/pg` (`^8.20.4`)
* **Where Used:**
  * [`backend/api/src/sql/sql.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql.service.ts)
* **Why Used:**
  * Direct PostgreSQL client connection pool to execute candidate SQL queries against the isolated sandbox database.

### 31. Official MongoDB Driver
* **Packages:** `mongodb` (`^7.5.0`), `bson` (`^7.3.2`)
* **Where Used:**
  * [`backend/api/src/modules/nosql/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/modules/nosql/)
* **Why Used:**
  * Connects to the MongoDB container, executes candidate aggregation queries, and manages ephemeral collections.

### 32. MinIO Node SDK
* **Package:** `minio` (`^8.0.1`)
* **Where Used:**
  * [`backend/api/src/integrations/minio/minio.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/minio/minio.service.ts)
* **Why Used:**
  * S3 API client managing bucket lifecycle, file streams, and generating presigned upload/download URLs.

### 33. Passport & jsonwebtoken
* **Packages:** `passport` (`^0.7.0`), `passport-jwt` (`^4.0.1`), `jsonwebtoken` (`^9.0.2`)
* **Where Used:**
  * [`backend/api/src/auth/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/auth/)
* **Why Used:**
  * In-house staff JWT issuance and verification, bearer token extraction, and candidate assessment invite tokens.

### 34. Class Validator & Class Transformer
* **Packages:** `class-validator` (`^0.14.1`), `class-transformer` (`^0.5.1`)
* **Where Used:**
  * Throughout backend DTOs (`backend/api/src/**/dto/*.ts`)
* **Why Used:**
  * Declarative validation rules (`@IsString()`, `@IsEmail()`, `@IsUUID()`) on incoming REST API request payloads.

### 35. Opossum
* **Packages:** `opossum` (`^8.5.0`), `@types/opossum` (`^8.1.9`)
* **Where Used:**
  * [`backend/api/src/integrations/judge0/judge0.client.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.client.ts#L5)
* **Why Used:**
  * Circuit breaker protecting the API from cascading delays if downstream Judge0 or biometric services degrade.

### 36. Fuzzball
* **Package:** `fuzzball` (`^2.2.6`)
* **Where Used:**
  * [`backend/api/src/integrations/ai/ai-evaluation.service.ts`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/ai/ai-evaluation.service.ts)
* **Why Used:**
  * Fuzzy string matching algorithms (Levenshtein distance, token sort ratio) for grading text answers with semantic tolerance.

### 37. Bull Board
* **Packages:** `@bull-board/api` (`^8.3.2`), `@bull-board/express` (`^8.3.2`)
* **Where Used:**
  * [`backend/api/package.json`](file:///d:/Projects/cd-recruit/codebase/backend/api/package.json#L24-L25)
* **Why Used:**
  * Interactive operations UI for inspecting BullMQ queues, active jobs, and dead-letter queues.

---

## 7. Frontend Libraries (Candidate Web & Admin Web)

### 38. React 19 Core
* **Packages:** `react` (`^19.2.0`), `react-dom` (`^19.2.0`)
* **Where Used:**
  * [`frontend/candidate-web/`](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/), [`frontend/admin-web/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/)
* **Why Used:**
  * Core UI component rendering library.

### 39. Zustand
* **Package:** `zustand` (`^5.0.14`)
* **Where Used:**
  * Candidate Web: [`frontend/candidate-web/src/store/sessionMachine.ts`](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/store/sessionMachine.ts)
  * Admin Web: [`frontend/admin-web/src/store/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/package.json#L71)
* **Why Used:**
  * Lightweight, fast state manager. Drives the candidate assessment finite state machine (11 states from invite validation to thank you screen) with local storage sync.

### 40. TanStack Ecosystem
* **Packages:**
  * `@tanstack/react-router` (`^1.170.16`) & `@tanstack/router-plugin` (`^1.168.18`)
  * `@tanstack/react-start` (`^1.168.26`)
  * `@tanstack/react-query` (`^5.101.1`)
* **Where Used:**
  * [`frontend/admin-web/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/package.json#L46-L49)
* **Why Used:**
  * **React Router / React Start:** 100% type-safe file-based routing and SSR application framework for the Admin dashboard.
  * **React Query:** Server state synchronization, automated caching, deduplication, and background refetching.

### 41. React Router DOM
* **Package:** `react-router-dom` (`^6.28.0`)
* **Where Used:**
  * [`frontend/candidate-web/src/`](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/package.json#L28)
* **Why Used:**
  * Single-page routing for Candidate Web.

### 42. Axios
* **Package:** `axios` (`^1.7.9`)
* **Where Used:**
  * [`frontend/candidate-web/src/api/client.ts`](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/api/client.ts)
* **Why Used:**
  * Promise-based HTTP client managing base URLs, headers, and request interceptors for token propagation.

### 43. Radix UI Primitives
* **Packages:** 24+ packages under `@radix-ui/react-*` (Accordion, Alert Dialog, Aspect Ratio, Avatar, Checkbox, Collapsible, Context Menu, Dialog, Dropdown Menu, Hover Card, Label, Menubar, Navigation Menu, Popover, Progress, Radio Group, Scroll Area, Select, Separator, Slider, Slot, Switch, Tabs, Toggle, Toggle Group, Tooltip)
* **Where Used:**
  * [`frontend/admin-web/src/components/ui/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/package.json#L19-L44)
* **Why Used:**
  * Headless accessible UI component primitives conforming to WAI-ARIA standards.

### 44. Tailwind CSS v4 & Styling Utilities
* **Packages:** `tailwindcss` (`^4.2.1`), `@tailwindcss/vite` (`^4.2.1`), `tailwind-merge` (`^3.5.0`), `clsx` (`^2.1.1`), `class-variance-authority` (`^0.7.1`), `tw-animate-css` (`^1.3.4`)
* **Where Used:**
  * [`frontend/candidate-web/`](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/), [`frontend/admin-web/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/)
* **Why Used:**
  * Utility-first styling engine, conflict-free class merging, and component variant styling.

### 45. React Hook Form & Zod
* **Packages:** `react-hook-form` (`^7.71.2`), `@hookform/resolvers` (`^5.2.2`), `zod` (`^3.24.2`)
* **Where Used:**
  * [`frontend/admin-web/src/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/package.json#L61)
* **Why Used:**
  * High-performance uncontrolled form state management with strict schema validation.

### 46. Framer Motion
* **Package:** `framer-motion` (`^12.43.0`)
* **Where Used:**
  * [`frontend/candidate-web/src/`](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/package.json#L24)
* **Why Used:**
  * Declarative animations, smooth layout transitions, and interactive micro-animations.

### 47. Lucide React
* **Package:** `lucide-react` (`^0.575.0`)
* **Where Used:**
  * Both frontends
* **Why Used:**
  * Consistent, lightweight SVG icon system.

### 48. Recharts
* **Package:** `recharts` (`^2.15.4`)
* **Where Used:**
  * [`frontend/admin-web/src/routes/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/package.json#L63)
* **Why Used:**
  * Composable SVG data visualization for candidate percentile scores, drive completion charts, and module benchmarks.

### 49. Sonner, CMDK, Vaul
* **Packages:** `sonner` (`^2.0.7`), `cmdk` (`^1.1.1`), `vaul` (`^1.1.2`)
* **Where Used:**
  * [`frontend/admin-web/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/package.json)
* **Why Used:**
  * **Sonner:** Toast notification manager.
  * **CMDK:** Fast keyboard command palette (`Cmd+K`).
  * **Vaul:** Swipeable modal drawer.

### 50. Embla Carousel & Resizable Panels
* **Packages:** `embla-carousel-react` (`^8.6.0`), `react-resizable-panels` (`^4.6.5`)
* **Where Used:**
  * [`frontend/admin-web/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/package.json)
* **Why Used:**
  * **Embla Carousel:** Carousel viewer for proctoring photo snapshots.
  * **Resizable Panels:** Resizable split-pane layout for code review and test inspection.

### 51. Date Picker & OTP Components
* **Packages:** `react-day-picker` (`^9.14.0`), `date-fns` (`^4.1.0`), `input-otp` (`^1.4.2`)
* **Where Used:**
  * [`frontend/admin-web/`](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/package.json)
* **Why Used:**
  * Calendar date selection for drive scheduling and formatted OTP code inputs.

---

## 8. Development, Testing & Build Tooling

### 52. Vite & Plugins
* **Packages:** `vite` (`^6.0.3` / `^8.0.16`), `@vitejs/plugin-react`, `vite-tsconfig-paths`
* **Where Used:**
  * Frontend workspaces
* **Why Used:**
  * Fast HMR development server and optimized Rollup production bundler.

### 53. TypeScript & Execution Tooling
* **Packages:** `typescript` (`^5.8.3`), `tsx` (`^4.23.1`), `ts-node` (`^10.9.2`)
* **Where Used:**
  * Across all monorepo packages and seed scripts
* **Why Used:**
  * Static type checking and direct execution of TypeScript scripts without manual build steps.

### 54. Jest & ts-jest
* **Packages:** `jest` (`^30.4.2`), `ts-jest` (`^29.4.12`), `@types/jest`
* **Where Used:**
  * [`backend/api/`](file:///d:/Projects/cd-recruit/codebase/backend/api/package.json#L71)
* **Why Used:**
  * Unit and integration test runner for backend services.

### 55. Supertest
* **Package:** `supertest` (`^6.3.4`)
* **Where Used:**
  * Root devDependencies
* **Why Used:**
  * End-to-end HTTP request testing against NestJS controllers.

### 56. Grafana k6
* **Tool:** `k6` CLI
* **Where Used:**
  * [`codebase/k6/scripts/`](file:///d:/Projects/cd-recruit/codebase/k6/scripts/) (`judge0_load_test.js`, `invite_load_test.js`)
* **Why Used:**
  * High-concurrency load testing simulating hundreds of concurrent candidate submissions and Judge0 execution runs.

### 57. ESLint & Prettier
* **Packages:** `eslint` (`^9.32.0` / `^10.7.0`), `prettier` (`^3.7.3` / `^3.9.5`), `lint-staged` (`^15.5.2`)
* **Where Used:**
  * Root monorepo and packages
* **Why Used:**
  * Code linting, formatting enforcement, and pre-commit Git hooks.

### 58. esbuild
* **Package:** `esbuild` (`^0.28.1`)
* **Where Used:**
  * Root monorepo
* **Why Used:**
  * Fast JavaScript/TypeScript compilation and bundling for shared packages.

---

## 9. External B2B Integrations

### 59. External ATS Partner Systems
* **Type:** External REST & Webhook B2B Integrations
* **Where Used:**
  * [`backend/api/src/partner/`](file:///d:/Projects/cd-recruit/codebase/backend/api/src/partner/) (`partner-admin.controller.ts`, `partner-candidates.controller.ts`, `partner-requisitions.controller.ts`)
* **Why Used:**
  * Allows external enterprise ATS systems (e.g. Lever, Greenhouse) to:
    1. Authenticate via cryptographic API keys (`X-API-Key: pk_live_...`).
    2. Bulk ingest up to 1,000 candidates in batches.
    3. Poll real-time candidate session, scoring, and proctoring status.
    4. Receive automated webhook event notifications upon drive completion.
