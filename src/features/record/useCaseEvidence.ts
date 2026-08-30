import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { coverageStats, largestUnviewedRegion, type CoverageStats } from '@/domain/coverage'
import { computeDensity, type DensityResult } from '@/domain/density'
import {
  addLedgers, EMPTY_LEDGER, findingsForSlide, latestVerdicts, ledgerFor, modelRunsFor,
  type Ledger, type ModelRun,
} from '@/domain/derive'
import { modelOutput, type SlideModelOutput } from '@/domain/synth'
import { loadTissue, type TissueData } from '@/domain/tissue'
import { polygonArea } from '@/lib/geometry'
import * as registry from '@/state/coverageRegistry'
import { useSessions } from '@/state/store'
import type { Annotation, CaseDef, Finding, Rect, SlideDef } from '@/domain/types'

export interface SlideEvidence {
  slide: SlideDef
  model: SlideModelOutput
  /** Every analysis run recorded against this slide, newest first (§J.1). */
  modelRuns: ModelRun[]
  findings: Finding[]
  ledger: Ledger
  coverage: CoverageStats
  unassessableFraction: number
  annotations: Annotation[]
  largestUnviewed: Rect | null
}

export interface CaseEvidence {
  loading: boolean
  slides: SlideEvidence[]
  findings: Finding[]
  ledger: Ledger
  density: { result: DensityResult; slide: SlideDef } | null
  rejected: Array<{ slide: SlideDef; candidateId: string; at: string; by: string; reason?: string; type: string }>
  openItems: Array<{ slideId: string; slideLabel: string; text: string; kind: 'coverage' | 'qc' | 'candidates' }>
}

/**
 * The Record's evidence, assembled across every slide in the case. All demo
 * slides share one pyramid, so the tissue load is a single cached read.
 */
export function useCaseEvidence(def: CaseDef | undefined, caseId: string): CaseEvidence {
  const session = useSessions((s) => s.sessions[caseId])
  const [tissue, setTissue] = useState<TissueData | null>(null)
  const [loading, setLoading] = useState(true)
  const coverageVersion = useSyncExternalStore(registry.subscribe, registry.getVersion)

  const first = def?.slides.find((s) => s.dzi && s.formatSupported)

  useEffect(() => {
    if (!first?.dzi) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    loadTissue(first.dzi, first.width, first.height)
      .then((t) => { if (!cancelled) { setTissue(t); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [first])

  return useMemo<CaseEvidence>(() => {
    if (!def || !session) {
      return { loading, slides: [], findings: [], ledger: EMPTY_LEDGER, density: null, rejected: [], openItems: [] }
    }

    const slides: SlideEvidence[] = def.slides.map((slide) => {
      const usable = slide.dzi && slide.formatSupported ? tissue : null
      const model = modelOutput(slide, usable)
      const slideSession = session.perSlide[slide.id]
      const annotations = session.annotations.filter((a) => a.slideId === slide.id)

      let unassessableFraction = 0
      let coverage: CoverageStats = { orientation: 0, diagnostic: 0, unassessable: 0, effectiveCells: 1 }
      let largestUnviewed: Rect | null = null

      if (usable && slideSession) {
        const live = model.qcRegions.filter((r) => !slideSession.dismissedQcIds.includes(r.id))
        const tissueArea = usable.tissueCells * usable.cellW * usable.cellH
        let area = live.reduce((s, r) => s + r.areaPx, 0)
        for (const a of annotations) if (a.kind === 'unassessable') area += polygonArea(a.points)
        unassessableFraction = tissueArea > 0 ? Math.min(0.95, area / tissueArea) : 0

        const { grid } = registry.hydrateGrid(caseId, slide.id, slideSession, usable)
        coverage = coverageStats(grid, usable, unassessableFraction)
        largestUnviewed = largestUnviewedRegion(grid, usable)
      } else if (slideSession?.stats) {
        coverage = { ...slideSession.stats, effectiveCells: 1 }
      }

      return {
        slide,
        model,
        modelRuns: modelRunsFor(slide),
        findings: findingsForSlide(slide.id, model, session.verdicts, session.annotations),
        ledger: ledgerFor(model, session.verdicts, slide.id),
        coverage,
        unassessableFraction,
        annotations,
        largestUnviewed,
      }
    })

    const findings = slides.flatMap((s) => s.findings)
    const ledger = slides.reduce((acc, s) => addLedgers(acc, s.ledger), EMPTY_LEDGER)

    /* The density block: the most recently drawn counting frame in the case. */
    let density: CaseEvidence['density'] = null
    for (const s of slides) {
      const frames = s.annotations.filter((a) => a.kind === 'frame')
      const frame = frames[frames.length - 1]
      if (!frame || !s.slide.mpp) continue
      const heads = latestVerdicts(session.verdicts.filter((v) => v.slideId === s.slide.id))
      const rejectedPoints = s.model.candidates
        .filter((c) => heads.get(c.id)?.kind === 'rejected')
        .map((c) => ({ id: c.id, x: c.x, y: c.y }))
      const live = s.model.qcRegions.filter(
        (r) => !session.perSlide[s.slide.id]?.dismissedQcIds.includes(r.id),
      )
      density = {
        result: computeDensity(frame, s.slide.mpp, s.findings, live, rejectedPoints),
        slide: s.slide,
      }
    }

    /* Rejected candidates — collapsed by default, retained permanently. */
    const rejected: CaseEvidence['rejected'] = []
    for (const s of slides) {
      const heads = latestVerdicts(session.verdicts.filter((v) => v.slideId === s.slide.id))
      for (const [candidateId, v] of heads) {
        if (v.kind !== 'rejected') continue
        const c = s.model.byId.get(candidateId)
        if (!c) continue
        rejected.push({
          slide: s.slide, candidateId, at: v.at, by: v.by,
          reason: v.bulkReason, type: c.type,
        })
      }
    }

    /* Open items — surfaced, not hidden, and stated as facts. */
    const openItems: CaseEvidence['openItems'] = []
    for (const s of slides) {
      const analysed = s.slide.analysis === 'complete' || s.slide.analysis === 'partially_analyzed'
      if (s.coverage.diagnostic < 1) {
        openItems.push({
          slideId: s.slide.id, slideLabel: s.slide.label, kind: 'coverage',
          text: `${Math.round((1 - s.coverage.diagnostic) * 100)}% of tissue not examined at ≥10×`,
        })
      }
      if (s.unassessableFraction > 0) {
        openItems.push({
          slideId: s.slide.id, slideLabel: s.slide.label, kind: 'qc',
          text: `${(s.unassessableFraction * 100).toFixed(1)}% unassessable — scan quality`,
        })
      }
      if (analysed && s.ledger.unreviewed > 0) {
        openItems.push({
          slideId: s.slide.id, slideLabel: s.slide.label, kind: 'candidates',
          text: `${s.ledger.unreviewed} candidates not reviewed`,
        })
      }
    }

    return { loading, slides, findings, ledger, density, rejected, openItems }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, session, tissue, loading, caseId, coverageVersion])
}
