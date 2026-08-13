# CD-Recruit — Candidate-Web Redesign Direction

Built directly from `CANDIDATE_UI_INVENTORY.md`. This is creative + UX
direction only — no code, no component structure decisions. It's organized
in four layers: what "premium" should actually mean here, fixes that have
to happen regardless of visual style, the design-system upgrades that
create the premium feel, and screen-by-screen notes. A sequencing
recommendation and a short list of decisions closes it out.

---

## 1. What "Premium" Means for This Specific Product

The UX doc already locked a constraint worth restating before proposing
anything: *this is not a marketing site — it's a timed, monitored,
high-stress interface, and the job of the UI is to not add to that
stress.* That rules out a certain kind of "premium" — no maximalist
gradients, no playful bounce, no decorative motion competing with the
timer or the editor.

The premium register that fits here is closer to **quiet, confident
restraint**: the kind of polish you feel in a well-made enterprise tool
that trusts the user rather than performing for them. Concretely, that
means:

- **One accent color, used sparingly and consistently** — cobalt blue
  stays the only color that means "interactive/primary," everywhere.
- **Generous whitespace over dense packing** — several current screens
  (Consent, Coding module) are visually busy; premium reads as calm, not
  full.
- **A typography hierarchy that's actually a hierarchy** — not five
  different ad hoc text sizes chosen per screen, but a small defined
  scale used the same way everywhere.
- **Total consistency over local cleverness** — every hardcoded color,
  every one-off icon choice, every screen that invented its own "status
  chip" pattern reads as unfinished the moment you compare two screens
  side by side. Consistency *is* the premium feel here, more than any
  single flourish.
- **Real iconography and illustration, not emoji** — this is probably the
  single biggest lever. Emoji as hero visuals (⏰ 🔒 ✅ 📷 🗑️ 🔓) reads as
  a prototype, not a shipped product, regardless of how good everything
  else is.

Keep this section as the filter for every decision below: if a proposed
change adds visual noise without adding clarity or trust, it's not
premium, it's decoration.

---

## 2. Fix Before — or Inseparably From — the Visual Pass

These aren't style preferences; they're correctness gaps the audit
surfaced. A beautiful redesign sitting on top of a broken link or a
dark-mode-inconsistent color is worse than a plain UI with neither —
it's a polish/substance mismatch that reads as *less* trustworthy, not
more, especially in a hiring-integrity product where trust is the whole
pitch.

| Issue | Why it can't wait |
|---|---|
| Hardcoded Tailwind colors bypassing CSS var tokens (R-01, R-05, R-06, R-11, R-12) | Every one of these will visibly break or mismatch the moment the palette is touched during redesign. This is the literal foundation the redesign gets built on. |
| Question palette has zero mobile fallback (R-02) | Can't call a redesign "modern" while a whole device class has no navigation. Needs a real responsive pattern decided as part of this pass, not patched after. |
| "Skip Liveness Check (failsafe)" reads as a normal secondary button (R-03) | A premium UI is precise about visual weight communicating intent. This is a case where the *current* lack of hierarchy is actively working against the product's own integrity goals. |
| Learning Hub links are dead stub anchors (R-04) | Dead links at the very last screen of the candidate's experience is the worst possible place for one. |
| REC•LIVE badge shows when camera is off (R-10) | A visible bug in the proctoring indicator — the one component whose entire job is being trustworthy and legible — undermines the product's core promise. |
| Compliance-halt screen exposes developer API route info to candidates (R-13) | Even though currently unreachable, if it's touched during redesign it needs to not leak internals if it ever does render. |
| Placeholder support email everywhere (R-20) | Cosmetic but easy — sweep it once real support infrastructure exists, flag if not. |

Recommend folding these into the same implementation pass as the visual
work (touching a file for redesign is the natural moment to fix what's
broken in it), rather than a separate pass — but they should be *tracked*
separately so "redesign" doesn't quietly become the excuse for skipping
a real bug list.

---

## 3. Design-System Upgrades — Where the Premium Feel Actually Comes From

### 3.1 Iconography — retire emoji entirely, unify on one icon set

`lucide-react` is already a dependency but only used in two files
(CodingWorkspace, ProctoringIndicator). Every other screen uses raw
emoji or plain Unicode characters (✓ ✗ ⚠ ● spinning glyphs) for status
and hero visuals. Recommend:

- One icon library, used everywhere, at one consistent stroke-width and
  a small fixed set of sizes (e.g. 16 / 20 / 24 / 40px), not ad hoc
  `text-2xl` / `text-6xl` emoji sizing.
- Every current emoji use gets a direct icon replacement: clock → clock
  icon, lock → lock icon, checkmark hero → check-circle icon, camera →
  camera icon, trash → trash icon, unlocked confirmation → unlock icon,
  warning → alert-triangle, theme toggle moon/sun → sun/moon icon toggle
  (not emoji).
- Status glyphs in System Check and Syncing (currently literal ✓ ✗ ⚠ ●
  characters with a rotating-character "spinner") become real icon +
  motion components — a proper spinner icon with a CSS rotation, not a
  Unicode character being spun.

### 3.2 Illustration — replace the DOM-built "diagrams" with real line art

Two places currently fake an illustration using nested divs with CSS
borders (Tutorial's interface diagram, Tutorial's inbox preview mockup).
These are functional but read as placeholder work the moment you look
closely. Recommend a small set of custom, brand-consistent line-art
illustrations (single-color or two-tone, cobalt blue on transparent,
matching the restrained tone from Section 1) for:

- The split-pane layout explainer (Tutorial step 1)
- The in-fiction inbox preview (Tutorial step 5)
- Empty/loading states that currently have none (Contextual module
  waiting for first message)
- Possibly a small supporting mark on Done, Expired, and Session
  Conflict — not required, but these are the screens most likely to be a
  candidate's *last* impression of the product, and they currently have
  the least visual craft (a single emoji character each).

Keep these sparse and functional, not decorative — one or two well-made
illustrations reused consistently beats five different styles.

### 3.3 Elevation & surface system

Everything today is flat: `surface` background + 1px border, uniformly,
everywhere — including the one floating/overlapping element in the app
(the expanded proctoring panel). Recommend defining 2–3 real elevation
levels:

- **Base** — the flat card treatment already in use, fine as-is for
  in-flow content (question cards, review cards).
- **Raised** — a genuinely floating element (expanded proctoring panel,
  any future tooltip/popover) gets a soft shadow, not just a `z-50` and
  a border. Needs separate light/dark shadow treatment — dark-mode
  "shadows" usually read better as a subtle border-glow than a literal
  drop shadow, since a black shadow on a near-black background is
  invisible.
- **Overlay** — if any true modal gets added later (there isn't one
  today), reserve a distinct treatment (backdrop blur/dim) so it's never
  confused with a raised panel.

Pair this with a consistent corner-radius scale tied to component role
(e.g., small controls vs. cards vs. pill-shaped status chips), rather
than each screen choosing its own `rounded-lg`/`rounded-xl`/`rounded-full`
independently.

### 3.4 Typography scale

Current sizing is chosen per-screen ad hoc: `text-6xl` emoji heroes,
`text-5xl` countdown, `text-3xl` countdown (different screen, different
size for the same *kind* of content), `text-2xl` emoji icons, `text-xs`
metadata. Recommend collapsing this into a small defined scale — display,
h1, h2, body, caption, and a separate mono-data scale for
timers/countdowns/reference IDs — applied by role, not chosen fresh each
time. This alone will make the app feel like one product instead of a
set of independently-built screens, which is currently the single
biggest tell that this was built screen-by-screen without a shared
system.

Reserve the largest display size for genuinely special moments (the
live countdown, the Done screen's reference ID) so it stays impactful
instead of diluted by also being used for a decorative emoji.

### 3.5 Motion system

Current motion is entirely utilitarian and mechanical: `animate-spin`,
`animate-pulse`, `animate-bounce`, all default Tailwind timing, applied
inconsistently (some use `duration-500`, most use defaults, none share a
timing philosophy). Recommend:

- A small set of duration/easing tokens (quick / standard / deliberate)
  with one shared easing curve, instead of each component picking its
  own.
- Entrance motion reserved for gate/transition/onboarding screens (Too
  Early countdown appearing, Tutorial step transitions, Waiting Room,
  Done screen reveal) — this is where a little polish earns its keep.
- The live assessment surface (ModuleShell and its five module bodies)
  keeps motion to an absolute minimum, per the existing "minimal chrome,
  maximum calm" principle — this should stay a hard line in the redesign,
  not soften just because motion is available elsewhere in the new
  system.
- The Syncing screen's four-step sequence is the best current candidate
  for a genuinely satisfying motion moment (it's the "please don't
  close this window" trust-critical screen) — a connected step-progress
  indicator with real icon states and a subtle line-fill animation
  between steps would read as far more premium than four independent
  spinning-character rows, while still being calm rather than flashy.

### 3.6 One shared "status chip" language

System Check rows, Question Palette cells, integrity banners, and
Syncing steps each currently invent their own color+icon+label
combination independently. Recommend a single status-chip visual
language (consistent icon position, consistent color mapping to the
existing token set, consistent shape) used everywhere a
pass/fail/pending/warning state is shown. This is a small change with a
large payoff — a candidate moving from System Check to the Question
Palette to the Syncing screen should recognize "this is how the product
shows me status" without relearning it each time.

### 3.7 Data-display discipline

IBM Plex Mono is already correctly reserved for numeric/code content in
most places — worth explicitly auditing this stays true everywhere
during redesign (timers, reference IDs, code, SQL results, countdowns)
and never leaks into prose, which is a small detail that reads as very
deliberate when done consistently.

---

## 4. Screen-by-Screen Improvement Notes

### Entry / missing-token error
Currently hardcoded dark hex, ignores theme entirely (R-01). Bring fully
into the token system so it works in both themes, and give it the same
icon+illustration treatment as Expired/Session Conflict rather than
being a one-off inline block in `App.tsx`.

### Too Early
Solid bones (live countdown, timezone clarity). Upgrade: replace the
clock emoji with a real icon, bring the timezone-mismatch note onto
tokens (currently hardcoded blue), and consider the countdown itself as
the one place on this screen that earns the "display" type scale and a
touch of motion (digits ticking down) — everything else on this screen
stays quiet.

### System Check
This is a checklist screen — lean into that instead of fighting it.
Replace the four Unicode status glyphs with the shared status-chip
language (3.6), give the runtime benchmark step a real (if simple)
progress indicator instead of a generic spinner, and treat the camera
permission-priming explainer as a small trust moment — it's already
good UX, worth giving it slightly more visual weight than the other
rows since it's the one step candidates are most likely to hesitate on.

### Consent — 5 steps
This is the highest-friction screen in the journey (legal + biometric +
liveness + selfie + audio, back to back) and currently the least
visually differentiated — one 765-line file, emoji icons, no shared
step-wizard chrome. Recommend:
- A real step-indicator (progress dots or segmented bar) so candidates
  know they're on step 2 of 5, not stuck in an undifferentiated form.
- Icon-based (not emoji) visual treatment for the biometric consent
  explainer — this is the moment candidates decide to trust the
  product's privacy story, worth the most craft on this whole screen.
- Visually de-emphasize "Skip Liveness Check" as a genuine tertiary
  action (smaller, lower contrast, maybe text-only) — separate from the
  correctness fix in Section 2, this is also a visual hierarchy problem.
- The oval face-guide overlay and mirrored capture are already good UX;
  polish the surrounding chrome (dashed→solid border transition) with
  the new motion tokens rather than changing the mechanism.

### Tutorial
Replace both DOM-CSS-box "diagrams" with real illustrations (3.2) —
this is the most visible placeholder-feeling element in the entire app.
Keep the soft-interrupt countdown banner but restyle it with the shared
status-chip/motion language rather than a bespoke amber box.

### Waiting Room
Currently the least-designed screen in the app — a countdown and a FAQ,
no illustration or visual interest, despite being guaranteed dead time
for every early arrival. Worth the most disproportionate design
investment relative to its current state: a calm illustration, the
countdown given real typographic weight, and the FAQ accordion upgraded
with an actual expand/collapse transition (currently native
`<details>` with no animation at all).

### Assessment Shell (ModuleShell, Timer, Question Palette, Proctoring Indicator)
This is the surface candidates spend the most time on, so restraint
matters most here — resist the urge to "premium-ify" this into
something busier. The real work is:
- Fix the sidebar/mobile-palette gap (Section 2) with an actual
  responsive pattern (a bottom drawer or collapsible panel, not a
  simple hide).
- Apply the shared status-chip language to the palette's four states
  and bring "flagged" onto tokens (currently hardcoded amber).
- Give the Timer a slightly more refined "capsule" treatment consistent
  with the new elevation/radius scale, but keep its behavior (color
  shift only, never red, pulse only at 1 minute) exactly as designed.
- Fix the Proctoring Indicator's REC•LIVE display bug as part of
  restyling it — this component's whole job is being legible and
  trustworthy, so it's worth the most precision, least novelty.

### MCQ / SQL / Coding / AI Prompting modules
These are functionally solid; the improvement here is consistency, not
reinvention:
- MCQ's custom radio/checkbox treatment is a good pattern — extend its
  visual language (not necessarily its exact styling) to option-style
  choices elsewhere rather than each module inventing its own selected/
  unselected state.
- SQL's results table and Coding's test-case table should share one
  "data table" visual pattern (mono type, consistent zebra/row
  treatment, consistent NULL/empty styling) instead of being built
  independently.
- Coding module's bare Tailwind semantic classes (R-12) need to resolve
  to the same token set as everything else before any visual changes
  land, or the workspace will visually diverge from the rest of the app
  post-redesign.
- AI Prompting's three-dot loading animation and "Direct Copy Detected"
  badge are good functional patterns — bring the badge onto the shared
  status-chip language.

### Contextual Simulation
Give the inbox a proper responsive treatment (currently a fixed 288px
column that clips below 768px) and add a real empty/loading state
(illustration + calm copy) for the gap before the first message
arrives — right now there's nothing there at all, which reads as
broken rather than "waiting."

### Pre-Submit Review
Already the most complete, fully-live-data screen in the app — mostly
needs the shared status-chip/completion-bar treatment applied
consistently rather than structural change. This is a good screen to
use as a reference pattern for what "review card" components should
look like elsewhere (Drive Detail on the admin side has a similar job,
worth keeping the visual language in the same family even though
they're different codebases).

### Syncing
The best opportunity in the whole app for a genuinely premium moment
without violating the "stay calm" rule — see 3.5. Replace the four
independent spinning-Unicode rows with a connected step-progress
pattern (icon states + a filling connector line), while explicitly
preserving the real API calls underneath (the mock 20%-failure
injection currently shares a code path with the real
`submitModuleResponse()` call — flagged again here because it's easy to
accidentally break trust-critical logic while restyling this screen).

### Done / Thank You
Second-best opportunity for a premium closing moment. Replace the
emoji checkmark hero with a proper icon/illustration, give the
reference ID real typographic weight (it's already mono, just needs the
display-scale treatment), and fix the dead Learning Hub links before
or during this pass — a beautifully redesigned screen with four dead
links at the bottom is a worse impression than a plain screen with
working ones.

### Session Conflict / Expired
Currently the thinnest screens visually (single emoji, plain text,
default buttons) despite being genuinely important trust moments — a
candidate hitting either of these is already anxious, and a
well-crafted, calm, clearly-explained screen here does real work.
Bring both onto the icon/illustration system and the shared button
hierarchy (primary "Contact Support" vs. secondary actions) rather than
leaving them as an afterthought relative to the assessment screens.

---

## 5. Suggested Sequencing

1. **Lock the design-system foundation first** — icon set, elevation
   scale, typography scale, motion tokens, status-chip pattern — as its
   own short reference spec, the same convention as the existing
   Section 6 token tables in the UX doc. Screen work shouldn't start
   until this exists, or you'll re-litigate the same decisions five
   times.
2. **Fold in the foundational fixes from Section 2** as part of touching
   each file for the visual pass — token compliance, the mobile
   palette gap, and the specific bugs/dead-links — tracked so they don't
   silently get treated as "already handled."
3. **Redesign in journey order, front-loaded on first impressions** —
   Too Early → System Check → Consent → Tutorial → Waiting Room get the
   earliest and most generous design attention, since they set the tone
   before a candidate has done any real work and currently have the
   least visual craft (Consent, Waiting Room especially).
4. **Assessment-loop screens get restraint, not reinvention** —
   ModuleShell and the five modules should look and feel like the same
   product as everything around them, but this is not where new visual
   ideas should be tried first; it's where the established system gets
   applied most carefully.
5. **Close strong** — Pre-Submit Review, Syncing, Done are the
   candidate's last experience of the product and currently the most
   functionally complete but least visually differentiated; they're a
   good place to spend the last bit of craft budget.

---

## 6. Decisions Worth Making Before Scoping the Build Prompt

1. **Custom illustration budget** — commission a small real illustration
   set (Section 3.2) vs. stay icon-only with no illustration at all.
   Meaningfully different scope/time; recommend at minimum the Waiting
   Room and Tutorial diagram replacements, since those are the most
   visibly placeholder-feeling elements today.
2. **Mobile support scope** — build a real responsive question palette
   (drawer/bottom-sheet) as part of this pass, or explicitly document
   candidate-web as desktop-only for now rather than leaving the current
   silent gap. Either is defensible; the current unstated gap isn't.
3. **Icon library** — recommend standardizing on `lucide-react` since
   it's already a dependency with existing usage and broad coverage,
   rather than introducing a second icon set.
4. **Consent screen decomposition** — the 765-line, 5-step-in-one-file
   structure will make a per-step visual redesign harder to scope
   cleanly. Worth deciding now whether splitting it into five
   sub-components happens as part of this redesign pass or is tracked
   as a separate follow-up — it doesn't have to block the visual work,
   but doing the visual work on an undifferentiated monolith is real
   friction worth naming upfront.

---

*This is a direction document, not a build spec — the next step is
translating Sections 3–4 into an actual visual design-system reference
(literal token values, component specs) once you've weighed in on
Section 6, followed by the implementation build prompt.*
