/**
 * Constants closed in Phase 1 / Phase 2. These are parameters, not architecture —
 * changing one here changes it everywhere.
 */

/** Objective power that corresponds to 1 screen pixel per image pixel. */
export const BASE_OBJECTIVE = 40

/** Magnification presets — pathology assessment is magnification-conventional. */
export const MAG_PRESETS = [2, 4, 10, 20, 40] as const

/** Coverage tiers (F.2). Final: diagnostic tier ships at 10x. */
export const ORIENTATION_TIER = 2
export const DIAGNOSTIC_TIER = 10

/** Final: dwell_time = disabled. Coverage accrues on viewport settle, not on a timer. */
export const DWELL_MS = 0

/** Final: reveal_threshold = 60% orientation coverage. */
export const REVEAL_THRESHOLD = 0.6

/** Final: finding_aggregation_threshold = 40 (map rule 2). */
export const FINDING_AGGREGATION_THRESHOLD = 40

/** Individual candidates are microscope-only above this magnification. Hard threshold. */
export const CANDIDATE_MAG_THRESHOLD = 10

/** Fixed magnification the reader is flown to when stepping candidates. */
export const REVIEW_MAG = 40

/** Magnification a map double-click descends to. */
export const DESCENT_MAG = 10

/** Map rule 3 — cumulative overlay alpha over any tissue pixel. Rendering constraint. */
export const OPACITY_BUDGET = 0.2

/** Minimum on-map render size of the viewport rectangle before it clamps to a crosshair. */
export const VIEWPORT_RECT_MIN_PX = 8

/** Coverage / tissue-mask grid resolution over the whole slide. */
export const GRID_W = 192

/** Deep Zoom pyramid level used to build the map substrate and the tissue mask. */
export const THUMB_LEVEL = 11

/** Transition durations (§C.5, §E.2). */
export const T_DESCENT_MS = 420
export const T_RECENTRE_MS = 200
export const T_VERDICT_MS = 180

/** QC region types (G.2). */
export const QC_TYPES = ['focus', 'fold', 'bubble', 'pen', 'incomplete', 'edge'] as const

/** Reason chips required by a bulk dismissal (D.3). */
export const DISMISS_REASONS = [
  'Artifact',
  'Not mitotic',
  'Outside tumor',
  'Counted elsewhere',
  'Other',
] as const

/** Reclassification targets offered by the chip strip (E.4). */
export const RECLASSIFY_TARGETS = [
  'apoptotic_body',
  'hyperchromatic_nucleus',
  'artifact',
  'other',
] as const

/** Pause reasons — Paused is a real pathology state and carries a mandatory reason. */
export const PAUSE_REASONS = [
  'Pending deeper levels',
  'Pending IHC',
  'Pending clinical correlation',
  'Pending second opinion',
] as const

export const CURRENT_USER = 'Dr. A. Sakanyan'
