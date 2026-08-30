<!--
  MORPHA — Phase 2 Final Information Architecture & Interaction Structure.
  Mirrored from Notion for offline reference. Notion remains the source of truth:
  https://app.notion.com/p/3ccaa0c5d41b80e083d1f6a54bc0415c
-->

MORPHA — PHASE 2<br>FINAL INFORMATION ARCHITECTURE & INTERACTION STRUCTURE
Built on the settled Phase 1 decisions. Read-First, evidence membrane, three destinations, mitotic density anchor, breast MVP context — all treated as fixed.<br>Target: desktop pathology workstation. Base design frame 1728 × 1080.
---
# A. FINAL INFORMATION ARCHITECTURE
## A.1 — Two navigation systems, deliberately separated
The single most common way an application like this fails is by promoting every mode into a route. MORPHA has two navigation systems and they behave differently.
**PRODUCT-LEVEL NAVIGATION** — changes what case you are working on. Three destinations, unloads context.
**WORKSPACE MODES** — changes what you are doing to the case you already have open. Zero routes, nothing unloads, the tissue never leaves the screen.
```plain text
PRODUCT-LEVEL NAVIGATION (routes)

    MORPHA
      │
      ├── CASE LIBRARY ──────── entry point, worklist
      │        │
      │        │ Open / Resume
      │        ↓
      ├── CASE WORKSPACE ────── the read
      │        │  ⇅
      └── CASE RECORD ───────── the evidence
               │
               └── fly-back to Workspace (spatial link)
```
Maximum depth from Library: 2. There is no sidebar, no breadcrumb, no nested routing.
---
## A.2 — The Workspace mode model
Three orthogonal axes. This is the core formalization of Phase 2.
```plain text
WORKSPACE MODES (not routes)

  SPATIAL STATE        what the canvas is
    ├── ORIENTATION    Slide Map occupies the canvas
    └── INSPECTION     Microscope occupies the canvas, Map demotes to rail

  TOOL STATE           what the pointer does
    ├── NAVIGATE       default — pan, zoom, select
    ├── REVIEW         candidate stepping + verdicts active
    ├── ANNOTATE       point / polygon / label
    ├── MEASURE        distance / area
    └── FRAME          counting frame

  PANEL CONTEXT        what the right panel shows
    ├── CANDIDATES
    ├── FINDINGS
    ├── DENSITY
    └── SLIDE INFO
```
**Decision:** Spatial state, tool state, and panel context are independent, with three constraints — REVIEW requires `candidates_revealed = true`; FRAME and MEASURE require valid slide MPP; REVIEW is suspended while ANNOTATE, MEASURE or FRAME is active.
**Reason:** Any pathologist workflow is a combination of these, not a sequence through them. A reader can be in orientation state, navigate tool, findings panel — reviewing what they have already confirmed at low power. Modelling these as fifteen screens would be absurd; modelling them as three independent axes makes every combination legal and cheap.
**UX benefit:** The state space is fully enumerable for design and QA (2 × 5 × 4 = 40 combinations, of which 34 are legal), and the reader never navigates — they only change what their hands are doing.
---
## A.3 — Complete hierarchy
```plain text
MORPHA
│
├── CASE LIBRARY
│   ├── Top bar ......................... persistent
│   │   ├── Product mark
│   │   ├── Global search
│   │   └── User / session
│   ├── Filter bar ...................... persistent
│   │   ├── Status filter
│   │   ├── Priority filter
│   │   ├── Assignment filter
│   │   ├── Readiness filter
│   │   └── Sort control
│   ├── Worklist table .................. persistent
│   │   ├── Column header .............. sticky
│   │   └── Case rows
│   │       └── Expanded row detail .... contextual, inline
│   └── Empty / error surface ........... temporary
│
├── CASE WORKSPACE
│   ├── Case bar ........................ persistent, always visible
│   │   ├── Accession + specimen + LATERALITY + procedure
│   │   ├── Case status
│   │   ├── Record link
│   │   └── Exit to Library
│   ├── Slide strip ..................... persistent, collapsible
│   │   └── Slide chips (thumb, stain, analysis state, QC, coverage ring)
│   ├── Left rail ....................... persistent, collapsible
│   │   ├── Slide Map .................. contextual (inspection state only)
│   │   ├── Layer controls ............. persistent
│   │   ├── Tool cluster ............... persistent
│   │   └── QC summary ................. contextual (when QC flags exist)
│   ├── Canvas .......................... always visible
│   │   ├── Slide Map .................. orientation state
│   │   ├── Microscope ................. inspection state
│   │   └── Verification control ....... temporary, floating, focused candidate only
│   ├── Right panel ..................... contextual, collapsible
│   │   ├── Candidates ................. Type → Cluster → Candidate
│   │   ├── Findings
│   │   ├── Density
│   │   └── Slide info
│   └── Status bar ...................... persistent, always visible
│       ├── Magnification
│       ├── Scale bar
│       ├── Coordinates
│       ├── Coverage (current slide)
│       ├── Active tool
│       └── MPP validity + sync state
│
└── CASE RECORD
    ├── Case bar ........................ persistent (shared component)
    ├── Evidence stream ................. primary column
    │   ├── Derived quantities
    │   ├── Findings by type
    │   ├── Marked regions & measurements
    │   └── Rejected candidates ........ collapsed by default
    ├── Context rail .................... sticky
    │   ├── Coverage per slide
    │   ├── Verification ledger
    │   ├── Model provenance
    │   └── Open items
    └── Sign-out control ................ persistent, bottom of rail
```
---
## A.4 — Persistence classification
<table header-row="true">
<tr>
<td>Class</td>
<td>Definition</td>
<td>Elements</td>
</tr>
<tr>
<td>**Always visible**</td>
<td>Cannot be hidden by the user</td>
<td>Case bar, canvas, status bar, H&E base layer</td>
</tr>
<tr>
<td>**Persistent**</td>
<td>Present by default, user may collapse</td>
<td>Slide strip, left rail, right panel, layer controls, tool cluster</td>
</tr>
<tr>
<td>**Contextual**</td>
<td>Appears when its condition is met</td>
<td>Slide Map in rail (inspection only), QC summary (flags exist), density panel content (frame exists), expanded library row</td>
</tr>
<tr>
<td>**Temporary**</td>
<td>Exists for the duration of one interaction</td>
<td>Verification control, measurement readout during drag, reclassify chip strip, tile-retry affordance</td>
</tr>
<tr>
<td>**Never floating**</td>
<td>Hard rule</td>
<td>Everything except the verification control</td>
</tr>
</table>
**Decision:** Exactly one element is permitted to float over tissue — the verification control anchored to the focused candidate.
**Reason:** Floating toolbars over a gigapixel image obscure the one thing the reader is there to see, and their position is never right at every zoom level. The left rail already exists and is a better home for tools.
**Clinical benefit:** The canvas stays tissue. When something appears over the image, it means something, and the reader learns that in the first minute.
---
# B. CASE LIBRARY ARCHITECTURE
## B.1 — The fifty-case question
At 50 rows, the reader is doing one thing: deciding what to open next. Everything in the row must serve triage. Everything else is noise.
**Visible in every row, always:**
<table header-row="true">
<tr>
<td>Field</td>
<td>Why it earns a column</td>
</tr>
<tr>
<td>Accession</td>
<td>Identity</td>
</tr>
<tr>
<td>Specimen + **laterality**</td>
<td>Laterality errors are a serious specimen-handling failure mode. It is displayed in the worklist, in the case bar, and in the Record — three times, unmissable.</td>
</tr>
<tr>
<td>Procedure</td>
<td>Core biopsy vs excision changes expected reading time and scope</td>
</tr>
<tr>
<td>Priority</td>
<td>The primary triage variable</td>
</tr>
<tr>
<td>Case status</td>
<td>New / In Review / Paused / Ready for Assessment / Finalized</td>
</tr>
<tr>
<td>Slides</td>
<td>Count + a single **readiness glyph**</td>
</tr>
<tr>
<td>Progress</td>
<td>Only for In Review / Paused — confirmed count + per-slide coverage micro-bars</td>
</tr>
<tr>
<td>Received</td>
<td>Age of the case; turnaround pressure</td>
</tr>
<tr>
<td>Assigned</td>
<td>Whose case it is</td>
</tr>
</table>
**Available on row expansion — inline, no modal, no drawer:**
Per-slide breakdown: slide ID, block, stain, level, analysis state, QC flags, coverage, candidate count. Clinical context note. Last activity timestamp and actor.
**Only after opening the case:** everything else. Model provenance, findings, annotations, the tissue itself.
**Decision:** Row expansion is inline and pushes rows down. Not a side drawer, not a modal, not a preview pane.
**Reason:** A drawer or preview pane occupies permanent width to serve an occasional need, and it forces a persistent selection state that competes with the row the reader is scanning. Inline expansion costs nothing when unused.
---
## B.2 — Case states versus slide states
The Phase 2 brief lists nine states mixed across both objects. They belong to two different things and must be separated.
**Decision:** Analysis states belong to the **slide**. The case never has an analysis state.
**Reason:** A 12-slide mastectomy case can simultaneously contain slides that are complete, queued, failed, and out of model scope. A single case-level analysis state would have to pick one and would therefore be a lie in most real cases.
**Benefit:** The row shows a derived **readiness glyph** that summarizes honestly without collapsing detail, and the truth stays available one expansion away.
### CASE STATES (5)
<table header-row="true">
<tr>
<td>State</td>
<td>Meaning</td>
<td>Set by</td>
</tr>
<tr>
<td>`New`</td>
<td>Assigned, never opened</td>
<td>System</td>
</tr>
<tr>
<td>`In Review`</td>
<td>Read Session exists, active</td>
<td>System, on first open</td>
</tr>
<tr>
<td>`Paused`</td>
<td>Deliberately set aside, with a reason</td>
<td>Pathologist</td>
</tr>
<tr>
<td>`Ready for Assessment`</td>
<td>Reader has marked the read complete</td>
<td>Pathologist</td>
</tr>
<tr>
<td>`Finalized`</td>
<td>Signed out, immutable</td>
<td>Pathologist</td>
</tr>
</table>
`Paused` is not idle. It is a real and common pathology state — the case is deferred pending deeper levels, pending IHC, pending clinical correlation. It carries a mandatory reason chip and is visually distinct from `In Review`, because a paused case is waiting on something external and a case in review is waiting on the reader.
### SLIDE ANALYSIS STATES (7)
<table header-row="true">
<tr>
<td>State</td>
<td>Meaning</td>
<td>Candidate layer</td>
</tr>
<tr>
<td>`Not Available`</td>
<td>No run has been requested</td>
<td>Absent</td>
</tr>
<tr>
<td>`Queued`</td>
<td>Run scheduled</td>
<td>Absent</td>
</tr>
<tr>
<td>`Analyzing`</td>
<td>Run in progress</td>
<td>Absent, progress shown</td>
</tr>
<tr>
<td>`Partially Analyzed`</td>
<td>Some tasks complete, others pending or failed</td>
<td>Partial, explicitly labelled</td>
</tr>
<tr>
<td>`Analysis Complete`</td>
<td>All tasks complete</td>
<td>Present</td>
</tr>
<tr>
<td>`Analysis Failed`</td>
<td>Run failed</td>
<td>Absent, reason + retry</td>
</tr>
<tr>
<td>`Out of Model Scope`</td>
<td>No applicable model (e.g. Ki-67 in an H&E-only MVP)</td>
<td>Absent, neutral</td>
</tr>
</table>
`Out of Model Scope` is neutral, not an error. It carries no warning colour and no retry. A slide with no model is an ordinary slide.
### DERIVED CASE READINESS GLYPH
<table header-row="true">
<tr>
<td>Glyph state</td>
<td>Condition</td>
</tr>
<tr>
<td>Ready</td>
<td>All in-scope slides `Analysis Complete`</td>
</tr>
<tr>
<td>Partial</td>
<td>Mixed states, none failed</td>
</tr>
<tr>
<td>Working</td>
<td>Any slide `Queued` or `Analyzing`</td>
</tr>
<tr>
<td>Attention</td>
<td>Any slide `Analysis Failed`</td>
</tr>
<tr>
<td>Manual</td>
<td>No slide has analysis; case is fully readable without AI</td>
</tr>
</table>
`Manual` is deliberately not styled as a deficiency.
### QC STATES (slide-level, 3)
`Clean` · `Flagged` (regions detected, non-blocking) · `Needs Attention` (\>15% of tissue unassessable, or incomplete scan)
---
## B.3 — Resume behavior
**Decision:** The primary action is `Resume` whenever a Read Session exists, and `Open` otherwise. The label difference is the promise.
Resume restores, exactly:
<table header-row="true">
<tr>
<td>Restored</td>
<td>Detail</td>
</tr>
<tr>
<td>Slide</td>
<td>The last active slide</td>
</tr>
<tr>
<td>Viewport</td>
<td>x / y centre, to the pixel</td>
</tr>
<tr>
<td>Zoom</td>
<td>Exact level, not the nearest preset</td>
</tr>
<tr>
<td>Spatial state</td>
<td>Orientation or inspection, as left</td>
</tr>
<tr>
<td>Tool state</td>
<td>The active tool</td>
</tr>
<tr>
<td>Panel context</td>
<td>Candidates / Findings / Density / Slide info</td>
</tr>
<tr>
<td>Layer configuration</td>
<td>Per-user, including any non-default toggles</td>
</tr>
<tr>
<td>`candidates_revealed`</td>
<td>Per slide — a revealed slide stays revealed, an unrevealed slide stays unrevealed</td>
</tr>
<tr>
<td>Coverage trace</td>
<td>Per slide, per pathologist, cumulative</td>
</tr>
<tr>
<td>Last candidate</td>
<td>Position in the stepping sequence, so `Space` continues rather than restarts</td>
</tr>
<tr>
<td>Frames, annotations, findings, verdicts</td>
<td>All, with authorship</td>
</tr>
<tr>
<td>Unsynced verdicts</td>
<td>Replayed and confirmed, or surfaced as unsynced</td>
</tr>
</table>
**Not restored:** hold-to-clear state, hover focus, in-progress drags, transient errors.
**Reason:** Interruption is the normal condition of the work. A reader called to a frozen section mid-hotspot should return to the same field, at the same power, on the same candidate.
**Clinical benefit:** Removes the re-orientation tax that makes digital reading feel slower than glass. This is one of the few places a digital system can be unambiguously better than a microscope, and it costs nothing but discipline about what gets persisted.
---
# C. CASE WORKSPACE ARCHITECTURE
## C.1 — Layout
```plain text
┌─────────────────────────────────────────────────────────────────────────┐
│ CASE BAR                                                            56  │
│ MOR-2026-00421 · Breast, LEFT · Excision      In Review    Record  ✕   │
├─────────────────────────────────────────────────────────────────────────┤
│ SLIDE STRIP                                                         76  │
│ [A1 H&E ◉]  [A2 H&E ◉]  [A3 Ki-67 ○]                                   │
├────────────────┬──────────────────────────────────┬─────────────────────┤
│ LEFT RAIL 320  │  CANVAS                    fluid │  RIGHT PANEL   360  │
│                │                                  │                     │
│ ┌────────────┐ │                                  │  ○ Candidates       │
│ │ SLIDE MAP  │ │                                  │  ○ Findings         │
│ │  288×240   │ │        MICROSCOPE                │  ○ Density          │
│ │      ▭     │ │        (inspection)              │  ○ Slide info       │
│ └────────────┘ │                                  │                     │
│                │            or                    │  ─────────────      │
│ LAYERS         │                                  │                     │
│  MEASURED      │        SLIDE MAP                 │                     │
│  ─ Tissue      │        (orientation)             │                     │
│  ─ QC          │                                  │                     │
│  ─ Coverage    │                                  │                     │
│  ─ Findings    │                                  │                     │
│  ─ Marked      │                                  │                     │
│  INFERRED      │                                  │                     │
│  ─ Candidates  │                                  │                     │
│  DISMISSED     │                                  │                     │
│  ─ Rejected    │                                  │                     │
│                │                                  │                     │
│ TOOLS          │                                  │                     │
│  ⊹ ▱ ▭ ↔ ⬡ T   │                                  │                     │
│                │                                  │                     │
│ QC SUMMARY     │                                  │                     │
├────────────────┴──────────────────────────────────┴─────────────────────┤
│ STATUS BAR   40× · 50µm ├──┤ · x 84,210 y 39,556 · cov 71% · REVIEW  32 │
└─────────────────────────────────────────────────────────────────────────┘
```
---
## C.2 — Regions
**Region → Content → Purpose → Persistence → Why**
---
**CASE BAR** → accession, specimen, laterality, procedure, current block/slide, case status, Record link, exit → *Establishes which patient and which side, permanently* → **Persistent, always visible, 56px** → It is thin and low-contrast by design. The reader knows which case they opened; what they need on screen is tissue. But laterality must never require a click to verify, so it lives here at full legibility while everything around it recedes.
**SLIDE STRIP** → horizontal chips: thumbnail, block + stain, analysis state glyph, QC flag, coverage ring → *Slide switching and case-wide readiness at a glance* → **Persistent, collapsible to 28px labels-only** → Alternatives considered: a vertical slide list in the left rail (costs 320px of the rail’s height, which the Slide Map needs) or a dropdown (hides case scope, which for a 24-slide mastectomy is the most important thing to see). A horizontal strip is how radiology series selection works, it scales to 24 slides by scrolling, and the coverage ring on each chip makes case-wide progress visible without opening the Record.
**LEFT RAIL** → Slide Map, layer controls, tool cluster, QC summary → *Spatial orientation and instrument controls* → **Persistent, collapsible to 0** → All three are things the reader adjusts while looking at tissue. Grouping them on one side means the eye leaves the canvas in one direction only.
**CANVAS** → Slide Map (orientation) or Microscope (inspection) → *The tissue* → **Always visible** → It is the product.
**RIGHT PANEL** → Candidates / Findings / Density / Slide info, one at a time → *The current work object* → **Contextual, collapsible to 0** → One panel, four modes. The reader is only ever in one of them; three simultaneous panels would be the dashboard the brief prohibits.
**STATUS BAR** → magnification, scale bar, coordinates, coverage, active tool, MPP validity, sync state → *Continuous instrument readout* → **Persistent, always visible, 32px** → This is the instrument’s panel of gauges. Every value updates continuously and none of them are ever hidden. Scale in particular must be present at all times, because a measurement culture depends on the scale never being out of sight.
**VERIFICATION CONTROL** → Confirm / Reject / Reclassify, anchored to the focused candidate → *Disposition without leaving the tissue* → **Temporary, floating, the only floating element** → See E.
---
## C.3 — Slide Map
The Slide Map is one component rendered at two sizes. In orientation it is the canvas; in inspection it is 288 × 240 in the rail. It is the same component, the same layers, the same interactions, and it is the minimap. There is no separate minimap object.
**Decision:** Collapse “Slide Map” and “Minimap” into one instrument.<br>**Reason:** The original brief listed them as separate components. Two spatial widgets means two spatial models the reader must reconcile.<br>**Benefit:** One spatial truth, permanently on screen, permanently accumulating coverage.
### What renders on the map
<table header-row="true">
<tr>
<td>Element</td>
<td>Always visible</td>
<td>Toggleable</td>
<td>Behavior at map scale</td>
</tr>
<tr>
<td>Tissue mask</td>
<td>✓</td>
<td>—</td>
<td>Outline + subtle fill; the substrate</td>
</tr>
<tr>
<td>QC regions</td>
<td>✓</td>
<td>yes</td>
<td>Amber hatch; never hidden by default</td>
</tr>
<tr>
<td>Viewport rectangle</td>
<td>✓ (inspection)</td>
<td>—</td>
<td>**Minimum render size 8×8px** — at 40× on a 100k-pixel slide the true rectangle is sub-pixel, so below that threshold it renders as a fixed-size crosshair marker</td>
</tr>
<tr>
<td>Coverage veil</td>
<td>on</td>
<td>yes</td>
<td>Veil over unviewed tissue; lifts as read progresses</td>
</tr>
<tr>
<td>Candidate **clusters**</td>
<td>after reveal</td>
<td>yes</td>
<td>Violet dashed cluster markers with member count</td>
</tr>
<tr>
<td>Individual candidates</td>
<td>**never on the map**</td>
<td>—</td>
<td>See rule below</td>
</tr>
<tr>
<td>Confirmed findings</td>
<td>on</td>
<td>yes</td>
<td>Teal solid dots; density-aggregated above a count threshold</td>
</tr>
<tr>
<td>Rejected candidates</td>
<td>on after reveal</td>
<td>yes</td>
<td>Gray dotted, 40%</td>
</tr>
<tr>
<td>Marked regions</td>
<td>on</td>
<td>yes</td>
<td>Teal solid, heavier stroke, labelled</td>
</tr>
<tr>
<td>Counting frames</td>
<td>on</td>
<td>yes</td>
<td>Teal solid with corner ticks, area label</td>
</tr>
<tr>
<td>Layer legend</td>
<td>✓</td>
<td>—</td>
<td>Compact, bottom edge of the map</td>
</tr>
</table>
### The overload rules
**Rule 1 — the map never renders individual candidates.** Only clusters. A mitosis model can emit 400 objects on one slide; rendering them at map scale produces a violet stain over the tissue that communicates nothing and violates the morphology budget. Individual candidates exist only in the microscope, above 10× equivalent.
**Rule 2 — confirmed findings aggregate above 40 objects.** Beyond that count on one slide, individual teal dots become a density rendering with the count labelled. The map answers *where*, not *how many of each* — that is the Record’s job.
**Rule 3 — the morphology opacity budget.** Cumulative overlay alpha over any tissue pixel may not exceed 20%. When the active layer combination would exceed it, fills drop out and layers degrade to stroke-only automatically. This is a rendering constraint, not a guideline.
**Rule 4 — hold-to-clear.** Hold `\` and every overlay vanishes; release and it returns. Works in both spatial states. No toggle, no state to remember. This is the digital equivalent of pulling back from the eyepieces, and it is the product’s trust contract: at any instant, with one key, the reader can confirm the software is showing them tissue and not a rendering of a model’s opinion.
---
## C.4 — Microscope View
**Zoom model.** Continuous zoom with five snap presets: 2× · 4× · 10× · 20× · 40× equivalent. Presets exist because pathology assessment is magnification-conventional — pleomorphism at 40×, architecture at 4× — and a reader should reach a known power in one keystroke. Continuous zoom exists because tissue does not care about presets.
**Tile behavior.** Progressive pyramid loading. Lower-resolution tiles hold position until higher-resolution tiles arrive. **The viewport never blanks.** A blank region on a pathology canvas is indistinguishable from background glass, which is a safety problem, not an aesthetic one.
**Always present in the microscope:**<br>- Scale bar, bottom-left of canvas, rescaling continuously during zoom<br>- Magnification readout in status bar<br>- Coordinates in status bar<br>- The Slide Map in the rail, with the live viewport rectangle
**Overlaid, per layer state:** candidate objects (violet dashed ◇), confirmed findings (teal solid ✓), rejected (gray dotted ✕), marked regions and frames (teal solid, heavier), measurement labels.
**Spatial connection to the map — four continuous mechanisms:**
1. The map is on screen at all times during inspection. It never has to be summoned.
2. The viewport rectangle updates live during pan and zoom, with no lag and no debounce.
3. The coverage veil lifts on the map in real time as the reader moves. The reader watches their own progress on the overview while working at 40×.
4. The transition between states is an animated zoom, not a page change (C.5).
The reader is never asked to remember where they are.
---
## C.5 — Map ↔︎ Microscope relationship
**Alternatives considered:**
*(a) Split view, both always at equal weight.* Rejected — halves the tissue canvas permanently to serve orientation, which is needed continuously but at low resolution.
*(b) Map as a modal overview summoned by keypress.* Rejected — orientation becomes an interruption rather than a continuous condition, and the reader loses the live coverage feedback that is half the point of the trace.
*(c) Map full-canvas in orientation, demoting to a persistent rail in inspection, with a continuous animated transition.* **Chosen.**
**Reason:** The map is needed continuously but at low resolution; the microscope is needed at full resolution but only during inspection. Sizing each to its actual resolution requirement, and animating between them rather than cutting, gives full canvas to whichever is primary without ever removing the other.
**Clinical benefit:** Global position is never lost, and the transition itself carries the product’s thesis — the map and the microscope are two distances from the same object, not two places.
### Interaction specification
<table header-row="true">
<tr>
<td>User action</td>
<td>System response</td>
</tr>
<tr>
<td>**Single click on map (orientation)**</td>
<td>Places a reticle at that location. No descent. Allows aiming before committing.</td>
</tr>
<tr>
<td>**Double-click / ****`Enter`**** on map (orientation)**</td>
<td>Continuous animated zoom into inspection at 10× equivalent, centred on that point. Map scales and translates into the rail slot over \~420ms, eased. Microscope tiles resolve from the same coordinates. Nothing unmounts.</td>
</tr>
<tr>
<td>**Click a candidate cluster (either state)**</td>
<td>Descends to inspection, fitted to the cluster bounding box. Panel context switches to Candidates, cluster expanded. Tool state does **not** auto-switch to REVIEW — that requires `Space` or an explicit action, so a click never risks an accidental verdict.</td>
</tr>
<tr>
<td>**`Space`**** in a cluster**</td>
<td>Enters REVIEW. Focuses the first unreviewed candidate, recentres at fixed 40× review magnification, eased \~200ms.</td>
</tr>
<tr>
<td>**Deep zoom beyond rectangle legibility**</td>
<td>Viewport rectangle on the map clamps to an 8×8px minimum and renders as a crosshair marker with a magnification label.</td>
</tr>
<tr>
<td>**Click a finding in the right panel**</td>
<td>Microscope flies to the finding at the magnification at which it was created, and the object receives focus styling. Works from orientation state too — it descends.</td>
</tr>
<tr>
<td>**Click on map while in inspection**</td>
<td>Microscope pans to that location at current magnification. No state change, no animation beyond the pan. This makes the rail map a navigation device, not just a readout.</td>
</tr>
<tr>
<td>**`Esc`**</td>
<td>Returns to orientation. Map expands from rail to canvas with the inverse animation. A **return marker** persists at the departed viewport so the reader can drop straight back with `Enter`.</td>
</tr>
<tr>
<td>**Slide switch (****`[`**** ****`]`**** or strip)**</td>
<td>Preserves layer configuration, tool state, and panel context. Restores that slide’s own viewport, zoom, coverage, and reveal state.</td>
</tr>
</table>
---
## C.6 — Layer controls
**Decision:** The layer panel is grouped by evidence register, and the group headers are the legend.
```plain text
LAYERS

MEASURED  ────────────── teal
  ▣ Tissue mask
  ▣ Scan QC              ⚠ 2 regions
  ▣ Coverage
  ▣ Confirmed findings   31
  ▣ Marked regions        4

INFERRED  ────────────── violet
  ▣ Candidate clusters   47      [ Reveal ]
  ▢ Individual candidates    (microscope only, ≥10×)

DISMISSED  ───────────── neutral
  ▣ Rejected candidates  14
```
**Reason:** The evidence law is the product’s central rule, and the chrome should teach it without a tutorial. Every time the reader adjusts a layer, they read the grouping.
**Benefit:** New users learn the teal/violet distinction from the interface itself, not from documentation. It also makes the layer panel double as the legend, removing a separate legend component.
### Per-layer specification
<table header-row="true">
<tr>
<td>Layer</td>
<td>Default</td>
<td>Hideable</td>
<td>Auto-appears when</td>
<td>Zoom behavior</td>
</tr>
<tr>
<td>H&E base</td>
<td>on</td>
<td>**no**</td>
<td>—</td>
<td>Always; the pyramid</td>
</tr>
<tr>
<td>Tissue mask</td>
<td>on</td>
<td>yes</td>
<td>Slide load</td>
<td>Outline thins with zoom; fill drops above 10×</td>
</tr>
<tr>
<td>Scan QC</td>
<td>on</td>
<td>yes</td>
<td>QC flags exist</td>
<td>Hatch density constant in screen space, not slide space</td>
</tr>
<tr>
<td>Coverage veil</td>
<td>on</td>
<td>yes</td>
<td>Trace begins</td>
<td>Map only; not rendered in microscope</td>
</tr>
<tr>
<td>Candidate clusters</td>
<td>**suppressed**</td>
<td>yes</td>
<td>On reveal</td>
<td>Map + microscope below 10×</td>
</tr>
<tr>
<td>Individual candidates</td>
<td>suppressed</td>
<td>yes</td>
<td>On reveal, ≥10×</td>
<td>**Microscope only, ≥10×** — hard threshold</td>
</tr>
<tr>
<td>Confirmed findings</td>
<td>on</td>
<td>yes</td>
<td>First confirm</td>
<td>Aggregate above 40 on map</td>
</tr>
<tr>
<td>Rejected candidates</td>
<td>on</td>
<td>yes</td>
<td>First reject</td>
<td>Lowest prominence tier</td>
</tr>
<tr>
<td>Marked regions</td>
<td>on</td>
<td>yes</td>
<td>First annotation</td>
<td>Labels appear ≥4×</td>
</tr>
<tr>
<td>Counting frames</td>
<td>on</td>
<td>yes</td>
<td>First frame</td>
<td>Area label always legible; scales with frame</td>
</tr>
<tr>
<td>Measurements</td>
<td>on</td>
<td>yes</td>
<td>First measurement</td>
<td>Labels always screen-space sized</td>
</tr>
</table>
### Prominence tiers — layers are not equal
<table header-row="true">
<tr>
<td>Tier</td>
<td>Stroke</td>
<td>Opacity</td>
<td>Layers</td>
</tr>
<tr>
<td>**1 · Base**</td>
<td>—</td>
<td>100%</td>
<td>H&E</td>
</tr>
<tr>
<td>**2 · Structural**</td>
<td>1px</td>
<td>40–60%</td>
<td>Tissue mask, coverage veil</td>
</tr>
<tr>
<td>**3 · Evidence**</td>
<td>1.5px</td>
<td>100%</td>
<td>Candidates, findings</td>
</tr>
<tr>
<td>**3b · Authored**</td>
<td>2px + vertex handles</td>
<td>100%</td>
<td>Marked regions, frames, measurements</td>
</tr>
<tr>
<td>**4 · Advisory**</td>
<td>1px hatch</td>
<td>70%</td>
<td>QC</td>
</tr>
<tr>
<td>**5 · Dismissed**</td>
<td>1px dotted</td>
<td>40%</td>
<td>Rejected</td>
</tr>
</table>
Pathologist-authored geometry is the heaviest stroke in the system. That is deliberate: what the human drew outranks what the machine proposed, visually as well as structurally.
---
# D. CANDIDATE NAVIGATION ARCHITECTURE
## D.1 — Three levels
```plain text
CANDIDATE TYPE          Mitotic figure · Tumor region · Necrosis · Cellular density
     ↓
SPATIAL CLUSTER         "Mitotic hotspot" — the navigation unit
     ↓
INDIVIDUAL CANDIDATE    reachable only by stepping, never by list
```
**Decision:** The list stops at the cluster. Individual candidates are never enumerated in a scrollable list.
**Reason:** A mitosis model on a breast excision emits hundreds of objects. A list of 400 rows is unusable, and it is also the wrong mental model — a pathologist counting mitoses is looking for the *hotspot*, then working through it, not browsing a catalogue.
**Clinical benefit:** The panel is comprehensible at a glance (typically 4–12 clusters per slide), and the navigation model matches the counting task exactly.
---
## D.2 — Information at each level
### TYPE level (group header)
```plain text
◇ MITOTIC FIGURE                     34 in 2 clusters      0 / 34
```
Type name · total count · cluster count · review progress.
### CLUSTER level (the card)
```plain text
┌───────────────────────────────────────────────────┐
│ ◇  Mitotic hotspot                        Rank 1  │
│    23 candidates · 0.82 mm²                       │
│    Score  ████████░░░░  H 14  M 7  L 2            │
│    Review ░░░░░░░░░░░░  0 / 23                    │
│    ⚠ 3 candidates in QC region                    │
│                              [ Go ]  [ Dismiss ]  │
└───────────────────────────────────────────────────┘
```
Type · rank · member count · area · score band distribution as a stacked bar (not three numbers) · review progress with confirmed/rejected split · QC overlap flag when \> 0 · model provenance on demand.
**Sort order:** grouped by type in a fixed clinical order — mitotic hotspot → tumor region → necrosis → cellular density — then within type by member count descending. **Never sorted by model score.** For breast grading the densest mitotic hotspot must be first, because that is the region the task is about.
### CANDIDATE level (the focused object, in the microscope)
Rendered on the tissue, not in a list. Its inspector is the verification control itself:
```plain text
    ◇ Mitotic figure · Moderate                    12 / 23
    [ Confirm C ]  [ Reject X ]  [ Reclassify R ]     ⓘ
```
Type · score band · position in sequence · QC status if applicable · `ⓘ` opens the technical detail popover containing raw score, model ID, model version, run timestamp, geometry. The raw value lives here and nowhere else.
---
## D.3 — Navigation controls
<table header-row="true">
<tr>
<td>Action</td>
<td>Input</td>
<td>Behavior</td>
</tr>
<tr>
<td>Next candidate</td>
<td>`Space`</td>
<td>Next **unreviewed** in cluster; recentre at 40×, eased</td>
</tr>
<tr>
<td>Previous</td>
<td>`Shift+Space`</td>
<td>Previous in sequence, reviewed or not</td>
</tr>
<tr>
<td>Next including reviewed</td>
<td>`→`</td>
<td>For re-checking work</td>
</tr>
<tr>
<td>Jump to cluster</td>
<td>click card / `1`–`9`</td>
<td>Descend, fit to bounding box</td>
</tr>
<tr>
<td>Next cluster</td>
<td>`Tab`</td>
<td>Moves to next cluster, does not auto-enter REVIEW</td>
</tr>
<tr>
<td>Enter review</td>
<td>`Space` from a cluster</td>
<td>Focuses first unreviewed</td>
</tr>
<tr>
<td>Exit review</td>
<td>`Esc`</td>
<td>Returns to NAVIGATE, cluster stays expanded</td>
</tr>
<tr>
<td>Dismiss cluster</td>
<td>`Dismiss` on card</td>
<td>See below</td>
</tr>
<tr>
<td>Undo last verdict</td>
<td>`Z`</td>
<td>Reverts one step, refocuses that candidate</td>
</tr>
</table>
### Bulk actions — deliberately asymmetric
**`Dismiss cluster`**** is permitted.** It records a bulk rejection across every unreviewed candidate in the cluster and requires a reason chip: `Artifact` · `Not mitotic` · `Outside tumor` · `Counted elsewhere` · `Other`. One extra click, and it turns the verification ledger into something a second reader can actually interpret.
**Bulk confirm is not offered anywhere.** Confirming creates Findings that feed a quantitative clinical measure. Each object is dispositioned individually. This is deliberate friction in the one place friction is correct, and the asymmetry is itself a design statement: dismissing is cheap, asserting is not.
---
# E. CANDIDATE VERIFICATION INTERACTION
This is the central interaction of the product — the membrane crossing. It happens over tissue, at diagnostic magnification, with no modal, in one keystroke.
## E.1 — The verification control
Anchored below the focused candidate, offset so it never covers the object being judged. Repositions automatically if the candidate is near the canvas edge. It is the only element permitted to float over tissue.
## E.2 — CONFIRM
**Before** — violet, 1.5px dashed, ◇ glyph at the vertex, elevated stroke weight relative to unfocused siblings. Verification control visible.
**Action** — `C`, or click `Confirm`.
**Transition** — \~180ms, three simultaneous changes, all essential:<br>1. Stroke morphs dashed → solid; colour interpolates violet → teal<br>2. ◇ glyph cross-fades to ✓<br>3. A teal dot appears on the Slide Map at that location
The transition must be visible but not celebratory. No bounce, no flash, no sound. This is a clinical assertion, not a game action. Its meaning is carried by the colour and stroke change, and those are enough.
**After** — a `Finding` exists with `origin: confirmed_candidate`, author, timestamp. It appears in the Findings panel, on the Slide Map, and if a counting frame contains it, the mitotic density recomputes immediately and visibly. The cluster’s review progress increments. Focus advances only on `Space` — never automatically, because auto-advance after a verdict removes the reader’s chance to look once more.
## E.3 — REJECT
**Before** — identical to confirm.
**Action** — `X`, or click `Reject`.
**Transition** — \~180ms: stroke dashed → dotted, colour violet → neutral `#6B6270`, opacity → 40%, ◇ → ✕.
**After** — a rejection verdict is recorded with author and timestamp. **The candidate persists.** It remains visible in its dismissed state, it appears in the verification ledger, and it is retained permanently. It never becomes a Finding and it never contributes to a derived quantity. Deleting it would be both a design error and a governance error — the fact that the system proposed something and a named human declined it is exactly the kind of record a CADe system exists to keep.
## E.4 — RECLASSIFY
**Before** — identical.
**Action** — `R`, or click `Reclassify`. The verification control’s three buttons are **replaced in place** by a chip strip:
```plain text
    Reclassify as:
    [1 Apoptotic body] [2 Hyperchromatic nucleus] [3 Artifact] [4 Other…]
                                                          Esc to cancel
```
Number keys select and commit. `Esc` cancels and restores the three-button control. No modal, no dropdown, no dialog — the control is already anchored to the object, so it becomes the selector rather than spawning one.
**Transition** — same 180ms morph as confirm, plus a small tick marker on the stroke and the ✎ glyph.
**After** — a Finding exists with `origin: reclassified_candidate`, carrying **both** the model’s original proposed type and the pathologist’s corrected type. This costs nothing and produces genuinely useful data: a case-level view of where the reader and the model diverged, available with no additional inference.
Reclassified findings are subject to their new type’s rules. A mitotic figure reclassified as an apoptotic body **leaves the mitotic count** and the density recomputes downward, visibly.
## E.5 — Keyboard map
<table header-row="true">
<tr>
<td>Key</td>
<td>Action</td>
</tr>
<tr>
<td>`Space`</td>
<td>Next unreviewed candidate</td>
</tr>
<tr>
<td>`Shift+Space`</td>
<td>Previous</td>
</tr>
<tr>
<td>`C`</td>
<td>Confirm</td>
</tr>
<tr>
<td>`X`</td>
<td>Reject</td>
</tr>
<tr>
<td>`R`</td>
<td>Reclassify → chip strip</td>
</tr>
<tr>
<td>`1`–`4`</td>
<td>Select reclassification type (chip strip active)</td>
</tr>
<tr>
<td>`Z`</td>
<td>Undo last verdict</td>
</tr>
<tr>
<td>`\` (hold)</td>
<td>Clear all overlays</td>
</tr>
<tr>
<td>`Esc`</td>
<td>Exit review / cancel reclassify / return to orientation</td>
</tr>
<tr>
<td>`Tab`</td>
<td>Next cluster</td>
</tr>
<tr>
<td>`[` `]`</td>
<td>Previous / next slide</td>
</tr>
<tr>
<td>`+` `−`</td>
<td>Zoom</td>
</tr>
<tr>
<td>`1`–`5` with `⌥`</td>
<td>Magnification presets</td>
</tr>
<tr>
<td>`F`</td>
<td>Counting frame tool</td>
</tr>
<tr>
<td>`⌘Z`</td>
<td>Undo annotation</td>
</tr>
</table>
**Decision:** The keyboard path is primary, not a power-user affordance.
**Reason:** A reader dispositioning 200 objects will use `Space`, `C`, and `X` exclusively and touch the mouse only to annotate. Designing the mouse path first and adding shortcuts later produces an interface that is optimal for the first ten objects and hostile for the next hundred and ninety.
**Clinical benefit:** Mitotic counting becomes a rhythm — look, judge, key, advance — at roughly two to four seconds per object. That speed is the difference between a tool that gets adopted and a demo.
## E.6 — Undo and editability
`Z` reverts the last verdict and refocuses that candidate. All verdicts remain editable until case finalization. Editing a verdict recomputes every derived quantity that depends on it, live. Verdict history is retained: a candidate confirmed then rejected shows both acts in its provenance.
---
# F. COVERAGE TRACE SYSTEM
## F.1 — What counts as examined
Viewport footprint, intersected with the tissue mask, added to the trace when **both** conditions hold:
- The viewport has been **stationary for ≥ 400 ms**
- Current magnification is at or above the tier threshold
**The dwell requirement is load-bearing.** Without it, a fast pan across the slide registers as having read everything it crossed, which is exactly the false reassurance the feature exists to prevent.
## F.2 — Two tiers
<table header-row="true">
<tr>
<td>Tier</td>
<td>Threshold</td>
<td>Question it answers</td>
</tr>
<tr>
<td>**Orientation coverage**</td>
<td>≥ 2× equivalent</td>
<td>Have I oriented myself on this slide?</td>
</tr>
<tr>
<td>**Diagnostic coverage**</td>
<td>≥ 10× equivalent</td>
<td>Have I actually examined this tissue?</td>
</tr>
</table>
Both are tracked, both are displayed. They are different questions and a single number would conflate them.
*Open parameter: for mitotic assessment specifically there is an argument for setting the diagnostic tier at 20×. This should be a configurable constant, shipped at 10×, and revisited against real reading behaviour.*
## F.3 — Denominator
`effective tissue area = total tissue area − QC-excluded area`
QC-excluded tissue is reported separately as **unassessable area**, never folded into uncovered tissue. Out-of-focus tissue is the scan’s failure, not the reader’s, and conflating the two would both misattribute a problem and make the coverage number meaningless.
## F.4 — Visualization
**Unviewed tissue sits under a veil. Viewed tissue is clear.** The rendering is inverted from the obvious approach: the system does not paint where you have been, it lifts the veil from where you have looked.
**Decision:** Reveal rather than paint.<br>**Reason:** Painting a trail reads as tracking. Lifting a veil reads as exploration.<br>**Benefit:** The correct emotional register for a feature that could easily feel like surveillance. It is also, in a dark cartographic interface, the most striking image the product produces — a slide slowly resolving out of shadow as it is read.
Veil opacity is low and constant. Diagnostic-covered tissue is fully clear; orientation-covered-only tissue sits at an intermediate veil. Three visual levels, no legend needed.
## F.5 — Metric display
Per slide, always: `A2 · orientation 94% · diagnostic 71% · unassessable 0%`
**Decision:** Never display a single case-level coverage percentage.<br>**Reason:** An aggregate averages away a completely unread slide. A case at “82% coverage” where one of four slides has never been opened is a dangerous number.<br>**Benefit:** The Record shows a per-slide bar set. A slide at zero is immediately visible and cannot hide inside an average.
## F.6 — Revisiting
Coverage is a union, not a counter. Revisiting adds nothing and removes nothing. The system does not track dwell duration, view counts, or reading speed — those would be surveillance metrics with no clinical purpose, and their absence should be a stated product commitment.
## F.7 — Scope
Coverage is **per slide, per pathologist**, persisted indefinitely. A second reader starts at zero, which is correct behaviour for a second opinion and for teaching.
## F.8 — Finalizing with unviewed tissue — the non-punitive interaction
The reader marks the case Ready for Assessment. Open items exist. What happens:
```plain text
┌─────────────────────────────────────────────────────────┐
│  Before marking this case ready                         │
│                                                         │
│  A1   66% of tissue not examined at ≥10×      [ View ]  │
│  A1   4.1% unassessable — out of focus        [ View ]  │
│  A2   12 candidates not reviewed              [ View ]  │
│                                                         │
│  These will be recorded in the case record.             │
│                                                         │
│              [ Go back ]      [ Acknowledge and mark ]   │
└─────────────────────────────────────────────────────────┘
```
**Rules for this surface:**
- It states facts. It does not evaluate them.
- No warning colour, no critical colour, no ⚠ on the coverage lines. Amber is reserved for QC, which is a scan defect, not a reading choice.
- Copy is neutral: *“not examined at ≥10×”*, never *“missed”*, *“incomplete”*, *“skipped”*, or *“you have not”*.
- Every line has a one-click `View` that flies to the largest unviewed region.
- It never blocks. `Acknowledge and mark` is always available.
- It appears once per finalization attempt, not repeatedly during the read.
**Decision:** Inform, record, never block, never judge.<br>**Reason:** A pathologist may legitimately sign out a case having examined 34% of a slide at high power — the remaining tissue may be normal breast, fat, or already-characterized tumour. The system does not know that; the pathologist does.<br>**Clinical benefit:** The reader retains authority, the record retains truth, and the feature stays a safety net rather than becoming a compliance instrument that readers learn to route around.
---
# G. SCAN QC ARCHITECTURE
## G.1 — Where QC first appears
**Three surfaces, escalating in detail, never blocking:**
1. **Case Library row** — a QC glyph on the slide count when any slide is `Flagged` or `Needs Attention`. Detail on row expansion.
2. **Workspace on slide load** — a QC summary block in the left rail, below the tools: `Scan QC · 2 regions · 4.1% unassessable`. It appears without being requested and persists while flags exist. It is not a toast, not a banner, and not a dialog.
3. **The map** — QC regions render as amber hatch from the moment the slide loads, before the reader has done anything.
**Decision:** QC never interrupts. No modal, no dismissal, no acknowledgment gate.<br>**Reason:** QC is a persistent property of the image, not an event. An event needs dismissing; a property needs displaying.<br>**Clinical benefit:** The reader knows the scan quality before forming any impression, and continues to know it for the whole session, without ever having clicked anything.
## G.2 — QC region types
`Focus issue` · `Tissue fold` · `Air bubble` · `Pen mark` · `Incomplete scan` · `Section edge`
All render as amber hatch with a type label at ≥4×. Hatch density is constant in screen space so it reads identically at every magnification.
## G.3 — QC effects on candidates
<table header-row="true">
<tr>
<td>Effect</td>
<td>Behavior</td>
</tr>
<tr>
<td>Marking</td>
<td>Any candidate whose centroid falls inside a QC region is permanently `qc_affected`, rendered violet dashed **plus** amber hatch on its own stroke</td>
</tr>
<tr>
<td>Cluster flag</td>
<td>Cluster cards show `⚠ 3 candidates in QC region` when overlap \> 0</td>
</tr>
<tr>
<td>Bulk exclusion</td>
<td>QC-affected candidates are excluded from `Dismiss cluster` and must be individually dispositioned — the reader must consciously handle the ambiguous ones</td>
</tr>
<tr>
<td>Density denominator</td>
<td>QC area inside a counting frame is subtracted; the frame reports `area` and `effective area` separately</td>
</tr>
<tr>
<td>Record</td>
<td>Every finding derived from a QC-affected candidate carries the flag permanently</td>
</tr>
</table>
## G.4 — Imperfect QC
Automated QC detection will miss things and will over-flag. Two consequences designed in:
**The pathologist can mark unassessable area manually.** This reuses the existing Marked Region primitive with `type: unassessable`. It renders like automated QC but is teal-authored rather than amber-advisory, and it participates in the denominator identically. No new object type, no new tool — one entry in the annotation type list.
**The pathologist can dismiss a QC region.** Dismissed regions rejoin the coverage denominator and stop excluding candidates. The dismissal is recorded with author and timestamp, like any other verdict.
**Decision:** QC is advisory input, not authority.<br>**Reason:** The reader can see whether tissue is assessable better than any focus-detection heuristic.<br>**Benefit:** The product stays fully usable when QC is wrong in either direction, which it will be.
---
# H. ANNOTATION & MEASUREMENT ARCHITECTURE
## H.1 — Tools and location
Six tools, in a fixed cluster at the bottom of the left rail. **Docked, never floating.**
<table header-row="true">
<tr>
<td>Tool</td>
<td>Key</td>
<td>Produces</td>
</tr>
<tr>
<td>Point</td>
<td>`P`</td>
<td>Marked Region, point</td>
</tr>
<tr>
<td>Polygon</td>
<td>`G`</td>
<td>Marked Region, polygon + area measurement</td>
</tr>
<tr>
<td>Counting frame</td>
<td>`F`</td>
<td>Counting Frame + effective area</td>
</tr>
<tr>
<td>Distance</td>
<td>`D`</td>
<td>Distance measurement</td>
</tr>
<tr>
<td>Area</td>
<td>`A`</td>
<td>Area measurement (polygon, measurement-only)</td>
</tr>
<tr>
<td>Text label</td>
<td>`T`</td>
<td>Text anchored to a coordinate</td>
</tr>
</table>
**Decision:** Tools dock in the rail rather than floating over the canvas.<br>**Reason:** The only element permitted over tissue is the verification control. A floating toolbar obscures tissue and is never correctly positioned at every zoom.<br>**Benefit:** The canvas stays tissue, and the rail becomes the single place the reader’s hand goes for instrument control.
## H.2 — Activation and active-tool communication
Active tool is communicated in **four places simultaneously**, because a wrong-tool draw on a gigapixel canvas is annoying to undo:
1. Rail tool button, active state
2. Cursor shape changes to the tool’s cursor
3. Status bar, right segment: `TOOL: COUNTING FRAME`
4. A 1px accent line along the top edge of the canvas in the authored-geometry teal
Tools are sticky — they stay active for repeated use — and `Esc` returns to NAVIGATE. REVIEW is suspended while a drawing tool is active, so `C` and `X` cannot fire an accidental verdict mid-draw.
## H.3 — Interaction with map and microscope
All tools work in both spatial states. A reader outlining a whole tumour does it on the map at low power; a reader drawing a counting frame around a hotspot does it in the microscope at 40×. Geometry is stored in slide coordinates and renders correctly at every magnification.
**Live readout during drag:** distance and area appear at the cursor, in tabular mono figures, updating continuously. The number exists before the shape is committed — the reader adjusts to the number rather than drawing and then discovering it.
## H.4 — Undo
`⌘Z` — unlimited within the session, per slide. Undo covers geometry creation, vertex edits, deletion, and label changes.
**Verdicts and annotations have separate undo stacks.** `Z` undoes a verdict; `⌘Z` undoes geometry. They are different kinds of act with different consequences, and merging them into one stack would produce a `⌘Z` that unexpectedly un-confirms a mitotic figure.
## H.5 — Measurement display
Labels anchor to their geometry, render in screen space (constant size at all magnifications), IBM Plex Mono with tabular figures, teal solid on a hairline plate at 80% background opacity so the value stays legible over pink tissue without occluding it.
Distance renders with its measurement line; area renders at the polygon centroid; frame area renders at the frame’s top-left corner with `effective area` on a second line when QC subtracts.
## H.6 — Scale and calibration
Communicated in three places:<br>1. **Scale bar** — bottom-left of canvas, always present, rescaling continuously<br>2. **Status bar** — magnification, plus `MPP 0.25` in the Slide Info panel<br>3. **Explicit failure** — if MPP is missing, malformed, or implausible, all measurement tools, the counting frame tool, and mitotic density are **disabled**, and the status bar reads `SCALE UNAVAILABLE — MEASUREMENT DISABLED` in the warning register
**Decision:** No MPP estimation, ever.<br>**Reason:** A wrong denominator produces a wrong mitotic density that looks exactly like a right one.<br>**Clinical benefit:** The product refuses to produce a number it cannot stand behind. This is a small feature with disproportionate credibility, and it is worth stating explicitly in the case study.
## H.7 — Distinguishability
<table header-row="true">
<tr>
<td>Object</td>
<td>Stroke</td>
<td>Colour</td>
<td>Glyph</td>
<td>Extra</td>
</tr>
<tr>
<td>Candidate</td>
<td>1.5px dashed</td>
<td>violet `#A46FC4`</td>
<td>◇</td>
<td>—</td>
</tr>
<tr>
<td>Confirmed finding</td>
<td>1.5px solid</td>
<td>teal `#4CC9B0`</td>
<td>✓</td>
<td>—</td>
</tr>
<tr>
<td>Rejected</td>
<td>1px dotted 40%</td>
<td>neutral `#6B6270`</td>
<td>✕</td>
<td>—</td>
</tr>
<tr>
<td>Marked region</td>
<td>**2px solid**</td>
<td>teal `#4CC9B0`</td>
<td>● / ▱</td>
<td>vertex handles, always labelled</td>
</tr>
<tr>
<td>Counting frame</td>
<td>**2px solid**</td>
<td>teal `#4CC9B0`</td>
<td>▭</td>
<td>corner ticks, area label</td>
</tr>
<tr>
<td>QC region</td>
<td>1px hatch</td>
<td>amber `#F2C14E`</td>
<td>⚠</td>
<td>hatch fill</td>
</tr>
<tr>
<td>Manual unassessable</td>
<td>1px hatch</td>
<td>teal `#4CC9B0`</td>
<td>⚠</td>
<td>hatch fill, authored</td>
</tr>
</table>
Pathologist-authored geometry carries the heaviest stroke and the only vertex handles in the system. Handles are a strong non-colour signal: **if it has handles, a human drew it.**
---
# I. MITOTIC DENSITY WORKFLOW
The anchor. This section defines how the equation stays visible.
## I.1 — Flow
```plain text
CANDIDATE MITOSES        violet, dashed, in cluster
        ↓
CANDIDATE CLUSTER        "Mitotic hotspot · 23 · 0.82 mm²"
        ↓
DEEP INSPECTION          40×, one object at a time
        ↓
CONFIRM / REJECT / RECLASSIFY      ← the membrane
        ↓
CONFIRMED MITOSES        teal, solid          NUMERATOR
        ↓
COUNTING FRAME           pathologist-drawn    DENOMINATOR
        ↓
MEASURED AREA            from MPP, minus QC
        ↓
MITOTIC DENSITY          derived, live
        ↓
CASE RECORD              traceable
```
## I.2 — What is visible during candidate review
The Density panel is available **while reviewing**, not only afterward. During a review run it shows:
```plain text
DENSITY · Slide A2

  ⚠ No counting frame
     Confirmed mitoses in this cluster:  12
     Density unavailable — draw a frame [F]

  ─────────────────────────────────────────
  Cluster · Mitotic hotspot
  Reviewed  12 / 23
  Confirmed 9  ·  Rejected 2  ·  Reclassified 1
```
**Decision:** With no frame, the panel shows the confirmed **count** and states explicitly that density is unavailable. It never shows a zero, a dash, a placeholder, or a provisional density.
**Reason:** A count without a denominator is not a density, and a rendered number is a claim. `0.0 /mm²` and `— /mm²` both read as measurements that happen to be empty.
**Clinical benefit:** The reader learns the denominator is mandatory by encountering its absence, and the interface never displays a quantity that does not exist.
## I.3 — The equation, made literal
Once a frame exists:
```plain text
DENSITY · Slide A2

        17          confirmed mitoses
   ─────────────
      1.21 mm²      measured counting area
        =
       14.0         mitoses / mm²

   Derived from pathologist-confirmed findings

   Frame        ANN-034 · drawn 14:22        [ Show ]
   Within frame 17 confirmed · 4 rejected     [ Show ]
   Excluded     0.00 mm² for scan quality
   Model        mitosis-v4.2                  [ ⓘ ]
```
**Decision:** Render the calculation as a visible fraction — numerator over rule over denominator over result — rather than as a number with metadata beneath it.
**Reason:** The product’s core claim is that the counting area is measured rather than assumed. That claim is carried by the denominator, and a denominator listed as a footnote reads as provenance rather than as the substance of the measurement.
**Clinical benefit:** The reader cannot look at the density without looking at what it was divided by. This is the single most defensible visual in the product, and it is the strongest candidate for the portfolio hero frame.
## I.4 — Live update behavior
<table header-row="true">
<tr>
<td>Event</td>
<td>Effect</td>
</tr>
<tr>
<td>Confirm a mitosis inside the frame</td>
<td>Numerator +1, density recomputes, \~200ms eased number transition</td>
</tr>
<tr>
<td>Reject a previously confirmed mitosis</td>
<td>Numerator −1, recomputes</td>
</tr>
<tr>
<td>Reclassify a mitosis as apoptotic body</td>
<td>Numerator −1, recomputes; the finding survives under its new type</td>
</tr>
<tr>
<td>Drag a frame edge</td>
<td>Denominator updates live during drag; findings crossing the boundary enter or leave the count in real time</td>
</tr>
<tr>
<td>Delete the frame</td>
<td>Density is **withdrawn**, not zeroed. The panel returns to the no-frame state.</td>
</tr>
<tr>
<td>QC region overlaps frame</td>
<td>Effective area reduces, exclusion stated on its own line</td>
</tr>
</table>
The recompute is eased and visible. The reader watches their own judgement change the number, which is the correct relationship between a clinician and a derived quantity.
## I.5 — Model-proposed frames
The model may propose a hotspot frame. It renders **violet, dashed, and produces no number**. It carries a single action: `Accept frame`. On acceptance it converts to teal solid, becomes a pathologist-authored Marked Region with the reader’s name on it, and only then enters the denominator.
**Decision:** A proposed frame produces no density until accepted.<br>**Reason:** The denominator is the product’s central claim to rigour. Allowing a machine-proposed area to produce a number would put an unverified value at the heart of the one thing MORPHA asserts is measured.<br>**Benefit:** The membrane holds even for geometry, not just for objects.
## I.6 — Traceability
Every element of the density is a spatial link, in both directions:
`14.0 /mm²` → the counting frame, at the magnification it was drawn<br>`17 confirmed` → the frame with all 17 findings focused<br>`4 rejected` → same frame, rejected layer forced visible<br>`Frame ANN-034` → the frame geometry, with vertex handles active for adjustment
And in reverse: from any finding in the microscope, `Show in record` opens the Record scrolled to that finding, with its contribution to the density highlighted.
---
# J. CASE RECORD ARCHITECTURE
## J.1 — Hierarchy
The Record is an evidence document, not a summary dashboard. Order is by evidential weight.
```plain text
1  DERIVED QUANTITIES        the assertions with the most riding on them
2  CONFIRMED FINDINGS        by type, with origin
3  MARKED REGIONS &          authored geometry
   MEASUREMENTS
4  COVERAGE                  per slide, never aggregated
5  VERIFICATION LEDGER       what the model proposed, what happened to it
6  REJECTED CANDIDATES       collapsed by default, retained permanently
7  MODEL PROVENANCE          per slide, per run
8  OPEN ITEMS                surfaced, not hidden
```
Derived quantities come first because they carry the most clinical weight and because they are the thing most in need of visible support. Rejected candidates are collapsed but present — they are a record, not a report.
## J.2 — Layout
```plain text
┌──────────────────────────────────────────────────────────────────────┐
│ CASE BAR  MOR-2026-00421 · Breast, LEFT · Excision   In Review  ← Map│
├──────────────────────────────────────────┬───────────────────────────┤
│ EVIDENCE STREAM                    fluid │ CONTEXT RAIL     360 sticky│
│                                          │                           │
│  MITOTIC DENSITY                         │  COVERAGE                 │
│      17 / 1.21 mm² = 14.0 /mm²           │   A1 ▓▓▓▓░░░░ 88 / 34     │
│      → frame · → findings                │   A2 ▓▓▓▓▓▓▓░ 94 / 71     │
│                                          │   A3 ░░░░░░░░  — viewer   │
│  FINDINGS                     31         │                           │
│   Mitotic figure              28  ▸      │  LEDGER                   │
│     24 confirmed candidate               │   47 proposed             │
│      4 pathologist-originated            │   31 confirmed            │
│   Necrosis                     2  ▸      │   14 rejected             │
│   Apoptotic body               1  ▸      │    2 reclassified         │
│                                          │                           │
│  MARKED REGIONS                4  ▸      │  PROVENANCE               │
│  MEASUREMENTS                  6  ▸      │   A1 mitosis-v4.2         │
│                                          │   A2 mitosis-v4.2         │
│  REJECTED CANDIDATES          14  ▸      │   A3 out of scope         │
│                                          │                           │
│                                          │  OPEN ITEMS               │
│                                          │   A1 66% not at ≥10×      │
│                                          │   A1 4.1% unassessable    │
│                                          │                           │
│                                          │  [ Mark ready ]           │
└──────────────────────────────────────────┴───────────────────────────┘
```
## J.3 — Findings breakdown by origin
```plain text
Mitotic figure                                    28
   ├─ 24  from confirmed candidates      ◇→✓
   └─  4  pathologist-originated         ✓
```
**Decision:** `origin` is preserved permanently and displayed at the type level.<br>**Reason:** Flattening to “28 findings” destroys the one piece of information a second reader or a tumour board would most want — how much of this the machine found and how much the reader found unaided.<br>**Clinical benefit:** The model’s contribution is auditable without ever letting the model author a claim, and the four pathologist-originated findings are visible evidence that the reader was not merely dispositioning a queue.
## J.4 — Bidirectional traceability
### Record → Tissue (fly-back)
Activating any value in the Record:
1. The Record recedes; the Workspace returns at the correct slide
2. Viewport and zoom restore to the state at which the evidence was created
3. **Required layers are forced visible** — clicking a rejected count turns on the rejected layer even if the reader had it off
4. The target object receives focus styling
5. A `← Record` affordance persists in the case bar for the return trip
Point 3 matters. A fly-back that lands on invisible evidence is a broken link.
<table header-row="true">
<tr>
<td>Record element</td>
<td>Lands on</td>
</tr>
<tr>
<td>Mitotic density value</td>
<td>The counting frame, at drawing magnification, with contributing findings focused</td>
</tr>
<tr>
<td>Finding type group</td>
<td>The map, with all findings of that type focused</td>
</tr>
<tr>
<td>Individual finding</td>
<td>The finding, in the microscope, at creation magnification</td>
</tr>
<tr>
<td>Coverage figure</td>
<td>The map, with the largest unviewed region focused and the coverage layer on</td>
</tr>
<tr>
<td>Rejected count</td>
<td>The map, rejected layer forced on</td>
</tr>
<tr>
<td>QC / unassessable</td>
<td>The QC region, with the QC layer forced on</td>
</tr>
</table>
### Tissue → Record
Every finding, frame, and measurement in the Workspace carries `Show in record` in its context menu, opening the Record scrolled and highlighted to that item.
**Decision:** Traceability is symmetric.<br>**Reason:** The reader moves both directions repeatedly during a real read — checking what an assertion rests on, and checking whether an object they are looking at has already been recorded.<br>**Clinical benefit:** The Record stops being a terminal document and becomes the case’s other face. That is what makes evidence traceable rather than merely recorded.
## J.5 — Mark ready and finalize
`Mark ready` triggers the open-items acknowledgment (F.8). `Finalize` locks the case: all verdicts, geometry, and quantities become immutable; the whole case remains fully navigable in read-only state.
*Note for the case study: real sign-out is a regulated act involving authentication, amendment procedures, and LIS integration. MORPHA models it as a portfolio-level lock, and the case study should say so plainly rather than implying a validated clinical workflow.*
---
# K. GLOBAL STATES
## K.1 — Case states
<table header-row="true">
<tr>
<td>State</td>
<td>Visual</td>
<td>Appears</td>
<td>Scope</td>
</tr>
<tr>
<td>`New`</td>
<td>Neutral outline chip</td>
<td>Library row, case bar</td>
<td>Global</td>
</tr>
<tr>
<td>`In Review`</td>
<td>Teal-filled chip</td>
<td>Library row, case bar</td>
<td>Global</td>
</tr>
<tr>
<td>`Paused`</td>
<td>Neutral chip + reason chip</td>
<td>Library row, case bar</td>
<td>Global</td>
</tr>
<tr>
<td>`Ready for Assessment`</td>
<td>Teal chip + ✓</td>
<td>Library row, case bar, Record</td>
<td>Global</td>
</tr>
<tr>
<td>`Finalized`</td>
<td>Solid teal, locked glyph</td>
<td>Everywhere; whole UI read-only</td>
<td>Global</td>
</tr>
</table>
## K.2 — Slide analysis states
<table header-row="true">
<tr>
<td>State</td>
<td>Visual</td>
<td>Appears</td>
<td>Scope</td>
</tr>
<tr>
<td>`Not Available`</td>
<td>Hollow dot, neutral</td>
<td>Slide strip, layer panel, Library expansion</td>
<td>Contextual</td>
</tr>
<tr>
<td>`Queued`</td>
<td>Hollow dot, violet</td>
<td>Slide strip, layer panel</td>
<td>Contextual</td>
</tr>
<tr>
<td>`Analyzing`</td>
<td>Violet arc, indeterminate</td>
<td>Slide strip, layer panel, Library row</td>
<td>Contextual</td>
</tr>
<tr>
<td>`Partially Analyzed`</td>
<td>Half-filled violet dot</td>
<td>Slide strip, layer panel</td>
<td>Contextual</td>
</tr>
<tr>
<td>`Analysis Complete`</td>
<td>Filled violet dot + count</td>
<td>Slide strip, layer panel</td>
<td>Contextual</td>
</tr>
<tr>
<td>`Analysis Failed`</td>
<td>Amber dot + reason + retry</td>
<td>Slide strip, layer panel, Library row</td>
<td>Contextual</td>
</tr>
<tr>
<td>`Out of Model Scope`</td>
<td>Hollow neutral dot, no badge</td>
<td>Slide strip, layer panel</td>
<td>Contextual</td>
</tr>
</table>
`Out of Model Scope` carries no warning treatment. It is an ordinary condition.
## K.3 — Candidate states
<table header-row="true">
<tr>
<td>State</td>
<td>Stroke</td>
<td>Colour</td>
<td>Glyph</td>
<td>Appears</td>
</tr>
<tr>
<td>`Detected` (pre-reveal)</td>
<td>not rendered</td>
<td>—</td>
<td>—</td>
<td>Layer panel count only</td>
</tr>
<tr>
<td>`Needs Review`</td>
<td>1.5px dashed</td>
<td>violet</td>
<td>◇</td>
<td>Map (cluster), microscope (object)</td>
</tr>
<tr>
<td>`Focused`</td>
<td>2px dashed</td>
<td>violet</td>
<td>◇ + control</td>
<td>Microscope only, one at a time</td>
</tr>
<tr>
<td>`Confirmed`</td>
<td>1.5px solid</td>
<td>teal</td>
<td>✓</td>
<td>Everywhere</td>
</tr>
<tr>
<td>`Rejected`</td>
<td>1px dotted 40%</td>
<td>neutral</td>
<td>✕</td>
<td>Everywhere</td>
</tr>
<tr>
<td>`Reclassified`</td>
<td>1.5px solid + tick</td>
<td>teal</td>
<td>✎</td>
<td>Everywhere</td>
</tr>
<tr>
<td>`QC-affected`</td>
<td>dashed + amber hatch</td>
<td>violet + amber</td>
<td>◇⚠</td>
<td>Everywhere</td>
</tr>
<tr>
<td>`Superseded`</td>
<td>dashed + strikethrough</td>
<td>violet 50%</td>
<td>◇↻</td>
<td>Panel + layer notice</td>
</tr>
</table>
## K.4 — QC states
<table header-row="true">
<tr>
<td>State</td>
<td>Condition</td>
<td>Visual</td>
<td>Scope</td>
</tr>
<tr>
<td>`Clean`</td>
<td>No regions</td>
<td>No indicator at all</td>
<td>Slide</td>
</tr>
<tr>
<td>`Flagged`</td>
<td>Regions present, \< 15% tissue</td>
<td>Amber glyph + hatch regions</td>
<td>Slide</td>
</tr>
<tr>
<td>`Needs Attention`</td>
<td>≥ 15% tissue, or incomplete scan</td>
<td>Amber glyph + rail summary + Library row glyph</td>
<td>Slide</td>
</tr>
</table>
`Clean` displays nothing. An interface that announces the absence of problems trains the reader to ignore it.
---
# L. ERROR, EMPTY & LOADING STATES
<table header-row="true">
<tr>
<td>Condition</td>
<td>Behavior</td>
</tr>
<tr>
<td>**No cases**</td>
<td>Neutral single line: *“No cases assigned.”* No illustration, no celebration, no empty-state art. This is a professional worklist.</td>
</tr>
<tr>
<td>**No filter results**</td>
<td>*“No cases match these filters”* + one-click reset.</td>
</tr>
<tr>
<td>**Worklist unavailable**</td>
<td>Explicit error with retry and last-successful-fetch time. **Never an empty table** — an empty list and a failed fetch are visually identical and clinically opposite.</td>
</tr>
<tr>
<td>**No slides in case**</td>
<td>Data integrity error. Case does not open. Explicit message with support path.</td>
</tr>
<tr>
<td>**No AI analysis**</td>
<td>Layer panel: `Candidates · not available`. Workspace fully functional. No warning colour, no degraded framing.</td>
</tr>
<tr>
<td>**Analysis failed**</td>
<td>Layer panel: `Analysis failed · <reason> · Retry`. Amber. Workspace fully functional.</td>
</tr>
<tr>
<td>**Model out of scope**</td>
<td>Layer panel: `No model for Ki-67`. Neutral. Not an error.</td>
</tr>
<tr>
<td>**No candidates detected**</td>
<td>`Analysis complete · 0 candidates`. Stated plainly, in the completed-analysis register. **This is a legitimate clinical result and must not be styled as failure.**</td>
</tr>
<tr>
<td>**All candidates reviewed**</td>
<td>Cluster cards show complete state; panel shows `All candidates reviewed · 31 confirmed · 14 rejected` and offers `Review confirmed findings`. No confetti, no “well done”.</td>
</tr>
<tr>
<td>**No coverage yet**</td>
<td>Map fully veiled. Status bar `coverage 0%`. Layer panel explains the trace begins on navigation. Correct and unremarkable at slide open.</td>
</tr>
<tr>
<td>**QC unavailable**</td>
<td>`Scan QC · not analysed`. Slide fully usable. Manual unassessable marking available. No blocking.</td>
</tr>
<tr>
<td>**Slide loading**</td>
<td>Skeleton tissue mask at true slide aspect ratio, so the map does not reflow when tissue arrives. Chrome renders immediately.</td>
</tr>
<tr>
<td>**Tile loading**</td>
<td>Progressive pyramid. Lower-resolution tiles hold position. **The viewport never blanks.**</td>
</tr>
<tr>
<td>**Tile failure**</td>
<td>Affected region renders in a distinct non-tissue treatment (dark neutral crosshatch) with an inline retry. **Never white** — white is indistinguishable from background glass and would read as “no tissue here”.</td>
</tr>
<tr>
<td>**Network interruption**</td>
<td>Verdicts and geometry queue locally. Status bar shows `UNSYNCED · 4`. Replays on reconnect. The reader is never told something is saved when it is not.</td>
</tr>
<tr>
<td>**Verdict save failure**</td>
<td>Verdict held locally, retried with backoff, surfaced as unsynced. Never silently dropped.</td>
</tr>
<tr>
<td>**Unsupported slide format**</td>
<td>Slide chip marked, explicit format message, other slides unaffected.</td>
</tr>
<tr>
<td>**Invalid MPP**</td>
<td>Measurement, frame, and density disabled. Status bar `SCALE UNAVAILABLE`. All other functions normal.</td>
</tr>
</table>
**The governing rule for this whole section:** MORPHA is a reading instrument that AI accelerates, not an AI product with a viewer attached. Every AI-absence state leaves the instrument fully functional and none of them are styled as product failure. A product that becomes unusable when its model is unavailable has misidentified what it is.
---
# M. FIGMA SCREEN BLUEPRINTS
**Base frame: 1728 × 1080.** Rails fixed, canvas fluid. At 2560 the rails hold and the canvas absorbs the difference — which is correct, because the canvas is the only region whose value scales with area.
**Grid:** 8px base, 4px half-step permitted in chrome only. **Radius:** 0 / 2 / 4px maximum. **Hairline:** 1px `#2A2230`.
---
## SCREEN 01 — CASE LIBRARY · 1728 × 1080
```plain text
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR                                                  56  │
│ MORPHA            [ search 480 ]                    user     │
├──────────────────────────────────────────────────────────────┤
│ FILTER BAR                                               56  │
│ [Status ▾][Priority ▾][Assigned ▾][Readiness ▾]  Sort ▾  47  │
├──────────────────────────────────────────────────────────────┤
│ TABLE HEADER (sticky)                                    40  │
│ Accession │ Specimen │ Proc │ Pri │ Status │ Slides │ Prog │ …│
├──────────────────────────────────────────────────────────────┤
│ ROW                                                      64  │
│ ROW                                                      64  │
│ ▼ ROW (expanded)                                         64  │
│   └ EXPANSION                                          auto  │
│      per-slide table · clinical context · last activity      │
│ ROW                                                      64  │
└──────────────────────────────────────────────────────────────┘
```
**Columns** (1728 − 48 gutters = 1680 usable):
<table header-row="true">
<tr>
<td>Column</td>
<td>Width</td>
<td>Content</td>
</tr>
<tr>
<td>Expand</td>
<td>32</td>
<td>Chevron</td>
</tr>
<tr>
<td>Accession</td>
<td>180</td>
<td>Mono, tabular</td>
</tr>
<tr>
<td>Specimen + laterality</td>
<td>260</td>
<td>Two lines; **laterality in caps**</td>
</tr>
<tr>
<td>Procedure</td>
<td>140</td>
<td>—</td>
</tr>
<tr>
<td>Priority</td>
<td>80</td>
<td>Chip</td>
</tr>
<tr>
<td>Case status</td>
<td>160</td>
<td>Chip + reason if Paused</td>
</tr>
<tr>
<td>Slides</td>
<td>140</td>
<td>Count + readiness glyph + QC glyph</td>
</tr>
<tr>
<td>Progress</td>
<td>200</td>
<td>Micro-bars per slide + confirmed count</td>
</tr>
<tr>
<td>Received</td>
<td>120</td>
<td>Relative + absolute on hover</td>
</tr>
<tr>
<td>Assigned</td>
<td>140</td>
<td>—</td>
</tr>
<tr>
<td>Action</td>
<td>128</td>
<td>`Open` / `Resume`</td>
</tr>
</table>
**Row height 64** — two text lines plus breathing room. Denser is scannable but loses the second line, which is where laterality and progress live.
**Components to build:** `library/row` (states: default, hover, expanded, finalized) · `library/status-chip` (5 variants) · `library/readiness-glyph` (5) · `library/qc-glyph` (3) · `library/progress-bars` · `library/filter-control` · `library/expansion`.
---
## SCREEN 02 — CASE WORKSPACE · 1728 × 1080
The primary frame. Build this as **two frame variants sharing every component**: `workspace/orientation` and `workspace/inspection`.
```plain text
┌───────────────────────────────────────────────────────────────────────┐
│ CASE BAR                                                          56  │
│ MOR-2026-00421 · BREAST, LEFT · Excision   ·  In Review  · Record · ✕ │
├───────────────────────────────────────────────────────────────────────┤
│ SLIDE STRIP                                        76 (collapsed 28)  │
│ ┌────┐ ┌────┐ ┌────┐                                                  │
│ │A1◉ │ │A2◉ │ │A3○ │   ← 96×60 chips, 8 gap, h-scroll                 │
│ └────┘ └────┘ └────┘                                                  │
├──────────────┬─────────────────────────────────┬──────────────────────┤
│ LEFT RAIL    │ CANVAS                          │ RIGHT PANEL          │
│ 320          │ 1048 × 916                      │ 360                  │
│ pad 16       │                                 │ pad 16               │
│              │                                 │                      │
│ ┌──────────┐ │  ORIENTATION:  Slide Map        │ ┌──────────────────┐ │
│ │SLIDE MAP │ │                fit, centred     │ │ SEGMENTED  4-up  │ │
│ │ 288×240  │ │                                 │ │ Cand│Find│Dens│ⓘ │ │
│ │  ▭       │ │  INSPECTION:   Microscope       │ └──────────────────┘ │
│ └──────────┘ │                full bleed       │                      │
│   ↑ inspect  │                                 │  content              │
│     only     │  Scale bar ↙ 24 from edges      │  scrolls              │
│              │  Verification control:          │                      │
│ LAYERS       │    anchored to focused          │  360 − 32 = 328       │
│ 288 × auto   │    candidate, offset 24 below   │  content width        │
│  3 groups    │                                 │                      │
│  32px rows   │                                 │                      │
│              │                                 │                      │
│ TOOLS        │                                 │                      │
│ 288 × 44     │                                 │                      │
│  6 × 40 btn  │                                 │                      │
│              │                                 │                      │
│ QC SUMMARY   │                                 │                      │
│ 288 × auto   │                                 │                      │
│ contextual   │                                 │                      │
├──────────────┴─────────────────────────────────┴──────────────────────┤
│ STATUS BAR                                                        32  │
│ 40× │ 50µm ├──┤ │ x 84,210 y 39,556 │ cov 71% │ REVIEW │ ✓ synced    │
└───────────────────────────────────────────────────────────────────────┘
```
**Vertical maths:** 1080 − 56 (case bar) − 76 (strip) − 32 (status) = **916 canvas height**.<br>**Horizontal:** 1728 − 320 − 360 = **1048 canvas width**.<br>**Collapsed rails:** left → 0, right → 0, canvas → 1728. Build the collapsed variant; a reader working a hotspot will use it.
### Always visible
Case bar · canvas · status bar · scale bar · H&E base layer
### Contextual
Slide Map in rail (inspection only) · QC summary (flags exist) · verification control (focused candidate) · right panel content (per mode) · reclassify chip strip (during reclassify) · measurement readout (during drag)
### On-demand
Layer toggles · tool selection · slide switching · panel mode · rail collapse · hold-to-clear · technical detail popover (`ⓘ`)
**Components to build:**`workspace/case-bar` · `workspace/slide-chip` (7 analysis states × QC flag) · `workspace/slide-map` (size variants: canvas / rail-288) · `map/viewport-rect` (rect + clamped-crosshair variants) · `map/cluster-marker` · `layers/group` · `layers/row` (on/off/disabled/count) · `tools/button` (6, active/inactive/disabled) · `panel/segmented-control` · `panel/cluster-card` · `panel/density-block` · `panel/findings-group` · `verification/control` (default / reclassify-strip) · `evidence/marker` (**the atom — see N**) · `status/segment` · `qc/summary`
---
## SCREEN 03 — CASE RECORD · 1728 × 1080
```plain text
┌───────────────────────────────────────────────────────────────────────┐
│ CASE BAR (shared component)                                       56  │
├─────────────────────────────────────────────┬─────────────────────────┤
│ EVIDENCE STREAM                             │ CONTEXT RAIL   360      │
│ 1368 wide · 1024 max content · centred      │ sticky · pad 24         │
│ pad 48 top                                  │                         │
│                                             │  COVERAGE               │
│  ┌───────────────────────────────────────┐  │   per-slide bars        │
│  │ MITOTIC DENSITY          hero block   │  │   never aggregated      │
│  │   fraction rendering                  │  │                         │
│  │   17 / 1.21 mm² = 14.0 /mm²           │  │  LEDGER                 │
│  │   height 240                          │  │   47 · 31 · 14 · 2      │
│  └───────────────────────────────────────┘  │                         │
│                                             │  PROVENANCE             │
│  FINDINGS            group rows 56, exp.    │   per slide             │
│  MARKED REGIONS      group rows 56, exp.    │                         │
│  MEASUREMENTS        group rows 56, exp.    │  OPEN ITEMS             │
│  REJECTED            group row 56, collapsed│   plain, no warning col │
│                                             │                         │
│                                             │  [ Mark ready ] 312×44  │
└─────────────────────────────────────────────┴─────────────────────────┘
```
**Primary:** the density block. It is the largest single element on the screen at 240px tall, and it renders the fraction rather than a number with footnotes.<br>**Secondary:** findings, geometry, measurements — expandable group rows.<br>**Tertiary, collapsed:** rejected candidates. Present, retained, not prominent.<br>**Rail:** coverage, ledger, provenance, open items, sign-out.
**Every value in both columns is a link.** Build `record/traceable-value` as a component with an explicit link affordance state — this is the Traceability pillar’s visible form and it must look like an affordance, not like text.
---
# N. FIGMA BUILD ORDER
Twenty-two steps in five stages. The sequence is chosen so that nothing is built twice.
## FOUNDATIONS
**1 · Variable collections.** `color/`, `space/`, `size/`, `radius/`, `stroke/`. Colours from Phase 1 as variables, never raw hex. Space scale 4·8·12·16·24·32·48·64. Radius 0·2·4 only.
**2 · Type styles.** Space Grotesk ≥18px display only · Inter body 12/13/14/16 · IBM Plex Mono **with tabular figures enabled** for every numeric. Set tabular figures now; retrofitting it across a dense interface is miserable.
**3 · Grid and layout rules.** 8px base grid. Fixed-rail / fluid-canvas constraints. Document the collapse behaviour.
**4 · ****`evidence/marker`**** — build this before any screen.** The atom. Variants: state (candidate / focused / confirmed / rejected / reclassified) × shape (point / polygon / region) × qc (true / false) × scale (map / microscope). This component appears in the map, the microscope, both panels, and the Record. Building screens first means building it four times and reconciling four versions.
**5 · Evidence primitives.** `evidence/glyph` (◇ ✓ ✕ ✎ ⚠) · `evidence/chip` · `evidence/score-band` · `evidence/origin-tag`. Same reasoning as step 4.
**6 · Chrome atoms.** Button (primary / secondary / ghost / icon, 4 states) · chip · segmented control · toggle row · hairline divider · popover shell.
## LOW-FIDELITY WIREFRAMES
**7 · Workspace shell, greybox.** Case bar, slide strip, rails, canvas, status bar. No content. **This first** — it proves the vertical maths (56 + 76 + 916 + 32 = 1080) before anything is styled.
**8 · Workspace orientation, greybox.** Map on canvas, rail without the map slot.
**9 · Workspace inspection, greybox.** Map demoted to rail, microscope on canvas. Confirm both variants share the shell.
**10 · Case Library, greybox.** Table, columns, row heights, expansion.
**11 · Case Record, greybox.** Two columns, density block proportion, rail stack.
**12 · Wireframe review.** Print at 100%. Check density, check that the canvas dominates, check that no rail has crept wider. Fix here, not later.
## COMPONENTS
**13 · ****`workspace/slide-map`****.** Size variants canvas / rail-288. All layers as boolean properties. Viewport rectangle with the clamped-crosshair variant.
**14 · ****`layers/panel`****.** Three register groups, rows with count badges, the `Reveal` action, disabled states.
**15 · ****`panel/cluster-card`****.** Score distribution bar, review progress, QC flag, actions. All states including complete and dismissed.
**16 · ****`verification/control`****.** Two variants: three-button and reclassify chip strip. This is the product’s central interaction — give it the time.
**17 · ****`panel/density-block`****.** Three states: no-frame, computed, withdrawn. Build the fraction layout as auto-layout so the numbers can change length without breaking.
**18 · ****`library/row`**** and ****`record/traceable-value`****.**
## INTERACTION STATES
**19 · State matrices.** For each key component, a frame showing every variant side by side: candidate states (8), slide analysis states (7), case states (5), QC states (3), tool states (6). These frames are documentation and they are what makes the design system usable by anyone else.
**20 · Empty, loading and error frames.** All of section L, as real frames. Not a list, not annotations — frames. This is where most portfolio pieces are thin, and it is the fastest way to look like production work.
## HIGH FIDELITY
**21 · Apply the visual system.** Colour, stroke, glow rules, tissue rendering, overlay opacity budget. **Take one real WSI screenshot region and build the microscope canvas against it.** Do not use a placeholder texture — every rendering decision in this product is a decision about how overlays sit on real H&E, and a synthetic texture will lead you to the wrong answers on opacity and stroke weight.
## PROTOTYPE
**22 · The hero flow, and only the hero flow.**
```plain text
Library → Resume MOR-2026-00421
  → Workspace, orientation, candidates suppressed
  → navigate, veil lifts, coverage crosses threshold
  → candidates reveal
  → select mitotic hotspot
  → CONTINUOUS ZOOM to inspection          ← the hero transition
  → Space, C, Space, X, Space, C           ← the membrane
  → F, drag counting frame
  → density resolves: 17 / 1.21 mm² = 14.0 /mm²
  → Record
  → click 14.0 → fly back to the frame     ← traceability closed
```
Ten steps. Build these to a high standard and leave every other path unprototyped. A short, perfect flow that closes the loop from tissue to number and back to tissue demonstrates the entire product thesis. A broad, shallow prototype demonstrates that you can draw a lot of screens.
---
## Parameters still open
1. Diagnostic coverage tier — 10× (shipped default) or 20× for mitotic work
2. Reveal threshold — 60% orientation coverage, configurable
3. Dwell time — 400ms
4. Ki-67 in the demo case — viewer-only, or removed to avoid implying comparison capability
5. Finding aggregation threshold on the map — currently 40
All five are constants, not architecture. Set them as Figma variables so they can be changed in one place after the first real reading test.
