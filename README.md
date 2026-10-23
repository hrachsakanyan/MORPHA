<div align="center">

# MORPHA 

### A reading instrument for digital pathology that AI accelerates — not an AI product with a viewer attached.

<p>
  <img alt="React 19" src="https://img.shields.io/badge/React-19-1b1520?style=flat-square&logo=react&logoColor=4cc9b0" />
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-1b1520?style=flat-square&logo=typescript&logoColor=4cc9b0" />
  <img alt="Vite 6" src="https://img.shields.io/badge/Vite-6-1b1520?style=flat-square&logo=vite&logoColor=a46fc4" />
  <img alt="OpenSeadragon 5" src="https://img.shields.io/badge/OpenSeadragon-5.0-1b1520?style=flat-square" />
  <img alt="Zustand 5" src="https://img.shields.io/badge/Zustand-5-1b1520?style=flat-square" />
  <img alt="312 checks passing" src="https://img.shields.io/badge/verification-312%20checks-4cc9b0?style=flat-square" />
</p>

<img src="screenshots/Screenshot%202026-09-01%20112005.png" width="100%" alt="The MORPHA workspace: a real breast H&E whole-slide image at 10x, with the slide map, the layer rail grouped by evidence register, and the candidates panel" />

<sub><b>The workspace.</b> A real 122,807 × 71,603 px breast H&E section at 10×, the slide map and coverage trace at left, the analysis panel at right — and the tissue never leaves the screen.</sub>

</div>

---

## Contents

- [About](#about)
- [What is real and what is not](#what-is-real-and-what-is-not)
- [Key features](#key-features)
- [The workflow](#the-workflow)
- [The evidence membrane](#the-evidence-membrane)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Keyboard](#keyboard)
- [Reaching the edge states](#reaching-the-edge-states)
- [Implementation notes](#implementation-notes)
- [Verification](#verification)
- [Scope and honesty](#scope-and-honesty)

---

## About

A pathologist reading a slide for mitotic count is doing three things at once: covering the tissue systematically, deciding what each object is, and turning those decisions into a number that goes in a report. Most "AI pathology" tools optimise the middle step and quietly damage the other two — they present a model's output as a conclusion, and the number that comes out the far end has no traceable relationship to anything a human actually looked at.

MORPHA is built the other way round. The reader reads first. The model's proposals are **suppressed** until coverage crosses a threshold. Everything the model says is rendered in a colour that means *inferred, not yet believed*, and it stays that colour until a human confirms it. The final density is a fraction whose numerator is confirmed findings and whose denominator is a region a pathologist drew — and clicking that number flies the viewport back to the exact tissue it came from.

This repository is the **Phase 2 web demo**: real whole-slide imaging, real measurement, synthetic model output, and the complete evidence loop from tissue to a number and back to tissue.

---

## What is real and what is not

The distinction is load-bearing, so it is stated up front rather than buried.

| Real | Synthetic |
| :--- | :--- |
| The slide — TCGA-AN-A0FL, breast H&E, 122,807 × 71,603 px | Candidate objects and clusters |
| The scale — 0.248 µm/px, scanner-reported | Scan QC regions |
| The tissue mask, read from pyramid level 11 at load time | Slide metadata and case states |
| Every measurement — areas, distances, mitotic density | The worklist |
| The coverage trace | |

**There is no inference anywhere in this codebase, and the product never claims there is.** Model output is generated from a per-slide seed, is byte-identical on every load, and is anchored to the real tissue mask so candidates land on tissue rather than on glass.

Every slide in the worklist renders the same image. The metadata, states and model output differ; the pixels do not.

---

## Key features

| Feature | What it means |
| :--- | :--- |
| **Real whole-slide imaging** | An 18-level Deep Zoom pyramid of 182,164 tiles streamed off disk, driven by OpenSeadragon at up to 40×. |
| **Read-first gating** | Candidates are withheld until orientation coverage crosses 60%. The reader forms an impression before the model gets a vote. |
| **The evidence membrane** | Violet is what a model inferred. Teal is what a human confirmed or drew. Nothing else in the product is violet. |
| **Derived, never stored** | Findings, the verification ledger and case readiness are computed from verdicts and geometry on every read. They cannot drift. |
| **A coverage trace, not surveillance** | A union over tissue cells at two magnification tiers. Dwell time, view counts and reading speed are deliberately never recorded. |
| **Honest measurement** | If scanner MPP is missing or implausible, every measurement tool disables itself and says so. MPP is never estimated. |
| **Closed traceability** | Every number in the Record links back to the tissue that produced it, with an animated fly-back to the exact viewport. |
| **Keyboard-first review** | A reader dispositioning two hundred objects touches the mouse only to annotate. |

---

## The workflow

### 1 · The worklist

Ten cases across every state the specification defines — new, in review, paused with a reason, ready for assessment, finalized. Readiness glyphs summarise per-slide analysis state without claiming the case has one, and rows expand inline rather than navigating away.

<img src="screenshots/Screenshot%202026-09-01%20111943.png" width="100%" alt="The MORPHA library: a worklist of ten breast pathology cases with accession, specimen, procedure, priority, case status, slide readiness glyphs, review progress and assignment" />

<br />

### 2 · The read

Opening a case lands in the workspace. The slide map carries the tissue substrate and the coverage veil; the left rail groups layers by evidence register; the status bar reports magnification, scale bar, cursor position in slide coordinates, coverage at both tiers, active tool and sync state.

The panel on the right is showing the honest empty state here — this slide's analysis run has not completed, so there is nothing to offer and the panel says exactly that.

<table>
<tr>
<td width="50%" valign="top" align="center">
<img src="screenshots/Screenshot%202026-09-01%20112350.png" width="100%" alt="Slide strip and slide map: four slides with readiness glyphs, and a map showing the tissue mask with the coverage veil lifted from 51 percent of the section" />
<br /><sub><b>Coverage lifts a veil.</b> The system does not paint where you have been — it clears the veil from where you have looked. 51% of this section, at orientation tier.</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="screenshots/Screenshot%202026-09-01%20112101.png" width="100%" alt="The candidates panel: mitotic figure and tumour region clusters, each with rank, candidate count, area, score band distribution and review progress" />
<br /><sub><b>Candidates arrive as clusters</b>, ranked, with score bands and review progress. <code>Dismiss</code> requires a reason chip; bulk confirm is not offered anywhere.</sub>
</td>
</tr>
</table>

<br />

### 3 · The membrane

Selecting a cluster and entering review flies the viewport to each candidate at 40× in turn. The proposal is drawn as a **dashed violet** circle — the model's register — and the verification control offers one object at a time.

Confirming is always individual, because confirming creates a finding that feeds a quantitative clinical measure. Dismissing is cheap; asserting is not.

<div align="center">
<img src="screenshots/Screenshot%202026-09-01%20112132.png" width="100%" alt="Candidate review at 40x: a mitotic figure proposal drawn as a dashed violet reticle, with Confirm, Reject and Reclassify actions and their keyboard shortcuts, showing object 1 of 11" />
</div>

<sub><b>One object, one decision.</b> <code>C</code> confirm · <code>X</code> reject · <code>R</code> reclassify · <code>Space</code> next unreviewed. The counter reads <code>1 / 11</code> and verdict history is retained — a candidate confirmed and later rejected shows both acts.</sub>

<br />

### 4 · The number

Press <kbd>F</kbd> and drag a counting frame. The frame is **teal** — a human drew it — and the density resolves live as it is sized.

The panel shows the whole fraction rather than only its result: confirmed mitoses over measured counting area, the area computed from the scanner-reported 0.248 µm/px, QC-excluded area subtracted and reported separately, and the model version and author recorded beside it.

<div align="center">
<img src="screenshots/Screenshot%202026-09-01%20112220.png" width="100%" alt="The density panel: a teal counting frame drawn on tissue at high magnification, with confirmed mitoses over measured counting area resolving to a mitoses per square millimetre figure, and provenance rows for frame, findings within frame, frame area, excluded area, model and author" />
</div>

<sub><b>Both halves are human.</b> Captured immediately after the frame was drawn — the numerator is <code>0</code> because nothing inside it has been confirmed yet. The number is not withheld and not faked; it is simply what the evidence currently says.</sub>

<br />

### 5 · The Record

The Record is the case's evidence stream — the density, the findings grouped by type and origin, the annotation ledger and the verdict history, with a context rail carrying per-slide coverage and open items.

Clicking the density flies back to the counting frame that produced it. That is the loop closing: **tissue → decision → number → tissue.**

---

## The evidence membrane

One rule, applied without exception, is what makes the interface readable at a glance:

| Register | Colour | Meaning |
| :--- | :--- | :--- |
| **Inferred** | Violet `#a46fc4` | A model proposed this. Not yet believed. |
| **Measured** | Teal `#4cc9b0` | A human confirmed or drew this. |
| **Dismissed** | Neutral `#6b6270` | Rejected, and retained rather than deleted. |
| **Advisory** | Amber `#f2c14e` | Scan quality — a property of the image, not the tissue. |

The layer panel is grouped by register, so the grouping *is* the legend. The membrane holds for geometry as well as for objects: a model-proposed counting frame renders violet and dashed, and produces no number at all until a pathologist accepts it.

---

## Tech stack

| Layer | Choice | Why |
| :--- | :--- | :--- |
| **UI** | React 19 + TypeScript 5.9 | Strict mode, project references, no `any` in domain code |
| **Build** | Vite 6 | Plus a custom middleware that streams the tile pyramid off disk |
| **Slide viewer** | OpenSeadragon 5.0 | Deep Zoom over the real pyramid, with canvas overlays for evidence geometry |
| **State** | Zustand 5 | Three separate stores: persisted sessions, transient UI, live instrument readout |
| **Routing** | React Router 7 | Three routes, maximum depth 2 |
| **Overlays** | Canvas 2D | Hand-drawn, screen-space constant stroke, under a cumulative opacity budget |
| **Styling** | Plain CSS + design tokens | No framework; colour is never written as raw hex outside `tokens.css` |

**Five runtime dependencies, total.** No UI kit, no component library, no animation library, no charting library. Every transition, overlay and glyph in the screenshots above is hand-built.

---

## Project structure

Two navigation systems, deliberately separated. **Routes** change which case you are working on. **Workspace modes** change what you are doing to the case already open — they are not routes, nothing unmounts, and the tissue never leaves the screen.

```
/library                worklist, the entry point
/case/:id               the read
/case/:id/record        the evidence
```

```
src/
├── domain/                 the product, independent of React
│   ├── constants.ts          every closed parameter in one place
│   ├── types.ts              cases, slides, model output, human acts, modes
│   ├── cases.ts              the demo worklist
│   ├── tissue.ts             pyramid → map substrate + tissue mask
│   ├── synth.ts              seeded model output, anchored to real tissue
│   ├── coverage.ts           the trace: union over tissue cells, two tiers
│   ├── density.ts            numerator / denominator / result
│   └── derive.ts             findings, ledger, readiness — computed, never stored
├── state/
│   ├── store.ts              sessions, persisted to localStorage
│   ├── ui.ts                 transient workspace state, never restored
│   ├── view.ts               the live instrument readout
│   └── coverageRegistry.ts   live grids, held outside React
├── features/
│   ├── boot/                 the entry sequence
│   ├── library/              worklist, inline row expansion
│   ├── workspace/            shell, map, microscope, rails, panels, verification
│   └── record/               evidence stream, context rail, fly-back
├── lib/                    geometry, seeded RNG, formatting, ids
└── styles/                 tokens and base
```

---

## Getting started

### Prerequisites

- **Node.js 20+** and npm
- **~2.5 GB of free disk** for the slide and its pyramid
- **[libvips](https://www.libvips.org/)** — only to build the pyramid once

### 1 · Install

```bash
git clone <your-repo-url> MORPHA
cd MORPHA
npm install
```

### 2 · Provide the slide

`data/` is gitignored: the source image is ~1 GB and the pyramid is 1.4 GB across 182,164 tiles. Both are derived, reproducible, and must never enter version history.

Download the diagnostic slide **`TCGA-AN-A0FL-01Z-00-DX1`** from the [GDC Data Portal](https://portal.gdc.cancer.gov/) and place the `.svs` in `data/wsi/`, then build the Deep Zoom pyramid:

```bash
vips dzsave data/wsi/TCGA-AN-A0FL-*.svs data/dzi/morpha-slide
```

libvips defaults already match what the app expects — 254 px tiles, 1 px overlap, JPEG. The result must be laid out exactly like this:

```
data/
├── wsi/
│   └── TCGA-AN-A0FL-…svs
└── dzi/
    ├── morpha-slide.dzi                     Width=122807  Height=71603
    └── morpha-slide_files/
        ├── 0/ … 17/                         18 levels
        └── <level>/<x>_<y>.jpeg
```

<details>
<summary><b>Confirming the slide metadata (optional)</b></summary>

<br />

`check_wsi.py` reads dimensions, level count and scanner-reported MPP straight from the SVS. It needs Python with `openslide-python`:

```bash
python check_wsi.py
```

The app takes 0.248 µm/px from `domain/cases.ts`; this is how you verify that value against the file itself.

</details>

### 3 · Run

```bash
npm run dev          # http://localhost:5173
```

The pyramid is streamed straight off disk by a Vite middleware in **both dev and preview** — nothing is copied into `public/` or `dist/`, and nothing needs to be moved before running.

| Script | What it does |
| :--- | :--- |
| `npm run dev` | Dev server on port 5173, bound to every interface |
| `npm run build` | Type-check the project references, then build |
| `npm run preview` | Serve the production build, tiles included |
| `npm run typecheck` | `tsc -b` across all three project references |
| `npm run verify` | The domain verification suite — 312 assertions |

### Where to start

`MOR-2026-00421` ships with a seeded read session: slide A2 sits at 72% orientation coverage with candidates still suppressed, so **Resume** lands exactly on the read-first moment.

`MOR-2026-00437` starts from zero if you want to walk the whole path.

Sessions persist in `localStorage` under `morpha.sessions.v1`. Clearing that key resets every case to its seeded state.

---

## Keyboard

The keyboard path is primary, not a power-user affordance.

| Key | Action |
| :--- | :--- |
| <kbd>Space</kbd> / <kbd>Shift</kbd>+<kbd>Space</kbd> | next unreviewed candidate / previous |
| <kbd>→</kbd> | next including reviewed, for re-checking |
| <kbd>C</kbd> <kbd>X</kbd> <kbd>R</kbd> | confirm · reject · reclassify |
| <kbd>1</kbd>–<kbd>4</kbd> | select a reclassification (chip strip open) |
| <kbd>1</kbd>–<kbd>9</kbd> | jump to cluster *n* |
| <kbd>Tab</kbd> | next cluster — never auto-enters review |
| <kbd>Z</kbd> | undo verdict |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> | undo geometry — a separate stack, deliberately |
| <kbd>\\</kbd> *(hold)* | clear every overlay |
| <kbd>Esc</kbd> | cancel · exit review · return to orientation |
| <kbd>Enter</kbd> | descend from the reticle, or return to the departed viewport |
| <kbd>[</kbd> <kbd>]</kbd> | previous / next slide |
| <kbd>+</kbd> <kbd>−</kbd> | zoom — <kbd>Alt</kbd>+<kbd>1</kbd>–<kbd>5</kbd> for 2× 4× 10× 20× 40× |
| <kbd>P</kbd> <kbd>G</kbd> <kbd>F</kbd> <kbd>D</kbd> <kbd>A</kbd> <kbd>T</kbd> | point · polygon · frame · distance · area · label |

---

## Reaching the edge states

Every empty, loading and error surface in the specification is reachable in the demo — they are built, not described.

| State | How to reach it |
| :--- | :--- |
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
| Tile failure — dark crosshatch, with retry | stop the dev server mid-pan |
| Unsynced verdicts | go offline, then confirm a candidate |

---

## Implementation notes

<details open>
<summary><b>Derived, never stored</b></summary>

<br />

Findings, the verification ledger and the case readiness glyph are computed from verdicts and geometry every time they are read. They cannot drift out of agreement with the acts that produced them.

Verdict history is retained rather than overwritten: a candidate confirmed and then rejected shows both acts, in order.

</details>

<details>
<summary><b>The coverage trace</b></summary>

<br />

A union over tissue cells on a 192-column grid — per slide, per pathologist, at two tiers: orientation at ≥2× and diagnostic at ≥10×. Revisiting adds nothing.

Dwell duration, view counts and reading speed are deliberately not recorded anywhere. Those would be surveillance metrics with no clinical purpose, and their absence is a product commitment rather than an omission.

The denominator is tissue area minus QC-excluded area. Unassessable area is reported separately and never folded into uncovered tissue — out-of-focus tissue is the scan's failure, not the reader's.

</details>

<details>
<summary><b>The denominator</b></summary>

<br />

If MPP is missing or implausible, every measurement tool, the counting frame and mitotic density are disabled, and the status bar says why.

MPP is never estimated. A wrong denominator produces a wrong density that looks exactly like a right one.

</details>

<details>
<summary><b>Streaming 182,164 tiles</b></summary>

<br />

The pyramid is served by a Vite plugin registered on **both** the dev and preview servers, with path-traversal rejection, correct MIME types and immutable caching. A missing tile returns 404 rather than crashing — the viewer must survive it, and the slide map simply leaves a gap.

Two things the dev server needs to be told, both learned the hard way and documented in `vite.config.ts`:

- `server.watch.ignored` must exclude `data/`. Letting the watcher crawl 182,166 files costs hundreds of megabytes and stalls request handling outright — the server accepts connections and then never answers.
- `server.host: true`. Windows resolves `localhost` to `::1` first, and an IPv4-only bind leaves the browser stalling on a dead IPv6 socket, which looks exactly like a dead server.

</details>

<details>
<summary><b>The rendering budget</b></summary>

<br />

Cumulative overlay alpha over any tissue pixel may not exceed 20%. When the active layer combination would exceed it, fills drop out and layers degrade to stroke-only.

It is a rendering constraint enforced in `features/workspace/paint.ts`, not a guideline — the tissue has to stay readable underneath the evidence drawn on it.

</details>

<details>
<summary><b>The entry sequence</b></summary>

<br />

`features/boot/` plays the product's founding rule once before the application appears: a graticule resolves over a specimen, a read passes across it row by row uncovering tissue, and only after coverage crosses the reveal threshold does the model place proposals — violet, until two of them are confirmed and redrawn teal.

The tissue is a block of tiles from the same pyramid the workspace streams. The whole sequence is CSS off a single declared timeline, it is skippable with any key or click, and it honours `prefers-reduced-motion` by showing the finished composition immediately.

</details>

---

## Verification

```bash
npm run verify
```

A domain-level suite of **312 assertions** covering seeded model output, the coverage trace, verdicts and the derived ledger, mitotic density, counting-frame handles and live resize, model-proposed frames, polygon vertex editing, superseded candidates, model provenance, tile retry, QC geometry, readiness glyphs and the worklist.

It runs on Node with no test framework: `scripts/verify.mjs` bundles `scripts/verify.ts` with esbuild — already present as a Vite dependency — through the same `@` alias the app uses, so the assertions run against the real domain modules rather than copies.

The suite asserts *properties*, not snapshots. Density is checked against the fraction it claims to be; coverage is checked for idempotence under revisiting; the evidence membrane is checked structurally, so a violet stroke on measured geometry fails the build rather than shipping.

---

## Scope and honesty

Real sign-out is a regulated act involving authentication, amendment procedures and LIS integration. MORPHA models it as a portfolio-level lock and **says so**, rather than implying a validated clinical workflow.

Nothing here is a medical device. Nothing here has been validated for clinical use.

The whole-slide image is from **[The Cancer Genome Atlas](https://portal.gdc.cancer.gov/)** (TCGA-BRCA), used under its public data-access terms.

---

## Roadmap

Deliberately deferred rather than missing — each is scoped in `docs/spec-phase2-IA.md`:

- **Undo history for geometry reshapes** — vertex edits currently commit to the geometry stack as a whole
- **Multi-slide density** — the measure is per-slide by design; aggregating it is a clinical decision, not a UI one
- **Real analysis backend** — the synthetic layer is deliberately isolated behind `domain/synth.ts` and swappable for a real inference service without touching the evidence loop

---

<div align="center">

**Hrach Sakanyan**

Product design, interaction design and implementation.

Built as a portfolio demonstration of digital pathology reading tools.

<sub><i>Dr. A. Sakanyan is the demo persona shown inside the application, not the author.</i></sub>

</div>
