# CD-Recruit — Final MVP Data Model (ER Diagram)

Reflects `schema.prisma` after fixes/additions to the original doc's Section 4 model.

Changes vs. the original doc's diagram:
- Added `CLIENT` — scopes `ROLE_TEMPLATE` per client (CBE, or a future client)
- Added `CONSENT_RECORD` — linked to `CANDIDATE`, for the legal/consent track
- Added `REVIEWER` — was missing entirely; `REVIEWER_DECISION.reviewer_id` had no table to point at
- `SESSION` gained: `baseline_selfie_ref`, `status` (now 9 defined states incl. `abandoned`), `last_activity_at`

Everything else — the original 10 tables and their relationships — is unchanged.

```mermaid
erDiagram
    CLIENT ||--o{ ROLE_TEMPLATE : offers
    ROLE_TEMPLATE ||--o{ QUESTION : includes
    ROLE_TEMPLATE ||--o{ SESSION : used_by
    CANDIDATE ||--o{ SESSION : takes
    CANDIDATE ||--o{ CONSENT_RECORD : gives
    SESSION ||--|{ MODULE_RESPONSE : contains
    SESSION ||--o{ EVENT_LOG : generates
    SESSION ||--o{ INTEGRITY_FLAG : may_have
    SESSION ||--|| SCORE : produces
    SESSION ||--o| REVIEWER_DECISION : receives
    INTEGRITY_FLAG ||--o| EVIDENCE_CLIP : references
    MODULE_RESPONSE }o--|| QUESTION : answers
    REVIEWER_DECISION }o--|| REVIEWER : made_by

    CLIENT {
        uuid id PK
        string name
        timestamp created_at
    }
    ROLE_TEMPLATE {
        uuid id PK
        uuid client_id FK
        string role_name
        jsonb weighting_preset
    }
    QUESTION {
        uuid id PK
        uuid role_template_id FK
        string module_type
        jsonb content
    }
    CANDIDATE {
        uuid id PK
        string email
        string name
        timestamp created_at
    }
    CONSENT_RECORD {
        uuid id PK
        uuid candidate_id FK
        string version
        timestamp consented_at
        string ip_address
    }
    SESSION {
        uuid id PK
        uuid candidate_id FK
        uuid role_template_id FK
        string cv_mode "full | reduced"
        string status "9 states, incl. abandoned"
        string baseline_selfie_ref
        timestamp started_at
        timestamp submitted_at
        timestamp last_activity_at
    }
    MODULE_RESPONSE {
        uuid id PK
        uuid session_id FK
        uuid question_id FK
        jsonb response_payload
        int time_spent_seconds
    }
    EVENT_LOG {
        uuid id PK
        uuid session_id FK
        string event_type
        jsonb payload
        timestamp occurred_at
    }
    INTEGRITY_FLAG {
        uuid id PK
        uuid session_id FK
        string category
        float confidence
        string severity
        timestamp flagged_at
    }
    EVIDENCE_CLIP {
        uuid id PK
        uuid flag_id FK
        string storage_ref
        timestamp expires_at
    }
    SCORE {
        uuid id PK
        uuid session_id FK
        float composite_score
        jsonb module_scores
        float say_do_consistency_score
        float ai_confidence
        boolean human_reviewed
    }
    REVIEWER {
        uuid id PK
        string email
        string name
        timestamp created_at
    }
    REVIEWER_DECISION {
        uuid id PK
        uuid session_id FK
        uuid reviewer_id FK
        string decision "advance | reject"
        timestamp decided_at
    }
```
