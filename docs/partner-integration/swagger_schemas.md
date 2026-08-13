# CD-Recruit Platform API

**Version**: 1.0

Interactive OpenAPI documentation for testing candidate, admin, simulation, and proctoring endpoints

---

## 🔐 Authentication

- **bearer**: Type `http` (bearer), Format `JWT`, In `header` (Enter Candidate / Staff JWT token)

---

## 📋 DTO Schemas & Data Models

This section documents all Data Transfer Objects (DTOs) used for API request bodies, responses, and parameters.

### `RecordDecisionDto`

**Required Fields**: `decision`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `decision` | `string` | ✅ Yes | Enums: [`ADVANCE`, `REJECT`] |
| `note` | `string` | ❌ No |  |

### `CreateInviteDto`

**Required Fields**: `candidateEmail`, `candidateName`, `roleTemplateId`, `driveId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `candidateEmail` | `string (email)` | ✅ Yes |  |
| `candidateName` | `string` | ✅ Yes |  |
| `roleTemplateId` | `string (uuid)` | ✅ Yes |  |
| `driveId` | `string (uuid)` | ✅ Yes |  |

### `ExtendExpiryDto`

**Required Fields**: `newExpiresAt`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `newExpiresAt` | `string` | ✅ Yes |  |

### `BulkInviteActionDto`

**Required Fields**: `inviteIds`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `inviteIds` | `array of `string`` | ✅ Yes |  |

### `StartSessionDto`

**Required Fields**: `inviteToken`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `inviteToken` | `string` | ✅ Yes |  |

### `HeartbeatDto`

**Required Fields**: `sessionId`, `tabId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string (uuid)` | ✅ Yes |  |
| `tabId` | `string` | ✅ Yes |  |

### `ResumeSessionDto`

**Required Fields**: `sessionId`, `tabId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string (uuid)` | ✅ Yes | sessionId is in the route param, but the contract also sends it in the body.
We accept it from the body to match the API contract exactly; the controller
validates both agree via the route param. |
| `tabId` | `string` | ✅ Yes |  |

### `RecordConsentDto`

**Required Fields**: `consentType`, `version`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `consentType` | `string` | ✅ Yes | Enums: [`TERMS`, `BIOMETRIC`, `SELFIE`, `AUDIO`] |
| `version` | `string` | ✅ Yes |  |
| `sessionId` | `string` | ❌ No |  |

### `UpdateStaffRoleDto`

**Required Fields**: `role`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `role` | `string` | ✅ Yes | Enums: [`RECRUITER`, `ADMIN`] |

### `UpdateScoringConfigDto`

**Required Fields**: `aiConfidenceThreshold`, `passRateThreshold`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `aiConfidenceThreshold` | `number` | ✅ Yes | Min: 0 Max: 1 |
| `passRateThreshold` | `number` | ✅ Yes | Min: 0 Max: 1 |
| `aiIntensity` | `string` | ❌ No |  |

### `UpdateRetentionConfigDto`

**Required Fields**: `biometricRetentionDays`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `biometricRetentionDays` | `number` | ✅ Yes | Min: 1 |

### `UpdateAppealWindowConfigDto`

**Required Fields**: `appealWindowDays`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `appealWindowDays` | `number` | ✅ Yes | Min: 1 |

### `DriveCandidateDto`

**Required Fields**: `name`, `candidateEmail`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `name` | `string` | ✅ Yes |  |
| `candidateEmail` | `string (email)` | ✅ Yes |  |

### `CreateDriveDto`

**Required Fields**: `name`, `roleTemplateId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `name` | `string` | ✅ Yes |  |
| `roleTemplateId` | `string` | ✅ Yes |  |
| `moduleConfig` | `object` | ❌ No |  |
| `status` | `string` | ❌ No | Enums: [`DRAFT`, `SCHEDULED`, `ACTIVE`, `CLOSED`] |
| `scheduleStart` | `string` | ❌ No |  |
| `scheduleEnd` | `string` | ❌ No |  |
| `questionIds` | `array of `string`` | ❌ No |  |
| `candidates` | `array of `DriveCandidateDto`` | ❌ No |  |

### `UpdateDriveDto`

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `name` | `string` | ❌ No |  |
| `roleTemplateId` | `string` | ❌ No |  |
| `moduleConfig` | `object` | ❌ No |  |
| `status` | `string` | ❌ No | Enums: [`DRAFT`, `SCHEDULED`, `ACTIVE`, `CLOSED`] |
| `scheduleStart` | `string` | ❌ No |  |
| `scheduleEnd` | `string` | ❌ No |  |

### `DriveQuestionAssignmentDto`

**Required Fields**: `questionId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `questionId` | `string` | ✅ Yes |  |
| `pointShare` | `number` | ❌ No |  |

### `SaveDriveQuestionsDto`

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `questionIds` | `array of `string`` | ❌ No |  |
| `questionAssignments` | `array of `DriveQuestionAssignmentDto`` | ❌ No |  |

### `AddCandidatesBulkDto`

**Required Fields**: `candidates`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `candidates` | `array of `DriveCandidateDto`` | ✅ Yes |  |

### `CreateQuestionDto`

**Required Fields**: `moduleType`, `content`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `moduleType` | `string` | ✅ Yes | Enums: [`MCQ`, `SQL`, `CODING`, `DEBUGGING`, `AI_PROMPTING`, `SIMULATION`] |
| `content` | `object` | ✅ Yes |  |
| `scoringConfig` | `object` | ❌ No |  |
| `difficulty` | `string` | ❌ No |  |
| `tags` | `array of `string`` | ❌ No |  |
| `role` | `string` | ❌ No |  |
| `status` | `string` | ❌ No | Enums: [`DRAFT`, `PUBLISHED`, `ARCHIVED`] |

### `UpdateQuestionDto`

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `moduleType` | `string` | ❌ No | Enums: [`MCQ`, `SQL`, `CODING`, `DEBUGGING`, `AI_PROMPTING`, `SIMULATION`] |
| `content` | `object` | ❌ No |  |
| `scoringConfig` | `object` | ❌ No |  |
| `difficulty` | `string` | ❌ No |  |
| `tags` | `array of `string`` | ❌ No |  |
| `role` | `string` | ❌ No |  |
| `status` | `string` | ❌ No | Enums: [`DRAFT`, `PUBLISHED`, `ARCHIVED`] |

### `RunCodingDto`

**Required Fields**: `sessionId`, `questionId`, `language`, `sourceCode`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string (uuid)` | ✅ Yes |  |
| `questionId` | `string (uuid)` | ✅ Yes |  |
| `language` | `string` | ✅ Yes |  |
| `sourceCode` | `string` | ✅ Yes |  |

### `SubmitCodingDto`

**Required Fields**: `sessionId`, `questionId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string (uuid)` | ✅ Yes |  |
| `questionId` | `string (uuid)` | ✅ Yes |  |
| `language` | `string` | ❌ No |  |
| `sourceCode` | `string` | ❌ No |  |
| `timeSpentSeconds` | `number` | ❌ No | Min: 0 |

### `DraftCodingDto`

**Required Fields**: `sessionId`, `questionId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string (uuid)` | ✅ Yes |  |
| `questionId` | `string (uuid)` | ✅ Yes |  |
| `language` | `string` | ❌ No |  |
| `sourceCode` | `string` | ❌ No |  |
| `timeSpentSeconds` | `number` | ❌ No | Min: 0 |

### `RunSqlDto`

**Required Fields**: `sessionId`, `questionId`, `query`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string (uuid)` | ✅ Yes |  |
| `questionId` | `string (uuid)` | ✅ Yes |  |
| `query` | `string` | ✅ Yes |  |

### `SubmitSqlDto`

**Required Fields**: `sessionId`, `questionId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string (uuid)` | ✅ Yes |  |
| `questionId` | `string (uuid)` | ✅ Yes |  |
| `query` | `string` | ❌ No |  |
| `timeSpentSeconds` | `number` | ❌ No | Min: 0 |

### `DraftSqlDto`

**Required Fields**: `sessionId`, `questionId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string (uuid)` | ✅ Yes |  |
| `questionId` | `string (uuid)` | ✅ Yes |  |
| `query` | `string` | ❌ No |  |
| `timeSpentSeconds` | `number` | ❌ No | Min: 0 |

### `CreateProctoringEventDto`

**Required Fields**: `eventType`, `severity`, `timestamp`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `id` | `string` | ❌ No | Optional pre-generated event ID |
| `sessionId` | `string` | ❌ No | Session ID linked to the assessment session Example: `f7d79b94-8173-45c1-9d10-3882775a2d04` |
| `eventType` | `string` | ✅ Yes | Type of proctoring event violation detected Enums: [`FACE_MISSING`, `MULTIPLE_FACES`, `LOOKING_AWAY`, `SEAT_EXIT`, `EXCESSIVE_MOVEMENT`, `PHONE_DETECTED`, `HEADPHONES_DETECTED`, `BOOK_DETECTED`, `SPEECH_DETECTED`, `SECOND_VOICE_SUSPECTED`, `IDENTITY_MISMATCH`, `TAB_SWITCH`, `PASTE`, `FULLSCREEN_EXIT`] Example: `PHONE_DETECTED` |
| `severity` | `string` | ✅ Yes | Severity of the violation (MEDIUM or HIGH) Example: `HIGH` |
| `timestamp` | `string` | ✅ Yes | ISO 8601 Timestamp of when the event was captured Example: `2026-07-17T12:00:00.000Z` |
| `clipUrl` | `string` | ❌ No | Storage reference path key for the video evidence Example: `proctoring/f7d79b94-8173-45c1-9d10-3882775a2d04/phone_detected_1712345678.webm` |
| `modelVersion` | `string` | ❌ No | The name/version of the computer vision model generating this event Example: `object-detector-v1` |
| `uploadStatus` | `string` | ❌ No | Current upload availability status of the video evidence clip Enums: [`PENDING`, `UPLOADED`, `FAILED`] Default: `PENDING` |
| `metadata` | `object` | ❌ No | Additional telemetry metadata (charCount, textSnippet, questionId) |
| `category` | `string` | ❌ No | Telemetry signal category |
| `kind` | `string` | ❌ No | Telemetry signal kind |

### `RunAiPromptDto`

**Required Fields**: `sessionId`, `questionId`, `prompt`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string` | ✅ Yes |  |
| `questionId` | `string` | ✅ Yes |  |
| `prompt` | `string` | ✅ Yes |  |

### `SubmitAiPromptDto`

**Required Fields**: `sessionId`, `questionId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string` | ✅ Yes |  |
| `questionId` | `string` | ✅ Yes |  |
| `prompt` | `string` | ❌ No |  |
| `timeSpentSeconds` | `number` | ❌ No |  |

### `SubmitMcqDto`

**Required Fields**: `sessionId`, `questionId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string (uuid)` | ✅ Yes |  |
| `questionId` | `string (uuid)` | ✅ Yes |  |
| `selectedOptions` | `array of `string`` | ❌ No |  |
| `timeSpentSeconds` | `number` | ❌ No | Min: 0 |

### `DraftMcqDto`

**Required Fields**: `sessionId`, `questionId`  

| Field Name | Type | Required | Details / Constraints |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string (uuid)` | ✅ Yes |  |
| `questionId` | `string (uuid)` | ✅ Yes |  |
| `selectedOptions` | `array of `string`` | ❌ No |  |
| `timeSpentSeconds` | `number` | ❌ No | Min: 0 |

---

## 🚀 API Endpoints Overview

### Tag: Health

#### `GET` /api/v1/health

HealthController_check

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/health/ready

HealthController_ready

**Responses:**

- **`200`**: Success

### Tag: Auth

#### `GET` /api/v1/auth/dev-token

AuthController_getDevToken

**Responses:**

- **`200`**: Success

### Tag: Admin

#### `GET` /api/v1/admin/dashboard/stats

AdminController_getDashboardStats

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/admin/dashboard/action-queue

AdminController_getActionQueue

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/admin/dashboard/export

AdminController_exportStats

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/admin/sessions

AdminController_listSessions

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `page` | `query` | `number` | ✅ Yes |  |
| `pageSize` | `query` | `number` | ✅ Yes |  |
| `status` | `query` | `string` | ❌ No |  |
| `roleTemplateId` | `query` | `string (uuid)` | ❌ No |  |
| `search` | `query` | `string` | ❌ No |  |
| `driveId` | `query` | `string (uuid)` | ❌ No |  |
| `needsReview` | `query` | `boolean` | ❌ No |  |
| `sortBy` | `query` | `string` | ❌ No |  |
| `sortOrder` | `query` | `string` | ❌ No |  |

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/admin/results

AdminController_listResults

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `page` | `query` | `number` | ✅ Yes |  |
| `pageSize` | `query` | `number` | ✅ Yes |  |
| `status` | `query` | `string` | ❌ No |  |
| `roleTemplateId` | `query` | `string (uuid)` | ❌ No |  |
| `search` | `query` | `string` | ❌ No |  |
| `driveId` | `query` | `string (uuid)` | ❌ No |  |
| `needsReview` | `query` | `boolean` | ❌ No |  |
| `sortBy` | `query` | `string` | ❌ No |  |
| `sortOrder` | `query` | `string` | ❌ No |  |

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/admin/sessions/{sessionId}

AdminController_getSessionDetail

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `object`

#### `POST` /api/v1/admin/sessions/{sessionId}/decision

AdminController_recordDecision

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`RecordDecisionDto`](#recorddecisiondto)

**Responses:**

- **`201`**: Success -> `object`

#### `GET` /api/v1/admin/sessions/{sessionId}/events

AdminController_getSessionEvents

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/admin/sessions/{sessionId}/integrity-flags

AdminController_getIntegrityFlags

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/admin/role-templates

AdminController_listRoleTemplates

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/admin/invites

AdminController_createInvite

**Request Body**: [`CreateInviteDto`](#createinvitedto)

**Responses:**

- **`201`**: Success

#### `GET` /api/v1/admin/invites

AdminController_listInvites

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `page` | `query` | `number` | ✅ Yes |  |
| `pageSize` | `query` | `number` | ✅ Yes |  |
| `status` | `query` | `string` | ❌ No |  |
| `driveId` | `query` | `string (uuid)` | ❌ No |  |
| `search` | `query` | `string` | ❌ No |  |

**Responses:**

- **`200`**: Success -> `object`

#### `POST` /api/v1/admin/invites/{inviteId}/revoke

AdminController_revokeInvite

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `inviteId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success -> `object`

#### `POST` /api/v1/admin/invites/{inviteId}/extend

AdminController_extendExpiry

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `inviteId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`ExtendExpiryDto`](#extendexpirydto)

**Responses:**

- **`201`**: Success -> `object`

#### `POST` /api/v1/admin/invites/{inviteId}/regenerate

AdminController_regenerateToken

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `inviteId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success

#### `POST` /api/v1/admin/invites/bulk-revoke

AdminController_bulkRevoke

**Request Body**: [`BulkInviteActionDto`](#bulkinviteactiondto)

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/admin/invites/bulk-resend

AdminController_bulkResend

**Request Body**: [`BulkInviteActionDto`](#bulkinviteactiondto)

**Responses:**

- **`200`**: Success

#### `DELETE` /api/v1/admin/invites/{inviteId}

AdminController_deleteInvite

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `inviteId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/admin/invites/bulk-delete

AdminController_bulkDelete

**Request Body**: [`BulkInviteActionDto`](#bulkinviteactiondto)

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/admin/sessions/compare

AdminController_compareSessions

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/admin/drives/{driveId}/export

AdminController_exportDrive

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

### Tag: Session

#### `POST` /api/v1/sessions/start

POST /api/v1/sessions/start

Redeem an invite token and create a new assessment session.
Protected by InviteTokenRateLimitGuard to prevent brute-force.

**Request Body**: [`StartSessionDto`](#startsessiondto)

**Responses:**

- **`201`**: Success -> `object`

#### `POST` /api/v1/sessions/{sessionId}/begin

POST /api/v1/sessions/:sessionId/begin

Begin the assessment session, transitioning NOT_STARTED to IN_PROGRESS.

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `object`

#### `POST` /api/v1/sessions/{sessionId}/selfie

POST /api/v1/sessions/:sessionId/selfie

Upload baseline selfie before beginning the assessment.

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/sessions/{sessionId}/heartbeat

POST /api/v1/sessions/:sessionId/heartbeat

Tab-alive signal.  Must be sent every 15 s.
Returns 409 SECOND_TAB_DETECTED when a different tab is already active.

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`HeartbeatDto`](#heartbeatdto)

**Responses:**

- **`200`**: Success -> `object`

#### `POST` /api/v1/sessions/{sessionId}/resume

POST /api/v1/sessions/:sessionId/resume

Reconnect after a DISCONNECTED transition.
Only allowed within the grace window and below max disconnects.

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`ResumeSessionDto`](#resumesessiondto)

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/sessions/{sessionId}/questions/{questionId}

GET /api/v1/sessions/:sessionId/questions/:questionId

Fetch the full details of a question for the active session.

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |
| `questionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/sessions/{sessionId}/progress

GET /api/v1/sessions/:sessionId/progress

Returns per-question answer status for the free-navigation sidebar.
Stub until Phase 3 (question serving).

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`501`**: Success

#### `POST` /api/v1/sessions/{sessionId}/close

POST /api/v1/sessions/:sessionId/close

Candidate explicitly submits the session.

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `object`

### Tag: Candidate

#### `POST` /api/v1/sessions/{sessionId}/consent

POST /api/v1/sessions/:sessionId/consent

Write a ConsentRecord row for the given consent type.
The candidate is identified via the session.
IP address is captured from the request for audit purposes.

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`RecordConsentDto`](#recordconsentdto)

**Responses:**

- **`201`**: Success

### Tag: Simulation

#### `GET` /api/v1/sessions/{id}/simulation/scenario

SimulationController_getScenarioConfig

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `object`

#### `POST` /api/v1/sessions/{id}/simulation/initial-say

SimulationController_saveInitialSay

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success

#### `POST` /api/v1/sessions/{id}/simulation/telemetry

SimulationController_recordTelemetry

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success

#### `POST` /api/v1/sessions/{id}/simulation/run-code

SimulationController_runSimulationCode

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success -> `object`

#### `GET` /api/v1/sessions/{id}/simulation/actions

SimulationController_getCandidateActions

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/sessions/{id}/simulation/inbox

SimulationController_getInbox

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `array`

#### `POST` /api/v1/sessions/{id}/simulation/inbox/read

SimulationController_markInboxRead

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success

#### `POST` /api/v1/sessions/{id}/simulation/email-reply

SimulationController_saveEmailReply

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success

#### `GET` /api/v1/sessions/{sessionId}/simulation/triggered-messages

SimulationController_getTriggeredMessages

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `array`

#### `POST` /api/v1/sessions/{id}/simulation/start

SimulationController_startSimulation

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success -> `object`

#### `GET` /api/v1/sessions/{id}/simulation/current

SimulationController_getCurrentEvent

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `object`

#### `POST` /api/v1/sessions/{id}/simulation/state

SimulationController_logEventState

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success

#### `POST` /api/v1/sessions/{id}/simulation/submit

SimulationController_submitEvent

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success -> `object`

#### `POST` /api/v1/sessions/{id}/simulation/execute

SimulationController_executeTerminalCommand

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success -> `object`

#### `POST` /api/v1/sessions/{id}/simulation/skip

SimulationController_skipEvent

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success -> `object`

#### `GET` /api/v1/sessions/{id}/simulation/summary

SimulationController_getSessionSummary

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/sessions/{id}/simulation/timeline

SimulationController_getRecruiterTimeline

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `array`

#### `GET` /api/v1/sessions/{id}/simulation/logs

SimulationController_getSessionLogs

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `object`

### Tag: Settings

#### `GET` /api/v1/admin/settings/staff

SettingsController_listStaff

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/admin/settings/staff

SettingsController_createStaff

**Responses:**

- **`201`**: Success

#### `DELETE` /api/v1/admin/settings/staff/{staffId}

SettingsController_deleteStaff

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `staffId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `PATCH` /api/v1/admin/settings/staff/{staffId}/role

SettingsController_updateStaffRole

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `staffId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`UpdateStaffRoleDto`](#updatestaffroledto)

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/admin/settings/scoring

SettingsController_getScoringConfig

**Responses:**

- **`200`**: Success

#### `PATCH` /api/v1/admin/settings/scoring

SettingsController_updateScoringConfig

**Request Body**: [`UpdateScoringConfigDto`](#updatescoringconfigdto)

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/admin/settings/system

SettingsController_getSystemConfig

**Responses:**

- **`200`**: Success

#### `PATCH` /api/v1/admin/settings/system

SettingsController_updateSystemConfig

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/admin/settings/retention

SettingsController_getRetentionConfig

**Responses:**

- **`200`**: Success

#### `PATCH` /api/v1/admin/settings/retention

SettingsController_updateRetentionConfig

**Request Body**: [`UpdateRetentionConfigDto`](#updateretentionconfigdto)

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/admin/settings/appeal-window

SettingsController_getAppealWindowConfig

**Responses:**

- **`200`**: Success

#### `PATCH` /api/v1/admin/settings/appeal-window

SettingsController_updateAppealWindowConfig

**Request Body**: [`UpdateAppealWindowConfigDto`](#updateappealwindowconfigdto)

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/admin/settings/audit-log

SettingsController_listAuditLogs

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `page` | `query` | `number` | ✅ Yes |  |
| `pageSize` | `query` | `number` | ✅ Yes |  |
| `search` | `query` | `string` | ❌ No |  |

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/admin/settings/audit-logs

SettingsController_listAuditLogsAlias

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `page` | `query` | `number` | ✅ Yes |  |
| `pageSize` | `query` | `number` | ✅ Yes |  |
| `search` | `query` | `string` | ❌ No |  |

**Responses:**

- **`200`**: Success

### Tag: Drive

#### `POST` /api/v1/admin/drives

DriveController_create

**Request Body**: [`CreateDriveDto`](#createdrivedto)

**Responses:**

- **`201`**: Success

#### `GET` /api/v1/admin/drives

DriveController_list

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `page` | `query` | `number` | ✅ Yes |  |
| `pageSize` | `query` | `number` | ✅ Yes |  |
| `status` | `query` | `string` | ❌ No |  |
| `search` | `query` | `string` | ❌ No |  |

**Responses:**

- **`200`**: Success -> `object`

#### `GET` /api/v1/admin/drives/{driveId}

DriveController_findOne

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `object`

#### `PATCH` /api/v1/admin/drives/{driveId}

DriveController_update

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`UpdateDriveDto`](#updatedrivedto)

**Responses:**

- **`200`**: Success

#### `DELETE` /api/v1/admin/drives/{driveId}

DriveController_delete

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/admin/drives/{driveId}/duplicate

DriveController_duplicate

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success

#### `POST` /api/v1/admin/drives/{driveId}/close

DriveController_closeEarly

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success

#### `PATCH` /api/v1/admin/drives/{driveId}/questions

DriveController_saveQuestionsPatch

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`SaveDriveQuestionsDto`](#savedrivequestionsdto)

**Responses:**

- **`200`**: Success

#### `PUT` /api/v1/admin/drives/{driveId}/questions

DriveController_saveQuestionsPut

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`SaveDriveQuestionsDto`](#savedrivequestionsdto)

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/admin/drives/{driveId}/candidates/bulk

DriveController_addCandidatesBulk

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`AddCandidatesBulkDto`](#addcandidatesbulkdto)

**Responses:**

- **`201`**: Success

#### `POST` /api/v1/admin/drives/{driveId}/generate-links

DriveController_generateLinks

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`201`**: Success

#### `DELETE` /api/v1/admin/drives/{driveId}/candidates/{candidateId}

DriveController_removeCandidate

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `driveId` | `path` | `string` | ✅ Yes |  |
| `candidateId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

### Tag: SampleCsv

#### `GET` /api/v1/admin/drives/sample-csv/questions

SampleCsvController_getSampleQuestionsCsv

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/admin/drives/sample-csv/candidates

SampleCsvController_getSampleCandidatesCsv

**Responses:**

- **`200`**: Success

### Tag: Question

#### `GET` /api/v1/admin/questions

QuestionController_list

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `page` | `query` | `number` | ✅ Yes |  |
| `pageSize` | `query` | `number` | ✅ Yes |  |
| `moduleType` | `query` | `string` | ❌ No |  |
| `difficulty` | `query` | `string` | ❌ No |  |
| `search` | `query` | `string` | ❌ No |  |
| `role` | `query` | `string` | ❌ No |  |
| `status` | `query` | `string` | ❌ No |  |

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/admin/questions

QuestionController_create

**Request Body**: [`CreateQuestionDto`](#createquestiondto)

**Responses:**

- **`201`**: Success

#### `GET` /api/v1/admin/questions/{questionId}

QuestionController_findOne

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `questionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `PATCH` /api/v1/admin/questions/{questionId}

QuestionController_update

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `questionId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`UpdateQuestionDto`](#updatequestiondto)

**Responses:**

- **`200`**: Success

#### `DELETE` /api/v1/admin/questions/{questionId}

QuestionController_remove

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `questionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/admin/questions/bulk

QuestionController_bulkUpload

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/admin/questions/{questionId}/stats

QuestionController_getStats

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `questionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

### Tag: Coding

#### `POST` /api/v1/coding/run

CodingController_run

**Request Body**: [`RunCodingDto`](#runcodingdto)

**Responses:**

- **`200`**: Success

#### `GET` /api/v1/coding/execution/{id}

CodingController_getExecution

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/coding/submit

CodingController_submit

**Request Body**: [`SubmitCodingDto`](#submitcodingdto)

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/coding/draft

CodingController_draft

**Request Body**: [`DraftCodingDto`](#draftcodingdto)

**Responses:**

- **`200`**: Success

### Tag: Sql

#### `POST` /api/v1/sql/run

SqlController_run

**Request Body**: [`RunSqlDto`](#runsqldto)

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/sql/submit

SqlController_submit

**Request Body**: [`SubmitSqlDto`](#submitsqldto)

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/sql/draft

SqlController_draft

**Request Body**: [`DraftSqlDto`](#draftsqldto)

**Responses:**

- **`200`**: Success

### Tag: proctoring

#### `POST` /api/v1/proctoring/events

Persist proctoring event telemetry metadata

**Request Body**: [`CreateProctoringEventDto`](#createproctoringeventdto)

**Responses:**

- **`201`**: The proctoring event has been successfully validated and persisted.
- **`400`**: Session is not active (IN_PROGRESS) or validation filters failed.
- **`404`**: Session ID was not found.
- **`409`**: Duplicate event detected within the active cooldown period.

#### `POST` /api/v1/proctoring/session/{sessionId}/upload-evidence

Atomically upload proctoring video clip to MinIO and persist ProctoringEvent to database

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Request Body**: [`CreateProctoringEventDto`](#createproctoringeventdto)

**Responses:**

- **`200`**: Video clip uploaded to MinIO and ProctoringEvent persisted to database successfully.
- **`400`**: No file attached, file invalid, or session is not active.

#### `GET` /api/v1/proctoring/session/{sessionId}

Retrieve all session events with temporary presigned GET URLs for evidence clips

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Array of session events mapped with active presigned clip URLs.
- **`404`**: Session ID was not found.

#### `GET` /api/v1/proctoring/session/{sessionId}/summary

Fetch structured count statistics of all events for Correlation Engine scoring

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `sessionId` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Dynamic count aggregation of each proctoring event type.

#### `GET` /api/v1/proctoring/stream/{bucket}/{path}

GET /api/v1/proctoring/stream/:bucket/*
Video clip streaming proxy handling subpath object keys

**Parameters:**

| Parameter | In | Type | Required | Description |
| :--- | :--- | :--- | :---: | :--- |
| `bucket` | `path` | `string` | ✅ Yes |  |

**Responses:**

- **`200`**: Success -> `object`

### Tag: AiPrompting

#### `POST` /api/v1/ai-prompting/run

AiPromptingController_run

**Request Body**: [`RunAiPromptDto`](#runaipromptdto)

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/ai-prompting/submit

AiPromptingController_submit

**Request Body**: [`SubmitAiPromptDto`](#submitaipromptdto)

**Responses:**

- **`200`**: Success

### Tag: Mcq

#### `POST` /api/v1/mcq/submit

McqController_submit

**Request Body**: [`SubmitMcqDto`](#submitmcqdto)

**Responses:**

- **`200`**: Success

#### `POST` /api/v1/mcq/draft

McqController_draft

**Request Body**: [`DraftMcqDto`](#draftmcqdto)

**Responses:**

- **`200`**: Success

