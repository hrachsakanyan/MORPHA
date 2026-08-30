# MORPHA

A reading instrument for digital pathology that AI accelerates — not an AI product
with a viewer attached. This is the Phase 2 web demo: real whole-slide imaging,
real measurement, synthetic model output, and the full evidence loop from tissue
to a number and back to tissue.

```
npm install
npm run dev          # http://localhost:5173
```

The Deep Zoom pyramid in `data/dzi` (1.4 GB) is streamed straight off disk by a
Vite middleware rather than copied into `public/` or `dist/`. Nothing needs to be
moved before running.

---

## What is real and what is not

| Real | Synthetic |
| --- | --- |
| The slide: TCGA-AN-A0FL, breast H&E, 122,807 × 71,603 px | Candidate objects and clusters |
| The scale: 0.248 µm/px, scanner-reported | Scan QC regions |
| The tissue mask, read from pyramid level 11 at load time | Slide metadata and case states |
| Every measurement — areas, distances, mitotic density | The worklist |
| The coverage trace | |

There is no inference anywhere in this codebase and the product never claims
there is. Model output is generated from a per-slide seed, is identical on every
load, and is anchored to the real tissue mask so candidates land on tissue rather
than on glass. Every slide in the worklist renders the same image; the metadata,
states and model output differ, the pixels do not.

---

## The hero flow

```
Library → Resume MOR-2026-00421
  → Workspace, orientation, candidates suppressed
  → navigate; the veil lifts, coverage crosses 60% orientation
  → Reveal
  → select the mitotic hotspot
  → animated descent to inspection            ← the hero transition
  → Space, C, Space, X, Space, C              ← the membrane
  → F, drag a counting frame
  → density resolves:  17 / 1.21 mm² = 14.0 /mm²
  → Record
  → click the density → fly back to the frame ← traceability closed
```

`MOR-2026-00421` ships with a seeded read session: slide A2 sits at 72%
orientation coverage with candidates still suppressed, so `Resume` lands exactly
on the read-first moment. `MOR-2026-00437` starts from zero if you want the whole
path.

---

## Keyboard

The keyboard path is primary, not a power-user affordance. A reader
dispositioning two hundred objects touches the mouse only to annotate.

| Key | |
| --- | --- |
| `Space` / `Shift+Space` | next unreviewed candidate / previous |
| `→` | next including reviewed, for re-checking |
| `C` `X` `R` | confirm · reject · reclassify |
| `1`–`4` | select a reclassification (chip strip open) |
| `1`–`9` | jump to cluster *n* |
| `Tab` | next cluster (never auto-enters review) |
| `Z` | undo verdict |
| `⌘Z` / `Ctrl+Z` | undo geometry — a separate stack, deliberately |
| `\` (hold) | clear every overlay |
| `Esc` | cancel · exit review · return to orientation |
| `Enter` | descend from the reticle, or return to the departed viewport |
| `[` `]` | previous / next slide |
| `+` `−` | zoom · `Alt+1`–`5` for 2× 4× 10× 20× 40× |
| `P` `G` `F` `D` `A` `T` | point · polygon · frame · distance · area · label |

---

## Architecture

Two navigation systems, deliberately separated.

**Routes** change which case you are working on. There are three, maximum depth
2, no sidebar, no breadcrumb, no nested routing.

```
/library            worklist, the entry point
/case/:id           the read
/case/:id/record    the evidence
```

**Workspace modes** change what you are doing to the case already open. They are
not routes; nothing unmounts and the tissue never leaves the screen. Three
orthogonal axes — spatial state (2) × tool state (5) × panel context (4) — of
which 34 combinations are legal.

```
src/
  domain/          the product, independent of React
    constants.ts     every closed parameter in one place
    types.ts         cases, slides, model output, human acts, modes
    cases.ts         the demo worklist
    tissue.ts        pyramid → map substrate + tissue mask
    synth.ts         seeded model output, anchored to real tissue
    coverage.ts      the trace: union over tissue cells, two tiers
    density.ts       numerator / denominator / result
    derive.ts        findings, ledger, readiness — all computed, never stored
  state/
    store.ts         sessions, persisted to localStorage
    ui.ts            transient workspace state, never restored
    view.ts          the live instrument readout
    coverageRegistry.ts   live grids, outside React
  features/
    library/         worklist, inline row expansion
    workspace/       shell, map, microscope, rails, panels, verification
    record/          evidence stream, context rail, fly-back
```

### Derived, never stored

Findings, the verification ledger and the case readiness glyph are computed from
verdicts and geometry every time they are read. They cannot drift out of
agreement with the acts that produced them. Verdict history is retained: a
candidate confirmed and then rejected shows both acts.

### The coverage trace

A union over tissue cells on a 192-column grid, per slide, per pathologist, at
two tiers — orientation at ≥2× and diagnostic at ≥10×. Revisiting adds nothing.
Dwell duration, view counts and reading speed are deliberately not recorded
anywhere: those would be surveillance metrics with no clinical purpose, and
their absence is a product commitment.

The denominator is tissue area minus QC-excluded area. Unassessable area is
reported separately and never folded into uncovered tissue — out-of-focus tissue
is the scan's failure, not the reader's.

Unviewed tissue sits under a veil and viewed tissue is clear. The system does not
paint where you have been; it lifts the veil from where you have looked.

### The membrane

Violet is reserved for what a model inferred. Teal is what a human confirmed or
drew. Nothing else in the product is violet, and the layer panel is grouped by
register so the grouping *is* the legend.

Confirming is individual, always. `Dismiss cluster` exists and requires a reason
chip; bulk confirm is not offered anywhere, because confirming creates findings
that feed a quantitative clinical measure. Dismissing is cheap, asserting is not.

### The denominator

If MPP is missing or implausible, every measurement tool, the counting frame and
mitotic density are disabled and the status bar says so. MPP is never estimated:
a wrong denominator produces a wrong density that looks exactly like a right one.

A model-proposed frame would render violet, dashed, and produce no number until
a pathologist accepts it. The membrane holds for geometry, not just for objects.

---

## Reaching the edge states

Every empty, loading and error surface in the spec is reachable.

| State | How |
| --- | --- |
| Worklist unavailable, with retry | `/library?state=error` |
| No cases assigned | `/library?state=empty` |
| Analysis failed, with reason and retry | `MOR-2026-00448`, slide A1 |
| Queued / analyzing | `MOR-2026-00445` |
| Out of model scope — neutral, not an error | `MOR-2026-00450` |
| Not available | `MOR-2026-00452` |
| Unsupported slide format | `MOR-2026-00391`, slide A4 |
| Partially analyzed | `MOR-2026-00421`, slide A3 |
| Finalized, read-only | `MOR-2026-00358` |
| Paused, with reason | `MOR-2026-00402` |
| Scale unavailable | any slide with `mpp: null` in `domain/cases.ts` |
| Tile failure, dark crosshatch + retry | stop the dev server mid-pan |
| Unsynced verdicts | go offline, then confirm a candidate |

Sessions persist in `localStorage` under `morpha.sessions.v1`. Clearing it resets
every case to its seeded state.

---

## Honesty about scope

Real sign-out is a regulated act involving authentication, amendment procedures
and LIS integration. MORPHA models it as a portfolio-level lock, and says so
rather than implying a validated clinical workflow. Nothing here is a medical
device and nothing here has been validated for clinical use.
