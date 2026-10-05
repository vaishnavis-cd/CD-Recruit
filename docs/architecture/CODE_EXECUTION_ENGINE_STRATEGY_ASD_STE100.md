# Technical Strategy and Legal Analysis: Sandboxed Code Execution Engine

Document Identifier: `DOC-ARCH-EXEC-2026-001`  
Document Standard: **ASD-STE100** (Simplified Technical English)  
Classification: Proprietary / Strategic Architectural Decision Record  
Status: Approved Architectural Evaluation  

---

## 1. Purpose and Scope

This document provides a technical evaluation of the code execution engine for the Proctora platform.
The document analyzes the current use of Judge0 Community Edition.
It examines the legal risks of the GNU General Public License version 3 (GPL-3.0).
It evaluates whether code execution is core intellectual property.
It also reviews the technical findings from `canivibecodeit.com`.
Finally, this document presents four architecture options and a strategic recommendation.

---

## 2. Current State of Usage

### 2.1 System Architecture and Integration

The Proctora platform uses Judge0 Community Edition (version 1.13.1) to run untrusted candidate code.
The integration consists of four main parts:

1. **Client Adapter (`Judge0Client`)**:
   The client sends HTTP requests to the Judge0 REST API.
   It uses an Opossum circuit breaker to detect service faults.
   It submits batches of test cases to `POST /submissions/batch`.
   It queries batch results from `GET /submissions/batch`.

2. **Domain Service (`Judge0Service`)**:
   The service maps language names to internal identifiers.
   It maps Judge0 status numbers to platform execution statuses.
   The service compares candidate standard output with expected output.
   The service records queue latency and run duration.

3. **Background Worker (`OutboundExecutionProcessor`)**:
   The worker uses BullMQ and Redis queues.
   It processes finished test cases.
   It calculates final scores for candidate submissions.
   It writes results to Redis cache and sends Server-Sent Events.

4. **Container Infrastructure (`docker-compose.yml`)**:
   The platform runs two Judge0 containers: `judge0-server` and `judge0-worker`.
   These containers connect to dedicated PostgreSQL and Redis instances.

### 2.2 Supported Programming Languages

The platform restricts code execution to six languages:
- Python (Python 3)
- JavaScript (Node.js)
- TypeScript (Node.js)
- Java (OpenJDK)
- C++ (GCC)
- Go (Golang)

The platform does not use the remaining 60 languages that Judge0 provides.

### 2.3 Existing Operational Constraints

The current Docker configuration runs Judge0 with:
- `privileged: true`
- `security_opt: seccomp:unconfined`

Judge0 requires root privileges to mount Linux control groups (cgroups).
This configuration introduces container breakout risks on production host machines.

---

## 3. Legal and Intellectual Property Analysis

### 3.1 The GPL-3.0 License Conditions

Judge0 Community Edition uses the GNU General Public License version 3.0 (GPL-3.0).
The GPL-3.0 copyleft condition requires full source code disclosure when an organization conveys (distributes) the software.

### 3.2 Evaluation of Software as a Service (SaaS)

In a cloud SaaS deployment:
- Proctora runs on company-owned cloud infrastructure.
- Candidates and recruiters interact with the software through a web browser.
- The company does not convey or distribute executable binaries to users.

Under Section 9 of GPL-3.0, network interaction does not constitute conveyance.
Only the Affero General Public License (AGPL) closes this network boundary.
Judge0 does not use the AGPL license.
Furthermore, Proctora communicates with Judge0 over a network socket using JSON payloads.
This network boundary establishes separate programs under copyright law.

**Finding**:
In a cloud SaaS model, Judge0 does not infect Proctora with GPL-3.0 obligations.
The proprietary source code of Proctora remains protected.

### 3.3 Evaluation of On-Premise Enterprise Distribution

In an on-premise deployment:
- The company packages Proctora in container images or virtual machines.
- The company delivers these packages to enterprise customers (such as banks or universities).
- This delivery constitutes software distribution under GPL-3.0.

When the company distributes Judge0 to customers:
- The company must supply the complete source code of Judge0.
- Enterprise legal departments routinely reject software bundles that contain GPL-3.0 components.
- Automated compliance scanners will flag Judge0 and stop commercial contracts.

**Finding**:
Judge0 GPL-3.0 licensing creates high commercial risk for on-premise enterprise distribution.

---

## 4. Technical Analysis and Competitor Insights

### 4.1 Review of Findings from CanIVibeCodeIt

The analysis from `canivibecodeit.com` provides three critical insights:

1. **The Core Loop is Simple**:
   A basic runner accepts code and standard input.
   It runs the code in a container without network access.
   It applies CPU and memory limits.
   It returns output streams, exit codes, and durations.
   An engineer can build this basic mechanism quickly.

2. **The Defense Perimeter is Difficult**:
   Docker configuration flags do not provide a secure boundary against hostile code.
   Untrusted code can execute fork bombs, crypto miners, and memory exhaustion attacks.
   A production sandbox requires Linux control groups, secure computing modes (seccomp), and isolated namespaces.

3. **Precise Metrics are Difficult**:
   Grading algorithms requires accurate separation of CPU time from wall-clock time.
   Standard Docker statistics do not provide reproducible millisecond metrics under heavy load.

### 4.2 Is Code Execution the Core Value of Proctora?

The Chief Executive Officer expressed concern that code execution is outsourced.
We must distinguish between utility infrastructure and core value:

| Platform Component | Intellectual Property Category | Strategic Value |
| :--- | :--- | :--- |
| **Compiler Runner (Judge0)** | Commodity Execution Utility | Low differentiation. Competitors use similar runners. |
| **8 Assessment Engines** | Core Business Logic | High differentiation. Proprietary scoring models. |
| **AI Evaluation Engine** | Core Business Logic | High differentiation. Dual LLM rubric grading. |
| **Biometric Verification** | Proprietary Signal Pipeline | High differentiation. In-process ONNX embeddings. |
| **Anti-Cheat Telemetry** | Proprietary Security Pipeline | High differentiation. Behavioral audit streams. |
| **Enterprise Question Bank** | Proprietary Asset | High differentiation. Curated domain questions. |

**Insight**:
The compiler runner is not the primary commercial differentiator.
However, complete control over the execution sandbox is necessary for enterprise security and licensing freedom.

---

## 5. Risk Assessment

| Risk Category | Hazard Description | Severity | Probability | Impact on Business |
| :--- | :--- | :--- | :--- | :--- |
| **Legal / Licensing** | GPL-3.0 flags in enterprise client audits during on-premise sales. | High | High | Delays enterprise procurement and blocks contracts. |
| **Host Security** | Privileged container mode allows kernel escape from hostile candidate code. | High | Medium | Complete compromise of the production host server. |
| **Operational Cost** | High memory footprint for Judge0 PostgreSQL, Redis, and workers. | Medium | High | Increases cloud infrastructure expense. |
| **DIY Complexity** | In-house sandbox fails to stop fork bombs or memory leaks. | High | Medium | Service downtime during high-volume recruitment drives. |
| **Measurement Error** | Inaccurate CPU metrics cause incorrect test results for candidates. | High | Low | Candidate grading disputes and brand damage. |

---

## 6. Flexibility and Reliability Evaluation

### 6.1 Flexibility Comparison

- **Judge0 Community Edition**:
  Supports 60+ languages.
  However, modifying its internal Ruby and C code is difficult for our team.
  The container architecture is rigid.

- **Permissive Open-Source Engines (such as Piston)**:
  Uses the MIT License.
  Supports easy container deployment.
  Allows our team to add custom execution hooks and custom runtimes.

- **Proprietary In-House Engine**:
  Provides maximum flexibility.
  Our engineers can tailor the service specifically for our six core languages.
  Allows direct integration with our NestJS architecture.

### 6.2 Reliability Comparison

- **Judge0 Community Edition**:
  Proven reliability in global coding competitions.
  Uses Linux `isolate` sandboxing.
  Handles queue spikes when configured with adequate Redis workers.

- **Naive In-House Docker Runner**:
  Low reliability under load.
  Spawning full Docker containers for every test case causes high latency (1 to 2 seconds per test).
  Host system degrades when multiple candidates submit code simultaneously.

- **Hardened MicroVM Runner (gVisor or Firecracker)**:
  High reliability and defense-in-depth isolation.
  Prevents kernel exploits without requiring privileged Docker containers.

---

## 7. Practicality Evaluation (Build vs Buy vs Adopt)

We evaluate four possible solutions:

### Option 1: Maintain Status Quo (Judge0 CE)
- **Description**: Keep Judge0 CE in Docker. Isolate it behind the current API client.
- **Cost**: Zero engineering cost today.
- **Practicality**: High for cloud SaaS; zero practicality for on-premise sales.
- **Licensing**: GPL-3.0 risk remains for on-premise distribution.

### Option 2: Adopt Piston (MIT Permissive Sandbox)
- **Description**: Replace Judge0 with Piston (an open-source execution engine under the MIT License).
- **Cost**: Low (approximately 3 to 5 engineering days).
- **Practicality**: Very high. Piston supports our 6 languages and eliminates all GPL restrictions.
- **Licensing**: Permissive MIT license allows proprietary bundling and on-premise distribution.

### Option 3: Purchase Judge0 Commercial License
- **Description**: Purchase a commercial self-hosting license from the author of Judge0.
- **Cost**: Annual commercial licensing fee.
- **Practicality**: Medium. Removes legal risk but retains third-party dependency.
- **Licensing**: Commercial proprietary license with full vendor indemnification.

### Option 4: Build Proprietary Engine ("Proctora-Runner")
- **Description**: Build a dedicated execution microservice using Google gVisor (`runsc`) or Linux namespaces.
- **Cost**: Medium-high (3 to 4 weeks of engineering effort).
- **Practicality**: High long-term value. Gives 100% intellectual property ownership to the company.
- **Licensing**: 100% proprietary company property.

---

## 8. Strategic Decisions and Recommendations

### 8.1 Primary Decision

**We recommend a Two-Phase Hybrid Strategy**:

1. **Immediate Action (Phase 1 - Protection and Abstraction)**:
   - Do not make abrupt code rewrites immediately.
   - Abstract the execution boundary behind an internal interface: `CodeExecutionPort`.
   - Retain Judge0 CE for current cloud SaaS operations where GPL-3.0 does not trigger copyleft.
   - Restrict Judge0 network access in Docker Compose to internal container networks only.

2. **Milestone Action (Phase 2 - Intellectual Property Sovereignty)**:
   - Deploy **Piston (MIT)** or build **Proctora-Runner (gVisor-backed)** for the 6 core languages.
   - Switch the `CodeExecutionPort` implementation to the new sovereign engine.
   - Remove Judge0 entirely before releasing any on-premise enterprise installation.

### 8.2 Response to the Chief Executive Officer

The engineering team can present the following points to the Chief Executive Officer:

1. **Proprietary Safety**:
   Our cloud SaaS deployment does not violate GPL-3.0.
   Our proprietary code cannot be forced open-source through network API calls.

2. **Core Intellectual Property**:
   The execution sandbox is an infrastructure commodity.
   The true proprietary value of Proctora resides in:
   - The 8 assessment modules.
   - The AI evaluation models.
   - The facial verification system.
   - The anti-cheat telemetry pipeline.

3. **Path to Full Ownership**:
   We will encapsulate the execution runner behind an internal adapter.
   We will replace Judge0 with an MIT-licensed or proprietary gVisor engine.
   This transition will give the company complete ownership of the execution layer without risk.

---

## 9. Implementation Roadmap

### Step 1: Architectural Decoupling (Week 1)
- Define `CodeExecutionPort` interface in `codebase/backend/api/src/execution/`.
- Move `Judge0Service` behind this interface.
- Ensure zero breaking changes to existing assessment services.

### Step 2: Evaluation of Sovereign Runner (Week 2)
- Deploy Piston in a development environment.
- Test execution of the 6 core languages (Python, JS, TS, Java, C++, Go).
- Compare execution latency, memory measurement, and CPU accounting against Judge0.

### Step 3: Security Hardening (Week 3)
- Configure gVisor (`runsc`) runtime on container hosts.
- Validate security against fork bombs, infinite loops, and memory exhaustion.
- Verify that workers run without `privileged: true`.

### Step 4: Production Cutover and Decommissioning (Week 4)
- Update environment configuration to point to the new engine.
- Verify candidate test execution across all coding questions.
- Remove Judge0 containers, images, and database schemas from the repository.
