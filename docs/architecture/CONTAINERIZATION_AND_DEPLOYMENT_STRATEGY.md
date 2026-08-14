# Proctora — Containerization & Deployment Strategy
**Document Version:** 1.0.0  
**Status:** Canonical Architectural Justification & Sizing Blueprint  
**Scope:** Phase 1 (Unified Monolith Container) ➔ Phase 2 (Hybrid AWS Staging) ➔ Phase 3 (Enterprise Cloud-Native)

---

## 1. Executive Strategy & Architectural Roadmap

This document serves as the high-level justification for containerizing and deploying the **CD-Recruit (Proctora)** hiring and assessment platform.

To balance rapid deployment and cost-efficiency with long-term scalability, the deployment roadmap is structured into three progressive phases:

* **Phase 1: Unified Monolith Container**:
  * **What:** Spins up a single application container hosting Admin Web, Candidate Web, and NestJS API, sitting alongside 6 infrastructure helper containers.
  * **Why:** Minimizes AWS cost and resource footprint. Avoids premature cloud scaling. Highly portable for stakeholder review and early demonstrations on a single VM/EC2 instance.
* **Phase 2: Hybrid AWS Staging**:
  * **What:** Migrates database, caching, and storage layers to AWS managed services (Amazon RDS, ElastiCache, S3) while maintaining the monolith app container.
  * **Why:** Unlocks automated backups, horizontal session queues, and secure biometric storage without altering application code or separating frontend and backend hosting.
* **Phase 3: Enterprise Cloud-Native Production**:
  * **What:** Fully decouples frontends to Amazon S3 + CloudFront CDN. API and authentication services scale independently on AWS ECS Fargate, while code compilation workers run on ECS EC2.
  * **Why:** Maximum high-availability, infinite scalability for global campus drives, and isolated security boundaries for sandboxed code execution.

---

## 2. Phase 1: Deep Dive into the Unified Monolith Container

### 2.1 Monolith Routing & Candidate Portal Journeys
The single application container (named `proctora-app` or `proctora:v1`) encapsulates the client-side single-page applications (SPAs) and backend API. Traffic enters the container on a single port (Port 80/443) and is routed based on pathing.

#### Path and Route Mapping Justification:
* **`/` (Root Path) $\rightarrow$ Candidate Web Landing Screen**:
  * **What:** Serves the static assets for the Candidate Assessment Shell.
  * **Why:** Provides candidates with the initial consent forms, system readiness checks, and instructions.
* **`/invite/:token` or `/start/:token` $\rightarrow$ Candidate Assessment Resolver**:
  * **What:** Resolves candidate invite tokens against PostgreSQL database.
  * **Why:** Automatically routes authenticated candidates to the active assessment console (MCQ, Coding, SQL, Simulation) and locks the browser window environment.
* **`/admin` & `/admin/*` $\rightarrow$ Admin Dashboard SPA**:
  * **What:** Serves the Recruiter/Admin React application.
  * **Why:** Allows recruiters to create assessments, view reports, generate invite links, and review webcam evidence.
* **`/api/v1/*` $\rightarrow$ NestJS REST API**:
  * **What:** Routes all JSON payloads and REST transactions to the local backend port.
  * **Why:** Consolidates all database, storage, and external API requests under a single domain context, eliminating CORS issues for Phase 1.
* **`/socket.io/*` & WebSocket Paths $\rightarrow$ Real-Time Synchronizer**:
  * **What:** Facilitates real-time bidirectional communication.
  * **Why:** Powers live heartbeat monitoring, disconnect-recovery triggers, and real-time proctoring alerts.

---

### 2.2 Why We Use Nginx inside the Monolith Container
Nginx is utilized as the container's gateway proxy for three primary reasons:
1. **Single Entry Point**: Consolidates multiple internal endpoints (NestJS on port 3001, static SPAs on disk) into a standard port 80/443.
2. **Proctoring WASM Security Isolation**: Camera proctoring (MediaPipe Face Mesh) and SQL sandbox execution (`sql.js` WASM) require Cross-Origin Isolation in modern browsers. Nginx acts as the injector for required HTTP security headers (`Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy`) which are necessary to enable high-resolution CPU timers and `SharedArrayBuffer`.
3. **MIME-Type Alignment**: Configures proper `application/wasm` serving configurations for browser execution of compiled files.

---

### 2.3 Why We Use Supervisord for Process Supervision
A Docker container is designed to run only one primary foreground process. To bundle Nginx and Node.js (NestJS) inside a single container without writing fragile shell-loops, `supervisord` is utilized:
* **Process Watchdog**: Monitors NestJS and Nginx, automatically restarting either process if a memory leak or crash occurs.
* **POSIX Signal Handler**: Traps termination signals (`SIGTERM`, `SIGINT`) from Docker or the host VM, ensuring both Nginx connections drain and NestJS cleans up active database queries before shutting down.
* **Unified Log Aggregator**: Combines logs from both child processes and channels them into standard output so the VM host can collect all logs seamlessly.

---

### 2.4 Monorepo Build and Compilation Justification
The application is structured as an `npm` monorepo workspace. During container creation, the compilation must occur sequentially:
1. **Shared Types (`packages/shared-types`)**: Built first to output shared DTO schemas and type definitions.
2. **Frontends (Candidate Web & Admin Web)**: Compiled next, consuming the shared types output and embedding the target `/api/v1` base URL.
3. **Backend API**: Compiled last, generating the Prisma Client targeted for the container runtime.
4. **Pruning**: Dev-dependencies are pruned out to keep the final image size minimal and secure.

---

## 3. Status & Behavior of Companion Infrastructure Containers

Deploying the Phase 1 monolith application container involves a **7-container topology** in total. The system is split into **6 dependency/infrastructure containers** and **1 dependent application container**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DOCKER NETWORK: cdrecruit-net                      │
│                                                                             │
│  ┌─────────────────────────┐           ┌─────────────────────────────────┐  │
│  │   cdrecruit_app (v1)    │           │    cdrecruit_postgres_dev       │  │
│  │  (Nginx + NestJS + SPAs)│ ────────> │      (PostgreSQL 16-alpine)     │  │
│  │    [App Container 1]    │           │      [Infra Container 1]        │  │
│  └────────────┬────────────┘           └─────────────────────────────────┘  │
│               │                                                             │
│               ├──────────────────────> ┌─────────────────────────────────┐  │
│               │                        │      cdrecruit_redis_dev        │  │
│               │                        │        (Redis 7-alpine)         │  │
│               │                        │      [Infra Container 2]        │  │
│               │                        └─────────────────────────────────┘  │
│               │                                                             │
│               ├──────────────────────> ┌─────────────────────────────────┐  │
│               │                        │      cdrecruit_minio_dev        │  │
│               │                        │    (MinIO Object Storage)       │  │
│               │                        │      [Infra Container 3]        │  │
│               │                        └─────────────────────────────────┘  │
│               │                                                             │
│               ├──────────────────────> ┌─────────────────────────────────┐  │
│               │                        │     cdrecruit_keycloak_dev      │  │
│               │                        │     (Keycloak 24.0 OIDC)        │  │
│               │                        │      [Infra Container 4]        │  │
│               │                        └─────────────────────────────────┘  │
│               │                                                             │
│               ├──────────────────────> ┌─────────────────────────────────┐  │
│               │                        │     cdrecruit_judge0_server     │  │
│               │                        │   (Judge0 CE Code Execution)    │  │
│               │                        │      [Infra Container 5]        │  │
│               │                        └─────────────────────────────────┘  │
│               │                                                             │
│               └──────────────────────> ┌─────────────────────────────────┐  │
│                                        │     cdrecruit_judge0_worker     │  │
│                                        │     (Sandboxed Execution Unit)  │  │
│                                        │      [Infra Container 6]        │  │
│                                        └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Role of Infrastructure Companion Containers

1. **`postgres` (PostgreSQL 16)**: Holds candidate data, invite mappings, and test responses. Must boot first. The App container checks database readiness and executes schema migrations prior to launching HTTP listeners.
2. **`redis` (Redis 7)**: Acts as the storage layer for BullMQ background queues. Handles critical assessment features like tracking candidate disconnect windows and auto-submitting stagnant sessions.
3. **`minio` (MinIO Object Storage)**: Handles video/audio proctoring clips. The App container verifies connectivity to MinIO on boot and automatically generates the general and biometric storage buckets.
4. **`keycloak` (Keycloak 24)**: Handles OIDC client credentials and roles for recruiter dashboard access. Configured to automatically import active realm profiles on initialization.
5. **`judge0-server`**: Receives candidate code compilation and run requests, coordinating sandbox executions.
6. **`judge0-worker`**: The execution unit that consumes compilation jobs from Redis, executes the candidate code inside secure cgroups, and persists results to the Judge0 database.

---

## 4. EC2 Capacity Planning & Sizing for Candidate Throughput

### 4.1 Target Capacity: 2–3 Parallel Test Candidates
To sustain at least **2–3 parallel active test candidates** in a single-node Phase 1 deployment, the host server must accommodate both base service overhead and dynamic CPU/RAM spikes from evaluations.

#### Resource Allocation Breakdown:
* **Fixed Infrastructure Footprint (Idle Overhead)**:
  * PostgreSQL: ~1 GB RAM.
  * Redis: ~256 MB RAM.
  * Keycloak (Java Virtual Machine): ~1.5 GB RAM.
  * MinIO: ~256 MB RAM.
  * Judge0 (Server + Worker baseline): ~1 GB RAM.
  * Proctora App Container: ~1 GB RAM.
  * *Total Fixed Base:* **~5 GB RAM / 0.5 vCPU**
* **Dynamic Candidate Load (Under Evaluation)**:
  * **Webcam/Biometric Proctoring**: MediaPipe processing runs entirely **on the candidate's browser (client-side CPU)**. The backend only handles streaming file upload chunks (video clips) which consumes minimal memory buffer space (~100-200 MB per candidate).
  * **AI Simulation / LLM Call Evaluation**: Backend API acts as a proxy to Anthropic/Groq, meaning there is zero local CPU/RAM scoring overhead during AI grading.
  * **Code Execution (Judge0)**: Spawning sandboxed environments (compiling Java/C++ or running Python) creates short-duration CPU and RAM spikes (up to 512 MB and 1 full CPU core per sandbox execution).

---

### 4.2 Recommended EC2 Instance Type
Based on the resource footprint above, we sizing the host server accordingly:

* **Entry-Level Instance (Minimum for 2-3 Candidates)**:
  * **AWS Instance Type:** `t3a.large` (2 vCPUs, 8 GB RAM) or `t4g.large` (ARM64, 2 vCPUs, 8 GB RAM).
  * **Justification:** Provides the 5 GB baseline for background containers plus a 3 GB buffer to handle parallel code executions and file uploads.
* **Recommended Production-Parity Sandbox VM**:
  * **AWS Instance Type:** `t3.xlarge` (4 vCPUs, 16 GB RAM) or `c6g.xlarge` (4 vCPUs, 8 GB RAM).
  * **Justification:** Prevents CPU throttling during simultaneous coding submissions and offers faster database response times.
* **Storage Allocation**:
  * **Type:** 60 GB GP3 EBS SSD volume.
  * **Justification:** Accommodates temporary database write-ahead logs, container images, and local biometric artifacts.

---

## 5. Phase 1 to Phase 3 Cloud Evolution Matrix

| Feature / Service | Phase 1 Monolith | Phase 3 Target Cloud-Native | Justification for Evolution |
|---|---|---|---|
| **Web Assets Serving** | Served via internal Nginx inside container. | Deployed to **Amazon S3** and distributed by **Amazon CloudFront**. | Offloads asset traffic from servers. Lowers server CPU, speeds up global load times, and guarantees zero static file downtime. |
| **Object Storage** | Local MinIO container with EBS mount. | **Amazon S3** with KMS Encryption and Glacier Lifecycles. | S3 eliminates physical drive limitations, secures biometric privacy, and reduces cost by archiving old clips to cold storage. |
| **Database Tier** | Containerized PostgreSQL. | **Amazon RDS PostgreSQL** (or Aurora Serverless v2). | Moves maintenance overhead (auto-backups, multi-AZ replication, patching) to AWS. |
| **Sandbox Execution** | Judge0 container on EC2. | **AWS ECS on EC2 Auto-Scaling Groups** with gVisor. | Sandboxes require privileged security policies. Running them on EC2 instances is mandatory, while ECS manages scaling. |
