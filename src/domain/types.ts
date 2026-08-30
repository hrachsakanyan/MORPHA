import type { DISMISS_REASONS, QC_TYPES } from './constants'

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

/* ─────────────────────────── Case & slide ─────────────────────────── */

export type Laterality = 'LEFT' | 'RIGHT' | 'BILATERAL' | 'NOT APPLICABLE'
export type Priority = 'Routine' | 'Urgent' | 'STAT'

/** Five case states (B.2). The case never has an analysis state. */
export type CaseStatus = 'new' | 'in_review' | 'paused' | 'ready' | 'finalized'

/** Seven analysis states (B.2). They belong to the slide. */
export type AnalysisState =
  | 'not_available' | 'queued' | 'analyzing' | 'partially_analyzed'
  | 'complete' | 'failed' | 'out_of_scope'

export type QcState = 'clean' | 'flagged' | 'needs_attention'
export type QcType = (typeof QC_TYPES)[number]

/** Derived, never stored (B.2). */
export type ReadinessGlyph = 'ready' | 'partial' | 'working' | 'attention' | 'manual'

export interface SlideDef {
  id: string
  label: string          // A1, A2 …
  block: string
  stain: string
  level: string
  dzi: string | null     // null = image unavailable / unsupported format
  width: number
  height: number
  /** µm per pixel. null means measurement is disabled, never estimated (04). */
  mpp: number | null
  format: string
  formatSupported: boolean
  analysis: AnalysisState
  analysisFailReason?: string
  model?: { id: string; version: string; runAt: string }
  /** Deterministic seed for this slide's synthetic model output. */
  seed: number
  /** Synthetic-generation shape, so each slide reads differently. */
  synth?: SynthPlan
}

export interface SynthPlan {
  clusters: Array<{ type: CandidateType; members: number }>
  qc: Array<{ type: QcType; fraction: number }>
}

export interface CaseDef {
  id: string
  accession: string
  specimen: string
  laterality: Laterality
  procedure: string
  priority: Priority
  /** Initial status. The live status lives in the session once one exists. */
  status: CaseStatus
  pauseReason?: string
  receivedAt: string
  assignedTo: string
  clinicalNote: string
  slides: SlideDef[]
  lastActivity?: { at: string; by: string; what: string }
  /** Seeded read progress, so `Resume` has something to restore in the demo. */
  seededSession?: SeededSession
}

export interface SeededSession {
  activeSlideId: string
  coverage: Record<string, { orientation: number; diagnostic: number }>
  revealed: Record<string, boolean>
}

/* ─────────────────────────── Model output ─────────────────────────── */

export type CandidateType = 'mitotic_figure' | 'tumor_region' | 'necrosis' | 'cellular_density'
export type ScoreBand = 'high' | 'moderate' | 'low'

export interface Candidate {
  id: string
  slideId: string
  clusterId: string
  type: CandidateType
  /** Slide (level-0 image) coordinates. */
  x: number
  y: number
  /** Radius in image pixels. */
  r: number
  score: number
  band: ScoreBand
  /** Centroid falls inside a QC region — permanent (G.3). */
  qcAffected: boolean
}

export interface Cluster {
  id: string
  slideId: string
  type: CandidateType
  rank: number
  candidateIds: string[]
  bounds: Rect
  /** mm², from MPP. */
  areaMm2: number
  qcAffectedCount: number
}

export interface QcRegion {
  id: string
  slideId: string
  type: QcType
  polygon: Pt[]
  areaPx: number
}

/* ─────────────────────────── Human acts ─────────────────────────── */

export type VerdictKind = 'confirmed' | 'rejected' | 'reclassified'
export type DismissReason = (typeof DISMISS_REASONS)[number]

export type FindingType =
  | CandidateType
  | 'apoptotic_body' | 'hyperchromatic_nucleus' | 'artifact' | 'other'

export interface Verdict {
  id: string
  candidateId: string
  slideId: string
  kind: VerdictKind
  at: string
  by: string
  /** Present on `reclassified`. The original proposed type is on the candidate. */
  reclassifiedTo?: FindingType
  /** Present when the verdict came from `Dismiss cluster`. */
  bulkReason?: DismissReason
}

export type AnnotationKind =
  | 'point'        // pathologist-originated finding
  | 'polygon'      // marked region
  | 'unassessable' // marked region, type unassessable (G.4)
  | 'frame'        // counting frame
  | 'distance'
  | 'area'
  | 'text'

export interface Annotation {
  id: string
  slideId: string
  kind: AnnotationKind
  points: Pt[]
  label: string
  /** Only on `point`: the finding type the pathologist asserted. */
  findingType?: FindingType
  createdAt: string
  by: string
  /** Magnification at which it was authored — fly-back restores this. */
  mag: number
}

/** Derived from verdicts and point annotations. Never stored. */
export interface Finding {
  id: string
  slideId: string
  type: FindingType
  origin: 'confirmed_candidate' | 'reclassified_candidate' | 'pathologist'
  x: number
  y: number
  r: number
  at: string
  by: string
  qcAffected: boolean
  candidateId?: string
  /** Present on reclassified findings — what the model originally proposed (E.4). */
  proposedType?: CandidateType
  mag: number
}

/* ─────────────────────────── Workspace modes ─────────────────────────── */

export type SpatialState = 'orientation' | 'inspection'
export type ToolState = 'navigate' | 'review' | 'annotate' | 'measure' | 'frame'
export type PanelContext = 'candidates' | 'findings' | 'density' | 'slideinfo'
export type ToolId = 'point' | 'polygon' | 'frame' | 'distance' | 'area' | 'text'

export interface LayerConfig {
  tissueMask: boolean
  qc: boolean
  coverage: boolean
  findings: boolean
  marked: boolean
  clusters: boolean
  candidates: boolean
  rejected: boolean
  frames: boolean
  measurements: boolean
}

export interface Viewport {
  /** Centre in image coordinates. */
  x: number
  y: number
  /** Screen pixels per image pixel. mag = BASE_OBJECTIVE * imageZoom. */
  imageZoom: number
}

export interface SlideSessionState {
  viewport: Viewport | null
  spatial: SpatialState
  revealed: boolean
  /** Base64 of a GRID_W × gridH Uint8Array: 0 unseen · 1 orientation · 2 diagnostic. */
  coverage: string | null
  /**
   * A seeded read that has not been materialised yet. The grid needs the tissue
   * mask, which only exists once the slide's pyramid has been read, so the
   * targets are held here until then.
   */
  pendingSeed: { orientation: number; diagnostic: number } | null
  /**
   * Cached coverage percentages. Derived from the grid, but kept alongside it so
   * the worklist can show per-slide progress without reading every pyramid.
   */
  stats: { orientation: number; diagnostic: number; unassessable: number } | null
  lastCandidateId: string | null
  dismissedQcIds: string[]
  returnMarker: Viewport | null
}

export interface CaseSession {
  caseId: string
  status: CaseStatus
  pauseReason?: string
  createdAt: string
  updatedAt: string
  by: string
  activeSlideId: string
  perSlide: Record<string, SlideSessionState>
  verdicts: Verdict[]
  annotations: Annotation[]
  layers: LayerConfig
  panel: PanelContext
  tool: ToolState
  activeToolId: ToolId | null
  openItemsAcknowledged: boolean
  /** Verdicts and geometry not yet accepted by the server (L). */
  unsynced: number
}
