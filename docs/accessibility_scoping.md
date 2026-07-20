# Accessibility Auditing and Scoping Report (CD-Recruit)

This document scopes the accessibility requirements, current gaps, and backend/frontend engineering requirements to bring CD-Recruit up to global accessibility standards.

---

## 1. Target WCAG Compliance Level

| Phase | Target Standard | Rationale |
| :--- | :--- | :--- |
| **MVP (Current)** | **WCAG 2.1 Level A** | Focuses on essential keyboard operability, basic page structure, and high contrast. Ensures that candidates with physical disabilities or screen readers are not entirely blocked. |
| **Post-Launch (v1.1+)** | **WCAG 2.1 Level AA** | Brings the platform up to standard corporate compliance requirements (e.g., Section 508, European EN 301 549). Requires full keyboard focus management, rich interactive ARIA support, and automated video/audio alternatives. |

---

## 2. Keyboard Navigation Gaps (Per Major Screen)

### Lobby / Invite Resolver
* **Gaps:** 
  * The terms checkbox lack visual focus indication when navigated via Tab.
  * Pressing Enter on the checkbox does not toggle the checked state.
* **Remediation:** Style `:focus-visible` with a high-contrast outline on checkboxes. Bind `keydown` handlers for space/enter keys.

### System Check
* **Gaps:** 
  * The camera/microphone selection dropdowns are generic divs and cannot be focused or toggled using the keyboard.
  * The webcam simulator and status indicators cannot be reached by Tab.
* **Remediation:** Convert select panels to semantic `<select>` elements or build accessible listbox components using `aria-haspopup` and `aria-expanded`.

### Assessment Area (MCQ, SQL, Coding, Prompting, Simulation)
* **Gaps:** 
  * In the Coding editor (Monaco-based), keyboard focus can become trapped. Monaco requires pressing `Ctrl+M` to escape focus, but this shortcut is not documented on the page.
  * The module navigation side-tabs are not selectable via keyboard arrow keys.
* **Remediation:** Add a clear keyboard tooltip next to code editors instructing users how to escape focus. Map side-tabs to a standard tablist component (`role="tablist"`, `role="tab"`).

### Pre-Submit Review
* **Gaps:** 
  * Interactive answer cards do not have focusable buttons, requiring mouse clicks to expand or edit.
* **Remediation:** Wrap cards or expand/collapse buttons in semantic `<button>` tags with logical tab order.

---

## 3. Screen-Reader & ARIA Gaps

### Timers & Alerts
* **Gaps:** 
  * The assessment countdown timer changes every second, which will cause screen readers to continuously announce the time if improperly configured, or fail to announce it at all.
* **Remediation:** Wrap the timer in an `aria-live="polite"` region, but use an `aria-atomic="false"` configuration, or only announce the remaining time at key intervals (e.g., every 5 minutes, then every minute under 5 minutes, then every 10 seconds under a minute).

### Missing Alt Texts & Descriptions
* **Gaps:** 
  * Webcam preview frames lack descriptive alternate labels, meaning a blind user receives no feedback that the camera feed is loading.
* **Remediation:** Add `aria-label="Live proctoring camera stream"` to the `<video>` elements.

---

## 4. Admin-Settable Extended-Time Flag Backend Architecture

To support candidates with documented learning accommodations (e.g., double time), the system requires an administrative override for assessment durations.

### Schema Changes Required
* **`Invite` Model:** Add `extraTimeMinutes Int @default(0) @map("extra_time_minutes")` or `timeMultiplier Float @default(1.0) @map("time_multiplier")` to persist administrative overrides per candidate.
* **`Session` Model:** Add `extraTimeMinutes Int @default(0) @map("extra_time_minutes")` to capture the final allowed duration at the moment of session creation.

### Core Calculation Updates
Currently, `Session.deadlineAt` is calculated as `startedAt + roleTemplate.durationMinutes`. 
This must be updated in `SessionService.startSession` to:
$$\text{deadlineAt} = \text{startedAt} + (\text{roleTemplate.durationMinutes} + \text{session.extraTimeMinutes})$$

### Admin Endpoints Required
* **`POST /api/v1/admin/invites/:inviteId/accommodations`:** Allows recruiters/admins to update the extra time before the candidate redeems the token.
