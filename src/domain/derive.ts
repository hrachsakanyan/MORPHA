import type {
  Annotation, CandidateType, CaseDef, Finding, FindingType, ReadinessGlyph,
  QcState, SlideDef, Verdict, VerdictKind,
} from './types'
import type { SlideModelOutput } from './synth'

/**
 * Everything derived. Findings, the verification ledger and the readiness glyph
 * are computed from verdicts and geometry — never stored, so they can never drift
 * out of agreement with the acts that produced them.
 */

/** The act currently in force for each candidate. History is kept; this is the head. */
export function latestVerdicts(verdicts: Verdict[]): Map<string, Verdict> {
  const map = new Map<string, Verdict>()
  for (const v of verdicts) map.set(v.candidateId, v)
  return map
}

export function verdictHistory(verdicts: Verdict[], candidateId: string): Verdict[] {
  return verdicts.filter((v) => v.candidateId === candidateId)
}

export function verdictOf(verdicts: Verdict[], candidateId: string): Verdict | undefined {
  for (let i = verdicts.length - 1; i >= 0; i--) {
    if (verdicts[i].candidateId === candidateId) return verdicts[i]
  }
  return undefined
}

export function findingsForSlide(
  slideId: string,
  model: SlideModelOutput,
  verdicts: Verdict[],
  annotations: Annotation[],
): Finding[] {
  const out: Finding[] = []
  const heads = latestVerdicts(verdicts.filter((v) => v.slideId === slideId))

  for (const [candidateId, v] of heads) {
    const c = model.byId.get(candidateId)
    if (!c) continue
    if (v.kind === 'rejected') continue
    if (v.kind === 'confirmed') {
      out.push({
        id: 'F-' + candidateId, slideId, type: c.type, origin: 'confirmed_candidate',
        x: c.x, y: c.y, r: c.r, at: v.at, by: v.by, qcAffected: c.qcAffected,
        candidateId, mag: 40,
      })
    } else if (v.kind === 'reclassified' && v.reclassifiedTo) {
      out.push({
        id: 'F-' + candidateId, slideId, type: v.reclassifiedTo, origin: 'reclassified_candidate',
        x: c.x, y: c.y, r: c.r, at: v.at, by: v.by, qcAffected: c.qcAffected,
        candidateId, proposedType: c.type, mag: 40,
      })
    }
  }

  for (const a of annotations) {
    if (a.slideId !== slideId || a.kind !== 'point' || !a.findingType) continue
    const p = a.points[0]
    out.push({
      id: 'F-' + a.id, slideId, type: a.findingType, origin: 'pathologist',
      x: p.x, y: p.y, r: 60, at: a.createdAt, by: a.by, qcAffected: false, mag: a.mag,
    })
  }

  return out
}

export interface Ledger {
  proposed: number
  confirmed: number
  rejected: number
  reclassified: number
  unreviewed: number
}

export function ledgerFor(model: SlideModelOutput, verdicts: Verdict[], slideId: string): Ledger {
  const heads = latestVerdicts(verdicts.filter((v) => v.slideId === slideId))
  let confirmed = 0, rejected = 0, reclassified = 0
  for (const c of model.candidates) {
    const v = heads.get(c.id)
    if (!v) continue
    if (v.kind === 'confirmed') confirmed++
    else if (v.kind === 'rejected') rejected++
    else reclassified++
  }
  return {
    proposed: model.candidates.length,
    confirmed,
    rejected,
    reclassified,
    unreviewed: model.candidates.length - confirmed - rejected - reclassified,
  }
}

export function addLedgers(a: Ledger, b: Ledger): Ledger {
  return {
    proposed: a.proposed + b.proposed,
    confirmed: a.confirmed + b.confirmed,
    rejected: a.rejected + b.rejected,
    reclassified: a.reclassified + b.reclassified,
    unreviewed: a.unreviewed + b.unreviewed,
  }
}

export const EMPTY_LEDGER: Ledger = {
  proposed: 0, confirmed: 0, rejected: 0, reclassified: 0, unreviewed: 0,
}

/**
 * Derived case readiness (B.2). The case never has an analysis state; this glyph
 * summarises the slides honestly without collapsing the detail.
 */
export function readinessGlyph(slides: SlideDef[]): ReadinessGlyph {
  const inScope = slides.filter(
    (s) => s.analysis !== 'out_of_scope' && s.analysis !== 'not_available',
  )
  if (inScope.length === 0) return 'manual'
  if (inScope.some((s) => s.analysis === 'failed')) return 'attention'
  if (inScope.some((s) => s.analysis === 'queued' || s.analysis === 'analyzing')) return 'working'
  if (inScope.every((s) => s.analysis === 'complete')) return 'ready'
  return 'partial'
}

export const READINESS_LABEL: Record<ReadinessGlyph, string> = {
  ready: 'Ready',
  partial: 'Partial',
  working: 'Working',
  attention: 'Attention',
  manual: 'Manual',
}

/** Fixed clinical grouping order for findings and clusters. */
export const TYPE_ORDER: FindingType[] = [
  'mitotic_figure', 'tumor_region', 'necrosis', 'cellular_density',
  'apoptotic_body', 'hyperchromatic_nucleus', 'artifact', 'other',
]

export function groupFindings(findings: Finding[]): Array<{ type: FindingType; items: Finding[] }> {
  const byType = new Map<FindingType, Finding[]>()
  for (const f of findings) {
    const list = byType.get(f.type)
    if (list) list.push(f)
    else byType.set(f.type, [f])
  }
  return [...byType.entries()]
    .sort((a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]))
    .map(([type, items]) => ({ type, items }))
}

export function originCounts(items: Finding[]) {
  return {
    fromCandidates: items.filter(
      (f) => f.origin === 'confirmed_candidate' || f.origin === 'reclassified_candidate',
    ).length,
    pathologist: items.filter((f) => f.origin === 'pathologist').length,
  }
}

export function caseHasAnalysis(c: CaseDef): boolean {
  return c.slides.some((s) => s.analysis === 'complete' || s.analysis === 'partially_analyzed')
}

export const VERDICT_LABEL: Record<VerdictKind, string> = {
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  reclassified: 'Reclassified',
}

export const CANDIDATE_TYPES: CandidateType[] = [
  'mitotic_figure', 'tumor_region', 'necrosis', 'cellular_density',
]

/**
 * QC state computable without reading the pyramid — the worklist needs it for
 * every case and must not load ten gigapixel images to draw a glyph.
 */
export function slideQcState(slide: SlideDef): QcState {
  const regions = slide.synth?.qc ?? []
  if (regions.length === 0) return 'clean'
  const fraction = regions.reduce((s, r) => s + r.fraction, 0)
  return fraction >= 0.15 ? 'needs_attention' : 'flagged'
}

export function caseQcState(slides: SlideDef[]): QcState {
  let worst: QcState = 'clean'
  for (const s of slides) {
    const q = slideQcState(s)
    if (q === 'needs_attention') return 'needs_attention'
    if (q === 'flagged') worst = 'flagged'
  }
  return worst
}
