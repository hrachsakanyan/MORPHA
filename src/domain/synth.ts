import { REVIEW_MAG } from './constants'
import { gaussian, mulberry32 } from '@/lib/rng'
import { boundsOf, pointInPolygon, polygonArea } from '@/lib/geometry'
import type {
  Candidate, CandidateType, Cluster, Pt, ProposedFrame, QcRegion, QcState, ScoreBand, SlideDef,
} from './types'
import type { TissueData } from './tissue'

/**
 * Synthetic model output.
 *
 * There is no inference here and the product never claims there is. What matters
 * for the demo is that the output is (a) deterministic per slide, (b) anchored to
 * real tissue rather than floating over glass, and (c) shaped like a real model's
 * output — a few dense hotspots and a long tail, not a uniform scatter.
 */

export interface SlideModelOutput {
  candidates: Candidate[]
  clusters: Cluster[]
  qcRegions: QcRegion[]
  byId: Map<string, Candidate>
  /** Fraction of tissue area flagged unassessable by scan QC. */
  unassessableFraction: number
  /** A hotspot counting frame the model offers (§I.5). Never a measurement. */
  proposedFrame: ProposedFrame | null
  /**
   * Candidates from the run this analysis replaced (§K.3).
   *
   * Deliberately a separate list, never merged into `candidates`. Everything
   * that counts, adjudicates or derives — the ledger, findings, the reveal
   * gate, the density numerator — reads `candidates`, so a superseded object
   * cannot become a finding or move a number by construction rather than by a
   * filter somebody has to remember to write.
   */
  supersededCandidates: Candidate[]
}

const EMPTY: SlideModelOutput = {
  candidates: [], clusters: [], qcRegions: [], byId: new Map(), unassessableFraction: 0,
  proposedFrame: null, supersededCandidates: [],
}

/** Fixed clinical sort order (D.2). Never sorted by model score. */
const TYPE_ORDER: CandidateType[] = ['mitotic_figure', 'tumor_region', 'necrosis', 'cellular_density']

/** Object radius in micrometres, by type — a mitosis is a nucleus, a tumor region is a field. */
const RADIUS_UM: Record<CandidateType, number> = {
  mitotic_figure: 9,
  tumor_region: 220,
  necrosis: 160,
  cellular_density: 130,
}

const cache = new Map<string, SlideModelOutput>()

export function modelOutput(slide: SlideDef, tissue: TissueData | null): SlideModelOutput {
  if (!tissue) return EMPTY
  const key = slide.id + ':' + tissue.gridW + 'x' + tissue.gridH + ':' + tissue.tissueCells
  const hit = cache.get(key)
  if (hit) return hit
  const out = generate(slide, tissue)
  cache.set(key, out)
  return out
}

function tissueCellIndices(tissue: TissueData): number[] {
  const idx: number[] = []
  for (let i = 0; i < tissue.mask.length; i++) if (tissue.mask[i]) idx.push(i)
  return idx
}

function cellCentre(tissue: TissueData, i: number): Pt {
  const gx = i % tissue.gridW
  const gy = Math.floor(i / tissue.gridW)
  return { x: (gx + 0.5) * tissue.cellW, y: (gy + 0.5) * tissue.cellH }
}

function isTissueAt(tissue: TissueData, p: Pt): boolean {
  const gx = Math.floor(p.x / tissue.cellW)
  const gy = Math.floor(p.y / tissue.cellH)
  if (gx < 0 || gy < 0 || gx >= tissue.gridW || gy >= tissue.gridH) return false
  return tissue.mask[gy * tissue.gridW + gx] === 1
}

function bandOf(score: number): ScoreBand {
  return score >= 0.78 ? 'high' : score >= 0.55 ? 'moderate' : 'low'
}

function generate(slide: SlideDef, tissue: TissueData): SlideModelOutput {
  const rand = mulberry32(slide.seed)
  const cells = tissueCellIndices(tissue)
  const qcRegions = generateQc(slide, tissue, rand, cells)

  // QC is a property of the image and exists whether or not analysis ran.
  const tissueArea = tissue.tissueCells * tissue.cellW * tissue.cellH
  const qcArea = qcRegions.reduce((s, r) => s + r.areaPx, 0)
  const unassessableFraction = tissueArea > 0 ? Math.min(1, qcArea / tissueArea) : 0

  const hasCandidates = slide.analysis === 'complete' || slide.analysis === 'partially_analyzed'
  if (!hasCandidates || !slide.synth || cells.length === 0) {
    // No analysis, no candidates, and therefore no hotspot to frame.
    return {
      candidates: [], clusters: [], qcRegions, byId: new Map(), unassessableFraction,
      proposedFrame: null, supersededCandidates: [],
    }
  }

  const mpp = slide.mpp ?? 0.25
  const candidates: Candidate[] = []
  const clusters: Cluster[] = []
  let n = 0

  const plan = slide.synth.clusters.slice().sort(
    (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || b.members - a.members,
  )

  plan.forEach((spec, ci) => {
    // Hotspots sit toward the interior of the section, not on the edge.
    const centre = pickInteriorCell(tissue, cells, rand)
    // Spread scales with member count: a 23-object hotspot is roughly 1 mm across.
    const spreadPx = (Math.sqrt(spec.members) * 190) / (mpp / 0.25)
    const radiusPx = RADIUS_UM[spec.type] / mpp

    const clusterId = slide.id + '-cl-' + (ci + 1)
    const ids: string[] = []
    const members: Candidate[] = []
    let guard = 0
    while (ids.length < spec.members && guard < spec.members * 40) {
      guard++
      const p = {
        x: centre.x + gaussian(rand) * spreadPx,
        y: centre.y + gaussian(rand) * spreadPx,
      }
      if (p.x < radiusPx || p.y < radiusPx) continue
      if (p.x > tissue.slideW - radiusPx || p.y > tissue.slideH - radiusPx) continue
      if (!isTissueAt(tissue, p)) continue

      const score = 0.32 + rand() * 0.66
      const id = slide.id + '-c-' + (++n)
      const qcAffected = qcRegions.some((q) => pointInPolygon(p, q.polygon))
      const cand: Candidate = {
        id, slideId: slide.id, clusterId, type: spec.type,
        x: p.x, y: p.y, r: radiusPx, score, band: bandOf(score), qcAffected,
      }
      candidates.push(cand)
      members.push(cand)
      ids.push(id)
    }

    if (members.length === 0) return
    const b = boundsOf(members.map((c) => ({ x: c.x, y: c.y })))
    const pad = radiusPx * 2.2
    const bounds = {
      x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad),
      w: b.w + pad * 2, h: b.h + pad * 2,
    }
    clusters.push({
      id: clusterId,
      slideId: slide.id,
      type: spec.type,
      rank: 0,
      candidateIds: ids,
      bounds,
      areaMm2: (bounds.w * bounds.h * mpp * mpp) / 1e6,
      qcAffectedCount: members.filter((c) => c.qcAffected).length,
    })
  })

  // Fixed clinical order, then member count descending within type.
  clusters.sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      b.candidateIds.length - a.candidateIds.length,
  )
  clusters.forEach((c, i) => { c.rank = i + 1 })

  const byId = new Map(candidates.map((c) => [c.id, c]))
  return {
    candidates, clusters, qcRegions, byId, unassessableFraction,
    proposedFrame: proposeHotspotFrame(slide, clusters),
    supersededCandidates: generateSuperseded(slide, tissue, cells, rand, mpp),
  }
}

/**
 * Candidates from the run this analysis replaced (§K.3).
 *
 * Drawn from the same stream, after everything current, so adding them cannot
 * perturb a single active candidate. They carry no verdicts and are never
 * adjudicated: superseding is something that happened to the analysis, not a
 * judgement anyone made about the object. That is what separates this from
 * `Rejected`, where a named human declined the model's proposal.
 */
function generateSuperseded(
  slide: SlideDef, tissue: TissueData, cells: number[], rand: () => number, mpp: number,
): Candidate[] {
  const plan = slide.synth?.superseded
  if (!plan || plan.length === 0 || !slide.previousModel) return []

  const out: Candidate[] = []
  let n = 0
  plan.forEach((spec, ci) => {
    const centre = pickInteriorCell(tissue, cells, rand)
    const spreadPx = (Math.sqrt(spec.members) * 190) / (mpp / 0.25)
    const radiusPx = RADIUS_UM[spec.type] / mpp
    let guard = 0
    while (out.length < countThrough(plan, ci) && guard < spec.members * 40) {
      guard++
      const p = {
        x: centre.x + gaussian(rand) * spreadPx,
        y: centre.y + gaussian(rand) * spreadPx,
      }
      if (p.x < radiusPx || p.y < radiusPx) continue
      if (p.x > slide.width - radiusPx || p.y > slide.height - radiusPx) continue
      const gx = Math.floor(p.x / tissue.cellW)
      const gy = Math.floor(p.y / tissue.cellH)
      if (!tissue.mask[gy * tissue.gridW + gx]) continue
      n++
      const score = 0.5 + rand() * 0.45
      out.push({
        id: `${slide.id}-sup-${n}`,
        slideId: slide.id,
        clusterId: `${slide.id}-sup-cl-${ci + 1}`,
        type: spec.type,
        x: p.x, y: p.y, r: radiusPx,
        score,
        band: score >= 0.8 ? 'high' : score >= 0.6 ? 'moderate' : 'low',
        qcAffected: false,
      })
    }
  })
  return out
}

const countThrough = (plan: Array<{ members: number }>, upTo: number) =>
  plan.slice(0, upTo + 1).reduce((s, x) => s + x.members, 0)

/**
 * The frame the model offers around the mitotic hotspot (§I.5).
 *
 * Derived from the cluster bounds by fixed arithmetic rather than from the
 * random stream, so it is stable for a slide and adding it cannot perturb any
 * candidate, cluster or QC region generated above.
 *
 * Only a mitotic hotspot earns a proposal: the frame exists to serve a mitotic
 * count, and framing an apoptotic cluster would propose a denominator for a
 * measurement nobody is making.
 */
function proposeHotspotFrame(slide: SlideDef, clusters: Cluster[]): ProposedFrame | null {
  const hotspot = clusters.find((c) => c.type === 'mitotic_figure')
  if (!hotspot || hotspot.candidateIds.length < 2) return null

  // A counting frame is square by convention, sized to contain the hotspot with
  // a margin, and clamped inside the slide.
  const b = hotspot.bounds
  const side = Math.max(b.w, b.h) * 1.18
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const half = side / 2
  const x0 = Math.max(0, Math.min(cx - half, slide.width - side))
  const y0 = Math.max(0, Math.min(cy - half, slide.height - side))

  return {
    id: `${slide.id}-proposed-frame`,
    slideId: slide.id,
    points: [{ x: x0, y: y0 }, { x: x0 + side, y: y0 + side }],
    clusterId: hotspot.id,
    mag: REVIEW_MAG,
  }
}

function pickInteriorCell(tissue: TissueData, cells: number[], rand: () => number): Pt {
  // Prefer a cell whose neighbourhood is entirely tissue, so a hotspot does not
  // straddle the section edge.
  for (let tries = 0; tries < 200; tries++) {
    const i = cells[Math.floor(rand() * cells.length)]
    const gx = i % tissue.gridW
    const gy = Math.floor(i / tissue.gridW)
    let solid = true
    for (let dy = -2; dy <= 2 && solid; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ny = gy + dy, nx = gx + dx
        if (ny < 0 || nx < 0 || ny >= tissue.gridH || nx >= tissue.gridW ||
            !tissue.mask[ny * tissue.gridW + nx]) { solid = false; break }
      }
    }
    if (solid) return cellCentre(tissue, i)
  }
  return cellCentre(tissue, cells[Math.floor(rand() * cells.length)])
}

function generateQc(
  slide: SlideDef, tissue: TissueData, rand: () => number, cells: number[],
): QcRegion[] {
  if (!slide.synth || cells.length === 0) return []
  const tissueArea = tissue.tissueCells * tissue.cellW * tissue.cellH
  return slide.synth.qc.map((spec, i) => {
    const centre = pickInteriorCell(tissue, cells, rand)
    const targetArea = tissueArea * spec.fraction
    const radius = Math.sqrt(targetArea / Math.PI)
    // An irregular blob — focus drift and folds are not circles.
    const verts = 14
    const polygon: Pt[] = []
    for (let v = 0; v < verts; v++) {
      const a = (v / verts) * Math.PI * 2
      const rr = radius * (0.68 + rand() * 0.62)
      polygon.push({ x: centre.x + Math.cos(a) * rr * 1.25, y: centre.y + Math.sin(a) * rr * 0.8 })
    }
    return {
      id: slide.id + '-qc-' + (i + 1),
      slideId: slide.id,
      type: spec.type,
      polygon,
      areaPx: polygonArea(polygon),
    }
  })
}

export function qcStateOf(out: SlideModelOutput, dismissedIds: string[]): QcState {
  const live = out.qcRegions.filter((r) => !dismissedIds.includes(r.id))
  if (live.length === 0) return 'clean'
  return out.unassessableFraction >= 0.15 ? 'needs_attention' : 'flagged'
}
