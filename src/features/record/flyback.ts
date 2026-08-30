import type { LayerConfig } from '@/domain/types'

/**
 * Which layers each kind of Record element forces visible on fly-back (§J.4).
 *
 * "Required layers are forced visible — clicking a rejected count turns on the
 * rejected layer even if the reader had it off. A fly-back that lands on
 * invisible evidence is a broken link."
 *
 * These live here, apart from the JSX, so the rule is one declaration the
 * Record reads and the verification suite can assert against. A layer set that
 * drifts out of agreement with the spec is otherwise invisible until someone
 * clicks the link and lands on nothing.
 */
export const FLYBACK_LAYERS = {
  /** Mitotic density → the counting frame with its contributing findings. */
  density: { frames: true, findings: true },
  /** `n confirmed` → the frame, findings on. */
  confirmed: { findings: true },
  /** `n rejected` → the frame, with the rejected layer forced on. */
  rejectedInFrame: { findings: true, rejected: true },
  /** A finding, or a whole type group → findings on. */
  finding: { findings: true },
  /** Authored geometry → every authored layer, whatever kind it turns out to be. */
  geometry: { marked: true, frames: true, measurements: true },
  /** The rejected ledger → rejected and candidate layers on. */
  rejected: { rejected: true, candidates: true },
  /** A coverage figure → the coverage veil on. */
  coverage: { coverage: true },
  /** A QC or unassessable figure → the QC layer on. */
  qc: { qc: true },
} satisfies Record<string, Partial<LayerConfig>>

export type FlybackKind = keyof typeof FLYBACK_LAYERS
